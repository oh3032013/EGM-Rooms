import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceDay,
  buyDairyCow,
  buyFarmChicken,
  buyFluffySheep,
  buyGuardDog,
  buyShopItem,
  claimMissionReward,
  computeEcoScore,
  computeFarmRestorationPercent,
  computeSoilMoisturePct,
  computeTemperatureC,
  cookRecipe,
  craftItem,
  createInitialFarmState,
  eatCrop,
  fulfillDailyOrder,
  generateDailyOrder,
  getClaimableMissionsCount,
  getDayOfSeason,
  getEarnedBadges,
  getMessageFrom2040ForDay,
  getMissionProgress,
  getSeason,
  getTile,
  getTimePhase,
  getXpThreshold,
  grantXp,
  hasNasaStation,
  interactWithStrangeZone,
  isCoveredByBeehive,
  isCoveredByCompost,
  isCoveredByLadybug,
  isCoveredBySensor,
  isCoveredByShadeNet,
  isCoveredBySprinkler,
  isDoubleXpActive,
  isEcoBlessingActive,
  isFestivalDay,
  isProtectedByScarecrow,
  participateInFestival,
  performTileAction,
  rollMarketSurgeCrop,
  sellCropItem,
  stepLivestockAndDog,
  triggerMiddayDrought,
  triggerMiddayHeatwave,
  upgradeTool,
} from './rules';
import {
  COW_PRICE,
  DAYS_PER_SEASON,
  DOG_PRICE,
  FISHING_COOLDOWN_MS,
  HOMESTEAD_STRANGE_ZONE_POS,
  SHEEP_PRICE,
  WELL_POS,
  WINDMILL_DAILY_GOLD,
  WISHING_FOUNTAIN_COST,
} from './constants';

test('initial state spawns player on open walkable path with starter tools and tilled tiles', () => {
  const state = createInitialFarmState(42);
  assert.equal(state.day, 1);
  assert.equal(getSeason(state.seasonIndex), 'Spring');
  assert.equal(state.hotbar[0], 'hoe');
  assert.equal(state.hotbar[1], 'watering_can');
  assert.equal(state.hotbar[2], 'axe');
  const starterTilled = getTile(state, 13, 10);
  assert.equal(starterTilled?.tilled, true);
});

test('farming lifecycle: till, plant, water, grow, and harvest wheat', () => {
  const state = createInitialFarmState(42);
  // Move adjacent to (13, 11)
  state.player.x = 13.5;
  state.player.y = 10.5;
  const tile = getTile(state, 13, 11)!;
  tile.obstacle = null;
  tile.tilled = false;

  // Till with hoe
  state.player.selectedHotbarIndex = 0;
  const tillRes = performTileAction(state, 13, 11);
  assert.equal(tillRes.performed, true);
  assert.equal(tillRes.kind, 'till');
  assert.equal(tile.tilled, true);

  // Plant wheat seed (slot 3)
  state.player.selectedHotbarIndex = 3;
  const plantRes = performTileAction(state, 13, 11);
  assert.equal(plantRes.performed, true);
  assert.equal(plantRes.kind, 'plant');
  assert.equal(tile.crop?.type, 'wheat');

  // Water with watering can (slot 1)
  state.player.selectedHotbarIndex = 1;
  const waterRes = performTileAction(state, 13, 11);
  assert.equal(waterRes.performed, true);
  assert.equal(tile.watered, true);

  // Advance Day 1 -> Day 2 (Clear weather deterministic rng returning 0.8)
  advanceDay(state, () => 0.8);
  assert.equal(tile.crop?.growthDays, 1);
  assert.equal(tile.crop?.withered, false);

  // Water again and advance Day 2 -> Day 3
  performTileAction(state, 13, 11);
  advanceDay(state, () => 0.8);
  assert.equal(tile.crop?.growthDays, 2);

  // Harvest ripe wheat
  const harvestRes = performTileAction(state, 13, 11);
  assert.equal(harvestRes.performed, true);
  assert.equal(harvestRes.kind, 'harvest');
  assert.equal(harvestRes.cropHarvested, 'wheat');
  assert.equal(tile.crop, null);
  assert.ok((state.inventory.wheat ?? 0) >= 1);
});

test('un-watered crops wither after 2 consecutive unwatered days', () => {
  const state = createInitialFarmState(42);
  state.player.x = 13.5;
  state.player.y = 9.5;
  state.player.selectedHotbarIndex = 3; // wheat_seed
  performTileAction(state, 13, 10); // already tilled starter tile
  const tile = getTile(state, 13, 10)!;
  assert.equal(tile.crop?.daysUnwatered, 0);

  // Day 1 -> 2 unwatered (rng 0.8 = Clear weather)
  advanceDay(state, () => 0.8);
  assert.equal(tile.crop?.daysUnwatered, 1);
  assert.equal(tile.crop?.withered, false);

  // Day 2 -> 3 unwatered -> should wither!
  advanceDay(state, () => 0.8);
  assert.equal(tile.crop?.daysUnwatered, 2);
  assert.equal(tile.crop?.withered, true);
});

test('drought dries watered soil at midday and rainstorm auto-waters crops', () => {
  const state = createInitialFarmState(42);
  const tile = getTile(state, 13, 10)!;
  tile.watered = true;
  state.weather = 'Drought';

  const dried = triggerMiddayDrought(state);
  assert.equal(dried, 1);
  assert.equal(tile.watered, false);
  assert.equal(tile.droughtDriedToday, true);

  // Advance into Rainstorm (rng 0.1 triggers Rainstorm in Spring)
  const summary = advanceDay(state, () => 0.1);
  assert.equal(summary.weather, 'Rainstorm');
  assert.equal(tile.watered, true);
});

test('season rolls over cleanly after DAYS_PER_SEASON days and time phases transition', () => {
  const state = createInitialFarmState(42);
  assert.equal(getTimePhase(360), 'Day');
  assert.equal(getTimePhase(1020), 'Sunset');
  assert.equal(getTimePhase(1200), 'Night');

  for (let i = 0; i < DAYS_PER_SEASON; i++) {
    advanceDay(state, () => 0.8);
  }
  assert.equal(state.day, DAYS_PER_SEASON + 1);
  assert.equal(getDayOfSeason(state.day), 1);
  assert.equal(getSeason(state.seasonIndex), 'Summer');
});

