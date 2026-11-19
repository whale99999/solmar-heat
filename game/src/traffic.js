// Traffic: ordinary Solmar drivers following the avenue grid in the correct
// lane, braking for the car ahead, sometimes turning at intersections. They
// are the city's life and its obstacles: hit one and it counts as a crime,
// panic one and it flees. A traffic driver is just a Car plus a lane plan.

import { WORLD, PALETTE } from './config.js';
import { Car } from './vehicles.js';
import { Rng } from './random.js';

const P = WORLD.blockPitch;
const HALF = WORLD.gridHalf;
const LANE = 3.6;

// Heading vectors: 0 = +z (south), 1 = +x (east), 2 = -z (north), 3 = -x (west).
const HEADINGS = [
  { x: 0, z: 1 },
  { x: 1, z: 0 },
  { x: 0, z: -1 },
  { x: -1, z: 0 },
];

// The lane offset that keeps a heading on the right-hand side of its avenue.
function lanePoint(heading, line, along) {
  switch (heading) {
    case 0: return { x: line + LANE, z: along };  // southbound: right side is +x
    case 1: return { x: along, z: line - LANE };  // eastbound: right side is -z
    case 2: return { x: line - LANE, z: along };  // northbound: right side is -x
    default: return { x: along, z: line + LANE }; // westbound: right side is +z
  }
}

export class Traffic {
  constructor(scene, world, rng, count = 15) {
    this.scene = scene;
    this.world = world;
    this.rng = rng;
    this.cars = [];
    for (let i = 0; i < count; i++) this.cars.push(this.spawnCar());
  }

  spawnCar(near = null) {
    const rng = this.rng;
    const heading = rng.int(0, 3);
    const line = rng.int(-HALF, HALF) * P;
    const along = near ? near + rng.float(-30, 30) : rng.float(-HALF * P, HALF * P);
    const at = lanePoint(heading, line, along);
    const isTaxi = rng.chance(0.16);
    const car = new Car(this.scene, {
      modelIndex: isTaxi ? 4 : rng.int(0, 5),
      paint: isTaxi ? PALETTE.taxiPaint : rng.pick(PALETTE.carPaints),
      x: at.x,
      z: at.z,
      angle: Math.atan2(HEADINGS[heading].x, HEADINGS[heading].z),
      isTaxi,
    });
    car.driver = {
      heading,
      line,
      cruise: rng.float(9, 14.5),
      panic: 0,
      turnCooldown: rng.float(2, 6),
      honk: 0,        // set to 1 for one frame when the driver honks; main plays it
      blockedFor: 0,  // seconds spent held up by whatever is ahead
      honkCooldown: rng.float(0, 4),
    };
    return car;
  }

  // The avenue coordinate the car is approaching along its heading axis.
  alongOf(car) {
    const d = car.driver;
    return d.heading % 2 === 0 ? car.pos.z : car.pos.x;
  }

  controlFor(car, dt, obstacles) {
    const d = car.driver;
    const along = this.alongOf(car);
    // Next intersection ahead: avenue lines are every P units.
    const aheadLine = Math.round((along + Math.sign(HEADINGS[d.heading].x + HEADINGS[d.heading].z) * 0.01) / P) * P;
    const distToCross = (aheadLine - along) * (HEADINGS[d.heading].x + HEADINGS[d.heading].z >= 0 ? 1 : -1);
    d.turnCooldown -= dt;

    let target;
    if (d.turnCooldown <= 0 && Math.abs(distToCross) < 2.2 && this.rng.chance(0.5)) {
      // Turn onto the crossing avenue.
      const crossLine = Math.round((d.heading % 2 === 0 ? car.pos.x : car.pos.z) / P) * P;
      d.heading = (d.heading + (this.rng.chance(0.5) ? 1 : 3)) % 4;
      d.line = crossLine;
      d.turnCooldown = this.rng.float(3, 7);
    }
    const lookAhead = 13;
    const alongTarget = along + (HEADINGS[d.heading].x + HEADINGS[d.heading].z >= 0 ? lookAhead : -lookAhead);
    target = lanePoint(d.heading, d.line, alongTarget);

    // Steer toward the target point.
    const dx = target.x - car.pos.x;
    const dz = target.z - car.pos.z;
    const targetAngle = Math.atan2(dx, dz);
    let diff = targetAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.4));

    // Slow for anything close ahead: traffic, the player's car, the player.
    let throttle = car.speed < d.cruise ? 0.75 : 0;
    const f = car.forward();
    const obstacle = (ox, oz, dist) => {
      const rx = ox - car.pos.x;
      const rz = oz - car.pos.z;
      const ahead = rx * f.x + rz * f.z;
      const side = Math.abs(rx * f.z - rz * f.x);
      return ahead > 0 && ahead < dist && side < 2.4;
    };
    let blocked = false;
    for (const other of this.cars) {
      if (other !== car && obstacle(other.pos.x, other.pos.z, 10)) { throttle = -0.7; blocked = true; break; }
    }
    if (!blocked && obstacles) {
      for (const o of obstacles) {
        if (obstacle(o.x, o.z, 10)) { throttle = -0.7; blocked = true; break; }
      }
    }

    // Held up long enough, a Solmar driver says so: one honk, then a few
    // seconds of dignity before the next. Panic skips the wait entirely.
    d.honkCooldown -= dt;
    if (blocked && car.speed < 1.5) d.blockedFor += dt;
    else d.blockedFor = 0;
    if ((d.blockedFor > 1.4 || d.panic > 0) && d.honkCooldown <= 0) {
      d.honk = 1;
      d.honkCooldown = this.rng.float(2.5, 6);
      d.blockedFor = 0;
    }

    if (d.panic > 0) {
      d.panic -= dt;
      throttle = 1;
    }
    return { throttle, steer, handbrake: false };
  }

  panicNear(x, z, radius = 16) {
    for (const car of this.cars) {
      const dx = car.pos.x - x;
      const dz = car.pos.z - z;
      if (dx * dx + dz * dz < radius * radius) car.driver.panic = 3.5;
    }
  }

  update(dt, world, obstacles) {
    for (const car of this.cars) {
      if (car.dead) continue;
      car.update(dt, this.controlFor(car, dt, obstacles), world);
    }
    // Traffic settles its own collisions.
    for (let i = 0; i < this.cars.length; i++) {
      for (let j = i + 1; j < this.cars.length; j++) {
        this.cars[i].collideWith(this.cars[j]);
      }
    }
    // Recycle wrecks and cars that left the city far behind.
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      if (car.dead || Math.abs(car.pos.x) > WORLD.cityEdge + 40 || Math.abs(car.pos.z) > WORLD.cityEdge + 60) {
        car.remove(this.scene);
        this.cars[i] = this.spawnCar();
      }
    }
  }
}
