// Cars: a stylised low-poly mesh built from boxes (body, cabin, wheels, lights)
// in six model flavours, and an arcade physics step any driver can use — the
// player, the traffic AI and the police all steer the same Car with different
// control inputs, so every car on the road handles alike.

import * as THREE from 'three';
import { CAR, CAR_MODELS, PALETTE } from './config.js';

const paintMats = new Map();
function paintMat(hex) {
  if (!paintMats.has(hex)) {
    paintMats.set(hex, new THREE.MeshLambertMaterial({ color: hex }));
  }
  return paintMats.get(hex);
}
const glassMat = new THREE.MeshLambertMaterial({ color: 0x1c2a3a });
const tyreMat = new THREE.MeshLambertMaterial({ color: 0x14151a });
const chromeMat = new THREE.MeshLambertMaterial({ color: 0xb9c2cc });

export function makeCarMesh(modelIndex, paintHex, isPolice = false, isTaxi = false) {
  const model = CAR_MODELS[modelIndex % CAR_MODELS.length];
  const g = new THREE.Group();
  const paint = isPolice ? paintMat(PALETTE.policeBody) : paintMat(paintHex);

  const length = modelIndex === 1 ? 4.7 : modelIndex === 5 ? 3.6 : 4.3;
  const bodyH = modelIndex === 1 ? 0.85 : 0.62;
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.84, bodyH, length), paint);
  body.position.y = 0.55 + bodyH / 2;
  g.add(body);

  if (modelIndex === 5) {
    // Duna Buggy: open frame, two seats, a roll bar, no doors.
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.4, 1.1), paintMat(0x333333));
    seat.position.set(0, 1.15, 0.2);
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.12), chromeMat);
    bar.position.set(0, 1.85, 0.75);
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 0.1), chromeMat);
    post1.position.set(-0.75, 1.45, 0.75);
    const post2 = post1.clone();
    post2.position.x = 0.75;
    g.add(seat, bar, post1, post2);
  } else if (modelIndex === 1) {
    // Brumo Pickup: cab at the front, open bed behind.
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.72, 1.5), paint);
    cab.position.set(0, 1.32, -0.9);
    const cabGlass = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.4, 1.2), glassMat);
    cabGlass.position.set(0, 1.42, -0.9);
    g.add(cab, cabGlass);
  } else if (modelIndex === 0) {
    // Cielo Convertible: low cabin tub, folded top, visible seats.
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.34, 1.9), paint);
    tub.position.set(0, 1.12, 0.25);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.42, 0.5), paintMat(0x6e3b22));
    seat.position.set(0, 1.05, 0.55);
    const shield = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.5, 0.08), glassMat);
    shield.position.set(0, 1.28, -0.72);
    shield.rotation.x = -0.25;
    g.add(tub, seat, shield);
  } else {
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.58, length * 0.46), paint);
    cabin.position.set(0, 1.14, 0.18);
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.42, length * 0.4), glassMat);
    glass.position.set(0, 1.18, 0.18);
    g.add(cabin, glass);
  }

  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.37, 0.37, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[-0.85, length / 2 - 0.75], [0.85, length / 2 - 0.75], [-0.85, -length / 2 + 0.75], [0.85, -length / 2 + 0.75]]) {
    const w = new THREE.Mesh(wheelGeo, tyreMat);
    w.position.set(x, 0.37, z);
    g.add(w);
    wheels.push(w);
  }

  // Lights: warm headlights, red tails; police get a light bar, taxis a sign.
  // The tail materials are kept per car so braking can flare them.
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  const tails = [];
  for (const x of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.06), headMat);
    h.position.set(x, 0.78, -length / 2 - 0.02);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.06), new THREE.MeshBasicMaterial({ color: 0xd21f33 }));
    t.position.set(x, 0.82, length / 2 + 0.02);
    tails.push(t.material);
    g.add(h, t);
  }
  let lightBar = null;
  if (isPolice) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.3, length * 0.8), paintMat(PALETTE.policeTrim));
    stripe.position.y = 0.92;
    g.add(stripe);
    lightBar = new THREE.Group();
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0xff2233 }));
    red.position.x = -0.3;
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.16, 0.3), new THREE.MeshBasicMaterial({ color: 0x2266ff }));
    blue.position.x = 0.3;
    lightBar.add(red, blue);
    lightBar.position.set(0, 1.62, 0.18);
    lightBar.userData = { red, blue };
    g.add(lightBar);
  }
  if (isTaxi) {
    const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.22, 0.3), new THREE.MeshBasicMaterial({ color: 0xffe95e }));
    sign.position.set(0, 1.62, 0.18);
    g.add(sign);
  }

  g.userData = { wheels, lightBar, length, tails };
  return { group: g, model };
}

export class Car {
  constructor(scene, { modelIndex = 2, paint = 0xd23c2e, x = 0, z = 0, angle = 0, isPolice = false, isTaxi = false }) {
    const { group, model } = makeCarMesh(modelIndex, paint, isPolice, isTaxi);
    this.mesh = group;
    this.model = model;
    this.pos = new THREE.Vector3(x, 0, z);
    this.angle = angle;
    this.speed = 0;
    this.steerVis = 0;
    this.health = 100;
    this.dead = false;
    this.crashPulse = 0; // set on impact, read by drivers and the sound board
    this.isPolice = isPolice;
    this.isTaxi = isTaxi;
    this.flashPhase = Math.random() * 6;
    scene.add(group);
    this.syncMesh(0);
  }

