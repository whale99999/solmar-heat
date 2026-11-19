// Port Solmar itself: the sunset sky, the avenue grid, the buildings with lit
// windows, neon signs, palm trees, the beach and the marina. Everything is
// procedural — textures are painted on canvases at load, geometry is boxes and
// cylinders arranged by a seeded plan, so the city is identical on every visit.
// The world hands the rest of the game a list of building colliders and the
// landmark positions the missions use.

import * as THREE from 'three';
import { WORLD, PALETTE, NAMES } from './config.js';
import { Rng } from './random.js';

const P = WORLD.blockPitch;
const HALF = WORLD.gridHalf;

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The ground is one big painted canvas: avenues, dashes, crosswalks, block
// pavements, two parks, the beach. Painting it flat keeps the draw calls at
// almost nothing and the streets readable from the chase camera and minimap.
function paintGround(ctx, w, h, worldToPx) {
  ctx.fillStyle = '#8d8578';
  ctx.fillRect(0, 0, w, h);
  const [ox, oz] = worldToPx(0, 0);
  const scale = w / 460; // the canvas spans 460 world units
  const px = (x) => ox + x * scale;
  const pz = (z) => oz + z * scale;

  // Block pavements and parks. Blocks live BETWEEN the avenues: their
  // centres sit half a pitch off the avenue lines, so the roads stay clear.
  for (let bx = -HALF; bx < HALF; bx++) {
    for (let bz = -HALF; bz < HALF; bz++) {
      const cx = bx * P + P / 2;
      const cz = bz * P + P / 2;
      const isPark = (bx === 1 && bz === -1) || (bx === -2 && bz === 1);
      ctx.fillStyle = isPark ? '#4d7d43' : (bx + bz) % 2 ? '#978d7c' : '#8d8578';
      ctx.fillRect(px(cx - 16), pz(cz - 16), 32 * scale, 32 * scale);
    }
  }
  // Avenues.
  ctx.fillStyle = '#2e2a33';
  for (let i = -HALF; i <= HALF; i++) {
    ctx.fillRect(px(i * P - WORLD.roadHalf), 0, WORLD.roadHalf * 2 * scale, h);
    ctx.fillRect(0, pz(i * P - WORLD.roadHalf), w, WORLD.roadHalf * 2 * scale);
  }
  // Centre dashes and crosswalks.
  ctx.fillStyle = '#f7d774';
  for (let i = -HALF; i <= HALF; i++) {
    for (let d = -200; d < 200; d += 9) {
      if (Math.abs(d % P) < 10) continue; // keep intersections clear
      ctx.fillRect(px(i * P) - 1, pz(d), 2, 4.6 * scale);
      ctx.fillRect(px(d), pz(i * P) - 1, 4.6 * scale, 2);
    }
  }
  ctx.fillStyle = 'rgba(240,240,240,.75)';
  for (let ix = -HALF; ix <= HALF; ix++) {
    for (let iz = -HALF; iz <= HALF; iz++) {
      for (let s = -6; s <= 6; s += 3) {
        ctx.fillRect(px(ix * P + s) - 1, pz(iz * P - WORLD.roadHalf), 2, 3 * scale);
        ctx.fillRect(px(ix * P - WORLD.roadHalf), pz(iz * P + s) - 1, 3 * scale, 2);
      }
    }
  }
  // The beach and the waterline.
  const sand = ctx.createLinearGradient(0, pz(WORLD.beachZ), 0, pz(WORLD.oceanZ));
  sand.addColorStop(0, '#e8cf9f');
  sand.addColorStop(1, '#d9b878');
  ctx.fillStyle = sand;
  ctx.fillRect(0, pz(WORLD.beachZ), w, pz(WORLD.oceanZ) - pz(WORLD.beachZ));
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  ctx.fillRect(0, pz(WORLD.oceanZ) - 2, w, 3);
}

function facadeTexture(rng) {
  return canvasTexture(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#cfd4d8';
    ctx.fillRect(0, 0, w, h);
    for (let y = 10; y < h - 8; y += 16) {
      for (let x = 8; x < w - 8; x += 14) {
        const lit = rng.chance(0.42);
        ctx.fillStyle = lit ? (rng.chance(0.7) ? '#ffd98a' : '#bfe6ff') : '#3a4150';
        ctx.fillRect(x, y, 9, 10);
      }
    }
  });
}

