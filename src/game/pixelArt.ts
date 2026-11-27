import {
  BEEHIVE_RADIUS,
  COMPOST_RADIUS,
  CROPS,
  FARMHOUSE_POS,
  FRUIT_TREES,
  LADYBUG_RADIUS,
  NIGHT_START_MINUTES,
  REALM_DEFS,
  SCARECROW_RADIUS,
  SENSOR_RADIUS,
  SHIPPING_BIN_POS,
  SHOP_STALL_POS,
  SPRINKLER_RADIUS,
  SUNSET_START_MINUTES,
  TILE_SIZE,
  WELL_POS,
} from './constants';
import { getSeason, getTile, getTimePhase, isSwiftBuffActive } from './rules';
import { getFarmerOutfitColors } from './funFeatures';
import { PLAYER_PALETTE, type RemotePlayerState, type VoicePeerState } from './multiplayer';
import type {
  FarmChicken,
  FarmerStyle,
  FarmTile,
  FireflyEntity,
  FloatingText,
  GameWorldState,
  LivestockEntity,
  MysteryChest,
  Particle,
  PlayerState,
  RealmCreatureEntity,
  RealmId,
  Season,
  WildlifeEntity,
} from './types';

interface SeasonPalette {
  grassA: string;
  grassB: string;
  grassTuft: string;
  treeDark: string;
  treeMid: string;
  treeLight: string;
  dirt: string;
  dirtSpeck: string;
  roof: string;
  roofTrim: string;
}

const SEASON_PALETTES: Record<Season, SeasonPalette> = {
  Spring: {
    grassA: '#68a347',
    grassB: '#5d963e',
    grassTuft: '#84be59',
    treeDark: '#264d29',
    treeMid: '#376e37',
    treeLight: '#569448',
    dirt: '#b88b58',
    dirtSpeck: '#9c7143',
    roof: '#b34b39',
    roofTrim: '#d9765f',
  },
  Summer: {
    grassA: '#5c9c3d',
    grassB: '#518c34',
    grassTuft: '#7bb850',
    treeDark: '#1f4524',
    treeMid: '#2e6331',
    treeLight: '#498740',
    dirt: '#c2945e',
    dirtSpeck: '#a37644',
    roof: '#a64332',
    roofTrim: '#cf6b53',
  },
  Autumn: {
    grassA: '#9e8b3e',
    grassB: '#8e7b34',
    grassTuft: '#bf9d45',
    treeDark: '#4f2b1c',
    treeMid: '#8a4322',
    treeLight: '#c46a29',
    dirt: '#a87d4f',
    dirtSpeck: '#8c643b',
    roof: '#8f412e',
    roofTrim: '#bf6545',
  },
  Winter: {
    grassA: '#bfd1cb',
    grassB: '#b0c4be',
    grassTuft: '#dce8e4',
    treeDark: '#243c3d',
    treeMid: '#365859',
    treeLight: '#87a8a6',
    dirt: '#988878',
    dirtSpeck: '#7d6e60',
    roof: '#708796',
    roofTrim: '#eef5f7',
  },
};

const BIOME_PALETTES: Partial<Record<RealmId, SeasonPalette>> = {
  whispering_woods: {
    grassA: '#2d6a4f',
    grassB: '#265b44',
    grassTuft: '#52b788',
    treeDark: '#123326',
    treeMid: '#1b4332',
    treeLight: '#40916c',
    dirt: '#7c5d3f',
    dirtSpeck: '#5e432b',
    roof: '#2d6a4f',
    roofTrim: '#74c69d',
  },
  crystal_oasis: {
    grassA: '#d4b475',
    grassB: '#c7a463',
    grassTuft: '#e9d399',
    treeDark: '#1b5e54',
    treeMid: '#2a8072',
    treeLight: '#6ed4c4',
    dirt: '#b88346',
    dirtSpeck: '#966631',
    roof: '#0e7490',
    roofTrim: '#67e8f9',
  },
  sky_sanctuary: {
    grassA: '#3b4f7a',
    grassB: '#33456b',
    grassTuft: '#7aa2f7',
    treeDark: '#1e1b4b',
    treeMid: '#3730a3',
    treeLight: '#a5b4fc',
    dirt: '#64748b',
    dirtSpeck: '#94a3b8',
    roof: '#4f46e5',
    roofTrim: '#c7d2fe',
  },
};

// Pre-allocated offscreen light canvas for crisp Day/Sunset/Night lighting
let lightCanvas: HTMLCanvasElement | null = null;
let terrainCacheCanvas: HTMLCanvasElement | null = null;
let terrainCacheSeason: Season | null = null;
let terrainCacheRealm: RealmId | null = null;

function getLightCtx(w: number, h: number): CanvasRenderingContext2D | null {
  if (!lightCanvas) {
    lightCanvas = document.createElement('canvas');
  }
  if (lightCanvas.width !== w || lightCanvas.height !== h) {
    lightCanvas.width = w;
    lightCanvas.height = h;
  }
  return lightCanvas.getContext('2d');
}

function getCachedTerrainCanvas(
  state: GameWorldState,
  season: Season,
  pal: SeasonPalette,
  realm: RealmId
): HTMLCanvasElement {
  const totalW = state.width * TILE_SIZE;
  const totalH = state.height * TILE_SIZE;
  if (!terrainCacheCanvas) {
    terrainCacheCanvas = document.createElement('canvas');
  }
  if (
    terrainCacheCanvas.width !== totalW ||
    terrainCacheCanvas.height !== totalH ||
    terrainCacheSeason !== season ||
    terrainCacheRealm !== realm
  ) {
    terrainCacheCanvas.width = totalW;
    terrainCacheCanvas.height = totalH;
    terrainCacheSeason = season;
    terrainCacheRealm = realm;
    const tCtx = terrainCacheCanvas.getContext('2d');
    if (tCtx) {
      tCtx.imageSmoothingEnabled = false;
      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          const tile = state.tiles[y * state.width + x];
          drawStaticTerrainTile(tCtx, tile, x * TILE_SIZE, y * TILE_SIZE, pal, season, realm);
        }
      }
    }
  }
  return terrainCacheCanvas;
}

export interface CameraState {
  x: number; // world pixel center
  y: number;
  zoom: number;
  shakeX: number;
  shakeY: number;
}

export interface LocalPlayerRenderMeta {
  name: string;
  colorIndex: number;
  voice?: VoicePeerState;
  emote?: string;
  style?: FarmerStyle;
}