test('shop buy/sell, tool upgrades, crafting, and eating crops work accurately', () => {
  const state = createInitialFarmState(42);
  const startGold = state.player.gold;

  // Buy carrot seed (18g)
  const buy = buyShopItem(state, 'carrot_seed', 2);
  assert.equal(buy.ok, true);
  assert.equal(state.player.gold, startGold - 36);

  // Sell harvested wheat
  state.inventory.wheat = 2;
  const sell = sellCropItem(state, 'wheat', 2);
  assert.equal(sell.ok, true);
  assert.ok(sell.earned > 0);
  assert.equal(state.inventory.wheat, undefined);

  // Craft fence using starter wood
  const woodBefore = state.inventory.wood ?? 0;
  const fenceBefore = state.inventory.fence ?? 0;
  const craftRes = craftItem(state, 'fence');
  assert.equal(craftRes.ok, true);
  assert.equal(state.inventory.wood, woodBefore - 2);
  assert.equal(state.inventory.fence, fenceBefore + 2);

  // Upgrade watering can
  state.player.gold = 200;
  const upg = upgradeTool(state, 'watering_can');
  assert.equal(upg.ok, true);
  assert.equal(state.upgrades.canLevel, 2);
  assert.equal(state.player.maxWaterLevel, 20);

  // Eat carrot restores stamina
  state.player.stamina = 50;
  state.inventory.carrot = 1;
  const eat = eatCrop(state, 'carrot');
  assert.equal(eat.ok, true);
  assert.equal(state.player.stamina, 68);
});

test('scarecrow protects crops within radius and restoration percent increases as farm is improved', () => {
  const state = createInitialFarmState(42);
  const initialPct = computeFarmRestorationPercent(state);

  // Place scarecrow at (14, 12)
  state.player.x = 14.5;
  state.player.y = 11.5;
  const tile = getTile(state, 14, 12)!;
  tile.obstacle = null;
  state.player.selectedHotbarIndex = 6; // scarecrow
  const placeRes = performTileAction(state, 14, 12);
  assert.equal(placeRes.performed, true);

  assert.equal(isProtectedByScarecrow(state, 13, 10), true);
  assert.equal(isProtectedByScarecrow(state, 20, 17), false);

  const afterPct = computeFarmRestorationPercent(state);
  assert.ok(afterPct > initialPct);
});

test('watering can refills at the well', () => {
  const state = createInitialFarmState(42);
  state.player.waterLevel = 0;
  state.player.x = WELL_POS.x + 0.5;
  state.player.y = WELL_POS.y + 1.5;
  state.player.selectedHotbarIndex = 1; // watering can
  const res = performTileAction(state, WELL_POS.x, WELL_POS.y);
  assert.equal(res.performed, true);
  assert.equal(res.kind, 'refill');
  assert.equal(state.player.waterLevel, state.player.maxWaterLevel);
});

test('EcoGrow farmer challenges track planting progress and grant rewards once', () => {
  const state = createInitialFarmState(42);
  assert.equal(getClaimableMissionsCount(state), 0);

  // Prepare 4 tilled tiles adjacent to player and plant wheat seeds
  state.player.x = 14.5;
  state.player.y = 9.5;
  for (const tx of [12, 13, 14, 15]) {
    const t = getTile(state, tx, 10)!;
    t.tilled = true;
    t.obstacle = null;
    t.crop = null;
  }
  state.player.selectedHotbarIndex = 3; // wheat_seed (6 starter)
  state.player.x = 12.5;
  performTileAction(state, 12, 10);
  performTileAction(state, 13, 10);
  state.player.x = 14.5;
  performTileAction(state, 14, 10);
  performTileAction(state, 15, 10);

  assert.equal(getMissionProgress(state, 'first_sow'), 4);
  assert.equal(getClaimableMissionsCount(state), 1);

  const goldBefore = state.player.gold;
  const seedsBefore = state.inventory.wheat_seed ?? 0;
  const claim = claimMissionReward(state, 'first_sow');
  assert.equal(claim.ok, true);
  assert.equal(state.player.gold, goldBefore + 35);
  assert.equal(state.inventory.wheat_seed, seedsBefore + 3);
  assert.equal(getClaimableMissionsCount(state), 0);

  // Claiming twice must fail
  const repeat = claimMissionReward(state, 'first_sow');
  assert.equal(repeat.ok, false);
});

test('EcoGrow smart hardware: sprinkler auto-waters, sensor blocks drought, compost accelerates growth', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 300;
  assert.equal(buyShopItem(state, 'sprinkler', 1).ok, true);
  assert.equal(buyShopItem(state, 'sensor', 1).ok, true);
  assert.equal(buyShopItem(state, 'compost', 1).ok, true);

  // Place sprinkler at (14, 11), sensor at (15, 11), compost at (12, 11)
  state.player.x = 14.5;
  state.player.y = 9.5;
  for (const tx of [12, 14, 15]) {
    const t = getTile(state, tx, 11)!;
    t.obstacle = null;
    t.tilled = false;
  }

  state.player.selectedHotbarIndex = state.hotbar.indexOf('sprinkler');
  assert.equal(performTileAction(state, 14, 11).performed, true);
  state.player.selectedHotbarIndex = state.hotbar.indexOf('sensor');
  assert.equal(performTileAction(state, 15, 11).performed, true);
  state.player.x = 12.5;
  state.hotbar[8] = 'compost';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 12, 11).performed, true);

  assert.equal(isCoveredBySprinkler(state, 13, 10), true);
  assert.equal(isCoveredBySensor(state, 13, 10), true);
  assert.equal(isCoveredByCompost(state, 13, 10), true);

  // Soil covered by sensor resists midday drought!
  const protectedTile = getTile(state, 13, 10)!;
  protectedTile.watered = true;
  state.weather = 'Drought';
  const dried = triggerMiddayDrought(state);
  assert.equal(dried, 0);
  assert.equal(protectedTile.watered, true);

  // Plant tomato near compost (4 days normally) and advanceDay with rng=0.2 (Wait: 0.2 in Spring is Rainstorm! Use a helper rng)
  let callIdx = 0;
  const rng = () => {
    callIdx += 1;
    // compost check happens during crop loop (first call < 0.4), rollWeather happens after (want >= 0.5 for Clear)
    return callIdx === 1 ? 0.2 : 0.8;
  };
  protectedTile.crop = { type: 'tomato', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };
  const summary = advanceDay(state, rng);
  // Tomato got +1 normal growth +1 compost bonus = 2 days!
  assert.equal(protectedTile.crop?.growthDays, 2);
  // Sprinkler auto-watered starter tilled tiles (13, 14, 15 at y=10) on clear morning!
  assert.equal(protectedTile.watered, true);
  assert.ok(summary.sprinklerWatered >= 3);
  assert.equal(getMissionProgress(state, 'smart_sprinkler'), 1);
  assert.equal(getMissionProgress(state, 'soil_sensor'), 1);
});

