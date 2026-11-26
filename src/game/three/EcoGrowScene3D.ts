import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
  FARMHOUSE_POS,
  NIGHT_START_MINUTES,
  SHIPPING_BIN_POS,
  SHOP_STALL_POS,
  SUNSET_START_MINUTES,
  TILE_SIZE,
  WELL_POS,
} from '../constants';
import { PLAYER_PALETTE, type RemotePlayerState, type VoicePeerState } from '../multiplayer';
import { getSeason, getTile, getTimePhase } from '../rules';
import type {
  FloatingText,
  GameWorldState,
  ItemId,
  Particle,
  Season,
  ToolType,
} from '../types';
import { MaterialLibrary, SEASON_COLORS_3D } from './materials';
import {
  createChickenGroup,
  createCowGroup,
  createCropGroup,
  createDogGroup,
  createFarmerRig,
  createFarmhouseGroup,
  createObstacleGroup,
  createSheepGroup,
  createShippingBinGroup,
  createShopStallGroup,
  createStructureGroup,
  createTreasureGroup,
  createWellGroup,
  createWildlifeGroup,
  GeometryCache,
  getInstancedTreeTemplates,
  type FarmerModelRig,
} from './models';

export interface CameraState {
  x: number; // logical world pixel center
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
}

// Pre-allocated scratch math objects (zero GC in animation loop)
const _v3A = new THREE.Vector3();
const _v3B = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _scale = new THREE.Vector3(1, 1, 1);
const _colorA = new THREE.Color();
const _colorB = new THREE.Color();
const _raycaster = new THREE.Raycaster();
const _ndc = new THREE.Vector2();
const _groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const _hitPoint = new THREE.Vector3();

function detectGpuProfile(): { isSoftwareGl: boolean; isMobileGpu: boolean } {
  if (typeof document === 'undefined') {
    return { isSoftwareGl: false, isMobileGpu: false };
  }
  const uaMobile =
    typeof navigator !== 'undefined' &&
    (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(
      navigator.userAgent
    ) ||
      (navigator.maxTouchPoints > 1 && window.innerWidth <= 1024));

  let isSoftwareGl = false;
  let gpuMobile = false;
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) {
      isSoftwareGl = true;
    } else {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param) || '');
      isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      gpuMobile = /Adreno|Mali|PowerVR|Immortalis|Xclipse|Tegra|Apple GPU/i.test(gpu);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    isSoftwareGl = false;
  }

  return {
    isSoftwareGl,
    isMobileGpu: uaMobile || (gpuMobile && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0),
  };
}

function makeBillboardSprite(text: string, colorHex: string, bgColor?: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(16, 10, 224, 44, 10);
    ctx.fill();
  }

  ctx.font = 'bold 26px "Plus Jakarta Sans", "Cairo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(18, 12, 8, 0.9)';
  ctx.strokeText(text, 128, 33);
  ctx.fillStyle = colorHex;
  ctx.fillText(text, 128, 33);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(2.1, 0.52, 1);
  sprite.renderOrder = 25;
  return sprite;
}

function updateBillboardTexture(
  sprite: THREE.Sprite,
  text: string,
  colorHex: string,
  bgColor?: string
): void {
  const mat = sprite.material as THREE.SpriteMaterial;
  const oldTex = mat.map as THREE.CanvasTexture | null;
  const canvas = (oldTex?.image as HTMLCanvasElement | undefined) ?? document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, 256, 64);

  if (bgColor) {
    ctx.fillStyle = bgColor;
    ctx.beginPath();
    ctx.roundRect(16, 10, 224, 44, 10);
    ctx.fill();
  }

  ctx.font = 'bold 26px "Plus Jakarta Sans", "Cairo", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(18, 12, 8, 0.9)';
  ctx.strokeText(text, 128, 33);
  ctx.fillStyle = colorHex;
  ctx.fillText(text, 128, 33);

  if (oldTex) {
    oldTex.needsUpdate = true;
  } else {
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    mat.map = tex;
    mat.needsUpdate = true;
  }
}

export class EcoGrowScene3D {
  public readonly renderer: THREE.WebGLRenderer;
  public readonly isSoftwareGl: boolean;
  public readonly isMobileGpu: boolean;
  private readonly container: HTMLElement;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly mats: MaterialLibrary;
  private readonly geos = new GeometryCache();
  private envTexture: THREE.Texture | null = null;

  // Lighting & Atmosphere
  private readonly hemiLight: THREE.HemisphereLight;
  private readonly sunLight: THREE.DirectionalLight;
  private readonly shadowHalfExtent: number;
  private readonly shadowMapSize: number;
  private readonly porchLight: THREE.PointLight;
  private readonly lanternLights: THREE.PointLight[] = [];
  private readonly lanternSpotsX = new Float32Array(4);
  private readonly lanternSpotsZ = new Float32Array(4);
  private readonly fog: THREE.FogExp2;

  // World groups
  private readonly terrainGroup = new THREE.Group();
  private readonly staticPropsGroup = new THREE.Group();
  private readonly dynamicPropsGroup = new THREE.Group();
  private readonly actorsGroup = new THREE.Group();
  private readonly fxGroup = new THREE.Group();

  private outerGround!: THREE.Mesh;
  private baseTerrainBuiltKey = '';
  private waterInstanced: THREE.InstancedMesh | null = null;
  private waterCoordsX: number[] = [];
  private waterCoordsZ: number[] = [];

  // Instanced tilled soil layers (0 allocations, max 4 draw calls for entire farm)
  private tilledDryInst!: THREE.InstancedMesh;
  private tilledWetInst!: THREE.InstancedMesh;
  private tilledDroughtInst!: THREE.InstancedMesh;
  private beanRingInst!: THREE.InstancedMesh;
  private prevTilledCode = new Uint8Array(0);
  private tilledDirty = true;

  // Numeric-indexed tile props (no string keys or Set allocations)
  private tilePropGroups = new Map<number, { sig: string; animType?: string; group: THREE.Group }>();
  private tileSeenStamp = new Int32Array(0);
  private syncEpoch = 1;
  private animatedStructures: { type: string; group: THREE.Group }[] = [];
  private treasureProp: { key: string; group: THREE.Group } | null = null;

  // Actors
  private localFarmer: FarmerModelRig;
  private localLabelSprite: THREE.Sprite | null = null;
  private localLabelSig = '';
  private remoteFarmers = new Map<string, { rig: FarmerModelRig; label: THREE.Sprite; labelSig: string }>();
  private chickens = new Map<number, THREE.Group>();
  private cows = new Map<number, THREE.Group>();
  private sheep = new Map<number, THREE.Group>();
  private dogGroup: THREE.Group | null = null;
  private wildlife = new Map<number, { kind: string; group: THREE.Group }>();
  private readonly scratchIdSet = new Set<string>();
  private readonly scratchNumSet = new Set<number>();

  // Weather, Sky, Rainbow, Cursors & Particles
  private rainbowGroup: THREE.Group;
  private rainMesh: THREE.InstancedMesh;
  private readonly rainMaxCount: number;
  private ambientSpecMesh: THREE.InstancedMesh;
  private lastAmbientColorKey = '';
  private particleMesh: THREE.InstancedMesh;
  private hoverCursor: THREE.Mesh;
  private facingCursor: THREE.Mesh;
  private floatingSprites = new Map<number, { sprite: THREE.Sprite; text: string }>();

  // Adaptive Dynamic Resolution Scaling (keeps Android sharp & thermal-safe)
  private currentDpr: number;
  private readonly minDpr: number;
  private readonly maxDpr: number;
  private lastRenderTs = 0;
  private avgFrameMs = 16.6;
  private drsWarmupFrames = 0;
  private drsCooldown = 0;
  private frameCounter = 0;
  private lastShadowCamX = 9999;
  private lastShadowCamZ = 9999;

  // User camera interaction offsets
  public userZoomMultiplier = 1.0;
  public cameraYaw = 0; // -0.6..0.6 rad optional subtle yaw

  private compiledOnce = false;
  private disposed = false;

