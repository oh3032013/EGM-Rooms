import * as THREE from 'three';
import type { Season } from '../types';

export interface SeasonColors3D {
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
  skyDay: string;
  skySunset: string;
  skyNight: string;
  fogDay: string;
}

export const SEASON_COLORS_3D: Record<Season, SeasonColors3D> = {
  Spring: {
    grassA: '#5f9a40',
    grassB: '#538a37',
    grassTuft: '#7eb853',
    treeDark: '#234a27',
    treeMid: '#336934',
    treeLight: '#4f8c43',
    dirt: '#b08452',
    dirtSpeck: '#91673c',
    roof: '#a64332',
    roofTrim: '#cf6b55',
    skyDay: '#8ecae6',
    skySunset: '#e88d67',
    skyNight: '#0c162b',
    fogDay: '#a9d6e5',
  },
  Summer: {
    grassA: '#559438',
    grassB: '#4a8530',
    grassTuft: '#73b04a',
    treeDark: '#1c4021',
    treeMid: '#2a5c2d',
    treeLight: '#437d3d',
    dirt: '#ad7d4a',
    dirtSpeck: '#8a5f33',
    roof: '#993d2d',
    roofTrim: '#c4604b',
    skyDay: '#7cc4eb',
    skySunset: '#f08754',
    skyNight: '#0a1426',
    fogDay: '#9fd3eb',
  },
  Autumn: {
    grassA: '#948039',
    grassB: '#85722f',
    grassTuft: '#b89640',
    treeDark: '#522c1b',
    treeMid: '#8c4321',
    treeLight: '#c46925',
    dirt: '#a1774b',
    dirtSpeck: '#825d36',
    roof: '#853c2a',
    roofTrim: '#b55e40',
    skyDay: '#a4c4cf',
    skySunset: '#d96b43',
    skyNight: '#121528',
    fogDay: '#bcccd1',
  },
  Winter: {
    grassA: '#bcced0',
    grassB: '#acc0c2',
    grassTuft: '#d9e7e8',
    treeDark: '#22393a',
    treeMid: '#325254',
    treeLight: '#7ea1a0',
    dirt: '#918273',
    dirtSpeck: '#75685a',
    roof: '#677e8c',
    roofTrim: '#e8f1f5',
    skyDay: '#b8ced9',
    skySunset: '#b5849c',
    skyNight: '#091121',
    fogDay: '#cadbe3',
  },
};

function makeCanvas(size = 256): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return { canvas, ctx };
}

