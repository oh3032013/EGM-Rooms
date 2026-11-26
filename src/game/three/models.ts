import * as THREE from 'three';
import { CROPS } from '../constants';
import { PLAYER_PALETTE } from '../multiplayer';
import type {
  CropInstance,
  NatureTreasureKind,
  ObstacleType,
  StructureInstance,
  ToolType,
  WildlifeKind,
} from '../types';
import type { MaterialLibrary } from './materials';

export class GeometryCache {
  private readonly items = new Map<string, THREE.BufferGeometry>();

  public get(key: string, factory: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let geo = this.items.get(key);
    if (!geo) {
      geo = factory();
      this.items.set(key, geo);
    }
    return geo;
  }

  public dispose(): void {
    for (const geo of this.items.values()) {
      geo.dispose();
    }
    this.items.clear();
  }
}

function createRoundedBox(w: number, h: number, d: number, radius = 0.04, bevel = 0.018): THREE.BufferGeometry {
  const r = Math.min(radius, w * 0.4, h * 0.4);
  const hw = Math.max(0.01, w / 2 - bevel);
  const hh = Math.max(0.01, h / 2 - bevel);
  const cr = Math.min(r, hw * 0.9, hh * 0.9);

  const shape = new THREE.Shape();
  shape.moveTo(-hw + cr, -hh);
  shape.lineTo(hw - cr, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + cr);
  shape.lineTo(hw, hh - cr);
  shape.quadraticCurveTo(hw, hh, hw - cr, hh);
  shape.lineTo(-hw + cr, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - cr);
  shape.lineTo(-hw, -hh + cr);
  shape.quadraticCurveTo(-hw, -hh, -hw + cr, -hh);

  const depth = Math.max(0.01, d - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 5,
  });
  geo.center();
  return geo;
}

/** Deterministic organic vertex displacement for realistic rocks, foliage, and wool */
function sculptOrganic(
  geo: THREE.BufferGeometry,
  amplitude: number,
  frequency: number,
  seed = 1
): THREE.BufferGeometry {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n1 = Math.sin(x * frequency + seed * 1.7) * Math.cos(y * frequency * 1.15 - seed);
    const n2 = Math.sin((z + x) * frequency * 1.6 + seed * 3.1) * 0.5;
    const disp = 1 + (n1 + n2) * amplitude;
    pos.setXYZ(i, x * disp, y * disp, z * disp);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Smooth continuous 10-rib fluted pumpkin geometry */
function createFlutedPumpkinGeo(radius: number): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(radius, 24, 16);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const ang = Math.atan2(z, x);
    const horiz = Math.hypot(x, z);
    const rib = 1 + Math.cos(ang * 10) * 0.085 * (horiz / Math.max(0.001, radius));
    // Slight top/bottom dimple
    const normY = y / radius;
    const squashY = normY > 0.72 || normY < -0.72 ? 0.78 : 0.85;
    pos.setXYZ(i, x * rib, y * squashY, z * rib);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function createHeartShapeGeo(size: number, depth = 0.025): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(0, -size * 0.4);
  s.bezierCurveTo(size * 0.65, -size * 0.05, size * 0.65, size * 0.6, 0, size * 0.25);
  s.bezierCurveTo(-size * 0.65, size * 0.6, -size * 0.65, -size * 0.05, 0, -size * 0.4);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelThickness: depth * 0.3,
    bevelSize: depth * 0.3,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geo.center();
  return geo;
}

function addShadowMesh(
  group: THREE.Group,
  geos: GeometryCache,
  mats: MaterialLibrary,
  radius = 0.42
): void {
  const shadow = new THREE.Mesh(
    geos.get(`shadow:${radius}`, () => new THREE.CircleGeometry(radius, 18)),
    mats.contactShadowMat
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.018;
  group.add(shadow);
}

function enableShadows(obj: THREE.Object3D, cast = true, receive = true): void {
  obj.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const m = child as THREE.Mesh;
      if (m.material && (m.material as THREE.MeshBasicMaterial).depthWrite === false) return;
      m.castShadow = cast;
      m.receiveShadow = receive;
    }
  });
}

export function createFarmhouseGroup(geos: GeometryCache, mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();

  // 1) Stone masonry plinth
  const plinth = new THREE.Mesh(
    geos.get('fh_plinth_v3', () => createRoundedBox(3.88, 0.36, 2.8, 0.06, 0.025)),
    mats.stoneMat
  );
  plinth.position.y = 0.18;
  g.add(plinth);

  // 2) Stucco plaster walls
  const walls = new THREE.Mesh(
    geos.get('fh_walls_v3', () => createRoundedBox(3.64, 1.56, 2.52, 0.04, 0.015)),
    mats.plasterMat
  );
  walls.position.y = 1.12;
  g.add(walls);

  // 3) Timber corner & mid structural beams
  const beamGeo = geos.get('fh_beam_v3', () => createRoundedBox(0.17, 1.62, 0.17, 0.02, 0.012));
  for (const [bx, bz] of [[-1.77, -1.21], [1.77, -1.21], [-1.77, 1.21], [1.77, 1.21]]) {
    const beam = new THREE.Mesh(beamGeo, mats.darkWoodMat);
    beam.position.set(bx, 1.13, bz);
    g.add(beam);
  }
  const wallPlate = new THREE.Mesh(
    geos.get('fh_crossBeam_v3', () => new THREE.BoxGeometry(3.72, 0.12, 2.6)),
    mats.darkWoodMat
  );
  wallPlate.position.y = 1.88;
  g.add(wallPlate);

  // 4) Overhanging shingled roof slopes + exposed rafter tails + ridge cap
  const roofSlopeGeo = geos.get('fh_roofSlope_v3', () => createRoundedBox(4.36, 0.14, 1.86, 0.03, 0.015));
  const roofFront = new THREE.Mesh(roofSlopeGeo, mats.roofMat);
  roofFront.position.set(0, 2.38, 0.74);
  roofFront.rotation.x = 0.56;
  g.add(roofFront);

  const roofBack = new THREE.Mesh(roofSlopeGeo, mats.roofMat);
  roofBack.position.set(0, 2.38, -0.74);
  roofBack.rotation.x = -0.56;
  g.add(roofBack);

  const rafterGeo = geos.get('fh_rafter', () => new THREE.BoxGeometry(0.08, 0.09, 3.36));
  for (let rx = -1.85; rx <= 1.85; rx += 0.62) {
    const rafter = new THREE.Mesh(rafterGeo, mats.darkWoodMat);
    rafter.position.set(rx, 1.9, 0);
    g.add(rafter);
  }

  const ridge = new THREE.Mesh(
    geos.get('fh_ridge_v3', () => new THREE.CylinderGeometry(0.11, 0.11, 4.44, 10)),
    mats.roofTrimMat
  );
  ridge.rotation.z = Math.PI / 2;
  ridge.position.set(0, 2.86, 0);
  g.add(ridge);

  // Gable siding
  const gableGeo = geos.get('fh_gable_v3', () => {
    const shape = new THREE.Shape();
    shape.moveTo(-1.26, 0);
    shape.lineTo(1.26, 0);
    shape.lineTo(0, 0.92);
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 3.62, bevelEnabled: false });
  });
  const gable = new THREE.Mesh(gableGeo, mats.woodMat);
  gable.rotation.y = Math.PI / 2;
  gable.position.set(-1.81, 1.9, 0);
  g.add(gable);

  // Attic circular dormer window
  const dormer = new THREE.Mesh(
    geos.get('fh_dormer_v3', () => new THREE.CylinderGeometry(0.24, 0.24, 0.36, 14)),
    mats.woodMat
  );
  dormer.rotation.x = Math.PI / 2;
  dormer.position.set(0, 2.32, 1.05);
  g.add(dormer);
  const dormerGlass = new THREE.Mesh(
    geos.get('fh_dormerGlass_v3', () => new THREE.CircleGeometry(0.17, 14)),
    mats.glassGlowMat
  );
  dormerGlass.position.set(0, 2.32, 1.24);
  g.add(dormerGlass);

  // 5) Brick chimney + stone crown + dual clay chimney pots
  const chimney = new THREE.Mesh(
    geos.get('fh_chimney_v3', () => createRoundedBox(0.54, 1.96, 0.54, 0.04, 0.018)),
    mats.brickMat
  );
  chimney.position.set(1.32, 2.62, -0.54);
  g.add(chimney);

  const chimneyCap = new THREE.Mesh(
    geos.get('fh_chimCap_v3', () => createRoundedBox(0.66, 0.13, 0.66, 0.03, 0.015)),
    mats.stoneMat
  );
  chimneyCap.position.set(1.32, 3.6, -0.54);
  g.add(chimneyCap);

  const potGeo = geos.get('fh_chimPot_v3', () => new THREE.CylinderGeometry(0.085, 0.11, 0.24, 10));
  for (const px of [1.21, 1.43]) {
    const pot = new THREE.Mesh(potGeo, mats.getSolid('#8c4034', 0.85, 0.02));
    pot.position.set(px, 3.74, -0.54);
    g.add(pot);
  }

  // 6) Covered porch deck, turned posts, railings, stone step, paneled oak door & iron hinges
  const porchDeck = new THREE.Mesh(
    geos.get('fh_porchDeck_v3', () => createRoundedBox(1.52, 0.22, 0.76, 0.03, 0.015)),
    mats.stoneMat
  );
  porchDeck.position.set(0, 0.11, 1.56);
  g.add(porchDeck);

  const frontStep = new THREE.Mesh(
    geos.get('fh_step_v3', () => createRoundedBox(0.9, 0.11, 0.28, 0.02, 0.01)),
    mats.stoneMat
  );
  frontStep.position.set(0, 0.055, 2.04);
  g.add(frontStep);

  const porchAwning = new THREE.Mesh(
    geos.get('fh_porchAwning_v3', () => createRoundedBox(1.56, 0.09, 0.84, 0.03, 0.015)),
    mats.roofMat
  );
  porchAwning.position.set(0, 1.66, 1.58);
  porchAwning.rotation.x = 0.22;
  g.add(porchAwning);

  const postGeo = geos.get('fh_porchPost_v3', () => {
    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.08, 0),
      new THREE.Vector2(0.08, 0.12),
      new THREE.Vector2(0.055, 0.2),
      new THREE.Vector2(0.055, 1.32),
      new THREE.Vector2(0.08, 1.42),
      new THREE.Vector2(0, 1.42),
    ];
    return new THREE.LatheGeometry(pts, 10);
  });
  for (const px of [-0.66, 0.66]) {
    const post = new THREE.Mesh(postGeo, mats.darkWoodMat);
    post.position.set(px, 0.2, 1.84);
    g.add(post);
  }

  // Porch side railings
  const railGeo = geos.get('fh_porchRail', () => new THREE.BoxGeometry(0.06, 0.06, 0.62));
  for (const px of [-0.66, 0.66]) {
    const rail = new THREE.Mesh(railGeo, mats.woodMat);
    rail.position.set(px, 0.62, 1.55);
    g.add(rail);
  }

  const doorFrame = new THREE.Mesh(
    geos.get('fh_doorFrame_v3', () => createRoundedBox(0.84, 1.24, 0.14, 0.03, 0.012)),
    mats.darkWoodMat
  );
  doorFrame.position.set(0, 0.94, 1.25);
  g.add(doorFrame);

  const door = new THREE.Mesh(
    geos.get('fh_door_v3', () => createRoundedBox(0.68, 1.12, 0.12, 0.025, 0.01)),
    mats.woodMat
  );
  door.position.set(0, 0.9, 1.28);
  g.add(door);

  const hingeGeo = geos.get('fh_hinge', () => new THREE.BoxGeometry(0.24, 0.045, 0.03));
  for (const hy of [0.58, 1.2]) {
    const h = new THREE.Mesh(hingeGeo, mats.ironMat);
    h.position.set(-0.2, hy, 1.35);
    g.add(h);
  }

  const knob = new THREE.Mesh(
    geos.get('fh_knob_v3', () => new THREE.SphereGeometry(0.045, 10, 8)),
    mats.brassMat
  );
  knob.position.set(0.22, 0.88, 1.36);
  g.add(knob);

  // 7) Shuttered windows + flower window boxes with leafy stems
  const winFrameGeo = geos.get('fh_winFrame_v3', () => createRoundedBox(0.68, 0.66, 0.1, 0.025, 0.012));
  const winGlassGeo = geos.get('fh_win_v3', () => new THREE.BoxGeometry(0.54, 0.52, 0.08));
  const shutterGeo = geos.get('fh_shutter_v3', () => createRoundedBox(0.16, 0.58, 0.06, 0.02, 0.01));
  const flowerBoxGeo = geos.get('fh_flowerBox_v3', () => createRoundedBox(0.74, 0.16, 0.22, 0.02, 0.01));
  const leafClusterGeo = geos.get('fh_leafClus', () => new THREE.IcosahedronGeometry(0.075, 1));
  const blossomGeo = geos.get('fh_blossom_v3', () => new THREE.DodecahedronGeometry(0.055, 0));
  const shutterMat = mats.getSolid('#3e6339', 0.8, 0.02);
  const foliageMat = mats.getSolid('#3b7a34', 0.82, 0.0);
  const blossomColors = ['#f472b6', '#fde047', '#fb7185'];

  for (const wx of [-1.08, 1.08]) {
    const frame = new THREE.Mesh(winFrameGeo, mats.darkWoodMat);
    frame.position.set(wx, 1.18, 1.25);
    g.add(frame);
    const glass = new THREE.Mesh(winGlassGeo, mats.glassGlowMat);
    glass.position.set(wx, 1.18, 1.27);
    g.add(glass);

    const mullionV = new THREE.Mesh(
      geos.get('fh_mulV_v3', () => new THREE.BoxGeometry(0.045, 0.54, 0.12)),
      mats.darkWoodMat
    );
    mullionV.position.set(wx, 1.18, 1.27);
    g.add(mullionV);
    const mullionH = new THREE.Mesh(
      geos.get('fh_mulH_v3', () => new THREE.BoxGeometry(0.56, 0.045, 0.12)),
      mats.darkWoodMat
    );
    mullionH.position.set(wx, 1.18, 1.27);
    g.add(mullionH);

    for (const sx of [-0.42, 0.42]) {
      const sh = new THREE.Mesh(shutterGeo, shutterMat);
      sh.position.set(wx + sx, 1.18, 1.27);
      g.add(sh);
    }

    const fb = new THREE.Mesh(flowerBoxGeo, mats.woodMat);
    fb.position.set(wx, 0.8, 1.34);
    g.add(fb);
    for (let b = -1; b <= 1; b++) {
      const lf = new THREE.Mesh(leafClusterGeo, foliageMat);
      lf.position.set(wx + b * 0.18, 0.89, 1.35);
      g.add(lf);
      const fl = new THREE.Mesh(blossomGeo, mats.getSolid(blossomColors[b + 1], 0.5, 0.0));
      fl.position.set(wx + b * 0.18, 0.94, 1.36);
      g.add(fl);
    }
  }

  // 8) Wrought-iron porch lantern
  const bracket = new THREE.Mesh(
    geos.get('fh_lanBracket_v3', () => new THREE.BoxGeometry(0.05, 0.05, 0.24)),
    mats.ironMat
  );
  bracket.position.set(0.58, 1.5, 1.36);
  g.add(bracket);
  const lanternBulb = new THREE.Mesh(
    geos.get('fh_lantern_v3', () => new THREE.CylinderGeometry(0.08, 0.06, 0.2, 6)),
    mats.glassGlowMat
  );
  lanternBulb.position.set(0.58, 1.38, 1.44);
  g.add(lanternBulb);

  enableShadows(g, true, true);
  return g;
}

