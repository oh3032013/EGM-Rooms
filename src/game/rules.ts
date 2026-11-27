import {
  BEEHIVE_RADIUS,
  CAT_PRICE,
  CHICKEN_PRICE,
  COMPOST_RADIUS,
  COW_PRICE,
  CRAFT_RECIPES,
  CROPS,
  DAYS_PER_SEASON,
  DAY_END_MINUTES,
  DAY_START_MINUTES,
  DOG_PRICE,
  DRIP_WATER_SAVED_PER_TILE,
  FARMHOUSE_DOOR,
  FARMHOUSE_POS,
  FISHING_COOLDOWN_MS,
  GREENHOUSE_HALF_EXTENT,
  GRID_HEIGHT,
  GRID_WIDTH,
  HOMESTEAD_PORTAL_POS,
  HOMESTEAD_STRANGE_ZONE_POS,
  ITEMS,
  LITERS_PER_WATERING,
  MAX_CATS,
  MAX_CHICKENS,
  MAX_COWS,
  MAX_DOGS,
  MAX_SHEEP,
  MESSAGES_FROM_2040,
  MISSIONS,
  NIGHT_START_MINUTES,
  PLACEABLE_MAX_HP,
  RAIN_TANK_MAX_CHARGES,
  REALM_DEFS,
  SCARECROW_RADIUS,
  SEASONS,
  SENSITIVE_CROPS,
  SENSOR_RADIUS,
  SHADE_NET_HALF_EXTENT,
  SHEEP_PRICE,
  SHIPPING_BIN_POS,
  SHOP_STALL_POS,
  SPRINKLER_RADIUS,
  SUNSET_START_MINUTES,
  WELL_POS,
  WINDMILL_DAILY_GOLD,
  WISHING_FOUNTAIN_COST,
} from './constants.ts';
import {
  ECO_QUIZ_QUESTIONS,
  LUCKY_WHEEL_REWARDS,
  sanitizePetName,
  type LuckyWheelRewardDef,
} from './funFeatures.ts';
import type {
  BadgeId,
  CropType,
  DailyOrder,
  DaySummary,
  FarmChicken,
  FarmTile,
  FireflyEntity,
  FutureDispatch,
  GameWorldState,
  ItemId,
  LivestockEntity,
  MissionId,
  MysteryChest,
  NatureTreasure,
  ObstacleType,
  PlaceableType,
  RealmCache,
  RealmCreatureEntity,
  RealmCreatureKind,
  RealmId,
  Season,
  TimePhase,
  ToolType,
  WeatherType,
  WildlifeEntity,
} from './types.ts';

export function getSeason(seasonIndex: number): Season {
  return SEASONS[((seasonIndex % SEASONS.length) + SEASONS.length) % SEASONS.length];
}

export function getDayOfSeason(day: number): number {
  return ((day - 1) % DAYS_PER_SEASON) + 1;
}

export function getTimePhase(timeMinutes: number): TimePhase {
  if (timeMinutes >= NIGHT_START_MINUTES) return 'Night';
  if (timeMinutes >= SUNSET_START_MINUTES) return 'Sunset';
  return 'Day';
}

export function formatTimeClock(timeMinutes: number): string {
  const clamped = Math.floor(timeMinutes) % 1440;
  const hrs24 = Math.floor(clamped / 60);
  const mins = Math.floor((clamped % 60) / 10) * 10;
  const period = hrs24 >= 12 ? 'PM' : 'AM';
  const hrs12 = hrs24 % 12 === 0 ? 12 : hrs24 % 12;
  return `${hrs12}:${mins.toString().padStart(2, '0')} ${period}`;
}

export function getTileIndex(x: number, y: number, width = GRID_WIDTH): number {
  return y * width + x;
}

export function getTile(state: GameWorldState, x: number, y: number): FarmTile | null {
  if (x < 0 || y < 0 || x >= state.width || y >= state.height) return null;
  return state.tiles[y * state.width + x] ?? null;
}

export function isTileWalkable(state: GameWorldState, tx: number, ty: number): boolean {
  const tile = getTile(state, tx, ty);
  if (!tile) return false;
  if (
    tile.terrain === 'forest_edge' ||
    tile.terrain === 'water' ||
    tile.terrain === 'farmhouse' ||
    tile.terrain === 'shop_stall' ||
    tile.terrain === 'shipping_bin' ||
    tile.terrain === 'well' ||
    tile.terrain === 'portal' ||
    tile.terrain === 'village_hut' ||
    tile.terrain === 'village_elder' ||
    tile.terrain === 'strange_zone'
  ) {
    return false;
  }
  if (tile.obstacle === 'rock' || tile.obstacle === 'stump') return false;
  if (tile.structure && tile.structure.type !== 'stone_path' && tile.structure.type !== 'flowerbed') {
    return false;
  }
  return true;
}

export function isNearFarmhouse(state: GameWorldState): boolean {
  if ((state.activeRealm ?? 'homestead') !== 'homestead') return false;
  const dx = state.player.x - (FARMHOUSE_DOOR.x + 0.5);
  const dy = state.player.y - (FARMHOUSE_DOOR.y + 0.5);
  return Math.hypot(dx, dy) <= 1.85;
}

export function isNearShopStall(state: GameWorldState): boolean {
  if ((state.activeRealm ?? 'homestead') !== 'homestead') return false;
  const cx = SHOP_STALL_POS.x + SHOP_STALL_POS.w / 2;
  const cy = SHOP_STALL_POS.y + SHOP_STALL_POS.h + 0.5;
  return Math.hypot(state.player.x - cx, state.player.y - cy) <= 2.3;
}

export function isNearShippingBin(state: GameWorldState): boolean {
  if ((state.activeRealm ?? 'homestead') !== 'homestead') return false;
  return Math.hypot(state.player.x - (SHIPPING_BIN_POS.x + 0.5), state.player.y - (SHIPPING_BIN_POS.y + 0.5)) <= 1.8;
}

export function isNearWell(state: GameWorldState): boolean {
  if ((state.activeRealm ?? 'homestead') !== 'homestead') return false;
  return Math.hypot(state.player.x - (WELL_POS.x + 0.5), state.player.y - (WELL_POS.y + 0.5)) <= 1.9;
}

export function findPortalTile(state: GameWorldState): FarmTile | null {
  return state.tiles.find((t) => t.terrain === 'portal') ?? null;
}

export function isNearPortal(state: GameWorldState): boolean {
  const pt = findPortalTile(state);
  if (!pt) return false;
  return Math.hypot(state.player.x - (pt.x + 0.5), state.player.y - (pt.y + 0.5)) <= 2.05;
}

export function findVillageElderTile(state: GameWorldState): FarmTile | null {
  return state.tiles.find((t) => t.terrain === 'village_elder') ?? null;
}

export function isNearVillageElder(state: GameWorldState): boolean {
  const et = findVillageElderTile(state);
  if (!et) return false;
  return Math.hypot(state.player.x - (et.x + 0.5), state.player.y - (et.y + 0.5)) <= 2.2;
}

export function findStrangeZoneTile(state: GameWorldState): FarmTile | null {
  return state.tiles.find((t) => t.terrain === 'strange_zone') ?? null;
}

export function isNearStrangeZone(state: GameWorldState): boolean {
  const st = findStrangeZoneTile(state);
  if (!st) return false;
  return Math.hypot(state.player.x - (st.x + 0.5), state.player.y - (st.y + 0.5)) <= 2.2;
}

export function createInitialFarmState(seed = 42): GameWorldState {
  // Deterministic LCG PRNG for reproducible initial neglected farm
  let s = seed >>> 0;
  const rand = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const tiles: FarmTile[] = [];
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      let terrain: FarmTile['terrain'] = 'grass';
      let tillable = false;
      let obstacle: ObstacleType | null = null;
      let structure: FarmTile['structure'] = null;
      let tilled = false;

      // Perimeter forest border
      if (x === 0 || y === 0 || x === GRID_WIDTH - 1 || y === GRID_HEIGHT - 1) {
        terrain = 'forest_edge';
      } else if (
        x >= FARMHOUSE_POS.x &&
        x < FARMHOUSE_POS.x + FARMHOUSE_POS.w &&
        y >= FARMHOUSE_POS.y &&
        y < FARMHOUSE_POS.y + FARMHOUSE_POS.h
      ) {
        terrain = 'farmhouse';
      } else if (
        x >= SHOP_STALL_POS.x &&
        x < SHOP_STALL_POS.x + SHOP_STALL_POS.w &&
        y >= SHOP_STALL_POS.y &&
        y < SHOP_STALL_POS.y + SHOP_STALL_POS.h
      ) {
        terrain = 'shop_stall';
      } else if (x === WELL_POS.x && y === WELL_POS.y) {
        terrain = 'well';
      } else if (x === SHIPPING_BIN_POS.x && y === SHIPPING_BIN_POS.y) {
        terrain = 'shipping_bin';
      } else if (x === HOMESTEAD_PORTAL_POS.x && y === HOMESTEAD_PORTAL_POS.y) {
        terrain = 'portal';
      } else if (x === HOMESTEAD_STRANGE_ZONE_POS.x && y === HOMESTEAD_STRANGE_ZONE_POS.y) {
        terrain = 'strange_zone';
      } else if (x >= 22 && x <= 25 && y >= 14 && y <= 17) {
        // Cozy natural pond in bottom-right corner
        terrain = 'water';
      } else if (
        // Dirt path from Ancient Portal & Farmhouse door to central farm & shop
        (y === 7 && x >= 2 && x <= 22) ||
        (x === 14 && y >= 7 && y <= 9) ||
        (y === 6 && x === 22)
      ) {
        terrain = 'dirt_path';
      }

      // Central farm plot zone (x: 5..20, y: 9..17)
      const inFarmPlot = terrain === 'grass' && x >= 5 && x <= 20 && y >= 9 && y <= 17;
      if (inFarmPlot) {
        tillable = true;
      }

      // Starter cleared square around (13..15, 9..11) + portal approach + strange cairn clearing
      const inStarterClearing =
        (x >= 11 && x <= 16 && y >= 7 && y <= 11) ||
        (x >= 2 && x <= 4 && y >= 5 && y <= 8) ||
        (x >= 24 && x <= 26 && y >= 2 && y <= 4);

      if (terrain === 'grass' && !inStarterClearing) {
        const r = rand();
        if (inFarmPlot) {
          if (r < 0.24) obstacle = 'weed';
          else if (r < 0.34) obstacle = 'rock';
          else if (r < 0.42) obstacle = 'stump';
        } else if (x >= 2 && x <= 25 && y >= 2 && y <= 18) {
          if (r < 0.14) obstacle = 'weed';
          else if (r < 0.20) obstacle = 'rock';
          else if (r < 0.27) obstacle = 'stump';
        }
      }

      // 3 starter tilled tiles right below the starter path so player immediately sees fertile soil
      if ((x === 13 || x === 14 || x === 15) && y === 10) {
        tilled = true;
        obstacle = null;
      }

      // A couple of weathered starter fences on the west edge of the plot
      if (x === 5 && (y === 10 || y === 11)) {
        structure = { type: 'fence', hp: PLACEABLE_MAX_HP.fence, maxHp: PLACEABLE_MAX_HP.fence };
        obstacle = null;
      }

      tiles.push({
        x,
        y,
        terrain,
        tillable,
        tilled,
        watered: false,
        droughtDriedToday: false,
        obstacle,
        crop: null,
        structure,
      });
    }
  }

  return {
    day: 1,
    seasonIndex: 0,
    timeMinutes: DAY_START_MINUTES,
    weather: 'Clear',
    forecastWeather: undefined,
    droughtMiddayTriggered: false,
    heatwaveMiddayTriggered: false,
    width: GRID_WIDTH,
    height: GRID_HEIGHT,
    tiles,
    activeRealm: 'homestead',
    unlockedRealms: ['homestead'],
    realmCaches: {},
    realmCreatures: [],
    visitedVillages: [],
    investigatedStrangeZones: [],
    elderGiftsToday: [],
    strangeZoneUsedToday: [],
    unlockedChapters: ['homestead'],
    player: {
      x: 14.5,
      y: 9.2, // Open clearing right above starter tilled plots (13..15, 10)
      facingX: 0,
      facingY: 1,
      walkCycle: 0,
      swingTimer: 0,
      swingTool: null,
      hitFlashTimer: 0,
      health: 100,
      maxHealth: 100,
      stamina: 100,
      maxStamina: 100,
      waterLevel: 12,
      maxWaterLevel: 12,
      gold: 85,
      selectedHotbarIndex: 0,
    },
    hotbar: [
      'hoe',
      'watering_can',
      'axe',
      'wheat_seed',
      'carrot_seed',
      'fence',
      'scarecrow',
      null,
      null,
    ],
    inventory: {
      hoe: 1,
      watering_can: 1,
      axe: 1,
      wheat_seed: 6,
      carrot_seed: 2,
      fence: 4,
      scarecrow: 1,
      wood: 6,
      stone: 2,
    },
    upgrades: {
      hoeLevel: 1,
      canLevel: 1,
      axeLevel: 1,
    },
    wildlife: [],
    chickens: [],
    cows: [],
    sheep: [],
    dog: null,
    cat: null,
    xp: 0,
    level: 1,
    swiftUntilMinutes: 0,
    marketSurgeCrop: rollMarketSurgeCrop(1, rand),
    rainbowActive: false,
    wishedToday: false,
    lastFishMs: 0,
    pettedAnimalsToday: [],
    dailyTreasure: rollDailyNatureTreasure(tiles, 'Spring', rand),
    mysteryChest: rollDailyMysteryChest(tiles, 'homestead', rand),
    fireflies: [],
    luckySpinUsedToday: false,
    ecoQuizAnsweredToday: false,
    rushUsedToday: false,
    petNames: {},
    discoveredItems: ['wheat_seed', 'carrot_seed'],
    stats: {
      daysSurvived: 1,
      cropsHarvested: 0,
      totalGoldEarned: 0,
      wildlifeRepelled: 0,
      obstaclesCleared: 0,
      seedsPlanted: 0,
      cropsWatered: 0,
      defensesPlaced: 0,
      sprinklersPlaced: 0,
      sensorsPlaced: 0,
      eggsCollected: 0,
      honeyCollected: 0,
      milkCollected: 0,
      woolCollected: 0,
      fishCaught: 0,
      koiCaught: 0,
      artisanProduced: 0,
      butterMade: 0,
      teaBrewed: 0,
      owlSaves: 0,
      wishesMade: 0,
      ordersCompleted: 0,
      treasuresFound: 0,
      nasaStationsPlaced: 0,
      beansHarvested: 0,
      rainwaterCollectedLiters: 0,
      waterSavedLiters: 0,
      heatwavesSurvivedWithShade: 0,
      realmsVisited: 1,
      villagesVisited: 0,
      strangeZonesFound: 0,
      firefliesCaught: 0,
      chestsOpened: 0,
      quizzesSolved: 0,
      wheelSpins: 0,
      rushCompleted: 0,
    },
    claimedMissions: [],
    rotationYieldProgress: 0,
    dailyOrder: generateDailyOrder(1, 'Spring', rand),
    harvestCombo: 0,
    lastHarvestMs: 0,
    lastSummary: null,
    restorationVictoryDismissed: false,
    outcome: 'none',
  };
}

export function rollDailyNatureTreasure(
  tiles: FarmTile[],
  season: Season,
  rng: () => number = Math.random
): NatureTreasure | null {
  const candidates = tiles.filter(
    (t) =>
      (t.terrain === 'grass' ||
        t.terrain === 'moss_floor' ||
        t.terrain === 'sand_dune' ||
        t.terrain === 'cloud_stone') &&
      !t.tilled &&
      !t.obstacle &&
      !t.crop &&
      !t.structure &&
      t.x >= 2 &&
      t.x <= 25 &&
      t.y >= 2 &&
      t.y <= 18
  );
  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(rng() * candidates.length)] ?? candidates[0];
  const kind =
    season === 'Winter' ? 'frost_bloom' : season === 'Autumn' ? 'mushroom' : 'clover';
  return { x: pick.x, y: pick.y, kind };
}

export function rollMarketSurgeCrop(day: number, rng: () => number = Math.random): CropType {
  const pool = Object.keys(CROPS) as CropType[];
  const idx = Math.floor((rng() + day * 0.13) * pool.length) % pool.length;
  return pool[Math.abs(idx)] ?? 'wheat';
}

export function getXpThreshold(level: number): number {
  return Math.max(1, level) * 100;
}

export function grantXp(state: GameWorldState, amount: number): number | undefined {
  if (amount <= 0) return undefined;
  state.level = state.level ?? 1;
  state.xp = (state.xp ?? 0) + amount;
  let leveledUpTo: number | undefined;
  while (state.xp >= getXpThreshold(state.level)) {
    state.xp -= getXpThreshold(state.level);
    state.level += 1;
    state.player.maxStamina += 5;
    state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 5);
    leveledUpTo = state.level;
  }
  return leveledUpTo;
}

export function recordDiscoveredItem(state: GameWorldState, id: ItemId): void {
  if (!state.discoveredItems) state.discoveredItems = [];
  if (!state.discoveredItems.includes(id)) {
    state.discoveredItems.push(id);
  }
}

export function isSwiftBuffActive(state: GameWorldState): boolean {
  return (state.swiftUntilMinutes ?? 0) > state.timeMinutes;
}

export function getToolHitCount(level: number): number {
  if (level >= 4) return 3;
  if (level >= 3) return 2;
  return 1;
}

export function getToolStaminaCost(tool: ToolType, state: GameWorldState): number {
  const swiftDiscount = isSwiftBuffActive(state) ? 1 : 0;
  if (tool === 'hoe') return Math.max(1, Math.max(2, 5 - state.upgrades.hoeLevel) - swiftDiscount);
  if (tool === 'watering_can') return Math.max(1, Math.max(1, 4 - state.upgrades.canLevel) - swiftDiscount);
  return Math.max(1, Math.max(2, 6 - state.upgrades.axeLevel) - swiftDiscount);
}

