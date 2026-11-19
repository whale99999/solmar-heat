// Rico Vale, the player: an on-foot character who walks, sprints, fights and
// drives. On foot he moves against the camera yaw; in a car the same keys
// become throttle and steering and this class simply rides along. Combat is a
// click: a punch when someone is close enough to reach, otherwise a pistol
// shot along the camera's aim — once Marina has given him the pistol.

import * as THREE from 'three';
import { PLAYER } from './config.js';
import { makePersonMesh } from './pedestrians.js';
import { Rng } from './random.js';

export class Player {
  constructor(scene, spawn) {
    const rng = new Rng(7);
    this.mesh = makePersonMesh(rng, 0x18b8a6); // Rico's teal shirt
    this.pos = this.mesh.position;
    this.pos.set(spawn.x, 0, spawn.z);
    this.angle = Math.PI; // facing the marina
    this.health = PLAYER.maxHealth;
    this.car = null;
    this.hasGun = false;
    this.fireTimer = 0;
    this.punchTimer = 0;
    this.dead = false;
    this.walkCycle = 0;
    this.vel = { x: 0, z: 0 }; // actual on-foot velocity; intent is smoothed into it
    scene.add(this.mesh);
  }

  get speedNow() {
    return this._speedNow || 0;
  }

  respawn(at) {
    this.pos.set(at.x, 0, at.z);
    this.health = PLAYER.maxHealth;
    this.dead = false;
    this.car = null;
    this.vel.x = 0;
    this.vel.z = 0;
    this._speedNow = 0;
    this.mesh.visible = true;
    this.mesh.rotation.x = 0;
  }

  // Movement on foot. aimYaw is the camera's facing; attacks go that way.
  updateOnFoot(dt, input, aimYaw, world, game) {
    let mx = 0;
    let mz = 0;
    if (input.down('KeyW', 'ArrowUp')) mz += 1;
    if (input.down('KeyS', 'ArrowDown')) mz -= 1;
    if (input.down('KeyA', 'ArrowLeft')) mx -= 1;
    if (input.down('KeyD', 'ArrowRight')) mx += 1;
    const moving = mx !== 0 || mz !== 0;
    const sprint = input.down('ShiftLeft', 'ShiftRight');
    const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    // Velocity chases intent with a short ramp: setting off and stopping
    // take a beat instead of snapping between 0 and full speed, and a sharp
    // direction change bleeds speed through the turn like a real stride.
    let wx = 0;
    let wz = 0;
    if (moving) {
      const len = Math.hypot(mx, mz);
      const lx = mx / len;
      const lz = mz / len;
      const sin = Math.sin(aimYaw);
      const cos = Math.cos(aimYaw);
      wx = lx * cos + lz * sin;
      wz = -lx * sin + lz * cos;
    }
    const blend = 1 - Math.exp(-PLAYER.accelRate * dt);
    this.vel.x += (wx * speed - this.vel.x) * blend;
    this.vel.z += (wz * speed - this.vel.z) * blend;
    if (Math.abs(this.vel.x) < 0.02 && !moving) this.vel.x = 0;
    if (Math.abs(this.vel.z) < 0.02 && !moving) this.vel.z = 0;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    const actualSpeed = Math.hypot(this.vel.x, this.vel.z);
    this._speedNow = actualSpeed;
    if (actualSpeed > 0.4) {
      // Turn toward the way he is actually moving, at a capped rate, so a
      // reversal swings him around instead of flipping him in one frame.
      const target = Math.atan2(this.vel.x, this.vel.z);
      let diff = target - this.angle;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      const turn = 1 - Math.exp(-PLAYER.turnRate * dt);
      this.angle += diff * turn;
      this.walkCycle += dt * actualSpeed * 1.15;
    }
    world.collideCircle(this.pos, PLAYER.radius);
    this.mesh.rotation.y = this.angle;
    const u = this.mesh.userData;
    const swing = actualSpeed > 0.4 ? Math.sin(this.walkCycle) * 0.6 : 0;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
    u.armL.rotation.x = -swing * 0.7;
    u.armR.rotation.x = swing * 0.7;
    this.mesh.position.y = actualSpeed > 0.4 ? Math.abs(Math.sin(this.walkCycle)) * 0.06 : 0;

    this.fireTimer -= dt;
    this.punchTimer -= dt;
    if ((input.mouseDown || input.clicked()) && !game.shotMode) {
      this.attack(game, aimYaw);
    }
  }

  attack(game, aimYaw) {
    // Someone within reach gets punched; otherwise the pistol speaks.
    const near = game.nearestFightable(this.pos, PLAYER.punchRange + 0.4);
    if (near && this.punchTimer <= 0) {
      this.punchTimer = 0.34;
      this.angle = Math.atan2(near.pos.x - this.pos.x, near.pos.z - this.pos.z);
      const u = this.mesh.userData;
      u.armR.rotation.x = -1.9;
      game.onPunch(near);
      return;
    }
    if (!this.hasGun || this.fireTimer > 0) return;
    this.fireTimer = PLAYER.fireCooldown;
    this.angle = aimYaw;
    game.onShoot(aimYaw);
  }

  // Driving: the mesh hides, the car is the body; position mirrors the car.
  updateInCar(dt) {
    this.pos.copy(this.car.pos);
    this._speedNow = Math.abs(this.car.speed);
    this.mesh.visible = false;
  }

  exitCar(world) {
    const door = this.car.doorPosition();
    this.car = null;
    this.pos.set(door.x, 0, door.z);
    world.collideCircle(this.pos, PLAYER.radius);
    this.mesh.visible = true;
  }

  hurt(amount) {
    if (this.dead) return;
    this.health -= amount;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
    }
  }

  heal(amount) {
    this.health = Math.min(PLAYER.maxHealth, this.health + amount);
  }
}
