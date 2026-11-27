import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CRAFT_RECIPES,
  DAY_END_MINUTES,
  FARMHOUSE_DOOR,
  GAME_MINUTES_PER_REAL_SECOND,
  ITEMS,
  MISSIONS,
  NIGHT_START_MINUTES,
  REALM_DEFS,
  TILE_SIZE,
  WELL_POS,
} from '../game/constants.ts';
import type {
  ChatMessage,
  ClientToServerMessage,
  CoopChallengeKind,
  CoopChallengeState,
  FxPayload,
  RemotePlayerState,
  RoomSummary,
  ServerToClientMessage,
  TradeOffer,
  VoicePeerState,
  VoiceSignalPayload,
} from '../game/multiplayer.ts';
import { COOP_EMOTES, MAX_ROOM_PLAYERS, PLAYER_PALETTE } from '../game/multiplayer.ts';
import { getDailyQuizForDay, normalizeFarmerStyle } from '../game/funFeatures.ts';
import {
  addInventoryItem,
  advanceDay,
  answerEcoQuiz,
  buyDairyCow,
  buyFarmCat,
  buyFarmChicken,
  buyFluffySheep,
  buyGuardDog,
  buyShopItem,
  catchNearbyFirefly,
  claimMissionReward,
  consumeInventoryItem,
  cookRecipe,
  craftItem,
  createInitialFarmState,
  eatBestFood,
  eatCrop,
  fulfillDailyOrder,
  getSeason,
  grantXp,
  interactWithStrangeZone,
  interactWithVillageElder,
  isNearStrangeZone,
  isNearVillageElder,
  isNearWell,
  isTileWalkable,
  openMysteryChest,
  participateInFestival,
  performTileAction,
  renameFarmPet,
  sellCropItem,
  spawnNightWildlife,
  spinLuckyWheel,
  stepChickens,
  stepLivestockAndDog,
  stepRealmCreatures,
  stepWildlife,
  travelToRealm,
  triggerMiddayDrought,
  triggerMiddayHeatwave,
  unlockRealm,
  upgradeTool,
} from '../game/rules.ts';
import type { CookedDishId, GameWorldState, ItemId, RealmId, ToolType } from '../game/types.ts';
import {
  APP_VERSION,
  parsePatchManifest,
  sanitizePatchFilePath,
  sanitizeUpdateUrl,
  type PatchFileEntry,
  type PatchManifest,
  type UpdateMode,
  type VersionManifest,
} from '../game/version.ts';

interface RoomClient extends RemotePlayerState {
  clientId: string;
  sessionToken: string;
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
  coopChallenge: CoopChallengeState | null;
  tradeOffers: TradeOffer[];
  wildlifeSpawnTimer: number;
  lastTickMs: number;
  emptySinceMs: number | null;
  dirtyActiveEntities: boolean;
  dirtyPassiveEntities: boolean;
  lastEntityBroadcastMs: number;
  tickSeq: number;
}

const MAX_ROOMS = 200;
const MAX_WS_PER_IP = 24;
const MAX_ROOM_CREATES_PER_MIN = 30;
const MAX_MOVE_STEP_TILES = 3.5;
const DISCONNECTED_PLAYER_TTL_MS = 300_000;
const EMPTY_ROOM_TTL_MS = 60_000;
const ACTIVE_BROADCAST_INTERVAL_MS = 120;
const PASSIVE_ANIMAL_BROADCAST_INTERVAL_MS = 240;
const IDLE_CLOCK_SYNC_INTERVAL_MS = 1000;

function isOwnKey<T extends object>(obj: T, key: unknown): key is keyof T {
  return typeof key === 'string' && Object.hasOwn(obj, key);
}

function tokensMatch(expected: string, provided: string): boolean {
  if (!expected || !provided || expected.length !== provided.length) return false;
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function sanitizeClientId(raw: unknown): string {
  if (typeof raw === 'string') {
    const clean = raw.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 32);
    if (clean.length >= 2) return clean;
  }
  return `p_${randomBytes(6).toString('hex')}`;
}

function sanitizeVoiceSignal(raw: unknown): VoiceSignalPayload | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.kind === 'offer' || obj.kind === 'answer') {
    const sdpObj = obj.sdp;
    if (!sdpObj || typeof sdpObj !== 'object') return null;
    const s = sdpObj as Record<string, unknown>;
    const sdpType = s.type;
    if (
      sdpType !== 'offer' &&
      sdpType !== 'answer' &&
      sdpType !== 'pranswer' &&
      sdpType !== 'rollback'
    ) {
      return null;
    }
    if (s.sdp !== undefined && (typeof s.sdp !== 'string' || s.sdp.length > 12_000)) {
      return null;
    }
    return {
      kind: obj.kind,
      sdp: {
        type: sdpType,
        ...(typeof s.sdp === 'string' ? { sdp: s.sdp } : {}),
      },
    };
  }
  if (obj.kind === 'ice') {
    const candObj = obj.candidate;
    if (!candObj || typeof candObj !== 'object') return null;
    const c = candObj as Record<string, unknown>;
    if (
      c.candidate !== undefined &&
      (typeof c.candidate !== 'string' || c.candidate.length > 2048)
    ) {
      return null;
    }
    if (
      c.sdpMid !== undefined &&
      c.sdpMid !== null &&
      (typeof c.sdpMid !== 'string' || c.sdpMid.length > 128)
    ) {
      return null;
    }
    if (
      c.sdpMLineIndex !== undefined &&
      c.sdpMLineIndex !== null &&
      (typeof c.sdpMLineIndex !== 'number' || !Number.isInteger(c.sdpMLineIndex) || c.sdpMLineIndex < 0 || c.sdpMLineIndex > 64)
    ) {
      return null;
    }
    if (
      c.usernameFragment !== undefined &&
      c.usernameFragment !== null &&
      (typeof c.usernameFragment !== 'string' || c.usernameFragment.length > 128)
    ) {
      return null;
    }
    return {
      kind: 'ice',
      candidate: {
        ...(typeof c.candidate === 'string' ? { candidate: c.candidate } : {}),
        ...(c.sdpMid !== undefined ? { sdpMid: c.sdpMid as string | null } : {}),
        ...(c.sdpMLineIndex !== undefined ? { sdpMLineIndex: c.sdpMLineIndex as number | null } : {}),
        ...(c.usernameFragment !== undefined ? { usernameFragment: c.usernameFragment as string | null } : {}),
      },
    };
  }
  return null;
}