export function addInventoryItem(state: GameWorldState, id: ItemId, amount: number): void {
  const qty = Math.floor(amount);
  if (!Number.isFinite(qty) || qty <= 0) return;
  const def = ITEMS[id];
  if (!def) return;
  state.inventory[id] = (state.inventory[id] ?? 0) + qty;
  recordDiscoveredItem(state, id);
  // Auto-slot seeds, placeables, and consumables into an empty hotbar slot if not already present
  if (
    (def.category === 'seed' || def.category === 'placeable' || def.category === 'consumable') &&
    !state.hotbar.includes(id)
  ) {
    const emptyIdx = state.hotbar.findIndex((slot) => slot === null);
    if (emptyIdx !== -1) {
      state.hotbar[emptyIdx] = id;
    }
  }
}

export function consumeInventoryItem(state: GameWorldState, id: ItemId, amount = 1): boolean {
  const qty = Math.floor(amount);
  if (!Number.isFinite(qty) || qty <= 0) return false;
  const current = state.inventory[id] ?? 0;
  if (current < qty) return false;
  const next = current - qty;
  if (next <= 0) {
    delete state.inventory[id];
    // Clear from hotbar if empty and not a core tool
    if (ITEMS[id]?.category !== 'tool') {
      state.hotbar = state.hotbar.map((slot) => (slot === id ? null : slot));
    }
  } else {
    state.inventory[id] = next;
  }
  return true;
}

export interface ActionFeedback {
  performed: boolean;
  kind:
    | 'none'
    | 'till'
    | 'plant'
    | 'water'
    | 'refill'
    | 'harvest'
    | 'clear'
    | 'place'
    | 'repair'
    | 'defend'
    | 'fish'
    | 'wish'
    | 'fertilize'
    | 'artisan'
    | 'pet'
    | 'forage'
    | 'error';
  message?: string;
  tileX?: number;
  tileY?: number;
  cropHarvested?: CropType;
  rotationBoosted?: boolean;
  goldenBonus?: boolean;
  comboCount?: number;
  comboGold?: number;
  treasureFound?: { gold?: number; seedId?: ItemId };
  goldDelta?: number;
  leveledUpTo?: number;
  caughtFish?: boolean;
  goldenPearl?: boolean;
  wishOutcome?: string;
  bonusTileAction?: boolean;
}

export function isProtectedByScarecrow(state: GameWorldState, x: number, y: number): boolean {
  for (const tile of state.tiles) {
    if (tile.structure?.type === 'scarecrow') {
      const dist = Math.hypot(tile.x + 0.5 - (x + 0.5), tile.y + 0.5 - (y + 0.5));
      if (dist <= SCARECROW_RADIUS) return true;
    }
  }
  return false;
}

export function isProtectedFromFlood(state: GameWorldState, x: number, y: number): boolean {
  // Protected if adjacent (radius 1.5) to a fence, stone_path, or radius 3.5 to a lantern
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const t = getTile(state, x + dx, y + dy);
      if (!t?.structure) continue;
      const d = Math.hypot(dx, dy);
      if (t.structure.type === 'lantern' && d <= 3.2) return true;
      if ((t.structure.type === 'fence' || t.structure.type === 'stone_path') && d <= 1.5) return true;
    }
  }
  return false;
}

export function isCoveredByStructureRadius(
  state: GameWorldState,
  x: number,
  y: number,
  type: PlaceableType,
  radius: number
): boolean {
  for (const tile of state.tiles) {
    if (tile.structure?.type === type) {
      const dist = Math.hypot(tile.x - x, tile.y - y);
      if (dist <= radius) return true;
    }
  }
  return false;
}

export function isCoveredBySprinkler(state: GameWorldState, x: number, y: number): boolean {
  return isCoveredByStructureRadius(state, x, y, 'sprinkler', SPRINKLER_RADIUS);
}

export function isCoveredBySensor(state: GameWorldState, x: number, y: number): boolean {
  return isCoveredByStructureRadius(state, x, y, 'sensor', SENSOR_RADIUS);
}

export function isCoveredByCompost(state: GameWorldState, x: number, y: number): boolean {
  return isCoveredByStructureRadius(state, x, y, 'compost', COMPOST_RADIUS);
}

export function isCoveredByShadeNet(state: GameWorldState, x: number, y: number): boolean {
  for (const tile of state.tiles) {
    if (tile.structure?.type === 'shade_net') {
      if (
        Math.abs(tile.x - x) <= SHADE_NET_HALF_EXTENT &&
        Math.abs(tile.y - y) <= SHADE_NET_HALF_EXTENT
      ) {
        return true;
      }
    }
  }
  return false;
}

export function isCoveredByGreenhouse(state: GameWorldState, x: number, y: number): boolean {
  for (const tile of state.tiles) {
    if (tile.structure?.type === 'greenhouse') {
      if (
        Math.abs(tile.x - x) <= GREENHOUSE_HALF_EXTENT &&
        Math.abs(tile.y - y) <= GREENHOUSE_HALF_EXTENT
      ) {
        return true;
      }
    }
  }
  return false;
}

export function hasNasaStation(state: GameWorldState): boolean {
  return state.tiles.some((t) => t.structure?.type === 'nasa_station');
}

export function computeSoilMoisturePct(state: GameWorldState): number {
  const tilled = state.tiles.filter((t) => t.tilled);
  const watered = tilled.filter((t) => t.watered).length;
  const wateredRatio = tilled.length > 0 ? watered / tilled.length : 0.4;
  let base = 46;
  if (state.weather === 'Rainstorm') base = 86;
  else if (state.weather === 'Drought') base = 22;
  else if (state.weather === 'Heatwave') base = 18;
  return Math.max(10, Math.min(98, Math.round(base + wateredRatio * 14)));
}

export function computeTemperatureC(state: GameWorldState): number {
  const season = getSeason(state.seasonIndex);
  let temp = season === 'Spring' ? 22 : season === 'Summer' ? 30 : season === 'Autumn' ? 19 : 9;
  if (state.weather === 'Heatwave') temp += 11;
  else if (state.weather === 'Drought') temp += 5;
  else if (state.weather === 'Rainstorm') temp -= 4;
  return temp;
}

export function isCoveredByBeehive(state: GameWorldState, x: number, y: number): boolean {
  return isCoveredByStructureRadius(state, x, y, 'beehive', BEEHIVE_RADIUS);
}

export function generateDailyOrder(
  day: number,
  season: Season,
  rng: () => number = Math.random
): DailyOrder {
  const pool: ItemId[] = ['wheat', 'bean', 'carrot', 'corn', 'potato'];
  if (day >= 3 || season === 'Summer' || season === 'Autumn') {
    pool.push('tomato', 'strawberry', 'lavender', 'sunflower', 'chili');
  }
  if (day >= 4 || season === 'Autumn' || season === 'Winter' || season === 'Summer') {
    pool.push('pumpkin', 'watermelon');
  }
  if (day >= 2) {
    pool.push('egg', 'fish');
  }
  if (day >= 4) {
    pool.push('honey', 'butter');
  }
  const cropId = pool[Math.floor(rng() * pool.length)] ?? 'wheat';
  const requiredQty =
    cropId === 'wheat' || cropId === 'bean'
      ? 2 + Math.floor(rng() * 2)
      : cropId === 'carrot' || cropId === 'corn' || cropId === 'potato'
      ? 1 + Math.floor(rng() * 2)
      : 1;
  const baseSell = ITEMS[cropId].sellPrice ?? 30;
  const rewardGold = Math.round(baseSell * requiredQty * 1.65) + 20;
  const rewardStamina = Math.min(30, 15 + requiredQty * 5);
  return {
    cropId,
    requiredQty,
    rewardGold,
    rewardStamina,
    completed: false,
  };
}

export function fulfillDailyOrder(
  state: GameWorldState
): { ok: boolean; earnedGold: number; message: string; leveledUpTo?: number } {
  const order = state.dailyOrder;
  if (!order) return { ok: false, earnedGold: 0, message: 'No active village order' };
  if (order.completed) return { ok: false, earnedGold: 0, message: 'Order already completed today' };

  const owned = state.inventory[order.cropId] ?? 0;
  if (owned < order.requiredQty) {
    return {
      ok: false,
      earnedGold: 0,
      message: `Need ${order.requiredQty}x ${ITEMS[order.cropId].name}`,
    };
  }

  consumeInventoryItem(state, order.cropId, order.requiredQty);
  order.completed = true;
  state.player.gold += order.rewardGold;
  state.stats.totalGoldEarned += order.rewardGold;
  state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + order.rewardStamina);
  state.stats.ordersCompleted = (state.stats.ordersCompleted ?? 0) + 1;
  const leveledUpTo = grantXp(state, 30);

  return {
    ok: true,
    earnedGold: order.rewardGold,
    leveledUpTo,
    message: `Delivered ${order.requiredQty}x ${ITEMS[order.cropId].name} (+${order.rewardGold}g)`,
  };
}

function maybeGrantSoilTreasure(
  state: GameWorldState
): { gold?: number; seedId?: ItemId } | undefined {
  if (state.stats.obstaclesCleared <= 0 || state.stats.obstaclesCleared % 4 !== 0) {
    return undefined;
  }
  state.stats.treasuresFound = (state.stats.treasuresFound ?? 0) + 1;
  if (state.stats.treasuresFound % 2 === 1) {
    state.player.gold += 12;
    state.stats.totalGoldEarned += 12;
    return { gold: 12 };
  }
  const seedId: ItemId = state.stats.treasuresFound % 4 === 0 ? 'bean_seed' : 'carrot_seed';
  addInventoryItem(state, seedId, 1);
  return { seedId };
}

export function getMessageFrom2040ForDay(day: number): FutureDispatch | null {
  if (day <= 0 || day % 3 !== 0) return null;
  const idx = (Math.floor(day / 3) - 1) % MESSAGES_FROM_2040.length;
  const entry = MESSAGES_FROM_2040[idx];
  return { day, quoteAr: entry.quoteAr, quoteEn: entry.quoteEn };
}