test('farmyard chickens produce morning eggs that can be eaten or sold and progress happy_flock challenge', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 400;
  assert.equal(buyFarmChicken(state).ok, true);
  assert.equal(buyFarmChicken(state).ok, true);
  assert.equal(state.chickens.length, 2);

  // Overnight produces 2 fresh eggs
  const summary = advanceDay(state, () => 0.8);
  assert.equal(summary.eggsCollected, 2);
  assert.equal(state.inventory.egg, 2);
  assert.equal(getMissionProgress(state, 'happy_flock'), 2);

  // Eat 1 egg for +30 stamina, sell 1 egg for 38g
  state.player.stamina = 40;
  assert.equal(eatCrop(state, 'egg').ok, true);
  assert.equal(state.player.stamina, 70);

  const goldBefore = state.player.gold;
  const sellRes = sellCropItem(state, 'egg', 1);
  assert.equal(sellRes.ok, true);
  assert.equal(state.player.gold, goldBefore + 38);
});

test('Fertility Bean grows in 3 days (Spring/Winter) and boosts next crop harvest by +20% (crop rotation)', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 200;
  assert.equal(buyShopItem(state, 'bean_seed', 3).ok, true);

  const tile = getTile(state, 13, 10)!;
  tile.tilled = true;
  tile.obstacle = null;
  state.player.x = 13.5;
  state.player.y = 9.5;
  state.hotbar[8] = 'bean_seed';
  state.player.selectedHotbarIndex = 8;

  // Plant bean and grow 3 days
  assert.equal(performTileAction(state, 13, 10).performed, true);
  assert.equal(tile.crop?.type, 'bean');
  for (let d = 0; d < 3; d++) {
    tile.watered = true;
    advanceDay(state, () => 0.8);
  }
  assert.equal(tile.crop?.growthDays, 3);

  // Harvest bean -> sets beanRotationBonus on tile
  const beanHarvest = performTileAction(state, 13, 10);
  assert.equal(beanHarvest.performed, true);
  assert.equal(beanHarvest.cropHarvested, 'bean');
  assert.equal(tile.beanRotationBonus, true);
  assert.equal(getMissionProgress(state, 'nasa_grow_bean'), 1);

  // Eat bean (+10 stamina, +4 health)
  state.player.stamina = 50;
  assert.equal(eatCrop(state, 'bean').ok, true);
  assert.equal(state.player.stamina, 60);

  // Plant 5 subsequent wheat crops on rotated tiles to trigger +20% cumulative bonus yield
  for (let i = 0; i < 5; i++) {
    tile.beanRotationBonus = true;
    tile.crop = { type: 'wheat', growthDays: 2, daysUnwatered: 0, withered: false, floodedDays: 0 };
    const wheatBefore = state.inventory.wheat ?? 0;
    const res = performTileAction(state, 13, 10);
    assert.equal(res.performed, true);
    assert.equal(tile.beanRotationBonus, false);
    if (i < 4) {
      assert.equal(state.inventory.wheat, wheatBefore + 1);
    } else {
      // 5th crop with +20% (0.2 * 5 = 1.0) awards bonus crop!
      assert.equal(res.rotationBoosted, true);
      assert.equal(state.inventory.wheat, wheatBefore + 2);
    }
  }

  // Harvesting 3 beans unlocks Soil Friend badge
  state.stats.beansHarvested = 3;
  assert.ok(getEarnedBadges(state).includes('soil_friend'));
});

test('Heatwave withers unprotected sensitive crops unless protected by 3x3 Shade Net', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 300;
  assert.equal(buyShopItem(state, 'shade_net', 1).ok, true);

  // Place shade net at (14, 11) -> shields 3x3 (13..15, 10..12)
  const netSpot = getTile(state, 14, 11)!;
  netSpot.obstacle = null;
  state.player.x = 14.5;
  state.player.y = 9.5;
  state.hotbar[8] = 'shade_net';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 14, 11).performed, true);
  assert.equal(isCoveredByShadeNet(state, 13, 10), true);
  assert.equal(isCoveredByShadeNet(state, 18, 12), false);

  // Protected strawberry at (13, 10), exposed strawberry at (18, 12)
  const shadedTile = getTile(state, 13, 10)!;
  shadedTile.tilled = true;
  shadedTile.watered = true;
  shadedTile.crop = { type: 'strawberry', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };

  const exposedTile = getTile(state, 18, 12)!;
  exposedTile.obstacle = null;
  exposedTile.tilled = true;
  exposedTile.watered = true;
  exposedTile.crop = { type: 'strawberry', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };

  state.weather = 'Heatwave';
  assert.equal(triggerMiddayHeatwave(state), 1);
  assert.equal(shadedTile.watered, true);
  assert.equal(exposedTile.watered, false);

  const summary = advanceDay(state, () => 0.8);
  assert.equal(shadedTile.crop?.withered, false);
  assert.equal(exposedTile.crop?.withered, true);
  assert.equal(summary.cropsHeatDamaged, 1);

  // When all sensitive crops are shaded during a heatwave -> mission 16 completes!
  exposedTile.crop = null;
  state.weather = 'Heatwave';
  advanceDay(state, () => 0.8);
  assert.equal(getMissionProgress(state, 'nasa_heatwave_shade'), 1);
});