function finalizeColorTexture(
  canvas: HTMLCanvasElement,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/** Convert grayscale height canvas into a linear tangent-space normal map */
function createNormalTextureFromHeightCanvas(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1
): THREE.DataTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const ctx = heightCanvas.getContext('2d')!;
  const src = ctx.getImageData(0, 0, w, h).data;
  const out = new Uint8Array(w * h * 4);

  const sample = (x: number, y: number): number => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return src[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hL = sample(x - 1, y);
      const hR = sample(x + 1, y);
      const hD = sample(x, y - 1);
      const hU = sample(x, y + 1);
      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const len = Math.hypot(dx, dy, dz);
      const idx = (y * w + x) * 4;
      out[idx] = Math.round(((dx / len) * 0.5 + 0.5) * 255);
      out[idx + 1] = Math.round(((dy / len) * 0.5 + 0.5) * 255);
      out[idx + 2] = Math.round(((dz / len) * 0.5 + 0.5) * 255);
      out[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat);
  // Normal maps MUST stay linear (NoColorSpace)
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

export function createGrassTexture(pal: SeasonColors3D, anisotropy: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = pal.grassA;
  ctx.fillRect(0, 0, 256, 256);

  // Natural organic mottled meadow shading (no artificial checkerboard)
  for (let i = 0; i < 90; i++) {
    const px = (hash2d(i, 1) * 256) | 0;
    const py = (hash2d(i, 2) * 256) | 0;
    const rad = 14 + hash2d(i, 3) * 28;
    const grad = ctx.createRadialGradient(px, py, 2, px, py, rad);
    grad.addColorStop(0, i % 2 === 0 ? pal.grassB : pal.grassTuft);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // Fine grass blades & tiny clover specs
  for (let i = 0; i < 320; i++) {
    const px = (hash2d(i, 4) * 250) | 0;
    const py = (hash2d(i, 5) * 250) | 0;
    ctx.fillStyle = i % 3 === 0 ? pal.grassTuft : pal.grassB;
    ctx.fillRect(px, py, 2, 5);
    ctx.fillRect(px + 2, py + 1, 1.5, 4);
  }
  return finalizeColorTexture(canvas, anisotropy, 1, 1);
}

export function createGrassNormalMap(anisotropy: number, repeat = 1): THREE.DataTexture {
  const { canvas, ctx } = makeCanvas(128);
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 300; i++) {
    const px = (hash2d(i, 11) * 124) | 0;
    const py = (hash2d(i, 12) * 124) | 0;
    const v = 95 + ((hash2d(i, 13) * 120) | 0);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(px, py, 2, 4);
  }
  return createNormalTextureFromHeightCanvas(canvas, 1.6, anisotropy, repeat, repeat);
}

export function createDirtTexture(pal: SeasonColors3D, anisotropy: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256);
  ctx.fillStyle = pal.dirt;
  ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 240; i++) {
    const px = (hash2d(i, 21) * 248) | 0;
    const py = (hash2d(i, 22) * 248) | 0;
    ctx.fillStyle = i % 5 === 0 ? 'rgba(255,245,225,0.16)' : pal.dirtSpeck;
    ctx.beginPath();
    ctx.ellipse(px, py, 2 + (i % 4), 1.5 + (i % 3), hash2d(i, 23) * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  return finalizeColorTexture(canvas, anisotropy, 1, 1);
}

export function createTilledSoilMaps(
  watered: boolean,
  anisotropy: number
): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const { canvas, ctx } = makeCanvas(256);
  const hCanvas = makeCanvas(256);

  ctx.fillStyle = watered ? '#3d2413' : '#734b2a';
  ctx.fillRect(0, 0, 256, 256);
  hCanvas.ctx.fillStyle = '#606060';
  hCanvas.ctx.fillRect(0, 0, 256, 256);

  // Smooth sinusoidal soil ridges
  for (let y = 0; y < 256; y++) {
    const ridge = Math.sin((y / 256) * Math.PI * 10);
    const shade = Math.round(ridge * 22);
    if (shade > 0) {
      ctx.fillStyle = watered ? `rgba(115, 76, 46, ${shade / 85})` : `rgba(176, 126, 82, ${shade / 75})`;
    } else {
      ctx.fillStyle = `rgba(20, 10, 4, ${Math.abs(shade) / 65})`;
    }
    ctx.fillRect(0, y, 256, 1);

    const hVal = Math.max(0, Math.min(255, Math.round(128 + ridge * 95)));
    hCanvas.ctx.fillStyle = `rgb(${hVal},${hVal},${hVal})`;
    hCanvas.ctx.fillRect(0, y, 256, 1);
  }

  // Organic soil clods
  for (let i = 0; i < 180; i++) {
    const cx = (hash2d(i, 31) * 250) | 0;
    const cy = (hash2d(i, 32) * 250) | 0;
    const r = 1.5 + hash2d(i, 33) * 3;
    ctx.fillStyle = i % 2 === 0 ? (watered ? '#281509' : '#57361a') : (watered ? '#593720' : '#8d613b');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    const hv = i % 2 === 0 ? 70 : 210;
    hCanvas.ctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hCanvas.ctx.beginPath();
    hCanvas.ctx.arc(cx, cy, r, 0, Math.PI * 2);
    hCanvas.ctx.fill();
  }

  return {
    map: finalizeColorTexture(canvas, anisotropy, 1, 1),
    normalMap: createNormalTextureFromHeightCanvas(hCanvas.canvas, 3.2, anisotropy, 1, 1),
  };
}

export function createWoodMaps(
  baseHex: string,
  grainHex: string,
  anisotropy: number
): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const { canvas, ctx } = makeCanvas(256);
  const hCanvas = makeCanvas(256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);
  hCanvas.ctx.fillStyle = '#a0a0a0';
  hCanvas.ctx.fillRect(0, 0, 256, 256);

  // Plank seams & bevels
  for (let y = 0; y < 256; y += 64) {
    ctx.fillStyle = grainHex;
    ctx.fillRect(0, y, 256, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(0, y + 4, 256, 2);

    hCanvas.ctx.fillStyle = '#202020';
    hCanvas.ctx.fillRect(0, y, 256, 4);
    hCanvas.ctx.fillStyle = '#d0d0d0';
    hCanvas.ctx.fillRect(0, y + 4, 256, 3);
  }

  // Fine natural wood fibers
  for (let i = 0; i < 160; i++) {
    const x = (hash2d(i, 41) * 240) | 0;
    const y = (hash2d(i, 42) * 252) | 0;
    const len = 18 + ((hash2d(i, 43) * 45) | 0);
    ctx.fillStyle = grainHex;
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x, y, len, 1.5);
    hCanvas.ctx.fillStyle = i % 2 === 0 ? '#858585' : '#b8b8b8';
    hCanvas.ctx.fillRect(x, y, len, 1.5);
  }
  ctx.globalAlpha = 1;

  return {
    map: finalizeColorTexture(canvas, anisotropy, 1, 1),
    normalMap: createNormalTextureFromHeightCanvas(hCanvas.canvas, 2.5, anisotropy, 1, 1),
  };
}