export function createShopStallGroup(geos: GeometryCache, mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();

  const counter = new THREE.Mesh(
    geos.get('shop_counter_v3', () => createRoundedBox(2.74, 0.78, 1.62, 0.04, 0.015)),
    mats.woodMat
  );
  counter.position.y = 0.39;
  g.add(counter);

  const trim = new THREE.Mesh(
    geos.get('shop_trim_v3', () => createRoundedBox(2.8, 0.14, 1.68, 0.02, 0.01)),
    mats.darkWoodMat
  );
  trim.position.y = 0.12;
  g.add(trim);

  const counterTop = new THREE.Mesh(
    geos.get('shop_top_v3', () => createRoundedBox(2.9, 0.11, 1.78, 0.03, 0.015)),
    mats.darkWoodMat
  );
  counterTop.position.y = 0.82;
  g.add(counterTop);

  const postGeo = geos.get('shop_post_v3', () => new THREE.CylinderGeometry(0.065, 0.08, 1.38, 10));
  for (const [px, pz] of [[-1.26, -0.72], [1.26, -0.72], [-1.26, 0.72], [1.26, 0.72]]) {
    const p = new THREE.Mesh(postGeo, mats.darkWoodMat);
    p.position.set(px, 1.49, pz);
    g.add(p);
  }

  const awning = new THREE.Mesh(
    geos.get('shop_awning_v3', () => createRoundedBox(3.14, 0.1, 2.02, 0.03, 0.015)),
    mats.awningMat
  );
  awning.position.set(0, 2.22, 0.08);
  awning.rotation.x = 0.18;
  g.add(awning);

  const valanceGeo = geos.get('shop_valance_v3', () => new THREE.CylinderGeometry(0.14, 0.14, 0.07, 10));
  for (let i = -5; i <= 5; i++) {
    const sc = new THREE.Mesh(
      valanceGeo,
      mats.getFabric(i % 2 === 0 ? '#bf382c' : '#f5e8ce', 0.82)
    );
    sc.rotation.x = Math.PI / 2;
    sc.position.set(i * 0.28, 1.98, 1.06);
    g.add(sc);
  }

  const crateGeo = geos.get('shop_crate_v3', () => createRoundedBox(0.56, 0.2, 0.48, 0.025, 0.012));
  const fruitGeo = geos.get('shop_fruit_v3', () => new THREE.SphereGeometry(0.1, 12, 10));
  const crateDefs: [number, string][] = [
    [-0.8, '#e6b84c'],
    [0, '#dc2626'],
    [0.8, '#ea580c'],
  ];
  crateDefs.forEach(([cx, hex]) => {
    const crate = new THREE.Mesh(crateGeo, mats.darkWoodMat);
    crate.position.set(cx, 0.96, 0.28);
    crate.rotation.x = 0.16;
    g.add(crate);

    const fruitMat = mats.getSolid(hex, 0.4, 0.04);
    for (const [ox, oz] of [[-0.14, 0.2], [0.14, 0.2], [0, 0.36]]) {
      const f = new THREE.Mesh(fruitGeo, fruitMat);
      f.scale.set(1.05, 0.88, 1.05);
      f.position.set(cx + ox, 1.11, oz);
      g.add(f);
    }
  });

  const sign = new THREE.Mesh(
    geos.get('shop_sign_v3', () => new THREE.CylinderGeometry(0.24, 0.24, 0.06, 20)),
    mats.brassMat
  );
  sign.rotation.x = Math.PI / 2;
  sign.position.set(0, 1.78, 0.98);
  g.add(sign);

  const board = new THREE.Mesh(
    geos.get('shop_board_v3', () => createRoundedBox(0.1, 0.62, 0.48, 0.02, 0.01)),
    mats.getSolid('#1e293b', 0.88, 0.02)
  );
  board.position.set(1.42, 0.56, 0.35);
  board.rotation.z = -0.15;
  g.add(board);

  enableShadows(g, true, true);
  return g;
}

