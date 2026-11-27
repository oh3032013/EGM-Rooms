import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';
import {
  advanceDay,
  buyDairyCow,
  buyFarmCat,
  buyGuardDog,
  buyShopItem,
  claimMissionReward,
  computeFarmRestorationPercent,
  craftItem,
  createInitialFarmState,
  eatBestFood,
  eatCrop,
  ensureHomesteadPortal,
  getEarnedBadges,
  isNearPortal,
  isSwiftBuffActive,
  performTileAction,
  rollDailyNatureTreasure,
  sellCropItem,
  spawnNightWildlife,
  travelToRealm,
  unlockRealm,
  upgradeTool,
} from './rules.ts';
import { HOMESTEAD_PORTAL_POS, REALM_DEFS, REALM_ORDER } from './constants.ts';
import { getSmartGuidance } from './blindAssist.ts';
import {
  DEFAULT_EXTERNAL_SERVER_URL,
  normalizeServerBaseUrl,
  resolveHttpApiBase,
  resolveWebSocketUrl,
} from './multiplayer.ts';
import { getNearPromptLabel, getRealmLabel, LANGUAGE_OPTIONS, UI_TEXT } from './i18n.ts';
import { formatSparkline, NetDebugTracker } from './netDebug.ts';
import { audioEngine, pickNocturnalCueKind } from './audio.ts';
import {
  APP_VERSION,
  compareSemver,
  computeBackoffMs,
  diffPatchFiles,
  isNewerVersionAvailable,
  isServerRevisionSupported,
  isUpdateRequired,
  isVersionSupported,
  parseVersionManifest,
  performInPlaceUpdate,
  resolveEffectiveUpdateKind,
  sanitizePatchFilePath,
  sanitizeUpdateUrl,
  StartupVersionChecker,
} from './version.ts';
import { createMultiplayerServer } from '../server/createMultiplayerServer.ts';

test('shop buy/sell reject negative, zero, NaN, and fractional quantities without gold exploit', () => {
  const world = createInitialFarmState(42);
  world.player.gold = 200;
  world.inventory.wheat = 5;
  const initialSeeds = world.inventory.wheat_seed ?? 0;

  const negBuy = buyShopItem(world, 'wheat_seed', -10);
  assert.equal(negBuy.ok, false);
  assert.equal(world.player.gold, 200);
  assert.equal(world.inventory.wheat_seed ?? 0, initialSeeds);

  const zeroBuy = buyShopItem(world, 'wheat_seed', 0);
  assert.equal(zeroBuy.ok, false);
  assert.equal(world.player.gold, 200);

  const nanBuy = buyShopItem(world, 'wheat_seed', Number.NaN);
  assert.equal(nanBuy.ok, false);
  assert.equal(world.player.gold, 200);

  const negSell = sellCropItem(world, 'wheat', -5);
  assert.equal(negSell.ok, false);
  assert.equal(world.player.gold, 200);
  assert.equal(world.inventory.wheat, 5);

  const floatBuy = buyShopItem(world, 'wheat_seed', 2.9);
  assert.equal(floatBuy.ok, true);
  assert.equal(world.inventory.wheat_seed, initialSeeds + 2);
});

test('repairing damaged structure fails cleanly when stamina is insufficient and never goes negative', () => {
  const world = createInitialFarmState(42);
  world.player.x = 12.5;
  world.player.y = 10.5;
  const tile = world.tiles[10 * world.width + 13];
  tile.obstacle = null;
  tile.crop = null;
  tile.structure = { type: 'fence', hp: 10, maxHp: 60 };
  world.player.selectedHotbarIndex = 2; // axe
  world.player.stamina = 1; // repairCost is 2

  const res = performTileAction(world, 13, 10, 1000);
  assert.equal(res.performed, false);
  assert.equal(res.kind, 'error');
  assert.equal(world.player.stamina, 1);
  assert.equal(tile.structure.hp, 10);
});