export function renderGameWorld(
  ctx: CanvasRenderingContext2D,
  canvasWidth: number,
  canvasHeight: number,
  state: GameWorldState,
  camera: CameraState,
  particles: Particle[],
  floatingTexts: FloatingText[],
  hoverTile: { x: number; y: number } | null,
  elapsedSec: number,
  isTitleBackdrop: boolean,
  remotePlayers: RemotePlayerState[] = [],
  localPlayerMeta?: LocalPlayerRenderMeta,
  voiceStates?: Record<string, VoicePeerState>,
  activeEmotes?: Record<string, string>,
  localEmote?: string
): void {
  const season = getSeason(state.seasonIndex);
  const realm: RealmId = state.activeRealm ?? 'homestead';
  const pal = BIOME_PALETTES[realm] ?? SEASON_PALETTES[season];
  const timePhase = getTimePhase(state.timeMinutes);

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle =
    realm === 'sky_sanctuary'
      ? '#0f172a'
      : realm === 'crystal_oasis'
      ? '#2d2015'
      : realm === 'whispering_woods'
      ? '#14261c'
      : '#182419';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  ctx.save();
  const viewCenterX = canvasWidth / 2 + camera.shakeX;
  const viewCenterY = canvasHeight / 2 + camera.shakeY;
  ctx.translate(Math.round(viewCenterX), Math.round(viewCenterY));
  ctx.scale(camera.zoom, camera.zoom);
  ctx.translate(-Math.round(camera.x), -Math.round(camera.y));

  // Compute visible tile bounds for culling
  const halfW = canvasWidth / 2 / camera.zoom + TILE_SIZE;
  const halfH = canvasHeight / 2 / camera.zoom + TILE_SIZE;
  const minTX = Math.max(0, Math.floor((camera.x - halfW) / TILE_SIZE));
  const maxTX = Math.min(state.width - 1, Math.ceil((camera.x + halfW) / TILE_SIZE));
  const minTY = Math.max(0, Math.floor((camera.y - halfH) / TILE_SIZE));
  const maxTY = Math.min(state.height - 1, Math.ceil((camera.y + halfH) / TILE_SIZE));

  // 1. Draw Cached Terrain Layer in a single blit + animated water/tilled soil
  const terrainImg = getCachedTerrainCanvas(state, season, pal, realm);
  ctx.drawImage(terrainImg, 0, 0);

  for (let y = minTY; y <= maxTY; y++) {
    for (let x = minTX; x <= maxTX; x++) {
      const tile = state.tiles[y * state.width + x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;
      if (tile.terrain === 'water') {
        drawAnimatedWaterTile(ctx, tile, px, py, elapsedSec, realm);
      } else if (tile.tilled) {
        drawTilledSoil(ctx, tile, px, py);
      }
    }
  }

  // 2. Draw Subtle Plot Boundary Markers on Homestead (helps player see farmable central plot)
  if (realm === 'homestead') {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 244, 214, 0.14)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(5 * TILE_SIZE + 1, 9 * TILE_SIZE + 1, 16 * TILE_SIZE - 2, 9 * TILE_SIZE - 2);
    ctx.restore();
  }

  // 3. Hover / Facing Tile Highlight & Scarecrow Ward Preview
  if (!isTitleBackdrop) {
    const targetTile = hoverTile ?? {
      x: Math.floor(
        state.player.x +
          (Math.abs(state.player.facingX) >= Math.abs(state.player.facingY)
            ? Math.sign(state.player.facingX)
            : 0) *
            0.85
      ),
      y: Math.floor(
        state.player.y +
          (Math.abs(state.player.facingX) >= Math.abs(state.player.facingY)
            ? 0
            : Math.sign(state.player.facingY || 1)) *
            0.85
      ),
    };
    const ht = getTile(state, targetTile.x, targetTile.y);
    if (ht) {
      const dist = Math.hypot(
        state.player.x - (targetTile.x + 0.5),
        state.player.y - (targetTile.y + 0.5)
      );
      const inReach = dist <= 2.25;
      const hx = targetTile.x * TILE_SIZE;
      const hy = targetTile.y * TILE_SIZE;

      const isRipeTarget =
        Boolean(ht.crop && !ht.crop.withered && ht.crop.growthDays >= CROPS[ht.crop.type].daysToGrow);
      const isLandmarkTarget =
        ht.terrain === 'portal' || ht.terrain === 'village_elder' || ht.terrain === 'strange_zone';

      ctx.save();
      const pulse = isRipeTarget || isLandmarkTarget ? 0.65 + Math.sin(elapsedSec * 7) * 0.25 : 0.85;
      const borderCol = !inReach && hoverTile
        ? 'rgba(255, 130, 110, 0.58)'
        : isRipeTarget
        ? `rgba(253, 224, 71, ${pulse.toFixed(2)})`
        : isLandmarkTarget
        ? `rgba(125, 211, 252, ${pulse.toFixed(2)})`
        : hoverTile
        ? 'rgba(255, 245, 190, 0.88)'
        : 'rgba(255, 245, 190, 0.48)';
      ctx.strokeStyle = borderCol;
      ctx.lineWidth = hoverTile || isRipeTarget || isLandmarkTarget ? 2 : 1.5;

      // Crisp corner brackets on active tile for tactile clarity
      const pad = isRipeTarget || isLandmarkTarget ? Math.round(Math.sin(elapsedSec * 6)) : 0;
      const bLen = 7;
      const x1 = hx + 1 - pad;
      const y1 = hy + 1 - pad;
      const x2 = hx + TILE_SIZE - 1 + pad;
      const y2 = hy + TILE_SIZE - 1 + pad;
      ctx.beginPath();
      ctx.moveTo(x1, y1 + bLen); ctx.lineTo(x1, y1); ctx.lineTo(x1 + bLen, y1);
      ctx.moveTo(x2 - bLen, y1); ctx.lineTo(x2, y1); ctx.lineTo(x2, y1 + bLen);
      ctx.moveTo(x1, y2 - bLen); ctx.lineTo(x1, y2); ctx.lineTo(x1 + bLen, y2);
      ctx.moveTo(x2 - bLen, y2); ctx.lineTo(x2, y2); ctx.lineTo(x2, y2 - bLen);
      ctx.stroke();

      const selectedId = state.hotbar[state.player.selectedHotbarIndex];
      if (selectedId === 'shade_net' || selectedId === 'greenhouse') {
        const isGreenhouse = selectedId === 'greenhouse';
        ctx.fillStyle = isGreenhouse ? 'rgba(52, 211, 153, 0.16)' : 'rgba(56, 189, 248, 0.14)';
        ctx.fillRect(hx - TILE_SIZE, hy - TILE_SIZE, TILE_SIZE * 3, TILE_SIZE * 3);
        ctx.strokeStyle = isGreenhouse ? 'rgba(52, 211, 153, 0.78)' : 'rgba(56, 189, 248, 0.65)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(hx - TILE_SIZE, hy - TILE_SIZE, TILE_SIZE * 3, TILE_SIZE * 3);
      } else if (selectedId === 'drip_sprinkler') {
        ctx.fillStyle = 'rgba(78, 184, 245, 0.14)';
        ctx.fillRect(5 * TILE_SIZE, hy, 16 * TILE_SIZE, TILE_SIZE);
        ctx.strokeStyle = 'rgba(78, 184, 245, 0.6)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(5 * TILE_SIZE, hy, 16 * TILE_SIZE, TILE_SIZE);
      } else if (
        selectedId === 'scarecrow' ||
        selectedId === 'sprinkler' ||
        selectedId === 'sensor' ||
        selectedId === 'compost' ||
        selectedId === 'beehive' ||
        selectedId === 'ladybug_house'
      ) {
        const radiusTiles =
          selectedId === 'scarecrow'
            ? SCARECROW_RADIUS
            : selectedId === 'sprinkler'
            ? SPRINKLER_RADIUS
            : selectedId === 'sensor'
            ? SENSOR_RADIUS
            : selectedId === 'beehive'
            ? BEEHIVE_RADIUS
            : selectedId === 'ladybug_house'
            ? LADYBUG_RADIUS
            : COMPOST_RADIUS;
        const fillStyle =
          selectedId === 'sprinkler'
            ? 'rgba(92, 194, 242, 0.14)'
            : selectedId === 'sensor'
            ? 'rgba(72, 224, 138, 0.12)'
            : selectedId === 'compost'
            ? 'rgba(136, 209, 75, 0.13)'
            : selectedId === 'beehive'
            ? 'rgba(250, 204, 21, 0.15)'
            : selectedId === 'ladybug_house'
            ? 'rgba(244, 63, 94, 0.14)'
            : 'rgba(245, 210, 110, 0.12)';
        const strokeStyle =
          selectedId === 'sprinkler'
            ? 'rgba(92, 194, 242, 0.6)'
            : selectedId === 'sensor'
            ? 'rgba(72, 224, 138, 0.58)'
            : selectedId === 'compost'
            ? 'rgba(136, 209, 75, 0.58)'
            : selectedId === 'beehive'
            ? 'rgba(250, 204, 21, 0.7)'
            : selectedId === 'ladybug_house'
            ? 'rgba(244, 63, 94, 0.65)'
            : 'rgba(245, 210, 110, 0.55)';
        ctx.beginPath();
        ctx.arc(hx + TILE_SIZE / 2, hy + TILE_SIZE / 2, radiusTiles * TILE_SIZE, 0, Math.PI * 2);
        ctx.fillStyle = fillStyle;
        ctx.fill();
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // 4. Draw Crops, Obstacles, Placeables, Buildings, Player, Wildlife sorted by Y depth
  type DrawItem = { sortY: number; draw: () => void };
  const drawList: DrawItem[] = [];

  // Homestead Buildings
  if (realm === 'homestead') {
    drawList.push({
      sortY: (FARMHOUSE_POS.y + FARMHOUSE_POS.h) * TILE_SIZE,
      draw: () => drawFarmhouse(ctx, pal, timePhase, elapsedSec),
    });
    drawList.push({
      sortY: (SHOP_STALL_POS.y + SHOP_STALL_POS.h) * TILE_SIZE,
      draw: () => drawShopStall(ctx, timePhase, elapsedSec),
    });
    drawList.push({
      sortY: (WELL_POS.y + 1) * TILE_SIZE,
      draw: () => drawStoneWell(ctx, elapsedSec),
    });
    drawList.push({
      sortY: (SHIPPING_BIN_POS.y + 1) * TILE_SIZE,
      draw: () => drawShippingBin(ctx),
    });
  }

  // Tile contents (culled to camera viewport)
  for (let y = minTY; y <= maxTY; y++) {
    for (let x = minTX; x <= maxTX; x++) {
      const tile = state.tiles[y * state.width + x];
      const px = x * TILE_SIZE;
      const py = y * TILE_SIZE;

      if (tile.terrain === 'forest_edge') {
        drawList.push({
          sortY: py + TILE_SIZE,
          draw: () => drawForestTree(ctx, px, py, x, y, pal, elapsedSec, realm),
        });
      }
      if (tile.terrain === 'portal') {
        drawList.push({
          sortY: py + TILE_SIZE - 1,
          draw: () => drawAncientPortal(ctx, px, py, realm, elapsedSec),
        });
      }
      if (tile.terrain === 'village_hut') {
        drawList.push({
          sortY: py + TILE_SIZE,
          draw: () => drawVillageHut(ctx, px, py, realm, timePhase),
        });
      }
      if (tile.terrain === 'village_elder') {
        const visited = (state.visitedVillages ?? []).includes(realm);
        drawList.push({
          sortY: py + TILE_SIZE,
          draw: () => drawVillageElder(ctx, px, py, realm, elapsedSec, visited),
        });
      }
      if (tile.terrain === 'strange_zone') {
        const discovered = (state.investigatedStrangeZones ?? []).includes(realm);
        drawList.push({
          sortY: py + TILE_SIZE,
          draw: () => drawStrangeZone(ctx, px, py, realm, elapsedSec, discovered),
        });
      }
      if (tile.obstacle) {
        drawList.push({
          sortY: py + TILE_SIZE - 2,
          draw: () => drawObstacle(ctx, tile, px, py, elapsedSec),
        });
      }
      if (tile.crop) {
        drawList.push({
          sortY: py + TILE_SIZE - 4,
          draw: () => drawCrop(ctx, tile, px, py, elapsedSec),
        });
      }
      if (tile.fruitTree) {
        drawList.push({
          sortY: py + TILE_SIZE,
          draw: () => drawFruitTree(ctx, tile, px, py, elapsedSec),
        });
      }
      if (tile.structure) {
        const isGround = tile.structure.type === 'stone_path';
        const isArch = tile.structure.type === 'garden_arch';
        drawList.push({
          sortY: isGround ? py + 2 : isArch ? py + TILE_SIZE + 10 : py + TILE_SIZE - 1,
          draw: () => drawStructure(ctx, state, tile, px, py, timePhase, elapsedSec),
        });
      }
    }
  }

  // Daily Shimmering Meadow Treasure (Clover / Autumn Mushroom / Frost Bloom)
  if (state.dailyTreasure) {
    const dt = state.dailyTreasure;
    if (dt.x >= minTX && dt.x <= maxTX && dt.y >= minTY && dt.y <= maxTY) {
      drawList.push({
        sortY: (dt.y + 0.8) * TILE_SIZE,
        draw: () => drawDailyNatureTreasure(ctx, dt.x * TILE_SIZE, dt.y * TILE_SIZE, dt.kind, elapsedSec),
      });
    }
  }

  // Daily Mystery Treasure Chest
  if (state.mysteryChest) {
    const mc = state.mysteryChest;
    if (mc.x >= minTX && mc.x <= maxTX && mc.y >= minTY && mc.y <= maxTY) {
      drawList.push({
        sortY: (mc.y + 0.85) * TILE_SIZE,
        draw: () => drawMysteryChest(ctx, mc, elapsedSec),
      });
    }
  }

  // Local Player & Remote Multiplayer Farmers
  if (!isTitleBackdrop) {
    const swiftActive = isSwiftBuffActive(state);
    drawList.push({
      sortY: state.player.y * TILE_SIZE + 4,
      draw: () =>
        drawFarmerEntity(
          ctx,
          state.player,
          elapsedSec,
          localPlayerMeta?.colorIndex ?? 0,
          localPlayerMeta?.name,
          localPlayerMeta?.voice,
          localEmote ?? localPlayerMeta?.emote,
          swiftActive,
          localPlayerMeta?.style ?? state.playerStyle
        ),
    });
    for (const rp of remotePlayers) {
      const rpVoice = voiceStates?.[rp.id];
      const rpEmote = activeEmotes?.[rp.id];
      drawList.push({
        sortY: rp.y * TILE_SIZE + 4,
        draw: () => drawFarmerEntity(ctx, rp, elapsedSec, rp.colorIndex, rp.name, rpVoice, rpEmote, false, rp.style),
      });
    }
  }

  // Farmyard Chickens, Dairy Cows, Fluffy Sheep, Guard Dog & Cozy Cat (Homestead only)
  if (realm === 'homestead') {
    for (const c of state.chickens ?? []) {
      drawList.push({
        sortY: c.y * TILE_SIZE + 3,
        draw: () => drawChicken(ctx, c, elapsedSec),
      });
    }
    for (const cow of state.cows ?? []) {
      drawList.push({
        sortY: cow.y * TILE_SIZE + 4,
        draw: () => drawLivestock(ctx, cow, elapsedSec),
      });
    }
    for (const s of state.sheep ?? []) {
      drawList.push({
        sortY: s.y * TILE_SIZE + 3.5,
        draw: () => drawLivestock(ctx, s, elapsedSec),
      });
    }
    if (state.dog) {
      const dog = state.dog;
      const showDogName =
        !isTitleBackdrop &&
        Boolean(state.petNames?.dog) &&
        Math.hypot(state.player.x - dog.x, state.player.y - dog.y) <= 4.5;
      drawList.push({
        sortY: dog.y * TILE_SIZE + 3.8,
        draw: () => drawLivestock(ctx, dog, elapsedSec, showDogName ? state.petNames?.dog : undefined),
      });
    }
    if (state.cat) {
      const cat = state.cat;
      const showCatName =
        !isTitleBackdrop &&
        Boolean(state.petNames?.cat) &&
        Math.hypot(state.player.x - cat.x, state.player.y - cat.y) <= 4.5;
      drawList.push({
        sortY: cat.y * TILE_SIZE + 3.6,
        draw: () => drawLivestock(ctx, cat, elapsedSec, showCatName ? state.petNames?.cat : undefined),
      });
    }
  }

  // Wildlife
  for (const w of state.wildlife) {
    drawList.push({
      sortY: w.y * TILE_SIZE + 4,
      draw: () => drawWildlife(ctx, w, elapsedSec),
    });
  }

  // Realm-Specific Native Fauna (Foxes, Deer, Fennecs, Gazelles, Scarabs, Cranes, Alpacas, Star-Owls)
  for (const rc of state.realmCreatures ?? []) {
    const nearPlayer =
      !isTitleBackdrop && Math.hypot(state.player.x - rc.x, state.player.y - rc.y) <= 2.4;
    drawList.push({
      sortY: rc.y * TILE_SIZE + 4,
      draw: () => drawRealmCreature(ctx, rc, elapsedSec, nearPlayer),
    });
  }

  drawList.sort((a, b) => a.sortY - b.sortY);
  for (const item of drawList) {
    item.draw();
  }

  // 4b. Glowing Night Fireflies
  for (const ff of state.fireflies ?? []) {
    drawFirefly(ctx, ff, elapsedSec);
  }

  // 5. Particles
  for (const p of particles) {
    if (!p.active) continue;
    const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.round(p.x - p.size / 2), Math.round(p.y - p.size / 2), p.size, p.size);
  }
  ctx.globalAlpha = 1;

  // 6. Floating Texts with snappy bounce-in scale pop
  for (const ft of floatingTexts) {
    const alpha = Math.max(0, Math.min(1, ft.life / ft.maxLife));
    const age = ft.maxLife - ft.life;
    const popScale = age < 0.14 ? 0.85 + Math.sin((age / 0.14) * Math.PI) * 0.28 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(ft.x, ft.y);
    ctx.scale(popScale, popScale);
    ctx.font = 'bold 12px "Pixelify Sans", "Cairo", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = '#1b120b';
    ctx.strokeText(ft.text, 0, 0);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }

  ctx.restore();

  // 7. Weather Screen Effects (Sky Sanctuary is sheltered above the clouds!)
  if (realm !== 'sky_sanctuary') {
    if (state.weather === 'Rainstorm') {
      drawRainOverlay(ctx, canvasWidth, canvasHeight, elapsedSec);
    } else if (state.weather === 'Drought') {
      ctx.save();
      ctx.fillStyle = 'rgba(255, 190, 85, 0.09)';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.restore();
    } else if (state.weather === 'Heatwave') {
      ctx.save();
      const pulse = 0.13 + Math.sin(elapsedSec * 2.5) * 0.03;
      ctx.fillStyle = `rgba(245, 108, 45, ${pulse.toFixed(3)})`;
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      ctx.strokeStyle = 'rgba(255, 210, 120, 0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 14; i++) {
        const hx = ((i * 137 + elapsedSec * 28) % (canvasWidth + 60)) - 30;
        const hy = ((i * 89 + Math.sin(elapsedSec * 2 + i) * 18) % canvasHeight);
        ctx.moveTo(hx, hy);
        ctx.lineTo(hx + 22, hy - 4);
      }
      ctx.stroke();
      ctx.restore();
    } else if (state.weather === 'Mist') {
      ctx.save();
      ctx.fillStyle = 'rgba(219, 234, 254, 0.13)';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      for (let i = 0; i < 7; i++) {
        const mx = ((i * 210 + elapsedSec * (16 + (i % 3) * 6)) % (canvasWidth + 240)) - 120;
        const my = ((i * 115) % Math.max(120, canvasHeight - 40)) + 20;
        ctx.fillStyle = 'rgba(241, 245, 249, 0.14)';
        ctx.fillRect(Math.round(mx), Math.round(my), 110, 20);
        ctx.fillRect(Math.round(mx + 18), Math.round(my - 8), 72, 12);
      }
      ctx.restore();
    } else if (state.weather === 'Windy') {
      ctx.save();
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 18; i++) {
        const wx = ((i * 143 + elapsedSec * 360) % (canvasWidth + 120)) - 60;
        const wy = ((i * 71 + Math.sin(elapsedSec * 3 + i) * 14) % canvasHeight);
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + 34, wy + 5);
      }
      ctx.stroke();
      ctx.restore();
    } else if (state.weather === 'Meteor') {
      ctx.save();
      ctx.fillStyle = 'rgba(88, 28, 135, 0.10)';
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
      for (let i = 0; i < 4; i++) {
        const cycle = (elapsedSec * 0.85 + i * 1.45) % 2.8;
        if (cycle < 1.1) {
          const p = cycle / 1.1;
          const sx = ((i * 223 + 80) % Math.max(200, canvasWidth - 100)) + p * 170;
          const sy = 20 + i * 38 + p * 110;
          ctx.globalAlpha = Math.max(0, 1 - p) * 0.9;
          ctx.strokeStyle = i % 2 === 0 ? '#fde047' : '#e9d5ff';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx - 28, sy - 16);
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(Math.round(sx) - 1, Math.round(sy) - 1, 3, 3);
        }
      }
      ctx.restore();
    }
  }

  // 8. Dynamic Day / Sunset / Night Lighting Overlay
  drawLightingOverlay(ctx, canvasWidth, canvasHeight, state, camera, isTitleBackdrop, elapsedSec, remotePlayers);

  // 9. Living Seasonal Nature Ambience (butterflies, autumn leaves, winter snow, glowing night fireflies)
  drawLivingAmbience(ctx, canvasWidth, canvasHeight, state, season, timePhase, elapsedSec);
}

function drawStaticTerrainTile(
  ctx: CanvasRenderingContext2D,
  tile: FarmTile,
  px: number,
  py: number,
  pal: SeasonPalette,
  season: Season,
  realm: RealmId
): void {
  const checker = (tile.x + tile.y) % 2 === 0;
  if (tile.terrain === 'water') {
    ctx.fillStyle =
      realm === 'crystal_oasis' ? '#0e7490' : realm === 'sky_sanctuary' ? '#312e81' : '#38769c';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle =
      realm === 'crystal_oasis' ? '#22d3ee' : realm === 'sky_sanctuary' ? '#6366f1' : '#4c90b8';
    ctx.fillRect(px + 2, py + 4, TILE_SIZE - 4, TILE_SIZE - 8);
    return;
  }

  if (tile.terrain === 'dirt_path') {
    ctx.fillStyle = pal.dirt;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = pal.dirtSpeck;
    if ((tile.x * 7 + tile.y * 13) % 3 === 0) {
      ctx.fillRect(px + 6, py + 8, 4, 2);
      ctx.fillRect(px + 20, py + 22, 4, 2);
    }
    return;
  }

  if (tile.terrain === 'portal') {
    // Ancient stone dais underneath portal arch
    ctx.fillStyle = checker ? pal.grassA : pal.grassB;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#475569';
    ctx.fillRect(px + 2, py + 4, TILE_SIZE - 4, TILE_SIZE - 6);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(px + 4, py + 6, TILE_SIZE - 8, TILE_SIZE - 10);
    return;
  }

  if (tile.terrain === 'village_plaza' || tile.terrain === 'village_hut' || tile.terrain === 'village_elder') {
    if (realm === 'whispering_woods') {
      ctx.fillStyle = checker ? '#92643d' : '#805532';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#684225';
      ctx.fillRect(px, py + 7, TILE_SIZE, 1);
      ctx.fillRect(px, py + 15, TILE_SIZE, 1);
      ctx.fillRect(px, py + 23, TILE_SIZE, 1);
    } else if (realm === 'crystal_oasis') {
      ctx.fillStyle = checker ? '#e9d3a3' : '#dcc089';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#bfa068';
      ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, 1);
      ctx.fillRect(px + 2, py + 16, TILE_SIZE - 4, 1);
    } else {
      ctx.fillStyle = checker ? '#e2e8f0' : '#cbd5e1';
      ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(px, py + 15, TILE_SIZE, 1);
      ctx.fillRect(px + 15, py, 1, TILE_SIZE);
    }
    return;
  }

  if (tile.terrain === 'strange_zone') {
    ctx.fillStyle = checker ? pal.grassA : pal.grassB;
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(px + 3, py + 4, TILE_SIZE - 6, TILE_SIZE - 7);
    ctx.fillStyle = '#4c1d95';
    ctx.fillRect(px + 6, py + 7, TILE_SIZE - 12, TILE_SIZE - 13);
    return;
  }

  if (tile.terrain === 'moss_floor') {
    ctx.fillStyle = checker ? '#235940' : '#1e4d37';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    const mHash = (tile.x * 29 + tile.y * 19) % 7;
    if (mHash < 3) {
      ctx.fillStyle = '#40916c';
      ctx.fillRect(px + 5 + mHash * 5, py + 9, 4, 3);
      ctx.fillStyle = '#6ee7b7';
      ctx.fillRect(px + 18, py + 20, 2, 2);
    }
    return;
  }

  if (tile.terrain === 'sand_dune') {
    ctx.fillStyle = checker ? '#dcb673' : '#cfa663';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#ebd09a';
    ctx.fillRect(px + 3, py + 10 + ((tile.x + tile.y) % 4), 14, 2);
    if ((tile.x * 13 + tile.y * 7) % 5 === 0) {
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(px + 21, py + 21, 3, 2);
    }
    return;
  }

  if (tile.terrain === 'cloud_stone') {
    ctx.fillStyle = checker ? '#cfdbf0' : '#becde6';
    ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#eef4ff';
    ctx.fillRect(px + 4, py + 5, 10, 3);
    ctx.fillStyle = '#93c5fd';
    if ((tile.x + tile.y) % 3 === 0) {
      ctx.fillRect(px + 19, py + 21, 4, 2);
    }
    return;
  }

  // Grass / Biome ground base
  ctx.fillStyle = checker ? pal.grassA : pal.grassB;
  ctx.fillRect(px, py, TILE_SIZE, TILE_SIZE);

  // Tufts & biome accents
  const hash = (tile.x * 37 + tile.y * 17) % 11;
  if (hash < 3) {
    ctx.fillStyle = pal.grassTuft;
    ctx.fillRect(px + 6 + hash * 4, py + 10, 2, 4);
    ctx.fillRect(px + 10 + hash * 4, py + 12, 2, 3);
    if (realm === 'homestead' && season === 'Spring' && hash === 1) {
      ctx.fillStyle = '#f5d76e';
      ctx.fillRect(px + 20, py + 20, 3, 3);
    } else if (realm === 'whispering_woods' && hash === 2) {
      ctx.fillStyle = '#5eead4';
      ctx.fillRect(px + 18, py + 20, 2, 2);
    } else if (realm === 'crystal_oasis' && hash === 1) {
      ctx.fillStyle = '#67e8f9';
      ctx.fillRect(px + 19, py + 19, 3, 2);
    } else if (realm === 'sky_sanctuary' && hash === 0) {
      ctx.fillStyle = '#fde047';
      ctx.fillRect(px + 21, py + 18, 2, 2);
    }
  }
}