export function createBarkMaps(anisotropy: number): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const { canvas, ctx } = makeCanvas(256);
  const hCanvas = makeCanvas(256);
  ctx.fillStyle = '#573b26';
  ctx.fillRect(0, 0, 256, 256);
  hCanvas.ctx.fillStyle = '#808080';
  hCanvas.ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 140; i++) {
    const x = (hash2d(i, 51) * 250) | 0;
    const y = (hash2d(i, 52) * 230) | 0;
    const w = 3 + ((hash2d(i, 53) * 5) | 0);
    const h = 24 + ((hash2d(i, 54) * 48) | 0);
    const dark = i % 2 === 0;
    ctx.fillStyle = dark ? '#3b2617' : '#6e4c32';
    ctx.fillRect(x, y, w, h);
    hCanvas.ctx.fillStyle = dark ? '#353535' : '#cfcfcf';
    hCanvas.ctx.fillRect(x, y, w, h);
  }
  return {
    map: finalizeColorTexture(canvas, anisotropy, 2, 2),
    normalMap: createNormalTextureFromHeightCanvas(hCanvas.canvas, 3.6, anisotropy, 2, 2),
  };
}

export function createStoneMaps(
  baseHex: string,
  mortarHex: string,
  anisotropy: number
): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const { canvas, ctx } = makeCanvas(256);
  const hCanvas = makeCanvas(256);
  ctx.fillStyle = mortarHex;
  ctx.fillRect(0, 0, 256, 256);
  hCanvas.ctx.fillStyle = '#282828';
  hCanvas.ctx.fillRect(0, 0, 256, 256);

  const stoneTones = [baseHex, '#8c9294', '#a4aaad', '#7c8285'];
  for (let row = 0; row < 6; row++) {
    const offset = row % 2 === 0 ? 0 : 28;
    const h = 42;
    for (let col = -1; col < 6; col++) {
      const x = col * 56 + offset + 3;
      const y = row * h + 3;
      ctx.fillStyle = stoneTones[(row * 5 + col + 8) % stoneTones.length];
      ctx.beginPath();
      ctx.roundRect(x, y, 50, h - 6, 8);
      ctx.fill();

      const elev = 185 + ((row * 17 + col * 23) % 45);
      hCanvas.ctx.fillStyle = `rgb(${elev},${elev},${elev})`;
      hCanvas.ctx.beginPath();
      hCanvas.ctx.roundRect(x, y, 50, h - 6, 8);
      hCanvas.ctx.fill();
    }
  }
  return {
    map: finalizeColorTexture(canvas, anisotropy, 1, 1),
    normalMap: createNormalTextureFromHeightCanvas(hCanvas.canvas, 3.4, anisotropy, 1, 1),
  };
}