export function createWellGroup(geos: GeometryCache, mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();

  const rim = new THREE.Mesh(
    geos.get('well_lathe_v3', () => {
      const pts = [
        new THREE.Vector2(0.36, 0),
        new THREE.Vector2(0.5, 0),
        new THREE.Vector2(0.47, 0.12),
        new THREE.Vector2(0.46, 0.52),
        new THREE.Vector2(0.51, 0.58),
        new THREE.Vector2(0.42, 0.62),
        new THREE.Vector2(0.35, 0.56),
        new THREE.Vector2(0.35, 0.25),
      ];
      return new THREE.LatheGeometry(pts, 20);
    }),
    mats.stoneMat
  );
  g.add(rim);

  const water = new THREE.Mesh(
    geos.get('well_water_v3', () => new THREE.CircleGeometry(0.37, 20)),
    mats.waterMat
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.38;
  g.add(water);

  const postGeo = geos.get('well_post_v3', () => new THREE.CylinderGeometry(0.055, 0.065, 1.0, 10));
  for (const px of [-0.4, 0.4]) {
    const post = new THREE.Mesh(postGeo, mats.darkWoodMat);
    post.position.set(px, 0.96, 0);
    g.add(post);
  }
  const axle = new THREE.Mesh(
    geos.get('well_axle_v3', () => new THREE.CylinderGeometry(0.04, 0.04, 0.96, 10)),
    mats.ironMat
  );
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 1.15;
  g.add(axle);

  // Coiled hemp rope around windlass
  const ropeMat = mats.getFabric('#d6b984', 0.92);
  const coilGeo = geos.get('well_coil', () => new THREE.TorusGeometry(0.065, 0.018, 6, 14));
  for (const cx of [-0.06, -0.02, 0.02, 0.06]) {
    const coil = new THREE.Mesh(coilGeo, ropeMat);
    coil.rotation.y = Math.PI / 2;
    coil.position.set(cx, 1.15, 0);
    g.add(coil);
  }

  const rSlopeGeo = geos.get('well_rSlope_v3', () => createRoundedBox(1.06, 0.07, 0.58, 0.02, 0.01));
  const rf = new THREE.Mesh(rSlopeGeo, mats.roofMat);
  rf.position.set(0, 1.62, 0.21);
  rf.rotation.x = 0.58;
  g.add(rf);
  const rb = new THREE.Mesh(rSlopeGeo, mats.roofMat);
  rb.position.set(0, 1.62, -0.21);
  rb.rotation.x = -0.58;
  g.add(rb);

  const bucket = new THREE.Mesh(
    geos.get('well_bucket_v3', () => new THREE.CylinderGeometry(0.12, 0.09, 0.2, 12)),
    mats.woodMat
  );
  bucket.position.set(0, 0.78, 0);
  g.add(bucket);
  const rope = new THREE.Mesh(
    geos.get('well_rope_v3', () => new THREE.CylinderGeometry(0.015, 0.015, 0.36, 6)),
    ropeMat
  );
  rope.position.set(0, 0.98, 0);
  g.add(rope);

  enableShadows(g, true, true);
  return g;
}

export function createShippingBinGroup(geos: GeometryCache, mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();

  const body = new THREE.Mesh(
    geos.get('bin_body_v3', () => createRoundedBox(0.84, 0.52, 0.72, 0.04, 0.015)),
    mats.woodMat
  );
  body.position.y = 0.26;
  g.add(body);

  const lid = new THREE.Mesh(
    geos.get('bin_lid_vault_v3', () => new THREE.CylinderGeometry(0.37, 0.37, 0.88, 16, 1, false, 0, Math.PI)),
    mats.darkWoodMat
  );
  lid.rotation.z = Math.PI / 2;
  lid.position.y = 0.51;
  g.add(lid);

  const strapGeo = geos.get('bin_strap_v3', () => createRoundedBox(0.08, 0.56, 0.76, 0.02, 0.01));
  for (const sx of [-0.31, 0.31]) {
    const strap = new THREE.Mesh(strapGeo, mats.ironMat);
    strap.position.set(sx, 0.3, 0);
    g.add(strap);
  }

  const latch = new THREE.Mesh(
    geos.get('bin_latch_v3', () => createRoundedBox(0.18, 0.16, 0.09, 0.03, 0.015)),
    mats.brassMat
  );
  latch.position.set(0, 0.46, 0.37);
  g.add(latch);

  enableShadows(g, true, true);
  return g;
}

export function createForestTreeGroup(
  geos: GeometryCache,
  mats: MaterialLibrary,
  variant = 0
): THREE.Group {
  const g = new THREE.Group();
  const s = 0.92 + (variant % 3) * 0.12;
  const isBroadleaf = variant % 2 === 1;

  // Natural furrowed bark trunk with flared root buttresses
  const trunk = new THREE.Mesh(
    geos.get('tree_trunk_v3', () => {
      const pts = [
        new THREE.Vector2(0.0, 0),
        new THREE.Vector2(0.32, 0),
        new THREE.Vector2(0.22, 0.16),
        new THREE.Vector2(0.16, 0.55),
        new THREE.Vector2(0.12, 1.0),
        new THREE.Vector2(0.0, 1.0),
      ];
      return new THREE.LatheGeometry(pts, 12);
    }),
    mats.barkMat
  );
  trunk.scale.setScalar(s);
  g.add(trunk);

  if (isBroadleaf) {
    // Organic branching arms
    const branchGeo = geos.get('tree_branch', () => new THREE.CylinderGeometry(0.055, 0.09, 0.55, 8));
    for (const [bx, bz, rz, rx] of [[-0.14, 0.08, 0.55, 0.25], [0.16, -0.06, -0.5, -0.2]]) {
      const br = new THREE.Mesh(branchGeo, mats.barkMat);
      br.scale.setScalar(s);
      br.position.set(bx * s, 0.95 * s, bz * s);
      br.rotation.set(rx, 0, rz);
      g.add(br);
    }

    // Displaced natural foliage clusters (no geometric spheres/icosahedron facets)
    const canopyGeo = geos.get('tree_canopy_org', () =>
      sculptOrganic(new THREE.IcosahedronGeometry(1, 2), 0.16, 3.2, 4)
    );
    const puffs: [number, number, number, number, THREE.MeshStandardMaterial][] = [
      [0, 1.44 * s, 0, 0.62 * s, mats.treeMidMat],
      [-0.36 * s, 1.28 * s, 0.22 * s, 0.45 * s, mats.treeDarkMat],
      [0.38 * s, 1.3 * s, -0.18 * s, 0.43 * s, mats.treeDarkMat],
      [0.06 * s, 1.76 * s, 0.12 * s, 0.41 * s, mats.treeLightMat],
    ];
    for (const [px, py, pz, r, mat] of puffs) {
      const c = new THREE.Mesh(canopyGeo, mat);
      c.scale.set(r * 1.1, r * 0.88, r * 1.1);
      c.position.set(px, py, pz);
      g.add(c);
    }
  } else {
    // Organic sculpted pine bough skirts
    const pineTierGeo1 = geos.get('tree_pine1_org', () =>
      sculptOrganic(new THREE.ConeGeometry(0.74, 0.94, 14, 4), 0.09, 5.2, 1)
    );
    const pineTierGeo2 = geos.get('tree_pine2_org', () =>
      sculptOrganic(new THREE.ConeGeometry(0.56, 0.82, 14, 4), 0.09, 5.6, 2)
    );
    const pineTierGeo3 = geos.get('tree_pine3_org', () =>
      sculptOrganic(new THREE.ConeGeometry(0.35, 0.6, 12, 3), 0.08, 6.0, 3)
    );

    const tier1 = new THREE.Mesh(pineTierGeo1, mats.treeDarkMat);
    tier1.position.y = 1.06 * s;
    tier1.scale.setScalar(s);
    g.add(tier1);

    const tier2 = new THREE.Mesh(pineTierGeo2, mats.treeMidMat);
    tier2.position.y = 1.54 * s;
    tier2.scale.setScalar(s);
    g.add(tier2);

    const tier3 = new THREE.Mesh(pineTierGeo3, mats.treeLightMat);
    tier3.position.y = 1.98 * s;
    tier3.scale.setScalar(s);
    g.add(tier3);
  }

  enableShadows(g, true, true);
  return g;
}

export interface FarmerModelRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftLeg: THREE.Mesh;
  rightLeg: THREE.Mesh;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  toolMeshes: Record<ToolType, THREE.Group>;
  hatBand: THREE.Mesh;
}

function buildToolMesh(tool: ToolType, geos: GeometryCache, mats: MaterialLibrary): THREE.Group {
  const tg = new THREE.Group();
  if (tool === 'hoe') {
    const handle = new THREE.Mesh(
      geos.get('tool_handle_v3', () => new THREE.CylinderGeometry(0.026, 0.032, 0.68, 10)),
      mats.woodMat
    );
    handle.position.set(0, -0.18, 0.19);
    handle.rotation.x = Math.PI / 3;
    tg.add(handle);

    const collar = new THREE.Mesh(
      geos.get('tool_collar_v3', () => new THREE.CylinderGeometry(0.038, 0.038, 0.07, 10)),
      mats.brassMat
    );
    collar.position.set(0, -0.32, 0.4);
    collar.rotation.x = Math.PI / 3;
    tg.add(collar);

    const blade = new THREE.Mesh(
      geos.get('tool_hoeBlade_v3', () => createRoundedBox(0.08, 0.04, 0.24, 0.02, 0.008)),
      mats.ironMat
    );
    blade.position.set(0, -0.36, 0.45);
    blade.rotation.x = 0.2;
    tg.add(blade);
  } else if (tool === 'axe') {
    const handle = new THREE.Mesh(
      geos.get('tool_handle_v3', () => new THREE.CylinderGeometry(0.026, 0.032, 0.68, 10)),
      mats.woodMat
    );
    handle.position.set(0, -0.18, 0.19);
    handle.rotation.x = Math.PI / 3;
    tg.add(handle);

    const head = new THREE.Mesh(
      geos.get('tool_axeHead_v3', () => {
        const shape = new THREE.Shape();
        shape.moveTo(-0.04, -0.09);
        shape.lineTo(0.14, -0.12);
        shape.quadraticCurveTo(0.18, 0, 0.14, 0.12);
        shape.lineTo(-0.04, 0.09);
        shape.closePath();
        const geo = new THREE.ExtrudeGeometry(shape, {
          depth: 0.055,
          bevelEnabled: true,
          bevelThickness: 0.012,
          bevelSize: 0.012,
          bevelSegments: 2,
        });
        geo.center();
        return geo;
      }),
      mats.ironMat
    );
    head.rotation.y = Math.PI / 2;
    head.position.set(0, -0.35, 0.44);
    tg.add(head);
  } else {
    const pot = new THREE.Mesh(
      geos.get('can_pot_v3', () => {
        const pts = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.12, 0),
          new THREE.Vector2(0.135, 0.12),
          new THREE.Vector2(0.1, 0.22),
          new THREE.Vector2(0.118, 0.24),
          new THREE.Vector2(0.08, 0.24),
        ];
        return new THREE.LatheGeometry(pts, 16);
      }),
      mats.copperMat
    );
    pot.position.set(0, -0.34, 0.18);
    tg.add(pot);

    const spout = new THREE.Mesh(
      geos.get('can_spout_v3', () => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, -0.28, 0.27),
          new THREE.Vector3(0, -0.22, 0.39),
          new THREE.Vector3(0, -0.12, 0.48),
        ]);
        return new THREE.TubeGeometry(curve, 12, 0.023, 8, false);
      }),
      mats.copperMat
    );
    tg.add(spout);

    const rose = new THREE.Mesh(
      geos.get('can_rose_v3', () => new THREE.CylinderGeometry(0.055, 0.025, 0.06, 12)),
      mats.brassMat
    );
    rose.position.set(0, -0.1, 0.5);
    rose.rotation.x = Math.PI / 3;
    tg.add(rose);

    const handle = new THREE.Mesh(
      geos.get('can_arch_v3', () => {
        const curve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, -0.14, 0.1),
          new THREE.Vector3(0, -0.05, 0.16),
          new THREE.Vector3(0, -0.12, 0.24),
        ]);
        return new THREE.TubeGeometry(curve, 12, 0.018, 6, false);
      }),
      mats.copperMat
    );
    tg.add(handle);
  }
  return tg;
}