function drawAnimatedWaterTile(
  ctx: CanvasRenderingContext2D,
  tile: FarmTile,
  px: number,
  py: number,
  elapsedSec: number,
  realm: RealmId
): void {
  if (Math.sin(elapsedSec * 2.5 + tile.x * 0.8 + tile.y * 0.6) > 0.25) {
    ctx.fillStyle =
      realm === 'crystal_oasis' ? '#a5f3fc' : realm === 'sky_sanctuary' ? '#c7d2fe' : '#92d1eb';
    ctx.fillRect(px + 6, py + 10, 10, 2);
    ctx.fillRect(px + 16, py + 22, 8, 2);
  }
  const fishPhase = Math.sin(elapsedSec * 1.45 + tile.x * 2.3 + tile.y * 1.9);
  if (fishPhase > 0.945 && (tile.x + tile.y) % 2 === 0) {
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(px + 12, py + 15, 8, 2);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(px + 14, py + 11, 4, 3);
  }
}

function drawTilledSoil(
  ctx: CanvasRenderingContext2D,
  tile: FarmTile,
  px: number,
  py: number
): void {
  const soilColor = tile.watered ? '#4f3322' : '#85583a';
  const furrowColor = tile.watered ? '#3b2416' : '#6b4329';
  ctx.fillStyle = soilColor;
  ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
  ctx.fillStyle = furrowColor;
  ctx.fillRect(px + 4, py + 8, TILE_SIZE - 8, 3);
  ctx.fillRect(px + 4, py + 16, TILE_SIZE - 8, 3);
  ctx.fillRect(px + 4, py + 24, TILE_SIZE - 8, 3);

  if (tile.watered) {
    ctx.fillStyle = 'rgba(125, 211, 252, 0.32)';
    ctx.fillRect(px + 7, py + 6, 4, 2);
    ctx.fillRect(px + 20, py + 19, 5, 2);
  }
  if ((tile.mulchedDays ?? 0) > 0) {
    // Rich golden straw & bio-mulch layer
    ctx.fillStyle = '#d9a441';
    ctx.fillRect(px + 4, py + 4, 6, 2);
    ctx.fillRect(px + 18, py + 11, 7, 2);
    ctx.fillRect(px + 6, py + 21, 6, 2);
    ctx.fillStyle = '#f5d061';
    ctx.fillRect(px + 13, py + 14, 4, 2);
    ctx.fillRect(px + 22, py + 25, 5, 2);
  }
  if (tile.droughtDriedToday && !tile.watered) {
    ctx.fillStyle = '#c4986e';
    ctx.fillRect(px + 8, py + 12, 6, 2);
    ctx.fillRect(px + 18, py + 20, 5, 2);
  }
  if (tile.beanRotationBonus) {
    ctx.fillStyle = '#9be86b';
    ctx.fillRect(px + 5, py + 5, 3, 3);
    ctx.fillRect(px + 24, py + 23, 3, 3);
    ctx.fillStyle = '#d9ff99';
    ctx.fillRect(px + 22, py + 6, 2, 2);
  }
}

function drawForestTree(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  tx: number,
  ty: number,
  pal: SeasonPalette,
  elapsedSec: number,
  realm: RealmId
): void {
  const sway = Math.round(Math.sin(elapsedSec * 1.4 + tx * 0.7 + ty * 0.5) * 1);
  if (realm === 'crystal_oasis') {
    // Oasis sandstone spire / palm tree
    ctx.fillStyle = '#925828';
    ctx.fillRect(px + 13, py + 14, 6, 18);
    ctx.fillStyle = pal.treeDark;
    ctx.fillRect(px + 3 + sway, py + 6, 26, 8);
    ctx.fillStyle = pal.treeMid;
    ctx.fillRect(px + 5 + sway, py + 2, 22, 8);
    ctx.fillStyle = pal.treeLight;
    ctx.fillRect(px + 11 + sway, py + 4, 10, 4);
    return;
  }
  if (realm === 'sky_sanctuary') {
    // Celestial marble pillar & floating crystal orb
    ctx.fillStyle = '#334155';
    ctx.fillRect(px + 8, py + 14, 16, 18);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(px + 10, py + 10, 12, 18);
    const hover = Math.round(Math.sin(elapsedSec * 2.4 + tx + ty) * 2);
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(px + 11, py + 1 + hover, 10, 9);
    ctx.fillStyle = '#e0e7ff';
    ctx.fillRect(px + 13, py + 3 + hover, 5, 4);
    return;
  }
  // Trunk
  ctx.fillStyle = '#543824';
  ctx.fillRect(px + 12, py + 20, 8, 12);
  // Canopy shadow
  ctx.fillStyle = pal.treeDark;
  ctx.fillRect(px + 2 + sway, py + 4, 28, 20);
  // Mid foliage
  ctx.fillStyle = pal.treeMid;
  ctx.fillRect(px + 4 + sway, py, 24, 18);
  // Top highlight
  ctx.fillStyle = pal.treeLight;
  ctx.fillRect(px + 8 + sway, py + 2, 14, 8);
  if (realm === 'whispering_woods' && (tx + ty) % 3 === 0) {
    ctx.fillStyle = Math.sin(elapsedSec * 3 + tx) > 0 ? '#5eead4' : '#34d399';
    ctx.fillRect(px + 10 + sway, py + 10, 3, 3);
    ctx.fillRect(px + 19 + sway, py + 6, 2, 2);
  }
}

function drawAncientPortal(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  realm: RealmId,
  elapsedSec: number
): void {
  const accent = REALM_DEFS[realm].accentColor;
  const pulse = 0.72 + Math.sin(elapsedSec * 3.8) * 0.28;

  // Shadow & stone base
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(px + 2, py + 26, TILE_SIZE - 4, 5);

  // Carved Rune Archway Pillars
  ctx.fillStyle = '#334155';
  ctx.fillRect(px + 3, py + 2, 6, 26);
  ctx.fillRect(px + TILE_SIZE - 9, py + 2, 6, 26);
  ctx.fillRect(px + 3, py - 2, TILE_SIZE - 6, 6);

  ctx.fillStyle = '#64748b';
  ctx.fillRect(px + 5, py + 4, 2, 22);
  ctx.fillRect(px + TILE_SIZE - 7, py + 4, 2, 22);
  ctx.fillRect(px + 5, py, TILE_SIZE - 10, 3);

  // Swirling Inner Portal Vortex
  ctx.save();
  ctx.globalAlpha = pulse;
  ctx.fillStyle = accent;
  ctx.fillRect(px + 9, py + 4, 14, 22);
  ctx.fillStyle = '#f5f3ff';
  const swirlY = py + 8 + Math.round(Math.sin(elapsedSec * 5) * 4);
  ctx.fillRect(px + 13, swirlY, 6, 6);
  ctx.fillRect(px + 11, py + 13 + Math.round(Math.cos(elapsedSec * 4) * 3), 3, 3);
  ctx.fillRect(px + 18, py + 15 - Math.round(Math.cos(elapsedSec * 4) * 3), 3, 3);
  ctx.restore();

  // Keystone rune gem
  ctx.fillStyle = '#e879f9';
  ctx.fillRect(px + 14, py - 1, 4, 3);
}

function drawFarmhouse(
  ctx: CanvasRenderingContext2D,
  pal: SeasonPalette,
  timePhase: string,
  elapsedSec: number
): void {
  const x = FARMHOUSE_POS.x * TILE_SIZE;
  const y = FARMHOUSE_POS.y * TILE_SIZE;
  const w = FARMHOUSE_POS.w * TILE_SIZE;
  const h = FARMHOUSE_POS.h * TILE_SIZE;

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(x + 4, y + h - 4, w - 4, 10);

  // Stone foundation & timber walls
  ctx.fillStyle = '#e8d5b5';
  ctx.fillRect(x + 6, y + 36, w - 12, h - 38);
  ctx.fillStyle = '#734b2e';
  ctx.fillRect(x + 6, y + 36, 6, h - 38);
  ctx.fillRect(x + w - 12, y + 36, 6, h - 38);
  ctx.fillRect(x + 6, y + h - 8, w - 12, 8);

  // Chimney
  ctx.fillStyle = '#75665d';
  ctx.fillRect(x + w - 28, y - 8, 14, 26);
  ctx.fillStyle = '#99897e';
  ctx.fillRect(x + w - 30, y - 10, 18, 4);

  // Cozy Pitched Roof
  ctx.fillStyle = pal.roof;
  ctx.fillRect(x + 2, y + 10, w - 4, 32);
  ctx.fillStyle = pal.roofTrim;
  ctx.fillRect(x + 8, y + 4, w - 16, 10);
  // Shingle lines
  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(x + 4, y + 20, w - 8, 2);
  ctx.fillRect(x + 4, y + 30, w - 8, 2);

  // Door
  const doorX = x + 38;
  const doorY = y + h - 30;
  ctx.fillStyle = '#5c381f';
  ctx.fillRect(doorX, doorY, 22, 30);
  ctx.fillStyle = '#80502f';
  ctx.fillRect(doorX + 3, doorY + 3, 16, 25);
  ctx.fillStyle = '#f2c961';
  ctx.fillRect(doorX + 15, doorY + 14, 3, 3);

  // Windows (glowing warm amber at Sunset & Night)
  const lit = timePhase !== 'Day';
  const flicker = lit && Math.sin(elapsedSec * 5) > -0.7 ? '#ffd666' : '#f2ad46';
  const winColor = lit ? flicker : '#6ea8c9';
  const winPositions = [x + 16, x + w - 36];
  for (const wx of winPositions) {
    ctx.fillStyle = '#54351e';
    ctx.fillRect(wx, y + 52, 18, 18);
    ctx.fillStyle = winColor;
    ctx.fillRect(wx + 2, y + 54, 14, 14);
    ctx.fillStyle = '#54351e';
    ctx.fillRect(wx + 8, y + 54, 2, 14);
    ctx.fillRect(wx + 2, y + 60, 14, 2);
  }
}

function drawShopStall(
  ctx: CanvasRenderingContext2D,
  timePhase: string,
  elapsedSec: number
): void {
  const x = SHOP_STALL_POS.x * TILE_SIZE;
  const y = SHOP_STALL_POS.y * TILE_SIZE;
  const w = SHOP_STALL_POS.w * TILE_SIZE;
  const h = SHOP_STALL_POS.h * TILE_SIZE;

  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fillRect(x + 4, y + h - 4, w - 4, 8);

  // Timber frame & counter
  ctx.fillStyle = '#6b4528';
  ctx.fillRect(x + 6, y + 20, 6, h - 20);
  ctx.fillRect(x + w - 12, y + 20, 6, h - 20);
  ctx.fillStyle = '#996439';
  ctx.fillRect(x + 4, y + h - 20, w - 8, 18);
  ctx.fillStyle = '#b57b4a';
  ctx.fillRect(x + 2, y + h - 22, w - 4, 4);

  // Friendly Shopkeeper NPC behind counter
  const bob = Math.round(Math.sin(elapsedSec * 2.4));
  ctx.fillStyle = '#47784d'; // apron
  ctx.fillRect(x + 40, y + 32 + bob, 16, 12);
  ctx.fillStyle = '#f2c89d'; // head
  ctx.fillRect(x + 42, y + 22 + bob, 12, 10);
  ctx.fillStyle = '#26180f'; // eyes
  ctx.fillRect(x + 44, y + 26 + bob, 2, 2);
  ctx.fillRect(x + 50, y + 26 + bob, 2, 2);
  ctx.fillStyle = '#9e4c36'; // cap
  ctx.fillRect(x + 40, y + 18 + bob, 16, 5);

  // Striped Awning (higher up so NPC face is clearly visible)
  for (let i = 0; i < 6; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#c44536' : '#f4e7ce';
    ctx.fillRect(x + i * 16, y - 2, 16, 18);
    ctx.fillStyle = i % 2 === 0 ? '#9c3226' : '#d6c6a7';
    ctx.fillRect(x + i * 16, y + 14, 16, 4);
  }

  // Display crate with veggies
  ctx.fillStyle = '#e8782b';
  ctx.fillRect(x + 12, y + h - 25, 6, 4);
  ctx.fillStyle = '#e6b84c';
  ctx.fillRect(x + 22, y + h - 25, 8, 4);

  // Hanging lantern
  ctx.fillStyle = timePhase !== 'Day' ? '#ffd86b' : '#b8944f';
  ctx.fillRect(x + w - 16, y + 24, 6, 8);
}

function drawStoneWell(ctx: CanvasRenderingContext2D, elapsedSec: number): void {
  const x = WELL_POS.x * TILE_SIZE;
  const y = WELL_POS.y * TILE_SIZE;

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(x + 4, y + 24, 24, 6);
  // Stone rim
  ctx.fillStyle = '#7c8288';
  ctx.fillRect(x + 4, y + 12, 24, 16);
  ctx.fillStyle = '#a0a8b0';
  ctx.fillRect(x + 4, y + 10, 24, 6);
  // Water inside
  ctx.fillStyle = '#3b82b0';
  ctx.fillRect(x + 8, y + 12, 16, 6);
  if (Math.sin(elapsedSec * 3) > 0) {
    ctx.fillStyle = '#8fd0f2';
    ctx.fillRect(x + 11, y + 14, 6, 2);
  }
  // Wooden roof
  ctx.fillStyle = '#6b4528';
  ctx.fillRect(x + 5, y + 2, 3, 12);
  ctx.fillRect(x + 24, y + 2, 3, 12);
  ctx.fillStyle = '#99533a';
  ctx.fillRect(x + 2, y - 2, 28, 6);
}

function drawShippingBin(ctx: CanvasRenderingContext2D): void {
  const x = SHIPPING_BIN_POS.x * TILE_SIZE;
  const y = SHIPPING_BIN_POS.y * TILE_SIZE;
  ctx.fillStyle = '#5c3a21';
  ctx.fillRect(x + 3, y + 8, 26, 20);
  ctx.fillStyle = '#8c5a35';
  ctx.fillRect(x + 5, y + 10, 22, 16);
  // Metal bands
  ctx.fillStyle = '#474c52';
  ctx.fillRect(x + 3, y + 12, 26, 3);
  ctx.fillRect(x + 3, y + 22, 26, 3);
  ctx.fillStyle = '#e6b84c';
  ctx.fillRect(x + 13, y + 16, 6, 4);
}