export function createBrickMaps(anisotropy: number): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const { canvas, ctx } = makeCanvas(256);
  const hCanvas = makeCanvas(256);
  ctx.fillStyle = '#bfb6aa';
  ctx.fillRect(0, 0, 256, 256);
  hCanvas.ctx.fillStyle = '#303030';
  hCanvas.ctx.fillRect(0, 0, 256, 256);

  const tones = ['#964336', '#85392d', '#a64d3f', '#7a3328'];
  for (let row = 0; row < 8; row++) {
    const offset = row % 2 === 0 ? 0 : 32;
    for (let col = -1; col < 5; col++) {
      const x = col * 64 + offset + 3;
      const y = row * 32 + 3;
      ctx.fillStyle = tones[(row * 3 + col + 4) % tones.length];
      ctx.beginPath();
      ctx.roundRect(x, y, 58, 26, 4);
      ctx.fill();

      hCanvas.ctx.fillStyle = '#d8d8d8';
      hCanvas.ctx.beginPath();
      hCanvas.ctx.roundRect(x, y, 58, 26, 4);
      hCanvas.ctx.fill();
    }
  }
  return {
    map: finalizeColorTexture(canvas, anisotropy, 1, 2),
    normalMap: createNormalTextureFromHeightCanvas(hCanvas.canvas, 3.0, anisotropy, 1, 2),
  };
}

export function createRoofMaps(
  baseHex: string,
  trimHex: string,
  anisotropy: number
): { map: THREE.CanvasTexture; normalMap: THREE.DataTexture } {
  const { canvas, ctx } = makeCanvas(256);
  const hCanvas = makeCanvas(256);
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 256, 256);
  hCanvas.ctx.fillStyle = '#404040';
  hCanvas.ctx.fillRect(0, 0, 256, 256);

  for (let row = 0; row < 8; row++) {
    const y = row * 32;
    const offset = row % 2 === 0 ? 0 : 20;
    for (let col = -1; col < 8; col++) {
      const x = col * 40 + offset + 2;
      ctx.fillStyle = (row + col) % 3 === 0 ? baseHex : trimHex;
      ctx.beginPath();
      ctx.roundRect(x, y + 2, 36, 27, [2, 2, 10, 10]);
      ctx.fill();

      const grad = hCanvas.ctx.createLinearGradient(x, y, x, y + 28);
      grad.addColorStop(0, '#888888');
      grad.addColorStop(1, '#ececec');
      hCanvas.ctx.fillStyle = grad;
      hCanvas.ctx.beginPath();
      hCanvas.ctx.roundRect(x, y + 2, 36, 27, [2, 2, 10, 10]);
      hCanvas.ctx.fill();
    }
  }
  return {
    map: finalizeColorTexture(canvas, anisotropy, 2, 2),
    normalMap: createNormalTextureFromHeightCanvas(hCanvas.canvas, 3.2, anisotropy, 2, 2),
  };
}

