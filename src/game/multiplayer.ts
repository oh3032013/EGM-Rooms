import type {
  DaySummary,
  FarmChicken,
  FutureDispatch,
  GameWorldState,
  ItemId,
  LivestockEntity,
  MissionId,
  PlaceableType,
  Season,
  ToolType,
  WeatherType,
  WildlifeEntity,
} from './types.ts';

export type GameMode = 'singleplayer' | 'multiplayer';

export const MAX_ROOM_PLAYERS = 4;

export const PLAYER_PALETTE = [
  { overalls: '#3a6699', shirt: '#c95240', badge: '#60a5fa' },
  { overalls: '#2f6f4e', shirt: '#e09f3e', badge: '#34d399' },
  { overalls: '#6b428a', shirt: '#e07a9b', badge: '#c084fc' },
  { overalls: '#8c532b', shirt: '#38bdf8', badge: '#fbbf24' },
] as const;

export interface RemotePlayerState {
  id: string;
  name: string;
  colorIndex: number;
  x: number;
  y: number;
  facingX: number;
  facingY: number;
  walkCycle: number;
  swingTimer: number;
  swingTool: ToolType | null;
  hitFlashTimer: number;
  health: number;
  maxHealth: number;
  stamina: number;
  maxStamina: number;
  waterLevel: number;
  maxWaterLevel: number;
  selectedHotbarIndex: number;
}

export interface RoomSummary {
  code: string;
  name: string;
  hostName: string;
  playerCount: number;
  maxPlayers: number;
  day: number;
  season: Season;
  isPublic: boolean;
}

export interface ChatMessage {
  id: string;
  senderId: string;
  senderName: string;
  colorIndex: number;
  text: string;
  timestamp: number;
}

export interface FxPayload {
  kind:
    | 'tile'
    | 'well'
    | 'hurt'
    | 'crop_eaten'
    | 'dog_bark'
    | 'day_advanced'
    | 'drought'
    | 'heatwave'
    | 'toast';
  actorId?: string;
  wx?: number;
  wy?: number;
  color?: string;
  count?: number;
  speed?: number;
  sfx?: string;
  sfxArg?: number;
  text?: string;
  textColor?: string;
  actionKind?: string;
  actionMessage?: string;
  swingTool?: ToolType | null;
  cropHarvested?: ItemId;
  goldenBonus?: boolean;
  rotationBoosted?: boolean;
  comboCount?: number;
  comboGold?: number;
  leveledUpTo?: number;
  treasureFound?: { gold?: number; seedId?: ItemId };
  dmg?: number;
  daySummary?: DaySummary;
  messageFrom2040?: FutureDispatch | null;
}

export type ClientToServerMessage =
  | { type: 'room:list' }
  | {
      type: 'room:create';
      playerName: string;
      roomName: string;
      isPublic: boolean;
      clientId?: string;
    }
  | {
      type: 'room:join';
      code: string;
      playerName: string;
      clientId?: string;
    }
  | { type: 'room:leave' }
  | {
      type: 'player:move';
      x: number;
      y: number;
      facingX: number;
      facingY: number;
      walkCycle: number;
      selectedHotbarIndex: number;
    }
  | {
      type: 'action:tile';
      tx: number;
      ty: number;
      selectedHotbarIndex: number;
    }
  | { type: 'action:well' }
  | { type: 'action:shop_buy'; itemId: ItemId; qty: number }
  | { type: 'action:shop_sell'; itemId: ItemId; qty: number }
  | { type: 'action:upgrade_tool'; tool: ToolType }
  | { type: 'action:craft'; id: PlaceableType | 'fertilizer' }
  | { type: 'action:eat'; id: ItemId }
  | { type: 'action:assign_hotbar'; id: ItemId; slotIdx: number }
  | { type: 'action:mission_claim'; id: MissionId }
  | { type: 'action:order_fulfill' }
  | { type: 'action:buy_animal'; kind: 'chicken' | 'cow' | 'sheep' | 'dog' }
  | { type: 'action:sleep_vote'; ready: boolean }
  | { type: 'action:chat'; text: string };

