// The story of Rico Vale: five missions for Marina Sol's crew, from stealing
// a first ride to outrunning the whole Solmar PD, plus the city's repeatable
// side work — taxi fares and a street race. Each mission is a small chain of
// objectives; an objective is a place to reach, a car to be in, a pickup to
// grab or a crew to beat. A light beacon marks the spot, the HUD narrates,
// and finishing pays cash and respect, which the game saves.

import * as THREE from 'three';
import { WORLD, NAMES } from './config.js';
import { makePersonMesh } from './pedestrians.js';
import { Rng } from './random.js';

const P = WORLD.blockPitch;

class Rival {
  constructor(scene, rng, x, z) {
    this.mesh = makePersonMesh(rng, 0xd23c2e); // Coral Kings red
    this.pos = this.mesh.position;
    this.pos.set(x, 0, z);
    this.post = { x, z };
    this.health = 100;
    this.dead = false;
    this.shootTimer = rng.float(0.8, 1.8);
    this.strafe = rng.pick([-1, 1]);
    this.strafeTimer = rng.float(1, 3);
    this.walkCycle = rng.float(0, 6);
    scene.add(this.mesh);
  }

  hurt(amount) {
    this.health -= amount;
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      this.mesh.rotation.x = -Math.PI / 2;
      this.mesh.position.y = 0.25;
    }
  }

  update(dt, game) {
    if (this.dead) return;
    const player = game.player.pos;
    const dx = player.x - this.pos.x;
    const dz = player.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const u = this.mesh.userData;
    let moving = 0;
    if (dist < 30) {
      this.mesh.rotation.y = Math.atan2(dx, dz);
      this.strafeTimer -= dt;
      if (this.strafeTimer <= 0) {
        this.strafe *= -1;
        this.strafeTimer = 1 + Math.random() * 2;
      }
      // Keep a fighting distance: close in past 14, back off under 6.
      let mx = 0;
      let mz = 0;
      if (dist > 14) { mx = dx / dist; mz = dz / dist; moving = 1; }
      else if (dist < 6) { mx = -dx / dist; mz = -dz / dist; moving = 1; }
      else { mx = -dz / dist * this.strafe; mz = dx / dist * this.strafe; moving = 0.6; }
      const speed = 4.4 * moving;
      this.pos.x += mx * speed * dt;
      this.pos.z += mz * speed * dt;
      game.world.collideCircle(this.pos, 0.45);
      this.shootTimer -= dt;
      if (this.shootTimer <= 0 && dist < 30) {
        this.shootTimer = 1.1 + Math.random() * 1.1;
        game.rivalShot(this);
      }
    } else {
      // Idle guard: drift around the post.
      const back = Math.hypot(this.post.x - this.pos.x, this.post.z - this.pos.z);
      if (back > 2) {
        this.pos.x += ((this.post.x - this.pos.x) / back) * 1.6 * dt;
        this.pos.z += ((this.post.z - this.pos.z) / back) * 1.6 * dt;
        this.mesh.rotation.y = Math.atan2(this.post.x - this.pos.x, this.post.z - this.pos.z);
        moving = 0.5;
      }
    }
    this.walkCycle += dt * (moving ? 8 : 0);
    const swing = moving ? Math.sin(this.walkCycle) * 0.5 : 0;
    u.legL.rotation.x = swing;
    u.legR.rotation.x = -swing;
  }
}

export class Missions {
  constructor(game) {
    this.game = game;
    this.rng = new Rng(99);
    this.stage = 0; // next story mission, 0..5; 5 = campaign done
    this.step = 0;
    this.rivals = [];
    this.taxi = null;
    this.race = null;
    this.raceBest = 0;
    this.holdTimer = 0;

    // The objective beacon: a column of light visible across the city.
    const geo = new THREE.CylinderGeometry(1.6, 1.6, 30, 12, 1, true);
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd75e, transparent: true, opacity: 0.3, side: THREE.DoubleSide,
      depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.beacon = new THREE.Mesh(geo, mat);
    this.beacon.position.y = 15;
    this.beacon.visible = false;
    game.scene.add(this.beacon);
    this.objective = null;
  }

  setObjective(objective) {
    this.objective = objective;
    if (objective && objective.pos) {
      this.beacon.position.x = objective.pos.x;
      this.beacon.position.z = objective.pos.z;
      this.beacon.visible = true;
    } else {
      this.beacon.visible = false;
    }
    this.game.hud.setObjective(objective ? objective.label : '');
  }

