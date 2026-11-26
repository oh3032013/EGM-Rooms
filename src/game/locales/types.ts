import type { BadgeId, ItemId, MissionId, PlaceableType, Season, WeatherType } from '../types';

export type ExtraLanguage = 'fr' | 'es' | 'de' | 'it' | 'pt' | 'tr' | 'ru' | 'ja' | 'ko' | 'zh';

export interface LanguageOption {
  code: 'en' | 'ar' | ExtraLanguage;
  nativeName: string;
  englishName: string;
  dir: 'ltr' | 'rtl';
  speechLang: string;
}

export interface UiTextMap {
  brandTitle: string;
  saveYourFarm: string;
  startNow: string;
  teamBtn: string;
  exitBtn: string;
  teamTitle: string;
  teamSubtitle: string;
  exitTitle: string;
  exitBody: string;
  backToMenu: string;
  tagline: string;
  continueFarm: string;
  newFarm: string;
  startFarming: string;
  controlsDesktop: string;
  controlsMobile: string;
  langSwitch: string;
  restored: string;
  lowStam: string;
  rest: string;
  dayWord: string;
  nightWarning: string;
  emptySlot: string;
  ok: string;
  shop: string;
  craft: string;
  missions: string;
  droughtHit: string;
  stormProtectionHint: string;
  staminaLowHint: string;
  exhaustedToast: string;
  missionClaimed: string;
  missionsModalTitle: string;
  missionsModalSub: string;
  completedCount: string;
  claimReward: string;
  claimed: string;
  inProgress: string;
  rewardLabel: string;
  staminaBonus: string;
  shopTitle: string;
  shopSub: string;
  seedsTab: string;
  sellTab: string;
  upgradesTab: string;
  inSeason: string;
  owned: string;
  buy1: string;
  buy: string;
  emptyBasket: string;
  seasonBonus: string;
  sellsFor: string;
  each: string;
  sell1: string;
  sellAll: string;
  toolUpgrades: string;
  defensesDecor: string;
  tierIron: string;
  tierCopper: string;
  tierMaster: string;
  maxTier: string;
  upgrade: string;
  hoeName: string;
  hoeBenefit: string;
  canName: string;
  canBenefit: string;
  axeName: string;
  axeBenefit: string;
  craftTitle: string;
  wood: string;
  stone: string;
  gold: string;
  craftTab: string;
  satchelTab: string;
  requires: string;
  craftBtn: string;
  assignSlot: string;
  cancel: string;
  eatBtn: string;
  moveBtn: string;
  equipBtn: string;
  pausedTitle: string;
  pausedSub: string;
  restoredTitle: string;
  restoredSub: string;
  exhaustedTitle: string;
  exhaustedSub: string;
  daysStat: string;
  harvestedStat: string;
  restoredStat: string;
  touchControlsLabel: string;
  on: string;
  off: string;
  languageLabel: string;
  resume: string;
  continueFarming: string;
  tryAgain: string;
  restartMission: string;
  titleScreen: string;
  installAndroid: string;
  addToIphone: string;
  installTitleAndroid: string;
  installTitleIOS: string;
  offlineBanner: string;
  gotIt: string;
  dpadLabel: string;
  stickLabel: string;
  actLabel: string;
  useLabel: string;
  livestockHeader: string;
  chickenName: string;
  chickenDesc: string;
  adoptChicken: string;
  coopFull: string;
  fullscreenBtn: string;
  exitFullscreenBtn: string;
  rotateLandscapeHint: string;
  enableLandscapeBtn: string;
  blindModeBtn: string;
  blindModeOn: string;
  blindModeOff: string;
  blindScanBtn: string;
  blindGuideBtn: string;
  blindStatusBtn: string;
  nasaBtn: string;
  nasaModalTitle: string;
  nasaModalSub: string;
  nasaDisclaimer: string;
  nasaStationTelemetryTitle: string;
  nasaNoStationHint: string;
  soilMoistureLabel: string;
  tempLabel: string;
  tomorrowLabel: string;
  futureMsgTitle: string;
  futureMsgSub: string;
  futureMsgDismiss: string;
  waterSavedLabel: string;
  litersUnit: string;
  coreMissionsHeader: string;
  nasaMissionsHeader: string;
  badgesHeader: string;
  unlockedBadge: string;
  lockedBadge: string;
  badgeUnlockedToast: string;
  heatwaveHit: string;
  rainCollectedToast: string;
  controlsDesktopNasa: string;
  dailyOrderTitle: string;
  dailyOrderSub: string;
  deliverOrderBtn: string;
  orderDoneLabel: string;
  orderReadyHud: string;
  sprintBtn: string;
  comboToast: string;
  treasureGoldToast: string;
  treasureSeedToast: string;
  goldenHarvestToast: string;
  almanacBtn: string;
  almanacTitle: string;
  almanacSub: string;
  farmerLevelLabel: string;
  xpLabel: string;
  marketSurgeLabel: string;
  marketSurgeBadge: string;
  discoveredLabel: string;
  cowName: string;
  cowDesc: string;
  sheepName: string;
  sheepDesc: string;
  dogName: string;
  dogDesc: string;
  extendedMissionsHeader: string;
  levelUpToast: string;
  dogBarkToast: string;
  almanacCropsTab: string;
  almanacArtisanTab: string;
  singleplayerBtn: string;
  continueSingleplayer: string;
  multiplayerRoomsBtn: string;
  roomsModalTitle: string;
  roomsModalSub: string;
  playerNameLabel: string;
  playerNamePlaceholder: string;
  createRoomTab: string;
  joinRoomTab: string;
  roomNameLabel: string;
  roomNamePlaceholder: string;
  publicRoomLabel: string;
  privateRoomLabel: string;
  createAndPlayBtn: string;
  joinByCodeLabel: string;
  roomCodePlaceholder: string;
  joinRoomBtn: string;
  publicRoomsHeader: string;
  refreshRoomsBtn: string;
  noPublicRooms: string;
  playersCountLabel: string;
  hostLabel: string;
  roomBadgeLabel: string;
  copyCodeBtn: string;
  codeCopiedToast: string;
  copyLinkBtn: string;
  linkCopiedToast: string;
  leaveRoomBtn: string;
  chatBtn: string;
  chatPlaceholder: string;
  noChatYet: string;
  sendChatBtn: string;
  sleepVoteReady: string;
  sleepVoteWaiting: string;
  sleepReadyBtn: string;
  sleepCancelBtn: string;
  playerJoinedToast: string;
  playerLeftToast: string;
  reconnectingToast: string;
  roomErrorNotFound: string;
  roomErrorFull: string;
  roomErrorConnect: string;
  roomErrorClosed: string;
  roomErrorTimeout: string;
  customServerLabel: string;
  customServerHint: string;
  serverDefaultBtn: string;
  voiceJoinBtn: string;
  voiceLeaveBtn: string;
  voiceMicOnBtn: string;
  voiceMicOffBtn: string;
  voiceDeafenBtn: string;
  voiceUndeafenBtn: string;
  voiceActiveLabel: string;
  voiceSpeakingLabel: string;
  voiceMutedLabel: string;
  voiceErrorPermission: string;
  voiceErrorUnsupported: string;
  voiceListenOnlyToast: string;
  voiceMutePeerBtn: string;
  voiceUnmutePeerBtn: string;
  forceUpdateTitle: string;
  forceUpdateSubtitle: string;
  forceUpdateCurrentVer: string;
  forceUpdateRequiredVer: string;
  forceUpdateLatestVer: string;
  forceUpdateBtn: string;
  forceUpdateRecheckBtn: string;
  forceUpdateChecking: string;
  forceUpdateOfflineRetry: string;
  forceUpdateSaveSafe: string;
  forceUpdateDownloading: string;
  forceUpdateProgressFiles: string;
  forceUpdateServerOnlyMsg: string;
  forceUpdateModeServerOnly: string;
  forceUpdateModeDelta: string;
  forceUpdateReadyReload: string;
  tierEmerald: string;
  catName: string;
  catDesc: string;
  duckName: string;
  duckDesc: string;
  festivalBanner: string;
  quickEatBtn: string;
  resetCamBtn: string;
  frostHit: string;
}