export type ServerToClientMessage =
  | { type: 'rooms:list'; rooms: RoomSummary[] }
  | {
      type: 'room:joined';
      roomCode: string;
      roomName: string;
      isPublic: boolean;
      playerId: string;
      hostId: string;
      world: GameWorldState;
      players: RemotePlayerState[];
      sleepVotes: string[];
      chat: ChatMessage[];
    }
  | { type: 'room:error'; code: string; message: string }
  | {
      type: 'world:sync';
      world: GameWorldState;
      players: RemotePlayerState[];
      hostId: string;
      sleepVotes: string[];
      teleportIds?: string[];
    }
  | {
      type: 'tick:entities';
      timeMinutes: number;
      weather: WeatherType;
      players: RemotePlayerState[];
      wildlife: WildlifeEntity[];
      chickens: FarmChicken[];
      cows: LivestockEntity[];
      sheep: LivestockEntity[];
      dog: LivestockEntity | null;
    }
  | { type: 'fx:event'; fx: FxPayload }
  | { type: 'chat:message'; message: ChatMessage }
  | {
      type: 'player:presence';
      event: 'joined' | 'left';
      playerId: string;
      playerName: string;
      hostId: string;
      players: RemotePlayerState[];
      sleepVotes: string[];
    };

const SERVER_URL_STORAGE_KEY = 'ecogrow_mp_server_url';
const PLAYER_NAME_STORAGE_KEY = 'ecogrow_mp_player_name';
const CLIENT_ID_STORAGE_KEY = 'ecogrow_mp_client_id';

export function getSavedPlayerName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

export function savePlayerName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, name.trim().slice(0, 18));
  } catch {
    // Ignore storage errors
  }
}

export function getOrCreateClientId(): string {
  if (typeof window === 'undefined') return 'server';
  try {
    // Use sessionStorage so separate browser tabs get distinct player IDs while refreshes keep reconnecting smoothly
    let id = window.sessionStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (!id) {
      id = `p_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36).slice(-4)}`;
      window.sessionStorage.setItem(CLIENT_ID_STORAGE_KEY, id);
    }
    return id;
  } catch {
    return `p_${Math.random().toString(36).slice(2, 10)}`;
  }
}

export function getSavedMultiplayerServerUrl(): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = window.localStorage.getItem(SERVER_URL_STORAGE_KEY);
    if (saved) return saved;
  } catch {
    // Ignore
  }
  const envUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_MULTIPLAYER_URL;
  return envUrl ?? '';
}

export function saveMultiplayerServerUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = url.trim().replace(/\/+$/, '');
    if (trimmed) {
      window.localStorage.setItem(SERVER_URL_STORAGE_KEY, trimmed);
    } else {
      window.localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

export function resolveWebSocketUrl(customBaseUrl?: string): string {
  const base = (customBaseUrl ?? getSavedMultiplayerServerUrl()).trim().replace(/\/+$/, '');
  if (base) {
    if (base.startsWith('ws://') || base.startsWith('wss://')) {
      return base.endsWith('/ws') ? base : `${base}/ws`;
    }
    if (base.startsWith('https://')) {
      return `wss://${base.slice('https://'.length)}/ws`;
    }
    if (base.startsWith('http://')) {
      return `ws://${base.slice('http://'.length)}/ws`;
    }
    return `wss://${base}/ws`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws`;
}

export function resolveHttpApiBase(customBaseUrl?: string): string {
  const base = (customBaseUrl ?? getSavedMultiplayerServerUrl()).trim().replace(/\/+$/, '');
  if (!base) return '';
  if (base.startsWith('wss://')) return `https://${base.slice('wss://'.length).replace(/\/ws$/, '')}`;
  if (base.startsWith('ws://')) return `http://${base.slice('ws://'.length).replace(/\/ws$/, '')}`;
  if (base.startsWith('http://') || base.startsWith('https://')) return base.replace(/\/ws$/, '');
  return `https://${base.replace(/\/ws$/, '')}`;
}
