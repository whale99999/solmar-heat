// Pedestrians: low-poly people strolling the sidewalks and the beachfront.
// They walk avenue edges, turn corners, chat in pairs, and run screaming from
// gunfire, sirens and cars that mount the pavement. A person is a small group
// of boxes whose legs swing as they move; when a car knocks one down it falls
// and fades, and the game counts the crime.

import * as THREE from 'three';
import { WORLD } from './config.js';
import { Rng } from './random.js';

const P = WORLD.blockPitch;
const SHIRTS = [0xff6fa5, 0x4de8ff, 0xffe95e, 0x7dff9a, 0xf2f4f6, 0xff9a3d, 0xb04dff, 0x18b8a6];
const SKINS = [0xf2c79b, 0xc98d5e, 0x8a5a33, 0x6e4525, 0xffdbb8];

export function makePersonMesh(rng, shirtHex = null) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtHex ?? rng.pick(SHIRTS) });
  const skin = new THREE.MeshLambertMaterial({ color: rng.pick(SKINS) });
  const pants = new THREE.MeshLambertMaterial({ color: rng.pick([0x2b3a55, 0x55432b, 0x222222, 0xe8e8ec]) });

  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.78, 0.18), pants);
  legL.geometry.translate(0, -0.39, 0);
  legL.position.set(-0.11, 0.78, 0);
  const legR = legL.clone();
  legR.position.x = 0.11;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.66, 0.26), shirt);
  torso.position.y = 1.1;
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.62, 0.15), shirt);
  armL.geometry = armL.geometry.clone();
  armL.geometry.translate(0, -0.26, 0);
  armL.position.set(-0.33, 1.38, 0);
  const armR = armL.clone();
  armR.position.x = 0.33;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 10, 8), skin);
  head.position.y = 1.66;
  g.add(legL, legR, torso, armL, armR, head);
  g.userData = { legL, legR, armL, armR, torso };
  return g;
}

export class Pedestrians {
  constructor(scene, rng, count = 24) {
    this.scene = scene;
    this.rng = rng;
    this.peds = [];
    for (let i = 0; i < count; i++) this.peds.push(this.spawnPed());
  }

  spawnPed() {
    const rng = this.rng;
    const mesh = makePersonMesh(rng);
    // Walk an avenue edge: pick an avenue, a side, a direction.
    const onBeach = rng.chance(0.22);
    const ped = {
      mesh,
      pos: mesh.position,
      angle: 0,
      speed: 0,
      state: 'walk',
      timer: rng.float(0, 4),
      fleeFrom: null,
      down: 0,
      axis: rng.chance(0.5) ? 'x' : 'z',
      line: 0,
      side: rng.pick([-1, 1]),
      dir: rng.pick([-1, 1]),
    };
    if (onBeach) {
      ped.pos.set(rng.float(-190, 190), 0, rng.float(WORLD.beachZ + 3, WORLD.oceanZ - 5));
      ped.axis = 'x';
      ped.line = ped.pos.z;
    } else {
      const avenue = rng.int(-WORLD.gridHalf, WORLD.gridHalf) * P;
      const off = (WORLD.roadHalf + 1.7) * ped.side;
      if (ped.axis === 'x') ped.pos.set(rng.float(-180, 180), 0, avenue + off);
      else ped.pos.set(avenue + off, 0, rng.float(-180, 180));
      ped.line = avenue;
    }
    this.scene.add(mesh);
    return ped;
  }

  scare(x, z, radius = 18) {
    for (const ped of this.peds) {
      if (ped.state === 'down') continue;
      const dx = ped.pos.x - x;
      const dz = ped.pos.z - z;
      if (dx * dx + dz * dz < radius * radius) {
        ped.state = 'flee';
        ped.fleeFrom = { x, z };
        ped.timer = 2.6;
      }
    }
  }

  knockDown(ped) {
    if (ped.state === 'down') return;
    ped.state = 'down';
    ped.down = 5;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = 0.25;
  }

  update(dt, world) {
    const t = performance.now() / 1000;
    for (const ped of this.peds) {
      if (ped.state === 'down') {
        ped.down -= dt;
        if (ped.down <= 0) {
          this.scene.remove(ped.mesh);
          Object.assign(ped, this.spawnPedFresh());
        }
        continue;
      }
      let vx = 0;
      let vz = 0;
      const walkSpeed = ped.state === 'flee' ? 6.4 : 1.9;
      if (ped.state === 'flee') {
        const dx = ped.pos.x - ped.fleeFrom.x;
        const dz = ped.pos.z - ped.fleeFrom.z;
        const d = Math.hypot(dx, dz) || 1;
        vx = (dx / d) * walkSpeed;
        vz = (dz / d) * walkSpeed;
        ped.timer -= dt;
        if (ped.timer <= 0) ped.state = 'walk';
      } else {
        // Follow the sidewalk; at a cross avenue, sometimes turn the corner.
        if (ped.axis === 'x') {
          vx = ped.dir * walkSpeed;
          const cross = Math.round(ped.pos.x / P) * P;
          if (Math.abs(ped.pos.x - cross) < 0.6 && this.rng.chance(0.006)) {
            ped.axis = 'z';
            ped.line = cross;
            ped.pos.z = cross + (WORLD.roadHalf + 1.7) * ped.side;
          }
          if (Math.abs(ped.pos.x) > 196) ped.dir *= -1;
        } else {
          vz = ped.dir * walkSpeed;
          const cross = Math.round(ped.pos.z / P) * P;
          if (Math.abs(ped.pos.z - cross) < 0.6 && this.rng.chance(0.006)) {
            ped.axis = 'x';
            ped.line = cross;
            ped.pos.x = cross + (WORLD.roadHalf + 1.7) * ped.side;
          }
          if (Math.abs(ped.pos.z) > 196) ped.dir *= -1;
        }
      }
      ped.pos.x += vx * dt;
      ped.pos.z += vz * dt;
      world.collideCircle(ped.pos, 0.4);
      if (vx || vz) ped.angle = Math.atan2(vx, vz);
      ped.mesh.rotation.y = ped.angle;
      // Legs and arms swing with the stride.
      const swing = Math.sin(t * (ped.state === 'flee' ? 13 : 7) + ped.pos.x) * 0.55;
      const u = ped.mesh.userData;
      u.legL.rotation.x = swing;
      u.legR.rotation.x = -swing;
      u.armL.rotation.x = -swing * 0.8;
      u.armR.rotation.x = swing * 0.8;
      ped.mesh.position.y = Math.abs(Math.sin(t * 7 + ped.pos.x)) * 0.05;
    }
  }

  spawnPedFresh() {
    const ped = this.spawnPed();
    return ped;
  }
}