export type LegacyUiTextMap = Omit<
  UiTextMap,
  | 'tierEmerald'
  | 'catName'
  | 'catDesc'
  | 'duckName'
  | 'duckDesc'
  | 'festivalBanner'
  | 'quickEatBtn'
  | 'resetCamBtn'
  | 'frostHit'
>;

export interface LocalePack {
  ui: UiTextMap;
  seasons: Record<Season, string>;
  weathers: Record<WeatherType, string>;
  timePeriod: { am: string; pm: string };
  nearPrompts: Record<'sleep' | 'shop' | 'well' | 'bin', string>;
  items: Record<ItemId, { name: string; description: string; roleClue: string }>;
  recipes: Partial<Record<PlaceableType | 'fertilizer', { name: string; description: string }>>;
  missions: Record<MissionId, { title: string; desc: string }>;
  badges: Record<BadgeId, { title: string; desc: string }>;
  morning: {
    cropsGrown: string;
    rainbow: string;
    sprinkler: string;
    drip: string;
    rain: string;
    eggs: string;
    duckEggs: string;
    milk: string;
    wool: string;
    honey: string;
    cheese: string;
    jam: string;
    pies: string;
    windmill: string;
    solar: string;
    catGold: string;
    catFish: string;
    birdSeeds: string;
    frosted: string;
    festival: string;
    withered: string;
    wildlife: string;
    fallback: string;
  };
  feedback: {
    harvestBee: string;
    harvestFert: string;
    harvestPlain: string;
    wishingGift: string;
    dripRow: string;
    placed: string;
    exact: Record<string, string>;
  };
  switchedMsg: string;
}