export function performTileAction(
  state: GameWorldState,
  tileX: number,
  tileY: number,
  nowMs: number = Date.now()
): ActionFeedback {
  const tile = getTile(state, tileX, tileY);
  if (!tile) return { performed: false, kind: 'none' };

  // Check reach distance (within 2.1 tiles of player center)
  const dist = Math.hypot(state.player.x - (tileX + 0.5), state.player.y - (tileY + 0.5));
  if (dist > 2.25) {
    return { performed: false, kind: 'error', message: 'Move closer to reach that tile' };
  }

  // Face toward target
  const dx = tileX + 0.5 - state.player.x;
  const dy = tileY + 0.5 - state.player.y;
  if (Math.hypot(dx, dy) > 0.05) {
    state.player.facingX = dx;
    state.player.facingY = dy;
  }

  // Priority 1: Harvest ripe crop regardless of selected tool (cozy QoL!)
  if (tile.crop && !tile.crop.withered) {
    const def = CROPS[tile.crop.type];
    if (tile.crop.growthDays >= def.daysToGrow) {
      if (state.player.stamina < 1) {
        return { performed: false, kind: 'error', message: 'Too exhausted! Rest or eat' };
      }
      state.player.stamina = Math.max(0, state.player.stamina - 1);
      const harvestedType = tile.crop.type;
      addInventoryItem(state, harvestedType, 1);

      let rotationBoosted = false;
      let goldDelta = 0;

      if (harvestedType === 'bean') {
        // Fertility Bean enriches this tile so the NEXT non-bean crop yields +20% more
        tile.beanRotationBonus = true;
        state.stats.beansHarvested = (state.stats.beansHarvested ?? 0) + 1;
      } else if (tile.beanRotationBonus) {
        // Apply +20% Crop Rotation yield bonus!
        tile.beanRotationBonus = false;
        rotationBoosted = true;
        goldDelta = Math.round(def.sellPrice * 0.2);
        state.player.gold += goldDelta;
        state.stats.totalGoldEarned += goldDelta;
        const nextProgress = (state.rotationYieldProgress ?? 0) + 0.2;
        if (nextProgress >= 0.999) {
          addInventoryItem(state, harvestedType, 1);
          state.rotationYieldProgress = Math.max(0, nextProgress - 1);
        } else {
          state.rotationYieldProgress = nextProgress;
        }
      }

      // Harvest combo streak (consecutive harvests within 5 seconds)
      const prevMs = state.lastHarvestMs ?? 0;
      const prevCombo = state.harvestCombo ?? 0;
      const comboCount =
        prevMs > 0 && nowMs - prevMs <= 5000 ? Math.min(8, prevCombo + 1) : 1;
      state.harvestCombo = comboCount;
      state.lastHarvestMs = nowMs;

      let comboGold = 0;
      if (comboCount >= 2) {
        comboGold = Math.min(15, (comboCount - 1) * 3);
        state.player.gold += comboGold;
        state.stats.totalGoldEarned += comboGold;
      }

      // Bee pollination golden double harvest bonus!
      let goldenBonus = false;
      if (isCoveredByBeehive(state, tileX, tileY) && (tileX + tileY + state.day) % 2 === 0) {
        addInventoryItem(state, harvestedType, 1);
        goldenBonus = true;
      }

      // Golden Potato grants +1 bonus tuber if harvested from watered or bio-mulched soil!
      if (harvestedType === 'potato' && (tile.watered || (tile.mulchedDays ?? 0) > 0)) {
        addInventoryItem(state, 'potato', 1);
        goldenBonus = true;
      }

      // 25% chance for bonus seed drop on harvest (50% with Sensor or Sunflower)
      const mod = isCoveredBySensor(state, tileX, tileY) || harvestedType === 'sunflower' ? 2 : 4;
      if ((tileX + tileY + state.day) % mod === 0) {
        addInventoryItem(state, def.seedId, 1);
      }
      tile.crop = null;
      state.stats.cropsHarvested += 1;
      const leveledUpTo = grantXp(state, 15);
      const totalGoldDelta = goldDelta + comboGold;
      return {
        performed: true,
        kind: 'harvest',
        tileX,
        tileY,
        cropHarvested: harvestedType,
        rotationBoosted,
        goldenBonus: goldenBonus || undefined,
        comboCount,
        comboGold: comboGold || undefined,
        goldDelta: totalGoldDelta || undefined,
        leveledUpTo,
        message: goldenBonus
          ? `+2 ${def.name} (Pollinated!)`
          : rotationBoosted
          ? `+1 ${def.name} (+20%)`
          : `+1 ${def.name}`,
      };
    }
  }

  // Priority 1b: Collect shimmering Daily Nature Treasure (Clover / Autumn Mushroom / Frost Bloom)
  if (
    state.dailyTreasure &&
    state.dailyTreasure.x === tileX &&
    state.dailyTreasure.y === tileY
  ) {
    const tKind = state.dailyTreasure.kind;
    state.dailyTreasure = null;
    state.player.gold += 18;
    state.stats.totalGoldEarned += 18;
    state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 10);
    state.stats.treasuresFound = (state.stats.treasuresFound ?? 0) + 1;
    const leveledUpTo = grantXp(state, 12);
    const message =
      tKind === 'frost_bloom'
        ? 'Found Frost Bloom (+18g, +10 Stam)!'
        : tKind === 'mushroom'
        ? 'Found Autumn Mushroom (+18g, +10 Stam)!'
        : 'Found Lucky Clover (+18g, +10 Stam)!';
    return {
      performed: true,
      kind: 'forage',
      tileX,
      tileY,
      goldDelta: 18,
      leveledUpTo,
      message,
    };
  }

  // Priority 1c: Open sparkling Mystery Treasure Chest on click
  if (
    state.mysteryChest &&
    state.mysteryChest.x === tileX &&
    state.mysteryChest.y === tileY
  ) {
    const chestRes = openMysteryChest(state);
    if (chestRes.ok) {
      return {
        performed: true,
        kind: 'forage',
        tileX,
        tileY,
        goldDelta: chestRes.goldDelta,
        leveledUpTo: chestRes.leveledUpTo,
        message: chestRes.message,
      };
    }
  }

  // Priority 2: Draw free rainwater from placed Rain Tank (works with watering can or empty hand)
  if (tile.structure?.type === 'rain_tank') {
    const stored = tile.structure.storedWaterCharges ?? 0;
    if (stored > 0) {
      const space = Math.max(0, state.player.maxWaterLevel - state.player.waterLevel);
      if (space <= 0) {
        return {
          performed: false,
          kind: 'error',
          message: 'Watering Can is already full',
        };
      }
      const transfer = Math.min(stored, space);
      state.player.waterLevel += transfer;
      tile.structure.storedWaterCharges = stored - transfer;
      state.player.swingTimer = 0.22;
      state.player.swingTool = 'watering_can';
      return {
        performed: true,
        kind: 'refill',
        tileX,
        tileY,
        message: 'Refilled from Rain Tank!',
      };
    }
    return {
      performed: false,
      kind: 'error',
      message: 'Rain Tank is empty — wait for a Rainstorm',
    };
  }

  // Priority 2b: Interactive Wishing Fountain (once per day, 10g for a blessing!)
  if (tile.structure?.type === 'wishing_fountain') {
    if (state.wishedToday) {
      return {
        performed: false,
        kind: 'error',
        message: 'Already made a wish today — return tomorrow',
      };
    }
    if (state.player.gold < WISHING_FOUNTAIN_COST) {
      return {
        performed: false,
        kind: 'error',
        message: `Need ${WISHING_FOUNTAIN_COST}g to make a wish`,
      };
    }
    state.player.gold -= WISHING_FOUNTAIN_COST;
    state.wishedToday = true;
    state.stats.wishesMade = (state.stats.wishesMade ?? 0) + 1;
    const roll = (state.day + Math.floor(nowMs / 100)) % 4;
    let wishOutcome = 'gold';
    let message = 'Wishing Fountain blessed +35g!';
    if (roll === 0) {
      state.player.gold += 35;
      state.stats.totalGoldEarned += 35;
      wishOutcome = 'gold';
      message = 'Wishing Fountain blessed +35g!';
    } else if (roll === 1) {
      state.player.stamina = state.player.maxStamina;
      wishOutcome = 'stamina';
      message = 'Wishing Fountain restored Full Stamina!';
    } else if (roll === 2) {
      state.weather = 'Clear';
      wishOutcome = 'clear';
      message = 'Wishing Fountain cleared the skies!';
    } else {
      const bonusSeed: ItemId = state.day % 2 === 0 ? 'watermelon_seed' : 'strawberry_seed';
      addInventoryItem(state, bonusSeed, 1);
      wishOutcome = 'seed';
      message = `Wishing Fountain gifted +1 ${ITEMS[bonusSeed].name}!`;
    }
    const leveledUpTo = grantXp(state, 15);
    return {
      performed: true,
      kind: 'wish',
      tileX,
      tileY,
      wishOutcome,
      leveledUpTo,
      message,
    };
  }

  // Priority 2c: Artisan Machines (Cheese Press & Jam Maker) when carrying ingredients
  if (tile.structure?.type === 'cheese_press') {
    if ((state.inventory.milk ?? 0) >= 1) {
      consumeInventoryItem(state, 'milk', 1);
      addInventoryItem(state, 'cheese', 1);
      state.stats.artisanProduced = (state.stats.artisanProduced ?? 0) + 1;
      state.stats.cheeseMade = (state.stats.cheeseMade ?? 0) + 1;
      const leveledUpTo = grantXp(state, 12);
      return {
        performed: true,
        kind: 'artisan',
        tileX,
        tileY,
        leveledUpTo,
        message: 'Pressed 1 Artisan Cheese!',
      };
    }
    return {
      performed: false,
      kind: 'error',
      message: 'Need 1 Fresh Milk to press Cheese',
    };
  }

  if (tile.structure?.type === 'jam_maker') {
    if ((state.inventory.strawberry ?? 0) >= 1) {
      consumeInventoryItem(state, 'strawberry', 1);
      addInventoryItem(state, 'strawberry_jam', 1);
      state.stats.artisanProduced = (state.stats.artisanProduced ?? 0) + 1;
      state.stats.jamMade = (state.stats.jamMade ?? 0) + 1;
      const leveledUpTo = grantXp(state, 12);
      return {
        performed: true,
        kind: 'artisan',
        tileX,
        tileY,
        leveledUpTo,
        message: 'Cooked 1 Berry Jam!',
      };
    }
    return {
      performed: false,
      kind: 'error',
      message: 'Need 1 Sweet Berry to make Jam',
    };
  }

  if (tile.structure?.type === 'butter_churn') {
    if ((state.inventory.milk ?? 0) >= 1) {
      consumeInventoryItem(state, 'milk', 1);
      addInventoryItem(state, 'butter', 1);
      state.stats.artisanProduced = (state.stats.artisanProduced ?? 0) + 1;
      state.stats.butterMade = (state.stats.butterMade ?? 0) + 1;
      const leveledUpTo = grantXp(state, 12);
      return {
        performed: true,
        kind: 'artisan',
        tileX,
        tileY,
        wishOutcome: 'butter',
        leveledUpTo,
        message: 'Churned 1 Golden Farm Butter!',
      };
    }
    return {
      performed: false,
      kind: 'error',
      message: 'Need 1 Fresh Milk to churn Butter',
    };
  }

  if (tile.structure?.type === 'tea_kettle') {
    const ingredient: ItemId | null =
      (state.inventory.lavender ?? 0) >= 1
        ? 'lavender'
        : (state.inventory.honey ?? 0) >= 1
        ? 'honey'
        : null;
    if (ingredient) {
      consumeInventoryItem(state, ingredient, 1);
      addInventoryItem(state, 'herbal_tea', 1);
      state.stats.artisanProduced = (state.stats.artisanProduced ?? 0) + 1;
      state.stats.teaBrewed = (state.stats.teaBrewed ?? 0) + 1;
      const leveledUpTo = grantXp(state, 12);
      return {
        performed: true,
        kind: 'artisan',
        tileX,
        tileY,
        wishOutcome: 'herbal_tea',
        leveledUpTo,
        message: 'Brewed 1 Soothing Herbal Tea!',
      };
    }
    return {
      performed: false,
      kind: 'error',
      message: 'Need 1 Lavender or Honey to brew Tea',
    };
  }

  const selectedId = state.hotbar[state.player.selectedHotbarIndex];

  // Priority 2c-bis: Interactive Farm Animal Petting (when tile has no crop/obstacle/structure/tilled plot blocking)
  if (!tile.crop && !tile.obstacle && !tile.structure && (!tile.tilled || !selectedId)) {
    const cx = tileX + 0.5;
    const cy = tileY + 0.5;
    let petKind: 'dog' | 'cat' | 'cow' | 'sheep' | 'chicken' | null = null;
    if (state.dog && Math.hypot(state.dog.x - cx, state.dog.y - cy) <= 0.78) {
      petKind = 'dog';
    } else if (state.cat && Math.hypot(state.cat.x - cx, state.cat.y - cy) <= 0.78) {
      petKind = 'cat';
    } else if ((state.cows ?? []).some((c) => Math.hypot(c.x - cx, c.y - cy) <= 0.72)) {
      petKind = 'cow';
    } else if ((state.sheep ?? []).some((s) => Math.hypot(s.x - cx, s.y - cy) <= 0.72)) {
      petKind = 'sheep';
    } else if ((state.chickens ?? []).some((ch) => Math.hypot(ch.x - cx, ch.y - cy) <= 0.68)) {
      petKind = 'chicken';
    }
    if (petKind) {
      if (!Array.isArray(state.pettedAnimalsToday)) state.pettedAnimalsToday = [];
      const firstToday = !state.pettedAnimalsToday.includes(petKind);
      let leveledUpTo: number | undefined;
      if (firstToday) {
        state.pettedAnimalsToday.push(petKind);
        if (petKind === 'dog') {
          state.player.health = Math.min(state.player.maxHealth, state.player.health + 8);
        } else if (petKind === 'cat') {
          state.player.health = Math.min(state.player.maxHealth, state.player.health + 10);
          state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 8);
        } else if (petKind === 'cow' || petKind === 'sheep') {
          state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 6);
        } else {
          state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 4);
        }
        leveledUpTo = grantXp(state, 5);
      }
      const message = firstToday
        ? petKind === 'dog'
          ? 'Petted Guard Dog (+8 HP)!'
          : petKind === 'cat'
          ? 'Petted Farm Cat (+10 HP, +8 Stam)!'
          : petKind === 'cow'
          ? 'Petted Dairy Cow (+6 Stam)!'
          : petKind === 'sheep'
          ? 'Petted Fluffy Sheep (+6 Stam)!'
          : 'Petted Chicken (+4 Stam)!'
        : petKind === 'dog'
        ? 'Guard Dog wags tail!'
        : petKind === 'cat'
        ? 'Farm Cat purrs softly!'
        : petKind === 'cow'
        ? 'Dairy Cow moos happily!'
        : petKind === 'sheep'
        ? 'Fluffy Sheep bleats happily!'
        : 'Chicken clucks happily!';
      return {
        performed: true,
        kind: 'pet',
        tileX,
        tileY,
        wishOutcome: petKind,
        leveledUpTo,
        message,
      };
    }
  }

  // Priority 2d: Pond Fishing on water tile when NOT holding watering_can
  if (tile.terrain === 'water' && selectedId !== 'watering_can') {
    if (nowMs - (state.lastFishMs ?? 0) < FISHING_COOLDOWN_MS && (state.lastFishMs ?? 0) > 0) {
      return {
        performed: false,
        kind: 'error',
        message: 'Pond ripples settling — wait a moment',
      };
    }
    if (state.player.stamina < 3) {
      return { performed: false, kind: 'error', message: 'Low Stamina — Rest at Farmhouse' };
    }
    state.player.stamina -= 3;
    state.lastFishMs = nowMs;
    state.player.swingTimer = 0.25;
    state.player.swingTool = 'hoe';
    const rollKey = tileX + tileY + Math.floor(nowMs / 1000);
    const inOasis = state.activeRealm === 'crystal_oasis';
    const goldenPearl = rollKey % (inOasis ? 3 : 4) === 0;
    const isKoi = !goldenPearl && rollKey % (inOasis ? 4 : 5) === 0;
    const isSunkenChest =
      !goldenPearl && !isKoi && (tileX * 3 + tileY + Math.floor(nowMs / 1000)) % (inOasis ? 5 : 7) === 0;

    if (isKoi) {
      addInventoryItem(state, 'golden_koi', 1);
      state.stats.fishCaught = (state.stats.fishCaught ?? 0) + 1;
      state.stats.koiCaught = (state.stats.koiCaught ?? 0) + 1;
      const leveledUpTo = grantXp(state, 24);
      return {
        performed: true,
        kind: 'fish',
        tileX,
        tileY,
        caughtFish: true,
        goldenPearl: true,
        wishOutcome: 'golden_koi',
        leveledUpTo,
        message: 'Caught Rare Golden Koi!',
      };
    }

    if (isSunkenChest) {
      addInventoryItem(state, 'fish', 1);
      addInventoryItem(state, 'sunflower_seed', 1);
      state.stats.fishCaught = (state.stats.fishCaught ?? 0) + 1;
      state.player.gold += 45;
      state.stats.totalGoldEarned += 45;
      const leveledUpTo = grantXp(state, 24);
      return {
        performed: true,
        kind: 'fish',
        tileX,
        tileY,
        caughtFish: true,
        goldenPearl: true,
        goldDelta: 45,
        wishOutcome: 'sunken_chest',
        leveledUpTo,
        message: 'Reeled Sunken Chest (+45g & Seeds)!',
      };
    }

    addInventoryItem(state, 'fish', 1);
    state.stats.fishCaught = (state.stats.fishCaught ?? 0) + 1;
    if (goldenPearl) {
      state.player.gold += 35;
      state.stats.totalGoldEarned += 35;
    }
    const leveledUpTo = grantXp(state, 18);
    return {
      performed: true,
      kind: 'fish',
      tileX,
      tileY,
      caughtFish: true,
      goldenPearl,
      goldDelta: goldenPearl ? 35 : undefined,
      leveledUpTo,
      message: goldenPearl ? 'Caught Pond Fish + Golden Pearl (+35g)!' : 'Caught Fresh Pond Fish!',
    };
  }

  if (!selectedId) {
    return { performed: false, kind: 'none' };
  }
  const itemDef = ITEMS[selectedId];

  // Organic Fertilizer booster on planted unripe crops
  if (selectedId === 'fertilizer') {
    if (!tile.crop || tile.crop.withered) {
      return { performed: false, kind: 'error', message: 'Use Fertilizer on a growing crop' };
    }
    const def = CROPS[tile.crop.type];
    if (tile.crop.growthDays >= def.daysToGrow) {
      return { performed: false, kind: 'error', message: 'Crop is already ripe!' };
    }
    if (!consumeInventoryItem(state, 'fertilizer', 1)) {
      return { performed: false, kind: 'error', message: 'Out of fertilizer' };
    }
    tile.crop.growthDays = Math.min(def.daysToGrow, tile.crop.growthDays + 1);
    const leveledUpTo = grantXp(state, 6);
    return {
      performed: true,
      kind: 'fertilize',
      tileX,
      tileY,
      leveledUpTo,
      message: 'Fertilized crop (+1 growth day)!',
    };
  }

  // Rich Bio-Mulch retains soil moisture for 2 days & blocks midday drought
  if (selectedId === 'bio_mulch') {
    if (!tile.tilled || tile.obstacle || tile.structure) {
      return { performed: false, kind: 'error', message: 'Apply Bio-Mulch on tilled soil' };
    }
    if (!consumeInventoryItem(state, 'bio_mulch', 1)) {
      return { performed: false, kind: 'error', message: 'Out of Bio-Mulch' };
    }
    tile.mulchedDays = 2;
    tile.watered = true;
    tile.droughtDriedToday = false;
    const leveledUpTo = grantXp(state, 6);
    return {
      performed: true,
      kind: 'fertilize',
      tileX,
      tileY,
      wishOutcome: 'bio_mulch',
      leveledUpTo,
      message: 'Applied Bio-Mulch (2d moisture shield)!',
    };
  }

  // Refill watering can on well or water
  if (selectedId === 'watering_can' && (tile.terrain === 'well' || tile.terrain === 'water')) {
    state.player.waterLevel = state.player.maxWaterLevel;
    state.player.swingTimer = 0.22;
    state.player.swingTool = 'watering_can';
    return {
      performed: true,
      kind: 'refill',
      tileX,
      tileY,
      message: 'Watering Can refilled',
    };
  }

  // Manual activation of Drip Irrigation Line with watering can: waters whole horizontal row for 1 charge (half water)!
  if (selectedId === 'watering_can' && tile.structure?.type === 'drip_sprinkler') {
    if (state.player.waterLevel <= 0) {
      return { performed: false, kind: 'error', message: 'Can empty! Refill at the Well' };
    }
    let rowWatered = 0;
    for (let x = 0; x < state.width; x++) {
      const rt = getTile(state, x, tileY);
      if (rt?.tilled && !rt.watered) {
        rt.watered = true;
        rt.droughtDriedToday = false;
        rowWatered += 1;
      }
    }
    if (rowWatered > 0) {
      state.player.waterLevel = Math.max(0, state.player.waterLevel - 1);
      state.stats.cropsWatered = (state.stats.cropsWatered ?? 0) + rowWatered;
      const saved = rowWatered * DRIP_WATER_SAVED_PER_TILE;
      state.stats.waterSavedLiters = (state.stats.waterSavedLiters ?? 0) + saved;
      state.player.swingTimer = 0.22;
      state.player.swingTool = 'watering_can';
      return {
        performed: true,
        kind: 'water',
        tileX,
        tileY,
        message: `Drip row watered: ${rowWatered} (+${saved}L)`,
      };
    }
    return { performed: false, kind: 'none' };
  }

  // Tool actions
  if (itemDef.category === 'tool') {
    const tool = selectedId as ToolType;
    const cost = getToolStaminaCost(tool, state);

    if (tool === 'hoe') {
      if (state.player.stamina < cost) {
        return { performed: false, kind: 'error', message: 'Low Stamina — Rest at Farmhouse' };
      }
      const tryExtraHoeReach = (): boolean => {
        const hitCount = getToolHitCount(state.upgrades.hoeLevel);
        if (hitCount <= 1) return false;
        const stepX = Math.abs(state.player.facingX) >= Math.abs(state.player.facingY) ? Math.sign(state.player.facingX || 1) : 0;
        const stepY = stepX === 0 ? Math.sign(state.player.facingY || 1) : 0;
        let tilledExtra = false;
        for (let step = 1; step < hitCount; step++) {
          const extra = getTile(state, tileX + stepX * step, tileY + stepY * step);
          if (!extra) continue;
          if (extra.tillable && !extra.tilled && !extra.obstacle && !extra.structure) {
            extra.tilled = true;
            if (state.weather === 'Rainstorm') extra.watered = true;
            tilledExtra = true;
          }
        }
        return tilledExtra;
      };
      // Clear withered crop
      if (tile.crop?.withered) {
        state.player.stamina -= cost;
        state.player.swingTimer = 0.22;
        state.player.swingTool = 'hoe';
        tile.crop = null;
        return { performed: true, kind: 'clear', tileX, tileY, message: 'Cleared withered crop' };
      }
      // Clear weed with hoe too
      if (tile.obstacle === 'weed') {
        state.player.stamina -= cost;
        state.player.swingTimer = 0.22;
        state.player.swingTool = 'hoe';
        tile.obstacle = null;
        state.stats.obstaclesCleared += 1;
        const leveledUpTo = grantXp(state, 8);
        const treasureFound = maybeGrantSoilTreasure(state);
        return { performed: true, kind: 'clear', tileX, tileY, treasureFound, leveledUpTo, message: 'Cleared weeds' };
      }
      if (tile.tillable && !tile.tilled && !tile.obstacle && !tile.structure) {
        state.player.stamina -= cost;
        state.player.swingTimer = 0.24;
        state.player.swingTool = 'hoe';
        tile.tilled = true;
        if (state.weather === 'Rainstorm') {
          tile.watered = true;
        }
        const bonusTileAction = tryExtraHoeReach();
        return { performed: true, kind: 'till', tileX, tileY, bonusTileAction };
      }
      if (tile.obstacle) {
        return { performed: false, kind: 'error', message: 'Use Axe to clear rocks & stumps' };
      }
      return { performed: false, kind: 'none' };
    }

    if (tool === 'watering_can') {
      if (state.player.waterLevel <= 0) {
        return { performed: false, kind: 'error', message: 'Can empty! Refill at the Well' };
      }
      if (state.player.stamina < cost) {
        return { performed: false, kind: 'error', message: 'Low Stamina — Rest at Farmhouse' };
      }
      if (tile.tilled) {
        state.player.stamina -= cost;
        state.player.waterLevel = Math.max(0, state.player.waterLevel - 1);
        state.player.swingTimer = 0.24;
        state.player.swingTool = 'watering_can';
        if (!tile.watered) {
          state.stats.cropsWatered = (state.stats.cropsWatered ?? 0) + 1;
        }
        tile.watered = true;
        tile.droughtDriedToday = false;

        let bonusTileAction = false;
        const hitCount = getToolHitCount(state.upgrades.canLevel);
        if (hitCount > 1 && state.player.waterLevel > 0) {
          const stepX = Math.abs(state.player.facingX) >= Math.abs(state.player.facingY) ? Math.sign(state.player.facingX || 1) : 0;
          const stepY = stepX === 0 ? Math.sign(state.player.facingY || 1) : 0;
          for (let step = 1; step < hitCount && state.player.waterLevel > 0; step++) {
            const extra = getTile(state, tileX + stepX * step, tileY + stepY * step);
            if (extra && extra.tilled && !extra.watered) {
              extra.watered = true;
              extra.droughtDriedToday = false;
              state.player.waterLevel = Math.max(0, state.player.waterLevel - 1);
              state.stats.cropsWatered = (state.stats.cropsWatered ?? 0) + 1;
              bonusTileAction = true;
            }
          }
        }
        return { performed: true, kind: 'water', tileX, tileY, bonusTileAction };
      }
      return { performed: false, kind: 'error', message: 'Till soil first before watering' };
    }

    if (tool === 'axe') {
      if (state.player.stamina < cost) {
        return { performed: false, kind: 'error', message: 'Low Stamina — Rest at Farmhouse' };
      }
      state.player.swingTimer = 0.24;
      state.player.swingTool = 'axe';

      // Check if wildlife is near the target tile to repel!
      let hitWildlife = false;
      let leveledUpTo: number | undefined;
      for (const w of state.wildlife) {
        if (w.state === 'ko' || w.state === 'fleeing') continue;
        const wDist = Math.hypot(w.x - (tileX + 0.5), w.y - (tileY + 0.5));
        if (wDist <= 1.45) {
          w.hp -= 1 + (state.upgrades.axeLevel - 1);
          w.hitFlashTimer = 0.14;
          hitWildlife = true;
          if (w.hp <= 0) {
            w.state = 'ko';
            w.stateTimer = 0.45;
            state.stats.wildlifeRepelled += 1;
            state.player.gold += w.kind === 'boar' ? 20 : 10;
            state.stats.totalGoldEarned += w.kind === 'boar' ? 20 : 10;
            leveledUpTo = grantXp(state, 20) ?? leveledUpTo;
          } else {
            w.state = 'fleeing';
            w.stateTimer = 1.6;
          }
        }
      }
      if (hitWildlife) {
        state.player.stamina -= cost;
        return { performed: true, kind: 'defend', tileX, tileY, leveledUpTo, message: 'Repelled wildlife!' };
      }

      if (tile.obstacle) {
        state.player.stamina -= cost;
        const obs = tile.obstacle;
        tile.obstacle = null;
        state.stats.obstaclesCleared += 1;
        const lvl = grantXp(state, 8);
        const treasureFound = maybeGrantSoilTreasure(state);
        const titaniumYield = state.upgrades.axeLevel >= 4 ? 1 : 0;
        const woodRealmBonus = obs === 'stump' && state.activeRealm === 'whispering_woods' ? 2 : 0;
        const oasisStoneBonus = obs === 'rock' && state.activeRealm === 'crystal_oasis' ? 1 : 0;
        if (obs === 'stump') {
          const woodAmt = 3 + titaniumYield + woodRealmBonus;
          addInventoryItem(state, 'wood', woodAmt);
          return { performed: true, kind: 'clear', tileX, tileY, treasureFound, leveledUpTo: lvl, message: `+${woodAmt} Timber Wood` };
        }
        if (obs === 'rock') {
          const stoneAmt = 2 + titaniumYield + oasisStoneBonus;
          addInventoryItem(state, 'stone', stoneAmt);
          if (state.activeRealm === 'crystal_oasis') {
            state.player.gold += 8;
            state.stats.totalGoldEarned += 8;
          }
          return { performed: true, kind: 'clear', tileX, tileY, treasureFound, leveledUpTo: lvl, message: `+${stoneAmt} Field Stone` };
        }
        addInventoryItem(state, 'wood', 1);
        return { performed: true, kind: 'clear', tileX, tileY, treasureFound, leveledUpTo: lvl, message: 'Cleared weed (+1 Wood)' };
      }

      // Repair damaged fence with axe/mallet if damaged
      if (tile.structure && tile.structure.hp < tile.structure.maxHp) {
        const repairCost = Math.min(2, cost);
        if (state.player.stamina < repairCost) {
          return { performed: false, kind: 'error', message: 'Low Stamina — Rest at Farmhouse' };
        }
        state.player.stamina = Math.max(0, state.player.stamina - repairCost);
        tile.structure.hp = tile.structure.maxHp;
        return { performed: true, kind: 'repair', tileX, tileY, message: 'Repaired structure' };
      }

      // Remove own structure if player axes a stone_path or fence intentionally? Keep safe: only clear obstacles/wildlife
      return { performed: true, kind: 'defend', tileX, tileY };
    }
  }

  // Seed planting
  if (itemDef.category === 'seed' && itemDef.cropType) {
    if (!tile.tilled) {
      return { performed: false, kind: 'error', message: 'Till soil with Hoe first' };
    }
    if (tile.crop) {
      return { performed: false, kind: 'error', message: 'A crop is already planted here' };
    }
    if (state.player.stamina < 1) {
      return { performed: false, kind: 'error', message: 'Low Stamina — Rest at Farmhouse' };
    }
    if (!consumeInventoryItem(state, selectedId, 1)) {
      return { performed: false, kind: 'error', message: 'Out of seeds' };
    }
    state.player.stamina -= 1;
    state.stats.seedsPlanted = (state.stats.seedsPlanted ?? 0) + 1;
    tile.crop = {
      type: itemDef.cropType,
      growthDays: 0,
      daysUnwatered: 0,
      withered: false,
      floodedDays: 0,
    };
    return { performed: true, kind: 'plant', tileX, tileY };
  }

  // Placeable structures (Fence, Scarecrow, Lantern, Flowerbed, Cobble Path, Artisan, Windmill, Wishing Fountain)
  if (itemDef.category === 'placeable' && itemDef.placeableType) {
    if (
      tile.terrain !== 'grass' &&
      tile.terrain !== 'moss_floor' &&
      tile.terrain !== 'sand_dune' &&
      tile.terrain !== 'cloud_stone' &&
      tile.terrain !== 'dirt_path'
    ) {
      return { performed: false, kind: 'error', message: 'Cannot build on this terrain' };
    }
    if (tile.obstacle || tile.crop || tile.structure) {
      return { performed: false, kind: 'error', message: 'Tile is occupied' };
    }
    // Prevent blocking player's current tile with solid structures
    const ptx = Math.floor(state.player.x);
    const pty = Math.floor(state.player.y);
    const pType = itemDef.placeableType;
    if (ptx === tileX && pty === tileY && pType !== 'stone_path' && pType !== 'flowerbed') {
      return { performed: false, kind: 'error', message: 'Step off tile to build' };
    }
    if (!consumeInventoryItem(state, selectedId, 1)) {
      return { performed: false, kind: 'error', message: 'None left in inventory' };
    }
    tile.tilled = false;
    tile.watered = false;
    const isRainStormTank = pType === 'rain_tank' && state.weather === 'Rainstorm';
    tile.structure = {
      type: pType,
      hp: PLACEABLE_MAX_HP[pType],
      maxHp: PLACEABLE_MAX_HP[pType],
      storedWaterCharges: isRainStormTank ? RAIN_TANK_MAX_CHARGES : 0,
    };
    state.stats.defensesPlaced = (state.stats.defensesPlaced ?? 0) + 1;
    if (pType === 'sprinkler') {
      state.stats.sprinklersPlaced = (state.stats.sprinklersPlaced ?? 0) + 1;
    } else if (pType === 'sensor') {
      state.stats.sensorsPlaced = (state.stats.sensorsPlaced ?? 0) + 1;
    } else if (pType === 'nasa_station') {
      state.stats.nasaStationsPlaced = (state.stats.nasaStationsPlaced ?? 0) + 1;
    } else if (isRainStormTank) {
      state.stats.rainwaterCollectedLiters =
        (state.stats.rainwaterCollectedLiters ?? 0) + RAIN_TANK_MAX_CHARGES * LITERS_PER_WATERING;
    }
    return { performed: true, kind: 'place', tileX, tileY, message: `Placed ${itemDef.name}` };
  }

  return { performed: false, kind: 'none' };
}