export function createFarmerRig(
  colorIndex: number,
  geos: GeometryCache,
  mats: MaterialLibrary
): FarmerModelRig {
  const palette = PLAYER_PALETTE[colorIndex % PLAYER_PALETTE.length];
  const root = new THREE.Group();
  addShadowMesh(root, geos, mats, 0.38);

  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const overallsMat = mats.getFabric(palette.overalls, 0.85);
  const shirtMat = mats.getFabric(palette.shirt, 0.82);
  const skinMat = mats.getSolid('#f0bfa0', 0.65, 0.0);
  const cheekMat = mats.getSolid('#e88a7d', 0.72, 0.0);
  const bootMat = mats.getSolid('#4a2c16', 0.72, 0.06);
  const hairMat = mats.getSolid('#4a2d18', 0.85, 0.02);
  const strawMat = mats.getFabric('#e2be6b', 0.9);
  const bandMat = mats.getSolid(palette.badge, 0.4, 0.2);

  // Anatomical tapered trouser legs + leather work boots
  const legGeo = geos.get('farmer_leg_v3', () => {
    const pts = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.078, 0),
      new THREE.Vector2(0.072, 0.09), // boot collar
      new THREE.Vector2(0.068, 0.24), // trouser thigh
      new THREE.Vector2(0, 0.24),
    ];
    return new THREE.LatheGeometry(pts, 12);
  });
  const leftLeg = new THREE.Mesh(legGeo, bootMat);
  leftLeg.position.set(-0.095, 0.01, 0);
  bodyPivot.add(leftLeg);

  const rightLeg = new THREE.Mesh(legGeo, bootMat);
  rightLeg.position.set(0.095, 0.01, 0);
  bodyPivot.add(rightLeg);

  // Sculpted torso (smooth chest/waist lathe + denim overalls bib & straps)
  const torso = new THREE.Mesh(
    geos.get('farmer_torso_v3', () => new THREE.CapsuleGeometry(0.175, 0.16, 6, 14)),
    shirtMat
  );
  torso.scale.set(1.06, 1.0, 0.78);
  torso.position.y = 0.44;
  bodyPivot.add(torso);

  const bib = new THREE.Mesh(
    geos.get('farmer_bib_v3', () => new THREE.CylinderGeometry(0.182, 0.195, 0.24, 14)),
    overallsMat
  );
  bib.scale.set(1.06, 1.0, 0.8);
  bib.position.y = 0.35;
  bodyPivot.add(bib);

  const strapGeo = geos.get('farmer_strap_v3', () => createRoundedBox(0.055, 0.18, 0.26, 0.02, 0.01));
  for (const sx of [-0.095, 0.095]) {
    const s = new THREE.Mesh(strapGeo, overallsMat);
    s.position.set(sx, 0.51, 0);
    bodyPivot.add(s);
    const btn = new THREE.Mesh(
      geos.get('farmer_btn_v3', () => new THREE.SphereGeometry(0.022, 8, 6)),
      mats.brassMat
    );
    btn.position.set(sx, 0.46, 0.142);
    bodyPivot.add(btn);
  }

  // Smooth Capsule arms + sculpted spherical hands
  const armGeo = geos.get('farmer_arm_v3', () => new THREE.CapsuleGeometry(0.055, 0.16, 5, 10));
  const handGeo = geos.get('farmer_hand_v3', () => new THREE.SphereGeometry(0.052, 10, 8));

  const leftArm = new THREE.Group();
  leftArm.position.set(-0.23, 0.55, 0);
  const leftArmMesh = new THREE.Mesh(armGeo, shirtMat);
  leftArmMesh.position.y = -0.1;
  leftArm.add(leftArmMesh);
  const leftHand = new THREE.Mesh(handGeo, skinMat);
  leftHand.position.y = -0.23;
  leftArm.add(leftHand);
  bodyPivot.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.23, 0.55, 0);
  const rightArmMesh = new THREE.Mesh(armGeo, shirtMat);
  rightArmMesh.position.y = -0.1;
  rightArm.add(rightArmMesh);
  const rightHand = new THREE.Mesh(handGeo, skinMat);
  rightHand.position.y = -0.23;
  rightArm.add(rightHand);

  const toolMeshes: Record<ToolType, THREE.Group> = {
    hoe: buildToolMesh('hoe', geos, mats),
    watering_can: buildToolMesh('watering_can', geos, mats),
    axe: buildToolMesh('axe', geos, mats),
  };
  rightArm.add(toolMeshes.hoe);
  rightArm.add(toolMeshes.watering_can);
  rightArm.add(toolMeshes.axe);
  toolMeshes.hoe.visible = false;
  toolMeshes.watering_can.visible = false;
  toolMeshes.axe.visible = false;
  bodyPivot.add(rightArm);

  // Smooth anatomical head + neck + ears + hair + sclera/iris eyes
  const neck = new THREE.Mesh(
    geos.get('farmer_neck', () => new THREE.CylinderGeometry(0.065, 0.075, 0.08, 10)),
    skinMat
  );
  neck.position.y = 0.64;
  bodyPivot.add(neck);

  const head = new THREE.Mesh(
    geos.get('farmer_head_v3', () => new THREE.SphereGeometry(0.165, 16, 14)),
    skinMat
  );
  head.scale.set(0.98, 1.04, 0.96);
  head.position.y = 0.79;
  bodyPivot.add(head);

  const hair = new THREE.Mesh(
    geos.get('farmer_hair_v3', () => new THREE.SphereGeometry(0.172, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62)),
    hairMat
  );
  hair.position.set(0, 0.81, -0.02);
  hair.rotation.x = -0.22;
  bodyPivot.add(hair);

  const earGeo = geos.get('farmer_ear', () => new THREE.SphereGeometry(0.032, 8, 6));
  const scleraGeo = geos.get('farmer_sclera', () => new THREE.SphereGeometry(0.032, 8, 8));
  const irisGeo = geos.get('farmer_iris', () => new THREE.SphereGeometry(0.021, 8, 8));
  const cheekGeo = geos.get('farmer_cheek_v3', () => new THREE.SphereGeometry(0.028, 8, 6));
  const scleraMat = mats.getSolid('#ffffff', 0.2, 0.0);
  const irisMat = mats.getSolid('#1c1917', 0.1, 0.1);

  const nose = new THREE.Mesh(
    geos.get('farmer_nose_v3', () => new THREE.SphereGeometry(0.032, 8, 8)),
    skinMat
  );
  nose.scale.set(0.9, 1.1, 1.1);
  nose.position.set(0, 0.77, 0.162);
  bodyPivot.add(nose);

  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.scale.set(0.55, 1.0, 0.8);
    ear.position.set(sx * 0.16, 0.78, 0);
    bodyPivot.add(ear);

    const sclera = new THREE.Mesh(scleraGeo, scleraMat);
    sclera.scale.set(1.0, 1.15, 0.65);
    sclera.position.set(sx * 0.062, 0.8, 0.145);
    bodyPivot.add(sclera);

    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.set(sx * 0.062, 0.8, 0.158);
    bodyPivot.add(iris);

    const cheek = new THREE.Mesh(cheekGeo, cheekMat);
    cheek.scale.set(1.2, 0.7, 0.5);
    cheek.position.set(sx * 0.095, 0.74, 0.135);
    bodyPivot.add(cheek);
  }

  // Natural curved straw sunhat
  const brim = new THREE.Mesh(
    geos.get('farmer_brim_v3', () => {
      const pts = [
        new THREE.Vector2(0.16, 0.032),
        new THREE.Vector2(0.26, 0.015),
        new THREE.Vector2(0.36, -0.004),
        new THREE.Vector2(0.37, -0.018),
        new THREE.Vector2(0.16, 0.012),
      ];
      return new THREE.LatheGeometry(pts, 22);
    }),
    strawMat
  );
  brim.position.y = 0.915;
  bodyPivot.add(brim);

  const hatBand = new THREE.Mesh(
    geos.get('farmer_band_v3', () => new THREE.CylinderGeometry(0.186, 0.194, 0.052, 20)),
    bandMat
  );
  hatBand.position.y = 0.962;
  bodyPivot.add(hatBand);

  const crown = new THREE.Mesh(
    geos.get('farmer_crown_v3', () => {
      const pts = [
        new THREE.Vector2(0.184, 0),
        new THREE.Vector2(0.175, 0.085),
        new THREE.Vector2(0.125, 0.145),
        new THREE.Vector2(0.04, 0.135),
        new THREE.Vector2(0, 0.13),
      ];
      return new THREE.LatheGeometry(pts, 20);
    }),
    strawMat
  );
  crown.position.y = 0.95;
  bodyPivot.add(crown);

  enableShadows(root, true, true);
  return { root, bodyPivot, leftLeg, rightLeg, leftArm, rightArm, toolMeshes, hatBand };
}

export function createCropGroup(
  crop: CropInstance,
  geos: GeometryCache,
  mats: MaterialLibrary
): THREE.Group {
  const g = new THREE.Group();
  const def = CROPS[crop.type];
  const progress = Math.min(1, crop.growthDays / Math.max(1, def.daysToGrow));
  const stage = progress >= 1 ? 3 : progress >= 0.6 ? 2 : progress >= 0.25 ? 1 : 0;

  const leafHex = crop.withered ? '#8c724d' : '#438a35';
  const fruitHex = crop.withered ? '#6e5a41' : def.color;
  const accentHex = crop.withered ? '#8a7459' : def.accentColor;
  const leafMat = mats.getSolid(leafHex, 0.78, 0.0);
  const fruitMat = mats.getSolid(fruitHex, 0.36, 0.05);
  const accentMat = mats.getSolid(accentHex, 0.52, 0.02);

  if (stage === 0) {
    const stemGeo = geos.get('crop_spStem_v3', () => new THREE.CylinderGeometry(0.014, 0.02, 0.1, 6));
    const cotGeo = geos.get('crop_spLeaf_v3', () => new THREE.SphereGeometry(0.045, 8, 6));
    for (const [ox, oz] of [[-0.14, -0.12], [0.15, 0.1], [-0.08, 0.14]]) {
      const stem = new THREE.Mesh(stemGeo, leafMat);
      stem.position.set(ox, 0.05, oz);
      g.add(stem);
      for (const dir of [-1, 1]) {
        const lf = new THREE.Mesh(cotGeo, leafMat);
        lf.scale.set(1.4, 0.32, 0.8);
        lf.position.set(ox + dir * 0.045, 0.1, oz);
        lf.rotation.z = dir * -0.3;
        g.add(lf);
      }
    }
    enableShadows(g, true, true);
    return g;
  }

  if (crop.type === 'wheat' || crop.type === 'corn' || crop.type === 'lavender') {
    const stalkCount = stage === 1 ? 5 : 8;
    const h = (crop.type === 'corn' ? 0.76 : 0.5) * (0.45 + stage * 0.22);
    const stalkGeo = geos.get(`stalk_v3:${crop.type}:${stage}`, () =>
      new THREE.CylinderGeometry(0.02, 0.036, h, 7)
    );
    const bladeGeo = geos.get('crop_blade_v3', () => new THREE.SphereGeometry(0.085, 8, 6));

    for (let i = 0; i < stalkCount; i++) {
      const ang = (i / stalkCount) * Math.PI * 2;
      const r = i === 0 ? 0 : 0.17 + (i % 2) * 0.09;
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      const stalk = new THREE.Mesh(stalkGeo, stage >= 3 && crop.type === 'wheat' ? fruitMat : leafMat);
      stalk.position.set(x, h / 2, z);
      stalk.rotation.z = Math.cos(ang) * 0.09;
      g.add(stalk);

      if (crop.type === 'corn') {
        for (const side of [-1, 1]) {
          const blade = new THREE.Mesh(bladeGeo, leafMat);
          blade.scale.set(1.8, 0.24, 0.48);
          blade.position.set(x + Math.cos(ang + side) * 0.08, h * (0.42 + side * 0.1), z + Math.sin(ang + side) * 0.08);
          blade.rotation.y = -(ang + side);
          blade.rotation.z = -0.45;
          g.add(blade);
        }
      }

      if (stage >= 2) {
        if (crop.type === 'lavender') {
          for (let f = 0; f < 4; f++) {
            const floret = new THREE.Mesh(
              geos.get('lav_floret_v3', () => new THREE.SphereGeometry(0.044, 7, 6)),
              stage === 3 ? fruitMat : accentMat
            );
            floret.position.set(x, h + f * 0.055, z);
            g.add(floret);
          }
        } else if (crop.type === 'corn') {
          const cob = new THREE.Mesh(
            geos.get('corn_cob_v3', () => new THREE.CapsuleGeometry(0.044, 0.12, 5, 10)),
            stage === 3 ? fruitMat : accentMat
          );
          cob.position.set(x + Math.cos(ang) * 0.055, h * 0.65, z + Math.sin(ang) * 0.055);
          cob.rotation.z = -0.38;
          g.add(cob);
        } else {
          const ear = new THREE.Mesh(
            geos.get('wheat_ear_v3', () => new THREE.CapsuleGeometry(0.036, 0.11, 5, 8)),
            stage === 3 ? fruitMat : accentMat
          );
          ear.position.set(x, h + 0.06, z);
          ear.rotation.z = 0.22;
          g.add(ear);
        }
      }
    }
  } else if (crop.type === 'pumpkin' || crop.type === 'watermelon') {
    const leafGeo = geos.get('crop_vineLeaf_v3', () => createHeartShapeGeo(0.25, 0.02));
    for (const [lx, lz, rot] of [[-0.2, -0.16, 0.4], [0.22, 0.16, -0.3], [-0.16, 0.2, 1.1]]) {
      const lf = new THREE.Mesh(leafGeo, leafMat);
      lf.rotation.x = -Math.PI / 2;
      lf.rotation.z = rot;
      lf.position.set(lx, 0.035, lz);
      g.add(lf);
    }
    if (stage >= 2) {
      const rad = stage === 3 ? 0.22 : 0.13;
      if (crop.type === 'pumpkin') {
        const pumpkin = new THREE.Mesh(
          geos.get(`flutedPumpkin:${stage}`, () => createFlutedPumpkinGeo(rad)),
          fruitMat
        );
        pumpkin.position.set(0.03, rad * 0.82, 0.02);
        g.add(pumpkin);
      } else {
        const melon = new THREE.Mesh(
          geos.get(`melon_v3:${stage}`, () => new THREE.SphereGeometry(rad, 16, 12)),
          crop.withered ? fruitMat : mats.watermelonMat
        );
        melon.scale.set(1.24, 0.9, 0.96);
        melon.position.set(0.03, rad * 0.82, 0.02);
        g.add(melon);
      }
      const stem = new THREE.Mesh(
        geos.get('melon_stem_v3', () => new THREE.CylinderGeometry(0.02, 0.04, 0.11, 8)),
        mats.barkMat
      );
      stem.position.set(0.03, rad * 1.62, 0.02);
      stem.rotation.z = 0.24;
      g.add(stem);
    }
  } else if (crop.type === 'carrot') {
    const frondGeo = geos.get('carrot_frond_v3', () => new THREE.ConeGeometry(0.05, 0.25, 7));
    const rootGeo = geos.get('carrot_root_v3', () => new THREE.ConeGeometry(0.075, 0.19, 12));
    for (const [cx, cz] of [[-0.14, -0.1], [0.14, 0.12], [0, -0.14]]) {
      for (const tilt of [-0.28, 0.28]) {
        const frond = new THREE.Mesh(frondGeo, leafMat);
        frond.position.set(cx + tilt * 0.1, 0.14, cz);
        frond.rotation.z = tilt;
        g.add(frond);
      }
      if (stage >= 2) {
        const root = new THREE.Mesh(rootGeo, fruitMat);
        root.rotation.x = Math.PI;
        root.position.set(cx, 0.07, cz);
        g.add(root);
      }
    }
  } else {
    // Bush / trellis crops: tomato, strawberry, bean
    const bushRad = stage === 1 ? 0.15 : stage === 2 ? 0.21 : 0.25;
    const bushGeo = geos.get(`bush_v3:${stage}`, () =>
      sculptOrganic(new THREE.IcosahedronGeometry(bushRad, 2), 0.14, 12, 2)
    );
    for (const [bx, by, bz, sc] of [
      [0, bushRad * 0.95, 0, 1],
      [-bushRad * 0.55, bushRad * 0.65, bushRad * 0.35, 0.72],
      [bushRad * 0.52, bushRad * 0.7, -bushRad * 0.3, 0.74],
    ]) {
      const b = new THREE.Mesh(bushGeo, leafMat);
      b.scale.setScalar(sc);
      b.position.set(bx, by, bz);
      g.add(b);
    }
    if (crop.type === 'tomato' || crop.type === 'bean') {
      const stake = new THREE.Mesh(
        geos.get('crop_stake_v3', () => new THREE.CylinderGeometry(0.022, 0.028, 0.62, 7)),
        mats.woodMat
      );
      stake.position.set(-0.08, 0.31, -0.05);
      g.add(stake);
    }
    if (stage >= 2) {
      const berryGeo = geos.get('crop_berry_v3', () =>
        crop.type === 'bean'
          ? new THREE.CapsuleGeometry(0.034, 0.12, 5, 8)
          : new THREE.SphereGeometry(0.068, 12, 10)
      );
      const bMat = stage === 3 ? fruitMat : accentMat;
      for (const [bx, by, bz] of [[0.15, 0.26, 0.15], [-0.14, 0.22, 0.16], [0.06, 0.35, -0.14]]) {
        const b = new THREE.Mesh(berryGeo, bMat);
        b.position.set(bx, by, bz);
        if (crop.type === 'strawberry') b.scale.set(0.9, 1.15, 0.9);
        g.add(b);
      }
    }
  }

  enableShadows(g, true, true);
  return g;
}

