import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  DAY_END_MINUTES,
  FARMHOUSE_DOOR,
  GAME_MINUTES_PER_REAL_SECOND,
  ITEMS,
  NIGHT_START_MINUTES,
  TILE_SIZE,
  WELL_POS,
} from '../game/constants.ts';
import type {
  ChatMessage,
  ClientToServerMessage,
  FxPayload,
  RemotePlayerState,
  RoomSummary,
  ServerToClientMessage,
  VoicePeerState,
} from '../game/multiplayer.ts';
import { MAX_ROOM_PLAYERS, PLAYER_PALETTE } from '../game/multiplayer.ts';
import {
  advanceDay,
  buyDairyCow,
  buyFarmChicken,
  buyFluffySheep,
  buyGuardDog,
  buyShopItem,
  claimMissionReward,
  craftItem,
  createInitialFarmState,
  eatCrop,
  fulfillDailyOrder,
  getSeason,
  isNearWell,
  performTileAction,
  sellCropItem,
  spawnNightWildlife,
  stepChickens,
  stepLivestockAndDog,
  stepWildlife,
  triggerMiddayDrought,
  triggerMiddayHeatwave,
  upgradeTool,
} from '../game/rules.ts';
import type { GameWorldState, ItemId, ToolType } from '../game/types.ts';

interface RoomClient extends RemotePlayerState {
  clientId: string;
  ws: WebSocket | null;
  connected: boolean;
  disconnectedAt: number | null;
  voiceEnabled: boolean;
  voiceMuted: boolean;
  voiceSpeaking: boolean;
}

interface ServerRoom {
  code: string;
  name: string;
  isPublic: boolean;
  hostId: string;
  world: GameWorldState;
  players: Map<string, RoomClient>;
  sleepVotes: Set<string>;
  chat: ChatMessage[];
  wildlifeSpawnTimer: number;
  lastTickMs: number;
  emptySinceMs: number | null;
}

export interface MultiplayerServerOptions {
  serveStaticDist?: boolean;
}

export interface MultiplayerServerHandle {
  app: express.Express;
  server: http.Server;
  wss: WebSocketServer;
  stopSimulation: () => void;
}