function drawObstacle(
  ctx: CanvasRenderingContext2D,
  tile: FarmTile,
  px: number,
  py: number,
  elapsedSec: number
): void {
  if (tile.obstacle === 'weed') {
    const sway = Math.round(Math.sin(elapsedSec * 2.5 + tile.x) * 1);
    ctx.fillStyle = '#3c732d';
    ctx.fillRect(px + 8 + sway, py + 14, 4, 12);
    ctx.fillRect(px + 14 + sway, py + 10, 4, 16);
    ctx.fillRect(px + 20 + sway, py + 15, 4, 11);
    ctx.fillStyle = '#6ba844';
    ctx.fillRect(px + 10 + sway, py + 12, 3, 6);
    ctx.fillRect(px + 16 + sway, py + 14, 4, 6);
  } else if (tile.obstacle === 'rock') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(px + 6, py + 23, 20, 4);
    ctx.fillStyle = '#6e7378';
    ctx.fillRect(px + 6, py + 12, 20, 13);
    ctx.fillStyle = '#92989e';
    ctx.fillRect(px + 8, py + 9, 14, 8);
    ctx.fillStyle = '#b4bbc2';
    ctx.fillRect(px + 10, py + 10, 6, 4);
  } else if (tile.obstacle === 'stump') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 6, py + 23, 20, 5);
    ctx.fillStyle = '#5c3b24';
    ctx.fillRect(px + 7, py + 12, 18, 14);
    ctx.fillStyle = '#805334';
    ctx.fillRect(px + 9, py + 10, 14, 6);
    ctx.fillStyle = '#c49464';
    ctx.fillRect(px + 10, py + 10, 12, 4);
  }
}

function drawCrop(
  ctx: CanvasRenderingContext2D,
  tile: FarmTile,
  px: number,
  py: number,
  elapsedSec: number
): void {
  const crop = tile.crop;
  if (!crop) return;
  const def = CROPS[crop.type];

  if (crop.withered) {
    ctx.fillStyle = '#6b533b';
    ctx.fillRect(px + 10, py + 18, 4, 8);
    ctx.fillRect(px + 18, py + 20, 4, 6);
    ctx.fillStyle = '#4a3826';
    ctx.fillRect(px + 8, py + 16, 6, 3);
    ctx.fillRect(px + 18, py + 18, 6, 3);
    return;
  }

  const ratio = crop.growthDays / def.daysToGrow;
  const sway = Math.round(Math.sin(elapsedSec * 2.6 + tile.x * 0.9 + tile.y * 0.4));

  if (ratio <= 0) {
    // Planted seeds
    ctx.fillStyle = '#d9be82';
    ctx.fillRect(px + 10, py + 14, 3, 3);
    ctx.fillRect(px + 19, py + 18, 3, 3);
    ctx.fillRect(px + 13, py + 22, 3, 3);
    return;
  }

  if (ratio < 0.55) {
    // Young green sprout
    ctx.fillStyle = '#4c963e';
    ctx.fillRect(px + 14, py + 16, 4, 10);
    ctx.fillStyle = '#76bf54';
    ctx.fillRect(px + 10 + sway, py + 14, 5, 4);
    ctx.fillRect(px + 17 + sway, py + 13, 5, 4);
    return;
  }

  if (ratio < 1) {
    // Mid-growth leafy stalk
    ctx.fillStyle = '#3b8233';
    ctx.fillRect(px + 13, py + 11, 6, 15);
    ctx.fillStyle = '#66b548';
    ctx.fillRect(px + 8 + sway, py + 12, 7, 6);
    ctx.fillRect(px + 17 + sway, py + 10, 7, 6);
    return;
  }

  // RIPE CROP with gentle sparkle!
  if (crop.type === 'wheat') {
    ctx.fillStyle = '#cfa034';
    ctx.fillRect(px + 8 + sway, py + 10, 4, 16);
    ctx.fillRect(px + 14 + sway, py + 8, 4, 18);
    ctx.fillRect(px + 20 + sway, py + 11, 4, 15);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(px + 8 + sway, py + 6, 4, 6);
    ctx.fillRect(px + 14 + sway, py + 4, 4, 6);
    ctx.fillRect(px + 20 + sway, py + 7, 4, 6);
  } else if (crop.type === 'carrot') {
    ctx.fillStyle = '#4f9c3e';
    ctx.fillRect(px + 10 + sway, py + 6, 12, 10);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 12, py + 15, 8, 12);
    ctx.fillStyle = '#f2994a';
    ctx.fillRect(px + 14, py + 16, 3, 8);
  } else if (crop.type === 'tomato') {
    ctx.fillStyle = '#3d7d34';
    ctx.fillRect(px + 8, py + 7, 16, 18);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 9, py + 12, 6, 6);
    ctx.fillRect(px + 17, py + 9, 6, 6);
    ctx.fillRect(px + 14, py + 18, 6, 6);
  } else if (crop.type === 'strawberry') {
    ctx.fillStyle = '#3d8538';
    ctx.fillRect(px + 7, py + 10, 18, 14);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 9, py + 15, 6, 7);
    ctx.fillRect(px + 17, py + 14, 6, 7);
    ctx.fillStyle = '#fff5d6';
    ctx.fillRect(px + 11, py + 17, 2, 2);
    ctx.fillRect(px + 19, py + 16, 2, 2);
  } else if (crop.type === 'bean') {
    // Fertility Bean vine with plump green pods
    ctx.fillStyle = '#387d32';
    ctx.fillRect(px + 8 + sway, py + 7, 16, 17);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 9 + sway, py + 9, 5, 10);
    ctx.fillRect(px + 18 + sway, py + 11, 5, 10);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(px + 10 + sway, py + 10, 3, 7);
    ctx.fillRect(px + 19 + sway, py + 12, 3, 7);
    ctx.fillStyle = '#f5f2b8';
    ctx.fillRect(px + 14 + sway, py + 6, 4, 3);
  } else if (crop.type === 'corn') {
    // Tall Golden Corn Stalks
    ctx.fillStyle = '#387d32';
    ctx.fillRect(px + 10 + sway, py + 5, 4, 21);
    ctx.fillRect(px + 18 + sway, py + 7, 4, 19);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 9 + sway, py + 9, 5, 9);
    ctx.fillRect(px + 17 + sway, py + 11, 5, 9);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(px + 10 + sway, py + 10, 3, 6);
    ctx.fillRect(px + 18 + sway, py + 12, 3, 6);
  } else if (crop.type === 'watermelon') {
    // Striped Summer Watermelon
    ctx.fillStyle = '#387d32';
    ctx.fillRect(px + 6, py + 10, 20, 6);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 6, py + 13, 20, 14);
    ctx.fillStyle = '#14532d';
    ctx.fillRect(px + 10, py + 14, 3, 12);
    ctx.fillRect(px + 18, py + 14, 3, 12);
  } else if (crop.type === 'lavender') {
    // Fragrant Lavender Spikes
    ctx.fillStyle = '#4e913d';
    ctx.fillRect(px + 11, py + 16, 10, 10);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 8 + sway, py + 7, 4, 11);
    ctx.fillRect(px + 14 + sway, py + 5, 4, 13);
    ctx.fillRect(px + 20 + sway, py + 8, 4, 10);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(px + 15 + sway, py + 6, 2, 7);
  } else if (crop.type === 'sunflower') {
    // Tall Golden Sunflower
    ctx.fillStyle = '#3f7d32';
    ctx.fillRect(px + 14, py + 13, 4, 14);
    ctx.fillRect(px + 9, py + 18, 5, 3);
    ctx.fillRect(px + 18, py + 16, 5, 3);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 8 + sway, py + 3, 16, 14);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(px + 10 + sway, py + 5, 12, 10);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(px + 12 + sway, py + 7, 8, 6);
  } else if (crop.type === 'potato') {
    // Hearty Golden Potatoes under leafy bush
    ctx.fillStyle = '#4d8c3a';
    ctx.fillRect(px + 8 + sway, py + 7, 16, 9);
    ctx.fillStyle = '#6bb34e';
    ctx.fillRect(px + 11 + sway, py + 5, 10, 5);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 7, py + 17, 8, 7);
    ctx.fillRect(px + 16, py + 19, 9, 7);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(px + 9, py + 18, 4, 3);
    ctx.fillRect(px + 18, py + 20, 4, 3);
  } else if (crop.type === 'chili') {
    // Fiery Red Chili Peppers
    ctx.fillStyle = '#2f732e';
    ctx.fillRect(px + 7 + sway, py + 7, 18, 13);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 9 + sway, py + 13, 4, 10);
    ctx.fillRect(px + 15 + sway, py + 15, 4, 10);
    ctx.fillRect(px + 20 + sway, py + 12, 4, 9);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(px + 10 + sway, py + 14, 2, 5);
    ctx.fillRect(px + 16 + sway, py + 16, 2, 5);
  } else {
    // Pumpkin
    ctx.fillStyle = '#477d34';
    ctx.fillRect(px + 14, py + 8, 4, 6);
    ctx.fillStyle = def.color;
    ctx.fillRect(px + 7, py + 13, 18, 13);
    ctx.fillStyle = def.accentColor;
    ctx.fillRect(px + 11, py + 14, 10, 10);
  }

  // Ripe golden harvest sparkle (twinkling cross-star so ripe fields visibly gleam)
  const spPhase = Math.sin(elapsedSec * 4.5 + tile.x * 1.1 + tile.y * 0.7);
  if (spPhase > 0.45 && !crop.pestInfested) {
    const sx = px + 21;
    const sy = py + 6;
    ctx.fillStyle = '#fff6b3';
    ctx.fillRect(sx, sy, 3, 3);
    if (spPhase > 0.75) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx + 1, sy - 2, 1, 7);
      ctx.fillRect(sx - 2, sy + 1, 7, 1);
    }
  }

  // Pest infestation visual indicator (buzzing bugs & warning pip)
  if (crop.pestInfested) {
    const bx = Math.round(Math.sin(elapsedSec * 7 + tile.x) * 4);
    const by = Math.round(Math.cos(elapsedSec * 6 + tile.y) * 3);
    ctx.fillStyle = '#a855f7';
    ctx.fillRect(px + 9 + bx, py + 9 + by, 3, 2);
    ctx.fillRect(px + 18 - bx, py + 14 - by, 3, 2);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(px + 14, py + 2, 4, 4);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(px + 15, py + 3, 2, 2);
  }
}

function drawFruitTree(
  ctx: CanvasRenderingContext2D,
  tile: FarmTile,
  px: number,
  py: number,
  elapsedSec: number
): void {
  const tree = tile.fruitTree;
  if (!tree) return;
  const def = FRUIT_TREES[tree.kind];
  const mature = tree.growthDays >= def.daysToMature;
  const sway = Math.round(Math.sin(elapsedSec * 1.8 + tile.x + tile.y * 0.5));

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(px + 7, py + 26, 18, 4);

  if (!mature && tree.growthDays < 2) {
    // Young sapling
    ctx.fillStyle = '#7c4a21';
    ctx.fillRect(px + 15, py + 17, 3, 10);
    ctx.fillStyle = def.canopyColor;
    ctx.fillRect(px + 11 + sway, py + 11, 11, 7);
    ctx.fillRect(px + 13 + sway, py + 8, 7, 4);
    return;
  }

  if (tree.kind === 'date_fruit') {
    // Desert Date Palm
    ctx.fillStyle = '#854d0e';
    ctx.fillRect(px + 14, py + 11, 4, 16);
    ctx.fillStyle = '#a16207';
    ctx.fillRect(px + 13, py + 15, 5, 2);
    ctx.fillRect(px + 13, py + 20, 5, 2);
    // Fronds
    ctx.fillStyle = def.canopyColor;
    ctx.fillRect(px + 4 + sway, py + 5, 24, 5);
    ctx.fillRect(px + 7 + sway, py + 2, 18, 4);
    ctx.fillRect(px + 2 + sway, py + 9, 6, 4);
    ctx.fillRect(px + 24 + sway, py + 9, 6, 4);
    if (tree.hasFruit) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(px + 11 + sway, py + 11, 3, 4);
      ctx.fillRect(px + 18 + sway, py + 11, 3, 4);
    }
  } else {
    // Apple or Olive tree
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(px + 13, py + 16, 6, 11);
    ctx.fillStyle = def.canopyColor;
    ctx.fillRect(px + 5 + sway, py + 4, 22, 14);
    ctx.fillRect(px + 8 + sway, py + 1, 16, 5);
    ctx.fillStyle = tree.kind === 'olive' ? '#84a98c' : '#4ade80';
    ctx.fillRect(px + 8 + sway, py + 5, 6, 4);
    if (tree.hasFruit) {
      ctx.fillStyle = def.fruitColor;
      ctx.fillRect(px + 8 + sway, py + 9, 3, 3);
      ctx.fillRect(px + 15 + sway, py + 6, 3, 3);
      ctx.fillRect(px + 20 + sway, py + 12, 3, 3);
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(px + 21, py + 3, 2, 2);
    }
  }
}