export function createObstacleGroup(
  obstacle: ObstacleType,
  geos: GeometryCache,
  mats: MaterialLibrary
): THREE.Group {
  const g = new THREE.Group();
  if (obstacle === 'weed') {
    const bladeGeo = geos.get('obs_weedBlade_v3', () => new THREE.ConeGeometry(0.055, 0.34, 7));
    const weedMat = mats.getSolid('#4a8a32', 0.86, 0.0);
    const puffMat = mats.getSolid('#fef08a', 0.65, 0.0);
    for (const [wx, wz, rx, rz] of [
      [-0.1, 0, 0.24, -0.28],
      [0.12, 0.08, -0.24, 0.22],
      [0, -0.1, -0.18, -0.15],
      [0.04, 0.02, 0.08, 0.12],
    ]) {
      const b = new THREE.Mesh(bladeGeo, weedMat);
      b.position.set(wx, 0.16, wz);
      b.rotation.set(rx, 0, rz);
      g.add(b);
    }
    const puff = new THREE.Mesh(
      geos.get('obs_weedFlower_v3', () => new THREE.SphereGeometry(0.05, 8, 8)),
      puffMat
    );
    puff.position.set(0.05, 0.32, 0.04);
    g.add(puff);
  } else if (obstacle === 'rock') {
    // True organic weathered boulder with moss cap
    const rockMat = mats.getSolid('#767d82', 0.88, 0.06);
    const mossMat = mats.getSolid('#4a783c', 0.92, 0.0);
    const main = new THREE.Mesh(
      geos.get('obs_rockMain_v3', () =>
        sculptOrganic(new THREE.IcosahedronGeometry(0.28, 2), 0.18, 9.5, 5)
      ),
      rockMat
    );
    main.scale.set(1.15, 0.72, 0.95);
    main.position.set(-0.04, 0.15, 0.02);
    main.rotation.set(0.2, 0.7, 0.1);
    g.add(main);
    const moss = new THREE.Mesh(
      geos.get('obs_rockMoss_v3', () =>
        sculptOrganic(new THREE.SphereGeometry(0.18, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), 0.12, 12, 6)
      ),
      mossMat
    );
    moss.position.set(-0.06, 0.24, 0.02);
    g.add(moss);
    const sub = new THREE.Mesh(
      geos.get('obs_rockSub_v3', () =>
        sculptOrganic(new THREE.IcosahedronGeometry(0.15, 2), 0.16, 11, 7)
      ),
      rockMat
    );
    sub.position.set(0.22, 0.1, -0.1);
    g.add(sub);
  } else {
    const bark = new THREE.Mesh(
      geos.get('obs_stumpLathe_v3', () => {
        const pts = [
          new THREE.Vector2(0, 0),
          new THREE.Vector2(0.36, 0),
          new THREE.Vector2(0.26, 0.12),
          new THREE.Vector2(0.22, 0.34),
          new THREE.Vector2(0, 0.34),
        ];
        return new THREE.LatheGeometry(pts, 14);
      }),
      mats.barkMat
    );
    g.add(bark);
    const heart = new THREE.Mesh(
      geos.get('obs_stumpTop_v3', () => new THREE.CylinderGeometry(0.2, 0.2, 0.03, 14)),
      mats.stumpTopMat
    );
    heart.position.y = 0.345;
    g.add(heart);

    const shelf = new THREE.Mesh(
      geos.get('obs_shelf_v3', () => new THREE.SphereGeometry(0.08, 8, 6)),
      mats.getSolid('#fde68a', 0.7, 0.0)
    );
    shelf.scale.set(1.1, 0.35, 0.8);
    shelf.position.set(0.22, 0.18, 0.08);
    g.add(shelf);
  }
  enableShadows(g, true, true);
  return g;
}