  get length() {
    return this.mesh.userData.length;
  }

  forward() {
    return { x: Math.sin(this.angle), z: Math.cos(this.angle) };
  }

  doorPosition() {
    // Beside the driver's door: where the player stands to get in or out.
    return {
      x: this.pos.x - Math.cos(this.angle) * 1.7,
      z: this.pos.z + Math.sin(this.angle) * 1.7,
    };
  }

  // control: { throttle: -1..1, steer: -1..1, handbrake: bool }
  update(dt, control, world) {
    if (this.dead) {
      this.speed = 0;
      this.syncMesh(dt);
      return;
    }
    const top = CAR.maxSpeed * this.model.topSpeed;
    const accel = CAR.accel * this.model.accel;
    // The handbrake locks the driven wheels: the engine does not get to
    // argue with it, it just scrubs speed at CAR.handbrakeDrag.
    if (control.throttle > 0 && !control.handbrake) {
      // Gas: while rolling backwards it brakes first, then pulls away.
      this.speed += accel * control.throttle * dt * (this.speed < -0.5 ? 2.4 : 1);
    } else if (control.throttle < 0) {
      if (this.speed > 0.5) this.speed -= CAR.brake * -control.throttle * dt;
      else this.speed += control.throttle * accel * 0.62 * dt; // reverse gear
      if (this.speed < -CAR.reverseTop) this.speed = -CAR.reverseTop;
    }
    // Drag and rolling resistance settle the car at its model's top speed.
    this.speed -= this.speed * CAR.drag * dt * (Math.abs(this.speed) / top || 0);
    if (!control.throttle) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), 3.2 * dt);
    if (this.speed > top) this.speed = top;
    if (control.handbrake) this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), CAR.handbrakeDrag * dt);
    // Brake lights flare while the car is actually shedding speed — a
    // parked car sits on its handbrake all day without glowing.
    const braking = Math.abs(this.speed) > 0.5 && (control.handbrake || control.throttle < 0);
    for (const m of this.mesh.userData.tails) m.color.setHex(braking ? 0xff5a3c : 0xd21f33);

    const speedRatio = THREE.MathUtils.clamp(this.speed / top, -1, 1);
    const steerAuthority = Math.min(1, Math.abs(this.speed) / 6) * (control.handbrake ? 1.5 : 1);
    this.angle += control.steer * CAR.gripTurn * steerAuthority * dt * Math.sign(this.speed || 1) * (1 - Math.abs(speedRatio) * 0.35);
    this.steerVis = THREE.MathUtils.lerp(this.steerVis, control.steer, 1 - Math.pow(0.0001, dt));

    const f = this.forward();
    const before = { x: this.pos.x, z: this.pos.z };
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    if (world.collideCircle(this.pos, CAR.radius)) {
      const impact = Math.abs(this.speed);
      if (impact > 7) {
        this.crashPulse = impact;
        this.health -= impact * 1.1;
      }
      // Bounce back along the incoming direction and kill most of the speed.
      this.pos.x = before.x + f.x * this.speed * dt * 0.2;
      this.pos.z = before.z + f.z * this.speed * dt * 0.2;
      world.collideCircle(this.pos, CAR.radius);
      this.speed = -this.speed * 0.22;
      if (this.health <= 0) this.kill();
    }
    this.syncMesh(dt);
  }

  // Circle collision against another car: push apart, trade a little speed.
  collideWith(other) {
    const dx = this.pos.x - other.pos.x;
    const dz = this.pos.z - other.pos.z;
    const d2 = dx * dx + dz * dz;
    const min = CAR.radius * 2 + 0.4;
    if (d2 > min * min || d2 === 0) return false;
    const d = Math.sqrt(d2);
    const push = (min - d) / 2;
    const nx = dx / d;
    const nz = dz / d;
    this.pos.x += nx * push;
    this.pos.z += nz * push;
    other.pos.x -= nx * push;
    other.pos.z -= nz * push;
    const rel = Math.abs(this.speed - other.speed);
    if (rel > 6) {
      this.crashPulse = Math.max(this.crashPulse, rel);
      other.crashPulse = Math.max(other.crashPulse, rel);
      this.health -= rel * 0.7;
      other.health -= rel * 0.7;
      if (this.health <= 0) this.kill();
      if (other.health <= 0) other.kill();
    }
    const swap = (this.speed + other.speed) / 2;
    this.speed = swap + (this.speed - swap) * 0.3;
    other.speed = swap + (other.speed - swap) * 0.3;
    return true;
  }

  kill() {
    this.dead = true;
    this.speed = 0;
    this.mesh.rotation.z = 0.06;
    this.mesh.position.y = -0.06;
  }

  syncMesh(dt) {
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.angle;
    const spin = this.speed * dt * 2.6;
    for (const w of this.mesh.userData.wheels) w.rotation.x += spin;
    const bar = this.mesh.userData.lightBar;
    if (bar) {
      const t = performance.now() / 130 + this.flashPhase;
      bar.userData.red.material.color.setHex(Math.sin(t) > 0 ? 0xff2233 : 0x551118);
      bar.userData.blue.material.color.setHex(Math.sin(t) > 0 ? 0x112255 : 0x2266ff);
    }
  }

  remove(scene) {
    scene.remove(this.mesh);
  }
}