export function eatCrop(
  state: GameWorldState,
  id: ItemId
): { ok: boolean; message: string; swiftApplied?: boolean } {
  const def = ITEMS[id];
  if (!def || (!def.edibleStamina && !def.edibleHealth)) {
    return { ok: false, message: 'Cannot eat this item' };
  }
  if (!consumeInventoryItem(state, id, 1)) {
    return { ok: false, message: 'None left' };
  }
  state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + (def.edibleStamina ?? 0));
  state.player.health = Math.min(state.player.maxHealth, state.player.health + (def.edibleHealth ?? 0));
  let swiftApplied = false;
  if (id === 'herbal_tea') {
    state.swiftUntilMinutes = Math.min(DAY_END_MINUTES, state.timeMinutes + 180);
    swiftApplied = true;
  }
  return {
    ok: true,
    swiftApplied,
    message: swiftApplied
      ? `Drank ${def.name} (+${def.edibleStamina ?? 0} Stam, Swift Brew!)`
      : `Ate ${def.name} (+${def.edibleStamina ?? 0} Stam)`,
  };
}

export function eatBestFood(
  state: GameWorldState
): { ok: boolean; itemId?: ItemId; message: string; swiftApplied?: boolean } {
  const candidates = (Object.entries(state.inventory) as [ItemId, number | undefined][])
    .filter(([id, count]) => {
      if (!count || count <= 0) return false;
      const def = ITEMS[id];
      return Boolean(def && (def.edibleStamina || def.edibleHealth));
    })
    .sort((a, b) => {
      const defA = ITEMS[a[0]];
      const defB = ITEMS[b[0]];
      const scoreA = (defA.edibleStamina ?? 0) + (defA.edibleHealth ?? 0) * 1.2;
      const scoreB = (defB.edibleStamina ?? 0) + (defB.edibleHealth ?? 0) * 1.2;
      return scoreB - scoreA;
    });
  if (candidates.length === 0) {
    return { ok: false, message: 'No food in backpack!' };
  }
  const bestId = candidates[0][0];
  const res = eatCrop(state, bestId);
  return { ok: res.ok, itemId: res.ok ? bestId : undefined, message: res.message, swiftApplied: res.swiftApplied };
}

export function rollWeather(season: Season, rng: () => number = Math.random): WeatherType {
  const r = rng();
  if (season === 'Spring') {
    if (r < 0.25) return 'Rainstorm';
    if (r < 0.40) return 'Drought';
    if (r < 0.54) return 'Heatwave';
    return 'Clear';
  }
  if (season === 'Summer') {
    if (r < 0.28) return 'Heatwave';
    if (r < 0.50) return 'Drought';
    if (r < 0.65) return 'Rainstorm';
    return 'Clear';
  }
  if (season === 'Autumn') {
    if (r < 0.30) return 'Rainstorm';
    if (r < 0.44) return 'Drought';
    if (r < 0.54) return 'Heatwave';
    return 'Clear';
  }
  // Winter
  if (r < 0.38) return 'Rainstorm';
  if (r < 0.50) return 'Drought';
  return 'Clear';
}

export function triggerMiddayDrought(state: GameWorldState): number {
  if (state.weather !== 'Drought' || state.droughtMiddayTriggered) return 0;
  state.droughtMiddayTriggered = true;
  let dried = 0;
  for (const tile of state.tiles) {
    if (tile.tilled && tile.watered) {
      if (
        (tile.mulchedDays ?? 0) > 0 ||
        isCoveredBySensor(state, tile.x, tile.y) ||
        isCoveredByGreenhouse(state, tile.x, tile.y)
      ) {
        continue;
      }
      tile.watered = false;
      tile.droughtDriedToday = true;
      dried += 1;
    }
  }
  return dried;
}

export function triggerMiddayHeatwave(state: GameWorldState): number {
  if (state.weather !== 'Heatwave' || state.heatwaveMiddayTriggered) return 0;
  state.heatwaveMiddayTriggered = true;
  let exposedSensitive = 0;
  for (const tile of state.tiles) {
    if (
      tile.tilled &&
      tile.watered &&
      (tile.mulchedDays ?? 0) <= 0 &&
      !isCoveredByShadeNet(state, tile.x, tile.y) &&
      !isCoveredBySensor(state, tile.x, tile.y) &&
      !isCoveredByGreenhouse(state, tile.x, tile.y)
    ) {
      tile.watered = false;
    }
    if (tile.crop && !tile.crop.withered && SENSITIVE_CROPS.includes(tile.crop.type)) {
      if (!isCoveredByShadeNet(state, tile.x, tile.y) && !isCoveredByGreenhouse(state, tile.x, tile.y)) {
        exposedSensitive += 1;
      }
    }
  }
  return exposedSensitive;
}