function signTexture(text, fg, bg) {
  return canvasTexture(512, 128, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.font = '900 64px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = fg;
    ctx.shadowBlur = 26;
    ctx.fillStyle = fg;
    ctx.fillText(text, w / 2, h / 2 + 2);
    ctx.shadowBlur = 8;
    ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

const SIGN_WORDS = [
  ['HOTEL SOLMAR', '#ff6fa5', '#2a0e2e'],
  ['CLUB NOVA', '#4de8ff', '#0d1030'],
  ['DINER 24H', '#ffd75e', '#30160a'],
  ['PALMS MOTEL', '#7dff9a', '#0c2a16'],
  ['BAR LUNA', '#ff9a3d', '#2e1206'],
  ['CINEMA REX', '#ff5d73', '#2b0a12'],
  ['TACOS RIO', '#ffe95e', '#2e2408'],
  ['GYM ATLAS', '#b04dff', '#1c0a30'],
];

export class World {
  constructor(scene) {
    this.scene = scene;
    this.rng = new Rng(WORLD.seed);
    this.colliders = [];
    this.colliderGrid = new Map();
    this.signs = [];
    this.boats = [];
    // Landmark points sit on the avenue beside each landmark block, so a car
    // can always reach them; the buildings themselves fill the blocks.
    this.landmarks = {
      garage: new THREE.Vector3(-2 * P - 3, 0, 2 * P + P / 2),
      clinic: new THREE.Vector3(2 * P + P / 2, 0, -2 * P - 3),
      hideout: new THREE.Vector3(2 * P + 3, 0, P / 2),
      marina: new THREE.Vector3(-3 * P + 10, 0, WORLD.beachZ + 8),
      playerSpawn: new THREE.Vector3(-2 * P - 3, 0, 2 * P + 3),
    };
    this.buildLightsAndSky();
    this.buildGround();
    this.buildBlocks();
    this.buildPalms();
    this.buildStreetlights();
    this.buildBeachAndMarina();
  }

  buildLightsAndSky() {
    const scene = this.scene;
    scene.fog = new THREE.Fog(PALETTE.fog, 90, 340);
    const skyTex = canvasTexture(64, 512, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#241243');
      g.addColorStop(0.42, '#6e2a5e');
      g.addColorStop(0.62, '#c94f6d');
      g.addColorStop(0.78, '#ff9a5d');
      g.addColorStop(0.92, '#ffd98a');
      g.addColorStop(1, '#ffe9b0');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    });
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(480, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    scene.add(sky);
    const sunBall = new THREE.Mesh(
      new THREE.SphereGeometry(16, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffdf9e, fog: false }),
    );
    sunBall.position.set(-190, 62, 330);
    scene.add(sunBall);

    scene.add(new THREE.HemisphereLight(0xffc9a3, 0x33415e, 0.85));
    const sun = new THREE.DirectionalLight(PALETTE.sun, 1.6);
    sun.position.set(-120, 130, 190);
    scene.add(sun);
    const fill = new THREE.DirectionalLight(0x7fa8ff, 0.35);
    fill.position.set(90, 80, -120);
    scene.add(fill);
  }

  buildGround() {
    const size = 460;
    const tex = canvasTexture(2048, 2048, (ctx, w, h) =>
      paintGround(ctx, w, h, (x, z) => [(x + 230) * (w / size), (z + 210) * (h / size)]));
    tex.anisotropy = 8;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size),
      new THREE.MeshLambertMaterial({ map: tex }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, 0, 20);
    this.scene.add(ground);

    // The ocean: a bright plane past the waterline, gently scrolling stripes.
    this.oceanTex = canvasTexture(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#1d6f8e';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,.13)';
      for (let i = 0; i < 40; i++) ctx.fillRect(0, i * 7, w, 2);
      ctx.fillStyle = 'rgba(255,190,120,.20)';
      for (let i = 0; i < 14; i++) ctx.fillRect((i * 53) % w, (i * 37) % h, 34, 3);
    });
    this.oceanTex.wrapS = this.oceanTex.wrapT = THREE.RepeatWrapping;
    this.oceanTex.repeat.set(10, 3);
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(560, 130),
      new THREE.MeshLambertMaterial({ map: this.oceanTex }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -0.15, WORLD.oceanZ + 62);
    this.scene.add(ocean);
  }

  addCollider(cx, cz, w, d) {
    const c = { x0: cx - w / 2, z0: cz - d / 2, x1: cx + w / 2, z1: cz + d / 2, id: this.colliders.length };
    this.colliders.push(c);
    // Broadphase: file the collider under every grid cell its box touches
    // (padded by the largest mover radius), so collideCircle only ever
    // tests the handful of buildings that could actually be in the way.
    const cell = P;
    const pad = 2.5;
    for (let gx = Math.floor((c.x0 - pad) / cell); gx <= Math.floor((c.x1 + pad) / cell); gx++) {
      for (let gz = Math.floor((c.z0 - pad) / cell); gz <= Math.floor((c.z1 + pad) / cell); gz++) {
        const key = `${gx},${gz}`;
        if (!this.colliderGrid.has(key)) this.colliderGrid.set(key, []);
        this.colliderGrid.get(key).push(c);
      }
    }
  }

  buildBlocks() {
    const rng = this.rng;
    const facade = facadeTexture(rng);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshLambertMaterial({ map: facade, emissive: 0xffffff, emissiveMap: facade, emissiveIntensity: 0.38 });
    const spots = [];
    for (let bx = -HALF; bx < HALF; bx++) {
      for (let bz = -HALF; bz < HALF; bz++) {
        if ((bx === 1 && bz === -1) || (bx === -2 && bz === 1)) continue; // parks
        const cx = bx * P + P / 2;
        const cz = bz * P + P / 2;
        const landmark =
          (bx === -3 && bz === 2) || (bx === 2 && bz === -3) || (bx === 2 && bz === 0);
        const count = landmark ? 1 : rng.int(2, 4);
        for (let i = 0; i < count; i++) {
          const w = rng.float(9, 14);
          const d = rng.float(9, 14);
          const hgt = landmark ? rng.float(10, 14) : rng.float(9, 34) * (rng.chance(0.22) ? 1.5 : 1);
          const offX = count === 1 ? 0 : (i % 2 ? 8.4 : -8.4);
          const offZ = count === 1 ? 0 : i < 2 ? -8.4 : 8.4;
          spots.push({ x: cx + offX, z: cz + offZ, w, d, h: hgt, tone: rng.pick(PALETTE.buildingTones) });
          this.addCollider(cx + offX, cz + offZ, w, d);
        }
      }
    }
    const inst = new THREE.InstancedMesh(geo, mat, spots.length);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    spots.forEach((s, i) => {
      m4.makeScale(s.w, s.h, s.d);
      m4.setPosition(s.x, 0, s.z);
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, col.setHex(s.tone));
    });
    this.scene.add(inst);
    this.buildSignsAndLandmarks(spots);
  }

  buildSignsAndLandmarks(spots) {
    const rng = this.rng;
    // Neon signs on a seeded-shuffled sample of buildings: taking every
    // third in build order clustered them on the same few blocks.
    const chosen = rng.shuffle(spots).slice(0, 16);
    chosen.forEach((s, i) => {
      const [text, fg, bg] = SIGN_WORDS[i % SIGN_WORDS.length];
      const tex = signTexture(text, fg, bg);
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(11, 2.75),
        new THREE.MeshBasicMaterial({ map: tex, transparent: false }),
      );
      const faceSouth = i % 2 === 0;
      sign.position.set(s.x, Math.min(s.h - 2.2, 9), s.z + (faceSouth ? s.d / 2 + 0.06 : -(s.d / 2 + 0.06)));
      if (!faceSouth) sign.rotation.y = Math.PI;
      this.scene.add(sign);
      this.signs.push({ mat: sign.material, phase: rng.float(0, 6) });
    });
    // Landmark name boards, standing by the avenue each landmark fronts.
    const boards = [
      [NAMES.garage.toUpperCase(), '#ffd75e', -101, 115, Math.PI / 2],
      [NAMES.clinic.toUpperCase(), '#ff5d73', 115, -101, 0],
      ['PALMS HIDEOUT', '#7dff9a', 101, 23, Math.PI / 2],
    ];
    for (const [text, fg, x, z, rotY] of boards) {
      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(13, 3),
        new THREE.MeshBasicMaterial({ map: signTexture(text, fg, '#101018'), side: THREE.DoubleSide }),
      );
      sign.position.set(x, 6.4, z);
      sign.rotation.y = rotY;
      this.scene.add(sign);
    }
  }

  buildPalms() {
    const rng = this.rng;
    const positions = [];
    for (let x = -200; x <= 200; x += 16) positions.push([x + rng.float(-3, 3), WORLD.beachZ + 6]);
    for (let i = 0; i < 46; i++) {
      const bx = rng.int(-HALF, HALF) * P + rng.pick([-19, 19]);
      const bz = rng.int(-HALF, HALF) * P + rng.pick([-19, 19]);
      positions.push([bx, bz]);
    }
    const trunkGeo = new THREE.CylinderGeometry(0.16, 0.26, 5.4, 6);
    trunkGeo.translate(0, 2.7, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6844 });
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
    const frondTex = canvasTexture(128, 128, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = '#3f9e4d';
      ctx.lineWidth = 7;
      for (let i = 0; i < 7; i++) {
        ctx.beginPath();
        ctx.moveTo(64, 118);
        ctx.quadraticCurveTo(64 + (i - 3) * 16, 60, 64 + (i - 3) * 21, 14 + Math.abs(i - 3) * 9);
        ctx.stroke();
      }
    });
    const frondGeo = new THREE.PlaneGeometry(6.4, 6.4);
    frondGeo.translate(0, 3.2, 0);
    const frondMat = new THREE.MeshLambertMaterial({ map: frondTex, alphaTest: 0.4, side: THREE.DoubleSide, transparent: true });
    const fronds = new THREE.InstancedMesh(frondGeo, frondMat, positions.length * 3);
    const m4 = new THREE.Matrix4();
    const eul = new THREE.Euler();
    const quat = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    positions.forEach(([x, z], i) => {
      const lean = rng.float(-0.09, 0.09);
      eul.set(lean, rng.float(0, 6.28), lean);
      quat.setFromEuler(eul);
      m4.compose(new THREE.Vector3(x, 0, z), quat, one);
      trunks.setMatrixAt(i, m4);
      for (let f = 0; f < 3; f++) {
        eul.set(0.5, (f / 3) * Math.PI * 2 + rng.float(0, 1), 0);
        quat.setFromEuler(eul);
        m4.compose(new THREE.Vector3(x, 5.1, z), quat, one);
        fronds.setMatrixAt(i * 3 + f, m4);
      }
    });
    this.scene.add(trunks, fronds);
  }

  buildStreetlights() {
    const spots = [];
    for (let i = -HALF; i <= HALF; i++) {
      for (let d = -HALF * P; d <= HALF * P; d += 23) {
        spots.push([i * P - WORLD.roadHalf - 0.7, d]);
        spots.push([d, i * P + WORLD.roadHalf + 0.7]);
      }
    }
    const poleGeo = new THREE.CylinderGeometry(0.09, 0.09, 5.6, 5);
    poleGeo.translate(0, 2.8, 0);
    const poles = new THREE.InstancedMesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3c4148 }), spots.length);
    const lampGeo = new THREE.SphereGeometry(0.32, 8, 6);
    const lamps = new THREE.InstancedMesh(lampGeo, new THREE.MeshBasicMaterial({ color: 0xffd9a0 }), spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z], i) => {
      m4.makeTranslation(x, 0, z);
      poles.setMatrixAt(i, m4);
      m4.makeTranslation(x, 5.7, z);
      lamps.setMatrixAt(i, m4);
    });
    this.scene.add(poles, lamps);
  }

  buildBeachAndMarina() {
    const rng = this.rng;
    // Beach umbrellas.
    const umbGeo = new THREE.ConeGeometry(1.9, 0.8, 8);
    const umbMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const umbs = new THREE.InstancedMesh(umbGeo, umbMat, 22);
    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    for (let i = 0; i < 22; i++) {
      const x = rng.float(-190, 190);
      const z = rng.float(WORLD.beachZ + 3, WORLD.oceanZ - 4);
      m4.makeTranslation(x, 2.1, z);
      umbs.setMatrixAt(i, m4);
      umbs.setColorAt(i, col.setHex(rng.pick(PALETTE.carPaints)));
    }
    this.scene.add(umbs);

    // The marina pier and its boats, south-west.
    const pierMat = new THREE.MeshLambertMaterial({ color: 0x7a5c38 });
    const pier = new THREE.Mesh(new THREE.BoxGeometry(10, 0.7, 44), pierMat);
    pier.position.set(this.landmarks.marina.x, 0.35, WORLD.oceanZ + 16);
    this.scene.add(pier);
    const hullMat = new THREE.MeshLambertMaterial({ color: 0xf2f4f6 });
    for (let i = 0; i < 4; i++) {
      const boat = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.1, 8.5), hullMat);
      hull.position.y = 0.4;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.2, 3), new THREE.MeshLambertMaterial({ color: rng.pick(PALETTE.carPaints) }));
      cabin.position.set(0, 1.4, -0.6);
      boat.add(hull, cabin);
      boat.position.set(this.landmarks.marina.x - 8 + (i % 2) * 17, 0, WORLD.oceanZ + 8 + Math.floor(i / 2) * 17);
      boat.rotation.y = rng.float(-0.2, 0.2);
      this.scene.add(boat);
      this.boats.push({ group: boat, phase: rng.float(0, 6) });
    }
    // Cargo crates near the garage: the heist props.
    const crateMat = new THREE.MeshLambertMaterial({ color: 0xb07a3f });
    for (let i = 0; i < 6; i++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), crateMat);
      const x = this.landmarks.marina.x + 8 + (i % 3) * 2.6;
      const z = WORLD.beachZ + 2 + Math.floor(i / 3) * 2.6;
      crate.position.set(x, 1.1, z);
      this.scene.add(crate);
      this.addCollider(x, z, 2.2, 2.2);
    }
  }

  // Buildings block a circle (the player or a car) — push it out on the
  // shallowest axis. Returns true when a push happened.
  collideCircle(pos, radius) {
    let hit = false;
    const edge = WORLD.cityEdge + 26;
    if (pos.x < -edge) { pos.x = -edge; hit = true; }
    if (pos.x > edge) { pos.x = edge; hit = true; }
    if (pos.z < -edge) { pos.z = -edge; hit = true; }
    if (pos.z > WORLD.oceanZ + 30) { pos.z = WORLD.oceanZ + 30; hit = true; }
    // Only the colliders filed under the cells this circle touches can be
    // in its way; resolve them in their original insertion order, exactly
    // as the old full scan did, so corner cases resolve identically.
    const cell = P;
    const reach = radius + 2.5;
    const near = new Set();
    for (let gx = Math.floor((pos.x - reach) / cell); gx <= Math.floor((pos.x + reach) / cell); gx++) {
      for (let gz = Math.floor((pos.z - reach) / cell); gz <= Math.floor((pos.z + reach) / cell); gz++) {
        const filed = this.colliderGrid.get(`${gx},${gz}`);
        if (filed) for (const c of filed) near.add(c);
      }
    }
    const ordered = [...near].sort((a, b) => a.id - b.id);
    for (const c of ordered) {
      if (pos.x > c.x0 - radius && pos.x < c.x1 + radius && pos.z > c.z0 - radius && pos.z < c.z1 + radius) {
        const dxl = pos.x - (c.x0 - radius);
        const dxr = (c.x1 + radius) - pos.x;
        const dzl = pos.z - (c.z0 - radius);
        const dzr = (c.z1 + radius) - pos.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) pos.x = c.x0 - radius;
        else if (m === dxr) pos.x = c.x1 + radius;
        else if (m === dzl) pos.z = c.z0 - radius;
        else pos.z = c.z1 + radius;
        hit = true;
      }
    }
    return hit;
  }

  update(dt, t) {
    this.oceanTex.offset.y = t * 0.012;
    this.oceanTex.offset.x = Math.sin(t * 0.05) * 0.02;
    for (const b of this.boats) {
      b.group.position.y = Math.sin(t * 0.9 + b.phase) * 0.16;
      b.group.rotation.z = Math.sin(t * 0.7 + b.phase) * 0.03;
    }
    for (const s of this.signs) {
      const flicker = 0.86 + 0.14 * Math.sin(t * 2.2 + s.phase) * (Math.sin(t * 13 + s.phase) > -0.92 ? 1 : 0.2);
      s.mat.color.setScalar(flicker);
    }
  }
}