test('Rain Tank stores 50L on Rainstorm & refills watering can; Drip Sprinkler waters row saving 5L/tile', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 500;
  assert.equal(buyShopItem(state, 'rain_tank', 1).ok, true);
  assert.equal(buyShopItem(state, 'drip_sprinkler', 1).ok, true);

  // Place rain tank at (12, 11) and drip sprinkler at (11, 10)
  const tankTile = getTile(state, 12, 11)!;
  tankTile.obstacle = null;
  const dripTile = getTile(state, 11, 10)!;
  dripTile.obstacle = null;
  state.player.x = 12.5;
  state.player.y = 9.5;
  state.hotbar[8] = 'rain_tank';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 12, 11).performed, true);

  state.hotbar[7] = 'drip_sprinkler';
  state.player.selectedHotbarIndex = 7;
  assert.equal(performTileAction(state, 11, 10).performed, true);

  // Advance into a Rainstorm (rng 0.1 in Spring -> Rainstorm)
  state.forecastWeather = 'Rainstorm';
  const stormSummary = advanceDay(state, () => 0.1);
  assert.equal(stormSummary.weather, 'Rainstorm');
  assert.equal(tankTile.structure?.storedWaterCharges, 5);
  assert.equal(stormSummary.rainCollectedLiters, 50);

  // Refill empty watering can from rain tank
  state.player.waterLevel = 0;
  state.player.x = 12.5;
  state.player.y = 10.5;
  state.player.selectedHotbarIndex = 1; // watering can
  const refillRes = performTileAction(state, 12, 11);
  assert.equal(refillRes.performed, true);
  assert.equal(refillRes.kind, 'refill');
  assert.equal(state.player.waterLevel, 5);
  assert.equal(tankTile.structure?.storedWaterCharges, 0);

  // Next morning Clear: Drip Sprinkler waters row y=10 (starter tiles 13, 14, 15) and saves water!
  state.forecastWeather = 'Clear';
  const dripSummary = advanceDay(state, () => 0.8);
  assert.ok((dripSummary.dripWatered ?? 0) >= 3);
  assert.ok((dripSummary.waterSavedLiters ?? 0) >= 15);
  assert.ok(state.stats.waterSavedLiters >= 15);

  state.stats.waterSavedLiters = 50;
  assert.ok(getEarnedBadges(state).includes('water_guardian'));
});

test('NASA Station telemetry, 3-day Message from 2040 dispatch, and Time Captain badge', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 300;
  assert.equal(buyShopItem(state, 'nasa_station', 1).ok, true);

  const stationTile = getTile(state, 12, 11)!;
  stationTile.obstacle = null;
  state.player.x = 12.5;
  state.player.y = 10.5;
  state.hotbar[8] = 'nasa_station';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 12, 11).performed, true);
  assert.equal(hasNasaStation(state), true);
  assert.equal(getMissionProgress(state, 'nasa_install_station'), 1);

  assert.ok(computeSoilMoisturePct(state) >= 0);
  assert.ok(computeTemperatureC(state) > 0);
  assert.equal(getMessageFrom2040ForDay(2), null);
  assert.ok(getMessageFrom2040ForDay(3) !== null);

  // Advance to Day 2 then Day 3 -> Day 3 emits Message from 2040 & NASA Station summary
  const day2 = advanceDay(state, () => 0.8);
  assert.equal(day2.day, 2);
  assert.equal(day2.messageFrom2040, null);
  assert.equal(day2.hasNasaStation, true);

  const day3 = advanceDay(state, () => 0.8);
  assert.equal(day3.day, 3);
  assert.ok(day3.messageFrom2040 !== null);

  // Complete all 4 NASA missions -> Time Captain badge unlocks
  state.stats.beansHarvested = 1;
  state.stats.rainwaterCollectedLiters = 100;
  state.stats.heatwavesSurvivedWithShade = 1;
  assert.ok(getEarnedBadges(state).includes('time_captain'));
});

test('Honeybee Hive yields morning honey, pollinates golden double harvests, and honey restores stamina', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 300;
  assert.equal(buyShopItem(state, 'beehive', 1).ok, true);

  const hiveTile = getTile(state, 12, 11)!;
  hiveTile.obstacle = null;
  state.player.x = 12.5;
  state.player.y = 10.5;
  state.hotbar[8] = 'beehive';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 12, 11).performed, true);
  assert.equal(isCoveredByBeehive(state, 13, 10), true);

  // Morning produces 1 Wildflower Honey
  const summary = advanceDay(state, () => 0.8);
  assert.equal(summary.honeyCollected, 1);
  assert.equal(state.inventory.honey, 1);

  // Eat honey restores +35 stamina & +15 HP
  state.player.stamina = 40;
  state.player.health = 70;
  assert.equal(eatCrop(state, 'honey').ok, true);
  assert.equal(state.player.stamina, 75);
  assert.equal(state.player.health, 85);

  // Pollinated crop on matching parity tile yields double (+2)
  // Day is now 2; tile (13, 11) has (13 + 11 + 2) % 2 === 0 -> goldenBonus!
  const cropTile = getTile(state, 13, 11)!;
  cropTile.obstacle = null;
  cropTile.tilled = true;
  cropTile.crop = { type: 'carrot', growthDays: 3, daysUnwatered: 0, withered: false, floodedDays: 0 };
  const beforeCarrots = state.inventory.carrot ?? 0;
  const res = performTileAction(state, 13, 11, 10000);
  assert.equal(res.goldenBonus, true);
  assert.equal(state.inventory.carrot, beforeCarrots + 2);
});