function drawStructure(
  ctx: CanvasRenderingContext2D,
  state: GameWorldState,
  tile: FarmTile,
  px: number,
  py: number,
  timePhase: string,
  elapsedSec: number
): void {
  const s = tile.structure;
  if (!s) return;

  if (s.type === 'stone_path') {
    ctx.fillStyle = '#8b9196';
    ctx.fillRect(px + 2, py + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    ctx.fillStyle = '#a7adb3';
    ctx.fillRect(px + 4, py + 4, 10, 10);
    ctx.fillRect(px + 17, py + 5, 11, 9);
    ctx.fillRect(px + 5, py + 17, 12, 11);
    ctx.fillRect(px + 19, py + 16, 9, 12);
    return;
  }

  if (s.type === 'fence') {
    const left = getTile(state, tile.x - 1, tile.y)?.structure?.type === 'fence';
    const right = getTile(state, tile.x + 1, tile.y)?.structure?.type === 'fence';
    const up = getTile(state, tile.x, tile.y - 1)?.structure?.type === 'fence';
    const down = getTile(state, tile.x, tile.y + 1)?.structure?.type === 'fence';

    ctx.fillStyle = '#6b4426';
    // Horizontal rails
    if (left || right) {
      ctx.fillRect(left ? px : px + 10, py + 12, (left && right ? 32 : 22), 4);
      ctx.fillRect(left ? px : px + 10, py + 20, (left && right ? 32 : 22), 4);
    }
    if (up || down) {
      ctx.fillRect(px + 13, up ? py : py + 10, 6, up && down ? 32 : 22);
    }
    // Center fence post
    ctx.fillStyle = '#8c5a33';
    ctx.fillRect(px + 11, py + 6, 10, 22);
    ctx.fillStyle = '#a87246';
    ctx.fillRect(px + 12, py + 6, 8, 4);

    // Damage crack indicator
    if (s.hp < s.maxHp) {
      ctx.fillStyle = '#d9534f';
      ctx.fillRect(px + 10, py + 2, 12, 3);
    }
    return;
  }

  if (s.type === 'scarecrow') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 9, py + 25, 14, 4);
    // Wooden cross post
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(px + 14, py + 10, 4, 18);
    ctx.fillRect(px + 6, py + 13, 20, 3);
    // Coat
    ctx.fillStyle = '#4c6e91';
    ctx.fillRect(px + 10, py + 12, 12, 10);
    // Pumpkin/Burlap head & straw hat
    ctx.fillStyle = '#e0b879';
    ctx.fillRect(px + 12, py + 5, 8, 7);
    ctx.fillStyle = '#c9933b';
    ctx.fillRect(px + 8, py + 4, 16, 3);
    ctx.fillRect(px + 11, py + 1, 10, 4);
    return;
  }

  if (s.type === 'lantern') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 8, py + 25, 16, 4);
    ctx.fillStyle = '#6e757a';
    ctx.fillRect(px + 10, py + 22, 12, 5);
    ctx.fillRect(px + 13, py + 13, 6, 10);
    ctx.fillStyle = '#8f969c';
    ctx.fillRect(px + 8, py + 5, 16, 4);
    const glow = timePhase !== 'Day' ? (Math.sin(elapsedSec * 6 + tile.x) > -0.6 ? '#ffe073' : '#f2b144') : '#d4c89b';
    ctx.fillStyle = glow;
    ctx.fillRect(px + 11, py + 8, 10, 6);
    return;
  }

  if (s.type === 'flowerbed') {
    ctx.fillStyle = '#734b2e';
    ctx.fillRect(px + 3, py + 10, 26, 18);
    ctx.fillStyle = '#4e331f';
    ctx.fillRect(px + 5, py + 12, 22, 13);
    ctx.fillStyle = '#4e963e';
    ctx.fillRect(px + 7, py + 13, 18, 9);
    // Blossoms
    ctx.fillStyle = '#e86884';
    ctx.fillRect(px + 8, py + 13, 4, 4);
    ctx.fillStyle = '#f5d259';
    ctx.fillRect(px + 15, py + 15, 4, 4);
    ctx.fillStyle = '#78b8eb';
    ctx.fillRect(px + 20, py + 12, 4, 4);
    return;
  }

  if (s.type === 'sprinkler') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 9, py + 24, 14, 4);
    ctx.fillStyle = '#5a636b';
    ctx.fillRect(px + 11, py + 18, 10, 7);
    ctx.fillStyle = '#8b96a0';
    ctx.fillRect(px + 14, py + 10, 4, 10);
    // Mini Solar Cap
    ctx.fillStyle = '#255280';
    ctx.fillRect(px + 9, py + 7, 14, 4);
    ctx.fillStyle = '#4ea5e8';
    ctx.fillRect(px + 10, py + 8, 12, 2);
    // Rotating water droplets animation
    const dropletPhase = Math.sin(elapsedSec * 5 + tile.x);
    if (dropletPhase > -0.2) {
      ctx.fillStyle = '#99e1ff';
      const offset = dropletPhase > 0.4 ? 4 : 2;
      ctx.fillRect(px + 7 - offset, py + 12, 2, 2);
      ctx.fillRect(px + 23 + offset, py + 12, 2, 2);
    }
    return;
  }

  if (s.type === 'sensor') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 10, py + 25, 12, 4);
    // Probe stake
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(px + 14, py + 15, 4, 12);
    // Smart Sensor housing
    ctx.fillStyle = '#334452';
    ctx.fillRect(px + 10, py + 9, 12, 8);
    // Antenna
    ctx.fillStyle = '#97a7b3';
    ctx.fillRect(px + 15, py + 4, 2, 5);
    // Pulsing moisture status LED (green in normal, bright cyan in rain, amber in drought)
    const pulse = Math.sin(elapsedSec * 4 + tile.x * 0.7) > 0;
    const ledColor =
      state.weather === 'Drought'
        ? '#ffb347'
        : state.weather === 'Rainstorm'
        ? '#64d2ff'
        : pulse
        ? '#4cf298'
        : '#2eb86e';
    ctx.fillStyle = ledColor;
    ctx.fillRect(px + 12, py + 11, 8, 3);
    ctx.fillRect(px + 14, py + 3, 4, 2);
    return;
  }

  if (s.type === 'compost') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 4, py + 24, 24, 5);
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(px + 5, py + 10, 22, 16);
    ctx.fillStyle = '#8c5a35';
    ctx.fillRect(px + 5, py + 14, 22, 3);
    ctx.fillRect(px + 5, py + 21, 22, 3);
    // Rich dark compost top + eco sprout
    ctx.fillStyle = '#3b2516';
    ctx.fillRect(px + 7, py + 10, 18, 4);
    ctx.fillStyle = '#53a642';
    ctx.fillRect(px + 12, py + 6, 8, 5);
    ctx.fillStyle = '#84d45d';
    ctx.fillRect(px + 14, py + 4, 4, 3);
    return;
  }

  if (s.type === 'nasa_station') {
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(px + 7, py + 25, 18, 4);
    // Tripod & Mast
    ctx.fillStyle = '#6d7a88';
    ctx.fillRect(px + 9, py + 20, 3, 7);
    ctx.fillRect(px + 20, py + 20, 3, 7);
    ctx.fillStyle = '#d8e2ec';
    ctx.fillRect(px + 14, py + 6, 4, 18);
    // Satellite Dish
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(px + 8, py + 2, 12, 8);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(px + 10, py + 4, 8, 4);
    // Solar Wing & Blinking Telemetry LED
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(px + 19, py + 12, 8, 5);
    ctx.fillStyle = Math.sin(elapsedSec * 5 + tile.x) > 0 ? '#4ade80' : '#facc15';
    ctx.fillRect(px + 15, py + 1, 2, 2);
    return;
  }

  if (s.type === 'rain_tank') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 6, py + 25, 20, 4);
    // Tank body
    ctx.fillStyle = '#355873';
    ctx.fillRect(px + 6, py + 8, 20, 19);
    ctx.fillStyle = '#4f7fa3';
    ctx.fillRect(px + 8, py + 6, 16, 4);
    // Funnel lid
    ctx.fillStyle = '#253f54';
    ctx.fillRect(px + 10, py + 7, 12, 2);
    // Water level gauge (0..5 charges)
    const charges = s.storedWaterCharges ?? 0;
    ctx.fillStyle = '#1a2b38';
    ctx.fillRect(px + 12, py + 12, 8, 12);
    if (charges > 0) {
      const fillH = Math.max(2, Math.round((charges / 5) * 10));
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(px + 13, py + 23 - fillH, 6, fillH);
    }
    return;
  }

  if (s.type === 'shade_net') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.25)';
    ctx.fillRect(px + 4, py + 14, 24, 15);
    // Corner wooden poles
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(px + 3, py + 6, 3, 22);
    ctx.fillRect(px + 26, py + 6, 3, 22);
    // Woven shade canopy
    ctx.fillStyle = '#1e5f74';
    ctx.fillRect(px + 2, py + 4, 28, 11);
    ctx.fillStyle = '#38a3a5';
    ctx.fillRect(px + 4, py + 6, 6, 3);
    ctx.fillRect(px + 14, py + 6, 6, 3);
    ctx.fillRect(px + 22, py + 6, 6, 3);
    ctx.fillRect(px + 8, py + 10, 6, 3);
    ctx.fillRect(px + 18, py + 10, 6, 3);
    return;
  }

  if (s.type === 'drip_sprinkler') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 6, py + 23, 20, 4);
    // Horizontal drip pipe manifold
    ctx.fillStyle = '#334155';
    ctx.fillRect(px + 2, py + 17, 28, 4);
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(px + 11, py + 10, 10, 9);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(px + 13, py + 8, 6, 3);
    // Gentle drip droplets
    const dripY = Math.floor((elapsedSec * 6) % 3);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(px + 6, py + 21 + dripY, 2, 2);
    ctx.fillRect(px + 24, py + 21 + dripY, 2, 2);
    return;
  }

  if (s.type === 'beehive') {
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(px + 6, py + 25, 20, 4);
    // Wooden legs
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(px + 8, py + 22, 3, 5);
    ctx.fillRect(px + 21, py + 22, 3, 5);
    // Stacked golden hive boxes
    ctx.fillStyle = '#d99226';
    ctx.fillRect(px + 6, py + 9, 20, 14);
    ctx.fillStyle = '#f2b84b';
    ctx.fillRect(px + 5, py + 6, 22, 4);
    ctx.fillStyle = '#a86514';
    ctx.fillRect(px + 6, py + 14, 20, 2);
    // Entrance slot & honey glint
    ctx.fillStyle = '#2b1c12';
    ctx.fillRect(px + 13, py + 18, 6, 4);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(px + 14, py + 10, 4, 2);

    // Orbiting pixel bees!
    if (timePhase !== 'Night') {
      for (let b = 0; b < 3; b++) {
        const ang = elapsedSec * (2.6 + b * 0.7) + b * 2.1 + tile.x;
        const bx = Math.round(px + 16 + Math.cos(ang) * (10 + b * 2));
        const by = Math.round(py + 10 + Math.sin(ang * 1.4) * 6);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(bx, by, 3, 2);
        ctx.fillStyle = '#1f1610';
        ctx.fillRect(bx + 1, by, 1, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(bx + 1, by - 1, 1, 1);
      }
    }
    return;
  }

  if (s.type === 'cheese_press') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 6, py + 25, 20, 4);
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(px + 6, py + 15, 20, 12);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(px + 9, py + 12, 14, 5);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(px + 14, py + 4, 4, 9);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(px + 10, py + 4, 12, 3);
    return;
  }

  if (s.type === 'jam_maker') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 6, py + 25, 20, 4);
    ctx.fillStyle = '#7c2d12';
    ctx.fillRect(px + 6, py + 12, 20, 15);
    ctx.fillStyle = '#e11d48';
    ctx.fillRect(px + 9, py + 8, 14, 6);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(px + 11, py + 5, 10, 3);
    if (Math.sin(elapsedSec * 5 + tile.x) > 0) {
      ctx.fillStyle = '#fb923c';
      ctx.fillRect(px + 11, py + 21, 10, 3);
    }
    return;
  }

  if (s.type === 'windmill') {
    ctx.fillStyle = 'rgba(0,0,0,0.26)';
    ctx.fillRect(px + 5, py + 26, 22, 4);
    // Mill tower
    ctx.fillStyle = '#d9be8c';
    ctx.fillRect(px + 9, py + 8, 14, 20);
    ctx.fillStyle = '#b34b39';
    ctx.fillRect(px + 10, py + 3, 12, 6);
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(px + 14, py + 20, 4, 8);
    // Rotating wooden blades (2.7x faster in Windy weather!)
    const bladeSpeed = state.weather === 'Windy' ? 3.8 : 1.4;
    ctx.save();
    ctx.translate(px + 16, py + 11);
    ctx.rotate(elapsedSec * bladeSpeed + tile.x);
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(-11, -1.5, 22, 3);
    ctx.fillRect(-1.5, -11, 3, 22);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(-10, -4, 6, 3);
    ctx.fillRect(4, 1, 6, 3);
    ctx.restore();
    return;
  }

  if (s.type === 'wishing_fountain') {
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(px + 4, py + 25, 24, 4);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(px + 4, py + 15, 24, 12);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(px + 7, py + 13, 18, 4);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(px + 13, py + 6, 6, 10);
    if (Math.sin(elapsedSec * 4) > 0) {
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(px + 10, py + 10, 12, 2);
    }
    if (!state.wishedToday) {
      const glint = Math.sin(elapsedSec * 5 + tile.x) > 0 ? '#fde047' : '#fbbf24';
      ctx.fillStyle = glint;
      ctx.fillRect(px + 14, py + 2, 4, 4);
    }
    return;
  }

  if (s.type === 'greenhouse') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 3, py + 25, 26, 5);
    // Warm timber base
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(px + 3, py + 20, 26, 7);
    // Translucent emerald glass dome
    ctx.fillStyle = 'rgba(110, 231, 183, 0.45)';
    ctx.fillRect(px + 4, py + 6, 24, 15);
    ctx.fillStyle = 'rgba(209, 250, 229, 0.65)';
    ctx.fillRect(px + 7, py + 3, 18, 4);
    // Frame ribs & glass glint
    ctx.fillStyle = '#047857';
    ctx.fillRect(px + 4, py + 6, 2, 15);
    ctx.fillRect(px + 15, py + 4, 2, 17);
    ctx.fillRect(px + 26, py + 6, 2, 15);
    ctx.fillStyle = '#ecfdf5';
    ctx.fillRect(px + 8, py + 8, 4, 2);
    ctx.fillRect(px + 19, py + 11, 3, 2);
    // Tiny sprouting greenery inside
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(px + 9, py + 16, 4, 4);
    ctx.fillRect(px + 19, py + 16, 4, 4);
    return;
  }

  if (s.type === 'owl_box') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 9, py + 25, 14, 4);
    // Wooden post
    ctx.fillStyle = '#5c3a21';
    ctx.fillRect(px + 14, py + 16, 4, 12);
    // Owl nesting house
    ctx.fillStyle = '#8c5a35';
    ctx.fillRect(px + 8, py + 6, 16, 12);
    ctx.fillStyle = '#52341d';
    ctx.fillRect(px + 6, py + 4, 20, 4);
    // Hollow entrance
    ctx.fillStyle = '#1c120c';
    ctx.fillRect(px + 12, py + 10, 8, 6);
    if (timePhase === 'Night') {
      // Glowing nocturnal owl eyes!
      const blink = Math.sin(elapsedSec * 2 + tile.x) > -0.85;
      if (blink) {
        ctx.fillStyle = '#fde047';
        ctx.fillRect(px + 13, py + 12, 2, 2);
        ctx.fillRect(px + 17, py + 12, 2, 2);
      }
    }
    return;
  }

  if (s.type === 'butter_churn') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 7, py + 25, 18, 4);
    // Plunger stick
    const pump = Math.round(Math.sin(elapsedSec * 4 + tile.x) * 1.5);
    ctx.fillStyle = '#d9be8c';
    ctx.fillRect(px + 15, py + 3 + pump, 3, 10);
    ctx.fillRect(px + 12, py + 2 + pump, 9, 3);
    // Wooden churn barrel
    ctx.fillStyle = '#8c5a35';
    ctx.fillRect(px + 8, py + 12, 16, 15);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(px + 7, py + 15, 18, 2);
    ctx.fillRect(px + 7, py + 22, 18, 2);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(px + 11, py + 11, 10, 2);
    return;
  }

  if (s.type === 'tea_kettle') {
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(px + 6, py + 25, 20, 4);
    // Hearth base & copper kettle
    ctx.fillStyle = '#475569';
    ctx.fillRect(px + 6, py + 21, 20, 6);
    ctx.fillStyle = '#c2592c';
    ctx.fillRect(px + 8, py + 12, 15, 10);
    ctx.fillStyle = '#ea8c55';
    ctx.fillRect(px + 10, py + 10, 11, 4);
    // Spout & lid knob
    ctx.fillStyle = '#c2592c';
    ctx.fillRect(px + 23, py + 13, 4, 4);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(px + 14, py + 8, 3, 2);
    // Rising herbal steam wisps
    const steamY = Math.floor((elapsedSec * 8 + tile.x * 3) % 6);
    ctx.fillStyle = 'rgba(240, 253, 244, 0.8)';
    ctx.fillRect(px + 24, py + 9 - steamY, 2, 2);
    ctx.fillRect(px + 15, py + 5 - Math.floor(steamY * 0.7), 2, 2);
    return;
  }

  if (s.type === 'ladybug_house') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(px + 10, py + 26, 12, 4);
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(px + 14, py + 17, 4, 11);
    // Cute ladybug dome
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(px + 8, py + 8, 16, 10);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(px + 10, py + 5, 12, 4);
    ctx.fillRect(px + 11, py + 11, 2, 2);
    ctx.fillRect(px + 18, py + 12, 2, 2);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(px + 14, py + 14, 4, 4);
    // Tiny orbiting ladybug
    const lx = Math.round(Math.cos(elapsedSec * 3.2 + tile.x) * 9);
    const ly = Math.round(Math.sin(elapsedSec * 3.2 + tile.x) * 4);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(px + 15 + lx, py + 10 + ly, 2, 2);
    return;
  }

  if (s.type === 'cooking_stove') {
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(px + 4, py + 26, 24, 4);
    // Brick body + iron top + stewpot
    ctx.fillStyle = '#9a3412';
    ctx.fillRect(px + 5, py + 11, 22, 16);
    ctx.fillStyle = '#475569';
    ctx.fillRect(px + 4, py + 9, 24, 4);
    ctx.fillStyle = '#334155';
    ctx.fillRect(px + 10, py + 4, 12, 6);
    // Warm hearth fire flicker
    const flicker = Math.sin(elapsedSec * 11 + tile.x) > 0;
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(px + 11, py + 18, 10, 7);
    ctx.fillStyle = flicker ? '#fde047' : '#fb923c';
    ctx.fillRect(px + 13, py + 20, 6, 5);
    return;
  }

  if (s.type === 'wooden_bench') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(px + 4, py + 25, 24, 4);
    ctx.fillStyle = '#5c361a';
    ctx.fillRect(px + 6, py + 19, 3, 8);
    ctx.fillRect(px + 23, py + 19, 3, 8);
    ctx.fillStyle = '#9a5f32';
    ctx.fillRect(px + 5, py + 10, 22, 5);
    ctx.fillStyle = '#b87642';
    ctx.fillRect(px + 4, py + 16, 24, 4);
    return;
  }

  if (s.type === 'festive_lantern') {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(px + 9, py + 26, 14, 4);
    ctx.fillStyle = '#7c4a21';
    ctx.fillRect(px + 13, py + 6, 3, 21);
    ctx.fillRect(px + 13, py + 4, 9, 3);
    const sway = Math.round(Math.sin(elapsedSec * 2.5 + tile.x));
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(px + 18 + sway, py + 7, 7, 8);
    ctx.fillStyle = '#fef9c3';
    ctx.fillRect(px + 19 + sway, py + 9, 5, 4);
    return;
  }

  if (s.type === 'garden_arch') {
    // Tall floral trellis arch (walkable underneath!)
    ctx.fillStyle = '#15803d';
    ctx.fillRect(px + 3, py + 6, 4, 24);
    ctx.fillRect(px + 25, py + 6, 4, 24);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(px + 4, py + 2, 24, 6);
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(px + 7, py + 3, 4, 4);
    ctx.fillRect(px + 21, py + 4, 4, 4);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(px + 14, py + 2, 4, 4);
    return;
  }
}