export type LegacyItemId = Exclude<
  ItemId,
  | 'sunflower_seed'
  | 'blueberry_seed'
  | 'chili_seed'
  | 'bakery_oven'
  | 'seed_maker'
  | 'solar_panel'
  | 'campfire'
  | 'greenhouse_dome'
  | 'birdhouse'
  | 'duck_egg'
  | 'farmer_pie'
  | 'sunflower'
  | 'blueberry'
  | 'chili'
>;

export type LegacyMissionId = Exclude<
  MissionId,
  | 'sunflower_berry'
  | 'bake_pie'
  | 'seed_miller'
  | 'clean_energy'
  | 'pond_companions'
  | 'emerald_tools'
>;

export type LegacyBadgeId = Exclude<BadgeId, 'artisan_baker' | 'eco_engineer' | 'wildlife_ranger'>;

export interface LegacyLocalePack {
  ui: LegacyUiTextMap;
  seasons: Record<Season, string>;
  weathers: Record<Exclude<WeatherType, 'Frost'>, string>;
  timePeriod: { am: string; pm: string };
  nearPrompts: Record<'sleep' | 'shop' | 'well' | 'bin', string>;
  items: Record<LegacyItemId, { name: string; description: string; roleClue: string }>;
  recipes: Partial<Record<PlaceableType | 'fertilizer', { name: string; description: string }>>;
  missions: Record<LegacyMissionId, { title: string; desc: string }>;
  badges: Record<LegacyBadgeId, { title: string; desc: string }>;
  morning: Omit<
    LocalePack['morning'],
    'duckEggs' | 'pies' | 'solar' | 'catGold' | 'catFish' | 'birdSeeds' | 'frosted' | 'festival'
  >;
  feedback: LocalePack['feedback'];
  switchedMsg: string;
}