test('Harvest Combo Streak awards bonus gold and Lucky Soil Treasure drops every 4th cleared obstacle', () => {
  const state = createInitialFarmState(42);
  state.player.x = 14.5;
  state.player.y = 9.5;

  const t1 = getTile(state, 13, 10)!;
  const t2 = getTile(state, 14, 10)!;
  t1.crop = { type: 'wheat', growthDays: 2, daysUnwatered: 0, withered: false, floodedDays: 0 };
  t2.crop = { type: 'wheat', growthDays: 2, daysUnwatered: 0, withered: false, floodedDays: 0 };

  const goldStart = state.player.gold;
  const h1 = performTileAction(state, 13, 10, 1000);
  assert.equal(h1.comboCount, 1);
  const h2 = performTileAction(state, 14, 10, 2500);
  assert.equal(h2.comboCount, 2);
  assert.equal(h2.comboGold, 3);
  assert.equal(state.player.gold, goldStart + 3);

  // Clear 4 weeds with axe -> 4th clear spawns Lucky Soil Treasure (+12g)
  state.player.selectedHotbarIndex = 2; // axe
  for (let i = 0; i < 4; i++) {
    const t = getTile(state, 12 + (i % 2), 11 + Math.floor(i / 2))!;
    t.obstacle = 'weed';
    t.structure = null;
    state.player.x = t.x + 0.5;
    state.player.y = t.y - 0.5;
    const clearRes = performTileAction(state, t.x, t.y, 5000);
    if (i < 3) {
      assert.equal(clearRes.treasureFound, undefined);
    } else {
      assert.deepEqual(clearRes.treasureFound, { gold: 12 });
      assert.equal(state.stats.treasuresFound, 1);
    }
  }
});

test('Daily Village Order generates attainable requests and rewards Gold + Stamina on fulfillment', () => {
  const state = createInitialFarmState(42);
  state.dailyOrder = generateDailyOrder(1, 'Spring', () => 0);
  assert.equal(state.dailyOrder.completed, false);

  state.inventory[state.dailyOrder.cropId] = state.dailyOrder.requiredQty;
  state.player.stamina = 40;
  const goldBefore = state.player.gold;

  const fulfill = fulfillDailyOrder(state);
  assert.equal(fulfill.ok, true);
  assert.equal(state.dailyOrder.completed, true);
  assert.equal(state.player.gold, goldBefore + state.dailyOrder.rewardGold);
  assert.ok(state.player.stamina > 40);
  assert.equal(fulfillDailyOrder(state).ok, false);
});

test('New crops (Corn, Watermelon, Lavender), Lavender double Beehive honey, and Organic Fertilizer', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 300;
  assert.equal(buyShopItem(state, 'corn_seed', 1).ok, true);
  assert.equal(buyShopItem(state, 'watermelon_seed', 1).ok, true);
  assert.equal(buyShopItem(state, 'lavender_seed', 1).ok, true);

  // Place Beehive at (13, 11) and plant Lavender nearby at (14, 10)
  state.inventory.beehive = 1;
  const hiveSpot = getTile(state, 13, 11)!;
  hiveSpot.obstacle = null;
  state.player.x = 13.5;
  state.player.y = 9.5;
  state.hotbar[7] = 'beehive';
  state.player.selectedHotbarIndex = 7;
  assert.equal(performTileAction(state, 13, 11).performed, true);

  const lavTile = getTile(state, 14, 10)!;
  lavTile.tilled = true;
  lavTile.crop = { type: 'lavender', growthDays: 1, daysUnwatered: 0, withered: false, floodedDays: 0 };

  // Craft Organic Fertilizer (requires 2 weeds/wood + 1 stone -> starter has 6 wood, 2 stone)
  const fertCraft = craftItem(state, 'fertilizer');
  assert.equal(fertCraft.ok, true);
  assert.ok((state.inventory.fertilizer ?? 0) >= 1);

  // Apply Organic Fertilizer to Lavender (+1 growthDays)
  state.hotbar[8] = 'fertilizer';
  state.player.selectedHotbarIndex = 8;
  const fertRes = performTileAction(state, 14, 10);
  assert.equal(fertRes.performed, true);
  assert.equal(fertRes.kind, 'fertilize');
  assert.equal(lavTile.crop?.growthDays, 2);

  // Morning advance with nearby Lavender doubles Beehive honey yield (+2 instead of +1)
  const summary = advanceDay(state, () => 0.8);
  assert.equal(summary.honeyCollected, 2);
  assert.equal(state.inventory.honey, 2);
});

test('Pond Fishing catches Fish with cooldown, Golden Pearl bonus, and Master Angler badge', () => {
  const state = createInitialFarmState(42);
  // Pond water tiles are at x: 22..25, y: 14..17; stand at (21.5, 14.5) holding hoe (slot 0)
  state.player.x = 21.5;
  state.player.y = 14.5;
  state.player.selectedHotbarIndex = 0;

  // (22 + 14 + Math.floor(0 / 1000)) % 4 === 0 -> triggers Golden Pearl (+35g) on tile (22, 14) with nowMs = 0 or 4000
  const goldBefore = state.player.gold;
  const fish1 = performTileAction(state, 22, 14, 4000);
  assert.equal(fish1.performed, true);
  assert.equal(fish1.kind, 'fish');
  assert.equal(fish1.caughtFish, true);
  assert.equal(fish1.goldenPearl, true);
  assert.equal(state.player.gold, goldBefore + 35);
  assert.equal(state.inventory.fish, 1);

  // Cooldown prevents immediate second cast
  const tooSoon = performTileAction(state, 22, 14, 4000 + FISHING_COOLDOWN_MS - 100);
  assert.equal(tooSoon.performed, false);
  assert.equal(tooSoon.kind, 'error');

  // After cooldown, catch 4 more fish to unlock Master Angler mission & Angler Pro badge
  for (let i = 1; i <= 4; i++) {
    const res = performTileAction(state, 22, 14, 4000 + i * (FISHING_COOLDOWN_MS + 100));
    assert.equal(res.performed, true);
    assert.equal(res.kind, 'fish');
  }
  assert.equal(state.stats.fishCaught, 5);
  assert.equal(getMissionProgress(state, 'master_angler'), 5);
  assert.ok(getEarnedBadges(state).includes('angler_pro'));
});