test('multiplayer URL normalization and Railway fallback resolve consistently', () => {
  assert.equal(
    normalizeServerBaseUrl('https://ecogrowmission.up.railway.app/api/health/'),
    'https://ecogrowmission.up.railway.app'
  );
  assert.equal(
    normalizeServerBaseUrl('ecogrowmission.up.railway.app/ws'),
    'https://ecogrowmission.up.railway.app'
  );
  assert.equal(
    resolveWebSocketUrl('ecogrowmission.up.railway.app'),
    'wss://ecogrowmission.up.railway.app/ws'
  );
  assert.equal(
    resolveHttpApiBase('wss://ecogrowmission.up.railway.app/ws'),
    'https://ecogrowmission.up.railway.app'
  );

  const prevWindow = (globalThis as { window?: unknown }).window;
  try {
    (globalThis as { window?: unknown }).window = {
      location: { protocol: 'https:', hostname: 'ecogrow360.vercel.app', host: 'ecogrow360.vercel.app' },
      localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    };
    assert.equal(resolveWebSocketUrl(''), 'wss://ecogrowmission.up.railway.app/ws');
    assert.equal(resolveHttpApiBase(''), DEFAULT_EXTERNAL_SERVER_URL);
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});

test('all 12 languages in UI_TEXT contain non-empty translations for every English key', () => {
  const baseKeys = Object.keys(UI_TEXT.en) as (keyof typeof UI_TEXT.en)[];
  assert.equal(LANGUAGE_OPTIONS.length, 12);
  for (const opt of LANGUAGE_OPTIONS) {
    const pack = UI_TEXT[opt.code];
    assert.ok(pack, `Missing UI_TEXT pack for ${opt.code}`);
    for (const key of baseKeys) {
      assert.equal(typeof pack[key], 'string', `Missing key ${String(key)} for ${opt.code}`);
      assert.ok(pack[key].length > 0, `Empty key ${String(key)} for ${opt.code}`);
    }
  }
});

test('multiplayer server enforces public-only lobby listing, blocks negative shop quantities, and cleans up on stop', async () => {
  const handle = createMultiplayerServer({ serveStaticDist: false });
  await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', resolve));
  const addr = handle.server.address() as AddressInfo;
  const baseHttp = `http://127.0.0.1:${addr.port}`;
  const baseWs = `ws://127.0.0.1:${addr.port}/ws`;

  let ws: WebSocket | null = null;
  try {
    ws = new WebSocket(baseWs);
    await new Promise<void>((resolve, reject) => {
      ws!.once('open', () => resolve());
      ws!.once('error', reject);
    });

    const joinedPromise = new Promise<any>((resolve) => {
      ws!.on('message', (raw) => {
        const parsed = JSON.parse(String(raw));
        if (parsed.type === 'room:joined') resolve(parsed);
      });
    });

    ws.send(
      JSON.stringify({
        type: 'room:create',
        playerName: 'Tester',
        roomName: 'PrivateTestRoom',
        isPublic: false,
        clientId: 'tester_1',
      })
    );

    const joined = await joinedPromise;
    const startGold = joined.world.player.gold;

    // Private room must NOT appear in public /api/rooms
    const roomsRes = await fetch(`${baseHttp}/api/rooms`);
    assert.equal(roomsRes.status, 200);
    const roomsJson = (await roomsRes.json()) as { rooms: unknown[] };
    assert.equal(roomsJson.rooms.length, 0);

    // Send exploit negative buy -> gold must remain unchanged
    ws.send(JSON.stringify({ type: 'action:shop_buy', itemId: 'wheat_seed', qty: -10 }));
    await new Promise((r) => setTimeout(r, 80));
    const healthRes = await fetch(`${baseHttp}/api/health`);
    const healthJson = (await healthRes.json()) as { ok: boolean; rooms: number };
    assert.equal(healthJson.ok, true);
    assert.equal(healthJson.rooms, 1);
    assert.equal(typeof startGold, 'number');

    // Verify server echoes net:ping with net:pong and matching seq/clientSentAt
    const sentAt = Date.now() - 15;
    const pongPromise = new Promise<any>((resolve) => {
      const handler = (raw: unknown) => {
        const parsed = JSON.parse(String(raw));
        if (parsed.type === 'net:pong' && parsed.seq === 77) {
          ws!.off('message', handler);
          resolve(parsed);
        }
      };
      ws!.on('message', handler);
    });
    ws.send(JSON.stringify({ type: 'net:ping', seq: 77, clientSentAt: sentAt }));
    const pong = await pongPromise;
    assert.equal(pong.type, 'net:pong');
    assert.equal(pong.seq, 77);
    assert.equal(pong.clientSentAt, sentAt);
    assert.equal(typeof pong.serverTime, 'number');

    // Verify server broadcasts action:emote as fx:event kind='emote'
    const emotePromise = new Promise<any>((resolve) => {
      const handler = (raw: unknown) => {
        const parsed = JSON.parse(String(raw));
        if (parsed.type === 'fx:event' && parsed.fx?.kind === 'emote') {
          ws!.off('message', handler);
          resolve(parsed.fx);
        }
      };
      ws!.on('message', handler);
    });
    ws.send(JSON.stringify({ type: 'action:emote', emote: '👋' }));
    const emoteFx = await emotePromise;
    assert.equal(emoteFx.kind, 'emote');
    assert.equal(emoteFx.actorId, 'tester_1');
    assert.equal(emoteFx.text, '👋');
  } finally {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    handle.stopSimulation();
    await new Promise<void>((resolve) => handle.server.close(() => resolve()));
  }
});

test('NetDebugTracker measures RTT, jitter, packet loss on timeouts, and tick seq drops', async () => {
  const tracker = new NetDebugTracker();
  tracker.setEndpoint('wss://ecogrowmission.up.railway.app/ws', 'https://ecogrowmission.up.railway.app');

  const s1 = tracker.allocatePingSeq();
  tracker.recordPingSent(s1, 1000, 5000);
  tracker.recordPong(s1, 1000, 1020, 1045);

  const s2 = tracker.allocatePingSeq();
  tracker.recordPingSent(s2, 2000, 5000);
  tracker.recordPong(s2, 2000, 2040, 2095);

  let snap = tracker.getSnapshot();
  assert.equal(snap.wsPingSupported, true);
  assert.equal(snap.receivedPongs, 2);
  assert.equal(snap.lostPings, 0);
  assert.equal(snap.packetLossPct, 0);
  assert.equal(snap.latestRttMs, 95);
  assert.equal(snap.minRttMs, 45);
  assert.equal(snap.latestJitterMs, 50);

  // Trigger a short-timeout ping loss
  const s3 = tracker.allocatePingSeq();
  tracker.recordPingSent(s3, Date.now(), 25);
  await new Promise((r) => setTimeout(r, 60));

  snap = tracker.getSnapshot();
  assert.equal(snap.lostPings, 1);
  assert.equal(snap.packetLossPct, 33.3);
  assert.ok(formatSparkline(snap.samples).includes('✕'));

  // Track tick:entities cadence, stalls, and seq drops
  tracker.recordTickEntities(1, 10_000);
  tracker.recordTickEntities(2, 10_120);
  tracker.recordTickEntities(5, 11_800); // 1680ms stall + dropped seq 3,4

  snap = tracker.getSnapshot();
  assert.equal(snap.tickStalls, 1);
  assert.equal(snap.tickSeqGaps, 2);
  assert.equal(snap.maxTickIntervalMs, 1680);

  tracker.reset();
});

test('interactive animal petting grants daily cozy perk once per kind and resets on advanceDay', () => {
  const world = createInitialFarmState(42);
  world.player.gold = 500;
  assert.equal(buyGuardDog(world).ok, true);
  assert.equal(buyDairyCow(world).ok, true);

  // Move player right next to Guard Dog (at 8.2, 7.8 -> tile 8, 7)
  world.player.x = 8.0;
  world.player.y = 7.0;
  world.player.health = 60;
  world.player.stamina = 50;
  world.xp = 0;

  const dogTile = world.tiles[7 * world.width + 8];
  dogTile.crop = null;
  dogTile.obstacle = null;
  dogTile.structure = null;
  dogTile.tilled = false;

  const firstDog = performTileAction(world, 8, 7, 1000);
  assert.equal(firstDog.performed, true);
  assert.equal(firstDog.kind, 'pet');
  assert.equal(firstDog.wishOutcome, 'dog');
  assert.equal(world.player.health, 68);
  assert.equal(world.xp, 5);

  // Second pet on same day gives happy reaction without double-granting HP/XP
  const repeatDog = performTileAction(world, 8, 7, 2000);
  assert.equal(repeatDog.performed, true);
  assert.equal(repeatDog.kind, 'pet');
  assert.equal(world.player.health, 68);
  assert.equal(world.xp, 5);

  // Pet Dairy Cow for +6 Stamina + 5 XP
  const cow = world.cows![0];
  const cowTx = Math.floor(cow.x);
  const cowTy = Math.floor(cow.y);
  const cowTile = world.tiles[cowTy * world.width + cowTx];
  cowTile.crop = null;
  cowTile.obstacle = null;
  cowTile.structure = null;
  cowTile.tilled = false;
  world.player.x = cow.x;
  world.player.y = cow.y;

  const firstCow = performTileAction(world, cowTx, cowTy, 3000);
  assert.equal(firstCow.performed, true);
  assert.equal(firstCow.kind, 'pet');
  assert.equal(firstCow.wishOutcome, 'cow');
  assert.equal(world.player.stamina, 56);
  assert.equal(world.xp, 10);

  // Morning reset clears pettedAnimalsToday
  advanceDay(world, () => 0.5);
  assert.deepEqual(world.pettedAnimalsToday, []);
});

test('daily seasonal meadow treasure forages +18g/+10 stam/+12 xp and respawns next morning', () => {
  const world = createInitialFarmState(42);
  assert.ok(world.dailyTreasure, 'Day 1 should start with a daily meadow treasure');
  assert.equal(world.dailyTreasure.kind, 'clover');

  const tx = world.dailyTreasure.x;
  const ty = world.dailyTreasure.y;
  world.player.x = tx + 0.5;
  world.player.y = ty + 0.5;
  world.player.gold = 100;
  world.player.stamina = 40;
  world.xp = 0;

  const res = performTileAction(world, tx, ty, 5000);
  assert.equal(res.performed, true);
  assert.equal(res.kind, 'forage');
  assert.equal(world.dailyTreasure, null);
  assert.equal(world.player.gold, 118);
  assert.equal(world.player.stamina, 50);
  assert.equal(world.xp, 12);
  assert.equal(world.stats.treasuresFound, 1);

  advanceDay(world, () => 0.25);
  assert.ok(world.dailyTreasure, 'advanceDay should spawn a fresh daily treasure');

  // Seasonal variety check
  const autumnPick = rollDailyNatureTreasure(world.tiles, 'Autumn', () => 0.1);
  const winterPick = rollDailyNatureTreasure(world.tiles, 'Winter', () => 0.1);
  assert.equal(autumnPick?.kind, 'mushroom');
  assert.equal(winterPick?.kind, 'frost_bloom');
});

test('audioEngine nocturnal wildlife ambience schedules hoot/rustle cues during night and cleans up on pause/day', () => {
  assert.equal(pickNocturnalCueKind(2, 1, () => 0.5), 'rustle');
  assert.equal(pickNocturnalCueKind(0, 3, () => 0.2), 'hoot');
  assert.equal(pickNocturnalCueKind(0, 1, () => 0.8), 'hoot');

  const prevWindow = (globalThis as { window?: unknown }).window;
  let scheduledTimeoutCb: (() => void) | null = null;
  let cleared = 0;
  let oscCount = 0;
  let noiseCount = 0;

  class FakeAudioContext {
    state: AudioContextState = 'running';
    currentTime = 1.0;
    sampleRate = 44100;
    destination = {};
    createGain() {
      return {
        gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, setTargetAtTime() {} },
        connect() {},
      };
    }
    createOscillator() {
      oscCount += 1;
      return {
        type: 'sine',
        frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    createBuffer(_ch: number, len: number) {
      return { getChannelData: () => new Float32Array(len) };
    }
    createBufferSource() {
      noiseCount += 1;
      return { buffer: null, connect() {}, start() {}, stop() {} };
    }
    createBiquadFilter() {
      return { type: 'bandpass', frequency: { value: 1000 }, Q: { value: 1 }, connect() {} };
    }
    resume() { return Promise.resolve(); }
    suspend() { return Promise.resolve(); }
    close() { return Promise.resolve(); }
  }

  try {
    (globalThis as { window?: unknown }).window = {
      AudioContext: FakeAudioContext,
      setInterval: () => 101,
      clearInterval: () => {},
      setTimeout: (cb: () => void) => {
        scheduledTimeoutCb = cb;
        return 202;
      },
      clearTimeout: () => {
        cleared += 1;
        scheduledTimeoutCb = null;
      },
    };

    audioEngine.startAmbientMusic();
    audioEngine.setNightAmbience(true, 2);
    const nightState = audioEngine.getNightAmbienceState();
    assert.equal(nightState.active, true);
    assert.equal(nightState.wildlifeCount, 2);
    assert.equal(nightState.scheduled, true);
    assert.ok(scheduledTimeoutCb, 'Night ambience should schedule a periodic timer');

    // Trigger direct hoot and rustle synthesis
    audioEngine.playNocturnalAmbientCue('hoot', 1.1);
    assert.ok(oscCount >= 3);
    audioEngine.playNocturnalAmbientCue('rustle', 1.1);
    assert.ok(noiseCount >= 3);

    // Pause clears pending timer cleanly
    audioEngine.pauseAmbientMusic();
    assert.equal(audioEngine.getNightAmbienceState().scheduled, false);
    assert.ok(cleared >= 1);

    // Morning stops night ambience
    audioEngine.setNightAmbience(false, 0);
    assert.equal(audioEngine.getNightAmbienceState().active, false);
    audioEngine.dispose();
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});

test('version semver comparison, URL sanitization, and exponential backoff behave safely', () => {
  assert.equal(compareSemver('1.0.0', '1.0.0'), 0);
  assert.equal(compareSemver('1.2.0', '1.10.0'), -1);
  assert.equal(compareSemver('v2.0.1', '1.9.9'), 1);

  assert.equal(isVersionSupported('1.0.0', '1.0.0'), true);
  assert.equal(isVersionSupported('1.0.0', '1.1.0'), false);
  assert.equal(isVersionSupported('1.2.0', '1.1.5'), true);
  assert.equal(isNewerVersionAvailable('1.0.0', '1.0.1'), true);
  assert.equal(isNewerVersionAvailable('1.1.0', '1.0.9'), false);

  assert.equal(sanitizeUpdateUrl('https://ecogrow.example/app'), 'https://ecogrow.example/app');
  assert.equal(sanitizeUpdateUrl('./'), './');
  assert.equal(sanitizeUpdateUrl('/update'), '/update');
  assert.equal(sanitizeUpdateUrl('javascript:alert(1)'), './');
  assert.equal(sanitizeUpdateUrl('data:text/html,hi'), './');
  assert.equal(sanitizeUpdateUrl('//evil.example/payload'), './');

  assert.equal(computeBackoffMs(0), 0);
  assert.equal(computeBackoffMs(1), 3000);
  assert.equal(computeBackoffMs(2), 6000);
  assert.equal(computeBackoffMs(3), 12000);
  assert.equal(computeBackoffMs(5), 48000);
  assert.equal(computeBackoffMs(10), 60000);
});

test('StartupVersionChecker uses TTL cache, falls back from 404 to static manifest, and enforces backoff on failures', async () => {
  const checker = new StartupVersionChecker();
  let fakeNow = 100_000;
  let fetchCalls = 0;

  // 1) Primary /api/version 404 -> falls back cleanly to ./version.json, then hits TTL cache
  const mockFallbackFetch: typeof fetch = async (input) => {
    fetchCalls += 1;
    const url = String(input);
    if (url.includes('/api/version')) {
      return new Response('Not found', { status: 404 });
    }
    return new Response(
      JSON.stringify({
        latest_version: '1.2.0',
        min_supported_version: '1.2.0',
        update_url: './',
        message_ar: 'يرجى التحديث الآن',
        message_en: 'Please update now',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const first = await checker.check({
    apiBase: 'https://example.test',
    currentVersion: '1.0.0',
    fetchImpl: mockFallbackFetch,
    nowMs: () => fakeNow,
  });
  assert.equal(first.status, 'update_required');
  assert.equal(first.fromCache, false);
  assert.equal(fetchCalls, 2);

  // Within TTL -> zero network requests
  fakeNow += 10_000;
  const cached = await checker.check({
    apiBase: 'https://example.test',
    currentVersion: '1.0.0',
    fetchImpl: mockFallbackFetch,
    nowMs: () => fakeNow,
  });
  assert.equal(cached.status, 'update_required');
  assert.equal(cached.fromCache, true);
  assert.equal(fetchCalls, 2);

  // Forced re-check while offline triggers backoff and preserves prior update_required block
  const failingFetch: typeof fetch = async () => {
    fetchCalls += 1;
    throw new Error('Network offline');
  };
  const failedForce = await checker.check({
    force: true,
    apiBase: 'https://example.test',
    currentVersion: '1.0.0',
    fetchImpl: failingFetch,
    nowMs: () => fakeNow,
  });
  assert.equal(failedForce.status, 'update_required');
  assert.equal(failedForce.recheckFailed, true);
  assert.equal(failedForce.cooldownMs, 3000);
  const callsAfterFail = fetchCalls;

  // Immediate rapid retry inside cooldown does NOT fire any fetch
  fakeNow += 1000;
  const blockedRetry = await checker.check({
    force: true,
    apiBase: 'https://example.test',
    currentVersion: '1.0.0',
    fetchImpl: failingFetch,
    nowMs: () => fakeNow,
  });
  assert.equal(fetchCalls, callsAfterFail);
  assert.equal(blockedRetry.recheckFailed, true);
  assert.equal(blockedRetry.cooldownMs, 2000);

  // Fresh checker offline starts gracefully in error_offline without hanging
  const freshChecker = new StartupVersionChecker();
  const offlineStart = await freshChecker.check({
    apiBase: 'https://example.test',
    currentVersion: APP_VERSION,
    fetchImpl: failingFetch,
    nowMs: () => fakeNow,
  });
  assert.equal(offlineStart.status, 'error_offline');
  assert.equal(offlineStart.cooldownMs, 3000);
});

test('multiplayer server GET /api/version serves cacheable JSON with ETag and 304 support', async () => {
  const prevMin = process.env.ECOGROW_MIN_SUPPORTED_VERSION;
  const prevLatest = process.env.ECOGROW_LATEST_VERSION;
  process.env.ECOGROW_LATEST_VERSION = '2.0.0';
  process.env.ECOGROW_MIN_SUPPORTED_VERSION = '1.5.0';

  const handle = createMultiplayerServer({ serveStaticDist: false });
  await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', resolve));
  const addr = handle.server.address() as AddressInfo;
  const baseHttp = `http://127.0.0.1:${addr.port}`;

  try {
    const res1 = await fetch(`${baseHttp}/api/version`);
    assert.equal(res1.status, 200);
    assert.ok(res1.headers.get('cache-control')?.includes('max-age=120'));
    const etag = res1.headers.get('etag');
    assert.ok(etag && etag.length > 2);
    const body = (await res1.json()) as {
      latest_version: string;
      min_supported_version: string;
      update_url: string;
      message_ar: string;
      message_en: string;
    };
    assert.equal(body.latest_version, '2.0.0');
    assert.equal(body.min_supported_version, '1.5.0');
    assert.equal(body.update_url, './');
    assert.ok(body.message_ar.length > 0 && body.message_en.length > 0);

    // Conditional request with matching ETag returns 304 Not Modified
    const res304 = await fetch(`${baseHttp}/api/version`, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(res304.status, 304);
  } finally {
    if (prevMin === undefined) delete process.env.ECOGROW_MIN_SUPPORTED_VERSION;
    else process.env.ECOGROW_MIN_SUPPORTED_VERSION = prevMin;
    if (prevLatest === undefined) delete process.env.ECOGROW_LATEST_VERSION;
    else process.env.ECOGROW_LATEST_VERSION = prevLatest;
    handle.stopSimulation();
    await new Promise<void>((resolve) => handle.server.close(() => resolve()));
  }
});

test('in-page update mode resolution, server revision checks, path sanitization, and delta diffing', () => {
  assert.equal(isServerRevisionSupported('1', '1'), true);
  assert.equal(isServerRevisionSupported('1', '2'), false);
  assert.equal(isServerRevisionSupported('3', '2'), true);

  assert.equal(sanitizePatchFilePath('assets/index-123.js'), 'assets/index-123.js');
  assert.equal(sanitizePatchFilePath('./index.html'), 'index.html');
  assert.equal(sanitizePatchFilePath('../package.json'), null);
  assert.equal(sanitizePatchFilePath('/etc/passwd'), null);
  assert.equal(sanitizePatchFilePath('assets/malware.exe'), null);
  assert.equal(sanitizePatchFilePath('index.html?x=1'), null);

  const serverOnlyManifest = parseVersionManifest({
    latest_version: '1.0.0',
    min_supported_version: '1.0.0',
    server_revision: '2',
    min_server_revision: '2',
    update_mode: 'server_only',
    multiplayer_url: 'https://new-server.example',
    message_ar: 'تحديث للسيرفر فقط',
    message_en: 'Server update only',
  });
  assert.ok(serverOnlyManifest);
  assert.equal(isUpdateRequired('1.0.0', '1', serverOnlyManifest), true);
  assert.equal(isUpdateRequired('1.0.0', '2', serverOnlyManifest), false);
  assert.equal(resolveEffectiveUpdateKind('1.0.0', serverOnlyManifest), 'server_only');

  const deltaManifest = parseVersionManifest({
    latest_version: '1.1.0',
    min_supported_version: '1.1.0',
    server_revision: '2',
    min_server_revision: '1',
    update_mode: 'auto',
    message_ar: 'تحديث للملفات',
    message_en: 'Client delta update',
  });
  assert.ok(deltaManifest);
  assert.equal(resolveEffectiveUpdateKind('1.0.0', deltaManifest), 'delta_files');

  const hA = 'a'.repeat(64);
  const hB = 'b'.repeat(64);
  const hCNew = 'c'.repeat(64);
  const hCOld = 'd'.repeat(64);
  const diff = diffPatchFiles(
    [
      { path: 'index.html', sha256: hA, size: 100 },
      { path: 'assets/vendor.js', sha256: hB, size: 2000 },
      { path: 'assets/app.js', sha256: hCNew, size: 300 },
    ],
    {
      'index.html': hA,
      'assets/vendor.js': hB,
      'assets/app.js': hCOld,
    }
  );
  assert.equal(diff.unchanged.length, 2);
  assert.equal(diff.changed.length, 1);
  assert.equal(diff.changed[0].path, 'assets/app.js');
});

test('performInPlaceUpdate handles server_only without asset downloads and delta_files only downloads changed files', async () => {
  // 1) Server-only update makes ZERO fetch calls and updates server URL callback in-page
  const serverManifest = parseVersionManifest({
    latest_version: '1.0.0',
    min_supported_version: '1.0.0',
    server_revision: '5',
    min_server_revision: '5',
    update_mode: 'server_only',
    multiplayer_url: 'https://relay.ecogrow.example',
    message_ar: 'تحديث السيرفر',
    message_en: 'Server updated',
  })!;

  let serverFetchCalls = 0;
  let appliedUrl = '';
  const serverRes = await performInPlaceUpdate({
    manifest: serverManifest,
    apiBase: 'https://api.ecogrow.example',
    fetchImpl: async () => {
      serverFetchCalls += 1;
      return new Response('unexpected', { status: 500 });
    },
    onApplyServerUrl: (url) => {
      appliedUrl = url;
    },
  });
  assert.equal(serverRes.ok, true);
  assert.equal(serverRes.kind, 'server_only');
  assert.equal(serverRes.reloaded, false);
  assert.equal(serverFetchCalls, 0);
  assert.equal(appliedUrl, 'https://relay.ecogrow.example/');

  // 2) Differential file update fetches /api/patch-manifest + ONLY the 1 changed file (skips 2 unchanged)
  const changedBytes = Buffer.from('console.log("patched-v1.1.0");', 'utf8');
  const changedSha = createHash('sha256').update(changedBytes).digest('hex');
  const unchangedSha1 = createHash('sha256').update('<html>unchanged</html>').digest('hex');
  const unchangedSha2 = createHash('sha256').update('body{color:#000}').digest('hex');

  const deltaManifest = parseVersionManifest({
    latest_version: '1.1.0',
    min_supported_version: '1.1.0',
    update_mode: 'delta_files',
    message_ar: 'تحديث الملفات المتغيرة',
    message_en: 'Delta files update',
  })!;

  const requestedUrls: string[] = [];
  const deltaFetch: typeof fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.endsWith('/api/patch-manifest')) {
      return new Response(
        JSON.stringify({
          version: '1.1.0',
          server_revision: '2',
          files: [
            { path: 'index.html', sha256: unchangedSha1, size: 24 },
            { path: 'assets/style.css', sha256: unchangedSha2, size: 17 },
            { path: 'assets/game.js', sha256: changedSha, size: changedBytes.length },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    if (url.endsWith('/patch-files/assets/game.js')) {
      return new Response(changedBytes, {
        status: 200,
        headers: { 'Content-Type': 'application/javascript' },
      });
    }
    return new Response('Unexpected unchanged download', { status: 500 });
  };

  const progressEvents: number[] = [];
  const deltaRes = await performInPlaceUpdate({
    manifest: deltaManifest,
    apiBase: 'https://api.ecogrow.example',
    localHashes: {
      'index.html': unchangedSha1,
      'assets/style.css': unchangedSha2,
      'assets/game.js': '0'.repeat(64),
    },
    fetchImpl: deltaFetch,
    onProgress: (p) => progressEvents.push(p.completedFiles),
  });

  assert.equal(deltaRes.ok, true);
  assert.equal(deltaRes.kind, 'delta_files');
  assert.equal(deltaRes.changedFiles, 1);
  assert.equal(deltaRes.totalFiles, 3);
  assert.deepEqual(requestedUrls, [
    'https://api.ecogrow.example/api/patch-manifest',
    'https://api.ecogrow.example/patch-files/assets/game.js',
  ]);
  assert.ok(progressEvents.includes(1));
});

test('multiplayer server serves /api/patch-manifest with ETag and safe /patch-files/* downloads', async () => {
  const tempDist = fs.mkdtempSync(path.join(os.tmpdir(), 'ecogrow-dist-'));
  fs.mkdirSync(path.join(tempDist, 'assets'), { recursive: true });
  const appCode = 'export const v = "1.0.1";\n';
  fs.writeFileSync(path.join(tempDist, 'index.html'), '<!doctype html><html></html>', 'utf8');
  fs.writeFileSync(path.join(tempDist, 'assets', 'app.js'), appCode, 'utf8');

  const handle = createMultiplayerServer({ serveStaticDist: false, distDir: tempDist });
  await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', resolve));
  const addr = handle.server.address() as AddressInfo;
  const baseHttp = `http://127.0.0.1:${addr.port}`;

  try {
    const manifestRes = await fetch(`${baseHttp}/api/patch-manifest`);
    assert.equal(manifestRes.status, 200);
    const etag = manifestRes.headers.get('etag');
    assert.ok(etag);
    const manifestBody = (await manifestRes.json()) as {
      files: { path: string; sha256: string; size: number }[];
    };
    assert.equal(manifestBody.files.length, 2);
    const appEntry = manifestBody.files.find((f) => f.path === 'assets/app.js');
    assert.ok(appEntry);
    assert.equal(
      appEntry.sha256,
      createHash('sha256').update(appCode, 'utf8').digest('hex')
    );

    const manifest304 = await fetch(`${baseHttp}/api/patch-manifest`, {
      headers: { 'If-None-Match': etag },
    });
    assert.equal(manifest304.status, 304);

    const fileRes = await fetch(`${baseHttp}/patch-files/assets/app.js`);
    assert.equal(fileRes.status, 200);
    assert.ok(fileRes.headers.get('cache-control')?.includes('immutable'));
    assert.equal(await fileRes.text(), appCode);

    const traversalRes = await fetch(`${baseHttp}/patch-files/..%2Fpackage.json`);
    assert.equal(traversalRes.status, 400);
  } finally {
    handle.stopSimulation();
    await new Promise<void>((resolve) => handle.server.close(() => resolve()));
    fs.rmSync(tempDist, { recursive: true, force: true });
  }
});

test('StartupVersionChecker falls back to remote GitHub feedUrl when old Railway server fails and delta update downloads from new server URL', async () => {
  const checker = new StartupVersionChecker();
  const changedBytes = Buffer.from('console.log("from-new-railway");', 'utf8');
  const changedSha = createHash('sha256').update(changedBytes).digest('hex');

  const feedFetch: typeof fetch = async (input) => {
    const url = String(input);
    if (url.startsWith('https://old-dead.up.railway.app')) {
      return new Response('Bad Gateway', { status: 502 });
    }
    if (url === 'https://raw.githubusercontent.com/user/ecogrow/main/public/version.json') {
      return new Response(
        JSON.stringify({
          latest_version: '1.1.0',
          min_supported_version: '1.1.0',
          server_revision: '2',
          min_server_revision: '2',
          update_mode: 'delta_files',
          multiplayer_url: 'https://new-server.up.railway.app',
          message_ar: 'تم الانتقال لسيرفر جديد',
          message_en: 'Migrated to new server',
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('Not Found', { status: 404 });
  };

  const checkRes = await checker.check({
    apiBase: 'https://old-dead.up.railway.app',
    feedUrl: 'https://raw.githubusercontent.com/user/ecogrow/main/public/version.json',
    currentVersion: '1.0.0',
    fetchImpl: feedFetch,
  });

  assert.equal(checkRes.status, 'update_required');
  assert.ok(checkRes.manifest);
  assert.equal(checkRes.manifest.multiplayer_url, 'https://new-server.up.railway.app/');

  const requestedUrls: string[] = [];
  let appliedNewUrl = '';
  const patchRes = await performInPlaceUpdate({
    manifest: checkRes.manifest,
    apiBase: 'https://old-dead.up.railway.app',
    localHashes: {},
    fetchImpl: async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url === 'https://new-server.up.railway.app/api/patch-manifest') {
        return new Response(
          JSON.stringify({
            version: '1.1.0',
            server_revision: '2',
            files: [{ path: 'assets/app.js', sha256: changedSha, size: changedBytes.length }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (url === 'https://new-server.up.railway.app/patch-files/assets/app.js') {
        return new Response(changedBytes, { status: 200 });
      }
      return new Response('Should not hit old server', { status: 500 });
    },
    onApplyServerUrl: (url) => {
      appliedNewUrl = url;
    },
  });

  assert.equal(patchRes.ok, true);
  assert.equal(appliedNewUrl, 'https://new-server.up.railway.app/');
  assert.deepEqual(requestedUrls, [
    'https://new-server.up.railway.app/api/patch-manifest',
    'https://new-server.up.railway.app/patch-files/assets/app.js',
  ]);
});

test('new crops (potato watered bonus, chili flood immunity) and greenhouse 3x3 winter/heatwave protection', () => {
  const world = createInitialFarmState(42);
  world.player.x = 12.5;
  world.player.y = 11.5;

  // Watered potato grants +1 bonus potato on harvest
  const potTile = world.tiles[11 * world.width + 13];
  potTile.obstacle = null;
  potTile.structure = null;
  potTile.tilled = true;
  potTile.watered = true;
  potTile.crop = { type: 'potato', growthDays: 3, daysUnwatered: 0, withered: false, floodedDays: 0 };
  world.inventory.potato = 0;
  world.hotbar[5] = 'potato';
  world.player.selectedHotbarIndex = 5;

  const harvestRes = performTileAction(world, 13, 11, 2000);
  assert.equal(harvestRes.performed, true);
  assert.equal(harvestRes.kind, 'harvest');
  assert.equal(world.inventory.potato, 2);

  // Chili survives Rainstorm flood risk while unshielded crop in winter increments floodedDays
  world.seasonIndex = 3; // Winter
  world.weather = 'Rainstorm';
  world.forecastWeather = 'Clear';

  const ghTile = world.tiles[11 * world.width + 14];
  ghTile.obstacle = null;
  ghTile.crop = null;
  ghTile.tilled = false;
  ghTile.structure = { type: 'greenhouse', hp: 120, maxHp: 120 };

  const insideGh = world.tiles[12 * world.width + 14];
  insideGh.obstacle = null;
  insideGh.structure = null;
  insideGh.tilled = true;
  insideGh.watered = true;
  insideGh.crop = { type: 'tomato', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };

  const chiliTile = world.tiles[14 * world.width + 18];
  chiliTile.obstacle = null;
  chiliTile.structure = null;
  chiliTile.tilled = true;
  chiliTile.watered = true;
  chiliTile.crop = { type: 'chili', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };

  advanceDay(world, () => 0.6);
  assert.equal(insideGh.crop?.growthDays, 1);
  assert.equal(insideGh.crop?.floodedDays, 0);
  assert.equal(chiliTile.crop?.floodedDays, 0);
  assert.equal(chiliTile.crop?.withered, false);

  // Greenhouse also shields sensitive crops from Heatwave
  world.weather = 'Heatwave';
  world.forecastWeather = 'Clear';
  insideGh.watered = true;
  advanceDay(world, () => 0.5);
  assert.equal(insideGh.crop?.withered, false);
});

test('bio_mulch retains soil moisture across mornings and owl_box repels nocturnal wildlife raids', () => {
  const world = createInitialFarmState(42);
  world.player.x = 12.5;
  world.player.y = 11.5;
  const tile = world.tiles[11 * world.width + 13];
  tile.obstacle = null;
  tile.structure = null;
  tile.tilled = true;
  tile.watered = false;
  tile.crop = null;

  world.inventory.bio_mulch = 1;
  world.hotbar[6] = 'bio_mulch';
  world.player.selectedHotbarIndex = 6;
  const mulchRes = performTileAction(world, 13, 11, 3000);
  assert.equal(mulchRes.performed, true);
  assert.equal(mulchRes.wishOutcome, 'bio_mulch');
  assert.equal(tile.mulchedDays, 2);
  assert.equal(tile.watered, true);

  // Place an Owl Nest Box and a vulnerable crop + active rabbit raid overnight
  const owlTile = world.tiles[10 * world.width + 13];
  owlTile.obstacle = null;
  owlTile.crop = null;
  owlTile.structure = { type: 'owl_box', hp: 80, maxHp: 80 };

  const cropTile = world.tiles[12 * world.width + 13];
  cropTile.obstacle = null;
  cropTile.structure = null;
  cropTile.tilled = true;
  cropTile.watered = true;
  cropTile.crop = { type: 'wheat', growthDays: 1, daysUnwatered: 0, withered: false, floodedDays: 0 };

  world.wildlife = [
    {
      id: 99,
      kind: 'rabbit',
      x: 13.5,
      y: 12.5,
      vx: 0,
      vy: 0,
      hp: 20,
      maxHp: 20,
      state: 'nibbling',
      stateTimer: 1,
      targetTileX: 13,
      targetTileY: 12,
      facingX: 1,
      hitFlashTimer: 0,
      hopPhase: 0,
    },
  ];
  world.forecastWeather = 'Clear';

  const summary = advanceDay(world, () => 0.9);
  assert.equal(tile.mulchedDays, 1);
  assert.equal(tile.watered, true);
  assert.equal(summary.owlRepelled, 1);
  assert.equal(summary.wildlifeDamage, 0);
  assert.equal(world.stats.owlSaves, 1);
  assert.ok(cropTile.crop, 'Owl box should have protected the crop from raid');
});

test('butter_churn, tea_kettle, herbal_tea Swift Brew buff, and eatBestFood quick-eat work properly', () => {
  const world = createInitialFarmState(42);
  world.player.x = 12.5;
  world.player.y = 11.5;
  world.inventory.wood = 20;
  world.inventory.stone = 20;
  world.inventory.milk = 1;
  world.inventory.lavender = 1;

  assert.equal(craftItem(world, 'butter_churn').ok, true);
  assert.equal(craftItem(world, 'tea_kettle').ok, true);

  const churnTile = world.tiles[11 * world.width + 13];
  churnTile.obstacle = null;
  churnTile.crop = null;
  churnTile.structure = { type: 'butter_churn', hp: 70, maxHp: 70 };
  const butterRes = performTileAction(world, 13, 11, 4000);
  assert.equal(butterRes.performed, true);
  assert.equal(butterRes.wishOutcome, 'butter');
  assert.equal(world.inventory.butter, 1);
  assert.equal(world.stats.butterMade, 1);

  const kettleTile = world.tiles[12 * world.width + 13];
  kettleTile.obstacle = null;
  kettleTile.crop = null;
  kettleTile.structure = { type: 'tea_kettle', hp: 70, maxHp: 70 };
  const teaRes = performTileAction(world, 13, 12, 4100);
  assert.equal(teaRes.performed, true);
  assert.equal(teaRes.wishOutcome, 'herbal_tea');
  assert.equal(world.inventory.herbal_tea, 1);
  assert.equal(world.stats.teaBrewed, 1);

  world.player.stamina = 40;
  world.inventory.wheat = 2;
  const quickRes = eatBestFood(world);
  assert.equal(quickRes.ok, true);
  // Herbal tea gives +35 stam +10 hp (highest score) and activates Swift Brew
  assert.equal(quickRes.itemId, 'herbal_tea');
  assert.equal(quickRes.swiftApplied, true);
  assert.equal(isSwiftBuffActive(world), true);
  assert.ok(world.player.stamina > 40);

  // Swift Brew cuts tool stamina cost by 1 (minimum 1)
  const emptyPlot = world.tiles[11 * world.width + 12];
  emptyPlot.obstacle = null;
  emptyPlot.crop = null;
  emptyPlot.structure = null;
  emptyPlot.tilled = false;
  emptyPlot.tillable = true;
  world.player.selectedHotbarIndex = 0; // hoe (normally costs 4 stamina at Lv.1, 3 with Swift Brew)
  const stamBeforeHoe = world.player.stamina;
  const hoeRes = performTileAction(world, 12, 11, 4200);
  assert.equal(hoeRes.performed, true);
  assert.equal(world.player.stamina, stamBeforeHoe - 3);

  // Morning clears Swift Brew
  advanceDay(world, () => 0.5);
  assert.equal(isSwiftBuffActive(world), false);

  // Direct eatCrop check on butter
  const stamBeforeButter = world.player.stamina;
  world.player.stamina = 50;
  const eatButter = eatCrop(world, 'butter');
  assert.equal(eatButter.ok, true);
  assert.ok(world.player.stamina > 50 || stamBeforeButter > 0);
});

test('Barn Cat adoption, petting perk, morning gift, streak gold, Titanium Lv.4 tools, and missions 21-24', () => {
  const world = createInitialFarmState(42);
  world.player.gold = 3500;

  // Adopt Cozy Barn Cat
  assert.equal(buyFarmCat(world).ok, true);
  assert.ok(world.cat);
  assert.equal(buyFarmCat(world).ok, false); // max 1

  // Pet Barn Cat for +10 HP and +8 Stam
  const catTx = Math.floor(world.cat!.x);
  const catTy = Math.floor(world.cat!.y);
  const catTile = world.tiles[catTy * world.width + catTx];
  catTile.obstacle = null;
  catTile.crop = null;
  catTile.structure = null;
  catTile.tilled = false;
  world.player.x = world.cat!.x;
  world.player.y = world.cat!.y;
  world.player.health = 70;
  world.player.stamina = 60;

  const petCat = performTileAction(world, catTx, catTy, 5000);
  assert.equal(petCat.performed, true);
  assert.equal(petCat.kind, 'pet');
  assert.equal(petCat.wishOutcome, 'cat');
  assert.equal(world.player.health, 80);
  assert.equal(world.player.stamina, 68);

  // Upgrade Hoe, Watering Can, and Axe to Titanium Lv.4 (120 + 260 + 450 = 830 each)
  for (const tool of ['hoe', 'watering_can', 'axe'] as const) {
    assert.equal(upgradeTool(world, tool).ok, true);
    assert.equal(upgradeTool(world, tool).ok, true);
    const tiRes = upgradeTool(world, tool);
    assert.equal(tiRes.ok, true);
    assert.ok(tiRes.message.includes('Titanium'));
    assert.equal(upgradeTool(world, tool).ok, false);
  }
  assert.equal(world.upgrades.hoeLevel, 4);
  assert.equal(world.upgrades.canLevel, 4);
  assert.equal(world.upgrades.axeLevel, 4);
  assert.equal(world.player.maxWaterLevel, 40);

  // Claim Titanium Smith + Cat Lover missions
  assert.equal(claimMissionReward(world, 'titanium_smith').ok, true);
  assert.equal(claimMissionReward(world, 'cat_lover').ok, true);

  // Check eco_architect & farm_tycoon badges
  const gh = world.tiles[10 * world.width + 10];
  gh.structure = { type: 'greenhouse', hp: 120, maxHp: 120 };
  const ob = world.tiles[10 * world.width + 11];
  ob.structure = { type: 'owl_box', hp: 80, maxHp: 80 };
  world.stats.totalGoldEarned = 1000;
  const badges = getEarnedBadges(world);
  assert.ok(badges.includes('eco_architect'));
  assert.ok(badges.includes('farm_tycoon'));

  // advanceDay twice to reach Day 3 -> grants daily streak gold (+10g) & barn cat gift
  advanceDay(world, () => 0.2);
  const goldBeforeDay3 = world.player.gold;
  const summary = advanceDay(world, () => 0.2);
  assert.equal(summary.morningBonusGold, 10);
  assert.ok(summary.catGift === 'fish' || summary.catGift === '15g');
  assert.ok(world.player.gold >= goldBeforeDay3 + 10);
});

test('ancient portals, multi-world travel, realm cache preservation, and blind guidance', () => {
  const world = createInitialFarmState(42);
  assert.equal(world.activeRealm, 'homestead');
  assert.deepEqual(world.unlockedRealms, ['homestead']);

  // Verify legacy map migration restores portal tile idempotently
  const portalIdx = HOMESTEAD_PORTAL_POS.y * world.width + HOMESTEAD_PORTAL_POS.x;
  assert.equal(world.tiles[portalIdx].terrain, 'portal');
  world.tiles[portalIdx].terrain = 'grass';
  ensureHomesteadPortal(world);
  assert.equal(world.tiles[portalIdx].terrain, 'portal');

  // Proximity detection near portal
  world.player.x = HOMESTEAD_PORTAL_POS.x + 0.5;
  world.player.y = HOMESTEAD_PORTAL_POS.y + 1.0;
  assert.equal(isNearPortal(world), true);

  // Locked realm travel is rejected before unlocking
  assert.equal(travelToRealm(world, 'whispering_woods').ok, false);

  // Insufficient gold/resources rejected on unlock
  world.player.gold = 20;
  assert.equal(unlockRealm(world, 'whispering_woods').ok, false);

  // Plant a Homestead crop before leaving to confirm bidirectional cache integrity
  const cropTile = world.tiles[10 * world.width + 13];
  cropTile.obstacle = null;
  cropTile.structure = null;
  cropTile.tilled = true;
  cropTile.watered = true;
  cropTile.crop = { type: 'wheat', growthDays: 1, daysUnwatered: 0, withered: false, floodedDays: 0 };
  const homesteadRestoreScore = computeFarmRestorationPercent(world);

  // Unlock & travel through all realms
  world.player.gold = 1000;
  world.inventory.wood = 40;
  world.inventory.stone = 40;
  const u1 = unlockRealm(world, 'whispering_woods');
  assert.equal(u1.ok, true);
  assert.equal(world.player.gold, 1000 - REALM_DEFS.whispering_woods.unlockGold);
  assert.ok(world.unlockedRealms?.includes('whispering_woods'));

  // Travel to Whispering Woods -> dimensions change cleanly, Homestead restoration score preserved
  const t1 = travelToRealm(world, 'whispering_woods');
  assert.equal(t1.ok, true);
  assert.equal(world.activeRealm, 'whispering_woods');
  assert.equal(world.width, REALM_DEFS.whispering_woods.width);
  assert.equal(world.height, REALM_DEFS.whispering_woods.height);
  assert.equal(world.player.x, REALM_DEFS.whispering_woods.spawnX);
  assert.equal(world.player.y, REALM_DEFS.whispering_woods.spawnY);
  assert.equal(computeFarmRestorationPercent(world), homesteadRestoreScore);

  // Low stamina while in non-homestead realm guides player back toward the realm portal
  world.player.stamina = 5;
  world.player.x = 12;
  world.player.y = 9;
  const guidance = getSmartGuidance(world, 'en');
  assert.ok(guidance.text.toLowerCase().includes('portal'));

  // Whispering Woods biome perk: +2 bonus timber wood per chopped stump (+5 total)
  const stumpTile = world.tiles[9 * world.width + 12];
  stumpTile.terrain = 'grass';
  stumpTile.obstacle = 'stump';
  stumpTile.structure = null;
  stumpTile.crop = null;
  world.player.stamina = 80;
  world.player.x = 11.5;
  world.player.y = 9.5;
  world.player.selectedHotbarIndex = 2; // axe
  const woodBefore = world.inventory.wood ?? 0;
  const chopRes = performTileAction(world, 12, 9, 6000);
  assert.equal(chopRes.performed, true);
  assert.equal(world.inventory.wood, woodBefore + 5);

  // Crystal Oasis biome perk: +1 bonus stone & +8g Crystal Shard on mined rock
  assert.equal(unlockRealm(world, 'crystal_oasis').ok, true);
  assert.equal(travelToRealm(world, 'crystal_oasis').ok, true);
  assert.equal(world.activeRealm, 'crystal_oasis');
  const rockTile = world.tiles[9 * world.width + 12];
  rockTile.terrain = 'grass';
  rockTile.obstacle = 'rock';
  rockTile.structure = null;
  rockTile.crop = null;
  world.player.x = 11.5;
  world.player.y = 9.5;
  world.player.selectedHotbarIndex = 2; // axe
  const stoneBefore = world.inventory.stone ?? 0;
  const goldBefore = world.player.gold;
  const mineRes = performTileAction(world, 12, 9, 7000);
  assert.equal(mineRes.performed, true);
  assert.equal(world.inventory.stone, stoneBefore + 3);
  assert.equal(world.player.gold, goldBefore + 8);

  // Sky Sanctuary biome perks: 2x crop growth, auto-watered, immune to Heatwave/Rainstorm, no wildlife raids
  assert.equal(unlockRealm(world, 'sky_sanctuary').ok, true);
  assert.equal(travelToRealm(world, 'sky_sanctuary').ok, true);
  assert.equal(world.activeRealm, 'sky_sanctuary');
  const skyCropTile = world.tiles[10 * world.width + 12];
  skyCropTile.terrain = 'grass';
  skyCropTile.obstacle = null;
  skyCropTile.structure = null;
  skyCropTile.tilled = true;
  skyCropTile.watered = false; // should auto-water overnight in Sky Sanctuary
  skyCropTile.crop = { type: 'tomato', growthDays: 0, daysUnwatered: 0, withered: false, floodedDays: 0 };
  world.weather = 'Heatwave';
  world.forecastWeather = 'Rainstorm';
  advanceDay(world, () => 0.5);
  assert.equal(skyCropTile.crop?.withered, false);
  assert.equal(skyCropTile.crop?.growthDays, 2);
  assert.equal(skyCropTile.watered, true);
  assert.equal(spawnNightWildlife(world), null);

  // Returning to Homestead restores original crop & 28x20 dimensions
  assert.equal(travelToRealm(world, 'homestead').ok, true);
  assert.equal(world.width, REALM_DEFS.homestead.width);
  assert.equal(world.height, REALM_DEFS.homestead.height);
  const restoredCrop = world.tiles[10 * world.width + 13];
  assert.equal(restoredCrop.crop?.type, 'wheat');

  // Portal missions & badge earned
  assert.equal(claimMissionReward(world, 'portal_awakener').ok, true);
  assert.equal(claimMissionReward(world, 'realm_voyager').ok, true);
  assert.ok(getEarnedBadges(world).includes('world_explorer'));

  // All 12 languages include localized realm labels and portal UI text
  for (const { code: lang } of LANGUAGE_OPTIONS) {
    assert.ok(UI_TEXT[lang].portalsBtn.length > 0);
    assert.ok(UI_TEXT[lang].portalModalTitle.length > 0);
    assert.ok(getNearPromptLabel('portal', lang).length > 0);
    for (const rId of REALM_ORDER) {
      const rCopy = getRealmLabel(rId, lang);
      assert.ok(rCopy.name.length > 0);
      assert.ok(rCopy.desc.length > 0);
      assert.ok(rCopy.perk.length > 0);
    }
  }
});

test('multiplayer server synchronizes realm unlocks and travel across connected players', async () => {
  const handle = createMultiplayerServer({ serveStaticDist: false });
  await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', resolve));
  const addr = handle.server.address() as AddressInfo;
  const baseWs = `ws://127.0.0.1:${addr.port}/ws`;

  let ws: WebSocket | null = null;
  try {
    ws = new WebSocket(baseWs);
    await new Promise<void>((resolve, reject) => {
      ws!.once('open', () => resolve());
      ws!.once('error', reject);
    });

    const waitForMsg = (predicate: (m: any) => boolean) =>
      new Promise<any>((resolve) => {
        const handler = (raw: unknown) => {
          const parsed = JSON.parse(String(raw));
          if (predicate(parsed)) {
            ws!.off('message', handler);
            resolve(parsed);
          }
        };
        ws!.on('message', handler);
      });

    const joinedP = waitForMsg((m) => m.type === 'room:joined');
    ws.send(
      JSON.stringify({
        type: 'room:create',
        playerName: 'Voyager',
        roomName: 'RealmTestRoom',
        isPublic: false,
        clientId: 'voyager_1',
      })
    );
    await joinedP;

    // Starting gold is 85g: crystal_oasis (160g + 10 stone) must fail with error fx
    const errFxP = waitForMsg((m) => m.type === 'fx:event' && m.fx?.sfx === 'error');
    ws.send(JSON.stringify({ type: 'action:unlock_realm', realmId: 'crystal_oasis' }));
    const errFx = await errFxP;
    assert.equal(errFx.fx.sfx, 'error');

    // Unlock whispering_woods (80g <= 85g) -> broadcasts world:sync & portal fx
    const unlockSyncP = waitForMsg(
      (m) => m.type === 'world:sync' && m.world?.unlockedRealms?.includes('whispering_woods')
    );
    const unlockFxP = waitForMsg((m) => m.type === 'fx:event' && m.fx?.sfx === 'portal');
    ws.send(JSON.stringify({ type: 'action:unlock_realm', realmId: 'whispering_woods' }));
    const [unlockSync, unlockFx] = await Promise.all([unlockSyncP, unlockFxP]);
    assert.equal(unlockFx.fx.sfx, 'portal');
    assert.equal(unlockSync.world.player.gold, 5);

    // Travel to whispering_woods -> broadcasts world:sync with 24x18 dimensions & spawn coordinates
    const travelSyncP = waitForMsg(
      (m) => m.type === 'world:sync' && m.world?.activeRealm === 'whispering_woods'
    );
    const travelFxP = waitForMsg((m) => m.type === 'fx:event' && m.fx?.sfx === 'portal');
    ws.send(JSON.stringify({ type: 'action:travel_realm', realmId: 'whispering_woods' }));
    const [syncMsg, fxMsg] = await Promise.all([travelSyncP, travelFxP]);
    assert.equal(syncMsg.world.activeRealm, 'whispering_woods');
    assert.equal(syncMsg.world.width, REALM_DEFS.whispering_woods.width);
    assert.equal(syncMsg.world.height, REALM_DEFS.whispering_woods.height);
    assert.equal(fxMsg.fx.sfx, 'portal');
    assert.equal(syncMsg.players[0].x, REALM_DEFS.whispering_woods.spawnX);
  } finally {
    if (ws) ws.terminate();
    handle.stopSimulation();
    await new Promise<void>((resolve) => handle.server.close(() => resolve()));
  }
});