  constructor(container: HTMLElement) {
    this.container = container;
    const profile = detectGpuProfile();
    this.isSoftwareGl = profile.isSoftwareGl;
    this.isMobileGpu = profile.isMobileGpu;

    const nativeDpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.minDpr = this.isSoftwareGl ? 1 : this.isMobileGpu ? 1.0 : 1.25;
    this.maxDpr = this.isSoftwareGl ? 1 : Math.min(nativeDpr, this.isMobileGpu ? 1.55 : 2.0);
    this.currentDpr = this.isSoftwareGl
      ? 1
      : Math.min(nativeDpr, this.isMobileGpu ? 1.35 : 1.75);

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.setPixelRatio(this.currentDpr);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = this.isMobileGpu ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
    if (this.isMobileGpu && !this.isSoftwareGl) {
      this.renderer.shadowMap.autoUpdate = false;
    }
    this.renderer.domElement.className = 'block w-full h-full cursor-crosshair select-none';
    this.renderer.domElement.setAttribute('data-testid', 'farm-canvas');
    this.container.appendChild(this.renderer.domElement);

    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.mats = new MaterialLibrary(maxAniso, this.isSoftwareGl, this.isMobileGpu);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#8ecae6');
    this.fog = new THREE.FogExp2('#a9d6e5', 0.016);
    this.scene.fog = this.fog;

    // Studio procedural PMREM environment for crisp PBR metals & water
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const pmremRT = pmremGenerator.fromScene(roomEnv, 0.04);
    this.envTexture = pmremRT.texture;
    this.scene.environment = this.envTexture;
    roomEnv.dispose();
    pmremGenerator.dispose();

    const rect = this.container.getBoundingClientRect();
    const aspect = Math.max(0.5, rect.width / Math.max(1, rect.height));
    this.camera = new THREE.PerspectiveCamera(40, aspect, 0.5, 140);
    this.camera.position.set(14, 11, 20);

    // 3-Point + Dynamic Sky Lighting Rig
    this.hemiLight = new THREE.HemisphereLight('#b5e2fa', '#785a3c', 0.85);
    this.scene.add(this.hemiLight);

    this.shadowMapSize = this.isMobileGpu ? 1024 : 1536;
    this.shadowHalfExtent = this.isMobileGpu ? 10.5 : 12.5;
    this.sunLight = new THREE.DirectionalLight('#fff3d6', 2.05);
    this.sunLight.position.set(22, 26, 18);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(this.shadowMapSize, this.shadowMapSize);
    this.sunLight.shadow.radius = this.isMobileGpu ? 1.5 : 2.0;
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 65;
    this.sunLight.shadow.camera.left = -this.shadowHalfExtent;
    this.sunLight.shadow.camera.right = this.shadowHalfExtent;
    this.sunLight.shadow.camera.top = this.shadowHalfExtent;
    this.sunLight.shadow.camera.bottom = -this.shadowHalfExtent;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.025;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.porchLight = new THREE.PointLight('#ffaa44', 0, 8, 1.8);
    this.porchLight.position.set(
      FARMHOUSE_POS.x + FARMHOUSE_POS.w / 2,
      1.7,
      FARMHOUSE_POS.y + FARMHOUSE_POS.h + 0.5
    );
    this.scene.add(this.porchLight);

    const maxLanternLights = this.isMobileGpu ? 2 : 3;
    for (let i = 0; i < maxLanternLights; i++) {
      const pl = new THREE.PointLight('#ffb74d', 0, 7, 1.8);
      pl.position.set(0, 1.1, 0);
      this.scene.add(pl);
      this.lanternLights.push(pl);
    }

    this.scene.add(this.terrainGroup);
    this.scene.add(this.staticPropsGroup);
    this.scene.add(this.dynamicPropsGroup);
    this.scene.add(this.actorsGroup);
    this.scene.add(this.fxGroup);

    // Pooled Instanced Tilled Soil Pads (max 560 tiles -> 1-4 draw calls total!)
    const tilledGeo = this.geos.get('tilled_pad_v2', () => {
      const s = new THREE.Shape();
      const hw = 0.42;
      s.moveTo(-hw + 0.06, -hw);
      s.lineTo(hw - 0.06, -hw);
      s.quadraticCurveTo(hw, -hw, hw, -hw + 0.06);
      s.lineTo(hw, hw - 0.06);
      s.quadraticCurveTo(hw, hw, hw - 0.06, hw);
      s.lineTo(-hw + 0.06, hw);
      s.quadraticCurveTo(-hw, hw, -hw, hw - 0.06);
      s.lineTo(-hw, -hw + 0.06);
      s.quadraticCurveTo(-hw, -hw, -hw + 0.06, -hw);
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: 0.032,
        bevelEnabled: true,
        bevelThickness: 0.015,
        bevelSize: 0.025,
        bevelSegments: 2,
      });
      geo.rotateX(-Math.PI / 2);
      geo.center();
      return geo;
    });
    const maxTiles = 560;
    this.tilledDryInst = new THREE.InstancedMesh(tilledGeo, this.mats.tilledDryMat, maxTiles);
    this.tilledWetInst = new THREE.InstancedMesh(tilledGeo, this.mats.tilledWetMat, maxTiles);
    this.tilledDroughtInst = new THREE.InstancedMesh(tilledGeo, this.mats.tilledDroughtMat, maxTiles);
    const beanRingGeo = this.geos.get('bean_ring', () => {
      const rg = new THREE.RingGeometry(0.36, 0.43, 16);
      rg.rotateX(-Math.PI / 2);
      return rg;
    });
    this.beanRingInst = new THREE.InstancedMesh(
      beanRingGeo,
      this.mats.getEmissive('#86efac', '#22c55e', 0.65),
      maxTiles
    );
    for (const inst of [this.tilledDryInst, this.tilledWetInst, this.tilledDroughtInst]) {
      inst.receiveShadow = true;
      inst.castShadow = false;
      inst.frustumCulled = false;
      inst.count = 0;
      this.dynamicPropsGroup.add(inst);
    }
    this.beanRingInst.frustumCulled = false;
    this.beanRingInst.count = 0;
    this.dynamicPropsGroup.add(this.beanRingInst);

    // Build static landmarks + outer natural world skirt
    this.initStaticWorld();

    // Local farmer rig
    this.localFarmer = createFarmerRig(0, this.geos, this.mats);
    this.actorsGroup.add(this.localFarmer.root);

    // Hover & facing tile cursors
    const cursorGeo = this.geos.get('tile_cursor', () => new THREE.RingGeometry(0.4, 0.48, 4));
    this.hoverCursor = new THREE.Mesh(
      cursorGeo,
      new THREE.MeshBasicMaterial({
        color: '#fef08a',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
        depthWrite: false,
      })
    );
    this.hoverCursor.rotation.x = -Math.PI / 2;
    this.hoverCursor.rotation.z = Math.PI / 4;
    this.hoverCursor.position.y = 0.032;
    this.hoverCursor.visible = false;
    this.fxGroup.add(this.hoverCursor);

    this.facingCursor = new THREE.Mesh(
      cursorGeo,
      new THREE.MeshBasicMaterial({
        color: '#86efac',
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
      })
    );
    this.facingCursor.rotation.x = -Math.PI / 2;
    this.facingCursor.rotation.z = Math.PI / 4;
    this.facingCursor.position.y = 0.028;
    this.fxGroup.add(this.facingCursor);

    // 3D Rainbow arch
    this.rainbowGroup = new THREE.Group();
    const rbColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#38bdf8', '#a855f7'];
    rbColors.forEach((hex, idx) => {
      const arc = new THREE.Mesh(
        new THREE.TorusGeometry(13 - idx * 0.25, 0.14, 6, 36, Math.PI),
        new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.35 })
      );
      this.rainbowGroup.add(arc);
    });
    this.rainbowGroup.position.set(14, 0.2, -3);
    this.rainbowGroup.visible = false;
    this.fxGroup.add(this.rainbowGroup);

    // Pooled 3D Rain streaks (InstancedMesh)
    this.rainMaxCount = this.isMobileGpu ? 85 : 140;
    this.rainMesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(0.028, 0.55, 0.028),
      new THREE.MeshBasicMaterial({ color: '#bae6fd', transparent: true, opacity: 0.55 }),
      this.rainMaxCount
    );
    this.rainMesh.frustumCulled = false;
    this.rainMesh.visible = false;
    this.fxGroup.add(this.rainMesh);

    // Pooled 3D Fireflies / Petals / Leaves / Snowflakes (InstancedMesh)
    this.ambientSpecMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.06, 6, 5),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }),
      40
    );
    this.ambientSpecMesh.frustumCulled = false;
    this.fxGroup.add(this.ambientSpecMesh);

    // Pooled 3D Gameplay Particles (chimney smoke, water splashes, dust, sparkles)
    this.particleMesh = new THREE.InstancedMesh(
      new THREE.DodecahedronGeometry(0.11, 0),
      new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85 }),
      160
    );
    this.particleMesh.frustumCulled = false;
    this.fxGroup.add(this.particleMesh);

    this.resize(rect.width, rect.height);
  }

  private initStaticWorld(): void {
    // Extended outer rolling meadow so outdoor horizon has zero abrupt edges
    this.outerGround = new THREE.Mesh(
      new THREE.PlaneGeometry(160, 160),
      this.mats.grassOuterMat
    );
    this.outerGround.rotation.x = -Math.PI / 2;
    this.outerGround.position.set(14, -0.04, 10);
    this.outerGround.receiveShadow = true;
    this.terrainGroup.add(this.outerGround);

    // Landmarks (pre-baked by material for minimal draw calls)
    const farmhouse = createFarmhouseGroup(this.geos, this.mats);
    farmhouse.position.set(
      FARMHOUSE_POS.x + FARMHOUSE_POS.w / 2,
      0,
      FARMHOUSE_POS.y + FARMHOUSE_POS.h / 2
    );
    this.staticPropsGroup.add(farmhouse);

    const shop = createShopStallGroup(this.geos, this.mats);
    shop.position.set(
      SHOP_STALL_POS.x + SHOP_STALL_POS.w / 2,
      0,
      SHOP_STALL_POS.y + SHOP_STALL_POS.h / 2
    );
    this.staticPropsGroup.add(shop);

    const well = createWellGroup(this.geos, this.mats);
    well.position.set(WELL_POS.x + 0.5, 0, WELL_POS.y + 0.5);
    this.staticPropsGroup.add(well);

    const bin = createShippingBinGroup(this.geos, this.mats);
    bin.position.set(SHIPPING_BIN_POS.x + 0.5, 0, SHIPPING_BIN_POS.y + 0.5);
    this.staticPropsGroup.add(bin);
  }

  public resize(width: number, height: number): void {
    if (this.disposed) return;
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  public screenToTile(clientX: number, clientY: number, state: GameWorldState): { x: number; y: number } | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    _ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    _ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    _raycaster.setFromCamera(_ndc, this.camera);
    const hit = _raycaster.ray.intersectPlane(_groundPlane, _hitPoint);
    if (!hit) return null;
    const tx = Math.floor(_hitPoint.x);
    const ty = Math.floor(_hitPoint.z);
    return getTile(state, tx, ty) ? { x: tx, y: ty } : null;
  }

  private ensureBaseTerrain(state: GameWorldState, season: Season): void {
    const key = `${state.width}x${state.height}:${season}`;
    if (this.baseTerrainBuiltKey === key) return;
    this.baseTerrainBuiltKey = key;

    // Clear previous base terrain tiles (preserve outerGround at index 0)
    while (this.terrainGroup.children.length > 1) {
      const ch = this.terrainGroup.children[this.terrainGroup.children.length - 1];
      this.terrainGroup.remove(ch);
    }
    this.waterInstanced = null;
    this.waterCoordsX.length = 0;
    this.waterCoordsZ.length = 0;

    const grassX: number[] = [];
    const grassZ: number[] = [];
    const dirtX: number[] = [];
    const dirtZ: number[] = [];

    const broadleafTrees: { x: number; y: number; z: number; s: number }[] = [];
    const pineTrees: { x: number; y: number; z: number; s: number }[] = [];

    for (let y = 0; y < state.height; y++) {
      for (let x = 0; x < state.width; x++) {
        const tile = state.tiles[y * state.width + x];
        if (tile.terrain === 'water') {
          this.waterCoordsX.push(x + 0.5);
          this.waterCoordsZ.push(y + 0.5);
        } else if (tile.terrain === 'dirt_path') {
          dirtX.push(x + 0.5);
          dirtZ.push(y + 0.5);
        } else {
          grassX.push(x + 0.5);
          grassZ.push(y + 0.5);
          if (tile.terrain === 'forest_edge') {
            const variant = x + y;
            const s = 0.92 + (variant % 3) * 0.12;
            if (variant % 2 === 1) {
              broadleafTrees.push({ x: x + 0.5, y: 0, z: y + 0.5, s });
            } else {
              pineTrees.push({ x: x + 0.5, y: 0, z: y + 0.5, s });
            }
          }
        }
      }
    }

    // Outer perimeter horizon trees (merged into the exact same 8 InstancedMeshes!)
    for (let x = -4; x <= 32; x += 2) {
      for (const z of [-2.2, 22.2]) {
        const variant = Math.abs(x + Math.round(z));
        const s = 0.92 + (variant % 3) * 0.12;
        const tx = x + (x % 3) * 0.25;
        const tz = z + ((x * 7) % 3) * 0.2;
        if (variant % 2 === 1) broadleafTrees.push({ x: tx, y: -0.04, z: tz, s });
        else pineTrees.push({ x: tx, y: -0.04, z: tz, s });
      }
    }
    for (let z = 0; z <= 20; z += 2) {
      for (const x of [-2.2, 30.2]) {
        const variant = Math.abs(Math.round(x) + z);
        const s = 0.92 + (variant % 3) * 0.12;
        const tx = x + ((z * 5) % 3) * 0.2;
        const tz = z + (z % 3) * 0.2;
        if (variant % 2 === 1) broadleafTrees.push({ x: tx, y: -0.04, z: tz, s });
        else pineTrees.push({ x: tx, y: -0.04, z: tz, s });
      }
    }

    const tileGeo = this.geos.get('terrain_tile', () => new THREE.BoxGeometry(1, 0.14, 1));
    if (grassX.length > 0) {
      const grassInst = new THREE.InstancedMesh(tileGeo, this.mats.grassMat, grassX.length);
      grassInst.receiveShadow = true;
      for (let i = 0; i < grassX.length; i++) {
        _mat4.makeTranslation(grassX[i], -0.07, grassZ[i]);
        grassInst.setMatrixAt(i, _mat4);
      }
      grassInst.instanceMatrix.needsUpdate = true;
      grassInst.computeBoundingSphere();
      this.terrainGroup.add(grassInst);

      // Instanced 3D meadow grass tufts around natural border & pond shoreline
      const tuftSpots: { x: number; z: number; s: number; rot: number }[] = [];
      for (let y = 0; y < state.height; y++) {
        for (let x = 0; x < state.width; x++) {
          const tile = state.tiles[y * state.width + x];
          if (tile.terrain !== 'grass') continue;
          const nearEdge = x <= 1 || x >= state.width - 2 || y <= 1 || y >= state.height - 2;
          const nearWater =
            getTile(state, x + 1, y)?.terrain === 'water' ||
            getTile(state, x - 1, y)?.terrain === 'water' ||
            getTile(state, x, y + 1)?.terrain === 'water' ||
            getTile(state, x, y - 1)?.terrain === 'water';
          if (nearEdge || nearWater) {
            for (let k = 0; k < 3; k++) {
              const h = Math.sin((x * 13 + y * 29 + k * 7) * 1.7);
              tuftSpots.push({
                x: x + 0.5 + Math.cos(k * 2.1 + h) * 0.34,
                z: y + 0.5 + Math.sin(k * 2.1 - h) * 0.34,
                s: 0.75 + Math.abs(h) * 0.55,
                rot: h * Math.PI,
              });
            }
          }
        }
      }
      if (tuftSpots.length > 0) {
        const bladeGeo = this.geos.get('meadow_tuft', () => new THREE.ConeGeometry(0.032, 0.16, 4));
        const tuftInst = new THREE.InstancedMesh(bladeGeo, this.mats.treeLightMat, tuftSpots.length);
        tuftSpots.forEach((t, idx) => {
          _v3A.set(t.x, 0.06 * t.s, t.z);
          _euler.set(0.15, t.rot, 0.1);
          _quat.setFromEuler(_euler);
          _scale.setScalar(t.s);
          _mat4.compose(_v3A, _quat, _scale);
          tuftInst.setMatrixAt(idx, _mat4);
        });
        tuftInst.instanceMatrix.needsUpdate = true;
        tuftInst.computeBoundingSphere();
        this.terrainGroup.add(tuftInst);
      }
    }

    if (dirtX.length > 0) {
      const dirtInst = new THREE.InstancedMesh(tileGeo, this.mats.dirtMat, dirtX.length);
      dirtInst.receiveShadow = true;
      for (let i = 0; i < dirtX.length; i++) {
        _mat4.makeTranslation(dirtX[i], -0.065, dirtZ[i]);
        dirtInst.setMatrixAt(i, _mat4);
      }
      dirtInst.instanceMatrix.needsUpdate = true;
      dirtInst.computeBoundingSphere();
      this.terrainGroup.add(dirtInst);
    }

    if (this.waterCoordsX.length > 0) {
      const bedGeo = this.geos.get('water_bed', () => new THREE.BoxGeometry(1, 0.1, 1));
      const bedInst = new THREE.InstancedMesh(
        bedGeo,
        this.mats.getSolid('#1b4f72', 0.9, 0.0),
        this.waterCoordsX.length
      );
      bedInst.receiveShadow = true;
      const waterSurfaceGeo = this.geos.get('water_surf', () => {
        const pg = new THREE.PlaneGeometry(1, 1);
        pg.rotateX(-Math.PI / 2);
        return pg;
      });
      const wInst = new THREE.InstancedMesh(
        waterSurfaceGeo,
        this.mats.waterMat,
        this.waterCoordsX.length
      );
      wInst.receiveShadow = true;
      wInst.frustumCulled = false;

      for (let i = 0; i < this.waterCoordsX.length; i++) {
        _mat4.makeTranslation(this.waterCoordsX[i], -0.18, this.waterCoordsZ[i]);
        bedInst.setMatrixAt(i, _mat4);
        _mat4.makeTranslation(this.waterCoordsX[i], -0.04, this.waterCoordsZ[i]);
        wInst.setMatrixAt(i, _mat4);
      }
      bedInst.instanceMatrix.needsUpdate = true;
      bedInst.computeBoundingSphere();
      wInst.instanceMatrix.needsUpdate = true;
      this.terrainGroup.add(bedInst);
      this.terrainGroup.add(wInst);
      this.waterInstanced = wInst;
    }

    // Build ALL ~150 forest trees as 8 InstancedMeshes (vs 700+ draw calls!)
    const treeTmpl = getInstancedTreeTemplates(this.geos);
    if (broadleafTrees.length > 0) {
      const blTrunk = new THREE.InstancedMesh(treeTmpl.broadleafTrunkGeo, this.mats.barkMat, broadleafTrees.length);
      const blDark = new THREE.InstancedMesh(treeTmpl.broadleafDarkGeo, this.mats.treeDarkMat, broadleafTrees.length);
      const blMid = new THREE.InstancedMesh(treeTmpl.broadleafMidGeo, this.mats.treeMidMat, broadleafTrees.length);
      const blLight = new THREE.InstancedMesh(treeTmpl.broadleafLightGeo, this.mats.treeLightMat, broadleafTrees.length);
      const layers = [blTrunk, blDark, blMid, blLight];
      for (const l of layers) {
        l.castShadow = !this.isSoftwareGl;
        l.receiveShadow = true;
        l.frustumCulled = false;
      }
      broadleafTrees.forEach((t, idx) => {
        _v3A.set(t.x, t.y, t.z);
        _quat.identity();
        _scale.setScalar(t.s);
        _mat4.compose(_v3A, _quat, _scale);
        for (const l of layers) l.setMatrixAt(idx, _mat4);
      });
      for (const l of layers) {
        l.instanceMatrix.needsUpdate = true;
        this.terrainGroup.add(l);
      }
    }
    if (pineTrees.length > 0) {
      const pTrunk = new THREE.InstancedMesh(treeTmpl.pineTrunkGeo, this.mats.barkMat, pineTrees.length);
      const p1 = new THREE.InstancedMesh(treeTmpl.pineTier1Geo, this.mats.treeDarkMat, pineTrees.length);
      const p2 = new THREE.InstancedMesh(treeTmpl.pineTier2Geo, this.mats.treeMidMat, pineTrees.length);
      const p3 = new THREE.InstancedMesh(treeTmpl.pineTier3Geo, this.mats.treeLightMat, pineTrees.length);
      const layers = [pTrunk, p1, p2, p3];
      for (const l of layers) {
        l.castShadow = !this.isSoftwareGl;
        l.receiveShadow = true;
        l.frustumCulled = false;
      }
      pineTrees.forEach((t, idx) => {
        _v3A.set(t.x, t.y, t.z);
        _quat.identity();
        _scale.setScalar(t.s);
        _mat4.compose(_v3A, _quat, _scale);
        for (const l of layers) l.setMatrixAt(idx, _mat4);
      });
      for (const l of layers) {
        l.instanceMatrix.needsUpdate = true;
        this.terrainGroup.add(l);
      }
    }
  }

  private syncTilesIncremental(state: GameWorldState): void {
    const totalTiles = state.width * state.height;
    if (this.tileSeenStamp.length !== totalTiles) {
      this.tileSeenStamp = new Int32Array(totalTiles);
      this.prevTilledCode = new Uint8Array(totalTiles);
      this.tilledDirty = true;
    }

    this.syncEpoch++;
    let animChanged = false;
    let lanternCount = 0;
    let soilChanged = this.tilledDirty;

    for (let y = 0; y < state.height; y++) {
      const rowOffset = y * state.width;
      for (let x = 0; x < state.width; x++) {
        const idx = rowOffset + x;
        const tile = state.tiles[idx];

        // Check tilled soil bitmask: 0=untilled, bit0=tilled, bit1=watered, bit2=drought, bit3=beanBonus
        const soilCode = tile.tilled
          ? 1 |
            (tile.watered ? 2 : 0) |
            (tile.droughtDriedToday ? 4 : 0) |
            (tile.beanRotationBonus ? 8 : 0)
          : 0;
        if (this.prevTilledCode[idx] !== soilCode) {
          this.prevTilledCode[idx] = soilCode;
          soilChanged = true;
        }

        // Tile prop (excluding forest_edge which is instanced in ensureBaseTerrain)
        let propSig = '';
        if (tile.structure) {
          propSig = `s:${tile.structure.type}:${tile.structure.hp}`;
          if (tile.structure.type === 'lantern' && lanternCount < this.lanternLights.length) {
            this.lanternSpotsX[lanternCount] = x + 0.5;
            this.lanternSpotsZ[lanternCount] = y + 0.5;
            lanternCount++;
          }
        } else if (tile.crop) {
          propSig = `c:${tile.crop.type}:${tile.crop.growthDays}:${tile.crop.withered ? 1 : 0}`;
        } else if (tile.obstacle) {
          propSig = `o:${tile.obstacle}`;
        }

        if (propSig) {
          this.tileSeenStamp[idx] = this.syncEpoch;
          const existing = this.tilePropGroups.get(idx);
          if (!existing || existing.sig !== propSig) {
            if (existing) {
              this.dynamicPropsGroup.remove(existing.group);
              if (existing.animType) animChanged = true;
            }
            let group: THREE.Group;
            let animType: string | undefined;
            if (tile.structure) {
              group = createStructureGroup(tile.structure, this.geos, this.mats);
              if (
                tile.structure.type === 'windmill' ||
                tile.structure.type === 'sprinkler' ||
                tile.structure.type === 'drip_sprinkler' ||
                tile.structure.type === 'nasa_station'
              ) {
                animType = tile.structure.type;
                animChanged = true;
              }
            } else if (tile.crop) {
              group = createCropGroup(tile.crop, this.geos, this.mats);
            } else {
              group = createObstacleGroup(tile.obstacle!, this.geos, this.mats);
            }
            group.position.set(x + 0.5, 0, y + 0.5);
            this.dynamicPropsGroup.add(group);
            this.tilePropGroups.set(idx, { sig: propSig, animType, group });
          }
        }
      }
    }

    // Remove stale crops/obstacles/structures
    for (const [idx, entry] of this.tilePropGroups.entries()) {
      if (this.tileSeenStamp[idx] !== this.syncEpoch) {
        this.dynamicPropsGroup.remove(entry.group);
        if (entry.animType) animChanged = true;
        this.tilePropGroups.delete(idx);
      }
    }

    if (animChanged) {
      this.animatedStructures.length = 0;
      for (const entry of this.tilePropGroups.values()) {
        if (entry.animType) {
          this.animatedStructures.push({ type: entry.animType, group: entry.group });
        }
      }
    }

    // Rebuild instanced tilled soil pads only when any soil tile changed
    if (soilChanged) {
      this.tilledDirty = false;
      let dryCount = 0;
      let wetCount = 0;
      let droughtCount = 0;
      let ringCount = 0;

      for (let y = 0; y < state.height; y++) {
        const rowOffset = y * state.width;
        for (let x = 0; x < state.width; x++) {
          const code = this.prevTilledCode[rowOffset + x];
          if (code === 0) continue;
          _mat4.makeTranslation(x + 0.5, 0.018, y + 0.5);
          if ((code & 2) !== 0) {
            this.tilledWetInst.setMatrixAt(wetCount++, _mat4);
          } else if ((code & 4) !== 0) {
            this.tilledDroughtInst.setMatrixAt(droughtCount++, _mat4);
          } else {
            this.tilledDryInst.setMatrixAt(dryCount++, _mat4);
          }
          if ((code & 8) !== 0) {
            _mat4.makeTranslation(x + 0.5, 0.038, y + 0.5);
            this.beanRingInst.setMatrixAt(ringCount++, _mat4);
          }
        }
      }

      this.tilledDryInst.count = dryCount;
      this.tilledWetInst.count = wetCount;
      this.tilledDroughtInst.count = droughtCount;
      this.beanRingInst.count = ringCount;
      this.tilledDryInst.instanceMatrix.needsUpdate = true;
      this.tilledWetInst.instanceMatrix.needsUpdate = true;
      this.tilledDroughtInst.instanceMatrix.needsUpdate = true;
      this.beanRingInst.instanceMatrix.needsUpdate = true;
    }

    // Daily treasure
    const treasure = state.dailyTreasure;
    const tKey = treasure ? `${treasure.x},${treasure.y}:${treasure.kind}` : '';
    if (tKey !== (this.treasureProp?.key ?? '')) {
      if (this.treasureProp) {
        this.dynamicPropsGroup.remove(this.treasureProp.group);
        this.treasureProp = null;
      }
      if (treasure) {
        const tg = createTreasureGroup(treasure.kind, this.geos, this.mats);
        tg.position.set(treasure.x + 0.5, 0.04, treasure.y + 0.5);
        this.dynamicPropsGroup.add(tg);
        this.treasureProp = { key: tKey, group: tg };
      }
    }

    // Position active placed lanterns
    for (let i = 0; i < this.lanternLights.length; i++) {
      if (i < lanternCount) {
        this.lanternLights[i].position.set(this.lanternSpotsX[i], 1.0, this.lanternSpotsZ[i]);
        this.lanternLights[i].userData.active = true;
      } else {
        this.lanternLights[i].userData.active = false;
      }
    }
  }

  private updateFarmerVisual(
    rig: FarmerModelRig,
    x: number,
    y: number,
    fx: number,
    fy: number,
    walkCycle: number,
    swingTimer: number,
    swingTool: ToolType | null,
    selectedItem: ItemId | null,
    hitFlashTimer: number
  ): void {
    rig.root.position.set(x, 0, y);

    const yaw = Math.atan2(fx, fy || 0.001);
    rig.bodyPivot.rotation.y = yaw;

    const stride = Math.sin(walkCycle) * 0.45;
    rig.leftLeg.rotation.x = stride;
    rig.rightLeg.rotation.x = -stride;
    rig.leftArm.rotation.x = -stride * 0.7;
    rig.bodyPivot.position.y = Math.abs(Math.cos(walkCycle)) * 0.045;

    const heldTool: ToolType | null =
      swingTool ??
      (selectedItem === 'hoe' || selectedItem === 'watering_can' || selectedItem === 'axe'
        ? selectedItem
        : null);

    rig.toolMeshes.hoe.visible = heldTool === 'hoe';
    rig.toolMeshes.watering_can.visible = heldTool === 'watering_can';
    rig.toolMeshes.axe.visible = heldTool === 'axe';

    if (swingTimer > 0) {
      const swingPhase = Math.sin((swingTimer / 0.25) * Math.PI);
      rig.rightArm.rotation.x = -1.25 * swingPhase - 0.3;
    } else {
      rig.rightArm.rotation.x = stride * 0.7 - (heldTool ? 0.35 : 0);
    }

    if (hitFlashTimer > 0) {
      const pulse = 1 + Math.sin(hitFlashTimer * 40) * 0.08;
      rig.bodyPivot.scale.setScalar(pulse);
    } else {
      rig.bodyPivot.scale.setScalar(1);
    }
  }

  private syncActors(
    state: GameWorldState,
    elapsedSec: number,
    remotePlayers: RemotePlayerState[],
    localPlayerMeta?: LocalPlayerRenderMeta,
    voiceStates?: Record<string, VoicePeerState>,
    activeEmotes?: Record<string, string>,
    localEmote?: string
  ): void {
    const localColorIdx = localPlayerMeta?.colorIndex ?? 0;
    const localPalette = PLAYER_PALETTE[localColorIdx % PLAYER_PALETTE.length];
    (this.localFarmer.hatBand.material as THREE.MeshStandardMaterial).color.set(localPalette.badge);

    const selectedItem = state.hotbar[state.player.selectedHotbarIndex] ?? null;
    this.updateFarmerVisual(
      this.localFarmer,
      state.player.x,
      state.player.y,
      state.player.facingX,
      state.player.facingY,
      state.player.walkCycle,
      state.player.swingTimer,
      state.player.swingTool,
      selectedItem,
      state.player.hitFlashTimer
    );

    // Local nameplate / emote
    const localTag = localEmote
      ? localEmote
      : localPlayerMeta
      ? `${localPlayerMeta.voice?.speaking ? '🎙 ' : ''}${localPlayerMeta.name}`
      : '';
    if (localTag) {
      if (!this.localLabelSprite) {
        this.localLabelSprite = makeBillboardSprite(localTag, '#ffffff', 'rgba(28, 19, 12, 0.72)');
        this.actorsGroup.add(this.localLabelSprite);
      }
      if (this.localLabelSig !== localTag) {
        this.localLabelSig = localTag;
        updateBillboardTexture(
          this.localLabelSprite,
          localTag,
          localEmote ? '#fde047' : '#ffffff',
          'rgba(28, 19, 12, 0.72)'
        );
      }
      this.localLabelSprite.visible = true;
      this.localLabelSprite.position.set(state.player.x, 1.55, state.player.y);
    } else if (this.localLabelSprite) {
      this.localLabelSprite.visible = false;
    }

    // Remote co-op players
    this.scratchIdSet.clear();
    for (const rp of remotePlayers) {
      this.scratchIdSet.add(rp.id);
      let entry = this.remoteFarmers.get(rp.id);
      const vp = voiceStates?.[rp.id];
      const emote = activeEmotes?.[rp.id];
      const tag = emote ? `${emote} ${rp.name}` : `${vp?.speaking ? '🎙 ' : ''}${rp.name}`;
      if (!entry) {
        const rig = createFarmerRig(rp.colorIndex, this.geos, this.mats);
        this.actorsGroup.add(rig.root);
        const label = makeBillboardSprite(tag, '#ffffff', 'rgba(28, 19, 12, 0.75)');
        this.actorsGroup.add(label);
        entry = { rig, label, labelSig: tag };
        this.remoteFarmers.set(rp.id, entry);
      } else if (entry.labelSig !== tag) {
        entry.labelSig = tag;
        updateBillboardTexture(
          entry.label,
          tag,
          emote ? '#fde047' : '#ffffff',
          'rgba(28, 19, 12, 0.75)'
        );
      }
      const rItem = state.hotbar[rp.selectedHotbarIndex] ?? null;
      this.updateFarmerVisual(
        entry.rig,
        rp.x,
        rp.y,
        rp.facingX,
        rp.facingY,
        rp.walkCycle,
        rp.swingTimer,
        rp.swingTool,
        rItem,
        rp.hitFlashTimer
      );
      entry.label.position.set(rp.x, 1.55, rp.y);
    }
    for (const [id, entry] of this.remoteFarmers.entries()) {
      if (!this.scratchIdSet.has(id)) {
        this.actorsGroup.remove(entry.rig.root);
        this.actorsGroup.remove(entry.label);
        (entry.label.material as THREE.SpriteMaterial).map?.dispose();
        entry.label.material.dispose();
        this.remoteFarmers.delete(id);
      }
    }

    // Chickens
    this.scratchNumSet.clear();
    for (const c of state.chickens) {
      this.scratchNumSet.add(c.id);
      let cg = this.chickens.get(c.id);
      if (!cg) {
        cg = createChickenGroup(this.geos, this.mats);
        this.actorsGroup.add(cg);
        this.chickens.set(c.id, cg);
      }
      cg.position.set(c.x, Math.abs(Math.sin(c.hopPhase)) * 0.08, c.y);
      cg.rotation.y = Math.atan2(c.vx || c.facingX, c.vy || 0.01);
    }
    for (const [id, cg] of this.chickens.entries()) {
      if (!this.scratchNumSet.has(id)) {
        this.actorsGroup.remove(cg);
        this.chickens.delete(id);
      }
    }

    // Cows
    this.scratchNumSet.clear();
    for (const cow of state.cows ?? []) {
      this.scratchNumSet.add(cow.id);
      let cg = this.cows.get(cow.id);
      if (!cg) {
        cg = createCowGroup(this.geos, this.mats);
        this.actorsGroup.add(cg);
        this.cows.set(cow.id, cg);
      }
      cg.position.set(cow.x, Math.abs(Math.sin(cow.hopPhase)) * 0.04, cow.y);
      cg.rotation.y = Math.atan2(cow.vx || cow.facingX, cow.vy || 0.01);
    }
    for (const [id, cg] of this.cows.entries()) {
      if (!this.scratchNumSet.has(id)) {
        this.actorsGroup.remove(cg);
        this.cows.delete(id);
      }
    }

    // Sheep
    this.scratchNumSet.clear();
    for (const sh of state.sheep ?? []) {
      this.scratchNumSet.add(sh.id);
      let sg = this.sheep.get(sh.id);
      if (!sg) {
        sg = createSheepGroup(this.geos, this.mats);
        this.actorsGroup.add(sg);
        this.sheep.set(sh.id, sg);
      }
      sg.position.set(sh.x, Math.abs(Math.sin(sh.hopPhase)) * 0.06, sh.y);
      sg.rotation.y = Math.atan2(sh.vx || sh.facingX, sh.vy || 0.01);
    }
    for (const [id, sg] of this.sheep.entries()) {
      if (!this.scratchNumSet.has(id)) {
        this.actorsGroup.remove(sg);
        this.sheep.delete(id);
      }
    }

    // Guard Dog
    if (state.dog) {
      if (!this.dogGroup) {
        this.dogGroup = createDogGroup(this.geos, this.mats);
        this.actorsGroup.add(this.dogGroup);
      }
      this.dogGroup.visible = true;
      this.dogGroup.position.set(
        state.dog.x,
        Math.abs(Math.sin(state.dog.hopPhase)) * 0.08,
        state.dog.y
      );
      this.dogGroup.rotation.y = Math.atan2(state.dog.vx || state.dog.facingX, state.dog.vy || 0.01);
    } else if (this.dogGroup) {
      this.dogGroup.visible = false;
    }

    // Night Wildlife (Rabbits & Boars)
    this.scratchNumSet.clear();
    for (const w of state.wildlife) {
      if (w.state === 'ko') continue;
      this.scratchNumSet.add(w.id);
      let entry = this.wildlife.get(w.id);
      if (!entry || entry.kind !== w.kind) {
        if (entry) this.actorsGroup.remove(entry.group);
        const wg = createWildlifeGroup(w.kind, this.geos, this.mats);
        this.actorsGroup.add(wg);
        entry = { kind: w.kind, group: wg };
        this.wildlife.set(w.id, entry);
      }
      const hop = Math.abs(Math.sin(w.hopPhase)) * (w.kind === 'rabbit' ? 0.16 : 0.06);
      entry.group.position.set(w.x, hop, w.y);
      entry.group.rotation.y = Math.atan2(w.vx || w.facingX, w.vy || 0.01);
      const pulse = w.state === 'windup' ? 1 + Math.sin(elapsedSec * 24) * 0.1 : 1;
      entry.group.scale.setScalar(pulse);
    }
    for (const [id, entry] of this.wildlife.entries()) {
      if (!this.scratchNumSet.has(id)) {
        this.actorsGroup.remove(entry.group);
        this.wildlife.delete(id);
      }
    }
  }

  private updateAtmosphere(
    state: GameWorldState,
    season: Season,
    elapsedSec: number,
    camTargetX: number,
    camTargetZ: number
  ): void {
    const pal = this.mats.applySeason(season);
    const tMin = state.timeMinutes;
    const phase = getTimePhase(tMin);

    let nightFactor = 0;
    let sunsetFactor = 0;
    if (tMin >= NIGHT_START_MINUTES) {
      nightFactor = Math.min(1, (tMin - NIGHT_START_MINUTES) / 60);
    } else if (tMin >= SUNSET_START_MINUTES) {
      sunsetFactor = Math.min(1, (tMin - SUNSET_START_MINUTES) / 60);
    } else if (tMin < 420) {
      sunsetFactor = Math.max(0, 1 - (tMin - 360) / 60) * 0.65;
    }

    _colorA.set(pal.skyDay);
    if (sunsetFactor > 0) {
      _colorB.set(pal.skySunset);
      _colorA.lerp(_colorB, sunsetFactor);
    }
    if (nightFactor > 0) {
      _colorB.set(pal.skyNight);
      _colorA.lerp(_colorB, nightFactor);
    }
    if (state.weather === 'Rainstorm') {
      _colorB.set('#334155');
      _colorA.lerp(_colorB, 0.45);
    } else if (state.weather === 'Heatwave') {
      _colorB.set('#f59e0b');
      _colorA.lerp(_colorB, 0.18);
    }

    (this.scene.background as THREE.Color).copy(_colorA);
    this.fog.color.copy(_colorA);
    this.fog.density = state.weather === 'Rainstorm' ? 0.022 : 0.014;

    // Texel-snapped directional sun shadow frustum (eliminates shadow edge crawling/shimmer)
    const texelSize = (this.shadowHalfExtent * 2) / this.shadowMapSize;
    const snappedX = Math.round(camTargetX / texelSize) * texelSize;
    const snappedZ = Math.round(camTargetZ / texelSize) * texelSize;
    const sunProgress = Math.max(0, Math.min(1, (tMin - 360) / (1440 - 360)));
    const sunAngle = sunProgress * Math.PI;
    this.sunLight.position.set(
      snappedX + Math.cos(sunAngle) * -22,
      8 + Math.sin(sunAngle) * 24,
      snappedZ + 12
    );
    this.sunLight.target.position.set(snappedX, 0, snappedZ);

    if (nightFactor > 0.5) {
      this.sunLight.color.set('#7aa2e3');
      this.sunLight.intensity = 0.65;
      this.hemiLight.intensity = 0.5;
    } else if (sunsetFactor > 0.2) {
      this.sunLight.color.set('#ffb07a');
      this.sunLight.intensity = 1.65;
      this.hemiLight.intensity = 0.75;
    } else {
      this.sunLight.color.set('#fff5db');
      this.sunLight.intensity = state.weather === 'Rainstorm' ? 1.1 : 2.1;
      this.hemiLight.intensity = 0.9;
    }

    // Farmhouse porch & placed lanterns glow
    const warmLightPower = Math.max(nightFactor, sunsetFactor * 0.55);
    this.mats.setNightWindowGlow(warmLightPower);
    this.porchLight.intensity = warmLightPower * 3.5;
    for (const pl of this.lanternLights) {
      pl.intensity = pl.userData.active ? warmLightPower * 2.8 : 0;
    }

    // Rainbow arch
    this.rainbowGroup.visible = Boolean(state.rainbowActive) && phase !== 'Night';

    // Water shimmer & live scrolling ripple normal map (single InstancedMesh)
    this.mats.waterNormalTex.offset.set(elapsedSec * 0.045, elapsedSec * 0.028);
    if (this.waterInstanced && this.waterCoordsX.length > 0) {
      for (let i = 0; i < this.waterCoordsX.length; i++) {
        _mat4.makeTranslation(
          this.waterCoordsX[i],
          -0.045 + Math.sin(elapsedSec * 2.4 + i * 0.6) * 0.012,
          this.waterCoordsZ[i]
        );
        this.waterInstanced.setMatrixAt(i, _mat4);
      }
      this.waterInstanced.instanceMatrix.needsUpdate = true;
    }

    // Spinning Windmill / Sprinklers / NASA Station
    for (const st of this.animatedStructures) {
      if (st.type === 'windmill') {
        const hub = st.group.getObjectByName('windmill_hub');
        if (hub) hub.rotation.z = elapsedSec * 1.35;
      } else if (st.type === 'sprinkler' || st.type === 'drip_sprinkler') {
        const head = st.group.getObjectByName('spin_head');
        if (head) head.rotation.y = elapsedSec * 2.4;
      } else if (st.type === 'nasa_station') {
        const dish = st.group.getObjectByName('spin_head');
        if (dish) dish.rotation.z = Math.sin(elapsedSec * 0.8) * 0.35;
      }
    }

    if (this.treasureProp) {
      this.treasureProp.group.rotation.y = elapsedSec * 1.4;
      this.treasureProp.group.position.y = 0.05 + Math.sin(elapsedSec * 3.2) * 0.05;
    }

    // 3D Rain streaks
    if (state.weather === 'Rainstorm') {
      this.rainMesh.visible = true;
      for (let i = 0; i < this.rainMaxCount; i++) {
        const rx = camTargetX - 14 + ((i * 3.17) % 28);
        const rz = camTargetZ - 11 + ((i * 5.43) % 22);
        const ry = 10 - ((elapsedSec * 14 + i * 1.37) % 10.5);
        _v3A.set(rx, ry, rz);
        _quat.identity();
        _scale.set(1, 1, 1);
        _mat4.compose(_v3A, _quat, _scale);
        this.rainMesh.setMatrixAt(i, _mat4);
      }
      this.rainMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.rainMesh.visible = false;
    }

    // 3D Fireflies at Night / Seasonal Petals, Autumn Leaves, Winter Snow
    const isNight = phase === 'Night';
    const ambientColorKey = isNight ? 'N' : season;
    const specCount = this.isMobileGpu
      ? isNight
        ? 18
        : season === 'Winter'
        ? 22
        : 12
      : isNight
      ? 28
      : season === 'Winter'
      ? 36
      : 18;
    const colorDirty = this.lastAmbientColorKey !== ambientColorKey;
    this.lastAmbientColorKey = ambientColorKey;

    this.ambientSpecMesh.count = specCount;
    for (let i = 0; i < specCount; i++) {
      if (isNight) {
        const fx = 2 + ((i * 3.7 + Math.sin(elapsedSec * 0.8 + i) * 1.8) % 24);
        const fz = 2 + ((i * 2.9 + Math.cos(elapsedSec * 0.9 + i * 1.4) * 1.5) % 16);
        const fy = 0.45 + Math.sin(elapsedSec * 2.1 + i) * 0.35;
        const glowScale = 0.6 + Math.max(0, Math.sin(elapsedSec * 3.8 + i * 1.9)) * 0.9;
        _v3A.set(fx, fy, fz);
        _scale.setScalar(glowScale);
        if (colorDirty) _colorA.set(i % 2 === 0 ? '#fde047' : '#bef264');
      } else if (season === 'Winter') {
        const sx = camTargetX - 13 + ((i * 2.3 + Math.sin(elapsedSec + i) * 1.2) % 26);
        const sz = camTargetZ - 10 + ((i * 3.1) % 20);
        const sy = 7.5 - ((elapsedSec * 1.8 + i * 0.9) % 7.5);
        _v3A.set(sx, sy, sz);
        _scale.setScalar(0.8);
        if (colorDirty) _colorA.set('#f8fafc');
      } else if (season === 'Autumn') {
        const lx = camTargetX - 12 + ((i * 2.8 + elapsedSec * 1.4 + Math.sin(elapsedSec + i)) % 24);
        const lz = camTargetZ - 9 + ((i * 3.3) % 18);
        const ly = 6.5 - ((elapsedSec * 1.4 + i * 1.1) % 6.5);
        _v3A.set(lx, ly, lz);
        _scale.set(1.4, 0.4, 1.0);
        if (colorDirty) _colorA.set(i % 2 === 0 ? '#ea580c' : '#eab308');
      } else {
        const bx = 3 + ((i * 4.1 + elapsedSec * 1.1) % 22);
        const bz = 3 + ((i * 3.1 + Math.sin(elapsedSec * 1.8 + i) * 1.5) % 14);
        const by = 0.9 + Math.sin(elapsedSec * 4.5 + i) * 0.4;
        _v3A.set(bx, by, bz);
        _scale.set(1.2, 0.5, 0.9);
        if (colorDirty) _colorA.set(i % 2 === 0 ? '#f472b6' : '#fde047');
      }
      _quat.identity();
      _mat4.compose(_v3A, _quat, _scale);
      this.ambientSpecMesh.setMatrixAt(i, _mat4);
      if (colorDirty) {
        this.ambientSpecMesh.setColorAt(i, _colorA);
      }
    }
    this.ambientSpecMesh.instanceMatrix.needsUpdate = true;
    if (colorDirty && this.ambientSpecMesh.instanceColor) {
      this.ambientSpecMesh.instanceColor.needsUpdate = true;
    }
  }

  private syncParticlesAndText(particles: Particle[], floatingTexts: FloatingText[]): void {
    // Particles (chimney smoke, splashes, harvest sparkles)
    let pCount = 0;
    for (const p of particles) {
      if (!p.active || pCount >= 160) continue;
      const wx = p.x / TILE_SIZE;
      const wz = p.y / TILE_SIZE;
      const ageNorm = 1 - Math.max(0, p.life / Math.max(0.01, p.maxLife));
      const wy = 0.45 + ageNorm * 2.1;
      const s = (p.size / 4) * (1 - ageNorm * 0.5);
      _v3A.set(wx, wy, wz);
      _quat.identity();
      _scale.setScalar(Math.max(0.15, s));
      _mat4.compose(_v3A, _quat, _scale);
      this.particleMesh.setMatrixAt(pCount, _mat4);
      _colorA.set(p.color.startsWith('rgba') ? '#e8e4da' : p.color);
      this.particleMesh.setColorAt(pCount, _colorA);
      pCount++;
    }
    this.particleMesh.count = pCount;
    if (pCount > 0) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) {
        this.particleMesh.instanceColor.needsUpdate = true;
      }
    }

    // Floating texts
    this.scratchNumSet.clear();
    for (const ft of floatingTexts) {
      this.scratchNumSet.add(ft.id);
      let entry = this.floatingSprites.get(ft.id);
      if (!entry) {
        const sprite = makeBillboardSprite(ft.text, ft.color);
        this.fxGroup.add(sprite);
        entry = { sprite, text: ft.text };
        this.floatingSprites.set(ft.id, entry);
      } else if (entry.text !== ft.text) {
        entry.text = ft.text;
        updateBillboardTexture(entry.sprite, ft.text, ft.color);
      }
      const progress = 1 - Math.max(0, ft.life / Math.max(0.01, ft.maxLife));
      entry.sprite.position.set(ft.x / TILE_SIZE, 1.35 + progress * 1.15, ft.y / TILE_SIZE);
      (entry.sprite.material as THREE.SpriteMaterial).opacity = Math.min(1, ft.life * 2);
    }
    for (const [id, entry] of this.floatingSprites.entries()) {
      if (!this.scratchNumSet.has(id)) {
        this.fxGroup.remove(entry.sprite);
        (entry.sprite.material as THREE.SpriteMaterial).map?.dispose();
        entry.sprite.material.dispose();
        this.floatingSprites.delete(id);
      }
    }
  }

  private updateAdaptiveResolution(nowMs: number): void {
    if (this.isSoftwareGl) return;
    if (this.lastRenderTs > 0) {
      const dtMs = nowMs - this.lastRenderTs;
      // Ignore modal-throttled or backgrounded frames (> 90ms)
      if (dtMs > 4 && dtMs < 90) {
        this.avgFrameMs = this.avgFrameMs * 0.9 + dtMs * 0.1;
        this.drsWarmupFrames++;
        if (this.drsCooldown > 0) this.drsCooldown--;

        if (this.drsWarmupFrames >= 45 && this.drsCooldown === 0) {
          if (this.avgFrameMs > 22.5 && this.currentDpr > this.minDpr + 0.02) {
            this.currentDpr = Math.max(this.minDpr, Math.round((this.currentDpr - 0.15) * 20) / 20);
            this.renderer.setPixelRatio(this.currentDpr);
            this.drsCooldown = 90;
          } else if (this.avgFrameMs < 15.2 && this.currentDpr < this.maxDpr - 0.02) {
            this.currentDpr = Math.min(this.maxDpr, Math.round((this.currentDpr + 0.1) * 20) / 20);
            this.renderer.setPixelRatio(this.currentDpr);
            this.drsCooldown = 140;
          }
        }
      }
    }
    this.lastRenderTs = nowMs;
  }

  public render(
    state: GameWorldState,
    cameraState: CameraState,
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
    if (this.disposed) return;
    this.frameCounter++;
    this.updateAdaptiveResolution(performance.now());

    const season = getSeason(state.seasonIndex);

    this.ensureBaseTerrain(state, season);
    this.syncTilesIncremental(state);
    this.syncActors(
      state,
      elapsedSec,
      remotePlayers,
      localPlayerMeta,
      voiceStates,
      activeEmotes,
      localEmote
    );
    this.syncParticlesAndText(particles, floatingTexts);

    // Target coordinates in 3D world tiles
    const camTargetX = cameraState.x / TILE_SIZE + cameraState.shakeX / TILE_SIZE;
    const camTargetZ = cameraState.y / TILE_SIZE + cameraState.shakeY / TILE_SIZE;

    // Hover & facing tile indicators
    if (!isTitleBackdrop && hoverTile) {
      this.hoverCursor.visible = true;
      this.hoverCursor.position.set(hoverTile.x + 0.5, 0.035, hoverTile.y + 0.5);
    } else {
      this.hoverCursor.visible = false;
    }

    if (!isTitleBackdrop) {
      const p = state.player;
      const fx = Math.abs(p.facingX) >= Math.abs(p.facingY) ? Math.sign(p.facingX) : 0;
      const fy = fx === 0 ? Math.sign(p.facingY || 1) : 0;
      const ftx = Math.floor(p.x + fx * 0.85);
      const fty = Math.floor(p.y + fy * 0.85);
      if (getTile(state, ftx, fty)) {
        this.facingCursor.visible = true;
        this.facingCursor.position.set(ftx + 0.5, 0.028, fty + 0.5);
      } else {
        this.facingCursor.visible = false;
      }
    } else {
      this.facingCursor.visible = false;
    }

    // Position 3D camera
    const zoomBase = Math.max(0.55, Math.min(1.85, (1.8 / Math.max(0.8, cameraState.zoom)) * this.userZoomMultiplier));
    if (isTitleBackdrop) {
      const orbitYaw = Math.sin(elapsedSec * 0.18) * 0.35;
      const dist = 13.5;
      const height = 9.5;
      this.camera.position.set(
        camTargetX + Math.sin(orbitYaw) * dist,
        height,
        camTargetZ + Math.cos(orbitYaw) * dist
      );
      _v3B.set(camTargetX, 0.4, camTargetZ);
      this.camera.lookAt(_v3B);
    } else {
      const dist = 9.2 * zoomBase;
      const height = 8.4 * zoomBase;
      this.camera.position.set(
        camTargetX + Math.sin(this.cameraYaw) * dist,
        height,
        camTargetZ + Math.cos(this.cameraYaw) * dist
      );
      _v3B.set(camTargetX, 0.35, camTargetZ);
      this.camera.lookAt(_v3B);
    }

    this.updateAtmosphere(state, season, elapsedSec, camTargetX, camTargetZ);

    if (!this.compiledOnce && !this.isSoftwareGl) {
      this.compiledOnce = true;
      this.renderer.compile(this.scene, this.camera);
    }

    // On mobile/Android, refresh shadow map every 2nd frame or on camera shift to cut shadow GPU load in half
    if (this.isMobileGpu && !this.isSoftwareGl) {
      const camJumped =
        Math.abs(camTargetX - this.lastShadowCamX) > 0.35 ||
        Math.abs(camTargetZ - this.lastShadowCamZ) > 0.35;
      if (camJumped || this.frameCounter % 2 === 0) {
        this.renderer.shadowMap.needsUpdate = true;
        this.lastShadowCamX = camTargetX;
        this.lastShadowCamZ = camTargetZ;
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  public scheduleNextFrame(tickFn: (now: number) => void): () => void {
    if (!this.isSoftwareGl) {
      const id = requestAnimationFrame(tickFn);
      return () => cancelAnimationFrame(id);
    }
    let cancelled = false;
    let timerId = 0;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (cancelled) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (status === gl.UNSIGNALED) {
          timerId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          timerId = window.setTimeout(() => {
            if (!cancelled) tickFn(performance.now());
          }, 80);
        }
      };
      timerId = window.setTimeout(poll, 5);
    } else {
      timerId = window.setTimeout(() => {
        if (!cancelled) tickFn(performance.now());
      }, 80);
    }
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.mats.dispose();
    this.geos.dispose();
    this.envTexture?.dispose();
    for (const [, entry] of this.remoteFarmers) {
      (entry.label.material as THREE.SpriteMaterial).map?.dispose();
      entry.label.material.dispose();
    }
    if (this.localLabelSprite) {
      (this.localLabelSprite.material as THREE.SpriteMaterial).map?.dispose();
      this.localLabelSprite.material.dispose();
    }
    for (const [, entry] of this.floatingSprites) {
      (entry.sprite.material as THREE.SpriteMaterial).map?.dispose();
      entry.sprite.material.dispose();
    }
    (this.beanRingInst.material as THREE.Material).dispose();
    this.rainMesh.geometry.dispose();
    (this.rainMesh.material as THREE.Material).dispose();
    this.ambientSpecMesh.geometry.dispose();
    (this.ambientSpecMesh.material as THREE.Material).dispose();
    this.particleMesh.geometry.dispose();
    (this.particleMesh.material as THREE.Material).dispose();
    (this.hoverCursor.material as THREE.Material).dispose();
    (this.facingCursor.material as THREE.Material).dispose();
    this.rainbowGroup.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) {
        const m = obj as THREE.Mesh;
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    this.outerGround.geometry.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