test('Dairy Cows, Fluffy Sheep, Artisan Cheese Press & Jam Maker, and Artisan Chef badge', () => {
  const state = createInitialFarmState(42);
  state.player.gold = COW_PRICE + SHEEP_PRICE + 200;

  assert.equal(buyDairyCow(state).ok, true);
  assert.equal(buyFluffySheep(state).ok, true);
  assert.equal(state.cows?.length, 1);
  assert.equal(state.sheep?.length, 1);
  assert.equal(getMissionProgress(state, 'dairy_rancher'), 2);

  // Place Cheese Press at (12, 11) and Jam Maker at (13, 11)
  state.inventory.cheese_press = 1;
  state.inventory.jam_maker = 1;
  getTile(state, 12, 11)!.obstacle = null;
  getTile(state, 13, 11)!.obstacle = null;
  state.player.x = 12.5;
  state.player.y = 9.5;
  state.hotbar[7] = 'cheese_press';
  state.player.selectedHotbarIndex = 7;
  assert.equal(performTileAction(state, 12, 11).performed, true);
  state.hotbar[8] = 'jam_maker';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 13, 11).performed, true);

  // Give 1 strawberry for overnight jam; morning also yields 1 milk + 1 wool, and Cheese Press turns milk -> cheese overnight!
  // Wait: Cheese Press runs in same advanceDay loop AFTER milk is added to inventory!
  state.inventory.strawberry = 1;
  const summary = advanceDay(state, () => 0.8);
  assert.equal(summary.milkCollected, 1);
  assert.equal(summary.woolCollected, 1);
  assert.equal(summary.cheeseMade, 1);
  assert.equal(summary.jamMade, 1);
  assert.equal(state.inventory.wool, 1);
  assert.equal(state.inventory.cheese, 1);
  assert.equal(state.inventory.strawberry_jam, 1);

  // Manual Cheese Press batch -> hits 3 artisan products and unlocks artisan_chef badge
  state.inventory.milk = 1;
  const pressRes = performTileAction(state, 12, 11, 5000);
  assert.equal(pressRes.performed, true);
  assert.equal(pressRes.kind, 'artisan');
  assert.equal(state.stats.artisanProduced, 3);
  assert.equal(getMissionProgress(state, 'artisan_maker'), 3);
  assert.ok(getEarnedBadges(state).includes('artisan_chef'));
});

test('Windmill daily income, Wishing Fountain daily blessing, and Loyal Guard Dog repelling wildlife', () => {
  const state = createInitialFarmState(42);
  state.player.gold = DOG_PRICE + 200;

  // Place Windmill at (12, 11) and Wishing Fountain at (13, 11)
  state.inventory.windmill = 1;
  state.inventory.wishing_fountain = 1;
  getTile(state, 12, 11)!.obstacle = null;
  getTile(state, 13, 11)!.obstacle = null;
  state.player.x = 13.5;
  state.player.y = 9.5;
  state.hotbar[7] = 'windmill';
  state.player.selectedHotbarIndex = 7;
  assert.equal(performTileAction(state, 12, 11).performed, true);
  state.hotbar[8] = 'wishing_fountain';
  state.player.selectedHotbarIndex = 8;
  assert.equal(performTileAction(state, 13, 11).performed, true);

  // Toss coin into Wishing Fountain (costs 10g, roll 1 with day=1 & nowMs=0 -> Full Stamina!)
  state.player.stamina = 30;
  const goldBeforeWish = state.player.gold;
  const wish1 = performTileAction(state, 13, 11, 0);
  assert.equal(wish1.performed, true);
  assert.equal(wish1.kind, 'wish');
  assert.equal(state.player.gold, goldBeforeWish - WISHING_FOUNTAIN_COST);
  assert.equal(state.player.stamina, state.player.maxStamina);
  assert.equal(state.wishedToday, true);

  // Second wish same day blocked
  const wish2 = performTileAction(state, 13, 11, 500);
  assert.equal(wish2.performed, false);

  // Advance day -> Windmill grants +18g and resets wishedToday
  const goldBeforeDay = state.player.gold;
  const summary = advanceDay(state, () => 0.8);
  assert.equal(summary.windmillGold, WINDMILL_DAILY_GOLD);
  assert.equal(state.player.gold, goldBeforeDay + WINDMILL_DAILY_GOLD);
  assert.equal(state.wishedToday, false);

  // Adopt Guard Dog and verify it chases & damages nocturnal wildlife
  assert.equal(buyGuardDog(state).ok, true);
  assert.ok(state.dog);
  state.dog!.x = 10.2;
  state.dog!.y = 10.2;
  state.wildlife.push({
    id: 99,
    kind: 'rabbit',
    x: 10.8,
    y: 10.2,
    vx: 0,
    vy: 0,
    hp: 1,
    maxHp: 1,
    state: 'approaching',
    stateTimer: 0,
    targetTileX: null,
    targetTileY: null,
    facingX: -1,
    hitFlashTimer: 0,
    hopPhase: 0,
  });
  let barked = false;
  stepLivestockAndDog(state, 0.1, () => {
    barked = true;
  });
  assert.equal(barked, true);
  assert.equal(state.wildlife[0].state, 'ko');
  assert.equal(state.stats.wildlifeRepelled, 1);
});