export interface MultiplayerServerOptions {
  serveStaticDist?: boolean;
  distDir?: string;
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
  let cachedPublicRoomsJson: string | null = null;
  const socketMeta = new Map<
    WebSocket,
    { roomCode: string | null; playerId: string | null; ip: string; msgWindowStart: number; msgCount: number }
  >();
  const ipConnections = new Map<string, number>();
  const roomCreateRate = new Map<string, { windowStart: number; count: number }>();

  const distDir = path.resolve(options.distDir || path.join(process.cwd(), 'dist'));

  const rawUpdateMode = (process.env.ECOGROW_UPDATE_MODE || 'auto').trim();
  const updateMode: UpdateMode =
    rawUpdateMode === 'server_only' || rawUpdateMode === 'delta_files' ? rawUpdateMode : 'auto';
  const serverRevision = (process.env.ECOGROW_SERVER_REVISION || '1').trim() || '1';
  const minServerRevision = (process.env.ECOGROW_MIN_SERVER_REVISION || '1').trim() || '1';
  const rawMultiplayerUrl = (process.env.ECOGROW_MULTIPLAYER_URL || '').trim();
  const multiplayerUrl = rawMultiplayerUrl ? sanitizeUpdateUrl(rawMultiplayerUrl) : '';
  const rawVersionFeedUrl = (process.env.ECOGROW_VERSION_FEED_URL || '').trim();
  const sanitizedVersionFeedUrl = rawVersionFeedUrl ? sanitizeUpdateUrl(rawVersionFeedUrl) : '';
  const versionFeedUrl =
    sanitizedVersionFeedUrl &&
    (sanitizedVersionFeedUrl.startsWith('https://') ||
      sanitizedVersionFeedUrl.startsWith('http://'))
      ? sanitizedVersionFeedUrl
      : '';

  const versionManifest: VersionManifest = {
    latest_version: (process.env.ECOGROW_LATEST_VERSION || APP_VERSION).trim() || APP_VERSION,
    min_supported_version:
      (process.env.ECOGROW_MIN_SUPPORTED_VERSION || APP_VERSION).trim() || APP_VERSION,
    server_revision: serverRevision,
    min_server_revision: minServerRevision,
    update_mode: updateMode,
    multiplayer_url: multiplayerUrl,
    ...(versionFeedUrl ? { version_feed_url: versionFeedUrl } : {}),
    patch_manifest_url: '/api/patch-manifest',
    update_url: sanitizeUpdateUrl(process.env.ECOGROW_UPDATE_URL || './'),
    message_ar:
      (
        process.env.ECOGROW_UPDATE_MESSAGE_AR ||
        'يتوفر إصدار جديد مطلوب من EcoGrow Mission يتضمن تحسينات واستقراراً أفضل. يرجى التحديث للمتابعة.'
      )
        .trim()
        .slice(0, 400),
    message_en:
      (
        process.env.ECOGROW_UPDATE_MESSAGE_EN ||
        'A required EcoGrow Mission update is available with stability improvements. Please update to continue.'
      )
        .trim()
        .slice(0, 400),
  };
  const versionManifestJson = JSON.stringify(versionManifest);
  const versionEtag = `"${createHash('sha1').update(versionManifestJson).digest('base64url').slice(0, 16)}"`;

  function scanDistFilesForManifest(rootDir: string, curDir = rootDir): PatchFileEntry[] {
    const out: PatchFileEntry[] = [];
    if (!fs.existsSync(curDir)) return out;
    for (const item of fs.readdirSync(curDir, { withFileTypes: true })) {
      const full = path.join(curDir, item.name);
      if (item.isDirectory()) {
        out.push(...scanDistFilesForManifest(rootDir, full));
      } else if (item.isFile()) {
        const rel = path.relative(rootDir, full).replace(/\\/g, '/');
        if (rel === 'patch-manifest.json' || rel === 'version.json' || rel.endsWith('.map')) continue;
        const safe = sanitizePatchFilePath(rel);
        if (!safe) continue;
        const buf = fs.readFileSync(full);
        out.push({
          path: safe,
          sha256: createHash('sha256').update(buf).digest('hex'),
          size: buf.length,
        });
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }

  function loadOrBuildPatchManifest(): PatchManifest {
    const builtPath = path.join(distDir, 'patch-manifest.json');
    if (fs.existsSync(builtPath)) {
      try {
        const parsed = parsePatchManifest(JSON.parse(fs.readFileSync(builtPath, 'utf8')));
        if (parsed) {
          return { ...parsed, server_revision: serverRevision };
        }
      } catch {
        // Fall through to live scan
      }
    }
    return {
      version: versionManifest.latest_version,
      server_revision: serverRevision,
      files: scanDistFilesForManifest(distDir),
    };
  }

  const patchManifest = loadOrBuildPatchManifest();
  const patchManifestJson = JSON.stringify(patchManifest);
  const patchManifestEtag = `"${createHash('sha1').update(patchManifestJson).digest('base64url').slice(0, 16)}"`;

  function invalidateRoomsCache(): void {
    cachedPublicRoomsJson = null;
  }

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
      style: p.style,
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

  function getPublicRoomsJson(): string {
    if (cachedPublicRoomsJson === null) {
      cachedPublicRoomsJson = JSON.stringify({ rooms: getPublicRoomSummaries() });
    }
    return cachedPublicRoomsJson;
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
    invalidateRoomsCache();
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
      coopChallenge: room.coopChallenge,
      tradeOffers: room.tradeOffers,
      ...(teleportIds && teleportIds.length > 0 ? { teleportIds } : {}),
    });
  }