  banner(title, sub) {
    this.game.hud.showBanner(title, sub);
  }

  startStory() {
    if (this.stage >= 5) {
      this.setObjective(null);
      return;
    }
    const start = [
      () => this.missionFirstWheels(),
      () => this.missionPackageRun(),
      () => this.missionRivalColors(),
      () => this.missionHarborHeist(),
      () => this.missionKingOfSolmar(),
    ][this.stage];
    start();
  }

  completeMission(cash, respect, title) {
    const g = this.game;
    g.addCash(cash);
    g.addRespect(respect);
    g.sound.missionDone();
    this.stage += 1;
    this.step = 0;
    this.banner(title, `+$${cash} · +${respect} respect — saved`);
    g.saveGame();
    this.startStory();
  }

  // 1 — steal a ride and bring it to Marina's Garage.
  missionFirstWheels() {
    this.banner('FIRST WHEELS', `${NAMES.fixer} needs a car at ${NAMES.garage}. Take one.`);
    this.setObjective({ kind: 'steal', label: 'Steal a car — walk up and press E' });
  }

  // 2 — three packages across town, then back to the garage; the run is hot.
  missionPackageRun() {
    // Pickups wait on street corners and the beachfront — never inside a
    // building footprint, so each one can actually be reached.
    this.pickups = [
      { x: -P + 10, z: WORLD.beachZ + 4 },
      { x: P + 8, z: -P - 8 },
      { x: 2 * P + 9, z: 2 * P - 8 },
    ];
    this.banner('PACKAGE RUN', 'Three pickups for the crew. The last one is watched.');
    this.nextPickup();
  }

  nextPickup() {
    const at = this.pickups.shift();
    if (!at) {
      this.setObjective({
        kind: 'goto', pos: this.game.world.landmarks.garage, radius: 8, inCar: false,
        label: `Deliver the packages to ${NAMES.garage}`,
        done: () => this.completeMission(400, 15, 'PACKAGE RUN COMPLETE'),
      });
      return;
    }
    const left = this.pickups.length;
    this.setObjective({
      kind: 'goto', pos: at, radius: 4.5, inCar: false,
      label: left ? `Pick up the package (${3 - left}/3)` : 'Pick up the last package — it is hot',
      done: () => {
        this.game.sound.pickup();
        if (!left) this.game.police.reportCrime(150, at);
        this.nextPickup();
      },
    });
  }

  // 3 — the Coral Kings are holding the beach lot. Take it back.
  missionRivalColors() {
    const lot = { x: this.game.world.landmarks.marina.x + 16, z: WORLD.beachZ + 4 };
    this.banner('RIVAL COLORS', `${NAMES.rivals} hold the marina lot. Clear them out.`);
    this.setObjective({
      kind: 'goto', pos: lot, radius: 16, inCar: false,
      label: 'Go to the marina lot',
      done: () => {
        if (this.rivals.length === 0) {
          for (let i = 0; i < 4; i++) {
            this.rivals.push(new Rival(this.game.scene, this.rng, lot.x + this.rng.float(-9, 9), lot.z + this.rng.float(-6, 6)));
          }
        }
        this.game.sound.hurt();
        this.setObjective({ kind: 'fight', label: `Beat ${NAMES.rivals} — 4 standing` });
      },
    });
  }

  // 4 — grab the crate at the marina and lose the heat at the hideout.
  missionHarborHeist() {
    const crate = { x: this.game.world.landmarks.marina.x + 10, z: WORLD.beachZ + 3 };
    this.banner('HARBOR HEIST', 'One crate, every cop in Solmar. Hold the spot to load it.');
    this.setObjective({
      kind: 'hold', pos: crate, radius: 5, seconds: 3, inCar: false,
      label: 'Load the crate at the marina — stay in the circle',
      done: () => {
        this.game.police.reportCrime(430, crate);
        this.banner('HEAT!', 'Four stars. Lose them at the Palms Hideout.');
        this.setObjective({
          kind: 'goto', pos: this.game.world.landmarks.hideout, radius: 9, inCar: false,
          label: `Escape to ${NAMES.hideout}`,
          done: () => {
            this.game.police.clearHeat();
            this.completeMission(900, 30, 'HARBOR HEIST COMPLETE');
          },
        });
      },
    });
  }