export function createWaterNormalMap(anisotropy: number): THREE.DataTexture {
  const { canvas, ctx } = makeCanvas(128);
  const img = ctx.createImageData(128, 128);
  for (let y = 0; y < 128; y++) {
    for (let x = 0; x < 128; x++) {
      const u = (x / 128) * Math.PI * 2;
      const v = (y / 128) * Math.PI * 2;
      const wave =
        Math.sin(u * 3 + v * 2) * 0.4 +
        Math.cos(u * 2 - v * 4) * 0.35 +
        Math.sin(u * 5 + v * 5) * 0.25;
      const val = Math.max(0, Math.min(255, Math.round(128 + wave * 90)));
      const idx = (y * 128 + x) * 4;
      img.data[idx] = val;
      img.data[idx + 1] = val;
      img.data[idx + 2] = val;
      img.data[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return createNormalTextureFromHeightCanvas(canvas, 2.2, anisotropy, 2, 2);
}

export function createWatermelonTexture(anisotropy: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128);
  ctx.fillStyle = '#3c8d35';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1d4d1a';
  for (let x = 0; x < 128; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x + 4, 0);
    ctx.bezierCurveTo(x + 12, 42, x - 2, 84, x + 6, 128);
    ctx.lineTo(x + 11, 128);
    ctx.bezierCurveTo(x + 3, 84, x + 17, 42, x + 9, 0);
    ctx.closePath();
    ctx.fill();
  }
  return finalizeColorTexture(canvas, anisotropy, 1, 1);
}

export function createAwningTexture(anisotropy: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(256);
  for (let x = 0; x < 256; x += 64) {
    const isRed = (x / 64) % 2 === 0;
    ctx.fillStyle = isRed ? '#bf382c' : '#f5e8ce';
    ctx.fillRect(x, 0, 64, 256);
    ctx.fillStyle = isRed ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
    ctx.fillRect(x, 0, 6, 256);
  }
  return finalizeColorTexture(canvas, anisotropy, 2, 1);
}

export function createStumpRingTexture(anisotropy: number): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(128);
  ctx.fillStyle = '#d9b07e';
  ctx.fillRect(0, 0, 128, 128);
  for (let r = 56; r >= 8; r -= 8) {
    ctx.beginPath();
    ctx.arc(64, 64, r, 0, Math.PI * 2);
    ctx.strokeStyle = r % 16 === 0 ? '#b68955' : '#966838';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }
  return finalizeColorTexture(canvas, anisotropy, 1, 1);
}

export class MaterialLibrary {
  private readonly anisotropy: number;
  private readonly isSoftwareGl: boolean;
  private readonly textures: THREE.Texture[] = [];
  private readonly materials = new Map<string, THREE.Material>();
  private currentSeason: Season | null = null;

  public grassMat!: THREE.MeshStandardMaterial;
  public grassOuterMat!: THREE.MeshStandardMaterial;
  public dirtMat!: THREE.MeshStandardMaterial;
  public tilledDryMat!: THREE.MeshStandardMaterial;
  public tilledWetMat!: THREE.MeshStandardMaterial;
  public tilledDroughtMat!: THREE.MeshStandardMaterial;
  public waterMat!: THREE.MeshPhysicalMaterial;
  public waterNormalTex!: THREE.DataTexture;
  public treeDarkMat!: THREE.MeshStandardMaterial;
  public treeMidMat!: THREE.MeshStandardMaterial;
  public treeLightMat!: THREE.MeshStandardMaterial;
  public barkMat!: THREE.MeshStandardMaterial;
  public roofMat!: THREE.MeshStandardMaterial;
  public roofTrimMat!: THREE.MeshStandardMaterial;
  public woodMat!: THREE.MeshStandardMaterial;
  public darkWoodMat!: THREE.MeshStandardMaterial;
  public stoneMat!: THREE.MeshStandardMaterial;
  public brickMat!: THREE.MeshStandardMaterial;
  public plasterMat!: THREE.MeshStandardMaterial;
  public stumpTopMat!: THREE.MeshStandardMaterial;
  public watermelonMat!: THREE.MeshStandardMaterial;
  public ironMat!: THREE.MeshStandardMaterial;
  public copperMat!: THREE.MeshStandardMaterial;
  public brassMat!: THREE.MeshPhysicalMaterial;
  public glassGlowMat!: THREE.MeshStandardMaterial;
  public awningMat!: THREE.MeshStandardMaterial;
  public contactShadowMat!: THREE.MeshBasicMaterial;

  constructor(anisotropy: number, isSoftwareGl: boolean) {
    this.anisotropy = Math.max(1, anisotropy);
    this.isSoftwareGl = isSoftwareGl;
    this.initShared();
    this.applySeason('Spring');
  }

  private trackTex<T extends THREE.Texture>(tex: T): T {
    this.textures.push(tex);
    return tex;
  }

  private trackMat<T extends THREE.Material>(key: string, mat: T): T {
    this.materials.set(key, mat);
    return mat;
  }