function drawDailyNatureTreasure(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  kind: 'clover' | 'mushroom' | 'frost_bloom',
  elapsedSec: number
): void {
  const pulse = 0.55 + Math.sin(elapsedSec * 4) * 0.25;
  const bob = Math.round(Math.sin(elapsedSec * 3.2) * 1.5);
  ctx.save();
  // Soft shimmer ring
  ctx.fillStyle =
    kind === 'frost_bloom'
      ? `rgba(125, 211, 252, ${(pulse * 0.35).toFixed(2)})`
      : kind === 'mushroom'
      ? `rgba(251, 146, 60, ${(pulse * 0.32).toFixed(2)})`
      : `rgba(253, 224, 71, ${(pulse * 0.32).toFixed(2)})`;
  ctx.beginPath();
  ctx.arc(px + 16, py + 17, 10 + Math.sin(elapsedSec * 4) * 1.5, 0, Math.PI * 2);
  ctx.fill();

  if (kind === 'mushroom') {
    // Stem + red spotted cap
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(px + 14, py + 17 + bob, 4, 7);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(px + 9, py + 11 + bob, 14, 7);
    ctx.fillRect(px + 11, py + 9 + bob, 10, 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(px + 12, py + 12 + bob, 2, 2);
    ctx.fillRect(px + 18, py + 13 + bob, 2, 2);
  } else if (kind === 'frost_bloom') {
    // Glowing winter crystal lotus
    ctx.fillStyle = '#0ea5e9';
    ctx.fillRect(px + 14, py + 18 + bob, 4, 6);
    ctx.fillStyle = '#7dd3fc';
    ctx.fillRect(px + 10, py + 12 + bob, 12, 7);
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(px + 13, py + 9 + bob, 6, 8);
  } else {
    // Four-leaf golden-rimmed Lucky Clover
    ctx.fillStyle = '#15803d';
    ctx.fillRect(px + 15, py + 18 + bob, 2, 6);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(px + 10, py + 11 + bob, 5, 5);
    ctx.fillRect(px + 17, py + 11 + bob, 5, 5);
    ctx.fillRect(px + 10, py + 16 + bob, 5, 5);
    ctx.fillRect(px + 17, py + 16 + bob, 5, 5);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(px + 15, py + 15 + bob, 2, 2);
  }

  if (Math.sin(elapsedSec * 5.5) > 0.3) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(px + 22, py + 7 + bob, 3, 3);
  }
  ctx.restore();
}

function drawMysteryChest(
  ctx: CanvasRenderingContext2D,
  chest: MysteryChest,
  elapsedSec: number
): void {
  const px = chest.x * TILE_SIZE;
  const py = chest.y * TILE_SIZE;
  const bob = Math.round(Math.sin(elapsedSec * 3.4) * 1.5);
  const isCrystal = chest.kind === 'crystal';
  ctx.save();
  ctx.fillStyle = isCrystal ? 'rgba(56, 189, 248, 0.25)' : 'rgba(250, 204, 21, 0.24)';
  ctx.beginPath();
  ctx.arc(px + 16, py + 17, 11 + Math.sin(elapsedSec * 4) * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // Chest shadow
  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(px + 7, py + 23, 18, 4);

  // Chest base & lid
  ctx.fillStyle = isCrystal ? '#0369a1' : '#78350f';
  ctx.fillRect(px + 7, py + 13 + bob, 18, 11);
  ctx.fillStyle = isCrystal ? '#0ea5e9' : '#b45309';
  ctx.fillRect(px + 8, py + 9 + bob, 16, 6);
  // Trim bands & lock
  ctx.fillStyle = isCrystal ? '#bae6fd' : '#facc15';
  ctx.fillRect(px + 7, py + 14 + bob, 18, 2);
  ctx.fillRect(px + 14, py + 13 + bob, 4, 5);
  // Sparkle
  if (Math.sin(elapsedSec * 6) > 0) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(px + 22, py + 5 + bob, 3, 3);
  }
  ctx.restore();
}

