import { useCallback, useEffect, useRef, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';
import { AlmanacModal } from './components/AlmanacModal';
import { CraftModal } from './components/CraftModal';
import { ForceUpdateModal } from './components/ForceUpdateModal';
import { FutureMessageModal } from './components/FutureMessageModal';
import { GameHUD, type HudSnapshot, type RoomHudState } from './components/GameHUD';
import { MissionsModal } from './components/MissionsModal';
import { NasaObservatoryModal } from './components/NasaObservatoryModal';
import { NetDebugPanel } from './components/NetDebugPanel';
import { OfflineBanner } from './components/PWAInstallButton';
import { RoomsModal } from './components/RoomsModal';
import { ShopModal } from './components/ShopModal';
import { StatusModal } from './components/StatusModal';
import { TitleScreen } from './components/TitleScreen';
import { TouchControls } from './components/TouchControls';
import { audioEngine } from './game/audio';
import { initNetDebugGlobal, netDebug } from './game/netDebug';
import {
  performInPlaceUpdate,
  startupVersionChecker,
  type DeltaUpdateProgress,
  type VersionCheckStatus,
  type VersionManifest,
} from './game/version';
import {
  buildStatusAnnouncement,
  describeTileForBlind,
  getFacingTileCoords,
  getInitialBlindMode,
  getSmartGuidance,
  getTileSignatureForBlind,
  getTitleGuidanceText,
  saveBlindModePreference,
  speakAccessibility,
  stopAccessibilitySpeech,
} from './game/blindAssist';
import {
  DAY_END_MINUTES,
  FARMHOUSE_DOOR,
  FARMHOUSE_POS,
  GAME_MINUTES_PER_REAL_SECOND,
  ITEMS,
  NIGHT_START_MINUTES,
  SHIPPING_BIN_POS,
  SHOP_STALL_POS,
  TILE_SIZE,
  WELL_POS,
} from './game/constants';
import {
  BADGE_TEXT,
  formatFeedbackMessage,
  formatMorningSummaryText,
  getInitialLanguage,
  getItemLabel,
  getLanguageSwitchMessage,
  saveLanguagePreference,
  translateWeather,
  UI_TEXT,
  type Language,
} from './game/i18n';
import { EcoGrowScene3D, type CameraState, type LocalPlayerRenderMeta } from './game/three/EcoGrowScene3D';
import {
  getOrCreateClientId,
  resolveHttpApiBase,
  resolveWebSocketUrl,
  saveMultiplayerServerUrl,
  type ChatMessage,
  type ClientToServerMessage,
  type CoopEmote,
  type FxPayload,
  type GameMode,
  type RemotePlayerState,
  type RoomSummary,
  type ServerToClientMessage,
  type VoicePeerState,
} from './game/multiplayer';
import { VoiceChatManager } from './game/voiceChat';
import {
  advanceDay,
  buyDairyCow,
  buyFarmChicken,
  buyFluffySheep,
  buyGuardDog,
  buyShopItem,
  claimMissionReward,
  computeFarmRestorationPercent,
  craftItem,
  createInitialFarmState,
  eatCrop,
  formatTimeClock,
  fulfillDailyOrder,
  generateDailyOrder,
  getClaimableMissionsCount,
  getDayOfSeason,
  getEarnedBadges,
  getSeason,
  getTile,
  getTimePhase,
  isNearFarmhouse,
  isNearShippingBin,
  isNearShopStall,
  isNearWell,
  isTileWalkable,
  performTileAction,
  rollDailyNatureTreasure,
  rollMarketSurgeCrop,
  sellCropItem,
  spawnNightWildlife,
  stepChickens,
  stepLivestockAndDog,
  stepWildlife,
  triggerMiddayDrought,
  triggerMiddayHeatwave,
  upgradeTool,
  type ActionFeedback,
} from './game/rules';
import type {
  DaySummary,
  FloatingText,
  FutureDispatch,
  GamePhase,
  GameWorldState,
  ItemId,
  MissionId,
  Particle,
  PlaceableType,
  ToolType,
} from './game/types';

const SAVE_KEY = 'ecogrow_mission_save_v1';
const LEGACY_SAVE_KEY = 'willowvale_homestead_save_v1';
const PARTICLE_POOL_SIZE = 160;

function createParticlePool(): Particle[] {
  return Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
    active: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    maxLife: 1,
    size: 3,
    color: '#ffffff',
    gravity: 0,
  }));
}

function buildHudSnapshot(world: GameWorldState): HudSnapshot {
  let nearPrompt: HudSnapshot['nearPrompt'] = null;
  if (isNearFarmhouse(world)) {
    nearPrompt = { action: 'sleep', label: '[E] Rest in Farmhouse (Next Day)' };
  } else if (isNearShopStall(world)) {
    nearPrompt = { action: 'shop', label: '[E] Open Village Market Stall' };
  } else if (isNearWell(world)) {
    nearPrompt = { action: 'well', label: '[E] Refill Watering Can' };
  } else if (isNearShippingBin(world)) {
    nearPrompt = { action: 'bin', label: '[E] Sell Harvested Crops' };
  }

  return {
    health: world.player.health,
    maxHealth: world.player.maxHealth,
    stamina: world.player.stamina,
    maxStamina: world.player.maxStamina,
    waterLevel: world.player.waterLevel,
    maxWaterLevel: world.player.maxWaterLevel,
    gold: world.player.gold,
    level: world.level ?? 1,
    xp: world.xp ?? 0,
    day: world.day,
    dayOfSeason: getDayOfSeason(world.day),
    season: getSeason(world.seasonIndex),
    timeMinutes: world.timeMinutes,
    timeClock: formatTimeClock(world.timeMinutes),
    timePhase: getTimePhase(world.timeMinutes),
    weather: world.weather,
    restorationPct: computeFarmRestorationPercent(world),
    claimableMissions: getClaimableMissionsCount(world),
    hotbar: [...world.hotbar],
    selectedHotbarIndex: world.player.selectedHotbarIndex,
    inventory: { ...world.inventory },
    nearPrompt,
    lowStamina: world.player.stamina <= 15,
    nightWarning: world.timeMinutes >= NIGHT_START_MINUTES && world.wildlife.length > 0,
  };
}

function loadSavedWorld(): GameWorldState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY) ?? localStorage.getItem(LEGACY_SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameWorldState;
    if (
      !parsed ||
      !Number.isFinite(parsed.width) ||
      !Number.isFinite(parsed.height) ||
      parsed.width <= 0 ||
      parsed.height <= 0 ||
      !Array.isArray(parsed.tiles) ||
      parsed.tiles.length !== parsed.width * parsed.height ||
      !parsed.player ||
      !Number.isFinite(parsed.player.x) ||
      !Number.isFinite(parsed.player.y)
    ) {
      return null;
    }

    const maxHealth =
      Number.isFinite(parsed.player.maxHealth) && parsed.player.maxHealth > 0
        ? parsed.player.maxHealth
        : 100;
    const maxStamina =
      Number.isFinite(parsed.player.maxStamina) && parsed.player.maxStamina > 0
        ? parsed.player.maxStamina
        : 100;
    const maxWaterLevel =
      Number.isFinite(parsed.player.maxWaterLevel) && parsed.player.maxWaterLevel > 0
        ? parsed.player.maxWaterLevel
        : 20;

    parsed.player = {
      ...parsed.player,
      maxHealth,
      health: Number.isFinite(parsed.player.health)
        ? Math.max(0, Math.min(maxHealth, parsed.player.health))
        : maxHealth,
      maxStamina,
      stamina: Number.isFinite(parsed.player.stamina)
        ? Math.max(0, Math.min(maxStamina, parsed.player.stamina))
        : maxStamina,
      maxWaterLevel,
      waterLevel: Number.isFinite(parsed.player.waterLevel)
        ? Math.max(0, Math.min(maxWaterLevel, parsed.player.waterLevel))
        : maxWaterLevel,
      gold: Number.isFinite(parsed.player.gold) ? Math.max(0, Math.floor(parsed.player.gold)) : 0,
      selectedHotbarIndex: Number.isFinite(parsed.player.selectedHotbarIndex)
        ? Math.max(0, Math.min(8, Math.floor(parsed.player.selectedHotbarIndex)))
        : 0,
      facingX: Number.isFinite(parsed.player.facingX) ? parsed.player.facingX : 0,
      facingY: Number.isFinite(parsed.player.facingY) ? parsed.player.facingY : 1,
      walkCycle: Number.isFinite(parsed.player.walkCycle) ? parsed.player.walkCycle : 0,
      swingTimer: 0,
      swingTool: null,
      hitFlashTimer: 0,
    };

    const rawHotbar = Array.isArray(parsed.hotbar) ? parsed.hotbar : [];
    parsed.hotbar = Array.from({ length: 9 }, (_, i) => {
      const candidate = rawHotbar[i];
      return candidate && ITEMS[candidate] ? candidate : null;
    });
    if (!parsed.hotbar.includes('hoe')) parsed.hotbar[0] = 'hoe';
    if (!parsed.hotbar.includes('watering_can')) parsed.hotbar[1] = 'watering_can';
    if (!parsed.hotbar.includes('axe')) parsed.hotbar[2] = 'axe';

    const cleanInventory: Partial<Record<ItemId, number>> = {};
    if (parsed.inventory && typeof parsed.inventory === 'object') {
      for (const [k, v] of Object.entries(parsed.inventory)) {
        const id = k as ItemId;
        if (ITEMS[id] && typeof v === 'number' && Number.isFinite(v) && v > 0) {
          cleanInventory[id] = Math.floor(v);
        }
      }
    }
    cleanInventory.hoe = 1;
    cleanInventory.watering_can = 1;
    cleanInventory.axe = 1;
    parsed.inventory = cleanInventory;

    if (!parsed.upgrades) {
      parsed.upgrades = { hoeLevel: 1, canLevel: 1, axeLevel: 1 };
    }
    if (!Array.isArray(parsed.wildlife)) parsed.wildlife = [];
    if (!Array.isArray(parsed.claimedMissions)) parsed.claimedMissions = [];
    if (!Array.isArray(parsed.chickens)) parsed.chickens = [];
    if (!Array.isArray(parsed.cows)) parsed.cows = [];
    if (!Array.isArray(parsed.sheep)) parsed.sheep = [];
    if (parsed.dog === undefined) parsed.dog = null;
    if (!Array.isArray(parsed.discoveredItems)) {
      parsed.discoveredItems = ['wheat_seed', 'carrot_seed'];
    }
    parsed.day = Number.isFinite(parsed.day) && parsed.day >= 1 ? Math.floor(parsed.day) : 1;
    parsed.seasonIndex =
      Number.isFinite(parsed.seasonIndex) && parsed.seasonIndex >= 0
        ? Math.floor(parsed.seasonIndex) % 4
        : 0;
    parsed.timeMinutes = Number.isFinite(parsed.timeMinutes) ? parsed.timeMinutes : 360;
    parsed.outcome =
      parsed.outcome === 'exhausted' || parsed.outcome === 'restored' ? parsed.outcome : 'none';
    parsed.xp = typeof parsed.xp === 'number' && Number.isFinite(parsed.xp) && parsed.xp >= 0 ? parsed.xp : 0;
    parsed.level =
      typeof parsed.level === 'number' && Number.isFinite(parsed.level) && parsed.level >= 1
        ? parsed.level
        : 1;
    parsed.marketSurgeCrop = parsed.marketSurgeCrop ?? rollMarketSurgeCrop(parsed.day);
    parsed.rainbowActive = parsed.rainbowActive ?? false;
    parsed.wishedToday = parsed.wishedToday ?? false;
    parsed.pettedAnimalsToday = Array.isArray(parsed.pettedAnimalsToday)
      ? parsed.pettedAnimalsToday.filter((v): v is string => typeof v === 'string')
      : [];
    if (parsed.dailyTreasure === undefined) {
      parsed.dailyTreasure = rollDailyNatureTreasure(
        parsed.tiles,
        getSeason(parsed.seasonIndex),
        () => ((parsed.day * 37) % 100) / 100
      );
    } else if (
      parsed.dailyTreasure !== null &&
      (typeof parsed.dailyTreasure !== 'object' ||
        !Number.isInteger(parsed.dailyTreasure.x) ||
        !Number.isInteger(parsed.dailyTreasure.y) ||
        (parsed.dailyTreasure.kind !== 'clover' &&
          parsed.dailyTreasure.kind !== 'mushroom' &&
          parsed.dailyTreasure.kind !== 'frost_bloom'))
    ) {
      parsed.dailyTreasure = null;
    }
    parsed.lastFishMs = 0;
    parsed.stats = {
      daysSurvived: parsed.stats?.daysSurvived ?? 1,
      cropsHarvested: parsed.stats?.cropsHarvested ?? 0,
      totalGoldEarned: parsed.stats?.totalGoldEarned ?? 0,
      wildlifeRepelled: parsed.stats?.wildlifeRepelled ?? 0,
      obstaclesCleared: parsed.stats?.obstaclesCleared ?? 0,
      seedsPlanted: parsed.stats?.seedsPlanted ?? 0,
      cropsWatered: parsed.stats?.cropsWatered ?? 0,
      defensesPlaced: parsed.stats?.defensesPlaced ?? 0,
      sprinklersPlaced: parsed.stats?.sprinklersPlaced ?? 0,
      sensorsPlaced: parsed.stats?.sensorsPlaced ?? 0,
      eggsCollected: parsed.stats?.eggsCollected ?? 0,
      honeyCollected: parsed.stats?.honeyCollected ?? 0,
      milkCollected: parsed.stats?.milkCollected ?? 0,
      woolCollected: parsed.stats?.woolCollected ?? 0,
      fishCaught: parsed.stats?.fishCaught ?? 0,
      artisanProduced: parsed.stats?.artisanProduced ?? 0,
      wishesMade: parsed.stats?.wishesMade ?? 0,
      ordersCompleted: parsed.stats?.ordersCompleted ?? 0,
      treasuresFound: parsed.stats?.treasuresFound ?? 0,
      nasaStationsPlaced: parsed.stats?.nasaStationsPlaced ?? 0,
      beansHarvested: parsed.stats?.beansHarvested ?? 0,
      rainwaterCollectedLiters: parsed.stats?.rainwaterCollectedLiters ?? 0,
      waterSavedLiters: parsed.stats?.waterSavedLiters ?? 0,
      heatwavesSurvivedWithShade: parsed.stats?.heatwavesSurvivedWithShade ?? 0,
    };
    parsed.rotationYieldProgress = parsed.rotationYieldProgress ?? 0;
    parsed.forecastWeather = parsed.forecastWeather ?? parsed.weather;
    parsed.dailyOrder =
      parsed.dailyOrder ?? generateDailyOrder(parsed.day, getSeason(parsed.seasonIndex));
    parsed.harvestCombo = 0;
    parsed.lastHarvestMs = 0;
    return parsed;
  } catch {
    return null;
  }
}