export function advanceDay(
  state: GameWorldState,
  rng: () => number = Math.random
): DaySummary {
  const prevWeather = state.weather;
  const prevSeason = getSeason(state.seasonIndex);

  let cropsGrown = 0;
  let cropsWithered = 0;
  let cropsFlooded = 0;
  let cropsHeatDamaged = 0;
  let wildlifeDamage = 0;
  let owlRepelled = 0;
  let shadedCropsInHeatwave = 0;

  let owlCharges = state.tiles.filter((t) => t.structure?.type === 'owl_box').length;

  // Resolve any active nocturnal wildlife before morning
  for (const w of state.wildlife) {
    if (w.state === 'ko' || w.state === 'fleeing') continue;
    if (owlCharges > 0) {
      owlCharges -= 1;
      owlRepelled += 1;
      state.stats.owlSaves = (state.stats.owlSaves ?? 0) + 1;
      continue;
    }
    // Unfended wildlife may nibble 1 unprotected crop overnight
    for (const tile of state.tiles) {
      if (tile.crop && !tile.crop.withered && !isProtectedByScarecrow(state, tile.x, tile.y)) {
        tile.crop = null;
        wildlifeDamage += 1;
        break;
      }
    }
  }

  const inSkySanctuary = state.activeRealm === 'sky_sanctuary';

  for (const tile of state.tiles) {
    const inGreenhouse = inSkySanctuary || isCoveredByGreenhouse(state, tile.x, tile.y);

    if (tile.crop) {
      const crop = tile.crop;
      if (!crop.withered) {
        const def = CROPS[crop.type];

        // Heatwave withers unprotected sensitive crops (e.g. Strawberry, Tomato) unless covered by Shade Net or Greenhouse
        if (prevWeather === 'Heatwave' && !inGreenhouse) {
          const shaded = isCoveredByShadeNet(state, tile.x, tile.y);
          if (shaded) {
            shadedCropsInHeatwave += 1;
          } else if (SENSITIVE_CROPS.includes(crop.type)) {
            crop.withered = true;
            cropsHeatDamaged += 1;
            cropsWithered += 1;
            tile.watered = false;
            tile.droughtDriedToday = false;
            continue;
          }
        } else if (prevWeather === 'Heatwave' && inGreenhouse) {
          shadedCropsInHeatwave += 1;
        }

        // Rainstorm auto-waters, but completely unprotected crops risk flood/frost stress (Chili & Greenhouse are immune)
        const wasWatered = tile.watered || prevWeather === 'Rainstorm' || inSkySanctuary;

        if (
          prevWeather === 'Rainstorm' &&
          !inGreenhouse &&
          crop.type !== 'chili' &&
          !isProtectedFromFlood(state, tile.x, tile.y)
        ) {
          if (rng() < (prevSeason === 'Winter' ? 0.35 : 0.20)) {
            crop.floodedDays += 1;
            if (crop.floodedDays >= 2) {
              crop.withered = true;
              cropsFlooded += 1;
              cropsWithered += 1;
              tile.watered = false;
              tile.droughtDriedToday = false;
              continue;
            }
          }
        }

        if (wasWatered) {
          crop.daysUnwatered = 0;
          const isFavSeason = def.favoriteSeasons.includes(prevSeason);
          // In winter, non-favorite crops grow half as likely unless warmed by lantern or inside Greenhouse
          const warmed = inGreenhouse || isProtectedFromFlood(state, tile.x, tile.y);
          let grewToday = false;
          if (prevSeason === 'Winter' && !isFavSeason && !warmed) {
            if (rng() < 0.5 && crop.growthDays < def.daysToGrow) {
              crop.growthDays += 1;
              cropsGrown += 1;
              grewToday = true;
            }
          } else if (crop.growthDays < def.daysToGrow) {
            crop.growthDays += inSkySanctuary ? 2 : 1;
            if (crop.growthDays > def.daysToGrow) crop.growthDays = def.daysToGrow;
            cropsGrown += 1;
            grewToday = true;
          }
          // Organic Compost Bin accelerates nearby crop growth (+40% chance of extra growth day)
          if (
            grewToday &&
            crop.growthDays < def.daysToGrow &&
            isCoveredByCompost(state, tile.x, tile.y) &&
            rng() < 0.4
          ) {
            crop.growthDays += 1;
          }
        } else {
          // Un-watered crops wither after 2 days
          crop.daysUnwatered += 1;
          if (crop.daysUnwatered >= 2) {
            crop.withered = true;
            cropsWithered += 1;
          }
        }
      }
    }

    // Overnight evaporation (unless Bio-Mulch retention remains)
    tile.watered = false;
    tile.droughtDriedToday = false;
  }

  // Track Heatwave survival mission when passing a Heatwave with Shade Net & 0 crop loss
  if (prevWeather === 'Heatwave' && cropsHeatDamaged === 0 && shadedCropsInHeatwave > 0) {
    state.stats.heatwavesSurvivedWithShade = (state.stats.heatwavesSurvivedWithShade ?? 0) + 1;
  }

  // Advance day & season
  state.day += 1;
  state.stats.daysSurvived = state.day;
  const newSeasonIndex = Math.floor((state.day - 1) / DAYS_PER_SEASON);
  state.seasonIndex = newSeasonIndex;
  const newSeason = getSeason(newSeasonIndex);

  // Use forecastWeather if present, otherwise roll; also roll tomorrow's forecast for NASA Station
  const nextWeather = state.forecastWeather ?? rollWeather(newSeason, rng);
  const tomorrowSeason = getSeason(Math.floor(state.day / DAYS_PER_SEASON));
  const tomorrowWeather = rollWeather(tomorrowSeason, rng);

  state.weather = nextWeather;
  state.forecastWeather = tomorrowWeather;
  state.droughtMiddayTriggered = false;
  state.heatwaveMiddayTriggered = false;
  state.wishedToday = false;
  state.swiftUntilMinutes = 0;
  state.pettedAnimalsToday = [];
  state.elderGiftsToday = [];
  state.strangeZoneUsedToday = [];
  state.dailyTreasure = rollDailyNatureTreasure(state.tiles, newSeason, rng);
  state.mysteryChest = rollDailyMysteryChest(state.tiles, state.activeRealm ?? 'homestead', rng);
  state.fireflies = [];
  state.luckySpinUsedToday = false;
  state.ecoQuizAnsweredToday = false;
  state.rushUsedToday = false;
  state.timeMinutes = DAY_START_MINUTES;
  state.wildlife = [];

  // Also keep cached Homestead crops growing overnight if player slept while away in another realm
  if ((state.activeRealm ?? 'homestead') !== 'homestead' && state.realmCaches?.homestead) {
    const homeCache = state.realmCaches.homestead;
    for (const tile of homeCache.tiles) {
      if (tile.crop && !tile.crop.withered) {
        const def = CROPS[tile.crop.type];
        if ((tile.watered || prevWeather === 'Rainstorm') && tile.crop.growthDays < def.daysToGrow) {
          tile.crop.growthDays += 1;
          cropsGrown += 1;
        }
      }
      if ((tile.mulchedDays ?? 0) > 0) {
        tile.mulchedDays = Math.max(0, (tile.mulchedDays ?? 0) - 1);
        if (tile.tilled) tile.watered = true;
      } else {
        tile.watered = nextWeather === 'Rainstorm' && tile.tilled;
      }
      tile.droughtDriedToday = false;
    }
  }

  // Rainbow Morning Blessing: when Rainstorm clears into Clear skies!
  const rainbowActive = prevWeather === 'Rainstorm' && nextWeather === 'Clear';
  state.rainbowActive = rainbowActive;
  if (rainbowActive) {
    for (const tile of state.tiles) {
      if (tile.crop && !tile.crop.withered) {
        const cdef = CROPS[tile.crop.type];
        if (tile.crop.growthDays < cdef.daysToGrow && rng() < 0.5) {
          tile.crop.growthDays += 1;
        }
      }
    }
  }

  // Rainstorm fills all Rainwater Harvest Tanks (5 free waterings = 50L each)
  let rainCollectedLiters = 0;
  if (nextWeather === 'Rainstorm') {
    for (const tile of state.tiles) {
      if (tile.structure?.type === 'rain_tank') {
        tile.structure.storedWaterCharges = RAIN_TANK_MAX_CHARGES;
        rainCollectedLiters += RAIN_TANK_MAX_CHARGES * LITERS_PER_WATERING;
      }
    }
    if (rainCollectedLiters > 0) {
      state.stats.rainwaterCollectedLiters =
        (state.stats.rainwaterCollectedLiters ?? 0) + rainCollectedLiters;
    }
  }

  // Collect Drip Irrigation rows (horizontal row per placed drip_sprinkler)
  const dripRows = new Set<number>();
  for (const tile of state.tiles) {
    if (tile.structure?.type === 'drip_sprinkler') {
      dripRows.add(tile.y);
    }
  }

  // Rainstorm, Drip Sprinklers, Solar Auto-Sprinklers, & Bio-Mulch water tilled soil for the new morning
  let sprinklerWatered = 0;
  let dripWatered = 0;
  for (const tile of state.tiles) {
    if ((tile.mulchedDays ?? 0) > 0) {
      tile.mulchedDays = Math.max(0, (tile.mulchedDays ?? 0) - 1);
      if (tile.tilled) tile.watered = true;
    }
    if (!tile.tilled) continue;
    if (nextWeather === 'Rainstorm') {
      tile.watered = true;
    } else if (dripRows.has(tile.y)) {
      tile.watered = true;
      dripWatered += 1;
    } else if (isCoveredBySprinkler(state, tile.x, tile.y)) {
      tile.watered = true;
      sprinklerWatered += 1;
    }
  }

  const waterSavedLiters = dripWatered * DRIP_WATER_SAVED_PER_TILE;
  if (waterSavedLiters > 0) {
    state.stats.waterSavedLiters = (state.stats.waterSavedLiters ?? 0) + waterSavedLiters;
  }

  // Farmyard chickens lay fresh morning eggs
  const chickens = state.chickens ?? [];
  const eggsCollected = chickens.length;
  if (eggsCollected > 0) {
    addInventoryItem(state, 'egg', eggsCollected);
    state.stats.eggsCollected = (state.stats.eggsCollected ?? 0) + eggsCollected;
  }

  // Dairy cows yield fresh morning milk & Fluffy sheep yield soft wool
  const cows = state.cows ?? [];
  const milkCollected = cows.length;
  if (milkCollected > 0) {
    addInventoryItem(state, 'milk', milkCollected);
    state.stats.milkCollected = (state.stats.milkCollected ?? 0) + milkCollected;
  }
  const sheep = state.sheep ?? [];
  const woolCollected = sheep.length;
  if (woolCollected > 0) {
    addInventoryItem(state, 'wool', woolCollected);
    state.stats.woolCollected = (state.stats.woolCollected ?? 0) + woolCollected;
  }

  // Honeybee Hives yield fresh Wildflower Honey (+1 bonus honey if Fragrant Lavender or Sunlit Sunflower grows nearby!)
  let honeyCollected = 0;
  for (const tile of state.tiles) {
    if (tile.structure?.type === 'beehive') {
      const hasPollinator = state.tiles.some(
        (lt) =>
          (lt.crop?.type === 'lavender' || lt.crop?.type === 'sunflower') &&
          !lt.crop.withered &&
          Math.hypot(lt.x - tile.x, lt.y - tile.y) <= BEEHIVE_RADIUS + 0.5
      );
      honeyCollected += hasPollinator ? 2 : 1;
    }
  }
  if (honeyCollected > 0) {
    addInventoryItem(state, 'honey', honeyCollected);
    state.stats.honeyCollected = (state.stats.honeyCollected ?? 0) + honeyCollected;
  }

  // Artisan Machines overnight processing (Cheese Press, Berry Jam Maker, Butter Churn, Tea Kettle) + Windmill income
  let cheeseMade = 0;
  let jamMade = 0;
  let butterMade = 0;
  let teaMade = 0;
  let windmillGold = 0;
  for (const tile of state.tiles) {
    if (tile.structure?.type === 'cheese_press' && (state.inventory.milk ?? 0) >= 1) {
      consumeInventoryItem(state, 'milk', 1);
      addInventoryItem(state, 'cheese', 1);
      cheeseMade += 1;
      state.stats.artisanProduced = (state.stats.artisanProduced ?? 0) + 1;
      state.stats.cheeseMade = (state.stats.cheeseMade ?? 0) + 1;
    } else if (tile.structure?.type === 'butter_churn' && (state.inventory.milk ?? 0) >= 1) {
      consumeInventoryItem(state, 'milk', 1);
      addInventoryItem(state, 'butter', 1);
      butterMade += 1;
      state.stats.artisanProduced = (state.stats.artisanProduced ?? 0) + 1;
      state.stats.butterMade = (state.stats.butterMade ?? 0) + 1;
    } else if (tile.structure?.type === 'jam_maker' && (state.inventory.strawberry ?? 0) >= 1) {
      consumeInventoryItem(state, 'strawberry', 1);
      addInventoryItem(state, 'strawberry_jam', 1);
      jamMade += 1;
      state.stats.artisanProduced = (state.stats.artisanProduced ?? 0) + 1;
      state.stats.jamMade = (state.stats.jamMade ?? 0) + 1;
    } else if (tile.structure?.type === 'tea_kettle') {
      const mat: ItemId | null =
        (state.inventory.lavender ?? 0) >= 1
          ? 'lavender'
          : (state.inventory.honey ?? 0) >= 1
          ? 'honey'
          : null;
      if (mat) {
        consumeInventoryItem(state, mat, 1);
        addInventoryItem(state, 'herbal_tea', 1);
        teaMade += 1;
        state.stats.artisanProduced = (state.stats.artisanProduced ?? 0) + 1;
        state.stats.teaBrewed = (state.stats.teaBrewed ?? 0) + 1;
      }
    } else if (tile.structure?.type === 'windmill') {
      windmillGold += WINDMILL_DAILY_GOLD;
    }
  }
  if (windmillGold > 0) {
    state.player.gold += windmillGold;
    state.stats.totalGoldEarned += windmillGold;
  }

  // Barn Cat morning friendship gift (+1 Fish on even days, +15g on odd days)
  let catGift: string | undefined;
  if (state.cat) {
    if (state.day % 2 === 0) {
      addInventoryItem(state, 'fish', 1);
      catGift = 'fish';
    } else {
      state.player.gold += 15;
      state.stats.totalGoldEarned += 15;
      catGift = '15g';
    }
  }

  // Consecutive Day Survival Streak gold bonus (+10g per day up to +50g)
  const morningBonusGold =
    state.day >= 3 ? Math.min(50, Math.max(10, (state.day - 2) * 10)) : 0;
  if (morningBonusGold > 0) {
    state.player.gold += morningBonusGold;
    state.stats.totalGoldEarned += morningBonusGold;
  }

  // Generate fresh Daily Village Order, Daily Market Surge (+50%), & reset harvest combo streak
  state.dailyOrder = generateDailyOrder(state.day, newSeason, rng);
  state.marketSurgeCrop = rollMarketSurgeCrop(state.day, rng);
  state.harvestCombo = 0;
  state.lastHarvestMs = 0;

  // Restore player stamina & partial health
  state.player.stamina = state.player.maxStamina;
  state.player.health = Math.min(state.player.maxHealth, state.player.health + 35);

  const stationActive = hasNasaStation(state);
  const soilMoisturePct = computeSoilMoisturePct(state);
  const tempC = computeTemperatureC(state);
  const messageFrom2040 = getMessageFrom2040ForDay(state.day);

  const notes: string[] = [];
  if (cropsGrown > 0) notes.push(`${cropsGrown} crop${cropsGrown > 1 ? 's' : ''} grew`);
  if (rainbowActive) notes.push('Rainbow morning!');
  if (sprinklerWatered > 0) notes.push(`${sprinklerWatered} sprinkler-watered`);
  if (dripWatered > 0) notes.push(`${dripWatered} drip-irrigated (-${waterSavedLiters}L saved)`);
  if (rainCollectedLiters > 0) notes.push(`+${rainCollectedLiters}L rain stored`);
  if (eggsCollected > 0) notes.push(`+${eggsCollected} fresh egg${eggsCollected > 1 ? 's' : ''}`);
  if (milkCollected > 0) notes.push(`+${milkCollected} fresh milk`);
  if (woolCollected > 0) notes.push(`+${woolCollected} soft wool`);
  if (honeyCollected > 0) notes.push(`+${honeyCollected} wild honey`);
  if (cheeseMade > 0) notes.push(`+${cheeseMade} artisan cheese`);
  if (butterMade > 0) notes.push(`+${butterMade} farm butter`);
  if (jamMade > 0) notes.push(`+${jamMade} berry jam`);
  if (teaMade > 0) notes.push(`+${teaMade} herbal tea`);
  if (windmillGold > 0) notes.push(`+${windmillGold}g windmill income`);
  if (morningBonusGold > 0) notes.push(`+${morningBonusGold}g streak bonus`);
  if (owlRepelled > 0) notes.push(`${owlRepelled} owl save`);
  if (catGift) notes.push(`cat gift: ${catGift}`);
  if (cropsWithered > 0) notes.push(`${cropsWithered} withered`);
  if (wildlifeDamage > 0) notes.push(`${wildlifeDamage} lost to wildlife`);
  if (notes.length === 0) notes.push(`A fresh ${newSeason} morning begins`);

  const summary: DaySummary = {
    day: state.day,
    season: newSeason,
    weather: nextWeather,
    cropsGrown,
    cropsWithered,
    cropsFlooded,
    cropsHeatDamaged,
    wildlifeDamage,
    owlRepelled,
    eggsCollected,
    honeyCollected,
    milkCollected,
    woolCollected,
    cheeseMade,
    butterMade,
    jamMade,
    teaMade,
    windmillGold,
    morningBonusGold,
    catGift,
    rainbowActive,
    sprinklerWatered,
    dripWatered,
    waterSavedLiters,
    rainCollectedLiters,
    hasNasaStation: stationActive,
    soilMoisturePct,
    tempC,
    tomorrowWeather,
    messageFrom2040,
    message: notes.join(' · '),
  };
  state.lastSummary = summary;
  return summary;
}

export function buyShopItem(
  state: GameWorldState,
  itemId: ItemId,
  quantity = 1
): { ok: boolean; message: string } {
  const def = ITEMS[itemId];
  if (!def || !def.buyPrice) return { ok: false, message: 'Item not for sale' };
  const qty = Math.floor(quantity);
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, message: 'Invalid quantity' };
  }
  const totalCost = def.buyPrice * qty;
  if (state.player.gold < totalCost) {
    return { ok: false, message: 'Not enough Gold' };
  }
  state.player.gold -= totalCost;
  addInventoryItem(state, itemId, qty);
  return { ok: true, message: `Bought ${qty}x ${def.name}` };
}

export function sellCropItem(
  state: GameWorldState,
  itemId: ItemId,
  quantity = 1
): { ok: boolean; message: string; earned: number } {
  const def = ITEMS[itemId];
  if (!def || !def.sellPrice) return { ok: false, message: 'Cannot sell this item', earned: 0 };
  const requested = Math.floor(quantity);
  if (!Number.isFinite(requested) || requested <= 0) {
    return { ok: false, message: 'Invalid quantity', earned: 0 };
  }
  const owned = state.inventory[itemId] ?? 0;
  const sellQty = Math.min(owned, requested);
  if (sellQty <= 0) return { ok: false, message: 'None to sell', earned: 0 };

  let unitPrice = def.sellPrice;
  const season = getSeason(state.seasonIndex);
  if (def.cropType && CROPS[def.cropType].favoriteSeasons.includes(season)) {
    unitPrice = Math.round(unitPrice * 1.25); // 25% seasonal freshness bonus
  }
  if (def.cropType && state.marketSurgeCrop === def.cropType) {
    unitPrice = Math.round(unitPrice * 1.5); // +50% daily Market Surge!
  }

  const earned = unitPrice * sellQty;
  consumeInventoryItem(state, itemId, sellQty);
  state.player.gold += earned;
  state.stats.totalGoldEarned += earned;
  return { ok: true, message: `Sold ${sellQty}x ${def.name} (+${earned}g)`, earned };
}

export function upgradeTool(
  state: GameWorldState,
  tool: ToolType
): { ok: boolean; message: string } {
  const currentLvl =
    tool === 'hoe'
      ? state.upgrades.hoeLevel
      : tool === 'watering_can'
      ? state.upgrades.canLevel
      : state.upgrades.axeLevel;

  if (currentLvl >= 4) {
    return { ok: false, message: 'Already at max Titanium tier' };
  }
  const cost = currentLvl === 1 ? 120 : currentLvl === 2 ? 260 : 450;
  if (state.player.gold < cost) {
    return { ok: false, message: `Need ${cost}g to upgrade` };
  }
  state.player.gold -= cost;
  if (tool === 'hoe') state.upgrades.hoeLevel += 1;
  else if (tool === 'watering_can') {
    state.upgrades.canLevel += 1;
    state.player.maxWaterLevel =
      state.upgrades.canLevel === 2 ? 20 : state.upgrades.canLevel === 3 ? 30 : 40;
    state.player.waterLevel = state.player.maxWaterLevel;
  } else {
    state.upgrades.axeLevel += 1;
  }
  const tierName = currentLvl === 1 ? 'Copper' : currentLvl === 2 ? 'Master' : 'Titanium';
  return { ok: true, message: `Upgraded to ${tierName} tier!` };
}

export function craftItem(
  state: GameWorldState,
  recipeId: PlaceableType | 'fertilizer' | 'bio_mulch'
): { ok: boolean; message: string } {
  const recipe = CRAFT_RECIPES.find((r) => r.id === recipeId);
  if (!recipe) return { ok: false, message: 'Unknown recipe' };

  for (const [key, req] of Object.entries(recipe.ingredients)) {
    if (!req) continue;
    if (key === 'gold') {
      if (state.player.gold < req) return { ok: false, message: 'Not enough Gold' };
    } else {
      const owned = state.inventory[key as ItemId] ?? 0;
      if (owned < req) return { ok: false, message: `Need ${req} ${ITEMS[key as ItemId].name}` };
    }
  }

  for (const [key, req] of Object.entries(recipe.ingredients)) {
    if (!req) continue;
    if (key === 'gold') state.player.gold -= req;
    else consumeInventoryItem(state, key as ItemId, req);
  }

  addInventoryItem(state, recipe.id, recipe.outputCount);
  return { ok: true, message: `Crafted ${recipe.name}` };
}

export function computeFarmRestorationPercent(state: GameWorldState): number {
  const sourceTiles =
    (state.activeRealm ?? 'homestead') === 'homestead'
      ? state.tiles
      : state.realmCaches?.homestead?.tiles ?? state.tiles;
  let farmPlotTiles = 0;
  let clearedFarmTiles = 0;
  let cultivatedTiles = 0;
  let defenseDecorCount = 0;

  for (const t of sourceTiles) {
    if (t.tillable) {
      farmPlotTiles += 1;
      if (!t.obstacle) clearedFarmTiles += 1;
      if (t.tilled || t.structure) cultivatedTiles += 1;
    }
    if (t.structure) {
      defenseDecorCount += 1;
    }
  }

  const clearRatio = farmPlotTiles > 0 ? clearedFarmTiles / farmPlotTiles : 1; // 45% weight
  const cultRatio = Math.min(1, cultivatedTiles / 28); // 30% weight (28+ cultivated tiles = full)
  const buildRatio = Math.min(1, defenseDecorCount / 14); // 25% weight (14+ fences/scarecrows/lanterns/decor)

  const score = clearRatio * 45 + cultRatio * 30 + buildRatio * 25;
  return Math.min(100, Math.round(score));
}

export function buyFarmChicken(
  state: GameWorldState
): { ok: boolean; message: string } {
  if (!state.chickens) state.chickens = [];
  if (state.chickens.length >= MAX_CHICKENS) {
    return { ok: false, message: 'Coop is full (Max 3)' };
  }
  if (state.player.gold < CHICKEN_PRICE) {
    return { ok: false, message: 'Not enough Gold' };
  }
  state.player.gold -= CHICKEN_PRICE;
  const idx = state.chickens.length;
  const chicken: FarmChicken = {
    id: idx + 1,
    x: 9.2 + idx * 1.1,
    y: 7.4,
    vx: 0.4,
    vy: 0,
    facingX: 1,
    hopPhase: idx * 1.3,
    moveTimer: 1.5,
  };
  state.chickens.push(chicken);
  return { ok: true, message: 'Adopted Farm Chicken!' };
}

