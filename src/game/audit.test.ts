import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import {
  advanceDay,
  buyDairyCow,
  buyGuardDog,
  buyShopItem,
  createInitialFarmState,
  performTileAction,
  rollDailyNatureTreasure,
  sellCropItem,
} from './rules.ts';
import {
  DEFAULT_EXTERNAL_SERVER_URL,
  normalizeServerBaseUrl,
  resolveHttpApiBase,
  resolveWebSocketUrl,
} from './multiplayer.ts';
import { LANGUAGE_OPTIONS, UI_TEXT } from './i18n.ts';
import { formatSparkline, NetDebugTracker } from './netDebug.ts';
import { audioEngine, pickNocturnalCueKind } from './audio.ts';
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