  function broadcastCoopState(room: ServerRoom): void {
    broadcastToRoom(room, {
      type: 'coop:state',
      coopChallenge: room.coopChallenge,
      tradeOffers: room.tradeOffers,
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
    const activeRealm = room.world.activeRealm ?? 'homestead';
    const realmDef = REALM_DEFS[activeRealm];
    let idx = 0;
    for (const p of room.players.values()) {
      if (activeRealm === 'homestead') {
        p.x = FARMHOUSE_DOOR.x + 0.3 + (idx % 4) * 0.45;
        p.y = FARMHOUSE_DOOR.y + 0.65;
      } else {
        p.x = realmDef.spawnX + (idx % 2) * 0.45;
        p.y = realmDef.spawnY + Math.floor(idx / 2) * 0.45;
      }
      p.facingX = 0;
      p.facingY = 1;
      p.stamina = p.maxStamina;
      p.health = Math.min(p.maxHealth, p.health + 35);
      idx++;
    }
    syncWorldToRoom(room, Array.from(room.players.keys()));
    room.lastEntityBroadcastMs = Date.now();
    room.dirtyActiveEntities = false;
    room.dirtyPassiveEntities = false;
    broadcastFx(room, {
      kind: 'day_advanced',
      sfx: 'morning',
      daySummary: summary,
      messageFrom2040: summary.messageFrom2040,
    });
    if (room.isPublic) {
      broadcastRoomsListToLobby();
    }
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
    if (room.isPublic) {
      broadcastRoomsListToLobby();
    } else {
      invalidateRoomsCache();
    }
  }

  function handleRoomMessage(ws: WebSocket, msg: ClientToServerMessage): void {
    const meta = socketMeta.get(ws);
    if (!meta) return;

    if (msg.type === 'net:ping') {
      if (Number.isFinite(msg.seq) && Number.isFinite(msg.clientSentAt)) {
        sendToClient(ws, {
          type: 'net:pong',
          seq: Math.floor(msg.seq),
          clientSentAt: msg.clientSentAt,
          serverTime: Date.now(),
        });
      }
      return;
    }

    if (msg.type === 'room:list') {
      sendToClient(ws, { type: 'rooms:list', rooms: getPublicRoomSummaries() });
      return;
    }

    if (msg.type === 'room:create') {
      const now = Date.now();
      const rate = roomCreateRate.get(meta.ip);
      if (rate && now - rate.windowStart < 60_000) {
        if (rate.count >= MAX_ROOM_CREATES_PER_MIN) {
          sendToClient(ws, {
            type: 'room:error',
            code: 'RATE_LIMITED',
            message: 'Too many rooms created recently. Please wait a moment.',
          });
          return;
        }
        rate.count += 1;
      } else {
        roomCreateRate.set(meta.ip, { windowStart: now, count: 1 });
      }
      detachPlayerFromRoom(ws, true);
      if (rooms.size >= MAX_ROOMS) {
        sendToClient(ws, {
          type: 'room:error',
          code: 'SERVER_BUSY',
          message: 'Server room capacity reached. Try joining an existing room.',
        });
        return;
      }
      const code = generateRoomCode();
      const playerName = (typeof msg.playerName === 'string' ? msg.playerName : 'Farmer').trim().slice(0, 18) || 'Farmer';
      const roomName =
        (typeof msg.roomName === 'string' ? msg.roomName : `${playerName}'s Farm`).trim().slice(0, 28) ||
        `${playerName}'s Farm`;
      const world = createInitialFarmState(Math.floor(Math.random() * 9000) + 100);
      const clientId = sanitizeClientId(msg.clientId);
      const sessionToken = randomBytes(24).toString('hex');

      const player: RoomClient = {
        id: clientId,
        clientId,
        sessionToken,
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
        coopChallenge: null,
        tradeOffers: [],
        wildlifeSpawnTimer: 4,
        lastTickMs: now,
        emptySinceMs: null,
        dirtyActiveEntities: false,
        dirtyPassiveEntities: false,
        lastEntityBroadcastMs: now,
        tickSeq: 0,
      };

      rooms.set(code, room);
      invalidateRoomsCache();
      meta.roomCode = code;
      meta.playerId = player.id;

      sendToClient(ws, {
        type: 'room:joined',
        roomCode: code,
        roomName: room.name,
        isPublic: room.isPublic,
        playerId: player.id,
        sessionToken,
        hostId: room.hostId,
        world: room.world,
        players: [toPublicPlayer(player)],
        sleepVotes: [],
        chat: room.chat,
        voiceStates: getRoomVoiceStates(room),
        coopChallenge: room.coopChallenge,
        tradeOffers: room.tradeOffers,
      });
      if (room.isPublic) {
        broadcastRoomsListToLobby();
      }
      return;
    }

    if (msg.type === 'room:join') {
      const code = (typeof msg.code === 'string' ? msg.code : '').trim().toUpperCase();
      const room = rooms.get(code);
      if (!room) {
        sendToClient(ws, { type: 'room:error', code: 'NOT_FOUND', message: 'Room not found' });
        return;
      }

      const clientId = sanitizeClientId(msg.clientId);
      const existing = room.players.get(clientId);
      const connectedList = getConnectedPlayers(room);

      if (existing) {
        if (typeof msg.sessionToken !== 'string' || !tokensMatch(existing.sessionToken, msg.sessionToken)) {
          sendToClient(ws, {
            type: 'room:error',
            code: 'UNAUTHORIZED',
            message: 'Session verification failed for this player slot.',
          });
          return;
        }
      } else if (connectedList.length >= MAX_ROOM_PLAYERS) {
        sendToClient(ws, {
          type: 'room:error',
          code: 'ROOM_FULL',
          message: 'Room is full (Max 4)',
        });
        return;
      }

      detachPlayerFromRoom(ws, true);

      const playerName = (typeof msg.playerName === 'string' ? msg.playerName : 'Farmer').trim().slice(0, 18) || 'Farmer';
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
        const activeRealm = room.world.activeRealm ?? 'homestead';
        const realmDef = REALM_DEFS[activeRealm];
        const spawnX =
          activeRealm === 'homestead'
            ? FARMHOUSE_DOOR.x + 0.3 + (offset % 3) * 0.55
            : realmDef.spawnX + (offset % 2) * 0.4;
        const spawnY =
          activeRealm === 'homestead'
            ? FARMHOUSE_DOOR.y + 0.75
            : realmDef.spawnY + Math.floor(offset / 2) * 0.4;
        player = {
          id: clientId,
          clientId,
          sessionToken: randomBytes(24).toString('hex'),
          name: playerName,
          colorIndex: assignNextColorIndex(room),
          x: spawnX,
          y: spawnY,
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
        sessionToken: player.sessionToken,
        hostId: room.hostId,
        world: room.world,
        players: publicPlayers,
        sleepVotes: Array.from(room.sleepVotes),
        chat: room.chat,
        voiceStates,
        coopChallenge: room.coopChallenge,
        tradeOffers: room.tradeOffers,
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
      if (room.isPublic) {
        broadcastRoomsListToLobby();
      } else {
        invalidateRoomsCache();
      }
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
      let changed = false;
      if (Number.isFinite(msg.x) && Number.isFinite(msg.y)) {
        let targetX = Math.max(0.5, Math.min(room.world.width - 0.5, msg.x));
        let targetY = Math.max(0.5, Math.min(room.world.height - 0.5, msg.y));
        const dx = targetX - player.x;
        const dy = targetY - player.y;
        const dist = Math.hypot(dx, dy);
        if (dist > MAX_MOVE_STEP_TILES) {
          const scale = MAX_MOVE_STEP_TILES / dist;
          targetX = player.x + dx * scale;
          targetY = player.y + dy * scale;
        }
        const nx = Math.round(targetX * 100) / 100;
        const ny = Math.round(targetY * 100) / 100;
        const canStandFull = isTileWalkable(room.world, Math.floor(nx), Math.floor(ny));
        const canSlideX = !canStandFull && isTileWalkable(room.world, Math.floor(nx), Math.floor(player.y));
        const canSlideY = !canStandFull && isTileWalkable(room.world, Math.floor(player.x), Math.floor(ny));
        const finalX = canStandFull || canSlideX ? nx : player.x;
        const finalY = canStandFull || canSlideY ? ny : player.y;
        if (Math.abs(finalX - player.x) > 0.005 || Math.abs(finalY - player.y) > 0.005) {
          player.x = finalX;
          player.y = finalY;
          changed = true;
        }
      }
      if (Number.isFinite(msg.facingX) && Math.abs(msg.facingX - player.facingX) > 0.02) {
        player.facingX = Math.max(-1, Math.min(1, msg.facingX));
        changed = true;
      }
      if (Number.isFinite(msg.facingY) && Math.abs(msg.facingY - player.facingY) > 0.02) {
        player.facingY = Math.max(-1, Math.min(1, msg.facingY));
        changed = true;
      }
      if (Number.isFinite(msg.walkCycle) && Math.abs(msg.walkCycle - player.walkCycle) > 0.05) {
        player.walkCycle = msg.walkCycle % (Math.PI * 200);
        changed = true;
      }
      if (
        Number.isInteger(msg.selectedHotbarIndex) &&
        msg.selectedHotbarIndex >= 0 &&
        msg.selectedHotbarIndex < 9 &&
        msg.selectedHotbarIndex !== player.selectedHotbarIndex
      ) {
        player.selectedHotbarIndex = msg.selectedHotbarIndex;
        changed = true;
      }
      if (changed) {
        room.dirtyActiveEntities = true;
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

    if (msg.type === 'action:emote') {
      if (COOP_EMOTES.includes(msg.emote)) {
        broadcastFx(room, {
          kind: 'emote',
          actorId: player.id,
          text: msg.emote,
        });
      }
      return;
    }

    if (msg.type === 'voice:state') {
      const nextEnabled = Boolean(msg.enabled);
      const nextMuted = Boolean(msg.muted);
      const nextSpeaking = nextEnabled && !nextMuted && Boolean(msg.speaking);
      if (
        nextEnabled === player.voiceEnabled &&
        nextMuted === player.voiceMuted &&
        nextSpeaking === player.voiceSpeaking
      ) {
        return;
      }
      player.voiceEnabled = nextEnabled;
      player.voiceMuted = nextMuted;
      player.voiceSpeaking = nextSpeaking;
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
      if (typeof msg.targetId !== 'string') return;
      const sanitizedSignal = sanitizeVoiceSignal(msg.signal);
      if (!sanitizedSignal) return;
      const target = room.players.get(msg.targetId);
      if (!target || !target.connected || target.id === player.id) return;
      sendToClient(target.ws, {
        type: 'voice:signal',
        fromId: player.id,
        signal: sanitizedSignal,
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
        let challengeJustFinished = false;
        if (room.coopChallenge && room.coopChallenge.status === 'active') {
          const ch = room.coopChallenge;
          const matchKind =
            (ch.kind === 'harvest' && res.kind === 'harvest') ||
            (ch.kind === 'water' && res.kind === 'water') ||
            (ch.kind === 'defend' && (res.kind === 'defend' || res.wishOutcome === 'pest_cured'));
          if (matchKind) {
            ch.progress = Math.min(ch.target, ch.progress + 1);
            ch.contributors[player.id] = (ch.contributors[player.id] ?? 0) + 1;
            if (ch.progress >= ch.target) {
              ch.status = 'completed';
              challengeJustFinished = true;
              room.world.player.gold += ch.rewardGold;
              room.world.stats.totalGoldEarned += ch.rewardGold;
              room.world.stats.coopChallengesCompleted =
                (room.world.stats.coopChallengesCompleted ?? 0) + 1;
              grantXp(room.world, 25);
            }
          }
        }
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
        if (challengeJustFinished && room.coopChallenge) {
          broadcastFx(room, {
            kind: 'toast',
            actorId: player.id,
            wx,
            wy: wy - 20,
            sfx: 'quest',
            color: '#4ade80',
            count: 24,
            text: `Co-op Rush +${room.coopChallenge.rewardGold}g!`,
            textColor: '#4ade80',
          });
        }
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
      if (!isOwnKey(ITEMS, msg.itemId)) return;
      const rawQty = Number(msg.qty);
      const qty = Number.isFinite(rawQty) ? Math.max(1, Math.min(99, Math.floor(rawQty))) : 1;
      const res = buyShopItem(room.world, msg.itemId as ItemId, qty);
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
      if (!isOwnKey(ITEMS, msg.itemId)) return;
      const rawQty = Number(msg.qty);
      const qty = Number.isFinite(rawQty) ? Math.max(1, Math.min(999, Math.floor(rawQty))) : 1;
      const res = sellCropItem(room.world, msg.itemId as ItemId, qty);
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
      if (msg.tool !== 'hoe' && msg.tool !== 'watering_can' && msg.tool !== 'axe') return;
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
      if (typeof msg.id !== 'string' || !CRAFT_RECIPES.some((r) => r.id === msg.id)) return;
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

    if (msg.type === 'action:cook') {
      const res = cookRecipe(room.world, msg.recipeId as CookedDishId);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 1) * TILE_SIZE,
          sfx: 'brew',
          color: '#fb923c',
          count: 14,
          leveledUpTo: res.leveledUpTo,
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:eat') {
      if (!isOwnKey(ITEMS, msg.id)) return;
      const res = eatCrop(room.world, msg.id);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: res.swiftApplied ? 'brew' : 'harvest' } });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:quick_eat') {
      const res = eatBestFood(room.world);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        sendToClient(ws, {
          type: 'fx:event',
          fx: {
            kind: 'toast',
            actorId: player.id,
            wx: player.x * TILE_SIZE,
            wy: (player.y - 1) * TILE_SIZE,
            sfx: res.swiftApplied ? 'brew' : 'harvest',
          },
        });
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
        isOwnKey(ITEMS, msg.id)
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
      if (typeof msg.id !== 'string' || !MISSIONS.some((m) => m.id === msg.id)) return;
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
      if (
        msg.kind !== 'chicken' &&
        msg.kind !== 'cow' &&
        msg.kind !== 'sheep' &&
        msg.kind !== 'dog' &&
        msg.kind !== 'cat'
      ) {
        return;
      }
      const res =
        msg.kind === 'chicken'
          ? buyFarmChicken(room.world)
          : msg.kind === 'cow'
          ? buyDairyCow(room.world)
          : msg.kind === 'sheep'
          ? buyFluffySheep(room.world)
          : msg.kind === 'cat'
          ? buyFarmCat(room.world)
          : buyGuardDog(room.world);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        sendToClient(ws, {
          type: 'fx:event',
          fx: {
            kind: 'toast',
            sfx: msg.kind === 'dog' ? 'bark' : msg.kind === 'cat' ? 'purr' : 'harvest',
          },
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:unlock_realm') {
      if (!isOwnKey(REALM_DEFS, msg.realmId)) return;
      const targetId = msg.realmId as RealmId;
      const res = unlockRealm(room.world, targetId);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 1) * TILE_SIZE,
          sfx: 'portal',
          color: REALM_DEFS[targetId].accentColor,
          count: 18,
          leveledUpTo: res.leveledUpTo,
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:travel_realm') {
      if (!isOwnKey(REALM_DEFS, msg.realmId)) return;
      const targetId = msg.realmId as RealmId;
      const res = travelToRealm(room.world, targetId);
      if (res.ok) {
        const def = REALM_DEFS[targetId];
        let idx = 0;
        for (const p of room.players.values()) {
          p.x = def.spawnX + (idx % 2) * 0.45;
          p.y = def.spawnY + Math.floor(idx / 2) * 0.45;
          p.facingX = 1;
          p.facingY = 0;
          idx++;
        }
        room.dirtyActiveEntities = false;
        room.dirtyPassiveEntities = false;
        syncWorldToRoom(room, Array.from(room.players.keys()));
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: def.spawnX * TILE_SIZE,
          wy: (def.spawnY - 0.5) * TILE_SIZE,
          sfx: 'portal',
          color: def.accentColor,
          count: 20,
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:interact_landmark') {
      if (msg.kind !== 'elder' && msg.kind !== 'strange_zone') return;
      const near =
        msg.kind === 'elder'
          ? isNearVillageElder(room.world)
          : isNearStrangeZone(room.world);
      if (!near) {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
        return;
      }
      const res =
        msg.kind === 'elder'
          ? interactWithVillageElder(room.world)
          : interactWithStrangeZone(room.world);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 1) * TILE_SIZE,
          sfx: msg.kind === 'elder' ? 'wish' : 'portal',
          color: msg.kind === 'elder' ? '#fde047' : '#c084fc',
          count: 16,
          storyRealm: res.realmId,
          storyKind: msg.kind,
          relicUnlocked: 'relicUnlocked' in res ? res.relicUnlocked : undefined,
          leveledUpTo: res.leveledUpTo,
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:festival_claim') {
      const res = participateInFestival(room.world);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 1) * TILE_SIZE,
          sfx: 'quest',
          color: '#f472b6',
          count: 24,
          text: `+${res.rewardGold}g Festival!`,
          textColor: '#fde047',
          leveledUpTo: res.leveledUpTo,
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:coop_challenge_start') {
      const kind = msg.kind;
      if (kind !== 'harvest' && kind !== 'water' && kind !== 'defend') return;
      if (room.coopChallenge && room.coopChallenge.status === 'active') {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
        return;
      }
      const nowMs = Date.now();
      const target = kind === 'water' ? 10 : kind === 'harvest' ? 6 : 3;
      const durationMs = kind === 'water' ? 75_000 : 90_000;
      const rewardGold = kind === 'water' ? 110 : kind === 'harvest' ? 140 : 150;
      room.coopChallenge = {
        id: `cc_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
        kind: kind as CoopChallengeKind,
        target,
        progress: 0,
        rewardGold,
        startedById: player.id,
        startedByName: player.name,
        startedAtMs: nowMs,
        expiresAtMs: nowMs + durationMs,
        status: 'active',
        contributors: {},
      };
      broadcastCoopState(room);
      broadcastFx(room, {
        kind: 'toast',
        actorId: player.id,
        wx: player.x * TILE_SIZE,
        wy: (player.y - 1) * TILE_SIZE,
        sfx: 'quest',
        color: '#38bdf8',
        count: 14,
      });
      return;
    }

    if (msg.type === 'action:trade_send') {
      if (!isOwnKey(ITEMS, msg.giveItemId) || !isOwnKey(ITEMS, msg.requestItemId)) return;
      if (msg.giveItemId === msg.requestItemId) return;
      const giveQty = Math.max(1, Math.min(20, Math.floor(Number(msg.giveQty) || 1)));
      const requestQty = Math.max(1, Math.min(20, Math.floor(Number(msg.requestQty) || 1)));
      if ((room.world.inventory[msg.giveItemId] ?? 0) < giveQty) {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
        return;
      }
      const targetPlayer = msg.toId === 'anyone' ? null : room.players.get(msg.toId);
      const nowMs = Date.now();
      const offer: TradeOffer = {
        id: `tr_${nowMs}_${Math.random().toString(36).slice(2, 6)}`,
        fromId: player.id,
        fromName: player.name,
        toId: targetPlayer ? targetPlayer.id : 'anyone',
        toName: targetPlayer?.name,
        giveItemId: msg.giveItemId,
        giveQty,
        requestItemId: msg.requestItemId,
        requestQty,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + 300_000,
      };
      room.tradeOffers.unshift(offer);
      if (room.tradeOffers.length > 10) room.tradeOffers.pop();
      broadcastCoopState(room);
      broadcastFx(room, {
        kind: 'toast',
        actorId: player.id,
        wx: player.x * TILE_SIZE,
        wy: (player.y - 1) * TILE_SIZE,
        sfx: 'coin',
        color: '#fde047',
        count: 10,
      });
      return;
    }

    if (msg.type === 'action:trade_accept') {
      const idx = room.tradeOffers.findIndex((t) => t.id === msg.tradeId);
      if (idx === -1) return;
      const offer = room.tradeOffers[idx];
      if (offer.expiresAtMs <= Date.now()) {
        room.tradeOffers.splice(idx, 1);
        broadcastCoopState(room);
        return;
      }
      if (offer.toId !== 'anyone' && offer.toId !== player.id) {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
        return;
      }
      if (
        (room.world.inventory[offer.giveItemId] ?? 0) < offer.giveQty ||
        (room.world.inventory[offer.requestItemId] ?? 0) < offer.requestQty
      ) {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
        return;
      }
      room.tradeOffers.splice(idx, 1);
      // Fulfill co-op barter contract: transform/exchange batch and award +20g co-op trade bonus!
      consumeInventoryItem(room.world, offer.requestItemId, offer.requestQty);
      addInventoryItem(room.world, offer.giveItemId, offer.giveQty);
      room.world.player.gold += 20;
      room.world.stats.totalGoldEarned += 20;
      room.world.stats.coopTradesCompleted = (room.world.stats.coopTradesCompleted ?? 0) + 1;
      const leveledUpTo = grantXp(room.world, 12);
      extractPlayerFromWorld(room, player);
      syncWorldToRoom(room);
      broadcastFx(room, {
        kind: 'toast',
        actorId: player.id,
        wx: player.x * TILE_SIZE,
        wy: (player.y - 1) * TILE_SIZE,
        sfx: 'coin',
        color: '#4ade80',
        count: 16,
        text: '+20g Trade!',
        textColor: '#fde047',
        leveledUpTo,
      });
      return;
    }

    if (msg.type === 'action:trade_decline') {
      const idx = room.tradeOffers.findIndex((t) => t.id === msg.tradeId);
      if (idx === -1) return;
      const offer = room.tradeOffers[idx];
      if (offer.fromId !== player.id && offer.toId !== player.id && offer.toId !== 'anyone') return;
      room.tradeOffers.splice(idx, 1);
      broadcastCoopState(room);
      return;
    }

    if (msg.type === 'action:set_style') {
      player.style = normalizeFarmerStyle(msg.style);
      room.dirtyActiveEntities = true;
      return;
    }

    if (msg.type === 'action:rename_pet') {
      if (msg.kind !== 'dog' && msg.kind !== 'cat') return;
      renameFarmPet(room.world, msg.kind, msg.name);
      syncWorldToRoom(room);
      return;
    }

    if (msg.type === 'action:open_chest') {
      const res = openMysteryChest(room.world);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 1) * TILE_SIZE,
          sfx: 'chest',
          color: '#fde047',
          count: 18,
          leveledUpTo: res.leveledUpTo,
        });
      } else {
        sendToClient(ws, { type: 'fx:event', fx: { kind: 'toast', sfx: 'error' } });
      }
      return;
    }

    if (msg.type === 'action:spin_wheel') {
      if (!Number.isInteger(msg.rewardIndex)) return;
      const res = spinLuckyWheel(room.world, msg.rewardIndex);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 1) * TILE_SIZE,
          sfx: 'quest',
          color: '#fde047',
          count: 16,
        });
      }
      return;
    }

    if (msg.type === 'action:answer_quiz') {
      if (!Number.isInteger(msg.choiceIndex)) return;
      const quizIdx = getDailyQuizForDay(room.world.day).index;
      const res = answerEcoQuiz(room.world, quizIdx, msg.choiceIndex);
      extractPlayerFromWorld(room, player);
      if (res.ok) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 1) * TILE_SIZE,
          sfx: res.correct ? 'quest' : 'coin',
          color: res.correct ? '#4ade80' : '#fbbf24',
          count: 12,
          leveledUpTo: res.leveledUpTo,
        });
      }
      return;
    }

    if (msg.type === 'action:catch_firefly') {
      if (!Number.isFinite(msg.id)) return;
      const res = catchNearbyFirefly(room.world, 1.35);
      extractPlayerFromWorld(room, player);
      if (res.caught) {
        syncWorldToRoom(room);
        broadcastFx(room, {
          kind: 'toast',
          actorId: player.id,
          wx: player.x * TILE_SIZE,
          wy: (player.y - 0.6) * TILE_SIZE,
          sfx: 'firefly',
          color: '#bef264',
          count: 10,
          leveledUpTo: res.leveledUpTo,
        });
      }
    }
  }

  function tickRooms(): void {
    const now = Date.now();
    for (const [code, room] of rooms.entries()) {
      // Prune stale disconnected player slots after 5 minutes
      for (const [pid, p] of room.players.entries()) {
        if (!p.connected && p.disconnectedAt && now - p.disconnectedAt > DISCONNECTED_PLAYER_TTL_MS) {
          room.players.delete(pid);
          room.sleepVotes.delete(pid);
        }
      }

      const activePlayers = getConnectedPlayers(room);
      if (activePlayers.length === 0) {
        if (room.emptySinceMs && now - room.emptySinceMs > EMPTY_ROOM_TTL_MS) {
          const wasPublic = room.isPublic;
          rooms.delete(code);
          if (wasPublic) {
            broadcastRoomsListToLobby();
          } else {
            invalidateRoomsCache();
          }
        }
        room.lastTickMs = now;
        continue;
      }

      const dt = Math.min(0.25, (now - room.lastTickMs) / 1000);
      room.lastTickMs = now;

      let coopDirty = false;
      if (room.coopChallenge && room.coopChallenge.status === 'active' && now >= room.coopChallenge.expiresAtMs) {
        room.coopChallenge.status = 'expired';
        coopDirty = true;
      }
      if (room.tradeOffers.length > 0) {
        const before = room.tradeOffers.length;
        room.tradeOffers = room.tradeOffers.filter((t) => t.expiresAtMs > now);
        if (room.tradeOffers.length !== before) coopDirty = true;
      }
      if (coopDirty) {
        broadcastCoopState(room);
      }

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
        if (p.swingTimer > 0) {
          p.swingTimer = Math.max(0, p.swingTimer - dt);
          room.dirtyActiveEntities = true;
        }
        if (p.hitFlashTimer > 0) {
          p.hitFlashTimer = Math.max(0, p.hitFlashTimer - dt);
          room.dirtyActiveEntities = true;
        }
      }

      // Night wildlife spawning
      if (world.timeMinutes >= NIGHT_START_MINUTES) {
        room.wildlifeSpawnTimer -= dt;
        if (room.wildlifeSpawnTimer <= 0) {
          room.wildlifeSpawnTimer = 5.5 + Math.random() * 4;
          if (spawnNightWildlife(world)) {
            room.dirtyActiveEntities = true;
          }
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
          room.dirtyActiveEntities = true;
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
      stepRealmCreatures(world, dt);

      if (world.wildlife.length > 0) {
        room.dirtyActiveEntities = true;
      } else if (
        world.chickens.some((c) => c.vx !== 0 || c.vy !== 0) ||
        (world.cows ?? []).some((c) => c.vx !== 0 || c.vy !== 0) ||
        (world.sheep ?? []).some((s) => s.vx !== 0 || s.vy !== 0) ||
        Boolean(world.dog && (world.dog.vx !== 0 || world.dog.vy !== 0)) ||
        Boolean(world.cat && (world.cat.vx !== 0 || world.cat.vy !== 0)) ||
        (world.realmCreatures ?? []).some((c) => c.vx !== 0 || c.vy !== 0)
      ) {
        room.dirtyPassiveEntities = true;
      }

      if (world.timeMinutes >= DAY_END_MINUTES) {
        performSleepForRoom(room);
        continue;
      }

      if (worldNeedsSync) {
        syncWorldToRoom(room, teleportIds);
        room.lastEntityBroadcastMs = now;
        room.dirtyActiveEntities = false;
        room.dirtyPassiveEntities = false;
        continue;
      }

      const elapsedSinceBroadcast = now - room.lastEntityBroadcastMs;
      const shouldBroadcastEntities =
        (room.dirtyActiveEntities && elapsedSinceBroadcast >= ACTIVE_BROADCAST_INTERVAL_MS) ||
        (room.dirtyPassiveEntities && elapsedSinceBroadcast >= PASSIVE_ANIMAL_BROADCAST_INTERVAL_MS) ||
        elapsedSinceBroadcast >= IDLE_CLOCK_SYNC_INTERVAL_MS;

      if (shouldBroadcastEntities) {
        room.lastEntityBroadcastMs = now;
        room.dirtyActiveEntities = false;
        room.dirtyPassiveEntities = false;
        room.tickSeq += 1;
        broadcastToRoom(room, {
          type: 'tick:entities',
          seq: room.tickSeq,
          timeMinutes: world.timeMinutes,
          weather: world.weather,
          players: activePlayers.map(toPublicPlayer),
          wildlife: world.wildlife,
          chickens: world.chickens,
          cows: world.cows ?? [],
          sheep: world.sheep ?? [],
          dog: world.dog ?? null,
          cat: world.cat ?? null,
          realmCreatures: world.realmCreatures ?? [],
        });
      }
    }
  }

  const app = express();
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=()');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, If-None-Match');
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, rooms: rooms.size });
  });

  app.get('/api/version', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    res.setHeader('ETag', versionEtag);
    if (req.headers['if-none-match'] === versionEtag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(versionManifestJson);
  });

  app.get('/api/patch-manifest', (req, res) => {
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
    res.setHeader('ETag', patchManifestEtag);
    if (req.headers['if-none-match'] === patchManifestEtag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(patchManifestJson);
  });

  app.get('/patch-files/*', (req, res) => {
    const rawRel = (req.params as Record<string, string>)[0] || '';
    const safeRel = sanitizePatchFilePath(rawRel);
    if (!safeRel) {
      res.status(400).json({ error: 'INVALID_PATCH_PATH' });
      return;
    }
    const targetPath = path.resolve(distDir, safeRel);
    if (!targetPath.startsWith(`${distDir}${path.sep}`) && targetPath !== distDir) {
      res.status(403).json({ error: 'FORBIDDEN' });
      return;
    }
    if (!fs.existsSync(targetPath) || !fs.statSync(targetPath).isFile()) {
      res.status(404).json({ error: 'NOT_FOUND' });
      return;
    }
    if (safeRel.startsWith('assets/')) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
    res.sendFile(targetPath);
  });

  app.get('/api/rooms', (_req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(getPublicRoomsJson());
  });

  if (options.serveStaticDist) {
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  const aliveSockets = new WeakMap<WebSocket, boolean>();

  wss.on('connection', (ws, request) => {
    const ip = request?.socket?.remoteAddress || 'unknown';
    ipConnections.set(ip, (ipConnections.get(ip) ?? 0) + 1);
    aliveSockets.set(ws, true);
    socketMeta.set(ws, { roomCode: null, playerId: null, ip, msgWindowStart: Date.now(), msgCount: 0 });

    ws.on('pong', () => {
      aliveSockets.set(ws, true);
    });

    ws.on('message', (raw) => {
      aliveSockets.set(ws, true);
      const meta = socketMeta.get(ws);
      if (meta) {
        const now = Date.now();
        if (now - meta.msgWindowStart >= 1000) {
          meta.msgWindowStart = now;
          meta.msgCount = 1;
        } else {
          meta.msgCount += 1;
          if (meta.msgCount > 80) return; // Drop burst spam beyond 80 msgs/sec
        }
      }
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
      const meta = socketMeta.get(ws);
      if (meta) {
        const cur = ipConnections.get(meta.ip) ?? 1;
        if (cur <= 1) ipConnections.delete(meta.ip);
        else ipConnections.set(meta.ip, cur - 1);
      }
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
      const ip = request.socket.remoteAddress || 'unknown';
      if ((ipConnections.get(ip) ?? 0) >= MAX_WS_PER_IP) {
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
      });
    } else {
      socket.destroy();
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
      for (const client of wss.clients) {
        try {
          client.terminate();
        } catch {
          // Ignore
        }
      }
      rooms.clear();
      socketMeta.clear();
      (server as http.Server & { closeAllConnections?: () => void }).closeAllConnections?.();
    },
  };
}