test('Farmer XP & Leveling (+5 Max Stamina), Market Surge (+50%), Rainbow Morning, and Master Level-3 Tools', () => {
  const state = createInitialFarmState(42);
  const startMaxStam = state.player.maxStamina;
  assert.equal(state.level, 1);
  assert.equal(getXpThreshold(1), 100);

  // Grant enough XP to reach Level 3 (100 + 200 = 300 XP)
  const lvl = grantXp(state, 310);
  assert.equal(lvl, 3);
  assert.equal(state.level, 3);
  assert.equal(state.player.maxStamina, startMaxStam + 10);
  assert.equal(getMissionProgress(state, 'veteran_farmer'), 3);

  // Market Surge grants +50% sell price on the active surge crop
  state.marketSurgeCrop = rollMarketSurgeCrop(2, () => 0.1);
  const surgeCrop = state.marketSurgeCrop;
  const surgeItem = surgeCrop as keyof typeof state.inventory;
  state.inventory[surgeItem] = 1;
  state.seasonIndex = 3; // Winter so wheat doesn't get Spring freshness bonus unless Winter-favored
  state.marketSurgeCrop = 'wheat';
  state.inventory.wheat = 1;
  const sellRes = sellCropItem(state, 'wheat', 1);
  assert.equal(sellRes.ok, true);
  assert.equal(sellRes.earned, Math.round(26 * 1.5)); // 39g

  // Rainbow Morning triggers when Rainstorm clears into Clear skies and boosts crop growth
  state.weather = 'Rainstorm';
  state.forecastWeather = 'Clear';
  const tile = getTile(state, 13, 10)!;
  tile.tilled = true;
  tile.watered = true;
  tile.crop = { type: 'pumpkin', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };
  // rng = 0.2 (< 0.5 for rainbow growth boost, while forecastWeather = Clear overrides tomorrow roll after crop loop)
  const rainbowSummary = advanceDay(state, () => 0.2);
  assert.equal(rainbowSummary.rainbowActive, true);
  assert.equal(tile.crop?.growthDays, 2); // +1 normal morning +1 rainbow boost

  // Level-3 Master Hoe & Watering Can hit 2 tiles in facing direction
  state.upgrades.hoeLevel = 3;
  state.upgrades.canLevel = 3;
  state.player.waterLevel = 30;
  const tA = getTile(state, 13, 11)!;
  const tB = getTile(state, 14, 11)!;
  tA.obstacle = null;
  tB.obstacle = null;
  tA.tilled = false;
  tB.tilled = false;
  state.player.x = 12.2;
  state.player.y = 11.5;
  state.player.selectedHotbarIndex = 0; // hoe facing right (+x)
  const till2 = performTileAction(state, 13, 11);
  assert.equal(till2.performed, true);
  assert.equal(till2.bonusTileAction, true);
  assert.equal(tA.tilled, true);
  assert.equal(tB.tilled, true);

  state.player.selectedHotbarIndex = 1; // watering_can facing right (+x)
  const water2 = performTileAction(state, 13, 11);
  assert.equal(water2.performed, true);
  assert.equal(water2.bonusTileAction, true);
  assert.equal(tA.watered, true);
  assert.equal(tB.watered, true);
});

test('Fruit Trees grow to maturity, bear seasonal fruit, and harvest cleanly', () => {
  const state = createInitialFarmState(42);
  state.player.gold = 400;
  assert.equal(buyShopItem(state, 'apple_sapling', 1).ok, true);

  const treeTile = getTile(state, 12, 11)!;
  treeTile.obstacle = null;
  treeTile.crop = null;
  treeTile.structure = null;
  treeTile.tilled = false;

  state.player.x = 12.5;
  state.player.y = 10.5;
  state.hotbar[8] = 'apple_sapling';
  state.player.selectedHotbarIndex = 8;

  const plantRes = performTileAction(state, 12, 11, 1000);
  assert.equal(plantRes.performed, true);
  assert.equal(plantRes.kind, 'plant');
  assert.equal(treeTile.fruitTree?.kind, 'apple');
  assert.equal(treeTile.fruitTree?.growthDays, 0);

  // Advance 4 Spring mornings -> matures and bears fruit!
  for (let d = 0; d < 4; d++) {
    state.forecastWeather = 'Clear';
    advanceDay(state, () => 0.8);
  }
  assert.equal(treeTile.fruitTree?.growthDays, 4);
  assert.equal(treeTile.fruitTree?.hasFruit, true);

  // Harvest apple
  const harvestRes = performTileAction(state, 12, 11, 5000);
  assert.equal(harvestRes.performed, true);
  assert.equal(harvestRes.kind, 'harvest');
  assert.equal(treeTile.fruitTree?.hasFruit, false);
  assert.equal(state.inventory.apple, 1);
  assert.equal(state.stats.fruitsHarvested, 1);
});

test('Natural Pest Control: pests stall growth, Neem Spray cures pests, Ladybug House cures overnight', () => {
  const state = createInitialFarmState(42);
  const cropTile = getTile(state, 13, 10)!;
  cropTile.tilled = true;
  cropTile.watered = true;
  cropTile.crop = { type: 'tomato', growthDays: 1, daysUnwatered: 0, withered: false, floodedDays: 0 };

  // Deterministic rng returning 0.66 (falls in [0.63, 0.71) pest window, and >= 0.5 Clear weather)
  state.forecastWeather = 'Clear';
  const day1 = advanceDay(state, () => 0.66);
  assert.equal(day1.pestsAppeared, 1);
  assert.equal(cropTile.crop?.pestInfested, true);
  assert.equal(cropTile.crop?.growthDays, 2); // grew this night right when infested

  // While pestInfested, crop stalls even when watered
  cropTile.watered = true;
  state.forecastWeather = 'Clear';
  advanceDay(state, () => 0.8);
  assert.equal(cropTile.crop?.growthDays, 2);

  // Craft and apply Organic Neem Spray
  state.inventory.wood = 10;
  assert.equal(craftItem(state, 'pest_spray').ok, true);
  state.player.x = 13.5;
  state.player.y = 9.5;
  state.hotbar[8] = 'pest_spray';
  state.player.selectedHotbarIndex = 8;
  const sprayRes = performTileAction(state, 13, 10, 2000);
  assert.equal(sprayRes.performed, true);
  assert.equal(sprayRes.wishOutcome, 'pest_cured');
  assert.equal(cropTile.crop?.pestInfested, false);

  // Place Ladybug House at (14, 11) and re-infest crop -> overnight cure!
  const ladyTile = getTile(state, 14, 11)!;
  ladyTile.obstacle = null;
  ladyTile.crop = null;
  ladyTile.structure = { type: 'ladybug_house', hp: 80, maxHp: 80 };
  assert.equal(isCoveredByLadybug(state, 13, 10), true);
  cropTile.crop!.pestInfested = true;
  cropTile.watered = true;
  state.forecastWeather = 'Clear';
  const curedSummary = advanceDay(state, () => 0.8);
  assert.equal(cropTile.crop?.pestInfested, false);
  assert.equal(curedSummary.pestsClearedByLadybug, 1);
  assert.equal(cropTile.crop?.growthDays, 3);
});