  // 5 — a checkpoint chase across the whole city against the clock.
  missionKingOfSolmar() {
    this.checkpoints = [
      { x: -2 * P, z: -2 * P }, { x: 0, z: -3 * P }, { x: 3 * P, z: -P },
      { x: 2 * P, z: 2 * P }, { x: -P, z: 3 * P }, { x: -3 * P, z: 0 },
    ];
    this.raceTimer = 75;
    this.banner('KING OF SOLMAR', 'Six checkpoints, one crown. You need a car — go.');
    this.nextCheckpoint(true);
  }

  nextCheckpoint(story = false) {
    const at = this.checkpoints.shift();
    if (!at) {
      this.completeMission(1500, 50, 'KING OF SOLMAR — CAMPAIGN COMPLETE');
      this.game.onCampaignComplete();
      return;
    }
    this.setObjective({
      kind: 'goto', pos: at, radius: 8, inCar: true,
      label: `Checkpoint ${6 - this.checkpoints.length}/6 — ${Math.ceil(this.raceTimer)}s left`,
      done: () => {
        this.game.sound.pickup();
        this.raceTimer += 14;
        this.nextCheckpoint(story);
      },
    });
  }

  // Clears whatever was mid-flight (a fight, a fare, a race) so a respawn can
  // restart the current story mission cleanly.
  resetTransient() {
    for (const r of this.rivals) this.game.scene.remove(r.mesh);
    this.rivals = [];
    this.taxi = null;
    this.race = null;
    this.raceTimer = undefined;
    this.checkpoints = null;
    this.holdTimer = 0;
    this.objective = null;
    this.beacon.visible = false;
  }

  // --- side work -----------------------------------------------------------

  // A point on an avenue lane, so a fare can always be reached by car.
  roadPoint() {
    const along = this.rng.float(-150, 150);
    const line = this.rng.int(-WORLD.gridHalf, WORLD.gridHalf) * P + (this.rng.chance(0.5) ? 3.6 : -3.6);
    return this.rng.chance(0.5) ? { x: line, z: along } : { x: along, z: line };
  }

  maybeStartTaxi() {
    // Called when the player gets into a cab after the campaign: a fare
    // appears. Side work never steals the story's objective slot.
    if (this.taxi || this.stage < 5) return;
    const g = this.game;
    this.taxi = { phase: 'pickup', from: this.roadPoint(), to: null };
    g.hud.showToast('A fare is waiting — follow the beacon');
  }

  updateTaxi(dt) {
    const g = this.game;
    if (!this.taxi) return;
    if (!g.player.car) {
      // Leaving the cab cancels the fare.
      this.taxi = null;
      if (this.objective && this.objective.side === 'taxi') this.setObjective(null);
      return;
    }
    const target = this.taxi.phase === 'pickup' ? this.taxi.from : this.taxi.to;
    if (!this.objective || this.objective.side !== 'taxi') {
      this.setObjective({
        kind: 'goto', pos: target, radius: 7, inCar: true, side: 'taxi',
        label: this.taxi.phase === 'pickup' ? 'Pick up the fare' : 'Drop the fare off',
        done: () => this.taxiArrived(),
      });
    }
  }

  taxiArrived() {
    const g = this.game;
    if (this.taxi.phase === 'pickup') {
      this.taxi.phase = 'drop';
      this.taxi.to = this.roadPoint();
      this.objective = null;
      g.sound.pickup();
      g.hud.showToast('Fare aboard — drive!');
    } else {
      const pay = 90 + Math.round(this.rng.float(0, 90));
      g.addCash(pay);
      g.sound.cash();
      g.hud.showToast(`Fare paid $${pay}`);
      this.taxi = null;
      this.setObjective(null);
      if (this.stage < 5 && !this.objective) this.startStory();
    }
  }

  // The standing street race by the garage: four checkpoints, best time kept.
  raceStartPos() {
    const g = this.game.world.landmarks.garage;
    return { x: g.x + 16, z: g.z + 10 };
  }

  startRace() {
    this.race = {
      t: 0,
      points: [
        { x: -P, z: 3 * P }, { x: -3 * P, z: P }, { x: -P, z: -2 * P }, { x: 2 * P, z: -P },
      ],
    };
    this.banner('SOLMAR SPRINT', 'Four checkpoints. $300 and the street\'s respect.');
    this.nextRacePoint();
  }