export default function App() {
  const autostart =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('autostart') === '1';

  const initialWorldRef = useRef<GameWorldState>(
    (autostart ? loadSavedWorld() : null) ?? createInitialFarmState(42)
  );
  const worldRef = useRef<GameWorldState>(initialWorldRef.current);

  const initialInviteCode =
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('room') ?? '').trim().toUpperCase()
      : '';

  const [phase, setPhase] = useState<GamePhase>(autostart && !initialInviteCode ? 'playing' : 'title');
  const [hasSavedFarm, setHasSavedFarm] = useState<boolean>(() => Boolean(loadSavedWorld()));
  const [activeModal, setActiveModal] = useState<'none' | 'shop' | 'craft' | 'missions' | 'nasa' | 'almanac'>('none');
  const [shopInitialTab, setShopInitialTab] = useState<'seeds' | 'sell' | 'upgrades'>('seeds');
  const [futureDispatch, setFutureDispatch] = useState<FutureDispatch | null>(null);
  const [muted, setMuted] = useState<boolean>(false);
  const [lang, setLang] = useState<Language>(() => getInitialLanguage());
  const [touchControlsEnabled, setTouchControlsEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768 ||
      window.innerHeight < 520
    );
  });
  const touchManualOverrideRef = useRef<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(
    () => typeof document !== 'undefined' && Boolean(document.fullscreenElement)
  );
  const [isPortraitMobile, setIsPortraitMobile] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const mobileLike =
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768;
    return mobileLike && window.innerWidth < window.innerHeight && window.innerWidth < 768;
  });
  const [morningSummary, setMorningSummary] = useState<DaySummary | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(() => buildHudSnapshot(worldRef.current));
  const [sprintActive, setSprintActive] = useState<boolean>(false);
  const [blindMode, setBlindMode] = useState<boolean>(() => getInitialBlindMode());
  const [blindCaption, setBlindCaption] = useState<string>('');
  const [gameMode, setGameMode] = useState<GameMode>('singleplayer');
  const [showRoomsModal, setShowRoomsModal] = useState<boolean>(() => Boolean(initialInviteCode));
  const [inviteRoomCode] = useState<string>(() => initialInviteCode);
  const [roomsLoading, setRoomsLoading] = useState<boolean>(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [publicRooms, setPublicRooms] = useState<RoomSummary[]>([]);
  const [roomHud, setRoomHud] = useState<RoomHudState | null>(null);
  const [chatOpen, setChatOpen] = useState<boolean>(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [showNetDebug, setShowNetDebug] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('netdebug') === '1';
  });
  const [voiceLocal, setVoiceLocal] = useState<{
    enabled: boolean;
    muted: boolean;
    speaking: boolean;
    deafened: boolean;
    hasMic: boolean;
    notice: string | null;
    locallyMutedPeers: string[];
  }>({
    enabled: false,
    muted: false,
    speaking: false,
    deafened: false,
    hasMic: false,
    notice: null,
    locallyMutedPeers: [],
  });

  const [versionStatus, setVersionStatus] = useState<VersionCheckStatus>('checking');
  const [versionManifest, setVersionManifest] = useState<VersionManifest | null>(null);
  const [versionChecking, setVersionChecking] = useState<boolean>(false);
  const [versionUpdating, setVersionUpdating] = useState<boolean>(false);
  const [versionUpdateProgress, setVersionUpdateProgress] = useState<DeltaUpdateProgress | null>(null);
  const [versionUpdateError, setVersionUpdateError] = useState<string | null>(null);
  const [versionRecheckOffline, setVersionRecheckOffline] = useState<boolean>(false);
  const [versionNextRetryAtMs, setVersionNextRetryAtMs] = useState<number>(0);
  const [versionCooldownSec, setVersionCooldownSec] = useState<number>(0);

  const phaseRef = useRef<GamePhase>(phase);
  const modalRef = useRef<'none' | 'shop' | 'craft' | 'missions' | 'nasa' | 'almanac'>(activeModal);
  const futureOpenRef = useRef<boolean>(false);
  const langRef = useRef<Language>(lang);
  const blindModeRef = useRef<boolean>(blindMode);
  const sprintActiveRef = useRef<boolean>(sprintActive);
  const gameModeRef = useRef<GameMode>(gameMode);
  const showRoomsModalRef = useRef<boolean>(showRoomsModal);
  const chatOpenRef = useRef<boolean>(chatOpen);
  const roomHudRef = useRef<RoomHudState | null>(roomHud);
  const versionRequiredRef = useRef<boolean>(false);
  const voiceStatesRef = useRef<Record<string, VoicePeerState>>({});
  const voiceManagerRef = useRef<VoiceChatManager | null>(null);
  const voiceNoticeTimerRef = useRef<number | null>(null);
  const remotePlayersRef = useRef<RemotePlayerState[]>([]);
  const remoteTargetPlayersRef = useRef<RemotePlayerState[]>([]);
  const localPlayerMetaRef = useRef<LocalPlayerRenderMeta | undefined>(undefined);
  const activeEmotesRef = useRef<Record<string, { text: string; expiresAt: number }>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomRef = useRef<{ code: string; playerName: string; serverUrl?: string } | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const connectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef<number>(0);
  const lastMoveSentAtRef = useRef<number>(0);
  const lastMoveWasMovingRef = useRef<boolean>(false);
  const lastSentMoveRef = useRef<{ x: number; y: number; fx: number; fy: number; slot: number } | null>(null);
  const roomsReqIdRef = useRef<number>(0);
  const earnedBadgesRef = useRef<Set<string>>(new Set(getEarnedBadges(worldRef.current)));
  const lastSpokenTileRef = useRef<string>('');
  const lastMoveSpeakAtRef = useRef<number>(0);
  const lastBumpSpeakAtRef = useRef<number>(0);
  phaseRef.current = phase;
  modalRef.current = activeModal;
  futureOpenRef.current = Boolean(futureDispatch);
  langRef.current = lang;
  blindModeRef.current = blindMode;
  sprintActiveRef.current = sprintActive;
  gameModeRef.current = gameMode;
  showRoomsModalRef.current = showRoomsModal;
  chatOpenRef.current = chatOpen;
  roomHudRef.current = roomHud;
  const updateRequired = versionStatus === 'update_required' && Boolean(versionManifest);
  versionRequiredRef.current = updateRequired;

  const scene3dRef = useRef<EcoGrowScene3D | null>(null);
  const orbitDragRef = useRef<{ active: boolean; lastX: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const keysPressedRef = useRef<Set<string>>(new Set());
  const joystickRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const handleJoystickVector = useCallback((vx: number, vy: number) => {
    joystickRef.current.x = vx;
    joystickRef.current.y = vy;
  }, []);
  const hoverTileRef = useRef<{ x: number; y: number } | null>(null);
  const cameraRef = useRef<CameraState>({
    x: worldRef.current.player.x * TILE_SIZE,
    y: worldRef.current.player.y * TILE_SIZE,
    zoom: 2,
    shakeX: 0,
    shakeY: 0,
  });
  const traumaRef = useRef<number>(0);
  const particlesRef = useRef<Particle[]>(createParticlePool());
  const particleCursorRef = useRef<number>(0);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const nextFloatingIdRef = useRef<number>(1);
  const elapsedRef = useRef<number>(0);
  const wildlifeSpawnTimerRef = useRef<number>(4);

  const announceBlind = useCallback((text: string, interrupt = true) => {
    if (!text) return;
    setBlindCaption(text);
    if (blindModeRef.current) {
      speakAccessibility(text, langRef.current, { interrupt });
    }
  }, []);

  const toggleBlindMode = useCallback(() => {
    setBlindMode((prev) => {
      const next = !prev;
      saveBlindModePreference(next);
      blindModeRef.current = next;
      if (next) {
        audioEngine.playBlindCue('toggle_on');
        const msg =
          phaseRef.current === 'title'
            ? getTitleGuidanceText(langRef.current)
            : buildStatusAnnouncement(worldRef.current, langRef.current);
        setBlindCaption(msg);
        speakAccessibility(msg, langRef.current, { interrupt: true });
      } else {
        audioEngine.playBlindCue('toggle_off');
        stopAccessibilitySpeech();
        setBlindCaption('');
      }
      return next;
    });
  }, []);

  const handleBlindScan = useCallback(() => {
    const world = worldRef.current;
    const { tx, ty } = getFacingTileCoords(world);
    const desc = describeTileForBlind(world, tx, ty, langRef.current);
    if (desc.cue === 'crop_ripe') audioEngine.playBlindCue('ripe');
    else if (desc.cue === 'crop_need_water') audioEngine.playBlindCue('dry');
    else if (desc.cue === 'danger') audioEngine.playBlindCue('danger');
    else if (desc.cue === 'obstacle') audioEngine.playBlindCue('bump');
    else audioEngine.playBlindCue('scan');

    const guide = getSmartGuidance(world, langRef.current);
    const prefix = langRef.current === 'ar' ? 'أمامك: ' : 'Ahead: ';
    announceBlind(`${prefix}${desc.text}. ${guide.text}`, true);
  }, [announceBlind]);

  const handleBlindGuide = useCallback(() => {
    const guide = getSmartGuidance(worldRef.current, langRef.current);
    audioEngine.playBlindCue(guide.targetType === 'wildlife' ? 'danger' : 'beacon');
    announceBlind(guide.text, true);
  }, [announceBlind]);

  const handleBlindStatus = useCallback(() => {
    audioEngine.playBlindCue('scan');
    const summary = buildStatusAnnouncement(worldRef.current, langRef.current);
    announceBlind(summary, true);
  }, [announceBlind]);

  // Register PWA Service Worker in production builds; clean up any stale dev SW in development
  useEffect(() => {
    if (window.location.protocol !== 'http:' && window.location.protocol !== 'https:') return;
    if (import.meta.env.PROD) {
      registerSW({ immediate: true });
      return;
    }
    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.getRegistrations().then((regs) => {
        for (const reg of regs) {
          void reg.unregister();
        }
      });
    }
    if ('caches' in window) {
      void caches.keys().then((keys) => {
        for (const key of keys) {
          if (key.includes('workbox')) {
            void caches.delete(key);
          }
        }
      });
    }
  }, []);

  // Sync HTML lang attribute
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const selectLanguage = useCallback((next: Language) => {
    setLang(next);
    saveLanguagePreference(next);
    if (blindModeRef.current) {
      const msg = getLanguageSwitchMessage(next);
      setBlindCaption(msg);
      speakAccessibility(msg, next, { interrupt: true });
    }
  }, []);

  // Dynamically detect mobile/tablet viewport or touch input + portrait orientation
  useEffect(() => {
    const isTouchEnv = () =>
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768 ||
      window.innerHeight < 520;

    const syncTouchDetection = () => {
      const mobileNow = isTouchEnv();
      setIsPortraitMobile(
        (window.matchMedia('(pointer: coarse)').matches ||
          navigator.maxTouchPoints > 0 ||
          window.innerWidth < 768) &&
          window.innerWidth < window.innerHeight &&
          window.innerWidth < 768
      );
      if (touchManualOverrideRef.current) return;
      setTouchControlsEnabled(mobileNow);
    };
    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch' && !touchManualOverrideRef.current) {
        setTouchControlsEnabled(true);
      }
    };
    const syncFullscreen = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    syncTouchDetection();
    window.addEventListener('resize', syncTouchDetection);
    window.addEventListener('orientationchange', syncTouchDetection);
    window.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('fullscreenchange', syncFullscreen);
    return () => {
      window.removeEventListener('resize', syncTouchDetection);
      window.removeEventListener('orientationchange', syncTouchDetection);
      window.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('fullscreenchange', syncFullscreen);
    };
  }, []);

  const requestOptimalDisplay = useCallback(async (lockLandscape: boolean) => {
    const win = window as Window & { electronAPI?: { toggleFullscreen?: () => void } };
    if (win.electronAPI?.toggleFullscreen) return; // Electron EXE already launches fullscreen
    try {
      const el = document.documentElement;
      if (!document.fullscreenElement && el.requestFullscreen) {
        await el.requestFullscreen();
      }
    } catch {
      // Browser/iframe may disallow automatic fullscreen; fail silently
    }
    if (lockLandscape) {
      try {
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (type: string) => Promise<void>;
        };
        await orientation?.lock?.('landscape');
      } catch {
        // Ignore on unsupported browsers
      }
    }
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const win = window as Window & { electronAPI?: { toggleFullscreen?: () => void } };
    if (win.electronAPI?.toggleFullscreen) {
      win.electronAPI.toggleFullscreen();
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen?.();
      } else {
        await document.documentElement.requestFullscreen?.();
        const isMobile =
          window.matchMedia('(pointer: coarse)').matches ||
          navigator.maxTouchPoints > 0 ||
          window.innerWidth < 768;
        if (isMobile) {
          const orientation = screen.orientation as ScreenOrientation & {
            lock?: (type: string) => Promise<void>;
          };
          await orientation?.lock?.('landscape').catch(() => {});
        }
      }
    } catch {
      // Ignore fullscreen denial in restricted iframes
    }
  }, []);

  // Sync document.body.dataset.state for state machine & verification
  useEffect(() => {
    document.body.dataset.state = phase;
    if (phase !== 'playing') {
      joystickRef.current.x = 0;
      joystickRef.current.y = 0;
    }
  }, [phase]);

  const spawnParticleBurst = useCallback(
    (wx: number, wy: number, color: string, count: number, speed = 42, gravity = 60) => {
      const pool = particlesRef.current;
      for (let i = 0; i < count; i++) {
        const p = pool[particleCursorRef.current];
        particleCursorRef.current = (particleCursorRef.current + 1) % PARTICLE_POOL_SIZE;
        const angle = Math.random() * Math.PI * 2;
        const spd = (0.35 + Math.random() * 0.75) * speed;
        p.active = true;
        p.x = wx;
        p.y = wy;
        p.vx = Math.cos(angle) * spd;
        p.vy = Math.sin(angle) * spd - 16;
        p.life = 0.35 + Math.random() * 0.35;
        p.maxLife = p.life;
        p.size = 2 + Math.floor(Math.random() * 3);
        p.color = color;
        p.gravity = gravity;
      }
    },
    []
  );

  const addFloatingText = useCallback((wx: number, wy: number, text: string, color = '#fdf3dc') => {
    if (floatingTextsRef.current.length >= 32) {
      floatingTextsRef.current.splice(0, floatingTextsRef.current.length - 31);
    }
    floatingTextsRef.current.push({
      id: nextFloatingIdRef.current++,
      x: wx,
      y: wy,
      text,
      color,
      life: 1.15,
      maxLife: 1.15,
    });
  }, []);

  const syncHud = useCallback(() => {
    setHud(buildHudSnapshot(worldRef.current));
  }, []);

  const saveFarm = useCallback(() => {
    if (gameModeRef.current !== 'singleplayer') return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(worldRef.current));
      setHasSavedFarm(true);
    } catch {
      // Ignore storage quota errors gracefully
    }
  }, []);

  const checkNewBadges = useCallback(() => {
    const world = worldRef.current;
    const currentBadges = getEarnedBadges(world);
    const newlyUnlocked = currentBadges.filter((b) => !earnedBadgesRef.current.has(b));
    if (newlyUnlocked.length === 0) return;
    for (const badgeId of newlyUnlocked) {
      earnedBadgesRef.current.add(badgeId);
      const badgeTitle = BADGE_TEXT[badgeId][langRef.current].title;
      addFloatingText(
        world.player.x * TILE_SIZE,
        (world.player.y - 1.3) * TILE_SIZE,
        `${UI_TEXT[langRef.current].badgeUnlockedToast} ${badgeTitle}`,
        '#ffe473'
      );
      if (blindModeRef.current) {
        announceBlind(`${UI_TEXT[langRef.current].badgeUnlockedToast} ${badgeTitle}`, false);
      }
    }
  }, [addFloatingText, announceBlind]);

  const sendWs = useCallback((msg: ClientToServerMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      const encoded = JSON.stringify(msg);
      ws.send(encoded);
      netDebug.recordTx(msg.type, encoded.length, ws.bufferedAmount);
    }
  }, []);

  const triggerEmote = useCallback(
    (emote: CoopEmote) => {
      const myId = gameModeRef.current === 'multiplayer' ? getOrCreateClientId() : '__local__';
      activeEmotesRef.current[myId] = {
        text: emote,
        expiresAt: Date.now() + 2800,
      };
      audioEngine.playSfx(emote === '❤️' ? 'pet' : 'click');
      if (gameModeRef.current === 'multiplayer') {
        sendWs({ type: 'action:emote', emote });
      }
    },
    [sendWs]
  );

  const sendNetPing = useCallback(() => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    const seq = netDebug.allocatePingSeq();
    const clientSentAt = Date.now();
    const payload: ClientToServerMessage = { type: 'net:ping', seq, clientSentAt };
    const encoded = JSON.stringify(payload);
    ws.send(encoded);
    netDebug.recordTx(payload.type, encoded.length, ws.bufferedAmount);
    netDebug.recordPingSent(seq, clientSentAt);
    return true;
  }, []);

  const triggerManualNetPing = useCallback(async () => {
    sendNetPing();
    await netDebug.probeHttp(activeRoomRef.current?.serverUrl);
  }, [sendNetPing]);

  useEffect(() => {
    initNetDebugGlobal();
    netDebug.setUiHandler((visible) => {
      if (visible === 'toggle') setShowNetDebug((prev) => !prev);
      else setShowNetDebug(visible);
    });
    netDebug.setManualPingHandler(triggerManualNetPing);
    return () => {
      netDebug.setUiHandler(null);
      netDebug.setManualPingHandler(null);
    };
  }, [triggerManualNetPing]);

  useEffect(() => {
    if (gameMode !== 'multiplayer' && !showNetDebug) return;
    if (gameMode === 'multiplayer') {
      sendNetPing();
    }
    const id = window.setInterval(() => {
      const ws = wsRef.current;
      netDebug.syncSocketState(ws);
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendNetPing();
      }
    }, 2000);
    return () => {
      window.clearInterval(id);
    };
  }, [gameMode, sendNetPing, showNetDebug]);

  const showVoiceNotice = useCallback((text: string) => {
    if (voiceNoticeTimerRef.current !== null) {
      window.clearTimeout(voiceNoticeTimerRef.current);
      voiceNoticeTimerRef.current = null;
    }
    setVoiceLocal((prev) => ({ ...prev, notice: text }));
    voiceNoticeTimerRef.current = window.setTimeout(() => {
      voiceNoticeTimerRef.current = null;
      setVoiceLocal((prev) => (prev.notice === text ? { ...prev, notice: null } : prev));
    }, 6000);
  }, []);

  const getVoiceManager = useCallback((): VoiceChatManager => {
    if (!voiceManagerRef.current) {
      voiceManagerRef.current = new VoiceChatManager({
        onSendSignal: (targetId, signal) => {
          sendWs({ type: 'voice:signal', targetId, signal });
        },
        onStateChange: (st) => {
          setVoiceLocal((prev) => ({
            ...prev,
            enabled: st.enabled,
            muted: st.muted,
            speaking: st.speaking,
            deafened: st.deafened,
            hasMic: st.hasMic,
          }));
          if (localPlayerMetaRef.current) {
            localPlayerMetaRef.current = {
              ...localPlayerMetaRef.current,
              voice: {
                enabled: st.enabled,
                muted: st.muted,
                speaking: st.speaking,
              },
            };
          }
          sendWs({
            type: 'voice:state',
            enabled: st.enabled,
            muted: st.muted,
            speaking: st.speaking,
          });
        },
        onNotice: (code) => {
          const t = UI_TEXT[langRef.current];
          if (code === 'UNSUPPORTED') showVoiceNotice(t.voiceErrorUnsupported);
          else if (code === 'LISTEN_ONLY') showVoiceNotice(t.voiceListenOnlyToast);
          else showVoiceNotice(t.voiceErrorPermission);
        },
      });
    }
    return voiceManagerRef.current;
  }, [sendWs, showVoiceNotice]);

  useEffect(() => {
    return () => {
      if (voiceNoticeTimerRef.current !== null) {
        window.clearTimeout(voiceNoticeTimerRef.current);
      }
      voiceManagerRef.current?.leave();
    };
  }, []);

  const handleJoinOrToggleVoiceMic = useCallback(async () => {
    if (gameModeRef.current !== 'multiplayer' || !roomHudRef.current) return;
    const mgr = getVoiceManager();
    audioEngine.playSfx('click');
    if (!mgr.isEnabled()) {
      const myId = getOrCreateClientId();
      const activePeers = Object.entries(voiceStatesRef.current)
        .filter(([id, s]) => id !== myId && s.enabled)
        .map(([id]) => id);
      await mgr.join(myId, activePeers);
    } else {
      await mgr.toggleMute();
    }
  }, [getVoiceManager]);

  const handleLeaveVoice = useCallback(() => {
    audioEngine.playSfx('click');
    voiceManagerRef.current?.leave();
  }, []);

  const handleToggleVoiceDeafen = useCallback(() => {
    audioEngine.playSfx('click');
    voiceManagerRef.current?.toggleDeafen();
  }, []);

  const handleTogglePeerVoiceMute = useCallback((peerId: string) => {
    const mgr = voiceManagerRef.current;
    if (!mgr) return;
    audioEngine.playSfx('click');
    const nowMuted = mgr.togglePeerMute(peerId);
    setVoiceLocal((prev) => {
      const next = new Set(prev.locallyMutedPeers);
      if (nowMuted) next.add(peerId);
      else next.delete(peerId);
      return { ...prev, locallyMutedPeers: Array.from(next) };
    });
  }, []);

  const handleServerFx = useCallback(
    (fx: FxPayload) => {
      const world = worldRef.current;
      const wx = fx.wx ?? world.player.x * TILE_SIZE;
      const wy = fx.wy ?? world.player.y * TILE_SIZE;

      if (fx.kind === 'day_advanced' && fx.daySummary) {
        setMorningSummary(fx.daySummary);
        if (fx.messageFrom2040) {
          setFutureDispatch(fx.messageFrom2040);
        }
        audioEngine.playSfx('morning');
        checkNewBadges();
        syncHud();
        return;
      }

      if (fx.kind === 'drought') {
        addFloatingText(world.player.x * TILE_SIZE, (world.player.y - 1) * TILE_SIZE, UI_TEXT[langRef.current].droughtHit, '#ffba6b');
        return;
      }

      if (fx.kind === 'heatwave') {
        addFloatingText(world.player.x * TILE_SIZE, (world.player.y - 1) * TILE_SIZE, UI_TEXT[langRef.current].heatwaveHit, '#fb923c');
        return;
      }

      if (fx.kind === 'crop_eaten') {
        spawnParticleBurst(wx, wy, '#7abf4b', 8);
        addFloatingText(wx, wy, langRef.current === 'ar' ? 'أُكل محصول!' : 'Crop eaten!', '#ff8c75');
        return;
      }

      if (fx.kind === 'dog_bark') {
        audioEngine.playSfx('bark');
        spawnParticleBurst(wx, wy, '#fde047', 6, 30);
        addFloatingText(wx, wy - 20, UI_TEXT[langRef.current].dogBarkToast, '#fde047');
        return;
      }

      if (fx.kind === 'hurt') {
        if (fx.actorId === getOrCreateClientId()) {
          traumaRef.current = Math.min(1, traumaRef.current + 0.55);
          audioEngine.playSfx('hurt');
        }
        addFloatingText(
          wx,
          wy,
          langRef.current === 'ar' ? `-${fx.dmg ?? 12} صحة` : `-${fx.dmg ?? 12} HP`,
          '#ff6666'
        );
        return;
      }

      if (fx.kind === 'well') {
        audioEngine.playSfx('refill');
        spawnParticleBurst(wx, wy, '#77c8f2', 10);
        addFloatingText(wx, wy - 12, langRef.current === 'ar' ? 'تمت تعبئة المرش' : 'Can Refilled', '#9ee0ff');
        return;
      }

      if (fx.kind === 'toast') {
        if (fx.sfx) audioEngine.playSfx(fx.sfx as Parameters<typeof audioEngine.playSfx>[0], fx.sfxArg);
        if (fx.text) addFloatingText(wx, wy, fx.text, fx.textColor ?? '#ffe473');
        if (fx.leveledUpTo) {
          audioEngine.playSfx('levelup');
          const lvlMsg = UI_TEXT[langRef.current].levelUpToast.replace('{n}', String(fx.leveledUpTo));
          addFloatingText(wx, wy - 18, lvlMsg, '#fde047');
        }
        return;
      }

      if (fx.kind === 'emote' && fx.actorId && fx.text) {
        activeEmotesRef.current[fx.actorId] = {
          text: fx.text,
          expiresAt: Date.now() + 2800,
        };
        if (fx.actorId !== getOrCreateClientId()) {
          audioEngine.playSfx(fx.text === '❤️' ? 'pet' : 'click');
        }
        return;
      }

      if (fx.kind === 'tile') {
        if (fx.actorId && fx.actorId !== getOrCreateClientId() && fx.actionKind !== 'error') {
          const rp = remotePlayersRef.current.find((p) => p.id === fx.actorId);
          if (rp) {
            rp.swingTimer = 0.22;
            rp.swingTool = fx.swingTool ?? null;
          }
        }
        const resMsg = formatFeedbackMessage(
          {
            performed: fx.actionKind !== 'error',
            kind: (fx.actionKind as ActionFeedback['kind']) ?? 'none',
            message: fx.actionMessage,
            cropHarvested: fx.cropHarvested as Parameters<typeof formatFeedbackMessage>[0]['cropHarvested'],
            goldenBonus: fx.goldenBonus,
            rotationBoosted: fx.rotationBoosted,
            comboCount: fx.comboCount,
            comboGold: fx.comboGold,
          },
          langRef.current
        );
        if (fx.actionKind === 'error') {
          audioEngine.playSfx('error');
          if (resMsg) addFloatingText(wx, wy - 10, resMsg, '#ff9b85');
          return;
        }
        if (fx.actionKind === 'till') {
          audioEngine.playSfx('till');
          spawnParticleBurst(wx, wy, '#8a5a38', 7, 36);
        } else if (fx.actionKind === 'plant') {
          audioEngine.playSfx('plant');
          spawnParticleBurst(wx, wy, '#a7d66f', 5, 24);
        } else if (fx.actionKind === 'water' || fx.actionKind === 'refill') {
          audioEngine.playSfx('water');
          spawnParticleBurst(wx, wy, '#6ec5f5', 9, 40);
        } else if (fx.actionKind === 'harvest') {
          if ((fx.comboCount ?? 0) >= 2) {
            audioEngine.playSfx('combo', fx.comboCount);
            const comboMsg = UI_TEXT[langRef.current].comboToast
              .replace('{n}', String(fx.comboCount))
              .replace('{g}', String(fx.comboGold ?? 0));
            addFloatingText(wx, wy - 22, comboMsg, '#fde047');
          } else {
            audioEngine.playSfx('harvest');
          }
          spawnParticleBurst(wx, wy, '#ffe473', fx.goldenBonus ? 22 : 14, 52);
          if (resMsg) addFloatingText(wx, wy - 8, resMsg, '#ffe675');
        } else if (fx.actionKind === 'clear') {
          audioEngine.playSfx(fx.treasureFound ? 'treasure' : 'clear');
          spawnParticleBurst(wx, wy, fx.treasureFound ? '#fde047' : '#b59268', fx.treasureFound ? 16 : 9, 42);
          if (resMsg) addFloatingText(wx, wy - 8, resMsg, '#e8d7b7');
          if (fx.treasureFound) {
            const tText = fx.treasureFound.gold
              ? UI_TEXT[langRef.current].treasureGoldToast.replace('{g}', String(fx.treasureFound.gold))
              : UI_TEXT[langRef.current].treasureSeedToast.replace(
                  '{seed}',
                  getItemLabel(fx.treasureFound.seedId ?? 'carrot_seed', langRef.current).name
                );
            addFloatingText(wx, wy - 22, tText, '#fde047');
          }
        } else if (fx.actionKind === 'place' || fx.actionKind === 'repair') {
          audioEngine.playSfx('place');
          spawnParticleBurst(wx, wy, '#d6a56b', 6, 28);
          if (resMsg) addFloatingText(wx, wy - 8, resMsg, '#f7ebd4');
        } else if (fx.actionKind === 'defend') {
          audioEngine.playSfx('defend');
          spawnParticleBurst(wx, wy, '#ff9866', 10, 56);
          if (resMsg) addFloatingText(wx, wy - 8, resMsg, '#ffb694');
        } else if (fx.actionKind === 'fish') {
          audioEngine.playSfx('fish');
          spawnParticleBurst(wx, wy, '#38bdf8', 14, 48);
          if (resMsg) addFloatingText(wx, wy - 10, resMsg, '#7dd3fc');
        } else if (fx.actionKind === 'wish') {
          audioEngine.playSfx('wish');
          spawnParticleBurst(wx, wy, '#fde047', 16, 52);
          if (resMsg) addFloatingText(wx, wy - 12, resMsg, '#fef08a');
        } else if (fx.actionKind === 'fertilize') {
          audioEngine.playSfx('plant');
          spawnParticleBurst(wx, wy, '#4ade80', 10, 36);
          if (resMsg) addFloatingText(wx, wy - 8, resMsg, '#86efac');
        } else if (fx.actionKind === 'artisan') {
          audioEngine.playSfx('harvest');
          spawnParticleBurst(wx, wy, '#fbbf24', 12, 40);
          if (resMsg) addFloatingText(wx, wy - 10, resMsg, '#fde68a');
        } else if (fx.actionKind === 'pet') {
          audioEngine.playSfx(fx.actionMessage?.includes('Dog') ? 'bark' : 'pet');
          spawnParticleBurst(wx, wy - 6, '#f472b6', 10, 34);
          if (resMsg) addFloatingText(wx, wy - 12, resMsg, '#f9a8d4');
          syncHud();
        } else if (fx.actionKind === 'forage') {
          audioEngine.playSfx('treasure');
          spawnParticleBurst(wx, wy, '#fde047', 14, 46);
          if (resMsg) addFloatingText(wx, wy - 12, resMsg, '#fef08a');
          checkNewBadges();
          syncHud();
        }
        if (fx.leveledUpTo) {
          audioEngine.playSfx('levelup');
          const lvlMsg = UI_TEXT[langRef.current].levelUpToast.replace('{n}', String(fx.leveledUpTo));
          addFloatingText(wx, wy - 22, lvlMsg, '#fde047');
        }
      }
    },
    [addFloatingText, checkNewBadges, spawnParticleBurst, syncHud]
  );

  const disconnectMultiplayer = useCallback(
    (sendLeave = true, restoreSingleplayer = false) => {
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (connectTimeoutRef.current !== null) {
        window.clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      reconnectAttemptsRef.current = 0;
      activeRoomRef.current = null;
      lastSentMoveRef.current = null;
      lastMoveWasMovingRef.current = false;
      const ws = wsRef.current;
      wsRef.current = null;
      if (ws) {
        if (sendLeave && ws.readyState === WebSocket.OPEN) {
          try {
            ws.send(JSON.stringify({ type: 'room:leave' }));
          } catch {
            // Ignore
          }
        }
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
      }
      netDebug.recordDisconnected();
      voiceManagerRef.current?.leave();
      voiceStatesRef.current = {};
      if (voiceNoticeTimerRef.current !== null) {
        window.clearTimeout(voiceNoticeTimerRef.current);
        voiceNoticeTimerRef.current = null;
      }
      setVoiceLocal({
        enabled: false,
        muted: false,
        speaking: false,
        deafened: false,
        hasMic: false,
        notice: null,
        locallyMutedPeers: [],
      });
      remotePlayersRef.current = [];
      remoteTargetPlayersRef.current = [];
      localPlayerMetaRef.current = undefined;
      activeEmotesRef.current = {};
      setRoomHud(null);
      setChatOpen(false);
      setUnreadChatCount(0);
      gameModeRef.current = 'singleplayer';
      setGameMode('singleplayer');
      if (restoreSingleplayer) {
        const saved = loadSavedWorld();
        const singleWorld = saved ?? createInitialFarmState(42);
        setHasSavedFarm(Boolean(saved));
        worldRef.current = singleWorld;
        earnedBadgesRef.current = new Set(getEarnedBadges(singleWorld));
        cameraRef.current.x = singleWorld.player.x * TILE_SIZE;
        cameraRef.current.y = singleWorld.player.y * TILE_SIZE;
        floatingTextsRef.current = [];
        setMorningSummary(null);
        setFutureDispatch(null);
        syncHud();
      }
    },
    [syncHud]
  );

  const connectAndSendRoomAction = useCallback(
    (
      initialMsg: ClientToServerMessage,
      opts?: { serverUrl?: string; roomContext?: { code: string; playerName: string; serverUrl?: string } }
    ) => {
      if (versionRequiredRef.current) return;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (connectTimeoutRef.current !== null) {
        window.clearTimeout(connectTimeoutRef.current);
        connectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      setRoomsLoading(true);
      setRoomsError(null);

      let ws: WebSocket;
      const wsUrl = resolveWebSocketUrl(opts?.serverUrl);
      const httpBase = resolveHttpApiBase(opts?.serverUrl);
      netDebug.setEndpoint(wsUrl, httpBase);
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        netDebug.recordClosed(undefined, 'WebSocket constructor failed');
        setRoomsLoading(false);
        setRoomsError(UI_TEXT[langRef.current].roomErrorConnect);
        return;
      }
      wsRef.current = ws;
      netDebug.recordConnecting(ws, Boolean(opts?.roomContext && reconnectAttemptsRef.current > 0));

      connectTimeoutRef.current = window.setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          ws.onclose = null;
          ws.close();
          setRoomsLoading(false);
          if (!activeRoomRef.current) {
            setRoomsError(UI_TEXT[langRef.current].roomErrorTimeout);
          } else if (reconnectAttemptsRef.current >= 5) {
            disconnectMultiplayer(false, true);
            setActiveModal('none');
            setPhase('title');
            audioEngine.pauseAmbientMusic();
            setShowRoomsModal(true);
            setRoomsError(UI_TEXT[langRef.current].roomErrorClosed);
          }
        }
      }, 10_000);

      const syncRemoteTargets = (remotes: RemotePlayerState[], resetSmooth: boolean) => {
        remoteTargetPlayersRef.current = remotes;
        if (resetSmooth) {
          remotePlayersRef.current = remotes.map((r) => ({ ...r }));
          return;
        }
        const existingMap = new Map(remotePlayersRef.current.map((p) => [p.id, p]));
        remotePlayersRef.current = remotes.map((target) => {
          const prev = existingMap.get(target.id);
          if (!prev) return { ...target };
          return {
            ...target,
            x: prev.x,
            y: prev.y,
            swingTimer: Math.max(prev.swingTimer, target.swingTimer),
            swingTool: prev.swingTimer > target.swingTimer ? prev.swingTool : target.swingTool,
          };
        });
      };

      const applySyncedWorld = (
        serverWorld: GameWorldState,
        players: RemotePlayerState[],
        myId: string,
        preserveLocalPosition: boolean,
        teleportIds?: string[]
      ) => {
        const me = players.find((p) => p.id === myId);
        const prev = worldRef.current.player;
        const shouldTeleport =
          !preserveLocalPosition ||
          serverWorld.day !== worldRef.current.day ||
          Boolean(teleportIds?.includes(myId));
        if (me) {
          serverWorld.player.x = shouldTeleport ? me.x : prev.x;
          serverWorld.player.y = shouldTeleport ? me.y : prev.y;
          serverWorld.player.facingX = shouldTeleport ? me.facingX : prev.facingX;
          serverWorld.player.facingY = shouldTeleport ? me.facingY : prev.facingY;
          serverWorld.player.walkCycle = shouldTeleport ? me.walkCycle : prev.walkCycle;
          serverWorld.player.health = me.health;
          serverWorld.player.maxHealth = me.maxHealth;
          serverWorld.player.stamina = me.stamina;
          serverWorld.player.maxStamina = me.maxStamina;
          serverWorld.player.waterLevel = me.waterLevel;
          serverWorld.player.maxWaterLevel = me.maxWaterLevel;
          serverWorld.player.selectedHotbarIndex = prev.selectedHotbarIndex;
          localPlayerMetaRef.current = {
            name: me.name,
            colorIndex: me.colorIndex,
            voice: localPlayerMetaRef.current?.voice,
          };
        }
        worldRef.current = serverWorld;
        syncRemoteTargets(
          players.filter((p) => p.id !== myId),
          !preserveLocalPosition
        );
        syncHud();
      };

      ws.onopen = () => {
        if (connectTimeoutRef.current !== null) {
          window.clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        reconnectAttemptsRef.current = 0;
        netDebug.recordConnected(ws);
        const encoded = JSON.stringify(initialMsg);
        ws.send(encoded);
        netDebug.recordTx(initialMsg.type, encoded.length, ws.bufferedAmount);
      };

      ws.onmessage = (event) => {
        const rawText = String(event.data);
        let msg: ServerToClientMessage;
        try {
          msg = JSON.parse(rawText) as ServerToClientMessage;
        } catch {
          return;
        }
        netDebug.recordRx(msg.type, rawText.length, ws.bufferedAmount);

        if (msg.type === 'net:pong') {
          netDebug.recordPong(msg.seq, msg.clientSentAt, msg.serverTime);
          return;
        }

        if (msg.type === 'rooms:list') {
          setPublicRooms(msg.rooms);
          setRoomsLoading(false);
          return;
        }

        if (msg.type === 'room:error') {
          setRoomsLoading(false);
          const t = UI_TEXT[langRef.current];
          const wasInRoom = Boolean(activeRoomRef.current);
          const friendly =
            msg.code === 'NOT_FOUND'
              ? wasInRoom
                ? t.roomErrorClosed
                : t.roomErrorNotFound
              : msg.code === 'ROOM_FULL'
              ? t.roomErrorFull
              : msg.message;
          if (wasInRoom) {
            disconnectMultiplayer(false, true);
            setActiveModal('none');
            setPhase('title');
            audioEngine.pauseAmbientMusic();
            setShowRoomsModal(true);
          }
          setRoomsError(friendly);
          return;
        }

        if (msg.type === 'room:joined') {
          netDebug.resetRoomSyncTracking();
          setRoomsLoading(false);
          setRoomsError(null);
          setShowRoomsModal(false);
          reconnectAttemptsRef.current = 0;
          lastSentMoveRef.current = null;
          lastMoveWasMovingRef.current = false;
          gameModeRef.current = 'multiplayer';
          setGameMode('multiplayer');
          activeRoomRef.current = {
            code: msg.roomCode,
            playerName:
              msg.players.find((p) => p.id === msg.playerId)?.name ??
              opts?.roomContext?.playerName ??
              'Farmer',
            serverUrl: opts?.serverUrl,
          };
          applySyncedWorld(msg.world, msg.players, msg.playerId, false);
          earnedBadgesRef.current = new Set(getEarnedBadges(msg.world));
          cameraRef.current.x = msg.world.player.x * TILE_SIZE;
          cameraRef.current.y = msg.world.player.y * TILE_SIZE;
          floatingTextsRef.current = [];
          setMorningSummary(null);
          setFutureDispatch(null);
          setActiveModal('none');
          setUnreadChatCount(0);
          const initialVoiceStates = msg.voiceStates ?? {};
          voiceStatesRef.current = initialVoiceStates;
          if (voiceManagerRef.current?.isEnabled()) {
            const activeVoicePeers = Object.entries(initialVoiceStates)
              .filter(([id, s]) => id !== msg.playerId && s.enabled)
              .map(([id]) => id);
            voiceManagerRef.current.syncPeers(activeVoicePeers);
            ws.send(
              JSON.stringify({
                type: 'voice:state',
                enabled: true,
                muted: voiceManagerRef.current.isMuted(),
                speaking: false,
              } satisfies ClientToServerMessage)
            );
          }
          setRoomHud({
            roomCode: msg.roomCode,
            roomName: msg.roomName,
            playerId: msg.playerId,
            hostId: msg.hostId,
            players: msg.players,
            sleepVotes: msg.sleepVotes,
            chat: msg.chat,
            voiceStates: initialVoiceStates,
            reconnecting: false,
          });
          setPhase('playing');
          audioEngine.playSfx('click');
          audioEngine.startAmbientMusic();
          return;
        }

        if (msg.type === 'world:sync') {
          const myId = getOrCreateClientId();
          applySyncedWorld(msg.world, msg.players, myId, true, msg.teleportIds);
          setRoomHud((prev) =>
            prev
              ? {
                  ...prev,
                  players: msg.players,
                  hostId: msg.hostId,
                  sleepVotes: msg.sleepVotes,
                  reconnecting: false,
                }
              : prev
          );
          checkNewBadges();
          return;
        }

        if (msg.type === 'tick:entities') {
          netDebug.recordTickEntities(msg.seq);
          const myId = getOrCreateClientId();
          const world = worldRef.current;
          world.timeMinutes = msg.timeMinutes;
          world.weather = msg.weather;
          world.wildlife = msg.wildlife;
          world.chickens = msg.chickens;
          world.cows = msg.cows;
          world.sheep = msg.sheep;
          world.dog = msg.dog;
          const me = msg.players.find((p) => p.id === myId);
          if (me) {
            world.player.health = me.health;
            world.player.maxHealth = me.maxHealth;
            world.player.stamina = me.stamina;
            world.player.maxStamina = me.maxStamina;
            world.player.waterLevel = me.waterLevel;
            world.player.maxWaterLevel = me.maxWaterLevel;
          }
          syncRemoteTargets(
            msg.players.filter((p) => p.id !== myId),
            false
          );
          return;
        }

        if (msg.type === 'fx:event') {
          handleServerFx(msg.fx);
          return;
        }

        if (msg.type === 'chat:message') {
          setRoomHud((prev) =>
            prev ? { ...prev, chat: [...prev.chat.slice(-39), msg.message] } : prev
          );
          if (!chatOpenRef.current && msg.message.senderId !== getOrCreateClientId()) {
            setUnreadChatCount((c) => c + 1);
            audioEngine.playSfx('click');
            const preview =
              msg.message.text.length > 26
                ? `${msg.message.text.slice(0, 26)}…`
                : msg.message.text;
            addFloatingText(
              worldRef.current.player.x * TILE_SIZE,
              (worldRef.current.player.y - 1.55) * TILE_SIZE,
              `${msg.message.senderName}: ${preview}`,
              '#bae6fd'
            );
          }
          return;
        }

        if (msg.type === 'player:presence') {
          const myId = getOrCreateClientId();
          syncRemoteTargets(
            msg.players.filter((p) => p.id !== myId),
            false
          );
          if (msg.voiceStates) {
            voiceStatesRef.current = msg.voiceStates;
            const activeVoicePeers = Object.entries(msg.voiceStates)
              .filter(([id, s]) => id !== myId && s.enabled)
              .map(([id]) => id);
            voiceManagerRef.current?.syncPeers(activeVoicePeers);
          }
          setRoomHud((prev) =>
            prev
              ? {
                  ...prev,
                  hostId: msg.hostId,
                  players: msg.players,
                  sleepVotes: msg.sleepVotes,
                  voiceStates: msg.voiceStates ?? prev.voiceStates,
                }
              : prev
          );
          const toast =
            msg.event === 'joined'
              ? UI_TEXT[langRef.current].playerJoinedToast.replace('{name}', msg.playerName)
              : UI_TEXT[langRef.current].playerLeftToast.replace('{name}', msg.playerName);
          addFloatingText(
            worldRef.current.player.x * TILE_SIZE,
            (worldRef.current.player.y - 1.4) * TILE_SIZE,
            toast,
            msg.event === 'joined' ? '#86efac' : '#fca5a5'
          );
          return;
        }

        if (msg.type === 'voice:peer_state') {
          const myId = getOrCreateClientId();
          const nextVoiceStates = {
            ...voiceStatesRef.current,
            [msg.playerId]: msg.state,
          };
          voiceStatesRef.current = nextVoiceStates;
          const activeVoicePeers = Object.entries(nextVoiceStates)
            .filter(([id, s]) => id !== myId && s.enabled)
            .map(([id]) => id);
          voiceManagerRef.current?.syncPeers(activeVoicePeers);
          setRoomHud((prev) =>
            prev
              ? {
                  ...prev,
                  voiceStates: {
                    ...prev.voiceStates,
                    [msg.playerId]: msg.state,
                  },
                }
              : prev
          );
          return;
        }

        if (msg.type === 'voice:signal') {
          void voiceManagerRef.current?.handleSignal(msg.fromId, msg.signal);
        }
      };

      ws.onerror = () => {
        if (connectTimeoutRef.current !== null) {
          window.clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        setRoomsLoading(false);
        if (!activeRoomRef.current) {
          setRoomsError(UI_TEXT[langRef.current].roomErrorConnect);
        }
      };

      ws.onclose = (closeEvent) => {
        netDebug.recordClosed(closeEvent.code, closeEvent.reason);
        if (connectTimeoutRef.current !== null) {
          window.clearTimeout(connectTimeoutRef.current);
          connectTimeoutRef.current = null;
        }
        if (gameModeRef.current === 'multiplayer' && activeRoomRef.current) {
          if (reconnectAttemptsRef.current >= 5) {
            disconnectMultiplayer(false, true);
            setActiveModal('none');
            setPhase('title');
            audioEngine.pauseAmbientMusic();
            setShowRoomsModal(true);
            setRoomsError(UI_TEXT[langRef.current].roomErrorClosed);
            return;
          }
          reconnectAttemptsRef.current += 1;
          const ctx = activeRoomRef.current;
          setRoomHud((prev) => (prev ? { ...prev, reconnecting: true } : prev));
          reconnectTimerRef.current = window.setTimeout(() => {
            if (gameModeRef.current === 'multiplayer' && activeRoomRef.current) {
              connectAndSendRoomAction(
                {
                  type: 'room:join',
                  code: ctx.code,
                  playerName: ctx.playerName,
                  clientId: getOrCreateClientId(),
                },
                { serverUrl: ctx.serverUrl, roomContext: ctx }
              );
            }
          }, 1500 * reconnectAttemptsRef.current);
        }
      };
    },
    [addFloatingText, checkNewBadges, disconnectMultiplayer, handleServerFx, syncHud]
  );

  const refreshPublicRooms = useCallback(async (serverUrl?: string, silent = false) => {
    const reqId = ++roomsReqIdRef.current;
    if (!silent) {
      setRoomsLoading(true);
      setRoomsError(null);
    }
    const controller = new AbortController();
    const abortTimer = window.setTimeout(() => controller.abort(), 8000);
    try {
      const base = resolveHttpApiBase(serverUrl);
      const res = await fetch(`${base}/api/rooms`, { signal: controller.signal });
      if (!res.ok) throw new Error('Failed to load rooms');
      const data = (await res.json()) as { rooms?: RoomSummary[] };
      if (reqId !== roomsReqIdRef.current) return;
      setPublicRooms(Array.isArray(data.rooms) ? data.rooms : []);
      if (silent) setRoomsError(null);
    } catch {
      if (reqId !== roomsReqIdRef.current) return;
      if (!silent) {
        setRoomsError(UI_TEXT[langRef.current].roomErrorConnect);
      }
    } finally {
      window.clearTimeout(abortTimer);
      if (reqId === roomsReqIdRef.current && !silent) {
        setRoomsLoading(false);
      }
    }
  }, []);

  const triggerSleep = useCallback(() => {
    if (gameModeRef.current === 'multiplayer') {
      const myId = getOrCreateClientId();
      const alreadyVoted = roomHudRef.current?.sleepVotes.includes(myId) ?? false;
      sendWs({ type: 'action:sleep_vote', ready: !alreadyVoted });
      return;
    }
    const world = worldRef.current;
    const summary = advanceDay(world);
    setMorningSummary(summary);
    if (summary.messageFrom2040) {
      setFutureDispatch(summary.messageFrom2040);
    }
    audioEngine.playSfx('morning');
    // Place farmer outside farmhouse door refreshed
    world.player.x = FARMHOUSE_DOOR.x + 0.5;
    world.player.y = FARMHOUSE_DOOR.y + 0.6;
    world.player.facingX = 0;
    world.player.facingY = 1;
    checkNewBadges();
    saveFarm();
    syncHud();
    if (blindModeRef.current) {
      const report = formatMorningSummaryText(summary, langRef.current);
      const stationPart = summary.hasNasaStation
        ? langRef.current === 'ar'
          ? ` رطوبة التربة ${summary.soilMoisturePct}%، الحرارة ${summary.tempC} درجة، توقع الغد ${translateWeather(
              summary.tomorrowWeather ?? summary.weather,
              'ar'
            )}.`
          : ` Soil moisture ${summary.soilMoisturePct}%, ${summary.tempC}C, tomorrow ${translateWeather(
              summary.tomorrowWeather ?? summary.weather,
              'en'
            )}.`
        : '';
      const futurePart = summary.messageFrom2040
        ? ` ${UI_TEXT[langRef.current].futureMsgTitle}: ${
            langRef.current === 'ar' ? summary.messageFrom2040.quoteAr : summary.messageFrom2040.quoteEn
          }`
        : '';
      announceBlind(
        (langRef.current === 'ar' ? `صباح اليوم الجديد: ${report}` : `New morning: ${report}`) +
          stationPart +
          futurePart,
        true
      );
    }
  }, [announceBlind, checkNewBadges, saveFarm, sendWs, syncHud]);

  const runStartupVersionCheck = useCallback(
    async (force = false) => {
      setVersionChecking(true);
      try {
        const currentApiBase = resolveHttpApiBase();
        let res = await startupVersionChecker.check({
          force,
          apiBase: currentApiBase,
        });
        if (
          res.status === 'up_to_date' &&
          res.manifest?.multiplayer_url &&
          res.manifest.multiplayer_url.replace(/\/+$/, '') !== currentApiBase.replace(/\/+$/, '')
        ) {
          saveMultiplayerServerUrl(res.manifest.multiplayer_url);
          startupVersionChecker.clearCache();
          const newBase = resolveHttpApiBase();
          if (newBase && newBase !== currentApiBase) {
            res = await startupVersionChecker.check({
              force: true,
              apiBase: newBase,
            });
          }
        }
        setVersionStatus(res.status);
        setVersionManifest(res.manifest);
        setVersionNextRetryAtMs(res.nextRetryAtMs);
        setVersionCooldownSec(res.cooldownMs > 0 ? Math.ceil(res.cooldownMs / 1000) : 0);
        setVersionRecheckOffline(Boolean(res.recheckFailed));
        if (res.status === 'update_required' && res.manifest) {
          setShowRoomsModal(false);
          if (phaseRef.current !== 'title') {
            disconnectMultiplayer(true, gameModeRef.current === 'multiplayer');
            setActiveModal('none');
            setPhase('title');
            audioEngine.pauseAmbientMusic();
          }
          if (blindModeRef.current) {
            const msg =
              langRef.current === 'ar'
                ? res.manifest.message_ar
                : res.manifest.message_en || res.manifest.message_ar;
            announceBlind(`${UI_TEXT[langRef.current].forceUpdateTitle}. ${msg}`, true);
          }
        }
      } finally {
        setVersionChecking(false);
      }
    },
    [announceBlind, disconnectMultiplayer]
  );

  useEffect(() => {
    void runStartupVersionCheck(false);
    const onOnline = () => {
      void runStartupVersionCheck(false);
    };
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('online', onOnline);
    };
  }, [runStartupVersionCheck]);

  useEffect(() => {
    if (versionNextRetryAtMs <= 0) {
      setVersionCooldownSec(0);
      return;
    }
    const syncRemaining = () => {
      const remaining = Math.max(0, versionNextRetryAtMs - Date.now());
      setVersionCooldownSec(remaining > 0 ? Math.ceil(remaining / 1000) : 0);
      if (remaining <= 0) {
        setVersionNextRetryAtMs(0);
      }
    };
    syncRemaining();
    const id = window.setInterval(syncRemaining, 1000);
    return () => {
      window.clearInterval(id);
    };
  }, [versionNextRetryAtMs]);

  const handleVersionUpdateNow = useCallback(async () => {
    if (!versionManifest) return;
    setVersionUpdating(true);
    setVersionUpdateError(null);
    setVersionUpdateProgress(null);
    try {
      const res = await performInPlaceUpdate({
        manifest: versionManifest,
        apiBase: resolveHttpApiBase(),
        onProgress: setVersionUpdateProgress,
        onApplyServerUrl: (newUrl) => {
          saveMultiplayerServerUrl(newUrl);
        },
      });
      if (res.ok && !res.reloaded) {
        if (blindModeRef.current) {
          announceBlind(UI_TEXT[langRef.current].forceUpdateServerOnlyMsg, true);
        }
        await new Promise((resolve) => window.setTimeout(resolve, 750));
        if (versionManifest.multiplayer_url) {
          const nextRes = await startupVersionChecker.check({
            force: true,
            apiBase: resolveHttpApiBase(),
          });
          if (nextRes.status === 'update_required' && nextRes.manifest) {
            setVersionManifest(nextRes.manifest);
            setVersionStatus('update_required');
            setVersionRecheckOffline(false);
            setVersionUpdateProgress(null);
            return;
          }
        }
        setVersionStatus('up_to_date');
        setVersionRecheckOffline(false);
        setVersionUpdateProgress(null);
      } else if (!res.ok) {
        setVersionUpdateError(UI_TEXT[langRef.current].forceUpdateOfflineRetry);
      }
    } catch {
      setVersionUpdateError(UI_TEXT[langRef.current].forceUpdateOfflineRetry);
    } finally {
      setVersionUpdating(false);
    }
  }, [announceBlind, versionManifest]);

  const startNewFarm = useCallback(() => {
    if (versionRequiredRef.current) return;
    disconnectMultiplayer(false);
    const isMobile =
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768 ||
      window.innerHeight < 520;
    void requestOptimalDisplay(isMobile);
    const fresh = createInitialFarmState(42);
    worldRef.current = fresh;
    earnedBadgesRef.current = new Set(getEarnedBadges(fresh));
    cameraRef.current.x = fresh.player.x * TILE_SIZE;
    cameraRef.current.y = fresh.player.y * TILE_SIZE;
    keysPressedRef.current.clear();
    floatingTextsRef.current = [];
    setMorningSummary(null);
    setFutureDispatch(null);
    setActiveModal('none');
    setPhase('playing');
    audioEngine.playSfx('click');
    audioEngine.startAmbientMusic();
    saveFarm();
    syncHud();
    if (blindModeRef.current) {
      announceBlind(buildStatusAnnouncement(fresh, langRef.current), true);
    }
  }, [announceBlind, disconnectMultiplayer, requestOptimalDisplay, saveFarm, syncHud]);

  const continueFarm = useCallback(() => {
    if (versionRequiredRef.current) return;
    disconnectMultiplayer(false, false);
    const isMobile =
      window.matchMedia('(pointer: coarse)').matches ||
      navigator.maxTouchPoints > 0 ||
      window.innerWidth < 768 ||
      window.innerHeight < 520;
    void requestOptimalDisplay(isMobile);
    const saved = loadSavedWorld();
    if (saved) {
      worldRef.current = saved;
      earnedBadgesRef.current = new Set(getEarnedBadges(saved));
      cameraRef.current.x = saved.player.x * TILE_SIZE;
      cameraRef.current.y = saved.player.y * TILE_SIZE;
    } else {
      const fresh = createInitialFarmState(42);
      worldRef.current = fresh;
      earnedBadgesRef.current = new Set(getEarnedBadges(fresh));
      cameraRef.current.x = fresh.player.x * TILE_SIZE;
      cameraRef.current.y = fresh.player.y * TILE_SIZE;
    }
    floatingTextsRef.current = [];
    setMorningSummary(null);
    setFutureDispatch(null);
    keysPressedRef.current.clear();
    setActiveModal('none');
    if (worldRef.current.outcome === 'exhausted' || worldRef.current.player.health <= 0) {
      worldRef.current.outcome = 'exhausted';
      setPhase('gameover');
      audioEngine.pauseAmbientMusic();
      syncHud();
      return;
    }
    setPhase('playing');
    audioEngine.playSfx('click');
    audioEngine.startAmbientMusic();
    syncHud();
    if (blindModeRef.current) {
      announceBlind(buildStatusAnnouncement(worldRef.current, langRef.current), true);
    }
  }, [announceBlind, disconnectMultiplayer, requestOptimalDisplay, syncHud]);

  const handleInteract = useCallback(() => {
    const world = worldRef.current;
    if (isNearFarmhouse(world)) {
      triggerSleep();
      return;
    }
    if (isNearShopStall(world)) {
      audioEngine.playSfx('click');
      setShopInitialTab('seeds');
      setActiveModal('shop');
      if (blindModeRef.current) {
        announceBlind(UI_TEXT[langRef.current].shopTitle, true);
      }
      return;
    }
    if (isNearWell(world)) {
      if (gameModeRef.current === 'multiplayer') {
        sendWs({ type: 'action:well' });
        return;
      }
      world.player.waterLevel = world.player.maxWaterLevel;
      audioEngine.playSfx('refill');
      spawnParticleBurst(
        (WELL_POS.x + 0.5) * TILE_SIZE,
        (WELL_POS.y + 0.5) * TILE_SIZE,
        '#77c8f2',
        10
      );
      addFloatingText(
        (WELL_POS.x + 0.5) * TILE_SIZE,
        WELL_POS.y * TILE_SIZE,
        langRef.current === 'ar' ? 'تمت تعبئة المرش' : 'Can Refilled',
        '#9ee0ff'
      );
      if (blindModeRef.current) {
        announceBlind(
          langRef.current === 'ar'
            ? `تمت تعبئة مرش المياه: ${world.player.waterLevel} شحنة`
            : `Watering can refilled: ${world.player.waterLevel}`,
          true
        );
      }
      saveFarm();
      syncHud();
      return;
    }
    if (isNearShippingBin(world)) {
      audioEngine.playSfx('click');
      setShopInitialTab('sell');
      setActiveModal('shop');
      if (blindModeRef.current) {
        announceBlind(UI_TEXT[langRef.current].shopTitle, true);
      }
    }
  }, [addFloatingText, announceBlind, saveFarm, sendWs, spawnParticleBurst, syncHud, triggerSleep]);

  const handleTileClickAction = useCallback(
    (tx: number, ty: number) => {
      const world = worldRef.current;

      // Clicking directly on Farmhouse door while near sleeps
      if (
        tx >= FARMHOUSE_POS.x &&
        tx < FARMHOUSE_POS.x + FARMHOUSE_POS.w &&
        ty >= FARMHOUSE_POS.y &&
        ty < FARMHOUSE_POS.y + FARMHOUSE_POS.h &&
        isNearFarmhouse(world)
      ) {
        triggerSleep();
        return;
      }

      // Clicking directly on Shop Stall while near opens shop
      if (
        tx >= SHOP_STALL_POS.x &&
        tx < SHOP_STALL_POS.x + SHOP_STALL_POS.w &&
        ty >= SHOP_STALL_POS.y &&
        ty < SHOP_STALL_POS.y + SHOP_STALL_POS.h &&
        isNearShopStall(world)
      ) {
        audioEngine.playSfx('click');
        setShopInitialTab('seeds');
        setActiveModal('shop');
        return;
      }

      if (gameModeRef.current === 'multiplayer') {
        const dx = tx + 0.5 - world.player.x;
        const dy = ty + 0.5 - world.player.y;
        if (Math.hypot(dx, dy) > 0.05) {
          world.player.facingX = dx;
          world.player.facingY = dy;
        }
        const sel = world.hotbar[world.player.selectedHotbarIndex];
        if (sel === 'hoe' || sel === 'watering_can' || sel === 'axe') {
          world.player.swingTimer = 0.22;
          world.player.swingTool = sel;
        }
        sendWs({
          type: 'action:tile',
          tx,
          ty,
          selectedHotbarIndex: world.player.selectedHotbarIndex,
        });
        return;
      }

      const res = performTileAction(world, tx, ty, Date.now());
      const wx = (tx + 0.5) * TILE_SIZE;
      const wy = (ty + 0.5) * TILE_SIZE;

      const feedbackText = formatFeedbackMessage(res, langRef.current);

      if (res.performed) {
        if (res.kind === 'till') {
          audioEngine.playSfx('till');
          spawnParticleBurst(wx, wy, '#8a5a38', 7, 36);
          if (blindModeRef.current) {
            announceBlind(langRef.current === 'ar' ? 'تمت حراثة التربة' : 'Soil tilled', true);
          }
        } else if (res.kind === 'plant') {
          audioEngine.playSfx('plant');
          spawnParticleBurst(wx, wy, '#a7d66f', 5, 24);
          if (blindModeRef.current) {
            announceBlind(langRef.current === 'ar' ? 'تمت زراعة البذور' : 'Seed planted', true);
          }
        } else if (res.kind === 'water' || res.kind === 'refill') {
          audioEngine.playSfx('water');
          spawnParticleBurst(wx, wy, '#6ec5f5', 9, 40);
          if (blindModeRef.current) {
            announceBlind(
              langRef.current === 'ar'
                ? `تم السقي، المتبقي ${world.player.waterLevel}`
                : `Watered, ${world.player.waterLevel} water left`,
              true
            );
          }
        } else if (res.kind === 'harvest') {
          if ((res.comboCount ?? 0) >= 2) {
            audioEngine.playSfx('combo', res.comboCount);
            const comboMsg = UI_TEXT[langRef.current].comboToast
              .replace('{n}', String(res.comboCount))
              .replace('{g}', String(res.comboGold ?? 0));
            addFloatingText(wx, wy - 22, comboMsg, '#fde047');
          } else {
            audioEngine.playSfx('harvest');
          }
          spawnParticleBurst(wx, wy, '#ffe473', res.goldenBonus ? 22 : 14, 52);
          if (feedbackText) addFloatingText(wx, wy - 8, feedbackText, '#ffe675');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'clear') {
          audioEngine.playSfx(res.treasureFound ? 'treasure' : 'clear');
          spawnParticleBurst(wx, wy, res.treasureFound ? '#fde047' : '#b59268', res.treasureFound ? 16 : 9, 42);
          if (feedbackText) addFloatingText(wx, wy - 8, feedbackText, '#e8d7b7');
          if (res.treasureFound) {
            const tText = res.treasureFound.gold
              ? UI_TEXT[langRef.current].treasureGoldToast.replace('{g}', String(res.treasureFound.gold))
              : UI_TEXT[langRef.current].treasureSeedToast.replace(
                  '{seed}',
                  getItemLabel(res.treasureFound.seedId ?? 'carrot_seed', langRef.current).name
                );
            addFloatingText(wx, wy - 22, tText, '#fde047');
          }
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'place' || res.kind === 'repair') {
          audioEngine.playSfx('place');
          spawnParticleBurst(wx, wy, '#d6a56b', 6, 28);
          if (feedbackText) addFloatingText(wx, wy - 8, feedbackText, '#f7ebd4');
          if (blindModeRef.current) {
            announceBlind(
              feedbackText || (langRef.current === 'ar' ? 'تم الوضع' : 'Placed'),
              true
            );
          }
        } else if (res.kind === 'defend') {
          audioEngine.playSfx('defend');
          spawnParticleBurst(wx, wy, '#ff9866', 10, 56);
          if (feedbackText) addFloatingText(wx, wy - 8, feedbackText, '#ffb694');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'fish') {
          audioEngine.playSfx('fish');
          spawnParticleBurst(wx, wy, res.goldenPearl ? '#fde047' : '#38bdf8', 14, 48);
          if (feedbackText) addFloatingText(wx, wy - 10, feedbackText, res.goldenPearl ? '#fde047' : '#7dd3fc');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'wish') {
          audioEngine.playSfx('wish');
          spawnParticleBurst(wx, wy, '#fde047', 16, 52);
          if (feedbackText) addFloatingText(wx, wy - 12, feedbackText, '#fef08a');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'fertilize') {
          audioEngine.playSfx('plant');
          spawnParticleBurst(wx, wy, '#4ade80', 10, 36);
          if (feedbackText) addFloatingText(wx, wy - 8, feedbackText, '#86efac');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'artisan') {
          audioEngine.playSfx('harvest');
          spawnParticleBurst(wx, wy, '#fbbf24', 12, 40);
          if (feedbackText) addFloatingText(wx, wy - 10, feedbackText, '#fde68a');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'pet') {
          audioEngine.playSfx(res.wishOutcome === 'dog' ? 'bark' : 'pet');
          spawnParticleBurst(wx, wy - 6, '#f472b6', 10, 34);
          if (feedbackText) addFloatingText(wx, wy - 12, feedbackText, '#f9a8d4');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        } else if (res.kind === 'forage') {
          audioEngine.playSfx('treasure');
          spawnParticleBurst(wx, wy, '#fde047', 14, 46);
          if (feedbackText) addFloatingText(wx, wy - 12, feedbackText, '#fef08a');
          if (blindModeRef.current && feedbackText) {
            announceBlind(feedbackText, true);
          }
        }

        if (res.leveledUpTo) {
          audioEngine.playSfx('levelup');
          const lvlMsg = UI_TEXT[langRef.current].levelUpToast.replace('{n}', String(res.leveledUpTo));
          addFloatingText(world.player.x * TILE_SIZE, (world.player.y - 1.6) * TILE_SIZE, lvlMsg, '#fde047');
          if (blindModeRef.current) {
            announceBlind(lvlMsg, false);
          }
        }

        // Check 100% Farm Restoration milestone
        const pct = computeFarmRestorationPercent(world);
        if (pct >= 100 && !world.restorationVictoryDismissed) {
          world.outcome = 'restored';
          setPhase('gameover');
          audioEngine.playSfx('morning');
          if (blindModeRef.current) {
            announceBlind(UI_TEXT[langRef.current].restoredTitle, true);
          }
        }
        checkNewBadges();
        saveFarm();
        syncHud();
      } else if (res.kind === 'error' && feedbackText) {
        audioEngine.playSfx('error');
        addFloatingText(wx, wy - 10, feedbackText, '#ff9b85');
        if (blindModeRef.current) {
          announceBlind(feedbackText, true);
        }
      }
    },
    [addFloatingText, announceBlind, checkNewBadges, saveFarm, spawnParticleBurst, syncHud, triggerSleep]
  );

  // Keyboard Listeners (WASD/Arrows, 1-9, E, B, C, M, Esc/P) + Blur Hygiene
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (e.repeat) return;
      const key = e.key.toLowerCase();

      if (e.key === 'F9' || ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'd')) {
        e.preventDefault();
        setShowNetDebug((prev) => !prev);
        return;
      }

      if (key === 'v') {
        e.preventDefault();
        if (
          !e.shiftKey &&
          phaseRef.current === 'playing' &&
          gameModeRef.current === 'multiplayer' &&
          modalRef.current === 'none' &&
          !futureOpenRef.current
        ) {
          void handleJoinOrToggleVoiceMic();
        } else {
          toggleBlindMode();
        }
        return;
      }

      if (phaseRef.current === 'title') {
        if (versionRequiredRef.current) return;
        if (showRoomsModalRef.current) {
          if (key === 'escape') {
            e.preventDefault();
            setShowRoomsModal(false);
          }
          return;
        }
        if (key === 'enter' || key === ' ') {
          e.preventDefault();
          if (hasSavedFarm) continueFarm();
          else startNewFarm();
        }
        return;
      }

      if (key === 'escape' || key === 'p') {
        e.preventDefault();
        if (futureOpenRef.current) {
          setFutureDispatch(null);
          audioEngine.playSfx('click');
          return;
        }
        if (modalRef.current !== 'none') {
          setActiveModal('none');
          audioEngine.playSfx('click');
          return;
        }
        if (phaseRef.current === 'playing') {
          keysPressedRef.current.clear();
          setPhase('paused');
          audioEngine.pauseAmbientMusic();
          saveFarm();
        } else if (phaseRef.current === 'paused') {
          keysPressedRef.current.clear();
          setPhase('playing');
          audioEngine.startAmbientMusic();
        }
        return;
      }

      if (phaseRef.current !== 'playing') return;

      if (key === 't' && gameModeRef.current === 'multiplayer' && modalRef.current === 'none') {
        e.preventDefault();
        setChatOpen((prev) => {
          const next = !prev;
          if (next) setUnreadChatCount(0);
          return next;
        });
        return;
      }

      if (key === 'm') {
        const nextMuted = !audioEngine.isMuted();
        audioEngine.setMuted(nextMuted);
        setMuted(nextMuted);
        return;
      }

      if (key === 'b') {
        e.preventDefault();
        audioEngine.playSfx('click');
        setShopInitialTab('seeds');
        setActiveModal((prev) => {
          const next = prev === 'shop' ? 'none' : 'shop';
          if (blindModeRef.current && next === 'shop') {
            announceBlind(UI_TEXT[langRef.current].shopTitle, true);
          }
          return next;
        });
        return;
      }

      if (key === 'c' || key === 'i') {
        e.preventDefault();
        audioEngine.playSfx('click');
        setActiveModal((prev) => {
          const next = prev === 'craft' ? 'none' : 'craft';
          if (blindModeRef.current && next === 'craft') {
            announceBlind(UI_TEXT[langRef.current].craftTitle, true);
          }
          return next;
        });
        return;
      }

      if (key === 'j') {
        e.preventDefault();
        audioEngine.playSfx('click');
        setActiveModal((prev) => {
          const next = prev === 'missions' ? 'none' : 'missions';
          if (blindModeRef.current && next === 'missions') {
            announceBlind(UI_TEXT[langRef.current].missionsModalTitle, true);
          }
          return next;
        });
        return;
      }

      if (key === 'n') {
        e.preventDefault();
        audioEngine.playSfx('click');
        setActiveModal((prev) => {
          const next = prev === 'nasa' ? 'none' : 'nasa';
          if (blindModeRef.current && next === 'nasa') {
            announceBlind(UI_TEXT[langRef.current].nasaModalTitle, true);
          }
          return next;
        });
        return;
      }

      if (key === 'l') {
        e.preventDefault();
        audioEngine.playSfx('click');
        setActiveModal((prev) => {
          const next = prev === 'almanac' ? 'none' : 'almanac';
          if (blindModeRef.current && next === 'almanac') {
            announceBlind(UI_TEXT[langRef.current].almanacTitle, true);
          }
          return next;
        });
        return;
      }

      if (modalRef.current !== 'none' || futureOpenRef.current) return;

      if (key === 'f') {
        e.preventDefault();
        handleBlindScan();
        return;
      }

      if (key === 'g') {
        e.preventDefault();
        handleBlindGuide();
        return;
      }

      if (key === 'r') {
        e.preventDefault();
        handleBlindStatus();
        return;
      }

      if (key === 'h') {
        e.preventDefault();
        triggerEmote('👋');
        return;
      }

      if (key === 'k') {
        e.preventDefault();
        triggerEmote('❤️');
        return;
      }

      if (key >= '1' && key <= '9') {
        const idx = parseInt(key, 10) - 1;
        worldRef.current.player.selectedHotbarIndex = idx;
        audioEngine.playSfx('click');
        if (blindModeRef.current) {
          const itemId = worldRef.current.hotbar[idx];
          if (itemId) {
            const label = getItemLabel(itemId, langRef.current).name;
            const qty = worldRef.current.inventory[itemId] ?? 0;
            const detail =
              itemId === 'watering_can'
                ? `${worldRef.current.player.waterLevel}/${worldRef.current.player.maxWaterLevel}`
                : ITEMS[itemId].category !== 'tool'
                ? `(${qty})`
                : '';
            announceBlind(`${label} ${detail}`.trim(), true);
          } else {
            announceBlind(UI_TEXT[langRef.current].emptySlot, true);
          }
        }
        syncHud();
        return;
      }

      if (key === 'e') {
        e.preventDefault();
        handleInteract();
        return;
      }

      if (key === ' ') {
        e.preventDefault();
        // Use tool on tile directly in front of farmer
        const p = worldRef.current.player;
        const fx = Math.abs(p.facingX) >= Math.abs(p.facingY) ? Math.sign(p.facingX) : 0;
        const fy = fx === 0 ? Math.sign(p.facingY || 1) : 0;
        handleTileClickAction(Math.floor(p.x + fx * 0.85), Math.floor(p.y + fy * 0.85));
        return;
      }

      keysPressedRef.current.add(key);
    };

    const onKeyUp = (e: KeyboardEvent) => {
      keysPressedRef.current.delete(e.key.toLowerCase());
    };

    const clearInputs = () => {
      keysPressedRef.current.clear();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearInputs);
    document.addEventListener('visibilitychange', clearInputs);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearInputs);
      document.removeEventListener('visibilitychange', clearInputs);
    };
  }, [
    announceBlind,
    continueFarm,
    handleBlindGuide,
    handleBlindScan,
    handleBlindStatus,
    handleInteract,
    handleJoinOrToggleVoiceMic,
    handleTileClickAction,
    hasSavedFarm,
    saveFarm,
    startNewFarm,
    syncHud,
    toggleBlindMode,
    triggerEmote,
  ]);

  // Persist singleplayer farm on tab background/unload & clean up sockets/audio on unmount
  useEffect(() => {
    const persistIfPlaying = () => {
      if (gameModeRef.current === 'singleplayer' && phaseRef.current !== 'title') {
        saveFarm();
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        persistIfPlaying();
      }
    };
    window.addEventListener('beforeunload', persistIfPlaying);
    window.addEventListener('pagehide', persistIfPlaying);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', persistIfPlaying);
      window.removeEventListener('pagehide', persistIfPlaying);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      disconnectMultiplayer(true, false);
      audioEngine.dispose();
    };
  }, [disconnectMultiplayer, saveFarm]);

  // Decoupled 3D WebGL Scene Setup + Live ResizeObserver + 60Hz Game Loop
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const scene3d = new EcoGrowScene3D(container);
    scene3dRef.current = scene3d;

    const resize = () => {
      const rect = container.getBoundingClientRect();
      scene3d.resize(rect.width, rect.height);
      // Scale zoom cleanly across portrait, landscape phone, tablet, and desktop viewports
      const widthZoom = rect.width < 640 ? 1.55 : rect.width < 1100 ? 1.85 : 2.15;
      const heightZoom = rect.height / (9.5 * TILE_SIZE);
      const baseZoom = Math.max(1.05, Math.min(widthZoom, heightZoom));
      cameraRef.current.zoom = baseZoom;
    };

    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    let cancelFrame: (() => void) | null = null;
    let lastTime = performance.now();
    let hudTimer = 0;
    let smokeTimer = 0;

    const tick = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);
      elapsedRef.current += dt;

      const world = worldRef.current;
      const currentPhase = phaseRef.current;
      const modalOpen = modalRef.current !== 'none' || futureOpenRef.current;

      // Ambient chimney smoke particles
      smokeTimer += dt;
      if (smokeTimer >= 0.45) {
        smokeTimer = 0;
        spawnParticleBurst(
          (FARMHOUSE_POS.x + FARMHOUSE_POS.w - 0.65) * TILE_SIZE,
          (FARMHOUSE_POS.y - 0.35) * TILE_SIZE,
          'rgba(235, 232, 224, 0.7)',
          2,
          14,
          -22
        );
      }

      if (currentPhase === 'title') {
        // Gentle live world camera pan over the homestead on Title screen
        const centerWorldX = (world.width * TILE_SIZE) / 2;
        const centerWorldY = (world.height * TILE_SIZE) / 2;
        cameraRef.current.x = centerWorldX + Math.sin(elapsedRef.current * 0.25) * 90;
        cameraRef.current.y = centerWorldY + Math.cos(elapsedRef.current * 0.2) * 45;
      } else if (currentPhase === 'playing' && (!modalOpen || gameModeRef.current === 'multiplayer')) {
        // 1. Time progression (local in singleplayer, interpolated in multiplayer)
        world.timeMinutes += dt * GAME_MINUTES_PER_REAL_SECOND;
        if (gameModeRef.current === 'singleplayer') {
          if (world.weather === 'Drought' && world.timeMinutes >= 840 && !world.droughtMiddayTriggered) {
            const dried = triggerMiddayDrought(world);
            if (dried > 0) {
              addFloatingText(
                world.player.x * TILE_SIZE,
                (world.player.y - 1) * TILE_SIZE,
                UI_TEXT[langRef.current].droughtHit,
                '#ffba6b'
              );
              if (blindModeRef.current) {
                announceBlind(UI_TEXT[langRef.current].droughtHit, true);
              }
            }
          }
          if (world.weather === 'Heatwave' && world.timeMinutes >= 840 && !world.heatwaveMiddayTriggered) {
            const exposed = triggerMiddayHeatwave(world);
            if (exposed > 0) {
              addFloatingText(
                world.player.x * TILE_SIZE,
                (world.player.y - 1) * TILE_SIZE,
                UI_TEXT[langRef.current].heatwaveHit,
                '#fb923c'
              );
              if (blindModeRef.current) {
                announceBlind(UI_TEXT[langRef.current].heatwaveHit, true);
              }
            }
          }
          // Auto-sleep if player stays up past 24:00 (with slight exhaustion penalty)
          if (world.timeMinutes >= DAY_END_MINUTES) {
            world.player.health = Math.max(0, world.player.health - 20);
            if (world.player.health <= 0) {
              world.outcome = 'exhausted';
              saveFarm();
              setPhase('gameover');
              audioEngine.pauseAmbientMusic();
            } else {
              triggerSleep();
            }
          }
        }

        // 2. Player WASD / Arrow / Touch Thumbstick movement
        const keys = modalOpen ? null : keysPressedRef.current;
        let mx = modalOpen ? 0 : joystickRef.current.x;
        let my = modalOpen ? 0 : joystickRef.current.y;
        if (keys) {
          if (keys.has('w') || keys.has('arrowup')) my -= 1;
          if (keys.has('s') || keys.has('arrowdown')) my += 1;
          if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
          if (keys.has('d') || keys.has('arrowright')) mx += 1;
        }

        if (mx !== 0 || my !== 0) {
          const len = Math.hypot(mx, my);
          if (len > 1) {
            mx /= len;
            my /= len;
          }
          const yaw = scene3d.cameraYaw;
          if (yaw !== 0) {
            const cos = Math.cos(yaw);
            const sin = Math.sin(yaw);
            const rx = mx * cos + my * sin;
            const ry = -mx * sin + my * cos;
            mx = rx;
            my = ry;
          }
          const sprinting = sprintActiveRef.current || Boolean(keys?.has('shift'));
          const speed = sprinting ? 4.5 * 1.45 : 4.5; // tiles/sec
          const nx = world.player.x + mx * speed * dt;
          const ny = world.player.y + my * speed * dt;

          const canStand = (px: number, py: number) => {
            const r = 0.28;
            return (
              isTileWalkable(world, Math.floor(px - r), Math.floor(py - r)) &&
              isTileWalkable(world, Math.floor(px + r), Math.floor(py - r)) &&
              isTileWalkable(world, Math.floor(px - r), Math.floor(py + r)) &&
              isTileWalkable(world, Math.floor(px + r), Math.floor(py + r))
            );
          };

          const canMoveX = canStand(nx, world.player.y);
          const canMoveY = canStand(world.player.x, ny);
          if (canMoveX) world.player.x = nx;
          if (canMoveY) world.player.y = ny;

          if (sprinting && (canMoveX || canMoveY) && Math.random() < dt * 10) {
            spawnParticleBurst(
              world.player.x * TILE_SIZE,
              (world.player.y + 0.25) * TILE_SIZE,
              'rgba(224, 204, 168, 0.65)',
              1,
              14,
              -10
            );
          }

          world.player.facingX = mx;
          world.player.facingY = my;
          world.player.walkCycle += dt * (sprinting ? 17 : 12);

          // Blind Mode spatial feedback while walking (throttled so speech never floods)
          if (blindModeRef.current) {
            const facing = getFacingTileCoords(world);
            if (!canMoveX && !canMoveY) {
              if (now - lastBumpSpeakAtRef.current > 950) {
                lastBumpSpeakAtRef.current = now;
                audioEngine.playBlindCue('bump');
                const blocked = describeTileForBlind(world, facing.tx, facing.ty, langRef.current);
                setBlindCaption(blocked.text);
                speakAccessibility(blocked.text, langRef.current, { interrupt: true });
              }
            } else {
              const sig = `${facing.tx},${facing.ty}:${getTileSignatureForBlind(world, facing.tx, facing.ty)}`;
              if (sig !== lastSpokenTileRef.current) {
                lastSpokenTileRef.current = sig;
                const desc = describeTileForBlind(world, facing.tx, facing.ty, langRef.current);
                if (
                  desc.cue === 'crop_ripe' ||
                  desc.cue === 'crop_need_water' ||
                  desc.cue === 'building' ||
                  desc.cue === 'danger' ||
                  desc.cue === 'obstacle'
                ) {
                  if (desc.cue === 'crop_ripe') audioEngine.playBlindCue('ripe');
                  else if (desc.cue === 'crop_need_water') audioEngine.playBlindCue('dry');
                  else if (desc.cue === 'danger') audioEngine.playBlindCue('danger');
                  if (now - lastMoveSpeakAtRef.current > 800) {
                    lastMoveSpeakAtRef.current = now;
                    setBlindCaption(desc.text);
                    speakAccessibility(desc.text, langRef.current, { interrupt: true });
                  }
                }
              }
            }
          }
        }

        // Sync local movement to multiplayer room (throttled ~11Hz + quantized + delta check)
        if (gameModeRef.current === 'multiplayer') {
          const isMoving = mx !== 0 || my !== 0;
          const qx = Math.round(world.player.x * 100) / 100;
          const qy = Math.round(world.player.y * 100) / 100;
          const qfx = Math.round(world.player.facingX * 100) / 100;
          const qfy = Math.round(world.player.facingY * 100) / 100;
          const qwc = Math.round(world.player.walkCycle * 10) / 10;
          const slotIdx = world.player.selectedHotbarIndex;
          const last = lastSentMoveRef.current;
          const movedEnough =
            !last ||
            Math.abs(qx - last.x) > 0.01 ||
            Math.abs(qy - last.y) > 0.01 ||
            qfx !== last.fx ||
            qfy !== last.fy;
          const slotChanged = Boolean(last && slotIdx !== last.slot);
          if (
            (isMoving && movedEnough && now - lastMoveSentAtRef.current >= 90) ||
            (!isMoving && lastMoveWasMovingRef.current) ||
            slotChanged
          ) {
            lastMoveSentAtRef.current = now;
            lastMoveWasMovingRef.current = isMoving;
            lastSentMoveRef.current = { x: qx, y: qy, fx: qfx, fy: qfy, slot: slotIdx };
            sendWs({
              type: 'player:move',
              x: qx,
              y: qy,
              facingX: qfx,
              facingY: qfy,
              walkCycle: qwc,
              selectedHotbarIndex: slotIdx,
            });
          }
        }

        if (world.player.swingTimer > 0) {
          world.player.swingTimer = Math.max(0, world.player.swingTimer - dt);
        }
        if (world.player.hitFlashTimer > 0) {
          world.player.hitFlashTimer = Math.max(0, world.player.hitFlashTimer - dt);
        }

        // 3. Night Wildlife spawning & AI (authoritative on server in multiplayer)
        if (gameModeRef.current === 'singleplayer') {
          if (world.timeMinutes >= NIGHT_START_MINUTES) {
            wildlifeSpawnTimerRef.current -= dt;
            if (wildlifeSpawnTimerRef.current <= 0) {
              wildlifeSpawnTimerRef.current = 5.5 + Math.random() * 4;
              spawnNightWildlife(world);
            }
          }
          stepWildlife(
            world,
            dt,
            (tx, ty) => {
              spawnParticleBurst((tx + 0.5) * TILE_SIZE, (ty + 0.5) * TILE_SIZE, '#7abf4b', 8);
              const msg = langRef.current === 'ar' ? 'أُكل محصول!' : 'Crop eaten!';
              addFloatingText((tx + 0.5) * TILE_SIZE, ty * TILE_SIZE, msg, '#ff8c75');
              if (blindModeRef.current) {
                audioEngine.playBlindCue('danger');
                announceBlind(msg, true);
              }
            },
            (dmg) => {
              traumaRef.current = Math.min(1, traumaRef.current + 0.55);
              audioEngine.playSfx('hurt');
              addFloatingText(
                world.player.x * TILE_SIZE,
                (world.player.y - 1) * TILE_SIZE,
                langRef.current === 'ar' ? `-${dmg} صحة` : `-${dmg} HP`,
                '#ff6666'
              );
              if (blindModeRef.current) {
                announceBlind(
                  langRef.current === 'ar'
                    ? `تلقيت ضرراً، صحتك الآن ${Math.round(world.player.health)}`
                    : `Took damage, health now ${Math.round(world.player.health)}`,
                  true
                );
              }
              if (world.player.health <= 0) {
                world.outcome = 'exhausted';
                saveFarm();
                setPhase('gameover');
                audioEngine.pauseAmbientMusic();
              }
            }
          );

          stepChickens(world, dt);
          stepLivestockAndDog(world, dt, (dx, dy) => {
            audioEngine.playSfx('bark');
            spawnParticleBurst(dx * TILE_SIZE, dy * TILE_SIZE, '#fde047', 6, 30);
            addFloatingText(dx * TILE_SIZE, (dy - 0.8) * TILE_SIZE, UI_TEXT[langRef.current].dogBarkToast, '#fde047');
          });
        }

        // 4. Smoothly interpolate remote co-op players at 60Hz
        if (gameModeRef.current === 'multiplayer' && remotePlayersRef.current.length > 0) {
          const targets = new Map(remoteTargetPlayersRef.current.map((t) => [t.id, t]));
          const alpha = Math.min(1, dt * 14);
          for (const rp of remotePlayersRef.current) {
            const target = targets.get(rp.id);
            if (target) {
              rp.x += (target.x - rp.x) * alpha;
              rp.y += (target.y - rp.y) * alpha;
              rp.facingX = target.facingX;
              rp.facingY = target.facingY;
              rp.walkCycle = target.walkCycle;
              rp.hitFlashTimer = target.hitFlashTimer;
              rp.health = target.health;
              rp.stamina = target.stamina;
              rp.waterLevel = target.waterLevel;
              rp.selectedHotbarIndex = target.selectedHotbarIndex;
              if (rp.swingTimer > 0) {
                rp.swingTimer = Math.max(0, rp.swingTimer - dt);
              }
            }
          }
        }

        // 5. Smooth Camera Follow + Clamp to Map Bounds
        const targetCamX = world.player.x * TILE_SIZE;
        const targetCamY = world.player.y * TILE_SIZE;
        cameraRef.current.x += (targetCamX - cameraRef.current.x) * Math.min(1, dt * 8);
        cameraRef.current.y += (targetCamY - cameraRef.current.y) * Math.min(1, dt * 8);

        // 6. Periodic nocturnal wildlife ambient cues (subtle rustling & owl hoots) during Night phase
        const isNightPhase = getTimePhase(world.timeMinutes) === 'Night';
        let activeWildlifeCount = 0;
        if (isNightPhase) {
          for (const w of world.wildlife) {
            if (w.state !== 'ko') activeWildlifeCount += 1;
          }
        }
        audioEngine.setNightAmbience(isNightPhase, activeWildlifeCount);
      } else {
        audioEngine.setNightAmbience(false, 0);
      }

      // Update camera shake
      if (traumaRef.current > 0) {
        traumaRef.current = Math.max(0, traumaRef.current - dt * 2.2);
        const shake = traumaRef.current * traumaRef.current * 8;
        cameraRef.current.shakeX = (Math.random() * 2 - 1) * shake;
        cameraRef.current.shakeY = (Math.random() * 2 - 1) * shake;
      } else {
        cameraRef.current.shakeX = 0;
        cameraRef.current.shakeY = 0;
      }

      // Update pooled particles
      for (const p of particlesRef.current) {
        if (!p.active) continue;
        p.life -= dt;
        if (p.life <= 0) {
          p.active = false;
          continue;
        }
        p.vy += p.gravity * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
      }

      // Update floating texts
      for (let i = floatingTextsRef.current.length - 1; i >= 0; i--) {
        const ft = floatingTextsRef.current[i];
        ft.life -= dt;
        ft.y -= 18 * dt;
        if (ft.life <= 0) floatingTextsRef.current.splice(i, 1);
      }

      // Render 3D world (throttle slightly during pause/modals in solo mode)
      const shouldDraw =
        (currentPhase === 'playing' && (!modalOpen || gameModeRef.current === 'multiplayer')) ||
        Math.floor(elapsedRef.current * 4) !== Math.floor((elapsedRef.current - dt) * 4);
      if (shouldDraw) {
        const nowMs = Date.now();
        let activeEmotesMap: Record<string, string> | undefined;
        let localEmote: string | undefined;
        const myEmoteId = gameModeRef.current === 'multiplayer' ? getOrCreateClientId() : '__local__';
        for (const [id, entry] of Object.entries(activeEmotesRef.current)) {
          if (entry.expiresAt <= nowMs) {
            delete activeEmotesRef.current[id];
            continue;
          }
          if (id === myEmoteId) {
            localEmote = entry.text;
          } else {
            if (!activeEmotesMap) activeEmotesMap = {};
            activeEmotesMap[id] = entry.text;
          }
        }
        scene3d.render(
          world,
          cameraRef.current,
          particlesRef.current,
          floatingTextsRef.current,
          hoverTileRef.current,
          elapsedRef.current,
          currentPhase === 'title',
          gameModeRef.current === 'multiplayer' ? remotePlayersRef.current : [],
          gameModeRef.current === 'multiplayer' ? localPlayerMetaRef.current : undefined,
          gameModeRef.current === 'multiplayer' ? voiceStatesRef.current : undefined,
          activeEmotesMap,
          localEmote
        );
      }

      // Sync HUD only on discrete changes while playing without a modal open
      hudTimer += dt;
      if (currentPhase === 'playing' && !modalOpen && hudTimer >= 0.25) {
        hudTimer = 0;
        if ((world.harvestCombo ?? 0) >= 2 && Date.now() - (world.lastHarvestMs ?? 0) > 5000) {
          world.harvestCombo = 0;
          syncHud();
        }
        const nextClock = formatTimeClock(world.timeMinutes);
        setHud((prev) => {
          const nextNightWarn =
            world.timeMinutes >= NIGHT_START_MINUTES && world.wildlife.length > 0;
          const nextPromptAction = isNearFarmhouse(world)
            ? 'sleep'
            : isNearShopStall(world)
            ? 'shop'
            : isNearWell(world)
            ? 'well'
            : isNearShippingBin(world)
            ? 'bin'
            : null;
          if (
            prev.timeClock === nextClock &&
            prev.day === world.day &&
            prev.gold === world.player.gold &&
            prev.health === world.player.health &&
            prev.stamina === world.player.stamina &&
            prev.waterLevel === world.player.waterLevel &&
            prev.nightWarning === nextNightWarn &&
            (prev.nearPrompt?.action ?? null) === nextPromptAction
          ) {
            return prev;
          }
          return buildHudSnapshot(world);
        });
      }

      cancelFrame = scene3d.scheduleNextFrame(tick);
    };

    cancelFrame = scene3d.scheduleNextFrame(tick);
    return () => {
      cancelFrame?.();
      ro.disconnect();
      scene3d.dispose();
      scene3dRef.current = null;
    };
  }, [addFloatingText, announceBlind, saveFarm, sendWs, spawnParticleBurst, syncHud, triggerSleep]);

  const screenToTile = (clientX: number, clientY: number): { x: number; y: number } | null => {
    return scene3dRef.current?.screenToTile(clientX, clientY, worldRef.current) ?? null;
  };

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#1b1612]">
      {/* Isolated 3D WebGL Canvas Mount */}
      <div
        ref={containerRef}
        className="absolute inset-0 w-full h-full touch-none cursor-crosshair"
        onContextMenu={(e) => e.preventDefault()}
        onWheel={(e) => {
          const s3d = scene3dRef.current;
          if (!s3d || phase !== 'playing' || activeModal !== 'none') return;
          s3d.userZoomMultiplier = Math.max(
            0.65,
            Math.min(1.7, s3d.userZoomMultiplier + e.deltaY * 0.0008)
          );
        }}
        onPointerMove={(e) => {
          if (orbitDragRef.current?.active && scene3dRef.current) {
            const dx = e.clientX - orbitDragRef.current.lastX;
            orbitDragRef.current.lastX = e.clientX;
            scene3dRef.current.cameraYaw = Math.max(
              -0.65,
              Math.min(0.65, scene3dRef.current.cameraYaw - dx * 0.006)
            );
            return;
          }
          if (phase !== 'playing' || activeModal !== 'none') return;
          hoverTileRef.current = screenToTile(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          orbitDragRef.current = null;
        }}
        onPointerLeave={() => {
          orbitDragRef.current = null;
          hoverTileRef.current = null;
        }}
        onPointerDown={(e) => {
          if (phase !== 'playing' || activeModal !== 'none') return;
          if (e.button === 2) {
            orbitDragRef.current = { active: true, lastX: e.clientX };
            return;
          }
          const tileCoords = screenToTile(e.clientX, e.clientY);
          if (tileCoords) {
            handleTileClickAction(tileCoords.x, tileCoords.y);
          }
        }}
      />

      <OfflineBanner lang={lang} />

      {phase === 'title' && (
        <TitleScreen
          hasSavedFarm={hasSavedFarm}
          lang={lang}
          isFullscreen={isFullscreen}
          isPortraitMobile={isPortraitMobile}
          blindMode={blindMode}
          blindCaption={blindCaption}
          versionCheckStatus={versionStatus}
          versionCooldownSec={versionCooldownSec}
          onRecheckVersion={() => void runStartupVersionCheck(true)}
          onSelectLanguage={selectLanguage}
          onToggleFullscreen={() => void toggleFullscreen()}
          onToggleBlindMode={toggleBlindMode}
          onRequestLandscape={() => void requestOptimalDisplay(true)}
          onStartNew={startNewFarm}
          onContinue={continueFarm}
          onOpenMultiplayerRooms={() => {
            if (versionRequiredRef.current) return;
            audioEngine.playSfx('click');
            setRoomsError(null);
            setShowRoomsModal(true);
          }}
        />
      )}

      {phase === 'title' && showRoomsModal && !updateRequired && (
        <RoomsModal
          lang={lang}
          loading={roomsLoading}
          error={roomsError}
          rooms={publicRooms}
          initialRoomCode={inviteRoomCode}
          onRefreshRooms={(serverUrl, silent) => void refreshPublicRooms(serverUrl, silent)}
          onCreateRoom={({ playerName, roomName, isPublic, serverUrl }) => {
            connectAndSendRoomAction(
              {
                type: 'room:create',
                playerName,
                roomName,
                isPublic,
                clientId: getOrCreateClientId(),
              },
              { serverUrl, roomContext: { code: '', playerName, serverUrl } }
            );
          }}
          onJoinRoom={({ code, playerName, serverUrl }) => {
            connectAndSendRoomAction(
              {
                type: 'room:join',
                code,
                playerName,
                clientId: getOrCreateClientId(),
              },
              { serverUrl, roomContext: { code, playerName, serverUrl } }
            );
          }}
          onClose={() => {
            audioEngine.playSfx('click');
            setShowRoomsModal(false);
          }}
        />
      )}

      {phase !== 'title' && (
        <GameHUD
          hud={hud}
          lang={lang}
          muted={muted}
          touchControlsEnabled={touchControlsEnabled}
          isFullscreen={isFullscreen}
          blindMode={blindMode}
          blindCaption={blindCaption}
          morningSummary={morningSummary}
          dailyOrderReady={Boolean(
            worldRef.current.dailyOrder &&
              !worldRef.current.dailyOrder.completed &&
              (hud.inventory[worldRef.current.dailyOrder.cropId] ?? 0) >=
                worldRef.current.dailyOrder.requiredQty
          )}
          harvestCombo={worldRef.current.harvestCombo ?? 0}
          sprintActive={sprintActive}
          roomHud={gameMode === 'multiplayer' ? roomHud : null}
          chatOpen={chatOpen}
          unreadChatCount={unreadChatCount}
          voiceLocal={gameMode === 'multiplayer' ? voiceLocal : undefined}
          onToggleChat={() =>
            setChatOpen((v) => {
              const next = !v;
              if (next) setUnreadChatCount(0);
              return next;
            })
          }
          onSendChat={(text) => sendWs({ type: 'action:chat', text })}
          onSendEmote={triggerEmote}
          onToggleSleepVote={triggerSleep}
          onJoinOrToggleVoiceMic={() => void handleJoinOrToggleVoiceMic()}
          onLeaveVoice={handleLeaveVoice}
          onToggleVoiceDeafen={handleToggleVoiceDeafen}
          onTogglePeerVoiceMute={handleTogglePeerVoiceMute}
          onDismissVoiceNotice={() => setVoiceLocal((prev) => ({ ...prev, notice: null }))}
          onLeaveRoom={() => {
            disconnectMultiplayer(true, true);
            setActiveModal('none');
            setPhase('title');
            audioEngine.pauseAmbientMusic();
          }}
          onSelectHotbar={(idx) => {
            worldRef.current.player.selectedHotbarIndex = idx;
            audioEngine.playSfx('click');
            if (blindModeRef.current) {
              const itemId = worldRef.current.hotbar[idx];
              announceBlind(
                itemId ? getItemLabel(itemId, langRef.current).name : UI_TEXT[langRef.current].emptySlot,
                true
              );
            }
            syncHud();
          }}
          onTriggerNearPrompt={handleInteract}
          onOpenMissions={() => {
            audioEngine.playSfx('click');
            setActiveModal((prev) => (prev === 'missions' ? 'none' : 'missions'));
          }}
          onOpenShop={() => {
            audioEngine.playSfx('click');
            setShopInitialTab('seeds');
            setActiveModal((prev) => (prev === 'shop' ? 'none' : 'shop'));
          }}
          onOpenCraft={() => {
            audioEngine.playSfx('click');
            setActiveModal((prev) => (prev === 'craft' ? 'none' : 'craft'));
          }}
          onOpenNasa={() => {
            audioEngine.playSfx('click');
            setActiveModal((prev) => {
              const next = prev === 'nasa' ? 'none' : 'nasa';
              if (blindModeRef.current && next === 'nasa') {
                announceBlind(UI_TEXT[langRef.current].nasaModalTitle, true);
              }
              return next;
            });
          }}
          onOpenAlmanac={() => {
            audioEngine.playSfx('click');
            setActiveModal((prev) => {
              const next = prev === 'almanac' ? 'none' : 'almanac';
              if (blindModeRef.current && next === 'almanac') {
                announceBlind(UI_TEXT[langRef.current].almanacTitle, true);
              }
              return next;
            });
          }}
          onSleepNow={triggerSleep}
          onToggleSprint={() => {
            setSprintActive((prev) => {
              const next = !prev;
              if (next) audioEngine.playSfx('dash');
              else audioEngine.playSfx('click');
              return next;
            });
          }}
          onToggleMute={() => {
            const next = !audioEngine.isMuted();
            audioEngine.setMuted(next);
            setMuted(next);
          }}
          onToggleTouchControls={() => {
            touchManualOverrideRef.current = true;
            setTouchControlsEnabled((prev) => !prev);
          }}
          onToggleFullscreen={() => void toggleFullscreen()}
          onToggleBlindMode={toggleBlindMode}
          onBlindScan={handleBlindScan}
          onBlindGuide={handleBlindGuide}
          onBlindStatus={handleBlindStatus}
          onPause={() => {
            keysPressedRef.current.clear();
            setPhase('paused');
            audioEngine.pauseAmbientMusic();
            saveFarm();
          }}
          onDismissSummary={() => setMorningSummary(null)}
        />
      )}

      {phase === 'playing' && activeModal === 'none' && !futureDispatch && (
        <TouchControls
          visible={touchControlsEnabled}
          lang={lang}
          nearPromptLabel={hud.nearPrompt?.label ?? null}
          onVectorChange={handleJoystickVector}
          onUseTool={() => {
            const p = worldRef.current.player;
            const fx = Math.abs(p.facingX) >= Math.abs(p.facingY) ? Math.sign(p.facingX) : 0;
            const fy = fx === 0 ? Math.sign(p.facingY || 1) : 0;
            handleTileClickAction(Math.floor(p.x + fx * 0.85), Math.floor(p.y + fy * 0.85));
          }}
          onInteract={handleInteract}
        />
      )}

      {phase === 'playing' && activeModal === 'missions' && (
        <MissionsModal
          world={worldRef.current}
          lang={lang}
          onClaim={(id: MissionId) => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:mission_claim', id });
              return;
            }
            const res = claimMissionReward(worldRef.current, id);
            audioEngine.playSfx(res.ok ? 'coin' : 'error');
            if (res.ok) {
              addFloatingText(
                worldRef.current.player.x * TILE_SIZE,
                (worldRef.current.player.y - 1) * TILE_SIZE,
                UI_TEXT[langRef.current].missionClaimed,
                '#ffe473'
              );
              saveFarm();
            }
            syncHud();
          }}
          onClose={() => {
            audioEngine.playSfx('click');
            setActiveModal('none');
          }}
        />
      )}

      {phase === 'playing' && activeModal === 'shop' && (
        <ShopModal
          lang={lang}
          initialTab={shopInitialTab}
          gold={hud.gold}
          season={hud.season}
          inventory={hud.inventory}
          upgrades={worldRef.current.upgrades}
          chickensCount={worldRef.current.chickens?.length ?? 0}
          cowsCount={worldRef.current.cows?.length ?? 0}
          sheepCount={worldRef.current.sheep?.length ?? 0}
          hasDog={Boolean(worldRef.current.dog)}
          marketSurgeCrop={worldRef.current.marketSurgeCrop}
          dailyOrder={worldRef.current.dailyOrder}
          onFulfillOrder={() => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:order_fulfill' });
              return;
            }
            const res = fulfillDailyOrder(worldRef.current);
            audioEngine.playSfx(res.ok ? 'coin' : 'error');
            if (res.ok) {
              addFloatingText(
                worldRef.current.player.x * TILE_SIZE,
                (worldRef.current.player.y - 1) * TILE_SIZE,
                `+${res.earnedGold}g`,
                '#fde047'
              );
              if (res.leveledUpTo) {
                audioEngine.playSfx('levelup');
                const lvlMsg = UI_TEXT[langRef.current].levelUpToast.replace('{n}', String(res.leveledUpTo));
                addFloatingText(
                  worldRef.current.player.x * TILE_SIZE,
                  (worldRef.current.player.y - 1.6) * TILE_SIZE,
                  lvlMsg,
                  '#fde047'
                );
              }
              saveFarm();
            }
            syncHud();
          }}
          onBuyItem={(id: ItemId, qty: number) => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:shop_buy', itemId: id, qty });
              return;
            }
            const res = buyShopItem(worldRef.current, id, qty);
            audioEngine.playSfx(res.ok ? 'coin' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onSellItem={(id: ItemId, qty: number) => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:shop_sell', itemId: id, qty });
              return;
            }
            const res = sellCropItem(worldRef.current, id, qty);
            audioEngine.playSfx(res.ok ? 'coin' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onUpgradeTool={(tool: ToolType) => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:upgrade_tool', tool });
              return;
            }
            const res = upgradeTool(worldRef.current, tool);
            audioEngine.playSfx(res.ok ? 'harvest' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onBuyChicken={() => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:buy_animal', kind: 'chicken' });
              return;
            }
            const res = buyFarmChicken(worldRef.current);
            audioEngine.playSfx(res.ok ? 'harvest' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onBuyCow={() => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:buy_animal', kind: 'cow' });
              return;
            }
            const res = buyDairyCow(worldRef.current);
            audioEngine.playSfx(res.ok ? 'harvest' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onBuySheep={() => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:buy_animal', kind: 'sheep' });
              return;
            }
            const res = buyFluffySheep(worldRef.current);
            audioEngine.playSfx(res.ok ? 'harvest' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onBuyDog={() => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:buy_animal', kind: 'dog' });
              return;
            }
            const res = buyGuardDog(worldRef.current);
            audioEngine.playSfx(res.ok ? 'bark' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onClose={() => {
            audioEngine.playSfx('click');
            setActiveModal('none');
          }}
        />
      )}

      {phase === 'playing' && activeModal === 'craft' && (
        <CraftModal
          lang={lang}
          gold={hud.gold}
          inventory={hud.inventory}
          hotbar={hud.hotbar}
          onCraft={(id: PlaceableType | 'fertilizer') => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:craft', id });
              return;
            }
            const res = craftItem(worldRef.current, id);
            audioEngine.playSfx(res.ok ? 'place' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onEatCrop={(id: ItemId) => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:eat', id });
              return;
            }
            const res = eatCrop(worldRef.current, id);
            audioEngine.playSfx(res.ok ? 'harvest' : 'error');
            if (res.ok) saveFarm();
            syncHud();
          }}
          onAssignHotbar={(id: ItemId, slotIdx: number) => {
            if (gameModeRef.current === 'multiplayer') {
              sendWs({ type: 'action:assign_hotbar', id, slotIdx });
              audioEngine.playSfx('click');
              return;
            }
            const world = worldRef.current;
            world.hotbar = world.hotbar.map((item) => (item === id ? null : item));
            world.hotbar[slotIdx] = id;
            world.player.selectedHotbarIndex = slotIdx;
            audioEngine.playSfx('click');
            saveFarm();
            syncHud();
          }}
          onClose={() => {
            audioEngine.playSfx('click');
            setActiveModal('none');
          }}
        />
      )}

      {phase === 'playing' && activeModal === 'nasa' && (
        <NasaObservatoryModal
          world={worldRef.current}
          lang={lang}
          onClose={() => {
            audioEngine.playSfx('click');
            setActiveModal('none');
          }}
        />
      )}

      {phase === 'playing' && activeModal === 'almanac' && (
        <AlmanacModal
          world={worldRef.current}
          lang={lang}
          onClose={() => {
            audioEngine.playSfx('click');
            setActiveModal('none');
          }}
        />
      )}

      {phase === 'playing' && futureDispatch && (
        <FutureMessageModal
          dispatch={futureDispatch}
          lang={lang}
          onClose={() => {
            audioEngine.playSfx('click');
            setFutureDispatch(null);
          }}
        />
      )}

      {(phase === 'paused' || phase === 'gameover') && (
        <StatusModal
          mode={
            phase === 'paused'
              ? 'paused'
              : worldRef.current.outcome === 'restored'
              ? 'restored'
              : 'exhausted'
          }
          lang={lang}
          stats={worldRef.current.stats}
          restorationPct={hud.restorationPct}
          gold={hud.gold}
          earnedBadges={getEarnedBadges(worldRef.current)}
          touchControlsEnabled={touchControlsEnabled}
          blindMode={blindMode}
          onToggleTouchControls={() => {
            touchManualOverrideRef.current = true;
            setTouchControlsEnabled((prev) => !prev);
          }}
          onSelectLanguage={selectLanguage}
          onToggleBlindMode={toggleBlindMode}
          onResume={() => {
            if (worldRef.current.outcome === 'restored') {
              worldRef.current.restorationVictoryDismissed = true;
              worldRef.current.outcome = 'none';
              saveFarm();
            }
            keysPressedRef.current.clear();
            setPhase('playing');
            audioEngine.startAmbientMusic();
          }}
          onRestart={startNewFarm}
          isMultiplayer={gameMode === 'multiplayer'}
          onReturnTitle={() => {
            if (gameModeRef.current === 'multiplayer') {
              disconnectMultiplayer(true, true);
            } else {
              saveFarm();
            }
            setActiveModal('none');
            setPhase('title');
            audioEngine.pauseAmbientMusic();
          }}
        />
      )}

      {showNetDebug && (
        <NetDebugPanel
          onClose={() => setShowNetDebug(false)}
          onPingNow={triggerManualNetPing}
          onProbeHttp={async () => {
            await netDebug.probeHttp(activeRoomRef.current?.serverUrl);
          }}
        />
      )}

      {updateRequired && versionManifest && (
        <ForceUpdateModal
          lang={lang}
          manifest={versionManifest}
          checking={versionChecking}
          updating={versionUpdating}
          progress={versionUpdateProgress}
          updateError={versionUpdateError}
          recheckOffline={versionRecheckOffline}
          cooldownSec={versionCooldownSec}
          blindMode={blindMode}
          blindCaption={blindCaption}
          onSelectLanguage={selectLanguage}
          onToggleBlindMode={toggleBlindMode}
          onUpdateNow={() => void handleVersionUpdateNow()}
          onRecheck={() => void runStartupVersionCheck(true)}
        />
      )}
    </main>
  );
}