export function createStructureGroup(
  structure: StructureInstance,
  geos: GeometryCache,
  mats: MaterialLibrary
): THREE.Group {
  const g = new THREE.Group();
  const type = structure.type;

  switch (type) {
    case 'fence': {
      const postGeo = geos.get('fence_post_v3', () => new THREE.CylinderGeometry(0.065, 0.075, 0.56, 10));
      const capGeo = geos.get('fence_cap_v3', () => new THREE.ConeGeometry(0.075, 0.08, 10));
      for (const fx of [-0.32, 0.32]) {
        const p = new THREE.Mesh(postGeo, mats.woodMat);
        p.position.set(fx, 0.28, 0);
        g.add(p);
        const cap = new THREE.Mesh(capGeo, mats.darkWoodMat);
        cap.position.set(fx, 0.6, 0);
        g.add(cap);
      }
      const railGeo = geos.get('fence_rail_v3', () => createRoundedBox(0.96, 0.08, 0.07, 0.02, 0.01));
      for (const ry of [0.22, 0.44]) {
        const r = new THREE.Mesh(railGeo, mats.darkWoodMat);
        r.position.set(0, ry, 0);
        g.add(r);
      }
      break;
    }
    case 'scarecrow': {
      const post = new THREE.Mesh(
        geos.get('sc_post_v3', () => new THREE.CylinderGeometry(0.05, 0.065, 1.05, 10)),
        mats.barkMat
      );
      post.position.y = 0.52;
      g.add(post);
      const arms = new THREE.Mesh(
        geos.get('sc_arms_v3', () => new THREE.CylinderGeometry(0.035, 0.035, 0.82, 8)),
        mats.woodMat
      );
      arms.rotation.z = Math.PI / 2;
      arms.position.y = 0.7;
      g.add(arms);
      const coat = new THREE.Mesh(
        geos.get('sc_coat_v3', () => new THREE.ConeGeometry(0.25, 0.5, 12)),
        mats.getFabric('#b85239', 0.9)
      );
      coat.position.y = 0.56;
      g.add(coat);
      const head = new THREE.Mesh(
        geos.get('sc_head_v3', () => createFlutedPumpkinGeo(0.16)),
        mats.getSolid('#de6f1f', 0.52, 0.0)
      );
      head.position.y = 0.94;
      g.add(head);
      const brim = new THREE.Mesh(
        geos.get('sc_hatBrim_v3', () => new THREE.CylinderGeometry(0.28, 0.3, 0.03, 14)),
        mats.getFabric('#d4af57', 0.9)
      );
      brim.position.y = 1.06;
      g.add(brim);
      const hat = new THREE.Mesh(
        geos.get('sc_hat_v3', () => new THREE.ConeGeometry(0.17, 0.22, 12)),
        mats.getFabric('#d4af57', 0.9)
      );
      hat.position.y = 1.18;
      hat.rotation.z = 0.14;
      g.add(hat);
      break;
    }
    case 'lantern': {
      const base = new THREE.Mesh(
        geos.get('lan_base_v3', () => createRoundedBox(0.34, 0.14, 0.34, 0.04, 0.02)),
        mats.stoneMat
      );
      base.position.y = 0.07;
      g.add(base);
      const pillar = new THREE.Mesh(
        geos.get('lan_pillar_v3', () => new THREE.CylinderGeometry(0.065, 0.09, 0.56, 10)),
        mats.ironMat
      );
      pillar.position.y = 0.41;
      g.add(pillar);
      const glow = new THREE.Mesh(
        geos.get('lan_glow_v3', () => new THREE.CylinderGeometry(0.13, 0.11, 0.24, 8)),
        mats.glassGlowMat
      );
      glow.position.y = 0.78;
      g.add(glow);
      const cap = new THREE.Mesh(
        geos.get('lan_cap_v3', () => new THREE.ConeGeometry(0.22, 0.16, 8)),
        mats.ironMat
      );
      cap.position.y = 0.96;
      g.add(cap);
      break;
    }
    case 'flowerbed': {
      const box = new THREE.Mesh(
        geos.get('fb_box_v3', () => createRoundedBox(0.86, 0.2, 0.86, 0.04, 0.02)),
        mats.woodMat
      );
      box.position.y = 0.1;
      g.add(box);
      const dirt = new THREE.Mesh(
        geos.get('fb_dirt_v3', () => createRoundedBox(0.74, 0.05, 0.74, 0.02, 0.01)),
        mats.tilledWetMat
      );
      dirt.position.y = 0.19;
      g.add(dirt);
      const stemGeo = geos.get('fb_stem_v3', () => new THREE.CylinderGeometry(0.015, 0.02, 0.12, 6));
      const flowerGeo = geos.get('fb_flower_v3', () => new THREE.SphereGeometry(0.075, 10, 8));
      const stemMat = mats.getSolid('#3f7d32', 0.85, 0.0);
      const fColors = ['#f472b6', '#fde047', '#fb7185', '#c084fc'];
      [[-0.2, -0.2], [0.2, -0.18], [-0.18, 0.2], [0.18, 0.2]].forEach(([fx, fz], idx) => {
        const st = new THREE.Mesh(stemGeo, stemMat);
        st.position.set(fx, 0.25, fz);
        g.add(st);
        const fl = new THREE.Mesh(flowerGeo, mats.getSolid(fColors[idx], 0.45, 0.0));
        fl.scale.set(1.15, 0.7, 1.15);
        fl.position.set(fx, 0.32, fz);
        g.add(fl);
      });
      break;
    }
    case 'stone_path': {
      const tileGeo = geos.get('sp_tile_v3', () => new THREE.CylinderGeometry(0.18, 0.21, 0.05, 10));
      for (const [sx, sz, s] of [
        [-0.22, -0.2, 1.0],
        [0.2, -0.18, 0.9],
        [-0.16, 0.2, 1.05],
        [0.22, 0.18, 0.85],
        [0, 0, 0.78],
      ]) {
        const st = new THREE.Mesh(tileGeo, mats.stoneMat);
        st.scale.set(s, 1, s * 0.9);
        st.position.set(sx, 0.025, sz);
        g.add(st);
      }
      break;
    }
    case 'sprinkler':
    case 'drip_sprinkler': {
      const collar = new THREE.Mesh(
        geos.get('spr_collar_v3', () => new THREE.CylinderGeometry(0.14, 0.16, 0.06, 12)),
        mats.stoneMat
      );
      collar.position.y = 0.03;
      g.add(collar);
      const stem = new THREE.Mesh(
        geos.get('spr_stem_v3', () => new THREE.CylinderGeometry(0.05, 0.08, 0.36, 12)),
        mats.copperMat
      );
      stem.position.y = 0.21;
      g.add(stem);
      const head = new THREE.Mesh(
        geos.get('spr_head_v3', () => createRoundedBox(0.42, 0.06, 0.08, 0.02, 0.01)),
        mats.brassMat
      );
      head.position.y = 0.41;
      head.name = 'spin_head';
      g.add(head);
      const solar = new THREE.Mesh(
        geos.get('spr_solar_v3', () => createRoundedBox(0.24, 0.04, 0.2, 0.02, 0.01)),
        mats.getSolid('#1d4ed8', 0.2, 0.75)
      );
      solar.position.set(0, 0.47, 0);
      solar.rotation.x = 0.25;
      g.add(solar);
      break;
    }
    case 'sensor': {
      const stake = new THREE.Mesh(
        geos.get('sen_stake_v3', () => new THREE.CylinderGeometry(0.035, 0.045, 0.52, 8)),
        mats.ironMat
      );
      stake.position.y = 0.26;
      g.add(stake);
      const box = new THREE.Mesh(
        geos.get('sen_box_v3', () => createRoundedBox(0.25, 0.2, 0.18, 0.04, 0.015)),
        mats.getSolid('#e2e8f0', 0.38, 0.25)
      );
      box.position.y = 0.56;
      g.add(box);
      const antenna = new THREE.Mesh(
        geos.get('sen_ant_v3', () => new THREE.CylinderGeometry(0.01, 0.015, 0.2, 6)),
        mats.ironMat
      );
      antenna.position.set(0.07, 0.74, 0);
      g.add(antenna);
      const led = new THREE.Mesh(
        geos.get('sen_led_v3', () => new THREE.SphereGeometry(0.05, 8, 8)),
        mats.getEmissive('#22c55e', '#22c55e', 1.2)
      );
      led.position.set(0, 0.67, 0.05);
      g.add(led);
      break;
    }
    case 'compost': {
      const bin = new THREE.Mesh(
        geos.get('cmp_bin_v3', () => createRoundedBox(0.78, 0.46, 0.78, 0.04, 0.02)),
        mats.woodMat
      );
      bin.position.y = 0.23;
      g.add(bin);
      const strap = new THREE.Mesh(
        geos.get('cmp_strap_v3', () => new THREE.BoxGeometry(0.81, 0.06, 0.81)),
        mats.darkWoodMat
      );
      strap.position.y = 0.36;
      g.add(strap);
      const mound = new THREE.Mesh(
        geos.get('cmp_mound_v3', () =>
          sculptOrganic(new THREE.SphereGeometry(0.32, 14, 10), 0.12, 10, 9)
        ),
        mats.tilledWetMat
      );
      mound.scale.set(1, 0.45, 1);
      mound.position.y = 0.44;
      g.add(mound);
      break;
    }
    case 'nasa_station': {
      const legGeo = geos.get('nasa_leg_v3', () => new THREE.CylinderGeometry(0.028, 0.04, 0.72, 8));
      for (const ang of [0, 2.09, 4.18]) {
        const leg = new THREE.Mesh(legGeo, mats.ironMat);
        leg.position.set(Math.cos(ang) * 0.18, 0.32, Math.sin(ang) * 0.18);
        leg.rotation.z = Math.cos(ang) * 0.22;
        leg.rotation.x = -Math.sin(ang) * 0.22;
        g.add(leg);
      }
      const pod = new THREE.Mesh(
        geos.get('nasa_pod_v3', () => createRoundedBox(0.34, 0.26, 0.28, 0.05, 0.02)),
        mats.getSolid('#f8fafc', 0.3, 0.2)
      );
      pod.position.y = 0.66;
      g.add(pod);
      const dish = new THREE.Mesh(
        geos.get('nasa_dish_v3', () => {
          const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0.11, 0.02),
            new THREE.Vector2(0.22, 0.075),
            new THREE.Vector2(0.26, 0.12),
          ];
          return new THREE.LatheGeometry(pts, 20);
        }),
        mats.getSolid('#38bdf8', 0.22, 0.8)
      );
      dish.position.set(0, 0.94, 0);
      dish.rotation.x = 0.45;
      dish.name = 'spin_head';
      g.add(dish);
      const feed = new THREE.Mesh(
        geos.get('nasa_feed_v3', () => new THREE.CylinderGeometry(0.015, 0.02, 0.18, 6)),
        mats.brassMat
      );
      feed.position.set(0, 1.0, 0.05);
      feed.rotation.x = 0.45;
      g.add(feed);
      break;
    }
    case 'rain_tank': {
      const barrel = new THREE.Mesh(
        geos.get('rt_barrel_v3', () => {
          const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0.31, 0),
            new THREE.Vector2(0.36, 0.36),
            new THREE.Vector2(0.31, 0.72),
            new THREE.Vector2(0, 0.72),
          ];
          return new THREE.LatheGeometry(pts, 18);
        }),
        mats.getSolid('#2563eb', 0.4, 0.25)
      );
      g.add(barrel);
      const hoopGeo = geos.get('rt_hoop_v3', () => new THREE.TorusGeometry(0.345, 0.024, 8, 20));
      for (const hy of [0.22, 0.52]) {
        const hoop = new THREE.Mesh(hoopGeo, mats.ironMat);
        hoop.rotation.x = Math.PI / 2;
        hoop.position.y = hy;
        g.add(hoop);
      }
      const tap = new THREE.Mesh(
        geos.get('rt_tap_v3', () => new THREE.CylinderGeometry(0.03, 0.03, 0.16, 8)),
        mats.brassMat
      );
      tap.rotation.x = Math.PI / 2;
      tap.position.set(0, 0.18, 0.38);
      g.add(tap);
      break;
    }
    case 'shade_net': {
      const poleGeo = geos.get('sn_pole_v3', () => new THREE.CylinderGeometry(0.03, 0.035, 0.92, 8));
      for (const [px, pz] of [[-0.4, -0.4], [0.4, -0.4], [-0.4, 0.4], [0.4, 0.4]]) {
        const p = new THREE.Mesh(poleGeo, mats.woodMat);
        p.position.set(px, 0.46, pz);
        g.add(p);
      }
      const cloth = new THREE.Mesh(
        geos.get('sn_cloth_v3', () => createRoundedBox(0.94, 0.04, 0.94, 0.03, 0.01)),
        mats.getTransparent('#e2e8f0', 0.74, 0.9)
      );
      cloth.position.y = 0.92;
      g.add(cloth);
      break;
    }
    case 'beehive': {
      const stand = new THREE.Mesh(
        geos.get('bh_stand_v3', () => createRoundedBox(0.54, 0.12, 0.48, 0.03, 0.015)),
        mats.darkWoodMat
      );
      stand.position.y = 0.06;
      g.add(stand);
      const base = new THREE.Mesh(
        geos.get('bh_base_v3', () => createRoundedBox(0.56, 0.44, 0.5, 0.04, 0.02)),
        mats.getSolid('#eab308', 0.74, 0.02)
      );
      base.position.y = 0.32;
      g.add(base);
      const roof = new THREE.Mesh(
        geos.get('bh_roof_v3', () => new THREE.ConeGeometry(0.45, 0.25, 4)),
        mats.darkWoodMat
      );
      roof.position.y = 0.65;
      roof.rotation.y = Math.PI / 4;
      g.add(roof);
      const slot = new THREE.Mesh(
        geos.get('bh_slot_v3', () => createRoundedBox(0.24, 0.06, 0.08, 0.02, 0.01)),
        mats.darkWoodMat
      );
      slot.position.set(0, 0.19, 0.26);
      g.add(slot);
      break;
    }
    case 'cheese_press': {
      const vat = new THREE.Mesh(
        geos.get('cp_vat_v3', () => new THREE.CylinderGeometry(0.28, 0.28, 0.34, 16)),
        mats.woodMat
      );
      vat.position.y = 0.17;
      g.add(vat);
      const frame = new THREE.Mesh(
        geos.get('cp_frame_v3', () => createRoundedBox(0.68, 0.66, 0.14, 0.03, 0.015)),
        mats.darkWoodMat
      );
      frame.position.y = 0.33;
      g.add(frame);
      const screw = new THREE.Mesh(
        geos.get('cp_screw_v3', () => new THREE.CylinderGeometry(0.035, 0.035, 0.3, 8)),
        mats.ironMat
      );
      screw.position.y = 0.64;
      g.add(screw);
      const weight = new THREE.Mesh(
        geos.get('cp_weight_v3', () => new THREE.CylinderGeometry(0.21, 0.21, 0.14, 14)),
        mats.stoneMat
      );
      weight.position.y = 0.45;
      g.add(weight);
      break;
    }
    case 'jam_maker': {
      const hearth = new THREE.Mesh(
        geos.get('jm_hearth_v3', () => new THREE.CylinderGeometry(0.32, 0.37, 0.32, 14)),
        mats.brickMat
      );
      hearth.position.y = 0.16;
      g.add(hearth);
      const pot = new THREE.Mesh(
        geos.get('jm_pot_v3', () => {
          const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0.18, 0.02),
            new THREE.Vector2(0.28, 0.16),
            new THREE.Vector2(0.25, 0.3),
            new THREE.Vector2(0.29, 0.34),
            new THREE.Vector2(0.22, 0.34),
          ];
          return new THREE.LatheGeometry(pts, 18);
        }),
        mats.copperMat
      );
      pot.position.y = 0.28;
      g.add(pot);
      const jam = new THREE.Mesh(
        geos.get('jm_jam_v3', () => new THREE.CircleGeometry(0.21, 16)),
        mats.getSolid('#e11d48', 0.18, 0.06)
      );
      jam.rotation.x = -Math.PI / 2;
      jam.position.y = 0.6;
      g.add(jam);
      break;
    }
    case 'windmill': {
      const base = new THREE.Mesh(
        geos.get('wm_base_v3', () => new THREE.CylinderGeometry(0.42, 0.45, 0.22, 12)),
        mats.stoneMat
      );
      base.position.y = 0.11;
      g.add(base);
      const tower = new THREE.Mesh(
        geos.get('wm_tower_v3', () => new THREE.CylinderGeometry(0.24, 0.4, 1.24, 12)),
        mats.plasterMat
      );
      tower.position.y = 0.82;
      g.add(tower);
      const cap = new THREE.Mesh(
        geos.get('wm_cap_v3', () => new THREE.ConeGeometry(0.32, 0.36, 12)),
        mats.roofMat
      );
      cap.position.y = 1.62;
      g.add(cap);
      const hub = new THREE.Group();
      hub.position.set(0, 1.32, 0.32);
      hub.name = 'windmill_hub';
      const hubNose = new THREE.Mesh(
        geos.get('wm_nose_v3', () => new THREE.SphereGeometry(0.08, 10, 8)),
        mats.brassMat
      );
      hub.add(hubNose);
      const sparGeo = geos.get('wm_spar_v3', () => new THREE.CylinderGeometry(0.02, 0.025, 0.68, 8));
      const sailGeo = geos.get('wm_sail_v3', () => createRoundedBox(0.16, 0.52, 0.025, 0.01, 0.006));
      const sailMat = mats.getFabric('#fef3c7', 0.85);
      for (let i = 0; i < 4; i++) {
        const arm = new THREE.Group();
        arm.rotation.z = (i * Math.PI) / 2;
        const spar = new THREE.Mesh(sparGeo, mats.darkWoodMat);
        spar.position.y = 0.34;
        arm.add(spar);
        const sail = new THREE.Mesh(sailGeo, sailMat);
        sail.position.set(0.08, 0.4, 0);
        sail.rotation.y = 0.18;
        arm.add(sail);
        hub.add(arm);
      }
      g.add(hub);
      break;
    }
    case 'wishing_fountain': {
      const basin = new THREE.Mesh(
        geos.get('wf_basin_v3', () => {
          const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0.42, 0),
            new THREE.Vector2(0.47, 0.16),
            new THREE.Vector2(0.49, 0.28),
            new THREE.Vector2(0.41, 0.3),
            new THREE.Vector2(0.38, 0.16),
            new THREE.Vector2(0, 0.16),
          ];
          return new THREE.LatheGeometry(pts, 20);
        }),
        mats.stoneMat
      );
      g.add(basin);
      const pool = new THREE.Mesh(
        geos.get('wf_pool_v3', () => new THREE.CircleGeometry(0.4, 20)),
        mats.waterMat
      );
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.25;
      g.add(pool);
      const spire = new THREE.Mesh(
        geos.get('wf_spire_v3', () => {
          const pts = [
            new THREE.Vector2(0, 0),
            new THREE.Vector2(0.14, 0),
            new THREE.Vector2(0.09, 0.22),
            new THREE.Vector2(0.16, 0.32),
            new THREE.Vector2(0.08, 0.38),
            new THREE.Vector2(0.07, 0.56),
            new THREE.Vector2(0, 0.58),
          ];
          return new THREE.LatheGeometry(pts, 16);
        }),
        mats.stoneMat
      );
      spire.position.y = 0.15;
      g.add(spire);
      const orb = new THREE.Mesh(
        geos.get('wf_orb_v3', () => new THREE.OctahedronGeometry(0.11, 0)),
        mats.getEmissive('#38bdf8', '#38bdf8', 0.95)
      );
      orb.position.y = 0.8;
      g.add(orb);
      break;
    }
  }

  enableShadows(g, true, true);
  return g;
}