  nextRacePoint() {
    const at = this.race.points.shift();
    if (!at) {
      const t = this.race.t;
      this.race = null;
      const best = this.raceBest && t >= this.raceBest;
      if (!this.raceBest || t < this.raceBest) this.raceBest = t;
      this.game.addCash(300);
      this.game.sound.cash();
      this.game.hud.showToast(`Sprint finished in ${t.toFixed(1)}s — $300${best ? '' : ' · NEW BEST'}`);
      this.game.saveGame();
      this.setObjective(null);
      return;
    }
    this.setObjective({
      kind: 'goto', pos: at, radius: 8, inCar: true, side: 'race',
      label: `Sprint checkpoint — ${4 - this.race.points.length}/4`,
      done: () => {
        this.game.sound.pickup();
        this.nextRacePoint();
      },
    });
  }

  update(dt) {
    const g = this.game;
    const obj = this.objective;
    if (obj) {
      const p = g.player.pos;
      if (obj.kind === 'steal' && g.player.car) {
        // First Wheels, part two: bring the stolen ride to the garage.
        this.objective = null;
        this.setObjective({
          kind: 'goto', pos: g.world.landmarks.garage, radius: 9, inCar: true,
          label: `Deliver the car to ${NAMES.garage}`,
          done: () => {
            g.player.hasGun = true;
            g.hud.showToast('Marina left a pistol in the glovebox — click to shoot');
            this.completeMission(250, 10, 'FIRST WHEELS COMPLETE');
          },
        });
      }
      if (obj.kind === 'goto' || obj.kind === 'hold') {
        const dx = p.x - obj.pos.x;
        const dz = p.z - obj.pos.z;
        const dist = Math.hypot(dx, dz);
        g.hud.setObjectiveDistance(dist);
        const inPlace = dist < obj.radius && (!obj.inCar || g.player.car);
        if (obj.kind === 'hold') {
          if (inPlace) {
            this.holdTimer += dt;
            g.hud.setObjective(`${obj.label} — ${Math.ceil(obj.seconds - this.holdTimer)}…`);
            if (this.holdTimer >= obj.seconds) {
              this.holdTimer = 0;
              const done = obj.done;
              this.objective = null;
              done && done();
            }
          } else {
            this.holdTimer = 0;
          }
        } else if (inPlace) {
          const done = obj.done;
          this.objective = null;
          this.beacon.visible = false;
          done && done();
        }
      } else if (obj.kind === 'fight') {
        const standing = this.rivals.filter((r) => !r.dead).length;
        g.hud.setObjective(`Beat ${NAMES.rivals} — ${standing} standing`);
        if (standing === 0) {
          this.objective = null;
          this.beacon.visible = false;
          for (const r of this.rivals) g.scene.remove(r.mesh);
          this.rivals = [];
          this.completeMission(600, 25, 'RIVAL COLORS COMPLETE');
        }
      }
    }
    // The King of Solmar clock.
    if (this.stage === 4 && this.checkpoints && this.checkpoints.length >= 0 && this.objective && this.objective.kind === 'goto' && this.raceTimer !== undefined && this.stage < 5) {
      this.raceTimer -= dt;
      if (this.objective) {
        const left = 6 - this.checkpoints.length;
        this.objective.label = `Checkpoint ${left}/6 — ${Math.ceil(this.raceTimer)}s left`;
        g.hud.setObjective(this.objective.label);
      }
      if (this.raceTimer <= 0) {
        this.raceTimer = undefined;
        this.checkpoints = null;
        this.banner('OUT OF TIME', 'The crown waits. Marina still believes in you.');
        this.startStory();
      }
    }
    // The street race clock.
    if (this.race) {
      this.race.t += dt;
      if (this.objective && this.objective.side === 'race') {
        this.objective.label = `Sprint checkpoint — ${4 - this.race.points.length}/4 · ${this.race.t.toFixed(1)}s`;
        g.hud.setObjective(this.objective.label);
      }
    }
    // Rivals fight on their own clock.
    for (const rival of this.rivals) rival.update(dt, g);
    this.updateTaxi(dt);
    // The beacon breathes.
    if (this.beacon.visible) {
      this.beacon.material.opacity = 0.24 + Math.sin(performance.now() / 300) * 0.08;
    }
  }
}