export function stepChickens(
  state: GameWorldState,
  dt: number,
  rng: () => number = Math.random
): void {
  if ((state.activeRealm ?? 'homestead') !== 'homestead') return;
  const chickens = state.chickens;
  if (!chickens || chickens.length === 0) return;

  for (const c of chickens) {
    c.moveTimer -= dt;
    if (c.moveTimer <= 0) {
      c.moveTimer = 1.6 + rng() * 2.4;
      if (rng() < 0.35) {
        c.vx = 0;
        c.vy = 0;
      } else {
        const angle = rng() * Math.PI * 2;
        const speed = 0.65 + rng() * 0.45;
        c.vx = Math.cos(angle) * speed;
        c.vy = Math.sin(angle) * speed;
        if (Math.abs(c.vx) > 0.05) c.facingX = c.vx >= 0 ? 1 : -1;
      }
    }

    if (c.vx !== 0 || c.vy !== 0) {
      const nx = Math.max(7.2, Math.min(13.5, c.x + c.vx * dt));
      const ny = Math.max(6.8, Math.min(8.6, c.y + c.vy * dt));
      if (isTileWalkable(state, Math.floor(nx), Math.floor(ny))) {
        c.x = nx;
        c.y = ny;
      } else {
        c.vx = -c.vx;
        c.vy = -c.vy;
        c.facingX = c.vx >= 0 ? 1 : -1;
      }
      c.hopPhase += dt * 8;
    }
  }
}

export function buyDairyCow(state: GameWorldState): { ok: boolean; message: string } {
  if (!state.cows) state.cows = [];
  if (state.cows.length >= MAX_COWS) {
    return { ok: false, message: 'Pasture full (Max 2 Cows)' };
  }
  if (state.player.gold < COW_PRICE) {
    return { ok: false, message: 'Not enough Gold' };
  }
  state.player.gold -= COW_PRICE;
  const idx = state.cows.length;
  state.cows.push({
    id: idx + 1,
    kind: 'cow',
    x: 16.2 + idx * 1.4,
    y: 7.5,
    vx: 0.3,
    vy: 0,
    facingX: 1,
    hopPhase: idx * 1.1,
    moveTimer: 2.0,
  });
  return { ok: true, message: 'Adopted Dairy Cow!' };
}

export function buyFluffySheep(state: GameWorldState): { ok: boolean; message: string } {
  if (!state.sheep) state.sheep = [];
  if (state.sheep.length >= MAX_SHEEP) {
    return { ok: false, message: 'Pasture full (Max 2 Sheep)' };
  }
  if (state.player.gold < SHEEP_PRICE) {
    return { ok: false, message: 'Not enough Gold' };
  }
  state.player.gold -= SHEEP_PRICE;
  const idx = state.sheep.length;
  state.sheep.push({
    id: idx + 1,
    kind: 'sheep',
    x: 17.0 + idx * 1.2,
    y: 8.1,
    vx: -0.35,
    vy: 0,
    facingX: -1,
    hopPhase: idx * 0.9,
    moveTimer: 1.8,
  });
  return { ok: true, message: 'Adopted Fluffy Sheep!' };
}

export function buyGuardDog(state: GameWorldState): { ok: boolean; message: string } {
  if (state.dog) {
    return { ok: false, message: 'Guard Dog already adopted (Max 1)' };
  }
  if (state.player.gold < DOG_PRICE) {
    return { ok: false, message: 'Not enough Gold' };
  }
  state.player.gold -= DOG_PRICE;
  state.dog = {
    id: 1,
    kind: 'dog',
    x: 8.2,
    y: 7.8,
    vx: 0.6,
    vy: 0,
    facingX: 1,
    hopPhase: 0,
    moveTimer: 1.2,
    barkCooldown: 0,
  };
  return { ok: true, message: 'Adopted Loyal Farm Dog!' };
}

export function buyFarmCat(state: GameWorldState): { ok: boolean; message: string } {
  if (state.cat) {
    return { ok: false, message: 'Barn Cat already adopted (Max 1)' };
  }
  if (state.player.gold < CAT_PRICE) {
    return { ok: false, message: 'Not enough Gold' };
  }
  state.player.gold -= CAT_PRICE;
  state.cat = {
    id: 1,
    kind: 'cat',
    x: 6.8,
    y: 7.4,
    vx: 0.45,
    vy: 0,
    facingX: 1,
    hopPhase: 0,
    moveTimer: 1.5,
  };
  return { ok: true, message: 'Adopted Cozy Barn Cat!' };
}

export function stepLivestockAndDog(
  state: GameWorldState,
  dt: number,
  onDogBark?: (wx: number, wy: number) => void,
  rng: () => number = Math.random
): void {
  if ((state.activeRealm ?? 'homestead') !== 'homestead') return;
  const roamers: LivestockEntity[] = [...(state.cows ?? []), ...(state.sheep ?? [])];
  for (const animal of roamers) {
    animal.moveTimer -= dt;
    if (animal.moveTimer <= 0) {
      animal.moveTimer = 2.0 + rng() * 2.5;
      if (rng() < 0.4) {
        animal.vx = 0;
        animal.vy = 0;
      } else {
        const angle = rng() * Math.PI * 2;
        const speed = 0.45 + rng() * 0.3;
        animal.vx = Math.cos(angle) * speed;
        animal.vy = Math.sin(angle) * speed;
        if (Math.abs(animal.vx) > 0.05) animal.facingX = animal.vx >= 0 ? 1 : -1;
      }
    }
    if (animal.vx !== 0 || animal.vy !== 0) {
      const nx = Math.max(15.2, Math.min(20.5, animal.x + animal.vx * dt));
      const ny = Math.max(6.8, Math.min(8.7, animal.y + animal.vy * dt));
      if (isTileWalkable(state, Math.floor(nx), Math.floor(ny))) {
        animal.x = nx;
        animal.y = ny;
      } else {
        animal.vx = -animal.vx;
        animal.vy = -animal.vy;
        animal.facingX = animal.vx >= 0 ? 1 : -1;
      }
      animal.hopPhase += dt * 5;
    }
  }

  const cat = state.cat;
  if (cat) {
    cat.moveTimer -= dt;
    if (cat.moveTimer <= 0) {
      cat.moveTimer = 1.8 + rng() * 2.2;
      if (rng() < 0.45) {
        cat.vx = 0;
        cat.vy = 0;
      } else {
        const angle = rng() * Math.PI * 2;
        const speed = 0.7 + rng() * 0.4;
        cat.vx = Math.cos(angle) * speed;
        cat.vy = Math.sin(angle) * speed;
        if (Math.abs(cat.vx) > 0.05) cat.facingX = cat.vx >= 0 ? 1 : -1;
      }
    }
    if (cat.vx !== 0 || cat.vy !== 0) {
      const nx = Math.max(5.5, Math.min(15.5, cat.x + cat.vx * dt));
      const ny = Math.max(6.8, Math.min(9.6, cat.y + cat.vy * dt));
      if (isTileWalkable(state, Math.floor(nx), Math.floor(ny))) {
        cat.x = nx;
        cat.y = ny;
      } else {
        cat.vx = -cat.vx;
        cat.vy = -cat.vy;
        cat.facingX = cat.vx >= 0 ? 1 : -1;
      }
      cat.hopPhase += dt * 7;
    }
  }

  const dog = state.dog;
  if (!dog) return;
  if ((dog.barkCooldown ?? 0) > 0) {
    dog.barkCooldown = Math.max(0, (dog.barkCooldown ?? 0) - dt);
  }

  // Guard Dog targets active nocturnal wildlife!
  const targetBeast = state.wildlife.find((w) => w.state !== 'ko' && w.state !== 'fleeing');
  if (targetBeast) {
    const dx = targetBeast.x - dog.x;
    const dy = targetBeast.y - dog.y;
    const dist = Math.hypot(dx, dy) || 0.01;
    const dogSpeed = 3.2;
    const nx = dog.x + (dx / dist) * dogSpeed * dt;
    const ny = dog.y + (dy / dist) * dogSpeed * dt;
    if (isTileWalkable(state, Math.floor(nx), Math.floor(ny))) {
      dog.x = nx;
      dog.y = ny;
    } else if (isTileWalkable(state, Math.floor(nx), Math.floor(dog.y))) {
      dog.x = nx;
    } else if (isTileWalkable(state, Math.floor(dog.x), Math.floor(ny))) {
      dog.y = ny;
    }
    dog.facingX = dx >= 0 ? 1 : -1;
    dog.hopPhase += dt * 12;

    if (dist <= 1.5 && (dog.barkCooldown ?? 0) <= 0) {
      dog.barkCooldown = 2.2;
      targetBeast.hp -= 1;
      targetBeast.hitFlashTimer = 0.14;
      if (targetBeast.hp <= 0) {
        targetBeast.state = 'ko';
        targetBeast.stateTimer = 0.45;
        state.stats.wildlifeRepelled += 1;
        state.player.gold += 5;
        state.stats.totalGoldEarned += 5;
        grantXp(state, 15);
      } else {
        targetBeast.state = 'fleeing';
        targetBeast.stateTimer = 1.6;
      }
      onDogBark?.(dog.x, dog.y);
    }
    return;
  }

  // Otherwise gently patrol near farmhouse door & farmer
  dog.moveTimer -= dt;
  if (dog.moveTimer <= 0) {
    dog.moveTimer = 1.6 + rng() * 2.0;
    if (rng() < 0.3) {
      dog.vx = 0;
      dog.vy = 0;
    } else {
      const targetX = Math.max(4, Math.min(20, state.player.x + (rng() - 0.5) * 4));
      const targetY = Math.max(6.8, Math.min(13, state.player.y + (rng() - 0.5) * 3));
      const dx = targetX - dog.x;
      const dy = targetY - dog.y;
      const len = Math.hypot(dx, dy) || 1;
      dog.vx = (dx / len) * 1.4;
      dog.vy = (dy / len) * 1.4;
      if (Math.abs(dog.vx) > 0.05) dog.facingX = dog.vx >= 0 ? 1 : -1;
    }
  }
  if (dog.vx !== 0 || dog.vy !== 0) {
    const nx = dog.x + dog.vx * dt;
    const ny = dog.y + dog.vy * dt;
    if (isTileWalkable(state, Math.floor(nx), Math.floor(ny))) {
      dog.x = nx;
      dog.y = ny;
    } else {
      dog.vx = 0;
      dog.vy = 0;
    }
    dog.hopPhase += dt * 9;
  }
}

export function getMissionProgress(state: GameWorldState, id: MissionId): number {
  const stats = state.stats;
  switch (id) {
    case 'first_sow':
      return stats.seedsPlanted ?? 0;
    case 'eco_water':
      return stats.cropsWatered ?? 0;
    case 'land_steward':
      return stats.obstaclesCleared ?? 0;
    case 'first_harvest':
      return stats.cropsHarvested ?? 0;
    case 'night_guard':
      return stats.defensesPlaced ?? 0;
    case 'smart_sprinkler':
      return stats.sprinklersPlaced ?? 0;
    case 'soil_sensor':
      return stats.sensorsPlaced ?? 0;
    case 'happy_flock':
      return stats.eggsCollected ?? 0;
    case 'wild_defender':
      return stats.wildlifeRepelled ?? 0;
    case 'market_trader':
      return stats.totalGoldEarned ?? 0;
    case 'climate_survivor':
      return stats.daysSurvived ?? 1;
    case 'ecogrow_master':
      return computeFarmRestorationPercent(state);
    case 'nasa_install_station':
      return stats.nasaStationsPlaced ?? 0;
    case 'nasa_grow_bean':
      return stats.beansHarvested ?? 0;
    case 'nasa_rain_100l':
      return stats.rainwaterCollectedLiters ?? 0;
    case 'nasa_heatwave_shade':
      return stats.heatwavesSurvivedWithShade ?? 0;
    case 'master_angler':
      return stats.fishCaught ?? 0;
    case 'artisan_maker':
      return stats.artisanProduced ?? 0;
    case 'dairy_rancher':
      return (state.cows?.length ?? 0) + (state.sheep?.length ?? 0);
    case 'veteran_farmer':
      return state.level ?? 1;
    case 'greenhouse_pioneer':
      return state.tiles.filter((t) => t.structure?.type === 'greenhouse').length;
    case 'cat_lover':
      return state.cat ? 1 : 0;
    case 'tea_brewer':
      return (stats.teaBrewed ?? 0) + (stats.butterMade ?? 0);
    case 'titanium_smith':
      return Math.max(state.upgrades.hoeLevel, state.upgrades.canLevel, state.upgrades.axeLevel) >= 4
        ? 1
        : 0;
    case 'portal_awakener':
    case 'realm_voyager':
      return state.unlockedRealms?.length ?? 1;
    case 'woods_village_visit':
      return (state.visitedVillages ?? []).includes('whispering_woods') ? 1 : 0;
    case 'woods_strange_zone':
      return (state.investigatedStrangeZones ?? []).includes('whispering_woods') ? 1 : 0;
    case 'oasis_village_visit':
      return (state.visitedVillages ?? []).includes('crystal_oasis') ? 1 : 0;
    case 'oasis_strange_zone':
      return (state.investigatedStrangeZones ?? []).includes('crystal_oasis') ? 1 : 0;
    case 'sky_sanctuary_expedition':
      return (state.visitedVillages ?? []).includes('sky_sanctuary') ||
        (state.investigatedStrangeZones ?? []).includes('sky_sanctuary')
        ? 1
        : 0;
    default:
      return 0;
  }
}

export function getEarnedBadges(state: GameWorldState): BadgeId[] {
  const badges: BadgeId[] = [];
  const nasaIds: MissionId[] = [
    'nasa_install_station',
    'nasa_grow_bean',
    'nasa_rain_100l',
    'nasa_heatwave_shade',
  ];
  const allNasaDone = nasaIds.every((id) => {
    const def = MISSIONS.find((m) => m.id === id);
    return def ? getMissionProgress(state, id) >= def.target : false;
  });
  if (allNasaDone) badges.push('time_captain');
  if ((state.stats.waterSavedLiters ?? 0) >= 50) badges.push('water_guardian');
  if ((state.stats.beansHarvested ?? 0) >= 3) badges.push('soil_friend');
  if ((state.stats.fishCaught ?? 0) >= 5) badges.push('angler_pro');
  if ((state.stats.artisanProduced ?? 0) >= 3) badges.push('artisan_chef');
  const hasGreenhouse = state.tiles.some((t) => t.structure?.type === 'greenhouse');
  const hasOwlBox = state.tiles.some((t) => t.structure?.type === 'owl_box');
  if (hasGreenhouse && hasOwlBox) badges.push('eco_architect');
  if ((state.stats.totalGoldEarned ?? 0) >= 1000) badges.push('farm_tycoon');
  if ((state.unlockedRealms?.length ?? 1) >= 4) badges.push('world_explorer');
  return badges;
}

export function getClaimableMissionsCount(state: GameWorldState): number {
  const claimed = new Set(state.claimedMissions ?? []);
  let count = 0;
  for (const m of MISSIONS) {
    if (!claimed.has(m.id) && getMissionProgress(state, m.id) >= m.target) {
      count += 1;
    }
  }
  return count;
}

export function claimMissionReward(
  state: GameWorldState,
  id: MissionId
): { ok: boolean; goldEarned: number } {
  const def = MISSIONS.find((m) => m.id === id);
  if (!def) return { ok: false, goldEarned: 0 };
  if (!state.claimedMissions) state.claimedMissions = [];
  if (state.claimedMissions.includes(id)) return { ok: false, goldEarned: 0 };
  const progress = getMissionProgress(state, id);
  if (progress < def.target) return { ok: false, goldEarned: 0 };

  state.claimedMissions.push(id);
  if (def.rewardGold > 0) {
    state.player.gold += def.rewardGold;
    state.stats.totalGoldEarned += def.rewardGold;
  }
  if (def.rewardItem) {
    addInventoryItem(state, def.rewardItem.id, def.rewardItem.qty);
  }
  if (def.rewardStamina) {
    state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + def.rewardStamina);
  }
  return { ok: true, goldEarned: def.rewardGold };
}

let nextWildlifeId = 1;

export function spawnNightWildlife(
  state: GameWorldState,
  rng: () => number = Math.random
): WildlifeEntity | null {
  if (state.activeRealm === 'sky_sanctuary') return null;
  if (state.wildlife.length >= 4 + Math.floor(state.day / 4)) return null;
  const kind = rng() < 0.62 ? 'rabbit' : 'boar';

  // Pick a random edge inside forest border
  const edge = Math.floor(rng() * 4);
  let x = 2.5;
  let y = 10.5;
  if (edge === 0) {
    x = 2 + Math.floor(rng() * (state.width - 4)) + 0.5;
    y = 1.5;
  } else if (edge === 1) {
    x = 2 + Math.floor(rng() * (state.width - 4)) + 0.5;
    y = state.height - 2.5;
  } else if (edge === 2) {
    x = 1.5;
    y = 8 + Math.floor(rng() * (state.height - 10)) + 0.5;
  } else {
    x = state.width - 2.5;
    y = 8 + Math.floor(rng() * (state.height - 10)) + 0.5;
  }

  const entity: WildlifeEntity = {
    id: nextWildlifeId++,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    hp: kind === 'boar' ? 3 : 1,
    maxHp: kind === 'boar' ? 3 : 1,
    state: 'approaching',
    stateTimer: 0,
    targetTileX: null,
    targetTileY: null,
    facingX: state.player.x > x ? 1 : -1,
    hitFlashTimer: 0,
    hopPhase: rng() * Math.PI * 2,
  };
  state.wildlife.push(entity);
  return entity;
}