export function createMultiplayerServer(
  options: MultiplayerServerOptions = {}
): MultiplayerServerHandle {
  const rooms = new Map<string, ServerRoom>();
  const socketMeta = new Map<WebSocket, { roomCode: string | null; playerId: string | null }>();

  function generateRoomCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    for (let attempt = 0; attempt < 40; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
      }
      if (!rooms.has(code)) return code;
    }
    return `RM${Date.now().toString(36).toUpperCase().slice(-4)}`;
  }

  function toPublicPlayer(p: RoomClient): RemotePlayerState {
    return {
      id: p.id,
      name: p.name,
      colorIndex: p.colorIndex,
      x: p.x,
      y: p.y,
      facingX: p.facingX,
      facingY: p.facingY,
      walkCycle: p.walkCycle,
      swingTimer: p.swingTimer,
      swingTool: p.swingTool,
      hitFlashTimer: p.hitFlashTimer,
      health: p.health,
      maxHealth: p.maxHealth,
      stamina: p.stamina,
      maxStamina: p.maxStamina,
      waterLevel: p.waterLevel,
      maxWaterLevel: p.maxWaterLevel,
      selectedHotbarIndex: p.selectedHotbarIndex,
    };
  }

  function getConnectedPlayers(room: ServerRoom): RoomClient[] {
    return Array.from(room.players.values()).filter((p) => p.connected);
  }

  function getRoomVoiceStates(room: ServerRoom): Record<string, VoicePeerState> {
    const out: Record<string, VoicePeerState> = {};
    for (const p of room.players.values()) {
      if (!p.connected) continue;
      out[p.id] = {
        enabled: p.voiceEnabled,
        muted: p.voiceMuted,
        speaking: p.voiceEnabled && !p.voiceMuted && p.voiceSpeaking,
      };
    }
    return out;
  }

  function getPublicRoomSummaries(): RoomSummary[] {
    const list: RoomSummary[] = [];
    for (const room of rooms.values()) {
      const activePlayers = getConnectedPlayers(room);
      if (!room.isPublic || activePlayers.length === 0) continue;
      const host = room.players.get(room.hostId) ?? activePlayers[0];
      list.push({
        code: room.code,
        name: room.name,
        hostName: host?.name ?? 'Farmer',
        playerCount: activePlayers.length,
        maxPlayers: MAX_ROOM_PLAYERS,
        day: room.world.day,
        season: getSeason(room.world.seasonIndex),
        isPublic: room.isPublic,
      });
    }
    list.sort((a, b) => b.playerCount - a.playerCount || a.code.localeCompare(b.code));
    return list;
  }

  function sendToClient(ws: WebSocket | null, payload: ServerToClientMessage): void {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(payload));
    } catch {
      // Ignore closed socket errors
    }
  }

  function broadcastToRoom(
    room: ServerRoom,
    payload: ServerToClientMessage,
    excludeId?: string
  ): void {
    const encoded = JSON.stringify(payload);
    for (const player of room.players.values()) {
      if (!player.connected || !player.ws || player.ws.readyState !== WebSocket.OPEN) continue;
      if (excludeId && player.id === excludeId) continue;
      try {
        player.ws.send(encoded);
      } catch {
        // Ignore send errors
      }
    }
  }

  function broadcastRoomsListToLobby(): void {
    const roomsList = getPublicRoomSummaries();
    const payload = JSON.stringify({
      type: 'rooms:list',
      rooms: roomsList,
    } satisfies ServerToClientMessage);
    for (const [ws, meta] of socketMeta.entries()) {
      if (!meta.roomCode && ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(payload);
        } catch {
          // Ignore
        }
      }
    }
  }

  function syncWorldToRoom(room: ServerRoom, teleportIds?: string[]): void {
    broadcastToRoom(room, {
      type: 'world:sync',
      world: room.world,
      players: getConnectedPlayers(room).map(toPublicPlayer),
      hostId: room.hostId,
      sleepVotes: Array.from(room.sleepVotes),
      ...(teleportIds && teleportIds.length > 0 ? { teleportIds } : {}),
    });
  }

  function broadcastFx(room: ServerRoom, fx: FxPayload): void {
    broadcastToRoom(room, { type: 'fx:event', fx });
  }

  function applyPlayerIntoWorld(room: ServerRoom, player: RoomClient): void {
    room.world.player.x = player.x;
    room.world.player.y = player.y;
    room.world.player.facingX = player.facingX;
    room.world.player.facingY = player.facingY;
    room.world.player.walkCycle = player.walkCycle;
    room.world.player.swingTimer = player.swingTimer;
    room.world.player.swingTool = player.swingTool;
    room.world.player.hitFlashTimer = player.hitFlashTimer;
    room.world.player.health = player.health;
    room.world.player.maxHealth = player.maxHealth;
    room.world.player.stamina = player.stamina;
    room.world.player.maxStamina = player.maxStamina;
    room.world.player.waterLevel = player.waterLevel;
    room.world.player.maxWaterLevel = player.maxWaterLevel;
    room.world.player.selectedHotbarIndex = player.selectedHotbarIndex;
  }

  function extractPlayerFromWorld(room: ServerRoom, player: RoomClient): void {
    player.x = room.world.player.x;
    player.y = room.world.player.y;
    player.facingX = room.world.player.facingX;
    player.facingY = room.world.player.facingY;
    player.swingTimer = room.world.player.swingTimer;
    player.swingTool = room.world.player.swingTool;
    player.hitFlashTimer = room.world.player.hitFlashTimer;
    player.health = room.world.player.health;
    player.maxHealth = room.world.player.maxHealth;
    player.stamina = room.world.player.stamina;
    player.maxStamina = room.world.player.maxStamina;
    player.waterLevel = room.world.player.waterLevel;
    player.maxWaterLevel = room.world.player.maxWaterLevel;
    player.selectedHotbarIndex = room.world.player.selectedHotbarIndex;

    // Sync shared maxStamina & maxWaterLevel across all farmers when leveled up or upgraded
    for (const other of room.players.values()) {
      if (other.maxStamina < room.world.player.maxStamina) {
        const diff = room.world.player.maxStamina - other.maxStamina;
        other.maxStamina = room.world.player.maxStamina;
        other.stamina = Math.min(other.maxStamina, other.stamina + diff);
      }
      if (other.maxWaterLevel < room.world.player.maxWaterLevel) {
        other.maxWaterLevel = room.world.player.maxWaterLevel;
        other.waterLevel = other.maxWaterLevel;
      }
    }
  }

  function performSleepForRoom(room: ServerRoom): void {
    const summary = advanceDay(room.world);
    room.sleepVotes.clear();
    let idx = 0;
    for (const p of room.players.values()) {
      p.x = FARMHOUSE_DOOR.x + 0.3 + (idx % 4) * 0.45;
      p.y = FARMHOUSE_DOOR.y + 0.65;
      p.facingX = 0;
      p.facingY = 1;
      p.stamina = p.maxStamina;
      p.health = Math.min(p.maxHealth, p.health + 35);
      idx++;
    }
    syncWorldToRoom(room, Array.from(room.players.keys()));
    broadcastFx(room, {
      kind: 'day_advanced',
      sfx: 'morning',
      daySummary: summary,
      messageFrom2040: summary.messageFrom2040,
    });
    broadcastRoomsListToLobby();
  }

  function assignNextColorIndex(room: ServerRoom): number {
    const used = new Set(getConnectedPlayers(room).map((p) => p.colorIndex));
    for (let i = 0; i < PLAYER_PALETTE.length; i++) {
      if (!used.has(i)) return i;
    }
    return room.players.size % PLAYER_PALETTE.length;
  }

  function detachPlayerFromRoom(ws: WebSocket, removeCompletely: boolean): void {
    const meta = socketMeta.get(ws);
    if (!meta || !meta.roomCode || !meta.playerId) return;
    const room = rooms.get(meta.roomCode);
    const playerId = meta.playerId;
    meta.roomCode = null;
    meta.playerId = null;

    if (!room) return;
    const player = room.players.get(playerId);
    if (!player) return;

    if (removeCompletely) {
      room.players.delete(playerId);
    } else {
      player.connected = false;
      player.ws = null;
      player.disconnectedAt = Date.now();
      player.voiceEnabled = false;
      player.voiceMuted = false;
      player.voiceSpeaking = false;
    }
    room.sleepVotes.delete(playerId);

    const remaining = getConnectedPlayers(room);
    if (remaining.length === 0) {
      room.emptySinceMs = Date.now();
    } else {
      if (room.hostId === playerId) {
        room.hostId = remaining[0].id;
      }
      broadcastToRoom(room, {
        type: 'player:presence',
        event: 'left',
        playerId: player.id,
        playerName: player.name,
        hostId: room.hostId,
        players: remaining.map(toPublicPlayer),
        sleepVotes: Array.from(room.sleepVotes),
        voiceStates: getRoomVoiceStates(room),
      });
      if (room.sleepVotes.size > 0 && room.sleepVotes.size >= remaining.length) {
        performSleepForRoom(room);
      }
    }
    broadcastRoomsListToLobby();
  }

  function handleRoomMessage(ws: WebSocket, msg: ClientToServerMessage): void {
    const meta = socketMeta.get(ws);
    if (!meta) return;

    if (msg.type === 'room:list') {
      sendToClient(ws, { type: 'rooms:list', rooms: getPublicRoomSummaries() });
      return;
    }

    if (msg.type === 'room:create') {
      detachPlayerFromRoom(ws, true);
      const code = generateRoomCode();
      const playerName = (msg.playerName || 'Farmer').trim().slice(0, 18) || 'Farmer';
      const roomName =
        (msg.roomName || `${playerName}'s Farm`).trim().slice(0, 28) || `${playerName}'s Farm`;
      const world = createInitialFarmState(Math.floor(Math.random() * 9000) + 100);
      const clientId = (msg.clientId || `p_${Math.random().toString(36).slice(2, 10)}`).slice(
        0,
        32
      );

      const player: RoomClient = {
        id: clientId,
        clientId,
        name: playerName,
        colorIndex: 0,
        x: world.player.x,
        y: world.player.y,
        facingX: 0,
        facingY: 1,
        walkCycle: 0,
        swingTimer: 0,
        swingTool: null,
        hitFlashTimer: 0,
        health: world.player.health,
        maxHealth: world.player.maxHealth,
        stamina: world.player.stamina,
        maxStamina: world.player.maxStamina,
        waterLevel: world.player.waterLevel,
        maxWaterLevel: world.player.maxWaterLevel,
        selectedHotbarIndex: 0,
        ws,
        connected: true,
        disconnectedAt: null,
        voiceEnabled: false,
        voiceMuted: false,
        voiceSpeaking: false,
      };

      const room: ServerRoom = {
        code,
        name: roomName,
        isPublic: Boolean(msg.isPublic),
        hostId: player.id,
        world,
        players: new Map([[player.id, player]]),
        sleepVotes: new Set(),
        chat: [],
        wildlifeSpawnTimer: 4,
        lastTickMs: Date.now(),
        emptySinceMs: null,
      };

      rooms.set(code, room);
      meta.roomCode = code;
      meta.playerId = player.id;

      sendToClient(ws, {
        type: 'room:joined',
        roomCode: code,
        roomName: room.name,
        isPublic: room.isPublic,
        playerId: player.id,
        hostId: room.hostId,
        world: room.world,
        players: [toPublicPlayer(player)],
        sleepVotes: [],
        chat: room.chat,
        voiceStates: getRoomVoiceStates(room),
      });
      broadcastRoomsListToLobby();
      return;
    }

    if (msg.type === 'room:join') {
      const code = (msg.code || '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        sendToClient(ws, { type: 'room:error', code: 'NOT_FOUND', message: 'Room not found' });
        return;
      }

      const clientId = (msg.clientId || `p_${Math.random().toString(36).slice(2, 10)}`).slice(
        0,
        32
      );
      const existing = room.players.get(clientId);
      const connectedList = getConnectedPlayers(room);

      if (!existing && connectedList.length >= MAX_ROOM_PLAYERS) {
        sendToClient(ws, {
          type: 'room:error',
          code: 'ROOM_FULL',
          message: 'Room is full (Max 4)',
        });
        return;
      }

      detachPlayerFromRoom(ws, true);

      const playerName = (msg.playerName || 'Farmer').trim().slice(0, 18) || 'Farmer';
      let player: RoomClient;
      if (existing) {
        existing.ws = ws;
        existing.connected = true;
        existing.disconnectedAt = null;
        existing.name = playerName;
        existing.voiceEnabled = false;
        existing.voiceMuted = false;
        existing.voiceSpeaking = false;
        player = existing;
      } else {
        const offset = connectedList.length;
        player = {
          id: clientId,
          clientId,
          name: playerName,
          colorIndex: assignNextColorIndex(room),
          x: FARMHOUSE_DOOR.x + 0.3 + (offset % 3) * 0.55,
          y: FARMHOUSE_DOOR.y + 0.75,
          facingX: 0,
          facingY: 1,
          walkCycle: 0,
          swingTimer: 0,
          swingTool: null,
          hitFlashTimer: 0,
          health: room.world.player.maxHealth,
          maxHealth: room.world.player.maxHealth,
          stamina: room.world.player.maxStamina,
          maxStamina: room.world.player.maxStamina,
          waterLevel: room.world.player.maxWaterLevel,
          maxWaterLevel: room.world.player.maxWaterLevel,
          selectedHotbarIndex: 0,
          ws,
          connected: true,
          disconnectedAt: null,
          voiceEnabled: false,
          voiceMuted: false,
          voiceSpeaking: false,
        };
        room.players.set(player.id, player);
      }

      room.emptySinceMs = null;
      if (!room.players.get(room.hostId)?.connected) {
        room.hostId = player.id;
      }
      meta.roomCode = room.code;
      meta.playerId = player.id;

      const publicPlayers = getConnectedPlayers(room).map(toPublicPlayer);
      const voiceStates = getRoomVoiceStates(room);
      sendToClient(ws, {
        type: 'room:joined',
        roomCode: room.code,
        roomName: room.name,
        isPublic: room.isPublic,
        playerId: player.id,
        hostId: room.hostId,
        world: room.world,
        players: publicPlayers,
        sleepVotes: Array.from(room.sleepVotes),
        chat: room.chat,
        voiceStates,
      });

      broadcastToRoom(
        room,
        {
          type: 'player:presence',
          event: 'joined',
          playerId: player.id,
          playerName: player.name,
          hostId: room.hostId,
          players: publicPlayers,
          sleepVotes: Array.from(room.sleepVotes),
          voiceStates,
        },
        player.id
      );
      broadcastRoomsListToLobby();
      return;
    }

    if (msg.type === 'room:leave') {
      detachPlayerFromRoom(ws, true);
      return;
    }

    if (!meta.roomCode || !meta.playerId) return;
    const room = rooms.get(meta.roomCode);
    const player = room?.players.get(meta.playerId);
    if (!room || !player) return;

    if (msg.type === 'player:move') {
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        player.x = Math.max(0.5, Math.min(room.world.width - 0.5, msg.x));
        player.y = Math.max(0.5, Math.min(room.world.height - 0.5, msg.y));
      }
      if (Number.isFinite(msg.facingX)) player.facingX = msg.facingX;
      if (Number.isFinite(msg.facingY)) player.facingY = msg.facingY;
      if (Number.isFinite(msg.walkCycle)) player.walkCycle = msg.walkCycle;
      if (
        Number.isInteger(msg.selectedHotbarIndex) &&
        msg.selectedHotbarIndex >= 0 &&
        msg.selectedHotbarIndex < 9
      ) {
        player.selectedHotbarIndex = msg.selectedHotbarIndex;
      }
      return;
    }

    if (msg.type === 'action:chat') {
      const clean = (msg.text || '').trim().slice(0, 140);
      if (!clean) return;
      const chatMsg: ChatMessage = {
        id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        senderId: player.id,
        senderName: player.name,
        colorIndex: player.colorIndex,
        text: clean,
        timestamp: Date.now(),
      };
      room.chat.push(chatMsg);
      if (room.chat.length > 40) room.chat.shift();
      broadcastToRoom(room, { type: 'chat:message', message: chatMsg });
      return;
    }

    if (msg.type === 'voice:state') {
      player.voiceEnabled = Boolean(msg.enabled);
      player.voiceMuted = Boolean(msg.muted);
      player.voiceSpeaking = player.voiceEnabled && !player.voiceMuted && Boolean(msg.speaking);
      broadcastToRoom(
        room,
        {
          type: 'voice:peer_state',
          playerId: player.id,
          state: {
            enabled: player.voiceEnabled,
            muted: player.voiceMuted,
            speaking: player.voiceSpeaking,
          },
        },
        player.id
      );
      return;
    }

    if (msg.type === 'voice:signal') {
      if (typeof msg.targetId !== 'string' || !msg.signal || typeof msg.signal !== 'object') return;
      const target = room.players.get(msg.targetId);
      if (!target || !target.connected || target.id === player.id) return;
      sendToClient(target.ws, {
        type: 'voice:signal',
        fromId: player.id,
        signal: msg.signal,
      });
      return;
    }

    if (msg.type === 'action:sleep_vote') {
      const active = getConnectedPlayers(room);
      if (active.length <= 1) {
        performSleepForRoom(room);
        return;
      }
      if (msg.ready) room.sleepVotes.add(player.id);
      else room.sleepVotes.delete(player.id);

      if (room.sleepVotes.size >= active.length) {
        performSleepForRoom(room);
      } else {
        syncWorldToRoom(room);
      }
      return;
    }

    // World-mutating actions: apply player context, run deterministic rules.ts, broadcast!
    applyPlayerIntoWorld(room, player);

    if (msg.type === 'action:tile') {
      if (!Number.isInteger(msg.tx) || !Number.isInteger(msg.ty)) return;
      if (
        Number.isInteger(msg.selectedHotbarIndex) &&
        msg.selectedHotbarIndex >= 0 &&
        msg.selectedHotbarIndex < 9
      ) {
        room.world.player.selectedHotbarIndex = msg.selectedHotbarIndex;
      }
      const res = performTileAction(room.world, msg.tx, msg.ty, Date.now());
      extractPlayerFromWorld(room, player);

      const wx = (msg.tx + 0.5) * TILE_SIZE;
      const wy = (msg.ty + 0.5) * TILE_SIZE;

      if (res.performed) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'tile',
          actorId: player.id,
          wx,
          wy,
          actionKind: res.kind,
          actionMessage: res.message,
          swingTool: player.swingTool,
          cropHarvested: res.cropHarvested,
          goldenBonus: res.goldenBonus,
          rotationBoosted: res.rotationBoosted,
          comboCount: res.comboCount,
          comboGold: res.comboGold,
          leveledUpTo: res.leveledUpTo,
          treasureFound: res.treasureFound,
        });
      } else if (res.kind === 'error' && res.message) {
        sendToClient(ws, {
          type: 'fx:event',
          fx: {
            kind: 'tile',
            actorId: player.id,
            wx,
            wy,
            actionKind: 'error',
            actionMessage: res.message,
          },
        });
      }
      return;
    }

    if (msg.type === 'action:well') {
      if (isNearWell(room.world)) {
        room.world.player.waterLevel = room.world.player.maxWaterLevel;
        extractPlayerFromWorld(room, player);
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'well',
          actorId: player.id,
          wx: (WELL_POS.x + 0.5) * TILE_SIZE,
          wy: (WELL_POS.y + 0.5) * TILE_SIZE,
          sfx: 'refill',
        });
      }
      return;
    }

    if (msg.type === 'action:shop_buy') {
      const res = buyShopItem(
        room.world,
        msg.itemId as ItemId,
        Math.max(1, Math.min(99, msg.qty || 1))
      );
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'coin' } });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:shop_sell') {
      const res = sellCropItem(
        room.world,
        msg.itemId as ItemId,
        Math.max(1, Math.min(999, msg.qty || 1))
      );
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'coin' } });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:upgrade_tool') {
      const res = upgradeTool(room.world, msg.tool as ToolType);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'harvest' } });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:craft') {
      const res = craftItem(room.world, msg.id);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'place' } });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:eat') {
      const res = eatCrop(room.world, msg.id);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'harvest' } });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:assign_hotbar') {
      if (
        Number.isInteger(msg.slotIdx) &&
        msg.slotIdx >= 0 &&
        msg.slotIdx < 9 &&
        ITEMS[msg.id]
      ) {
        room.world.hotbar = room.world.hotbar.map((item) => (item === msg.id ? null : item));
        room.world.hotbar[msg.slotIdx] = msg.id;
        room.world.player.selectedHotbarIndex = msg.slotIdx;
        extractPlayerFromWorld(room, player);
        syncWorldToRoom(room);
      }
      return;
    }

    if (msg.type === 'action:mission_claim') {
      const res = claimMissionReward(room.world, msg.id);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 1) * TILE_SIZE,
          sfx: 'coin',
          text: `+${res.goldEarned}g`,
          textColor: '#ffe473',
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:order_fulfill') {
      const res = fulfillDailyOrder(room.world);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 1) * TILE_SIZE,
          sfx: 'coin',
          text: `+${res.earnedGold}g`,
          textColor: '#fde047',
          leveledUpTo: res.leveledUpTo,
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:buy_animal') {
      const res =
        msg.kind === 'chicken'
          ? buyFarmChicken(room.world)
          : msg.kind === 'cow'
          ? buyDairyCow(room.world)
          : msg.kind === 'sheep'
          ? buyFluffySheep(room.world)
          : buyGuardDog(room.world);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        sendToClient(ws, {
          type: 'fx:event',
          fx: { kind: 'toast', sfx: msg.kind === 'dog' ? 'bark' : 'harvest' },
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
    }
  }

  function tickRooms(): void {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      const activePlayers = getConnectedPlayers(room);
      if (activePlayers.length === 0) {
        if (room.emptySinceMs && now - room.emptySinceMs > 60_000) {
          rooms.delete(code);
          broadcastRoomsListToLobby();
        }
        room.lastTickMs = now;
        continue;
      }

      const dt = Math.min(0.25, (now - room.lastTickMs) / 1000);
      room.lastTickMs = now;

      const world = room.world;
      world.timeMinutes += dt * GAME_MINUTES_PER_REAL_SECOND;

      if (world.weather === 'Drought' && world.timeMinutes >= 840 && !world.droughtMiddayTriggered) {
        const dried = triggerMiddayDrought(world);
        if (dried > 0) {
          syncWorldToRoom(room);
          broadcastFx(room, { kind: 'drought' });
        }
      }

      if (world.weather === 'Heatwave' && world.timeMinutes >= 840 && !world.heatwaveMiddayTriggered) {
        const exposed = triggerMiddayHeatwave(world);
        if (exposed > 0) {
          syncWorldToRoom(room);
          broadcastFx(room, { kind: 'heatwave' });
        }
      }

      // Decay player swing & hit flash timers
      for (const p of activePlayers) {
        if (p.swingTimer > 0) p.swingTimer = Math.max(0, p.swingTimer - dt);
        if (p.hitFlashTimer > 0) p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
      }

      // Night wildlife spawning
      if (world.timeMinutes >= NIGHT_START_MINUTES) {
        room.wildlifeSpawnTimer -= dt;
        if (room.wildlifeSpawnTimer <= 0) {
          room.wildlifeSpawnTimer = 5.5 + Math.random() * 4;
          spawnNightWildlife(world);
        }
      }

      // Target connected player closest to active wildlife (fallback to first connected farmer)
      let targetPlayer = activePlayers[0];
      if (world.wildlife.length > 0 && activePlayers.length > 1) {
        let bestDist = Infinity;
        for (const candidate of activePlayers) {
          for (const w of world.wildlife) {
            const d = Math.hypot(candidate.x - w.x, candidate.y - w.y);
            if (d < bestDist) {
              bestDist = d;
              targetPlayer = candidate;
            }
          }
        }
      }
      applyPlayerIntoWorld(room, targetPlayer);

      let worldNeedsSync = false;
      const teleportIds: string[] = [];
      stepWildlife(
        world,
        dt,
        (tx, ty) => {
          worldNeedsSync = true;
          broadcastFx(room, {
            kind: 'crop_eaten',
            wx: (tx + 0.5) * TILE_SIZE,
            wy: (ty + 0.5) * TILE_SIZE,
          });
        },
        (dmg) => {
          targetPlayer.health = world.player.health;
          targetPlayer.hitFlashTimer = 0.25;
          if (targetPlayer.health <= 0) {
            targetPlayer.health = Math.round(targetPlayer.maxHealth * 0.6);
            targetPlayer.x = FARMHOUSE_DOOR.x + 0.5;
            targetPlayer.y = FARMHOUSE_DOOR.y + 0.7;
            world.player.gold = Math.max(0, world.player.gold - 10);
            teleportIds.push(targetPlayer.id);
            worldNeedsSync = true;
          }
          broadcastFx(room, {
            kind: 'hurt',
            actorId: targetPlayer.id,
            wx: targetPlayer.x * TILE_SIZE,
            wy: (targetPlayer.y - 1) * TILE_SIZE,
            dmg,
            sfx: 'hurt',
          });
        }
      );

      stepChickens(world, dt);
      stepLivestockAndDog(world, dt, (dx, dy) => {
        broadcastFx(room, {
          kind: 'dog_bark',
          wx: dx * TILE_SIZE,
          wy: dy * TILE_SIZE,
          sfx: 'bark',
        });
      });

      if (world.timeMinutes >= DAY_END_MINUTES) {
        performSleepForRoom(room);
        continue;
      }

      if (worldNeedsSync) {
        syncWorldToRoom(room, teleportIds);
      }

      broadcastToRoom(room, {
        type: 'tick:entities',
        timeMinutes: world.timeMinutes,
        weather: world.weather,
        players: activePlayers.map(toPublicPlayer),
        wildlife: world.wildlife,
        chickens: world.chickens,
        cows: world.cows ?? [],
        sheep: world.sheep ?? [],
        dog: world.dog ?? null,
      });
    }
  }

  const app = express();

  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/rooms', (_req, res) => {
    res.json({ rooms: getPublicRoomSummaries() });
  });

  if (options.serveStaticDist) {
    const distDir = path.join(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });

  const aliveSockets = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws) => {
    aliveSockets.set(ws, true);
    socketMeta.set(ws, { roomCode: null, playerId: null });

    ws.on('pong', () => {
      aliveSockets.set(ws, true);
    });

    ws.on('message', (raw) => {
      aliveSockets.set(ws, true);
      try {
        const parsed = JSON.parse(raw.toString()) as ClientToServerMessage;
        if (parsed && typeof parsed.type === 'string') {
          handleRoomMessage(ws, parsed);
        }
      } catch {
        // Ignore malformed packets
      }
    });

    ws.on('close', () => {
      detachPlayerFromRoom(ws, false);
      socketMeta.delete(ws);
    });
  });

  server.on('upgrade', (request, socket, head) => {
    const pathname = new URL(
      request.url || '/',
      `http://${request.headers.host || 'localhost'}`
    ).pathname;
    if (pathname === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    }
  });

  const intervalId = setInterval(tickRooms, 100);
  const heartbeatId = setInterval(() => {
    for (const client of wss.clients) {
      if (aliveSockets.get(client) === false) {
        client.terminate();
        continue;
      }
      aliveSockets.set(client, false);
      try {
        client.ping();
      } catch {
        // Ignore closed socket ping errors
      }
    }
  }, 25_000);

  return {
    app,
    server,
    wss,
    stopSimulation: () => {
      clearInterval(intervalId);
      clearInterval(heartbeatId);
    },
  };
}