function drawFirefly(
  ctx: CanvasRenderingContext2D,
  ff: FireflyEntity,
  elapsedSec: number
): void {
  const fx = ff.x * TILE_SIZE;
  const fy = ff.y * TILE_SIZE + Math.sin(elapsedSec * 4.2 + ff.phase) * 3;
  const glow = 0.55 + Math.sin(elapsedSec * 6.5 + ff.phase) * 0.4;
  ctx.save();
  ctx.fillStyle = `rgba(190, 242, 100, ${(glow * 0.36).toFixed(2)})`;
  ctx.beginPath();
  ctx.arc(fx, fy, 7.5 + glow * 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(254, 240, 138, ${Math.min(1, glow + 0.2).toFixed(2)})`;
  ctx.fillRect(Math.round(fx - 1.5), Math.round(fy - 1.5), 3, 3);
  ctx.restore();
}

function drawFarmerEntity(
  ctx: CanvasRenderingContext2D,
  p: Pick<
    PlayerState,
    'x' | 'y' | 'facingX' | 'facingY' | 'walkCycle' | 'swingTimer' | 'swingTool' | 'hitFlashTimer'
  >,
  elapsedSec: number,
  colorIndex = 0,
  label?: string,
  voice?: VoicePeerState,
  emote?: string,
  swiftActive = false,
  customStyle?: FarmerStyle
): void {
  const palette = PLAYER_PALETTE[colorIndex % PLAYER_PALETTE.length] ?? PLAYER_PALETTE[0];
  const outfitColors = customStyle ? getFarmerOutfitColors(customStyle) : null;
  const overallsColor = outfitColors ? outfitColors.overalls : palette.overalls;
  const shirtColor = outfitColors ? outfitColors.shirt : palette.shirt;
  const accentColor = outfitColors ? outfitColors.accent : palette.shirt;
  const hatType = customStyle?.hat ?? 'straw';
  const cx = Math.round(p.x * TILE_SIZE);
  const cy = Math.round(p.y * TILE_SIZE);
  const bob = Math.round(Math.abs(Math.sin(p.walkCycle)) * -2);

  if (swiftActive) {
    ctx.save();
    ctx.fillStyle = 'rgba(250, 204, 21, 0.28)';
    ctx.beginPath();
    ctx.arc(cx, cy - 2, 13 + Math.sin(elapsedSec * 9) * 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 11, cy - 12 + Math.round(Math.sin(elapsedSec * 10) * 3), 2, 2);
    ctx.fillRect(cx + 10, cy - 6 + Math.round(Math.cos(elapsedSec * 10) * 3), 2, 2);
    ctx.restore();
  }

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.fillRect(cx - 8, cy + 8, 16, 5);

  const flash = p.hitFlashTimer > 0 && Math.floor(elapsedSec * 24) % 2 === 0;

  // Boots
  const stride = Math.round(Math.sin(p.walkCycle) * 2);
  ctx.fillStyle = '#4d2f1a';
  ctx.fillRect(cx - 6, cy + 5 + Math.max(0, stride), 5, 5);
  ctx.fillRect(cx + 1, cy + 5 + Math.max(0, -stride), 5, 5);

  // Overalls & shirt
  ctx.fillStyle = flash ? '#ffffff' : overallsColor;
  ctx.fillRect(cx - 7, cy - 5 + bob, 14, 11);
  ctx.fillStyle = flash ? '#ffffff' : shirtColor;
  ctx.fillRect(cx - 7, cy - 8 + bob, 14, 5);

  // Head
  ctx.fillStyle = flash ? '#ffffff' : '#f2c89d';
  ctx.fillRect(cx - 6, cy - 17 + bob, 12, 10);

  // Eyes (facing aware)
  if (p.facingY >= -0.3) {
    ctx.fillStyle = '#26180f';
    const eyeOffsetX = Math.abs(p.facingX) > Math.abs(p.facingY) ? Math.sign(p.facingX) * 2 : 0;
    ctx.fillRect(cx - 3 + eyeOffsetX, cy - 13 + bob, 2, 2);
    ctx.fillRect(cx + 2 + eyeOffsetX, cy - 13 + bob, 2, 2);
  }

  // Customizable Farmer Hat
  if (hatType === 'none') {
    // Cozy warm brown hair tuft
    ctx.fillStyle = '#4a2c18';
    ctx.fillRect(cx - 6, cy - 19 + bob, 12, 3);
    ctx.fillRect(cx - 4, cy - 20 + bob, 6, 2);
  } else if (hatType === 'cap') {
    ctx.fillStyle = shirtColor;
    ctx.fillRect(cx - 6, cy - 21 + bob, 12, 5);
    ctx.fillStyle = accentColor;
    const brimX = p.facingX < -0.2 ? cx - 9 : cx - 4;
    ctx.fillRect(brimX, cy - 17 + bob, 12, 2);
  } else if (hatType === 'wizard') {
    ctx.fillStyle = '#4c1d95';
    ctx.fillRect(cx - 9, cy - 19 + bob, 18, 3);
    ctx.fillRect(cx - 6, cy - 24 + bob, 12, 5);
    ctx.fillRect(cx - 3, cy - 28 + bob, 6, 4);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 1, cy - 23 + bob, 2, 2);
  } else if (hatType === 'crown') {
    ctx.fillStyle = '#4a2c18';
    ctx.fillRect(cx - 6, cy - 19 + bob, 12, 2);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 6, cy - 22 + bob, 12, 3);
    ctx.fillRect(cx - 6, cy - 25 + bob, 2, 3);
    ctx.fillRect(cx - 1, cy - 26 + bob, 2, 4);
    ctx.fillRect(cx + 4, cy - 25 + bob, 2, 3);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx - 1, cy - 22 + bob, 2, 2);
  } else {
    // Classic Straw Sunhat with colored ribbon matching outfit
    ctx.fillStyle = '#deb15b';
    ctx.fillRect(cx - 9, cy - 19 + bob, 18, 4);
    ctx.fillStyle = '#c49139';
    ctx.fillRect(cx - 6, cy - 23 + bob, 12, 5);
    ctx.fillStyle = shirtColor;
    ctx.fillRect(cx - 6, cy - 20 + bob, 12, 2);
  }

  // Active Tool Swing Arc
  if (p.swingTimer > 0 && p.swingTool) {
    const dirX = Math.abs(p.facingX) >= Math.abs(p.facingY) ? Math.sign(p.facingX) : 0;
    const dirY = dirX === 0 ? Math.sign(p.facingY || 1) : 0;
    const tx = cx + dirX * 14;
    const ty = cy - 4 + dirY * 14;
    ctx.fillStyle = p.swingTool === 'watering_can' ? '#5ea4d4' : '#aeb6bf';
    ctx.fillRect(tx - 4, ty - 4, 8, 8);
    ctx.fillStyle = '#6b4528';
    ctx.fillRect(cx + dirX * 7 - 2, cy - 4 + dirY * 7 - 2, 4, 4);
  }

  // Floating Nameplate in Multiplayer
  if (label) {
    ctx.save();
    ctx.font = 'bold 9px "Plus Jakarta Sans", "Cairo", sans-serif';
    const metrics = ctx.measureText(label);
    const hasVoiceIcon = Boolean(voice?.enabled);
    const voicePad = hasVoiceIcon ? 10 : 0;
    const boxW = Math.ceil(metrics.width) + 8 + voicePad;
    const boxX = Math.round(cx - boxW / 2);
    const boxY = cy - 35 + bob;
    ctx.fillStyle = 'rgba(20, 14, 9, 0.78)';
    ctx.fillRect(boxX, boxY, boxW, 11);
    ctx.strokeStyle = voice?.speaking ? '#4ade80' : palette.badge;
    ctx.lineWidth = voice?.speaking ? 1.5 : 1;
    ctx.strokeRect(boxX, boxY, boxW, 11);
    ctx.fillStyle = '#fdf3dc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx - voicePad / 2, boxY + 5.5);

    if (hasVoiceIcon && voice) {
      const ix = boxX + boxW - 9;
      const iy = boxY + 3;
      if (voice.speaking) {
        const b1 = 2 + Math.round(Math.abs(Math.sin(elapsedSec * 14)) * 3);
        const b2 = 3 + Math.round(Math.abs(Math.sin(elapsedSec * 14 + 1.4)) * 3);
        const b3 = 2 + Math.round(Math.abs(Math.sin(elapsedSec * 14 + 2.8)) * 3);
        ctx.fillStyle = '#4ade80';
        ctx.fillRect(ix, iy + 5 - b1, 1.5, b1);
        ctx.fillRect(ix + 2.5, iy + 5 - b2, 1.5, b2);
        ctx.fillRect(ix + 5, iy + 5 - b3, 1.5, b3);
      } else if (voice.muted) {
        ctx.fillStyle = '#f87171';
        ctx.fillRect(ix + 2, iy + 1, 3, 4);
      } else {
        ctx.fillStyle = '#86efac';
        ctx.fillRect(ix + 2, iy + 1, 3, 4);
      }
    }
    ctx.restore();
  }

  // Floating Co-op / Cozy Emote Speech Bubble
  if (emote) {
    ctx.save();
    const floatY = Math.round(Math.sin(elapsedSec * 6) * 1.5);
    const ebY = (label ? cy - 54 : cy - 41) + bob + floatY;
    const ebX = cx - 10;
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(ebX, ebY, 20, 16);
    ctx.strokeStyle = '#3d2817';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(ebX, ebY, 20, 16);
    // Tiny speech pointer
    ctx.fillStyle = '#fffdf5';
    ctx.fillRect(cx - 2, ebY + 16, 4, 3);
    ctx.font = '11px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(emote, cx, ebY + 8.5);
    ctx.restore();
  }
}

function drawChicken(
  ctx: CanvasRenderingContext2D,
  c: FarmChicken,
  elapsedSec: number
): void {
  const cx = Math.round(c.x * TILE_SIZE);
  const cy = Math.round(c.y * TILE_SIZE);
  const hop = Math.round(Math.abs(Math.sin(c.hopPhase)) * -3);
  const peck = c.vx === 0 && c.vy === 0 && Math.sin(elapsedSec * 3 + c.id) > 0.7 ? 2 : 0;

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(cx - 5, cy + 4, 10, 3);

  // Legs
  ctx.fillStyle = '#e6942e';
  ctx.fillRect(cx - 3, cy + 2, 2, 3);
  ctx.fillRect(cx + 1, cy + 2, 2, 3);

  // Plump body
  ctx.fillStyle = '#f7f0de';
  ctx.fillRect(cx - 5, cy - 4 + hop, 10, 7);
  ctx.fillStyle = '#e3d8be';
  ctx.fillRect(cx - 4, cy - 1 + hop, 8, 3);

  // Head facing direction
  const hx = c.facingX >= 0 ? cx + 2 : cx - 6;
  ctx.fillStyle = '#f7f0de';
  ctx.fillRect(hx, cy - 8 + hop + peck, 5, 5);
  // Red comb
  ctx.fillStyle = '#d93829';
  ctx.fillRect(hx + 1, cy - 10 + hop + peck, 3, 2);
  // Beak & eye
  ctx.fillStyle = '#f2a634';
  ctx.fillRect(c.facingX >= 0 ? hx + 5 : hx - 2, cy - 6 + hop + peck, 2, 2);
  ctx.fillStyle = '#241812';
  ctx.fillRect(c.facingX >= 0 ? hx + 3 : hx + 1, cy - 7 + hop + peck, 1, 1);
}

function drawLivestock(
  ctx: CanvasRenderingContext2D,
  e: LivestockEntity,
  elapsedSec: number,
  petName?: string
): void {
  const cx = Math.round(e.x * TILE_SIZE);
  const cy = Math.round(e.y * TILE_SIZE);
  const hop = Math.round(Math.abs(Math.sin(e.hopPhase)) * -2);

  ctx.fillStyle = 'rgba(0,0,0,0.24)';
  ctx.fillRect(cx - 8, cy + 5, 16, 4);

  if (e.kind === 'cow') {
    // Dairy Cow
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 6, cy + 3, 3, 4);
    ctx.fillRect(cx + 3, cy + 3, 3, 4);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx - 8, cy - 6 + hop, 16, 10);
    // Cow spots
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 5, cy - 4 + hop, 5, 4);
    ctx.fillRect(cx + 2, cy - 2 + hop, 4, 4);
    // Head + pink snout
    const hx = e.facingX >= 0 ? cx + 5 : cx - 11;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(hx, cy - 8 + hop, 7, 7);
    ctx.fillStyle = '#f4a2b8';
    ctx.fillRect(hx + (e.facingX >= 0 ? 2 : 0), cy - 4 + hop, 5, 3);
    ctx.fillStyle = '#26180f';
    ctx.fillRect(hx + 3, cy - 6 + hop, 1, 1);
  } else if (e.kind === 'sheep') {
    // Fluffy Sheep
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 5, cy + 3, 2, 4);
    ctx.fillRect(cx + 3, cy + 3, 2, 4);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx - 7, cy - 6 + hop, 14, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 5, cy - 8 + hop, 10, 4);
    const hx = e.facingX >= 0 ? cx + 4 : cx - 9;
    ctx.fillStyle = '#334155';
    ctx.fillRect(hx, cy - 6 + hop, 6, 6);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx + (e.facingX >= 0 ? 3 : 1), cy - 4 + hop, 1, 1);
  } else if (e.kind === 'dog') {
    // Loyal Guard Dog
    const wag = Math.round(Math.sin(elapsedSec * 14) * 2);
    ctx.fillStyle = '#925828';
    ctx.fillRect(cx - 5, cy + 3, 2, 4);
    ctx.fillRect(cx + 3, cy + 3, 2, 4);
    ctx.fillStyle = '#c27a3d';
    ctx.fillRect(cx - 6, cy - 4 + hop, 12, 8);
    // Wagging tail
    ctx.fillRect(e.facingX >= 0 ? cx - 9 : cx + 6, cy - 5 + hop + wag, 3, 2);
    // Head + red collar
    const hx = e.facingX >= 0 ? cx + 3 : cx - 9;
    ctx.fillStyle = '#c27a3d';
    ctx.fillRect(hx, cy - 8 + hop, 6, 6);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx - 2, cy - 3 + hop, 5, 2);
    ctx.fillStyle = '#26180f';
    ctx.fillRect(hx + (e.facingX >= 0 ? 4 : 0), cy - 6 + hop, 2, 2);
  } else if (e.kind === 'cat') {
    // Cozy Orange Tabby Barn Cat
    const tailSway = Math.round(Math.sin(elapsedSec * 6) * 2);
    ctx.fillStyle = '#ea580c';
    ctx.fillRect(cx - 4, cy + 3, 2, 3);
    ctx.fillRect(cx + 2, cy + 3, 2, 3);
    // Body + tabby stripes
    ctx.fillStyle = '#f97316';
    ctx.fillRect(cx - 5, cy - 3 + hop, 10, 7);
    ctx.fillStyle = '#c2410c';
    ctx.fillRect(cx - 3, cy - 3 + hop, 2, 3);
    ctx.fillRect(cx + 1, cy - 3 + hop, 2, 3);
    // Curved swaying tail
    ctx.fillStyle = '#f97316';
    ctx.fillRect(e.facingX >= 0 ? cx - 8 : cx + 5, cy - 6 + hop + tailSway, 3, 4);
    // Head & pointed ears
    const hx = e.facingX >= 0 ? cx + 2 : cx - 8;
    ctx.fillStyle = '#fb923c';
    ctx.fillRect(hx, cy - 8 + hop, 6, 6);
    ctx.fillRect(hx, cy - 10 + hop, 2, 2);
    ctx.fillRect(hx + 4, cy - 10 + hop, 2, 2);
    // Green collar & eyes
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(cx - 1, cy - 3 + hop, 4, 2);
    ctx.fillStyle = '#26180f';
    ctx.fillRect(hx + (e.facingX >= 0 ? 3 : 1), cy - 6 + hop, 2, 2);
  }

  if (petName) {
    ctx.save();
    ctx.font = 'bold 8px "Plus Jakarta Sans", "Cairo", sans-serif';
    const w = Math.ceil(ctx.measureText(petName).width) + 6;
    const bx = Math.round(cx - w / 2);
    const by = cy - 22 + hop;
    ctx.fillStyle = 'rgba(20, 14, 9, 0.72)';
    ctx.fillRect(bx, by, w, 10);
    ctx.strokeStyle = e.kind === 'dog' ? '#f87171' : '#4ade80';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, w, 10);
    ctx.fillStyle = '#fdf3dc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(petName, cx, by + 5);
    ctx.restore();
  }
}

function drawWildlife(
  ctx: CanvasRenderingContext2D,
  w: WildlifeEntity,
  elapsedSec: number
): void {
  const cx = Math.round(w.x * TILE_SIZE);
  const cy = Math.round(w.y * TILE_SIZE);
  const hop = Math.round(Math.abs(Math.sin(w.hopPhase)) * -4);
  const flash = w.hitFlashTimer > 0;

  // Boar windup telegraph ring!
  if (w.kind === 'boar' && w.state === 'windup') {
    ctx.save();
    ctx.strokeStyle = 'rgba(235, 72, 60, 0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy + 4, 16 + Math.sin(elapsedSec * 25) * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(cx - 8, cy + 6, 16, 4);

  if (w.kind === 'rabbit') {
    ctx.fillStyle = flash ? '#ffffff' : '#d6cfc7';
    ctx.fillRect(cx - 5, cy - 4 + hop, 10, 9);
    // Ears
    ctx.fillRect(cx - 4, cy - 11 + hop, 3, 7);
    ctx.fillRect(cx + 1, cy - 11 + hop, 3, 7);
    ctx.fillStyle = '#e89ba3';
    ctx.fillRect(cx - 3, cy - 9 + hop, 1, 4);
    ctx.fillRect(cx + 2, cy - 9 + hop, 1, 4);
    // Eye
    ctx.fillStyle = '#241812';
    ctx.fillRect(cx + (w.facingX > 0 ? 2 : -3), cy - 2 + hop, 2, 2);
  } else {
    // Wild Boar
    ctx.fillStyle = flash ? '#ffffff' : '#5e3d2b';
    ctx.fillRect(cx - 10, cy - 7 + hop, 20, 14);
    ctx.fillStyle = flash ? '#ffffff' : '#40281b';
    ctx.fillRect(cx - 8, cy - 10 + hop, 16, 4); // bristles
    // Tusks
    const tuskX = w.facingX > 0 ? cx + 9 : cx - 12;
    ctx.fillStyle = '#f5eedc';
    ctx.fillRect(tuskX, cy + 1 + hop, 3, 3);
    // Angry red eye
    ctx.fillStyle = '#eb483c';
    ctx.fillRect(cx + (w.facingX > 0 ? 5 : -7), cy - 3 + hop, 2, 2);
  }
}

function drawVillageHut(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  realm: RealmId,
  timePhase: string
): void {
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(px + 2, py + 26, 28, 5);
  const windowLit = timePhase !== 'Day';

  if (realm === 'crystal_oasis') {
    // Sunlit desert caravan tent with teal canopy & gold trim
    ctx.fillStyle = '#0e7490';
    ctx.fillRect(px + 3, py + 8, 26, 14);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(px + 13, py + 2, 6, 7);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(px + 5, py + 19, 22, 9);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(px + 13, py + 20, 6, 8);
    ctx.fillStyle = windowLit ? '#fde047' : '#38bdf8';
    ctx.fillRect(px + 6, py + 11, 4, 4);
    ctx.fillRect(px + 22, py + 11, 4, 4);
  } else if (realm === 'sky_sanctuary') {
    // Luminous cloud marble dome pavilion
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(px + 4, py + 13, 24, 15);
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(px + 5, py + 5, 22, 9);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(px + 14, py + 2, 4, 4);
    ctx.fillStyle = '#1e1b4b';
    ctx.fillRect(px + 13, py + 20, 6, 8);
    ctx.fillStyle = windowLit ? '#fde047' : '#a5b4fc';
    ctx.fillRect(px + 7, py + 16, 4, 4);
    ctx.fillRect(px + 21, py + 16, 4, 4);
  } else {
    // Sylvan oakwood timber cottage
    ctx.fillStyle = '#8b5e34';
    ctx.fillRect(px + 4, py + 14, 24, 14);
    ctx.fillStyle = '#2d6a4f';
    ctx.fillRect(px + 2, py + 6, 28, 9);
    ctx.fillStyle = '#52b788';
    ctx.fillRect(px + 5, py + 4, 22, 3);
    ctx.fillStyle = '#4a2c16';
    ctx.fillRect(px + 13, py + 20, 6, 8);
    ctx.fillStyle = windowLit ? '#fde047' : '#fef3c7';
    ctx.fillRect(px + 6, py + 17, 4, 4);
    ctx.fillRect(px + 22, py + 17, 4, 4);
  }
}

function drawVillageElder(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  realm: RealmId,
  elapsedSec: number,
  visited: boolean
): void {
  const bob = Math.round(Math.sin(elapsedSec * 2.4) * 1.2);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.fillRect(px + 8, py + 25, 16, 4);

  const robeColor =
    realm === 'crystal_oasis' ? '#0284c7' : realm === 'sky_sanctuary' ? '#7c3aed' : '#15803d';
  const trimColor =
    realm === 'crystal_oasis' ? '#fbbf24' : realm === 'sky_sanctuary' ? '#e0e7ff' : '#bef264';

  // Robe
  ctx.fillStyle = robeColor;
  ctx.fillRect(px + 10, py + 14 + bob, 12, 13);
  ctx.fillStyle = trimColor;
  ctx.fillRect(px + 14, py + 14 + bob, 4, 12);

  // Face & Elder beard/hood
  ctx.fillStyle = '#f2c8a0';
  ctx.fillRect(px + 11, py + 6 + bob, 10, 8);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(px + 12, py + 12 + bob, 8, 4);
  ctx.fillStyle = trimColor;
  ctx.fillRect(px + 10, py + 4 + bob, 12, 3);

  // Eyes
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(px + 13, py + 9 + bob, 2, 2);
  ctx.fillRect(px + 17, py + 9 + bob, 2, 2);

  // Glowing staff
  ctx.fillStyle = '#6b4528';
  ctx.fillRect(px + 23, py + 8 + bob, 2, 18);
  ctx.fillStyle = realm === 'sky_sanctuary' ? '#c084fc' : realm === 'crystal_oasis' ? '#22d3ee' : '#fde047';
  ctx.fillRect(px + 22, py + 5 + bob, 4, 4);

  // Story indicator above elder
  if (!visited || Math.sin(elapsedSec * 4) > 0) {
    ctx.fillStyle = visited ? '#fde047' : '#38bdf8';
    ctx.fillRect(px + 14, py - 2 + bob, 4, 4);
  }
}

function drawStrangeZone(
  ctx: CanvasRenderingContext2D,
  px: number,
  py: number,
  realm: RealmId,
  elapsedSec: number,
  discovered: boolean
): void {
  const pulse = 0.45 + Math.sin(elapsedSec * 3.8) * 0.25;
  const glowColor =
    realm === 'crystal_oasis'
      ? `rgba(34, 211, 238, ${pulse.toFixed(2)})`
      : realm === 'sky_sanctuary'
      ? `rgba(192, 132, 252, ${pulse.toFixed(2)})`
      : realm === 'whispering_woods'
      ? `rgba(52, 211, 153, ${pulse.toFixed(2)})`
      : `rgba(250, 204, 21, ${pulse.toFixed(2)})`;

  ctx.save();
  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.arc(px + 16, py + 16, 13 + Math.sin(elapsedSec * 4) * 2, 0, Math.PI * 2);
  ctx.fill();

  const hover = Math.round(Math.sin(elapsedSec * 2.8) * 2);
  // Central monolith / crystal rift
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(px + 10, py + 4 + hover, 12, 22);
  ctx.fillStyle =
    realm === 'crystal_oasis'
      ? '#22d3ee'
      : realm === 'sky_sanctuary'
      ? '#c084fc'
      : realm === 'whispering_woods'
      ? '#34d399'
      : '#fbbf24';
  ctx.fillRect(px + 13, py + 7 + hover, 6, 14);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(px + 15, py + 10 + hover, 2, 6);

  // Orbiting rune sparks
  for (let i = 0; i < 3; i++) {
    const a = elapsedSec * 2.5 + (i * Math.PI * 2) / 3;
    const sx = Math.round(px + 16 + Math.cos(a) * 11);
    const sy = Math.round(py + 14 + Math.sin(a) * 5);
    ctx.fillStyle = discovered ? '#fde047' : '#ffffff';
    ctx.fillRect(sx, sy, 2, 2);
  }
  ctx.restore();
}

function drawRealmCreature(
  ctx: CanvasRenderingContext2D,
  c: RealmCreatureEntity,
  elapsedSec: number,
  nearPlayer = false
): void {
  const cx = Math.round(c.x * TILE_SIZE);
  const cy = Math.round(c.y * TILE_SIZE);
  const hop = Math.round(Math.abs(Math.sin(c.hopPhase)) * -2.5);
  const dir = c.facingX >= 0 ? 1 : -1;

  if (nearPlayer) {
    const bobHeart = Math.round(Math.sin(elapsedSec * 5 + c.id) * 2);
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(cx - 3, cy - 20 + bobHeart, 2, 2);
    ctx.fillRect(cx + 1, cy - 20 + bobHeart, 2, 2);
    ctx.fillRect(cx - 2, cy - 18 + bobHeart, 4, 2);
    ctx.fillRect(cx - 1, cy - 16 + bobHeart, 2, 1);
  }

  ctx.fillStyle = 'rgba(0,0,0,0.22)';
  ctx.fillRect(cx - 6, cy + 5, 12, 3);

  if (c.kind === 'fox' || c.kind === 'fennec') {
    const fur = c.kind === 'fox' ? '#ea580c' : '#f3d19c';
    const ear = c.kind === 'fox' ? '#9a3412' : '#f4a2b8';
    ctx.fillStyle = fur;
    ctx.fillRect(cx - 5, cy - 3 + hop, 10, 7);
    // Tail
    ctx.fillRect(dir > 0 ? cx - 9 : cx + 6, cy - 4 + hop, 4, 4);
    ctx.fillStyle = '#fff7ed';
    ctx.fillRect(dir > 0 ? cx - 9 : cx + 8, cy - 4 + hop, 2, 2);
    // Head + ears
    const hx = dir > 0 ? cx + 3 : cx - 8;
    ctx.fillStyle = fur;
    ctx.fillRect(hx, cy - 7 + hop, 6, 5);
    const earH = c.kind === 'fennec' ? 5 : 3;
    ctx.fillRect(hx, cy - 7 - earH + hop, 2, earH);
    ctx.fillRect(hx + 4, cy - 7 - earH + hop, 2, earH);
    ctx.fillStyle = ear;
    ctx.fillRect(hx + 1, cy - 6 - earH + hop, 1, Math.max(1, earH - 1));
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(hx + (dir > 0 ? 4 : 1), cy - 5 + hop, 1, 1);
  } else if (c.kind === 'deer' || c.kind === 'gazelle') {
    const coat = c.kind === 'deer' ? '#a16207' : '#eab308';
    ctx.fillStyle = '#78350f';
    ctx.fillRect(cx - 4, cy + 2, 2, 4);
    ctx.fillRect(cx + 2, cy + 2, 2, 4);
    ctx.fillStyle = coat;
    ctx.fillRect(cx - 6, cy - 6 + hop, 12, 8);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(cx - 3, cy - 4 + hop, 2, 2);
    ctx.fillRect(cx + 1, cy - 3 + hop, 2, 2);
    const hx = dir > 0 ? cx + 4 : cx - 9;
    ctx.fillStyle = coat;
    ctx.fillRect(hx, cy - 12 + hop, 5, 7);
    // Antlers / curved horns
    ctx.fillStyle = c.kind === 'deer' ? '#d97706' : '#334155';
    ctx.fillRect(hx, cy - 16 + hop, 2, 4);
    ctx.fillRect(hx + 3, cy - 16 + hop, 2, 4);
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(hx + (dir > 0 ? 3 : 1), cy - 10 + hop, 1, 1);
  } else if (c.kind === 'scarab') {
    // Iridescent crystal desert scarab
    const shimmer = Math.sin(elapsedSec * 7 + c.id) > 0 ? '#2dd4bf' : '#10b981';
    ctx.fillStyle = shimmer;
    ctx.fillRect(cx - 5, cy - 3 + hop, 10, 7);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 2, cy - 2 + hop, 4, 4);
  } else if (c.kind === 'crane') {
    // Graceful cloud crane
    ctx.fillStyle = '#475569';
    ctx.fillRect(cx - 2, cy + 1, 1, 5);
    ctx.fillRect(cx + 2, cy + 1, 1, 5);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx - 5, cy - 5 + hop, 10, 6);
    const nx = dir > 0 ? cx + 3 : cx - 5;
    ctx.fillRect(nx, cy - 13 + hop, 3, 9);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(nx + 1, cy - 14 + hop, 2, 2);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(dir > 0 ? nx + 3 : nx - 3, cy - 12 + hop, 3, 1);
  } else if (c.kind === 'alpaca') {
    // Fluffy white sky alpaca
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(cx - 5, cy + 2, 2, 4);
    ctx.fillRect(cx + 3, cy + 2, 2, 4);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 6, cy - 6 + hop, 12, 8);
    ctx.fillStyle = '#818cf8';
    ctx.fillRect(cx - 3, cy - 6 + hop, 6, 4);
    const hx = dir > 0 ? cx + 3 : cx - 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(hx, cy - 13 + hop, 5, 8);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(hx + (dir > 0 ? 3 : 1), cy - 10 + hop, 1, 1);
  } else if (c.kind === 'star_owl') {
    // Glowing cosmic owl
    const floatY = Math.round(Math.sin(elapsedSec * 3 + c.id) * 2);
    ctx.fillStyle = '#4c1d95';
    ctx.fillRect(cx - 5, cy - 8 + floatY, 10, 10);
    ctx.fillStyle = '#a78bfa';
    ctx.fillRect(cx - 3, cy - 5 + floatY, 6, 5);
    ctx.fillStyle = '#fde047';
    ctx.fillRect(cx - 3, cy - 7 + floatY, 2, 2);
    ctx.fillRect(cx + 1, cy - 7 + floatY, 2, 2);
  }
}

function drawRainOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  elapsedSec: number
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(28, 48, 74, 0.16)';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(175, 218, 245, 0.48)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 65; i++) {
    const rx = ((i * 97 + elapsedSec * 240) % (w + 80)) - 40;
    const ry = ((i * 53 + elapsedSec * 520) % (h + 60)) - 30;
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 6, ry + 14);
  }
  ctx.stroke();
  ctx.restore();
}

function drawLightingOverlay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: GameWorldState,
  camera: CameraState,
  isTitleBackdrop: boolean,
  elapsedSec: number,
  remotePlayers: RemotePlayerState[] = []
): void {
  // Compute ambient tint alpha based on timeMinutes
  const t = state.timeMinutes;
  let tintColor = 'rgba(0,0,0,0)';
  let darkness = 0;

  if (t >= SUNSET_START_MINUTES && t < NIGHT_START_MINUTES) {
    const progress = (t - SUNSET_START_MINUTES) / (NIGHT_START_MINUTES - SUNSET_START_MINUTES);
    darkness = progress * 0.34;
    tintColor = `rgba(186, 86, 48, ${progress * 0.22})`;
  } else if (t >= NIGHT_START_MINUTES) {
    const progress = Math.min(1, (t - NIGHT_START_MINUTES) / 90);
    darkness = 0.34 + progress * 0.32; // Max 0.66 darkness so farm stays readable!
  }

  if (tintColor !== 'rgba(0,0,0,0)') {
    ctx.fillStyle = tintColor;
    ctx.fillRect(0, 0, w, h);
  }

  if (darkness <= 0.02) return;

  const lCtx = getLightCtx(w, h);
  if (!lCtx || !lightCanvas) return;

  lCtx.globalCompositeOperation = 'source-over';
  lCtx.clearRect(0, 0, w, h);
  lCtx.fillStyle = `rgba(14, 18, 42, ${darkness.toFixed(3)})`;
  lCtx.fillRect(0, 0, w, h);

  // Carve warm radial light pools
  lCtx.globalCompositeOperation = 'destination-out';

  const toScreen = (wx: number, wy: number) => ({
    sx: w / 2 + camera.shakeX + (wx * TILE_SIZE - camera.x) * camera.zoom,
    sy: h / 2 + camera.shakeY + (wy * TILE_SIZE - camera.y) * camera.zoom,
  });

  const punchLight = (wx: number, wy: number, radiusTiles: number) => {
    const { sx, sy } = toScreen(wx, wy);
    const r = radiusTiles * TILE_SIZE * camera.zoom;
    const grad = lCtx.createRadialGradient(sx, sy, r * 0.12, sx, sy, r);
    grad.addColorStop(0, 'rgba(0,0,0,0.95)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    lCtx.fillStyle = grad;
    lCtx.beginPath();
    lCtx.arc(sx, sy, r, 0, Math.PI * 2);
    lCtx.fill();
  };

  // Homestead porch & shop lights
  if ((state.activeRealm ?? 'homestead') === 'homestead') {
    punchLight(FARMHOUSE_POS.x + 2, FARMHOUSE_POS.y + 2.5, 4.0);
    punchLight(SHOP_STALL_POS.x + 2.5, SHOP_STALL_POS.y + 1.5, 3.2);
  }
  // Player pocket lanterns
  if (!isTitleBackdrop) {
    const pulse = 3.4 + Math.sin(elapsedSec * 3) * 0.12;
    punchLight(state.player.x, state.player.y, pulse);
    for (const rp of remotePlayers) {
      punchLight(rp.x, rp.y, pulse);
    }
  }
  // Placed Stone Lanterns, Smart Soil Sensors, NASA Weather Stations, Wishing Fountains, Portals, Villages & Strange Zones
  for (const tile of state.tiles) {
    if (tile.terrain === 'portal') {
      punchLight(tile.x + 0.5, tile.y + 0.5, 4.4);
    } else if (tile.terrain === 'village_elder') {
      punchLight(tile.x + 0.5, tile.y + 0.5, 4.2);
    } else if (tile.terrain === 'village_hut') {
      punchLight(tile.x + 0.5, tile.y + 0.5, 3.0);
    } else if (tile.terrain === 'strange_zone') {
      punchLight(tile.x + 0.5, tile.y + 0.5, 4.6);
    } else if (tile.structure?.type === 'lantern') {
      punchLight(tile.x + 0.5, tile.y + 0.5, 4.2);
    } else if (tile.structure?.type === 'festive_lantern') {
      punchLight(tile.x + 0.5, tile.y + 0.5, 3.8);
    } else if (tile.structure?.type === 'cooking_stove') {
      punchLight(tile.x + 0.5, tile.y + 0.5, 2.6);
    } else if (tile.structure?.type === 'sensor' || tile.structure?.type === 'nasa_station') {
      punchLight(tile.x + 0.5, tile.y + 0.5, 2.1);
    } else if (tile.structure?.type === 'wishing_fountain') {
      punchLight(tile.x + 0.5, tile.y + 0.5, 3.0);
    }
  }

  ctx.drawImage(lightCanvas, 0, 0);
}

function drawLivingAmbience(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: GameWorldState,
  season: Season,
  timePhase: string,
  elapsedSec: number
): void {
  ctx.save();

  if (state.rainbowActive && timePhase !== 'Night') {
    const rainbowColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#38bdf8', '#a855f7'];
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.lineWidth = 4;
    rainbowColors.forEach((col, idx) => {
      ctx.strokeStyle = col;
      ctx.beginPath();
      ctx.arc(w * 0.5, h * 0.36, Math.min(w, h) * 0.38 - idx * 4, Math.PI, 0);
      ctx.stroke();
    });
    ctx.restore();
  }

  if (timePhase === 'Night') {
    // Warm glowing fireflies drifting across the night sky
    for (let i = 0; i < 18; i++) {
      const fx = ((i * 157 + Math.sin(elapsedSec * 0.7 + i * 1.3) * 45 + elapsedSec * 9) % (w + 40)) - 20;
      const fy = ((i * 97 + Math.cos(elapsedSec * 0.9 + i * 1.9) * 32) % (h + 40)) - 20;
      const glow = 0.35 + Math.max(0, Math.sin(elapsedSec * 3.4 + i * 1.7)) * 0.65;
      ctx.globalAlpha = glow;
      ctx.fillStyle = i % 2 === 0 ? '#fde047' : '#bef264';
      ctx.fillRect(Math.round(fx), Math.round(fy), 3, 3);
    }
    // Occasional shooting star streak across the night sky
    const cycle = elapsedSec % 9;
    if (cycle < 1.1) {
      const p = cycle / 1.1;
      const sx = w * 0.2 + p * w * 0.55;
      const sy = h * 0.08 + p * h * 0.22;
      ctx.globalAlpha = (1 - p) * 0.85;
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - 28, sy - 12);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  const activeRealm = state.activeRealm ?? 'homestead';
  if (activeRealm === 'sky_sanctuary') {
    // Twinkling celestial starlight motes & soft drifting cloud wisps above the sky islands
    for (let i = 0; i < 22; i++) {
      const sx = ((i * 149 + elapsedSec * 14) % (w + 40)) - 20;
      const sy = ((i * 83 + Math.sin(elapsedSec * 1.1 + i) * 20) % (h + 40)) - 20;
      ctx.globalAlpha = 0.42 + Math.max(0, Math.sin(elapsedSec * 3 + i * 1.3)) * 0.58;
      ctx.fillStyle = i % 2 === 0 ? '#a5b4fc' : '#fde047';
      ctx.fillRect(Math.round(sx), Math.round(sy), 3, 3);
    }
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = '#e0e7ff';
    for (let i = 0; i < 4; i++) {
      const wx = ((i * 310 + elapsedSec * 18) % (w + 160)) - 80;
      const wy = 40 + i * (h * 0.22);
      ctx.fillRect(Math.round(wx), Math.round(wy), 64, 14);
      ctx.fillRect(Math.round(wx + 12), Math.round(wy - 6), 38, 10);
    }
    ctx.restore();
    return;
  }

  if (activeRealm === 'whispering_woods') {
    // Enchanted forest pollen spores & golden sunbeam motes
    for (let i = 0; i < 18; i++) {
      const px = ((i * 137 + Math.sin(elapsedSec * 0.8 + i) * 26 + elapsedSec * 10) % (w + 30)) - 15;
      const py = ((i * 97 + Math.cos(elapsedSec * 0.6 + i) * 22) % (h + 30)) - 15;
      ctx.globalAlpha = 0.35 + Math.max(0, Math.sin(elapsedSec * 2.8 + i)) * 0.55;
      ctx.fillStyle = i % 3 === 0 ? '#fde047' : '#86efac';
      ctx.fillRect(Math.round(px), Math.round(py), 3, 3);
    }
  } else if (activeRealm === 'crystal_oasis') {
    // Shimmering desert crystal glints & sunlit sand dust
    for (let i = 0; i < 16; i++) {
      const ox = ((i * 151 + elapsedSec * 20) % (w + 30)) - 15;
      const oy = ((i * 103 + Math.sin(elapsedSec * 1.5 + i) * 16) % (h + 30)) - 15;
      ctx.globalAlpha = 0.35 + Math.max(0, Math.sin(elapsedSec * 4 + i * 1.7)) * 0.55;
      ctx.fillStyle = i % 2 === 0 ? '#67e8f9' : '#fde68a';
      ctx.fillRect(Math.round(ox), Math.round(oy), 3, 3);
    }
  }

  if (state.weather === 'Rainstorm') {
    ctx.restore();
    return;
  }

  if (season === 'Spring' || season === 'Summer') {
    // Fluttering colorful pixel butterflies
    const colors = ['#fde047', '#f472b6', '#7dd3fc', '#fb923c'];
    for (let i = 0; i < 8; i++) {
      const bx = ((i * 211 + elapsedSec * (18 + (i % 3) * 6)) % (w + 60)) - 30;
      const by = ((i * 131 + Math.sin(elapsedSec * 2.2 + i * 2) * 28) % h);
      const wing = Math.sin(elapsedSec * 14 + i) > 0 ? 3 : 1;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(Math.round(bx - wing), Math.round(by), wing, 3);
      ctx.fillRect(Math.round(bx + 1), Math.round(by), wing, 3);
      ctx.fillStyle = '#291d14';
      ctx.fillRect(Math.round(bx), Math.round(by), 1, 3);
    }
  } else if (season === 'Autumn') {
    // Drifting golden & crimson autumn leaves
    const leafColors = ['#ea580c', '#d97706', '#dc2626', '#eab308'];
    for (let i = 0; i < 16; i++) {
      const lx = ((i * 143 + elapsedSec * 26 + Math.sin(elapsedSec + i) * 18) % (w + 40)) - 20;
      const ly = ((i * 89 + elapsedSec * 32) % (h + 40)) - 20;
      ctx.fillStyle = leafColors[i % leafColors.length];
      ctx.fillRect(Math.round(lx), Math.round(ly), 4, 3);
    }
  } else {
    // Crisp Winter snowflakes
    ctx.fillStyle = 'rgba(248, 250, 252, 0.8)';
    for (let i = 0; i < 24; i++) {
      const sx = ((i * 113 + Math.sin(elapsedSec * 0.8 + i) * 20 + elapsedSec * 10) % (w + 30)) - 15;
      const sy = ((i * 79 + elapsedSec * 28) % (h + 30)) - 15;
      ctx.fillRect(Math.round(sx), Math.round(sy), i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 3 : 2);
    }
  }

  ctx.restore();
}
