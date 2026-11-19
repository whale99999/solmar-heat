// The Solmar PD: a wanted level fed by every crime the game reports, and
// patrol cars that spawn on the avenues, hunt the player down, ram, block and
// — given a still target and a few seconds — make the bust. Heat cools only
// while no officer can see the player, which makes alleys and distance the
// way out. At three stars and up, officers on foot will shoot.

import * as THREE from 'three';
import { WORLD, WANTED } from './config.js';
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
    // Appear on an avenue ring around the player, never in plain sight.
    const rng = this.rng;
    for (let tries = 0; tries < 8; tries++) {
      const a = rng.float(0, Math.PI * 2);
      const dist = rng.float(62, 84);
      const x = THREE.MathUtils.clamp(playerPos.x + Math.sin(a) * dist, -WORLD.cityEdge, WORLD.cityEdge);
      const z = THREE.MathUtils.clamp(playerPos.z + Math.cos(a) * dist, -WORLD.cityEdge, WORLD.cityEdge);
      const car = new Car(this.scene, {
        modelIndex: 2,
        paint: 0xf2f4f6,
        x: Math.round(x / P) * P,
        z,
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

    // Sight: any officer within 60 units keeps the heat from cooling.
    let seen = false;
    for (const cop of this.officers) {
      if (cop.pos.distanceTo(playerPos) < 60) { seen = true; break; }
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
      this.spawnTimer = 1.6;
    }
    for (let i = this.officers.length - 1; i >= 0; i--) {
      const cop = this.officers[i];
      const far = cop.pos.distanceTo(playerPos) > 150;
      if ((stars === 0 && far) || cop.dead) {
        cop.remove(this.scene);
        this.officers.splice(i, 1);
      }
    }

    // Drive the hunt.
    const huntTarget = seen || !this.lastKnown ? playerPos : this.lastKnown;
    for (const cop of this.officers) {
      if (cop.dead) continue;
      const dist = cop.pos.distanceTo(playerPos);
      let control;
      if (dist < 7 && !game.player.car) {
        control = this.steerTo(cop, playerPos, dt, 4.5); // pull up beside a runner
      } else {
        control = this.steerTo(cop, huntTarget, dt);
        if (dist < 10 && game.player.car) control.throttle = 1; // ram
      }
      cop.update(dt, control, this.world);
      // Officers trade paint with everyone, including each other.
      if (game.player.car) cop.collideWith(game.player.car);
      // At three stars an officer whose car is stopped nearby takes shots.
      if (stars >= 3 && !game.player.car && dist < 20 && Math.abs(cop.speed) < 2) {
        cop.driver.shootTimer -= dt;
        if (cop.driver.shootTimer <= 0) {
          cop.driver.shootTimer = this.rng.float(1.1, 1.9);
          game.officerShot(cop);
        }
      }
    }

    // The bust: a near, slow player with an officer close fills the meter.
    let busting = false;
    if (stars > 0) {
      for (const cop of this.officers) {
        const dist = cop.pos.distanceTo(playerPos);
        const playerSlow = game.playerSpeed() < 2.2;
        if (dist < 6.5 && playerSlow) { busting = true; break; }
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