export function createTreasureGroup(
  kind: NatureTreasureKind,
  geos: GeometryCache,
  mats: MaterialLibrary
): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'clover') {
    const stem = new THREE.Mesh(
      geos.get('tr_cloverStem_v3', () => new THREE.CylinderGeometry(0.025, 0.03, 0.18, 8)),
      mats.getSolid('#15803d', 0.75, 0.0)
    );
    stem.position.y = 0.09;
    g.add(stem);
    const leafGeo = geos.get('tr_cloverLeaf_v3', () => createHeartShapeGeo(0.18, 0.025));
    const cloverMat = mats.getEmissive('#22c55e', '#16a34a', 0.7);
    for (let i = 0; i < 4; i++) {
      const leaf = new THREE.Mesh(leafGeo, cloverMat);
      leaf.rotation.x = -Math.PI / 2;
      leaf.rotation.z = (i * Math.PI) / 2;
      leaf.position.set(Math.cos((i * Math.PI) / 2) * 0.08, 0.2, Math.sin((i * Math.PI) / 2) * 0.08);
      g.add(leaf);
    }
  } else if (kind === 'mushroom') {
    const stalk = new THREE.Mesh(
      geos.get('tr_mushStalk_v3', () => new THREE.CylinderGeometry(0.06, 0.085, 0.22, 12)),
      mats.getSolid('#fef3c7', 0.7, 0.0)
    );
    stalk.position.y = 0.11;
    g.add(stalk);
    const cap = new THREE.Mesh(
      geos.get('tr_mushCap_v3', () => new THREE.SphereGeometry(0.19, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)),
      mats.getEmissive('#ef4444', '#b91c1c', 0.5)
    );
    cap.position.y = 0.2;
    g.add(cap);
    const spotGeo = geos.get('tr_mushSpot_v3', () => new THREE.SphereGeometry(0.035, 8, 6));
    const spotMat = mats.getSolid('#ffffff', 0.6, 0.0);
    for (const [sx, sy, sz] of [[-0.08, 0.32, 0.07], [0.09, 0.3, -0.06], [0, 0.36, -0.09]]) {
      const sp = new THREE.Mesh(spotGeo, spotMat);
      sp.position.set(sx, sy, sz);
      g.add(sp);
    }
  } else {
    const ped = new THREE.Mesh(
      geos.get('tr_stem_v3', () => new THREE.CylinderGeometry(0.04, 0.06, 0.14, 10)),
      mats.getSolid('#bae6fd', 0.28, 0.2)
    );
    ped.position.y = 0.07;
    g.add(ped);
    const petalGeo = geos.get('tr_frostPetal_v3', () => new THREE.OctahedronGeometry(0.11, 0));
    const iceMat = mats.getEmissive('#7dd3fc', '#38bdf8', 0.95);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const p = new THREE.Mesh(petalGeo, iceMat);
      p.scale.set(0.6, 1.4, 0.5);
      p.position.set(Math.cos(a) * 0.1, 0.22, Math.sin(a) * 0.1);
      p.rotation.z = Math.cos(a) * -0.5;
      p.rotation.x = Math.sin(a) * 0.5;
      g.add(p);
    }
  }
  enableShadows(g, true, false);
  return g;
}

export function createChickenGroup(geos: GeometryCache, mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();
  addShadowMesh(g, geos, mats, 0.24);
  const whiteMat = mats.getFabric('#fffbeb', 0.85);
  const wingMat = mats.getFabric('#f5ead2', 0.88);
  const beakMat = mats.getSolid('#f59e0b', 0.45, 0.1);
  const combMat = mats.getSolid('#dc2626', 0.55, 0.0);
  const eyeMat = mats.getSolid('#1c1917', 0.15, 0.1);

  const body = new THREE.Mesh(
    geos.get('chk_body_v3', () => new THREE.SphereGeometry(0.16, 14, 12)),
    whiteMat
  );
  body.scale.set(0.95, 0.85, 1.28);
  body.position.y = 0.2;
  g.add(body);

  const wingGeo = geos.get('chk_wing_v3', () => new THREE.SphereGeometry(0.09, 10, 8));
  for (const wx of [-0.14, 0.14]) {
    const w = new THREE.Mesh(wingGeo, wingMat);
    w.scale.set(0.45, 0.75, 1.15);
    w.position.set(wx, 0.2, 0);
    g.add(w);
  }
  const tail = new THREE.Mesh(
    geos.get('chk_tail_v3', () => new THREE.ConeGeometry(0.08, 0.17, 8)),
    whiteMat
  );
  tail.position.set(0, 0.28, -0.21);
  tail.rotation.x = -0.65;
  g.add(tail);

  const head = new THREE.Mesh(
    geos.get('chk_head_v3', () => new THREE.SphereGeometry(0.1, 12, 10)),
    whiteMat
  );
  head.position.set(0, 0.34, 0.15);
  g.add(head);

  const comb = new THREE.Mesh(
    geos.get('chk_comb_v3', () => new THREE.SphereGeometry(0.045, 8, 6)),
    combMat
  );
  comb.scale.set(0.6, 1.2, 1.5);
  comb.position.set(0, 0.44, 0.15);
  g.add(comb);

  const wattle = new THREE.Mesh(
    geos.get('chk_wattle_v3', () => new THREE.SphereGeometry(0.025, 6, 5)),
    combMat
  );
  wattle.position.set(0, 0.29, 0.23);
  g.add(wattle);

  const beak = new THREE.Mesh(
    geos.get('chk_beak_v3', () => new THREE.ConeGeometry(0.035, 0.09, 8)),
    beakMat
  );
  beak.rotation.x = Math.PI / 2;
  beak.position.set(0, 0.33, 0.27);
  g.add(beak);

  const eyeGeo = geos.get('chk_eye_v3', () => new THREE.SphereGeometry(0.018, 6, 6));
  for (const ex of [-0.06, 0.06]) {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex, 0.36, 0.21);
    g.add(eye);
  }

  const legGeo = geos.get('chk_leg_v3', () => new THREE.CylinderGeometry(0.017, 0.02, 0.12, 6));
  for (const lx of [-0.06, 0.06]) {
    const leg = new THREE.Mesh(legGeo, beakMat);
    leg.position.set(lx, 0.06, 0);
    g.add(leg);
  }
  enableShadows(g, true, true);
  return g;
}

export function createCowGroup(geos: GeometryCache, mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();
  addShadowMesh(g, geos, mats, 0.45);
  const whiteMat = mats.getFabric('#f8fafc', 0.82);
  const spotMat = mats.getFabric('#292524', 0.85);
  const snoutMat = mats.getSolid('#fbcfe8', 0.62, 0.0);
  const hornMat = mats.getSolid('#fef3c7', 0.4, 0.05);
  const eyeMat = mats.getSolid('#1c1917', 0.15, 0.1);

  // Smooth anatomical Capsule torso
  const body = new THREE.Mesh(
    geos.get('cow_body_v3', () => new THREE.CapsuleGeometry(0.22, 0.36, 8, 16)),
    whiteMat
  );
  body.rotation.x = Math.PI / 2;
  body.scale.set(1.02, 1.0, 0.92);
  body.position.y = 0.43;
  g.add(body);

  const spot1 = new THREE.Mesh(
    geos.get('cow_spot_v3', () => new THREE.SphereGeometry(0.225, 12, 10)),
    spotMat
  );
  spot1.scale.set(1.03, 0.9, 0.72);
  spot1.position.set(0.01, 0.45, -0.05);
  g.add(spot1);

  const udder = new THREE.Mesh(
    geos.get('cow_udder', () => new THREE.SphereGeometry(0.09, 10, 8)),
    snoutMat
  );
  udder.position.set(0, 0.25, -0.14);
  g.add(udder);

  const neck = new THREE.Mesh(
    geos.get('cow_neck', () => new THREE.CylinderGeometry(0.12, 0.16, 0.24, 12)),
    whiteMat
  );
  neck.position.set(0, 0.5, 0.31);
  neck.rotation.x = 0.55;
  g.add(neck);

  const head = new THREE.Mesh(
    geos.get('cow_head_v3', () => new THREE.SphereGeometry(0.16, 14, 12)),
    whiteMat
  );
  head.scale.set(0.95, 0.92, 1.15);
  head.position.set(0, 0.56, 0.46);
  g.add(head);

  const snout = new THREE.Mesh(
    geos.get('cow_snout_v3', () => new THREE.SphereGeometry(0.115, 12, 10)),
    snoutMat
  );
  snout.scale.set(1.12, 0.72, 0.85);
  snout.position.set(0, 0.49, 0.61);
  g.add(snout);

  // Curved horns via TubeGeometry
  const hornCurveGeo = geos.get('cow_horn_v3', () => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.06, 0.04, 0.01),
      new THREE.Vector3(0.1, 0.11, 0.02),
    ]);
    return new THREE.TubeGeometry(curve, 8, 0.024, 7, false);
  });
  const earGeo = geos.get('cow_ear_v3', () => new THREE.SphereGeometry(0.06, 8, 6));
  const eyeGeo = geos.get('cow_eye_v3', () => new THREE.SphereGeometry(0.024, 8, 8));
  for (const sx of [-1, 1]) {
    const horn = new THREE.Mesh(hornCurveGeo, hornMat);
    horn.position.set(sx * 0.11, 0.68, 0.44);
    horn.scale.x = sx;
    g.add(horn);

    const ear = new THREE.Mesh(earGeo, spotMat);
    ear.scale.set(1.4, 0.45, 0.7);
    ear.position.set(sx * 0.18, 0.6, 0.42);
    g.add(ear);

    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx * 0.1, 0.6, 0.57);
    g.add(eye);
  }

  // Tail + tuft
  const tail = new THREE.Mesh(
    geos.get('cow_tail', () => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.5, -0.36),
        new THREE.Vector3(0.03, 0.36, -0.42),
        new THREE.Vector3(0.04, 0.22, -0.4),
      ]);
      return new THREE.TubeGeometry(curve, 8, 0.018, 6, false);
    }),
    whiteMat
  );
  g.add(tail);

  const bell = new THREE.Mesh(
    geos.get('cow_bell_v3', () => new THREE.ConeGeometry(0.055, 0.09, 10)),
    mats.brassMat
  );
  bell.position.set(0, 0.36, 0.44);
  g.add(bell);

  const legGeo = geos.get('cow_leg_v3', () => new THREE.CylinderGeometry(0.048, 0.044, 0.26, 8));
  for (const [lx, lz] of [[-0.14, -0.22], [0.14, -0.22], [-0.14, 0.22], [0.14, 0.22]]) {
    const leg = new THREE.Mesh(legGeo, spotMat);
    leg.position.set(lx, 0.13, lz);
    g.add(leg);
  }
  enableShadows(g, true, true);
  return g;
}

