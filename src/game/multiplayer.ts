import type {
  CookedDishId,
  DaySummary,
  FarmChicken,
  FarmerStyle,
  FutureDispatch,
  GameWorldState,
  ItemId,
  LivestockEntity,
  MissionId,
  PlaceableType,
  RealmCreatureEntity,
  RealmId,
  RelicId,
  Season,
  ToolType,
  WeatherType,
  WildlifeEntity,
} from './types.ts';

export type CoopChallengeKind = 'harvest' | 'water' | 'defend';

export interface CoopChallengeState {
  id: string;
  kind: CoopChallengeKind;
  target: number;
  progress: number;
  rewardGold: number;
  startedById: string;
  startedByName: string;
  startedAtMs: number;
  expiresAtMs: number;
  status: 'active' | 'completed' | 'expired';
  contributors: Record<string, number>;
}

export interface TradeOffer {
  id: string;
  fromId: string;
  fromName: string;
  toId: string; // target playerId or 'anyone'
  toName?: string;
  giveItemId: ItemId;
  giveQty: number;
  requestItemId: ItemId;
  requestQty: number;
  createdAtMs: number;
  expiresAtMs: number;
}

export type GameMode = 'singleplayer' | 'multiplayer';

export const MAX_ROOM_PLAYERS = 4;

export const COOP_EMOTES = ['👋', '❤️', '💧', '🌾', '⚡'] as const;
export type CoopEmote = (typeof COOP_EMOTES)[number];

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
  style?: FarmerStyle;
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

export interface VoicePeerState {
  enabled: boolean;
  muted: boolean;
  speaking: boolean;
}

