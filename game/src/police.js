// The Solmar PD: a wanted level fed by every crime the game reports, and
// patrol cars that spawn on the avenues, hunt the player down, ram, block and
// — given a still target and a few seconds — make the bust. Heat cools only
// while no officer can see the player, which makes alleys and distance the
// way out. At three stars and up, officers on foot will shoot.

import * as THREE from 'three';
import { WORLD, WANTED, POLICE } from './config.js';
import { Car } from './vehicles.js';

const P = WORLD.blockPitch;

export class Police {
  constructor(scene, world, rng) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.heat = 0;
    this.officers = [];
    this.bustMeter = 0;
    this.seenTimer = 0;
    this.spawnTimer = 0;
    this.lastKnown = null;
    this.prevPlayerPos = null; // for lead pursuit: where the player is heading
    this.playerVel = { x: 0, z: 0 };
  }

  get stars() {
    if (this.heat <= 0) return 0;
    return Math.min(5, Math.ceil(this.heat / 100));
  }

  reportCrime(points, at) {
    this.heat = Math.min(500, this.heat + points);
    if (at) this.lastKnown = { x: at.x, z: at.z };
  }

  clearHeat() {
    this.heat = 0;
    this.bustMeter = 0;
  }

  desiredOfficers() {
    return [0, 1, 2, 3, 4, 5][this.stars];
  }

  spawnOfficer(playerPos) {
    // Appear on an avenue ring around the player, never in plain sight. A
    // candidate only counts if it lands on the road: snapped to an avenue,
    // outside every building, and still off-screen after the snapping — the
    // earlier version accepted the first candidate whatever it was, which
    // could drop a cruiser inside a block or right under the player's nose.
    const rng = this.rng;
    for (let tries = 0; tries < 8; tries++) {
      const a = rng.float(0, Math.PI * 2);
      const dist = rng.float(POLICE.spawnMin, POLICE.spawnMax);
      const x = THREE.MathUtils.clamp(playerPos.x + Math.sin(a) * dist, -WORLD.cityEdge, WORLD.cityEdge);
      const z = THREE.MathUtils.clamp(playerPos.z + Math.cos(a) * dist, -WORLD.cityEdge, WORLD.cityEdge);
      const probe = new THREE.Vector3(Math.round(x / P) * P, 0, z);
      const before = probe.clone();
      this.world.collideCircle(probe, 1.6);
      if (!probe.equals(before)) continue; // inside a building footprint
      if (probe.distanceTo(playerPos) < POLICE.spawnMin - 6) continue; // crept into view
      const car = new Car(this.scene, {
        modelIndex: 2,
        paint: 0xf2f4f6,
        x: probe.x,
        z: probe.z,
        angle: rng.float(0, Math.PI * 2),
        isPolice: true,
      });
      car.driver = { shootTimer: rng.float(1, 2.4) };
      this.officers.push(car);
      return;
    }
  }

  steerTo(car, target, dt, arriveRadius = 0) {
    const dx = target.x - car.pos.x;
    const dz = target.z - car.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetAngle = Math.atan2(dx, dz);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.2));
    let throttle = 1;
    if (arriveRadius && dist < arriveRadius) throttle = car.speed > 2 ? -0.8 : 0;
    else if (Math.abs(diff) > 2.4 && car.speed > 4) throttle = -0.6; // turn around
    return { throttle, steer, handbrake: Math.abs(diff) > 1.2 && car.speed > 12 };
  }

  update(dt, game) {
    const playerPos = game.playerPos();
    const stars = this.stars;

    // Track the player's velocity for lead pursuit: a cruiser that aims at
    // where a speeding car is will always arrive behind it.
    if (this.prevPlayerPos && dt > 0) {
      const k = 0.35; // smooth: frame-to-frame jitter is not a heading
      this.playerVel.x += ((playerPos.x - this.prevPlayerPos.x) / dt - this.playerVel.x) * k;
      this.playerVel.z += ((playerPos.z - this.prevPlayerPos.z) / dt - this.playerVel.z) * k;
    }
    this.prevPlayerPos = this.prevPlayerPos || new THREE.Vector3();
    this.prevPlayerPos.copy(playerPos);

    // Sight: any officer within POLICE.sightRange keeps the heat from cooling.
    let seen = false;
    for (const cop of this.officers) {
      if (cop.pos.distanceTo(playerPos) < POLICE.sightRange) { seen = true; break; }
    }
    this.seenTimer = seen ? 0 : this.seenTimer + dt;
    if (!seen && this.seenTimer > 2.5 && this.heat > 0) {
      this.heat = Math.max(0, this.heat - WANTED.decayPerSecond * dt * (1 + stars * 0.3));
      if (this.heat === 0) this.lastKnown = null;
    }
    if (seen) this.lastKnown = { x: playerPos.x, z: playerPos.z };

    // Spawn and retire to match the wanted level.
    this.spawnTimer -= dt;
    if (this.officers.length < this.desiredOfficers() && this.spawnTimer <= 0) {
      this.spawnOfficer(playerPos);
      this.spawnTimer = POLICE.spawnInterval;
    }
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const cop = this.officers[i];
      const far = cop.pos.distanceTo(playerPos) > POLICE.retireRange;
      if ((stars === 0 && far) || cop.dead) {
        cop.remove(this.scene);
        this.officers.splice(i, 1);
      }
    }

    // Drive the hunt. Each officer aims at the player's position led by
    // their velocity — the faster the player runs, the farther ahead the
    // intercept point — and the pack spreads across the road instead of
    // queueing in a single conga line behind the leader.
    const huntTarget = seen || !this.lastKnown ? playerPos : this.lastKnown;
    const playerSpeed = Math.hypot(this.playerVel.x, this.playerVel.z);
    this.officers.forEach((cop, idx) => {
      if (cop.dead) return;
      const dist = cop.pos.distanceTo(playerPos);
      const lead = seen ? Math.min(0.85, dist / 55) * Math.min(1, playerSpeed / 18) : 0;
      const spread = (idx % 3 - 1) * 4.5;
      const tx = huntTarget.x + this.playerVel.x * lead - this.playerVel.z * (playerSpeed > 1 ? spread / playerSpeed : 0);
      const tz = huntTarget.z + this.playerVel.z * lead + this.playerVel.x * (playerSpeed > 1 ? spread / playerSpeed : 0);
      const aim = { x: tx, z: tz };
      let control;
      if (dist < 7 && !game.player.car) {
        control = this.steerTo(cop, playerPos, dt, 4.5); // pull up beside a runner
      } else {
        control = this.steerTo(cop, aim, dt);
        if (dist < POLICE.ramRange && game.player.car) control.throttle = 1; // ram
      }
      cop.update(dt, control, this.world);
      // Officers trade paint with everyone, including each other.
      if (game.player.car) cop.collideWith(game.player.car);
      // At three stars an officer whose car is stopped nearby takes shots.
      if (stars >= POLICE.shootStars && !game.player.car && dist < POLICE.shootRange && Math.abs(cop.speed) < 2) {
        cop.driver.shootTimer -= dt;
        if (cop.driver.shootTimer <= 0) {
          cop.driver.shootTimer = this.rng.float(1.1, 1.9);
          game.officerShot(cop);
        }
      }
    });

    // The bust: a near, slow player with an officer close fills the meter.
    let busting = false;
    if (stars > 0) {
      for (const cop of this.officers) {
        const dist = cop.pos.distanceTo(playerPos);
        const playerSlow = game.playerSpeed() < 2.2;
        if (dist < POLICE.bustRange && playerSlow) { busting = true; break; }
      }
    }
    if (busting) {
      this.bustMeter += dt / WANTED.bustFillSeconds;
      if (this.bustMeter >= 1) {
        this.bustMeter = 0;
        game.onBusted();
      }
    } else {
      this.bustMeter = Math.max(0, this.bustMeter - dt * 1.4);
    }
    game.sound.setSiren(stars > 0 && this.officers.length > 0, dt);
  }
}