export function stepWildlife(
  state: GameWorldState,
  dt: number,
  onCropEaten?: (tx: number, ty: number) => void,
  onPlayerHurt?: (dmg: number) => void
): void {
  for (let i = state.wildlife.length - 1; i >= 0; i--) {
    const w = state.wildlife[i];
    if (w.hitFlashTimer > 0) w.hitFlashTimer = Math.max(0, w.hitFlashTimer - dt);

    if (w.state === 'ko') {
      w.stateTimer -= dt;
      if (w.stateTimer <= 0) {
        state.wildlife.splice(i, 1);
      }
      continue;
    }

    if (w.state === 'fleeing') {
      w.stateTimer -= dt;
      const dx = w.x - state.player.x;
      const dy = w.y - state.player.y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = w.kind === 'rabbit' ? 3.8 : 2.9;
      w.x += (dx / len) * speed * dt;
      w.y += (dy / len) * speed * dt;
      w.hopPhase += dt * 14;
      w.facingX = dx >= 0 ? 1 : -1;
      if (
        w.stateTimer <= 0 ||
        w.x < 1.2 ||
        w.y < 1.2 ||
        w.x > state.width - 1.2 ||
        w.y > state.height - 1.2
      ) {
        state.wildlife.splice(i, 1);
      }
      continue;
    }

    // Repelled by Scarecrow
    if (isProtectedByScarecrow(state, Math.floor(w.x), Math.floor(w.y))) {
      if (w.kind === 'rabbit') {
        w.state = 'fleeing';
        w.stateTimer = 1.4;
        continue;
      }
    }

    // Boar checks proximity to player for windup -> charge!
    const distToPlayer = Math.hypot(state.player.x - w.x, state.player.y - w.y);
    if (w.kind === 'boar') {
      if (w.state === 'windup') {
        w.stateTimer -= dt;
        if (w.stateTimer <= 0) {
          w.state = 'charging';
          w.stateTimer = 0.55;
          const dx = state.player.x - w.x;
          const dy = state.player.y - w.y;
          const len = Math.hypot(dx, dy) || 1;
          w.vx = (dx / len) * 5.6;
          w.vy = (dy / len) * 5.6;
        }
        continue;
      }
      if (w.state === 'charging') {
        w.stateTimer -= dt;
        const nx = w.x + w.vx * dt;
        const ny = w.y + w.vy * dt;
        const ntx = Math.floor(nx);
        const nty = Math.floor(ny);
        const targetTile = getTile(state, ntx, nty);
        if (targetTile?.structure && targetTile.structure.type === 'fence') {
          targetTile.structure.hp -= 1;
          if (targetTile.structure.hp <= 0) targetTile.structure = null;
          w.state = 'approaching';
          w.stateTimer = 0;
          continue;
        }
        if (isTileWalkable(state, ntx, nty)) {
          w.x = nx;
          w.y = ny;
        }
        if (Math.hypot(state.player.x - w.x, state.player.y - w.y) < 0.72) {
          state.player.health = Math.max(0, state.player.health - 12);
          state.player.hitFlashTimer = 0.25;
          onPlayerHurt?.(12);
          w.state = 'fleeing';
          w.stateTimer = 0.9;
          continue;
        }
        if (w.stateTimer <= 0) {
          w.state = 'approaching';
        }
        continue;
      }
      if (distToPlayer < 3.6) {
        w.state = 'windup';
        w.stateTimer = 0.65; // clear 0.65s windup telegraph
        w.facingX = state.player.x >= w.x ? 1 : -1;
        continue;
      }
    } else if (distToPlayer < 1.6) {
      // Rabbits spook if farmer gets very close
      w.state = 'fleeing';
      w.stateTimer = 1.2;
      continue;
    }

    // Find nearest unprotected crop
    let bestTile: FarmTile | null = null;
    let bestDist = Infinity;
    for (const t of state.tiles) {
      if (!t.crop || t.crop.withered) continue;
      if (w.kind === 'rabbit' && isProtectedByScarecrow(state, t.x, t.y)) continue;
      const d = Math.hypot(t.x + 0.5 - w.x, t.y + 0.5 - w.y);
      if (d < bestDist) {
        bestDist = d;
        bestTile = t;
      }
    }

    if (!bestTile) {
      // Wander gently or leave if dawn approaches
      if (state.timeMinutes < NIGHT_START_MINUTES) {
        w.state = 'fleeing';
        w.stateTimer = 1.0;
      }
      continue;
    }

    const tx = bestTile.x + 0.5;
    const ty = bestTile.y + 0.5;
    const dx = tx - w.x;
    const dy = ty - w.y;
    const dist = Math.hypot(dx, dy);

    if (dist < 0.45) {
      w.state = 'nibbling';
      w.stateTimer += dt;
      if (w.stateTimer >= 1.6) {
        bestTile.crop = null;
        w.stateTimer = 0;
        w.state = 'approaching';
        onCropEaten?.(bestTile.x, bestTile.y);
      }
    } else {
      w.state = 'approaching';
      const speed = w.kind === 'rabbit' ? 2.1 : 1.45;
      const stepX = (dx / dist) * speed * dt;
      const stepY = (dy / dist) * speed * dt;
      const nextX = w.x + stepX;
      const nextY = w.y + stepY;
      const tileAtNext = getTile(state, Math.floor(nextX), Math.floor(nextY));

      if (tileAtNext?.structure && tileAtNext.structure.type === 'fence') {
        if (w.kind === 'boar') {
          w.stateTimer += dt;
          if (w.stateTimer >= 1.8) {
            w.stateTimer = 0;
            tileAtNext.structure.hp -= 1;
            if (tileAtNext.structure.hp <= 0) {
              tileAtNext.structure = null;
            }
          }
        } else {
          // Rabbit blocked by fence: try sidestepping
          const altTile = getTile(state, Math.floor(w.x), Math.floor(nextY));
          if (altTile && isTileWalkable(state, altTile.x, altTile.y)) {
            w.y = nextY;
          }
        }
      } else if (tileAtNext && isTileWalkable(state, tileAtNext.x, tileAtNext.y)) {
        w.x = nextX;
        w.y = nextY;
      } else {
        // Slide along X or Y
        if (isTileWalkable(state, Math.floor(nextX), Math.floor(w.y))) w.x = nextX;
        else if (isTileWalkable(state, Math.floor(w.x), Math.floor(nextY))) w.y = nextY;
      }
      w.facingX = dx >= 0 ? 1 : -1;
      w.hopPhase += dt * 10;
    }
  }
}

export function ensureHomesteadPortal(state: GameWorldState): void {
  if ((state.activeRealm ?? 'homestead') === 'homestead') {
    if (!state.tiles.some((t) => t.terrain === 'portal')) {
      const target = getTile(state, HOMESTEAD_PORTAL_POS.x, HOMESTEAD_PORTAL_POS.y);
      if (target && !target.crop && !target.structure) {
        target.terrain = 'portal';
        target.obstacle = null;
      } else {
        const fallback = state.tiles.find(
          (t) => t.x >= 1 && t.x <= 4 && t.y >= 4 && t.y <= 8 && t.terrain === 'grass' && !t.crop && !t.structure
        );
        if (fallback) {
          fallback.terrain = 'portal';
          fallback.obstacle = null;
        }
      }
    }
  }
}

function spawnRealmCreatures(realmId: RealmId): RealmCreatureEntity[] {
  const make = (id: number, kind: RealmCreatureKind, x: number, y: number): RealmCreatureEntity => ({
    id,
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    facingX: id % 2 === 0 ? 1 : -1,
    hopPhase: id * 1.1,
    moveTimer: 0.8 + (id % 3) * 0.5,
  });
  if (realmId === 'whispering_woods') {
    return [
      make(501, 'fox', 6.5, 13.5),
      make(502, 'fox', 13.5, 4.2),
      make(503, 'deer', 8.5, 14.5),
      make(504, 'deer', 20.5, 8.2),
    ];
  }
  if (realmId === 'crystal_oasis') {
    return [
      make(601, 'fennec', 6.5, 5.5),
      make(602, 'fennec', 14.5, 14.2),
      make(603, 'gazelle', 19.5, 3.5),
      make(604, 'gazelle', 6.5, 14.5),
      make(605, 'scarab', 16.5, 13.2),
    ];
  }
  if (realmId === 'sky_sanctuary') {
    return [
      make(701, 'crane', 15.2, 12.2),
      make(702, 'crane', 12.5, 14.2),
      make(703, 'alpaca', 6.5, 4.5),
      make(704, 'alpaca', 14.2, 4.2),
      make(705, 'star_owl', 10.5, 13.2),
    ];
  }
  return [];
}

export function stepRealmCreatures(
  state: GameWorldState,
  dt: number,
  rng: () => number = Math.random
): void {
  const creatures = state.realmCreatures;
  if (!creatures || creatures.length === 0) return;

  for (const c of creatures) {
    c.moveTimer -= dt;
    if (c.moveTimer <= 0) {
      c.moveTimer = 1.4 + rng() * 2.2;
      if (rng() < 0.35) {
        c.vx = 0;
        c.vy = 0;
      } else {
        const angle = rng() * Math.PI * 2;
        const speed =
          c.kind === 'gazelle' || c.kind === 'fox' || c.kind === 'fennec'
            ? 1.45
            : c.kind === 'scarab'
            ? 0.9
            : 1.05;
        c.vx = Math.cos(angle) * speed;
        c.vy = Math.sin(angle) * speed;
        if (Math.abs(c.vx) > 0.05) c.facingX = c.vx >= 0 ? 1 : -1;
      }
    }
    if (c.vx !== 0 || c.vy !== 0) {
      const nx = Math.max(1.5, Math.min(state.width - 1.5, c.x + c.vx * dt));
      const ny = Math.max(1.5, Math.min(state.height - 1.5, c.y + c.vy * dt));
      if (isTileWalkable(state, Math.floor(nx), Math.floor(ny))) {
        c.x = nx;
        c.y = ny;
      } else {
        c.vx = -c.vx * 0.5;
        c.vy = -c.vy * 0.5;
        c.facingX = c.vx >= 0 ? 1 : -1;
      }
      c.hopPhase += dt * (c.kind === 'scarab' ? 12 : 8);
    }
  }
}

export function generateRealmCache(realmId: RealmId, seed = 101): RealmCache {
  const def = REALM_DEFS[realmId];
  let s = (seed ^ (realmId.length * 7919)) >>> 0;
  const rand = () => {
    s = (1664525 * s + 1013904223) >>> 0;
    return s / 4294967296;
  };

  const tiles: FarmTile[] = [];
  for (let y = 0; y < def.height; y++) {
    for (let x = 0; x < def.width; x++) {
      let terrain: FarmTile['terrain'] = 'grass';
      let tillable = false;
      let tilled = false;
      let obstacle: ObstacleType | null = null;

      if (x === 0 || y === 0 || x === def.width - 1 || y === def.height - 1) {
        terrain = 'forest_edge';
      } else if (x === def.portalX && y === def.portalY) {
        terrain = 'portal';
      } else if (realmId === 'whispering_woods') {
        const inVillagePlaza = x >= 15 && x <= 19 && y >= 3 && y <= 6;
        const isHut = (x === 15 && y === 3) || (x === 19 && y === 3);
        const isElder = x === 17 && y === 3;
        const isStrangeZone = x === 4 && y === 3;
        const inStrangeClearing = x >= 3 && x <= 6 && y >= 2 && y <= 5;
        const inPond = x >= 17 && x <= 20 && y >= 12 && y <= 15;
        const onPath =
          (y === 9 && x >= 4 && x <= 17) ||
          (x === 10 && y >= 6 && y <= 13) ||
          (x === 17 && y >= 6 && y <= 9) ||
          (x === 5 && y >= 4 && y <= 9);

        if (isElder) terrain = 'village_elder';
        else if (isHut) terrain = 'village_hut';
        else if (inVillagePlaza) terrain = 'village_plaza';
        else if (isStrangeZone) terrain = 'strange_zone';
        else if (inPond) terrain = 'water';
        else if (onPath) terrain = 'dirt_path';
        else if (x >= 7 && x <= 13 && y >= 5 && y <= 8) {
          terrain = 'grass';
          tillable = true;
        } else {
          terrain = 'moss_floor';
        }

        if (
          terrain === 'moss_floor' &&
          !inStrangeClearing &&
          Math.hypot(x - def.portalX, y - def.portalY) > 2.4 &&
          Math.hypot(x - 17, y - 5) > 3.2
        ) {
          const r = rand();
          if (r < 0.20) obstacle = 'stump';
          else if (r < 0.31) obstacle = 'weed';
          else if (r < 0.37) obstacle = 'rock';
        }
      } else if (realmId === 'crystal_oasis') {
        const inVillagePlaza = x >= 8 && x <= 12 && y >= 3 && y <= 6;
        const isHut = (x === 8 && y === 3) || (x === 12 && y === 3);
        const isElder = x === 10 && y === 3;
        const isStrangeZone = x === 20 && y === 14;
        const inStrangeClearing = x >= 18 && x <= 22 && y >= 12 && y <= 16;
        const inPond = x >= 15 && x <= 19 && y >= 6 && y <= 10;
        const onPath =
          (y === 9 && x >= 4 && x <= 14) ||
          (x === 10 && y >= 6 && y <= 14) ||
          (y === 14 && x >= 11 && x <= 19);

        if (isElder) terrain = 'village_elder';
        else if (isHut) terrain = 'village_hut';
        else if (inVillagePlaza) terrain = 'village_plaza';
        else if (isStrangeZone) terrain = 'strange_zone';
        else if (inPond) terrain = 'water';
        else if (onPath) terrain = 'dirt_path';
        else if (x >= 7 && x <= 12 && y >= 11 && y <= 14) {
          terrain = 'grass';
          tillable = true;
        } else if (x >= 14 && x <= 20 && y >= 5 && y <= 11) {
          terrain = 'grass';
        } else {
          terrain = 'sand_dune';
        }

        if (
          terrain === 'sand_dune' &&
          !inStrangeClearing &&
          Math.hypot(x - def.portalX, y - def.portalY) > 2.4 &&
          Math.hypot(x - 10, y - 5) > 3.0
        ) {
          const r = rand();
          if (r < 0.22) obstacle = 'rock';
          else if (r < 0.29) obstacle = 'weed';
          else if (r < 0.33) obstacle = 'stump';
        }
      } else if (realmId === 'sky_sanctuary') {
        const inVillagePlaza = x >= 17 && x <= 21 && y >= 4 && y <= 7;
        const isHut = (x === 17 && y === 4) || (x === 21 && y === 4);
        const isElder = x === 19 && y === 4;
        const isStrangeZone = x === 7 && y === 14;
        const inStrangeClearing = x >= 5 && x <= 9 && y >= 12 && y <= 16;
        const inPond = x >= 17 && x <= 20 && y >= 12 && y <= 15;
        const onPath =
          (y === 9 && x >= 4 && x <= 19) ||
          (x === 19 && y >= 7 && y <= 9) ||
          (x === 7 && y >= 9 && y <= 13);

        if (isElder) terrain = 'village_elder';
        else if (isHut) terrain = 'village_hut';
        else if (inVillagePlaza) terrain = 'village_plaza';
        else if (isStrangeZone) terrain = 'strange_zone';
        else if (inPond) terrain = 'water';
        else if (onPath) terrain = 'dirt_path';
        else if (x >= 7 && x <= 13 && y >= 5 && y <= 8) {
          terrain = 'grass';
          tillable = true;
          if (y === 7 && x >= 9 && x <= 12) tilled = true;
        } else {
          terrain = 'cloud_stone';
        }

        if (
          terrain === 'cloud_stone' &&
          !inStrangeClearing &&
          Math.hypot(x - def.portalX, y - def.portalY) > 2.4 &&
          Math.hypot(x - 19, y - 5) > 3.0
        ) {
          const r = rand();
          if (r < 0.12) obstacle = 'weed';
          else if (r < 0.18) obstacle = 'rock';
        }
      }

      tiles.push({
        x,
        y,
        terrain,
        tillable,
        tilled,
        watered: false,
        droughtDriedToday: false,
        obstacle,
        crop: null,
        structure: null,
      });
    }
  }

  return {
    tiles,
    width: def.width,
    height: def.height,
    dailyTreasure: rollDailyNatureTreasure(
      tiles,
      realmId === 'whispering_woods' ? 'Autumn' : realmId === 'sky_sanctuary' ? 'Winter' : 'Spring',
      rand
    ),
    mysteryChest: rollDailyMysteryChest(tiles, realmId, rand),
    returnX: def.spawnX,
    returnY: def.spawnY,
    creatures: spawnRealmCreatures(realmId),
    fireflies: [],
  };
}

export function getMissingRealmMissions(state: GameWorldState, realmId: RealmId): MissionId[] {
  const def = REALM_DEFS[realmId];
  if (!def || !def.requiredMissions?.length) return [];
  const claimed = new Set(state.claimedMissions ?? []);
  return def.requiredMissions.filter((mId) => {
    if (claimed.has(mId)) return false;
    const mDef = MISSIONS.find((m) => m.id === mId);
    if (!mDef) return false;
    return getMissionProgress(state, mId) < mDef.target;
  });
}

export function unlockRealm(
  state: GameWorldState,
  realmId: RealmId
): { ok: boolean; message: string; leveledUpTo?: number; missingMissions?: MissionId[] } {
  const def = REALM_DEFS[realmId];
  if (!def) return { ok: false, message: 'Unknown realm' };
  if (!Array.isArray(state.unlockedRealms)) state.unlockedRealms = ['homestead'];
  if (state.unlockedRealms.includes(realmId)) {
    return { ok: false, message: 'Realm already unlocked' };
  }
  const missingMissions = getMissingRealmMissions(state, realmId);
  if (missingMissions.length > 0) {
    return {
      ok: false,
      missingMissions,
      message: `Complete required missions first (${missingMissions.length} remaining)`,
    };
  }
  if (state.player.gold < def.unlockGold) {
    return { ok: false, message: `Need ${def.unlockGold}g` };
  }
  if ((state.inventory.wood ?? 0) < def.unlockWood) {
    return { ok: false, message: `Need ${def.unlockWood} Timber Wood` };
  }
  if ((state.inventory.stone ?? 0) < def.unlockStone) {
    return { ok: false, message: `Need ${def.unlockStone} Field Stone` };
  }

  state.player.gold -= def.unlockGold;
  if (def.unlockWood > 0) consumeInventoryItem(state, 'wood', def.unlockWood);
  if (def.unlockStone > 0) consumeInventoryItem(state, 'stone', def.unlockStone);
  state.unlockedRealms.push(realmId);
  if (!Array.isArray(state.unlockedChapters)) state.unlockedChapters = ['homestead'];
  if (!state.unlockedChapters.includes(realmId)) state.unlockedChapters.push(realmId);
  state.stats.realmsVisited = Math.max(state.stats.realmsVisited ?? 1, state.unlockedRealms.length);
  const leveledUpTo = grantXp(state, 25);
  return { ok: true, leveledUpTo, message: `Unlocked ${realmId}!` };
}