test('Cooking Kitchen dishes grant Double XP, Eco Tool Stamina Saver, and Swift Speed buffs', () => {
  const state = createInitialFarmState(42);
  state.xp = 0;
  state.inventory.pumpkin = 1;
  state.inventory.wheat = 1;
  state.inventory.egg = 1;
  state.inventory.fish = 1;
  state.inventory.potato = 1;

  const pieRes = cookRecipe(state, 'pumpkin_pie');
  assert.equal(pieRes.ok, true);
  assert.equal(state.inventory.pumpkin_pie, 1);
  assert.equal(state.stats.dishesCooked, 1);

  const soupRes = cookRecipe(state, 'fish_soup');
  assert.equal(soupRes.ok, true);
  assert.equal(state.inventory.fish_soup, 1);

  // Eat Pumpkin Pie -> Double XP active
  state.player.stamina = 10;
  assert.equal(eatCrop(state, 'pumpkin_pie').ok, true);
  assert.equal(isDoubleXpActive(state), true);
  const xpBefore = state.xp;
  grantXp(state, 10);
  assert.equal(state.xp, xpBefore + 20);

  // Eat Fish Soup -> Eco Stamina Saver active (-1 tool stamina)
  assert.equal(eatCrop(state, 'fish_soup').ok, true);
  assert.equal(isEcoBlessingActive(state), true);
  const emptyPlot = getTile(state, 12, 11)!;
  emptyPlot.obstacle = null;
  emptyPlot.crop = null;
  emptyPlot.structure = null;
  emptyPlot.tilled = false;
  emptyPlot.tillable = true;
  state.player.x = 12.5;
  state.player.y = 10.5;
  state.player.selectedHotbarIndex = 0; // hoe costs 4 normally, 3 with eco_blessing
  const stamBefore = state.player.stamina;
  assert.equal(performTileAction(state, 12, 11, 3000).performed, true);
  assert.equal(state.player.stamina, stamBefore - 3);
});

test('Eco-Score, Day 8 Seasonal Festival, Ancient Relics, and Dynamic Weather (Mist, Windy, Meteor)', () => {
  const state = createInitialFarmState(42);

  // Place green structures + decor + orchard trees to lift Eco-Score >= 60
  const spots: Array<[number, number, 'windmill' | 'rain_tank' | 'drip_sprinkler' | 'sprinkler' | 'compost' | 'ladybug_house' | 'festive_lantern' | 'garden_arch']> = [
    [10, 11, 'windmill'],
    [11, 11, 'rain_tank'],
    [12, 11, 'drip_sprinkler'],
    [13, 11, 'ladybug_house'],
    [14, 11, 'festive_lantern'],
    [15, 11, 'garden_arch'],
    [17, 11, 'sprinkler'],
    [18, 11, 'compost'],
  ];
  for (const [x, y, st] of spots) {
    const t = getTile(state, x, y)!;
    t.obstacle = null;
    t.crop = null;
    t.structure = { type: st, hp: 80, maxHp: 80 };
  }
  const treeTile = getTile(state, 16, 11)!;
  treeTile.obstacle = null;
  treeTile.fruitTree = { kind: 'olive', growthDays: 4, hasFruit: false };

  const eco = computeEcoScore(state);
  assert.ok(eco.total >= 60, `Expected Eco Score >= 60, got ${eco.total}`);
  assert.ok(eco.dividendGold >= 15);

  // Dynamic Weather: Mist hydrates tilled soil, Windy doubles Windmill gold
  state.forecastWeather = 'Mist';
  const goldBefore = state.player.gold;
  const mistDay = advanceDay(state, () => 0.8);
  assert.equal(mistDay.weather, 'Mist');
  assert.ok((mistDay.mistHydrated ?? 0) >= 3);
  assert.equal(mistDay.ecoDividendGold, eco.dividendGold);
  assert.ok(state.player.gold > goldBefore + eco.dividendGold);

  // Windy weather doubles windmill bonus
  state.forecastWeather = 'Windy';
  const windyDay = advanceDay(state, () => 0.8);
  assert.equal(windyDay.weather, 'Windy');
  assert.equal(windyDay.windyWindmillBonus, WINDMILL_DAILY_GOLD);
  assert.equal(windyDay.windmillGold, WINDMILL_DAILY_GOLD * 2);

  // Strange Zone unlocks Ancient Amber relic; Meteor weather unlocks Star Chalice relic
  state.player.x = HOMESTEAD_STRANGE_ZONE_POS.x + 0.5;
  state.player.y = HOMESTEAD_STRANGE_ZONE_POS.y + 0.5;
  const szRes = interactWithStrangeZone(state);
  assert.equal(szRes.ok, true);
  assert.equal(szRes.relicUnlocked, 'ancient_amber');
  assert.ok(state.collectedRelics?.includes('ancient_amber'));

  state.weather = 'Meteor';
  state.forecastWeather = 'Clear';
  const meteorDay = advanceDay(state, () => 0.8);
  assert.ok((meteorDay.meteorBonusGold ?? 0) >= 25);
  assert.ok(state.collectedRelics?.includes('star_chalice'));

  // Advance to Day 8 (Spring Festival) -> claim once only
  while (state.day < DAYS_PER_SEASON) {
    advanceDay(state, () => 0.8);
  }
  assert.equal(isFestivalDay(state), true);
  const festGoldBefore = state.player.gold;
  const festRes = participateInFestival(state);
  assert.equal(festRes.ok, true);
  assert.equal(festRes.rewardGold, 120);
  assert.equal(state.player.gold, festGoldBefore + 120);
  assert.equal(participateInFestival(state).ok, false);
});