export type VoiceSignalPayload =
  | {
      kind: 'offer' | 'answer';
      sdp: { type: 'offer' | 'answer' | 'pranswer' | 'rollback'; sdp?: string };
    }
  | {
      kind: 'ice';
      candidate: {
        candidate?: string;
        sdpMid?: string | null;
        sdpMLineIndex?: number | null;
        usernameFragment?: string | null;
      };
    };

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
    | 'toast'
    | 'emote';
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
  storyRealm?: RealmId;
  storyKind?: 'elder' | 'strange_zone';
  relicUnlocked?: RelicId;
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
      sessionToken?: string;
    }
  | {
      type: 'room:join';
      code: string;
      playerName: string;
      clientId?: string;
      sessionToken?: string;
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
  | { type: 'action:craft'; id: PlaceableType | 'fertilizer' | 'bio_mulch' | 'pest_spray' }
  | { type: 'action:cook'; recipeId: CookedDishId }
  | { type: 'action:eat'; id: ItemId }
  | { type: 'action:quick_eat' }
  | { type: 'action:assign_hotbar'; id: ItemId; slotIdx: number }
  | { type: 'action:mission_claim'; id: MissionId }
  | { type: 'action:order_fulfill' }
  | { type: 'action:festival_claim' }
  | { type: 'action:coop_challenge_start'; kind: CoopChallengeKind }
  | {
      type: 'action:trade_send';
      toId: string;
      giveItemId: ItemId;
      giveQty: number;
      requestItemId: ItemId;
      requestQty: number;
    }
  | { type: 'action:trade_accept'; tradeId: string }
  | { type: 'action:trade_decline'; tradeId: string }
  | { type: 'action:buy_animal'; kind: 'chicken' | 'cow' | 'sheep' | 'dog' | 'cat' }
  | { type: 'action:unlock_realm'; realmId: RealmId }
  | { type: 'action:travel_realm'; realmId: RealmId }
  | { type: 'action:interact_landmark'; kind: 'elder' | 'strange_zone' }
  | { type: 'action:set_style'; style: FarmerStyle }
  | { type: 'action:rename_pet'; kind: 'dog' | 'cat'; name: string }
  | { type: 'action:open_chest' }
  | { type: 'action:spin_wheel'; rewardIndex: number }
  | { type: 'action:answer_quiz'; choiceIndex: number }
  | { type: 'action:catch_firefly'; id: number }
  | { type: 'action:sleep_vote'; ready: boolean }
  | { type: 'action:chat'; text: string }
  | { type: 'voice:state'; enabled: boolean; muted: boolean; speaking?: boolean }
  | { type: 'voice:signal'; targetId: string; signal: VoiceSignalPayload }
  | { type: 'action:emote'; emote: CoopEmote }
  | { type: 'net:ping'; seq: number; clientSentAt: number };

export type ServerToClientMessage =
  | { type: 'rooms:list'; rooms: RoomSummary[] }
  | {
      type: 'room:joined';
      roomCode: string;
      roomName: string;
      isPublic: boolean;
      playerId: string;
      sessionToken?: string;
      hostId: string;
      world: GameWorldState;
      players: RemotePlayerState[];
      sleepVotes: string[];
      chat: ChatMessage[];
      voiceStates?: Record<string, VoicePeerState>;
      coopChallenge?: CoopChallengeState | null;
      tradeOffers?: TradeOffer[];
    }
  | { type: 'room:error'; code: string; message: string }
  | {
      type: 'world:sync';
      world: GameWorldState;
      players: RemotePlayerState[];
      hostId: string;
      sleepVotes: string[];
      teleportIds?: string[];
      coopChallenge?: CoopChallengeState | null;
      tradeOffers?: TradeOffer[];
    }
  | {
      type: 'coop:state';
      coopChallenge: CoopChallengeState | null;
      tradeOffers: TradeOffer[];
    }
  | {
      type: 'tick:entities';
      seq?: number;
      timeMinutes: number;
      weather: WeatherType;
      players: RemotePlayerState[];
      wildlife: WildlifeEntity[];
      chickens: FarmChicken[];
      cows: LivestockEntity[];
      sheep: LivestockEntity[];
      dog: LivestockEntity | null;
      cat?: LivestockEntity | null;
      realmCreatures?: RealmCreatureEntity[];
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
      voiceStates?: Record<string, VoicePeerState>;
    }
  | { type: 'voice:peer_state'; playerId: string; state: VoicePeerState }
  | { type: 'voice:signal'; fromId: string; signal: VoiceSignalPayload }
  | { type: 'net:pong'; seq: number; clientSentAt: number; serverTime: number };

const SERVER_URL_STORAGE_KEY = 'ecogrow_mp_server_url';
const PLAYER_NAME_STORAGE_KEY = 'ecogrow_mp_player_name';
const CLIENT_ID_STORAGE_KEY = 'ecogrow_mp_client_id';
export const DEFAULT_EXTERNAL_SERVER_URL = 'https://ecogrowmission.up.railway.app';

export function normalizeServerBaseUrl(rawUrl: string): string {
  let clean = rawUrl.trim();
  if (!clean) return '';
  // Reject unsafe schemes (javascript:, data:, vbscript:, file:, etc.)
  if (/^[a-z][a-z0-9+.-]*:/i.test(clean) && !/^(https?|wss?):\/\//i.test(clean)) {
    return '';
  }
  if (!/^(https?|wss?):\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  try {
    const parsed = new URL(clean);
    if (
      parsed.protocol !== 'http:' &&
      parsed.protocol !== 'https:' &&
      parsed.protocol !== 'ws:' &&
      parsed.protocol !== 'wss:'
    ) {
      return '';
    }
  } catch {
    return '';
  }
  clean = clean
    .replace(/\/+$/, '')
    .replace(/\/api\/(health|rooms)$/i, '')
    .replace(/\/api$/i, '')
    .replace(/\/ws$/i, '')
    .replace(/\/+$/, '');
  return clean;
}

function isExternalHostedClient(): boolean {
  if (typeof window === 'undefined') return false;
  const { protocol, hostname } = window.location;
  if (
    protocol === 'file:' ||
    protocol === 'capacitor:' ||
    protocol === 'ionic:' ||
    protocol === 'app:'
  ) {
    return true;
  }
  const win = window as Window & { Capacitor?: unknown; electronAPI?: unknown };
  if (win.Capacitor || win.electronAPI) {
    return true;
  }
  const host = hostname.toLowerCase();
  return (
    host.endsWith('.vercel.app') ||
    host.endsWith('.netlify.app') ||
    host.endsWith('.github.io') ||
    host.endsWith('.pages.dev') ||
    host.endsWith('.web.app') ||
    host.endsWith('.firebaseapp.com') ||
    host.endsWith('.itch.io') ||
    host.endsWith('.itch.zone') ||
    host.endsWith('.hwcdn.net')
  );
}

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
    if (saved) {
      const normalized = normalizeServerBaseUrl(saved);
      if (normalized) return normalized;
    }
  } catch {
    // Ignore
  }
  const envUrl = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env
    ?.VITE_MULTIPLAYER_URL;
  if (envUrl) {
    const normalized = normalizeServerBaseUrl(envUrl);
    if (normalized) return normalized;
  }
  return isExternalHostedClient() ? DEFAULT_EXTERNAL_SERVER_URL : '';
}

export function saveMultiplayerServerUrl(url: string): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeServerBaseUrl(url);
    if (normalized) {
      window.localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
    } else {
      window.localStorage.removeItem(SERVER_URL_STORAGE_KEY);
    }
  } catch {
    // Ignore
  }
}

export function resolveWebSocketUrl(customBaseUrl?: string): string {
  const raw = customBaseUrl !== undefined ? customBaseUrl : getSavedMultiplayerServerUrl();
  const base = normalizeServerBaseUrl(raw) || (isExternalHostedClient() ? DEFAULT_EXTERNAL_SERVER_URL : '');
  if (base) {
    if (base.startsWith('ws://') || base.startsWith('wss://')) {
      return `${base}/ws`;
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
  const raw = customBaseUrl !== undefined ? customBaseUrl : getSavedMultiplayerServerUrl();
  const base = normalizeServerBaseUrl(raw) || (isExternalHostedClient() ? DEFAULT_EXTERNAL_SERVER_URL : '');
  if (!base) return '';
  if (base.startsWith('wss://')) return `https://${base.slice('wss://'.length)}`;
  if (base.startsWith('ws://')) return `http://${base.slice('ws://'.length)}`;
  if (base.startsWith('http://') || base.startsWith('https://')) return base;
  return `https://${base}`;
}