export function createSheepGroup(geos: GeometryCache, mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();
  addShadowMesh(g, geos, mats, 0.36);
  const woolMat = mats.getFabric('#f5f5f4', 0.96);
  const darkMat = mats.getSolid('#334155', 0.78, 0.0);
  const eyeMat = mats.getSolid('#fde047', 0.25, 0.1);

  // Soft organic displaced wool fleece cloud
  const fleece = new THREE.Mesh(
    geos.get('shp_fleece_org', () =>
      sculptOrganic(new THREE.IcosahedronGeometry(0.28, 2), 0.14, 11, 8)
    ),
    woolMat
  );
  fleece.scale.set(1.0, 0.92, 1.28);
  fleece.position.y = 0.36;
  g.add(fleece);

  const head = new THREE.Mesh(
    geos.get('shp_head_v3', () => new THREE.SphereGeometry(0.12, 12, 10)),
    darkMat
  );
  head.scale.set(0.9, 0.95, 1.15);
  head.position.set(0, 0.42, 0.36);
  g.add(head);

  const tuft = new THREE.Mesh(
    geos.get('shp_tuft_v3', () =>
      sculptOrganic(new THREE.IcosahedronGeometry(0.095, 2), 0.16, 15, 9)
    ),
    woolMat
  );
  tuft.position.set(0, 0.52, 0.35);
  g.add(tuft);

  const earGeo = geos.get('shp_ear_v3', () => new THREE.SphereGeometry(0.055, 8, 6));
  const eyeGeo = geos.get('shp_eye_v3', () => new THREE.SphereGeometry(0.02, 6, 6));
  for (const sx of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, darkMat);
    ear.scale.set(1.35, 0.42, 0.7);
    ear.position.set(sx * 0.13, 0.44, 0.34);
    ear.rotation.z = sx * 0.4;
    g.add(ear);
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(sx * 0.06, 0.45, 0.47);
    g.add(eye);
  }

  const legGeo = geos.get('shp_leg_v3', () => new THREE.CylinderGeometry(0.038, 0.044, 0.22, 8));
  for (const [lx, lz] of [[-0.12, -0.16], [0.12, -0.16], [-0.12, 0.16], [0.12, 0.16]]) {
    const leg = new THREE.Mesh(legGeo, darkMat);
    leg.position.set(lx, 0.11, lz);
    g.add(leg);
  }
  enableShadows(g, true, true);
  return g;
}

export function createDogGroup(geos: GeometryCache, mats: MaterialLibrary): THREE.Group {
  const g = new THREE.Group();
  addShadowMesh(g, geos, mats, 0.32);
  const furMat = mats.getFabric('#d97706', 0.85);
  const bellyMat = mats.getFabric('#fde68a', 0.86);
  const collarMat = mats.getSolid('#dc2626', 0.42, 0.15);
  const eyeMat = mats.getSolid('#1c1917', 0.15, 0.1);

  const body = new THREE.Mesh(
    geos.get('dog_body_v3', () => new THREE.CapsuleGeometry(0.135, 0.24, 6, 14)),
    furMat
  );
  body.rotation.x = Math.PI / 2;
  body.position.y = 0.28;
  g.add(body);

  const collar = new THREE.Mesh(
    geos.get('dog_collar_v3', () => new THREE.TorusGeometry(0.135, 0.03, 8, 16)),
    collarMat
  );
  collar.rotation.x = Math.PI / 4;
  collar.position.set(0, 0.36, 0.22);
  g.add(collar);

  const tag = new THREE.Mesh(
    geos.get('dog_tag_v3', () => new THREE.CylinderGeometry(0.035, 0.035, 0.015, 12)),
    mats.brassMat
  );
  tag.rotation.x = Math.PI / 2;
  tag.position.set(0, 0.28, 0.31);
  g.add(tag);

  const head = new THREE.Mesh(
    geos.get('dog_head_v3', () => new THREE.SphereGeometry(0.13, 12, 10)),
    furMat
  );
  head.position.set(0, 0.43, 0.32);
  g.add(head);

  const muzzle = new THREE.Mesh(
    geos.get('dog_muzzle_v3', () => new THREE.SphereGeometry(0.075, 10, 8)),
    bellyMat
  );
  muzzle.scale.set(0.95, 0.8, 1.25);
  muzzle.position.set(0, 0.39, 0.44);
  g.add(muzzle);

  const nose = new THREE.Mesh(
    geos.get('dog_nose_v3', () => new THREE.SphereGeometry(0.028, 8, 6)),
    eyeMat
  );
  nose.position.set(0, 0.42, 0.51);
  g.add(nose);

  const earGeo = geos.get('dog_ear_v3', () => new THREE.ConeGeometry(0.05, 0.13, 6));
  const eyeGeo = geos.get('dog_eye_v3', () => new THREE.SphereGeometry(0.022, 6, 6));
  for (const ex of [-0.08, 0.08]) {
    const ear = new THREE.Mesh(earGeo, mats.darkWoodMat);
    ear.position.set(ex, 0.56, 0.3);
    g.add(ear);
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(ex * 0.75, 0.46, 0.43);
    g.add(eye);
  }

  const tail = new THREE.Mesh(
    geos.get('dog_tail_v3', () => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0.31, -0.22),
        new THREE.Vector3(0, 0.4, -0.3),
        new THREE.Vector3(0, 0.49, -0.27),
      ]);
      return new THREE.TubeGeometry(curve, 8, 0.025, 6, false);
    }),
    furMat
  );
  g.add(tail);

  const legGeo = geos.get('dog_leg_v3', () => new THREE.CylinderGeometry(0.036, 0.04, 0.2, 8));
  for (const [lx, lz] of [[-0.09, -0.16], [0.09, -0.16], [-0.09, 0.16], [0.09, 0.16]]) {
    const leg = new THREE.Mesh(legGeo, furMat);
    leg.position.set(lx, 0.1, lz);
    g.add(leg);
  }
  enableShadows(g, true, true);
  return g;
}

export function createWildlifeGroup(
  kind: WildlifeKind,
  geos: GeometryCache,
  mats: MaterialLibrary
): THREE.Group {
  const g = new THREE.Group();
  if (kind === 'rabbit') {
    addShadowMesh(g, geos, mats, 0.25);
    const furMat = mats.getFabric('#cbd5e1', 0.88);
    const tailMat = mats.getFabric('#ffffff', 0.92);
    const pinkMat = mats.getSolid('#f9a8d4', 0.65, 0.0);
    const eyeMat = mats.getSolid('#1c1917', 0.15, 0.1);

    const body = new THREE.Mesh(
      geos.get('rab_body_v3', () => new THREE.SphereGeometry(0.17, 14, 12)),
      furMat
    );
    body.scale.set(0.95, 0.9, 1.28);
    body.position.y = 0.17;
    g.add(body);

    const cottonTail = new THREE.Mesh(
      geos.get('rab_tail_v3', () => new THREE.SphereGeometry(0.065, 8, 8)),
      tailMat
    );
    cottonTail.position.set(0, 0.16, -0.22);
    g.add(cottonTail);

    const head = new THREE.Mesh(
      geos.get('rab_head_v3', () => new THREE.SphereGeometry(0.115, 12, 10)),
      furMat
    );
    head.position.set(0, 0.28, 0.16);
    g.add(head);

    const nose = new THREE.Mesh(
      geos.get('rab_nose_v3', () => new THREE.SphereGeometry(0.022, 6, 6)),
      pinkMat
    );
    nose.position.set(0, 0.27, 0.27);
    g.add(nose);

    const earGeo = geos.get('rab_ear_v3', () => new THREE.CapsuleGeometry(0.028, 0.14, 5, 8));
    const eyeGeo = geos.get('rab_eye_v3', () => new THREE.SphereGeometry(0.018, 6, 6));
    for (const ex of [-0.05, 0.05]) {
      const ear = new THREE.Mesh(earGeo, furMat);
      ear.position.set(ex, 0.44, 0.15);
      ear.rotation.z = ex * -1.4;
      g.add(ear);
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(ex * 1.15, 0.3, 0.24);
      g.add(eye);
    }
  } else {
    addShadowMesh(g, geos, mats, 0.38);
    const boarMat = mats.getFabric('#4a2c22', 0.88);
    const ridgeMat = mats.getFabric('#291812', 0.92);
    const snoutMat = mats.getSolid('#a16a5e', 0.65, 0.0);
    const tuskMat = mats.getSolid('#fef3c7', 0.32, 0.05);
    const eyeMat = mats.getEmissive('#ef4444', '#ef4444', 1.5);

    const body = new THREE.Mesh(
      geos.get('boar_body_v3', () => new THREE.CapsuleGeometry(0.2, 0.24, 8, 14)),
      boarMat
    );
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.3;
    g.add(body);

    const ridge = new THREE.Mesh(
      geos.get('boar_ridge_v3', () => new THREE.BoxGeometry(0.08, 0.1, 0.44)),
      ridgeMat
    );
    ridge.position.set(0, 0.5, 0);
    g.add(ridge);

    const head = new THREE.Mesh(
      geos.get('boar_head_v3', () => new THREE.SphereGeometry(0.16, 12, 10)),
      boarMat
    );
    head.scale.set(1.0, 0.9, 1.15);
    head.position.set(0, 0.33, 0.36);
    g.add(head);

    const snout = new THREE.Mesh(
      geos.get('boar_snout_v3', () => new THREE.CylinderGeometry(0.085, 0.095, 0.08, 12)),
      snoutMat
    );
    snout.rotation.x = Math.PI / 2;
    snout.position.set(0, 0.28, 0.51);
    g.add(snout);

    // True curved ivory tusks via TubeGeometry
    const tuskCurveGeo = geos.get('boar_tusk_v3', () => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.04, 0.03, 0.04),
        new THREE.Vector3(0.06, 0.11, 0.03),
      ]);
      return new THREE.TubeGeometry(curve, 8, 0.018, 6, false);
    });
    const eyeGeo = geos.get('boar_eye_v3', () => new THREE.SphereGeometry(0.028, 6, 6));
    for (const sx of [-1, 1]) {
      const tusk = new THREE.Mesh(tuskCurveGeo, tuskMat);
      tusk.position.set(sx * 0.09, 0.28, 0.48);
      tusk.scale.x = sx;
      g.add(tusk);
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(sx * 0.1, 0.39, 0.47);
      g.add(eye);
    }

    const legGeo = geos.get('boar_leg_v3', () => new THREE.CylinderGeometry(0.045, 0.05, 0.18, 8));
    for (const [lx, lz] of [[-0.13, -0.18], [0.13, -0.18], [-0.13, 0.18], [0.13, 0.18]]) {
      const leg = new THREE.Mesh(legGeo, ridgeMat);
      leg.position.set(lx, 0.09, lz);
      g.add(leg);
    }
  }
  enableShadows(g, true, true);
  return g;
}