  private initShared(): void {
    const wood = createWoodMaps('#8f5d38', '#663d1e', this.anisotropy);
    this.trackTex(wood.map);
    this.trackTex(wood.normalMap);

    const darkWood = createWoodMaps('#5c3a21', '#3b210f', this.anisotropy);
    this.trackTex(darkWood.map);
    this.trackTex(darkWood.normalMap);

    const bark = createBarkMaps(this.anisotropy);
    this.trackTex(bark.map);
    this.trackTex(bark.normalMap);

    const stone = createStoneMaps('#969c9e', '#5d6366', this.anisotropy);
    this.trackTex(stone.map);
    this.trackTex(stone.normalMap);

    const brick = createBrickMaps(this.anisotropy);
    this.trackTex(brick.map);
    this.trackTex(brick.normalMap);

    const drySoil = createTilledSoilMaps(false, this.anisotropy);
    this.trackTex(drySoil.map);
    this.trackTex(drySoil.normalMap);

    const wetSoil = createTilledSoilMaps(true, this.anisotropy);
    this.trackTex(wetSoil.map);
    this.trackTex(wetSoil.normalMap);

    const grassNormal = this.trackTex(createGrassNormalMap(this.anisotropy, 1));
    const outerGrassNormal = this.trackTex(createGrassNormalMap(this.anisotropy, 24));
    this.waterNormalTex = this.trackTex(createWaterNormalMap(this.anisotropy));

    const awningTex = this.trackTex(createAwningTexture(this.anisotropy));
    const stumpRingTex = this.trackTex(createStumpRingTexture(this.anisotropy));
    const melonTex = this.trackTex(createWatermelonTexture(this.anisotropy));

    this.grassMat = this.trackMat(
      'grass',
      new THREE.MeshStandardMaterial({
        normalMap: grassNormal,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 0.92,
        metalness: 0.0,
      })
    );
    this.grassOuterMat = this.trackMat(
      'grassOuter',
      new THREE.MeshStandardMaterial({
        normalMap: outerGrassNormal,
        normalScale: new THREE.Vector2(0.45, 0.45),
        roughness: 0.95,
        metalness: 0.0,
      })
    );
    this.dirtMat = this.trackMat(
      'dirt',
      new THREE.MeshStandardMaterial({
        normalMap: grassNormal,
        normalScale: new THREE.Vector2(0.35, 0.35),
        roughness: 0.9,
        metalness: 0.0,
      })
    );
    this.tilledDryMat = this.trackMat(
      'tilledDry',
      new THREE.MeshStandardMaterial({
        map: drySoil.map,
        normalMap: drySoil.normalMap,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughness: 0.94,
        metalness: 0.0,
      })
    );
    this.tilledWetMat = this.trackMat(
      'tilledWet',
      new THREE.MeshStandardMaterial({
        map: wetSoil.map,
        normalMap: wetSoil.normalMap,
        normalScale: new THREE.Vector2(1.1, 1.1),
        roughness: 0.32,
        metalness: 0.06,
      })
    );
    this.tilledDroughtMat = this.trackMat(
      'tilledDrought',
      new THREE.MeshStandardMaterial({
        map: drySoil.map,
        normalMap: drySoil.normalMap,
        normalScale: new THREE.Vector2(1.0, 1.0),
        color: new THREE.Color('#d19c64'),
        roughness: 0.98,
        metalness: 0.0,
      })
    );
    this.waterMat = this.trackMat(
      'water',
      new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#2782c4'),
        normalMap: this.waterNormalTex,
        normalScale: new THREE.Vector2(0.38, 0.38),
        roughness: 0.08,
        metalness: 0.05,
        clearcoat: 0.9,
        clearcoatRoughness: 0.1,
        transmission: this.isSoftwareGl ? 0 : 0.48,
        transparent: true,
        opacity: this.isSoftwareGl ? 0.82 : 0.9,
        ior: 1.33,
        thickness: 0.5,
      })
    );
    this.treeDarkMat = this.trackMat(
      'treeDark',
      new THREE.MeshStandardMaterial({ roughness: 0.88, metalness: 0.0 })
    );
    this.treeMidMat = this.trackMat(
      'treeMid',
      new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0.0 })
    );
    this.treeLightMat = this.trackMat(
      'treeLight',
      new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.0 })
    );
    this.barkMat = this.trackMat(
      'bark',
      new THREE.MeshStandardMaterial({
        map: bark.map,
        normalMap: bark.normalMap,
        normalScale: new THREE.Vector2(0.9, 0.9),
        roughness: 0.92,
        metalness: 0.0,
      })
    );
    this.roofMat = this.trackMat(
      'roof',
      new THREE.MeshStandardMaterial({ roughness: 0.72, metalness: 0.04 })
    );
    this.roofTrimMat = this.trackMat(
      'roofTrim',
      new THREE.MeshStandardMaterial({ roughness: 0.65, metalness: 0.05 })
    );
    this.woodMat = this.trackMat(
      'wood',
      new THREE.MeshStandardMaterial({
        map: wood.map,
        normalMap: wood.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 0.82,
        metalness: 0.04,
      })
    );
    this.darkWoodMat = this.trackMat(
      'darkWood',
      new THREE.MeshStandardMaterial({
        map: darkWood.map,
        normalMap: darkWood.normalMap,
        normalScale: new THREE.Vector2(0.85, 0.85),
        roughness: 0.84,
        metalness: 0.05,
      })
    );
    this.stoneMat = this.trackMat(
      'stone',
      new THREE.MeshStandardMaterial({
        map: stone.map,
        normalMap: stone.normalMap,
        normalScale: new THREE.Vector2(1.0, 1.0),
        roughness: 0.88,
        metalness: 0.06,
      })
    );
    this.brickMat = this.trackMat(
      'brick',
      new THREE.MeshStandardMaterial({
        map: brick.map,
        normalMap: brick.normalMap,
        normalScale: new THREE.Vector2(0.95, 0.95),
        roughness: 0.9,
        metalness: 0.02,
      })
    );
    this.plasterMat = this.trackMat(
      'plaster',
      new THREE.MeshStandardMaterial({
        color: '#f4e8d1',
        normalMap: grassNormal,
        normalScale: new THREE.Vector2(0.2, 0.2),
        roughness: 0.88,
        metalness: 0.0,
      })
    );
    this.stumpTopMat = this.trackMat(
      'stumpTop',
      new THREE.MeshStandardMaterial({ map: stumpRingTex, roughness: 0.82, metalness: 0.0 })
    );
    this.watermelonMat = this.trackMat(
      'watermelon',
      new THREE.MeshStandardMaterial({
        map: melonTex,
        roughness: 0.36,
        metalness: 0.02,
      })
    );
    this.ironMat = this.trackMat(
      'iron',
      new THREE.MeshStandardMaterial({ color: '#3b424d', roughness: 0.32, metalness: 0.86 })
    );
    this.copperMat = this.trackMat(
      'copper',
      new THREE.MeshStandardMaterial({ color: '#cf7d44', roughness: 0.24, metalness: 0.9 })
    );
    this.brassMat = this.trackMat(
      'brass',
      new THREE.MeshPhysicalMaterial({
        color: '#f2c14e',
        roughness: 0.2,
        metalness: 0.94,
        anisotropy: 0.65,
      })
    );
    this.glassGlowMat = this.trackMat(
      'glassGlow',
      new THREE.MeshStandardMaterial({
        color: '#ffe89e',
        emissive: new THREE.Color('#ffaf38'),
        emissiveIntensity: 0.2,
        roughness: 0.14,
        metalness: 0.1,
      })
    );
    this.awningMat = this.trackMat(
      'awning',
      new THREE.MeshPhysicalMaterial({
        map: awningTex,
        roughness: 0.82,
        metalness: 0.0,
        sheen: 0.4,
        sheenRoughness: 0.7,
        side: THREE.DoubleSide,
      })
    );

    const shadowCanvas = makeCanvas(64);
    const grad = shadowCanvas.ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
    grad.addColorStop(0, 'rgba(15, 10, 6, 0.45)');
    grad.addColorStop(1, 'rgba(15, 10, 6, 0)');
    shadowCanvas.ctx.fillStyle = grad;
    shadowCanvas.ctx.fillRect(0, 0, 64, 64);
    const shadowTex = this.trackTex(finalizeColorTexture(shadowCanvas.canvas, 1));
    this.contactShadowMat = this.trackMat(
      'contactShadow',
      new THREE.MeshBasicMaterial({
        map: shadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.9,
      })
    );
  }

  public getSolid(hex: string, roughness = 0.75, metalness = 0.05): THREE.MeshStandardMaterial {
    const key = `solid:${hex}:${roughness.toFixed(2)}:${metalness.toFixed(2)}`;
    const cached = this.materials.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const mat = new THREE.MeshStandardMaterial({ color: hex, roughness, metalness });
    return this.trackMat(key, mat);
  }

  public getFabric(hex: string, roughness = 0.88): THREE.MeshPhysicalMaterial {
    const key = `fabric:${hex}:${roughness.toFixed(2)}`;
    const cached = this.materials.get(key) as THREE.MeshPhysicalMaterial | undefined;
    if (cached) return cached;
    const mat = new THREE.MeshPhysicalMaterial({
      color: hex,
      roughness,
      metalness: 0.0,
      sheen: 0.45,
      sheenRoughness: 0.75,
    });
    return this.trackMat(key, mat);
  }

  public getTransparent(
    hex: string,
    opacity = 0.75,
    roughness = 0.75
  ): THREE.MeshStandardMaterial {
    const key = `trans:${hex}:${opacity.toFixed(2)}:${roughness.toFixed(2)}`;
    const cached = this.materials.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      transparent: true,
      opacity,
      roughness,
      side: THREE.DoubleSide,
    });
    return this.trackMat(key, mat);
  }

  public getEmissive(hex: string, emissiveHex: string, intensity = 0.9): THREE.MeshStandardMaterial {
    const key = `emissive:${hex}:${emissiveHex}:${intensity.toFixed(2)}`;
    const cached = this.materials.get(key) as THREE.MeshStandardMaterial | undefined;
    if (cached) return cached;
    const mat = new THREE.MeshStandardMaterial({
      color: hex,
      emissive: new THREE.Color(emissiveHex),
      emissiveIntensity: intensity,
      roughness: 0.3,
      metalness: 0.1,
    });
    return this.trackMat(key, mat);
  }

  public applySeason(season: Season): SeasonColors3D {
    const pal = SEASON_COLORS_3D[season];
    if (this.currentSeason === season) return pal;
    this.currentSeason = season;

    const grassTex = this.trackTex(createGrassTexture(pal, this.anisotropy));
    const outerGrassTex = this.trackTex(createGrassTexture(pal, this.anisotropy));
    outerGrassTex.repeat.set(24, 24);
    const dirtTex = this.trackTex(createDirtTexture(pal, this.anisotropy));
    const roofMaps = createRoofMaps(pal.roof, pal.roofTrim, this.anisotropy);
    this.trackTex(roofMaps.map);
    this.trackTex(roofMaps.normalMap);

    this.grassMat.map = grassTex;
    this.grassMat.needsUpdate = true;
    this.grassOuterMat.map = outerGrassTex;
    this.grassOuterMat.color.set(pal.grassB);
    this.grassOuterMat.needsUpdate = true;
    this.dirtMat.map = dirtTex;
    this.dirtMat.needsUpdate = true;
    this.roofMat.map = roofMaps.map;
    this.roofMat.normalMap = roofMaps.normalMap;
    this.roofMat.normalScale.set(0.95, 0.95);
    this.roofMat.needsUpdate = true;
    this.roofTrimMat.color.set(pal.roofTrim);

    this.treeDarkMat.color.set(pal.treeDark);
    this.treeMidMat.color.set(pal.treeMid);
    this.treeLightMat.color.set(pal.treeLight);

    return pal;
  }

  public setNightWindowGlow(nightFactor: number): void {
    this.glassGlowMat.emissiveIntensity = 0.15 + nightFactor * 1.45;
  }

  public dispose(): void {
    for (const tex of this.textures) {
      tex.dispose();
    }
    this.textures.length = 0;
    for (const mat of this.materials.values()) {
      mat.dispose();
    }
    this.materials.clear();
  }
}