export function travelToRealm(
  state: GameWorldState,
  targetRealm: RealmId
): { ok: boolean; message: string; realmId: RealmId; newChapterUnlocked?: boolean } {
  const currentRealm: RealmId = state.activeRealm ?? 'homestead';
  if (!Array.isArray(state.unlockedRealms)) state.unlockedRealms = ['homestead'];
  if (!state.unlockedRealms.includes(targetRealm)) {
    return { ok: false, realmId: currentRealm, message: 'Realm is locked' };
  }
  if (currentRealm === targetRealm) {
    return { ok: false, realmId: currentRealm, message: 'Already in this realm' };
  }

  if (!state.realmCaches) state.realmCaches = {};
  state.realmCaches[currentRealm] = {
    tiles: state.tiles,
    width: state.width,
    height: state.height,
    dailyTreasure: state.dailyTreasure ?? null,
    mysteryChest: state.mysteryChest ?? null,
    returnX: state.player.x,
    returnY: state.player.y,
    creatures: state.realmCreatures ?? [],
    fireflies: state.fireflies ?? [],
  };

  let nextCache = state.realmCaches[targetRealm];
  if (!nextCache) {
    nextCache = generateRealmCache(targetRealm, state.day * 97 + 42);
    state.realmCaches[targetRealm] = nextCache;
  } else if (!nextCache.creatures && targetRealm !== 'homestead') {
    nextCache.creatures = spawnRealmCreatures(targetRealm);
  }

  if (!Array.isArray(state.unlockedChapters)) state.unlockedChapters = ['homestead'];
  const newChapterUnlocked = !state.unlockedChapters.includes(targetRealm);
  if (newChapterUnlocked) state.unlockedChapters.push(targetRealm);

  const targetDef = REALM_DEFS[targetRealm];
  state.activeRealm = targetRealm;
  state.tiles = nextCache.tiles;
  state.width = nextCache.width;
  state.height = nextCache.height;
  state.dailyTreasure = nextCache.dailyTreasure;
  if (nextCache.mysteryChest === undefined) {
    let cs = (state.day * 131 + targetRealm.length * 17) >>> 0;
    const chestRand = () => {
      cs = (1664525 * cs + 1013904223) >>> 0;
      return cs / 4294967296;
    };
    nextCache.mysteryChest = rollDailyMysteryChest(
      nextCache.tiles,
      targetRealm,
      chestRand
    );
  }
  state.mysteryChest = nextCache.mysteryChest ?? null;
  state.realmCreatures = nextCache.creatures ?? [];
  state.fireflies = nextCache.fireflies ?? [];
  state.wildlife = [];
  state.player.x = targetDef.spawnX;
  state.player.y = targetDef.spawnY;
  state.player.facingX = 1;
  state.player.facingY = 0;
  return {
    ok: true,
    realmId: targetRealm,
    newChapterUnlocked,
    message: `Traveled to ${targetRealm}`,
  };
}

export function interactWithVillageElder(
  state: GameWorldState
): {
  ok: boolean;
  realmId: RealmId;
  firstVisit: boolean;
  giftedToday: boolean;
  leveledUpTo?: number;
  message: string;
} {
  const realmId: RealmId = state.activeRealm ?? 'homestead';
  const elder = findVillageElderTile(state);
  if (!elder) {
    return { ok: false, realmId, firstVisit: false, giftedToday: false, message: 'No village elder here' };
  }
  if (!Array.isArray(state.visitedVillages)) state.visitedVillages = [];
  if (!Array.isArray(state.elderGiftsToday)) state.elderGiftsToday = [];
  if (!Array.isArray(state.unlockedChapters)) state.unlockedChapters = ['homestead'];
  if (!state.unlockedChapters.includes(realmId)) state.unlockedChapters.push(realmId);

  const firstVisit = !state.visitedVillages.includes(realmId);
  if (firstVisit) {
    state.visitedVillages.push(realmId);
    state.stats.villagesVisited = state.visitedVillages.length;
  }

  const alreadyGifted = state.elderGiftsToday.includes(realmId);
  let leveledUpTo: number | undefined;
  if (!alreadyGifted) {
    state.elderGiftsToday.push(realmId);
    if (realmId === 'whispering_woods') {
      state.player.gold += 25;
      state.stats.totalGoldEarned += 25;
      state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 20);
      addInventoryItem(state, 'wood', 3);
    } else if (realmId === 'crystal_oasis') {
      state.player.gold += 40;
      state.stats.totalGoldEarned += 40;
      state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 25);
      addInventoryItem(state, 'stone', 3);
    } else if (realmId === 'sky_sanctuary') {
      state.player.gold += 65;
      state.stats.totalGoldEarned += 65;
      state.player.stamina = state.player.maxStamina;
      state.player.health = state.player.maxHealth;
    } else {
      state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 12);
    }
    leveledUpTo = grantXp(state, firstVisit ? 25 : 10);
  } else if (firstVisit) {
    leveledUpTo = grantXp(state, 20);
  }

  return {
    ok: true,
    realmId,
    firstVisit,
    giftedToday: !alreadyGifted,
    leveledUpTo,
    message: !alreadyGifted ? `Elder blessing received in ${realmId}` : `Spoke with village elder in ${realmId}`,
  };
}

export function interactWithStrangeZone(
  state: GameWorldState
): {
  ok: boolean;
  realmId: RealmId;
  firstDiscovery: boolean;
  blessedToday: boolean;
  leveledUpTo?: number;
  message: string;
} {
  const realmId: RealmId = state.activeRealm ?? 'homestead';
  const sz = findStrangeZoneTile(state);
  if (!sz) {
    return {
      ok: false,
      realmId,
      firstDiscovery: false,
      blessedToday: false,
      message: 'No strange zone here',
    };
  }
  if (!Array.isArray(state.investigatedStrangeZones)) state.investigatedStrangeZones = [];
  if (!Array.isArray(state.strangeZoneUsedToday)) state.strangeZoneUsedToday = [];
  if (!Array.isArray(state.unlockedChapters)) state.unlockedChapters = ['homestead'];
  if (!state.unlockedChapters.includes(realmId)) state.unlockedChapters.push(realmId);

  const firstDiscovery = !state.investigatedStrangeZones.includes(realmId);
  if (firstDiscovery) {
    state.investigatedStrangeZones.push(realmId);
    state.stats.strangeZonesFound = state.investigatedStrangeZones.length;
  }

  const alreadyUsed = state.strangeZoneUsedToday.includes(realmId);
  let leveledUpTo: number | undefined;
  if (!alreadyUsed) {
    state.strangeZoneUsedToday.push(realmId);
    if (realmId === 'homestead') {
      state.player.gold += 12;
      state.stats.totalGoldEarned += 12;
      state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 15);
    } else if (realmId === 'whispering_woods') {
      state.player.gold += 25;
      state.stats.totalGoldEarned += 25;
      state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 20);
      addInventoryItem(state, 'lavender_seed', 1);
    } else if (realmId === 'crystal_oasis') {
      state.player.gold += 40;
      state.stats.totalGoldEarned += 40;
      state.player.stamina = state.player.maxStamina;
      addInventoryItem(state, 'stone', 2);
    } else if (realmId === 'sky_sanctuary') {
      state.player.gold += 75;
      state.stats.totalGoldEarned += 75;
      state.player.stamina = state.player.maxStamina;
      addInventoryItem(state, 'fertilizer', 2);
    }
    leveledUpTo = grantXp(state, firstDiscovery ? 30 : 12);
  } else if (firstDiscovery) {
    leveledUpTo = grantXp(state, 25);
  }

  return {
    ok: true,
    realmId,
    firstDiscovery,
    blessedToday: !alreadyUsed,
    leveledUpTo,
    message: !alreadyUsed
      ? `Strange Zone resonance activated in ${realmId}`
      : `Observed Strange Zone in ${realmId}`,
  };
}

export function rollDailyMysteryChest(
  tiles: FarmTile[],
  realmId: RealmId,
  rand: () => number = Math.random
): MysteryChest | null {
  const candidates = tiles.filter(
    (t) =>
      (t.terrain === 'grass' ||
        t.terrain === 'moss_floor' ||
        t.terrain === 'sand_dune' ||
        t.terrain === 'cloud_stone') &&
      !t.obstacle &&
      !t.crop &&
      !t.structure &&
      t.x >= 2 &&
      t.y >= 2
  );
  if (candidates.length === 0) return null;
  const pick = candidates[Math.floor(rand() * candidates.length) % candidates.length];
  return {
    x: pick.x,
    y: pick.y,
    kind: realmId === 'crystal_oasis' || realmId === 'sky_sanctuary' ? 'crystal' : 'wood',
  };
}

export function isNearMysteryChest(state: GameWorldState): boolean {
  if (!state.mysteryChest) return false;
  return (
    Math.hypot(
      state.player.x - (state.mysteryChest.x + 0.5),
      state.player.y - (state.mysteryChest.y + 0.5)
    ) <= 2.1
  );
}

export function openMysteryChest(
  state: GameWorldState,
  rand: () => number = Math.random
): {
  ok: boolean;
  goldDelta: number;
  bonusItem?: { id: ItemId; qty: number };
  leveledUpTo?: number;
  message: string;
} {
  if (!state.mysteryChest) {
    return { ok: false, goldDelta: 0, message: 'No mystery chest nearby' };
  }
  const dist = Math.hypot(
    state.player.x - (state.mysteryChest.x + 0.5),
    state.player.y - (state.mysteryChest.y + 0.5)
  );
  if (dist > 2.4) {
    return { ok: false, goldDelta: 0, message: 'Move closer to chest' };
  }
  const isCrystal = state.mysteryChest.kind === 'crystal';
  state.mysteryChest = null;
  const goldDelta = isCrystal ? 55 + Math.floor(rand() * 25) : 35 + Math.floor(rand() * 20);
  state.player.gold += goldDelta;
  state.stats.totalGoldEarned += goldDelta;
  state.stats.chestsOpened = (state.stats.chestsOpened ?? 0) + 1;

  const lootPool: { id: ItemId; qty: number }[] = isCrystal
    ? [
        { id: 'bio_mulch', qty: 2 },
        { id: 'fertilizer', qty: 2 },
        { id: 'lavender_seed', qty: 2 },
        { id: 'stone', qty: 4 },
      ]
    : [
        { id: 'carrot_seed', qty: 2 },
        { id: 'sunflower_seed', qty: 2 },
        { id: 'wood', qty: 4 },
        { id: 'fertilizer', qty: 1 },
      ];
  const bonusItem = lootPool[Math.floor(rand() * lootPool.length) % lootPool.length];
  addInventoryItem(state, bonusItem.id, bonusItem.qty);
  const leveledUpTo = grantXp(state, 20);
  return {
    ok: true,
    goldDelta,
    bonusItem,
    leveledUpTo,
    message: `Mystery Chest: +${goldDelta}g & +${bonusItem.qty} ${ITEMS[bonusItem.id]?.name ?? bonusItem.id}!`,
  };
}

let nextFireflyId = 1;

export function syncNightFireflies(
  state: GameWorldState,
  rand: () => number = Math.random
): void {
  if (!Array.isArray(state.fireflies)) state.fireflies = [];
  const realm = state.activeRealm ?? 'homestead';
  const activeTime =
    state.timeMinutes >= SUNSET_START_MINUTES ||
    realm === 'whispering_woods' ||
    realm === 'sky_sanctuary';
  if (!activeTime) {
    state.fireflies = [];
    return;
  }
  const maxFlies = realm === 'sky_sanctuary' ? 6 : 5;
  if (state.fireflies.length >= maxFlies) return;
  const walkable = state.tiles.filter(
    (t) =>
      t.terrain !== 'water' &&
      t.terrain !== 'forest_edge' &&
      t.terrain !== 'farmhouse' &&
      t.terrain !== 'village_hut'
  );
  if (walkable.length === 0) return;
  const pick = walkable[Math.floor(rand() * walkable.length) % walkable.length];
  const color =
    realm === 'sky_sanctuary'
      ? '#c4b5fd'
      : realm === 'crystal_oasis'
      ? '#67e8f9'
      : '#bef264';
  state.fireflies.push({
    id: nextFireflyId++,
    x: pick.x + 0.5,
    y: pick.y + 0.5,
    vx: (rand() - 0.5) * 0.65,
    vy: (rand() - 0.5) * 0.65,
    phase: rand() * Math.PI * 2,
    color,
  });
}

export function stepFireflies(state: GameWorldState, dt: number): void {
  if (!Array.isArray(state.fireflies) || state.fireflies.length === 0) return;
  for (const f of state.fireflies) {
    f.phase += dt * 4.2;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    if (f.x < 1.5 || f.x > state.width - 1.5) f.vx *= -1;
    if (f.y < 1.5 || f.y > state.height - 1.5) f.vy *= -1;
    f.x = Math.max(1.2, Math.min(state.width - 1.2, f.x));
    f.y = Math.max(1.2, Math.min(state.height - 1.2, f.y));
  }
}

export function catchNearbyFirefly(
  state: GameWorldState,
  maxDist = 1.05
): {
  caught: boolean;
  x: number;
  y: number;
  color: string;
  goldDelta: number;
  leveledUpTo?: number;
} {
  if (!Array.isArray(state.fireflies) || state.fireflies.length === 0) {
    return { caught: false, x: 0, y: 0, color: '#bef264', goldDelta: 0 };
  }
  const idx = state.fireflies.findIndex(
    (f) => Math.hypot(state.player.x - f.x, state.player.y - f.y) <= maxDist
  );
  if (idx === -1) {
    return { caught: false, x: 0, y: 0, color: '#bef264', goldDelta: 0 };
  }
  const [fly] = state.fireflies.splice(idx, 1);
  const goldDelta = 12;
  state.player.gold += goldDelta;
  state.stats.totalGoldEarned += goldDelta;
  state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 6);
  state.stats.firefliesCaught = (state.stats.firefliesCaught ?? 0) + 1;
  const leveledUpTo = grantXp(state, 8);
  return {
    caught: true,
    x: fly.x,
    y: fly.y,
    color: fly.color,
    goldDelta,
    leveledUpTo,
  };
}

export function spinLuckyWheel(
  state: GameWorldState,
  randOrIndex: (() => number) | number = Math.random
): {
  ok: boolean;
  rewardIndex: number;
  reward?: LuckyWheelRewardDef;
  leveledUpTo?: number;
  message: string;
} {
  if (state.luckySpinUsedToday) {
    return { ok: false, rewardIndex: 0, message: 'Already spun today' };
  }
  state.luckySpinUsedToday = true;
  const rewardIndex =
    typeof randOrIndex === 'number'
      ? Math.abs(Math.floor(randOrIndex)) % LUCKY_WHEEL_REWARDS.length
      : Math.floor(randOrIndex() * LUCKY_WHEEL_REWARDS.length) % LUCKY_WHEEL_REWARDS.length;
  const reward = LUCKY_WHEEL_REWARDS[rewardIndex];
  if (reward.gold) {
    state.player.gold += reward.gold;
    state.stats.totalGoldEarned += reward.gold;
  }
  if (reward.stamina) {
    state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + reward.stamina);
  }
  if (reward.item) {
    addInventoryItem(state, reward.item.id, reward.item.qty);
  }
  state.stats.wheelSpins = (state.stats.wheelSpins ?? 0) + 1;
  const leveledUpTo = grantXp(state, 15);
  return {
    ok: true,
    rewardIndex,
    reward,
    leveledUpTo,
    message: reward.label.en,
  };
}

export function answerEcoQuiz(
  state: GameWorldState,
  questionIndex: number,
  chosenIndex: number
): {
  ok: boolean;
  correct: boolean;
  fact?: { ar: string; en: string };
  leveledUpTo?: number;
  message: string;
} {
  if (state.ecoQuizAnsweredToday) {
    return { ok: false, correct: false, message: 'Already answered today' };
  }
  if (
    !Number.isInteger(questionIndex) ||
    questionIndex < 0 ||
    questionIndex >= ECO_QUIZ_QUESTIONS.length
  ) {
    return { ok: false, correct: false, message: 'Invalid question' };
  }
  const q = ECO_QUIZ_QUESTIONS[questionIndex];
  const correct = chosenIndex === q.correctIndex;
  if (!correct) {
    return { ok: true, correct: false, fact: q.fact, message: 'Try again' };
  }
  state.ecoQuizAnsweredToday = true;
  state.player.gold += 35;
  state.stats.totalGoldEarned += 35;
  state.player.stamina = Math.min(state.player.maxStamina, state.player.stamina + 15);
  state.stats.quizzesSolved = (state.stats.quizzesSolved ?? 0) + 1;
  const leveledUpTo = grantXp(state, 25);
  return {
    ok: true,
    correct: true,
    fact: q.fact,
    leveledUpTo,
    message: '+35g, +15 Stamina, +25 XP!',
  };
}

export function renameFarmPet(
  state: GameWorldState,
  kind: 'dog' | 'cat',
  rawName: string
): { ok: boolean; name: string } {
  const clean = sanitizePetName(rawName);
  if (!clean) return { ok: false, name: '' };
  if (!state.petNames) state.petNames = {};
  state.petNames[kind] = clean;
  return { ok: true, name: clean };
}

