// Solmar Heat — the game. This file wires the city together: the renderer and
// camera, the player on foot and in cars, traffic, pedestrians, the police
// and the wanted system, missions, combat, the HUD, saving, and the state
// machine that runs title → playing → busted / wasted → playing again. Every
// other module owns one job; this one owns the loop and the consequences:
// what counts as a crime, what a bullet hits, what death and arrest cost.

import * as THREE from 'three';
import { WORLD, PLAYER, WANTED, NAMES } from './config.js';
import { Rng } from './random.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { World } from './world.js';
import { Traffic } from './traffic.js';
import { Pedestrians } from './pedestrians.js';
import { Police } from './police.js';
import { Player } from './player.js';
import { Missions } from './missions.js';
import { Hud } from './hud.js';
import { Tracers, hitscanGround } from './combat.js';
import { setupShot } from './shots.js';

const params = new URLSearchParams(location.search);
const SAVE_KEY = 'solmar-heat-save-v1';

class Game {
  constructor() {
    this.shotMode = params.get('shot');
    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
    this.world = new World(this.scene);
    this.input = new Input(this.renderer.domElement);
    this.sound = new Sound(Boolean(this.shotMode));
    this.player = new Player(this.scene, this.world.landmarks.playerSpawn);
    this.traffic = new Traffic(this.scene, this.world, new Rng(WORLD.seed + 11));
    this.pedestrians = new Pedestrians(this.scene, new Rng(WORLD.seed + 23));
    this.police = new Police(this.scene, this.world, new Rng(WORLD.seed + 37));
    this.tracers = new Tracers(this.scene);
    this.hud = new Hud();
    this.missions = new Missions(this);
    this.parked = [];
    this.cash = 0;
    this.respect = 0;
    this.clockMinutes = 17 * 60 + 24;
    this.camYaw = Math.PI * 0.75;
    this.state = 'title';
    this.started = false;
    this.crimeTimers = {};
    this.musicTimer = 0;
    this.bar = 0;
    this.shotCamera = null;
    this.frames = 0;

    if (!this.shotMode) this.loadGame();
    this.hud.showScreen(this.shotMode ? null : 'title');
    this.resize();
    addEventListener('resize', () => this.resize());
    this.renderer.domElement.addEventListener('click', () => {
      if (this.state === 'playing' && !this.shotMode) this.input.lockPointer();
    });
    if (this.shotMode) {
      this.state = 'playing';
      this.started = true;
      setupShot(this.shotMode, this);
    }
    if (params.get('debug')) window.__game = this; // local playtesting only
    this.last = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  // --- small services the modules call back into ---------------------------

  playerPos() {
    return this.player.pos;
  }

  playerSpeed() {
    return this.player.car ? Math.abs(this.player.car.speed) : this.player.speedNow;
  }

  addCash(n) {
    this.cash += n;
  }

  addRespect(n) {
    this.respect += n;
  }

  reportCrime(kind, points, at) {
    // One crime, one report — a burst of collisions is a single incident.
    const now = performance.now();
    if (this.crimeTimers[kind] && now - this.crimeTimers[kind] < 1200) return;
    this.crimeTimers[kind] = now;
    this.police.reportCrime(points, at || this.player.pos);
  }

  allCars() {
    return [...this.traffic.cars, ...this.parked, ...this.police.officers];
  }

  nearestCar(maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of this.allCars()) {
      if (car.dead) continue;
      const d = car.pos.distanceTo(this.player.pos);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  nearestFightable(pos, range) {
    let best = null;
    let bestD = range;
    for (const rival of this.missions.rivals) {
      if (rival.dead) continue;
      const d = rival.pos.distanceTo(pos);
      if (d < bestD) { bestD = d; best = { kind: 'rival', ref: rival, pos: rival.pos }; }
    }
    for (const ped of this.pedestrians.peds) {
      if (ped.state === 'down') continue;
      const d = ped.pos.distanceTo(pos);
      if (d < bestD) { bestD = d; best = { kind: 'ped', ref: ped, pos: ped.pos }; }
    }
    return best;
  }

  // --- combat ---------------------------------------------------------------

  onShoot(aimYaw) {
    const from = this.player.pos;
    this.sound.shot();
    this.reportCrime('shot', WANTED.shotFired, from);
    this.pedestrians.scare(from.x, from.z, 20);
    this.traffic.panicNear(from.x, from.z, 18);
    const targets = [];
    for (const rival of this.missions.rivals) {
      if (!rival.dead) targets.push({ x: rival.pos.x, z: rival.pos.z, radius: 0.8, ref: { kind: 'rival', rival } });
    }
    for (const ped of this.pedestrians.peds) {
      if (ped.state !== 'down') targets.push({ x: ped.pos.x, z: ped.pos.z, radius: 0.55, ref: { kind: 'ped', ped } });
    }
    for (const car of this.allCars()) {
      if (!car.dead) targets.push({ x: car.pos.x, z: car.pos.z, radius: 2.0, ref: { kind: 'car', car } });
    }
    const hit = hitscanGround(from, aimYaw, PLAYER.gunRange, targets);
    const end = { x: from.x + Math.sin(aimYaw) * PLAYER.gunRange, z: from.z + Math.cos(aimYaw) * PLAYER.gunRange };
    if (hit) {
      const t = targets.find((c) => c.ref === hit);
      if (t) { end.x = t.x; end.z = t.z; }
    }
    this.tracers.fire({ x: from.x, y: 1.45, z: from.z }, { x: end.x, y: 1.1, z: end.z });
    if (!hit) return;
    if (hit.kind === 'rival') {
      hit.rival.hurt(PLAYER.gunDamage);
      this.sound.hit();
      if (hit.rival.dead) this.reportCrime('rival', WANTED.rivalDown, hit.rival.pos);
    } else if (hit.kind === 'ped') {
      this.pedestrians.knockDown(hit.ped);
      this.sound.hit();
      this.reportCrime('ped', WANTED.hitPed, hit.ped.pos);
    } else if (hit.kind === 'car') {
      hit.car.health -= PLAYER.gunDamage * 0.7;
      if (hit.car.health <= 0 && !hit.car.dead) {
        hit.car.kill();
        if (hit.car.isPolice) this.reportCrime('copcar', 220, hit.car.pos);
      }
    }
  }

  onPunch(near) {
    this.sound.punch();
    if (near.kind === 'rival') {
      near.ref.hurt(PLAYER.punchDamage);
      this.sound.hit();
      if (near.ref.dead) this.reportCrime('rival', WANTED.rivalDown, near.ref.pos);
    } else {
      this.pedestrians.knockDown(near.ref);
      this.pedestrians.scare(near.ref.pos.x, near.ref.pos.z, 12);
      this.reportCrime('ped', WANTED.hitPed, near.ref.pos);
    }
  }

  enemyShot(fromPos, damage, hitChance) {
    const to = this.player.pos;
    const dist = fromPos.distanceTo(to);
    const spread = (Math.random() - 0.5) * 3;
    const ex = to.x + Math.cos(this.player.angle) * spread;
    const ez = to.z - Math.sin(this.player.angle) * spread;
    this.tracers.fire(
      { x: fromPos.x, y: 1.3, z: fromPos.z },
      { x: ex, y: 1.2, z: ez },
      0xff8855,
    );
    this.sound.shot();
    if (Math.random() < hitChance * (dist < 10 ? 1.15 : 1)) this.damagePlayer(damage);
  }

  rivalShot(rival) {
    const dist = rival.pos.distanceTo(this.player.pos);
    this.enemyShot(rival.pos, 7, THREE.MathUtils.clamp(0.62 - dist * 0.013, 0.2, 0.6));
  }

  officerShot(cop) {
    this.enemyShot(cop.pos, 6, 0.34);
  }

  damagePlayer(amount) {
    if (this.state !== 'playing' || this.shotMode) return;
    this.player.hurt(amount);
    this.sound.hurt();
    if (this.player.dead) this.onWasted();
  }

  // --- consequences -----------------------------------------------------------

  onBusted() {
    if (this.state !== 'playing') return;
    this.state = 'busted';
    this.sound.bustedJingle();
    this.sound.setEngine(false, 0);
    if (document.exitPointerLock) document.exitPointerLock();
    this.hud.showScreen('busted');
  }

  onWasted() {
    if (this.state !== 'playing') return;
    this.state = 'dead';
    this.sound.setEngine(false, 0);
    if (document.exitPointerLock) document.exitPointerLock();
    this.hud.showScreen('dead');
  }

  onCampaignComplete() {
    this.state = 'complete';
    this.hud.showScreen('complete');
  }

  respawn() {
    const fine = this.state === 'busted' ? Math.min(this.cash, 150) : Math.min(this.cash, 100);
    this.cash -= fine;
    if (this.player.car) {
      this.player.car = null;
      this.player.mesh.visible = true;
    }
    for (const cop of this.police.officers) cop.remove(this.scene);
    this.police.officers = [];
    this.police.clearHeat();
    this.player.respawn(this.world.landmarks.clinic);
    this.player.mesh.rotation.x = 0;
    this.missions.resetTransient();
    this.missions.startStory();
    this.hud.showScreen(null);
    this.state = 'playing';
    if (fine) this.hud.showToast(`The city takes $${fine} for its trouble`);
  }

  // --- saving -----------------------------------------------------------------

  saveGame() {
    if (this.shotMode) return;
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        stage: this.missions.stage,
        cash: this.cash,
        respect: this.respect,
        hasGun: this.player.hasGun,
        raceBest: this.missions.raceBest,
      }));
    } catch { /* private mode: play on unsaved */ }
  }

  loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.missions.stage = s.stage || 0;
      this.cash = s.cash || 0;
      this.respect = s.respect || 0;
      this.player.hasGun = Boolean(s.hasGun);
      this.missions.raceBest = s.raceBest || 0;
    } catch { /* a corrupt save is a fresh start */ }
  }

  // --- interaction --------------------------------------------------------------

  tryInteract() {
    const player = this.player;
    const world = this.world;
    if (player.car) {
      const garage = world.landmarks.garage;
      const nearGarage = player.car.pos.distanceTo(new THREE.Vector3(garage.x, 0, garage.z)) < 10;
      if (nearGarage && player.car.health < 100 && this.cash >= 50) {
        this.cash -= 50;
        player.car.health = 100;
        player.car.dead = false;
        player.car.mesh.rotation.z = 0;
        this.sound.cash();
        this.hud.showToast('Marina\'s crew patched the car up — $50');
        return;
      }
      player.exitCar(world);
      this.sound.carDoor();
      this.sound.setEngine(false, 0);
      return;
    }
    const car = this.nearestCar(3.8);
    if (car) {
      // Move the car into the player's parked list, whichever list it lived on.
      const ti = this.traffic.cars.indexOf(car);
      if (ti >= 0) this.traffic.cars.splice(ti, 1);
      const pi = this.police.officers.indexOf(car);
      if (pi >= 0) this.police.officers.splice(pi, 1);
      if (!this.parked.includes(car)) {
        this.parked.push(car);
        if (this.parked.length > 6) {
          const old = this.parked.shift();
          if (old !== car) old.remove(this.scene);
        }
      }
      player.car = car;
      player.mesh.visible = false;
      this.sound.carDoor();
      if (!car.ownedByPlayer) {
        car.ownedByPlayer = true;
        this.reportCrime('theft', WANTED.theft, car.pos);
        this.pedestrians.scare(car.pos.x, car.pos.z, 9);
      }
      if (car.isTaxi) this.missions.maybeStartTaxi();
      return;
    }
    const clinic = world.landmarks.clinic;
    if (player.pos.distanceTo(new THREE.Vector3(clinic.x, 0, clinic.z)) < 7 && player.health < PLAYER.maxHealth) {
      player.heal(PLAYER.maxHealth);
      this.sound.pickup();
      this.hud.showToast('Patched up at Solmar Clinic');
      return;
    }
    const raceAt = this.missions.raceStartPos();
    if (this.missions.stage >= 5 && !this.missions.race &&
        player.pos.distanceTo(new THREE.Vector3(raceAt.x, 0, raceAt.z)) < 7) {
      this.missions.startRace();
    }
  }

  currentPrompt() {
    if (this.shotMode || this.state !== 'playing') return null;
    const player = this.player;
    if (player.car) {
      const garage = this.world.landmarks.garage;
      if (player.car.pos.distanceTo(new THREE.Vector3(garage.x, 0, garage.z)) < 10 && player.car.health < 100) {
        return this.cash >= 50 ? 'E — repair the car ($50)' : 'The garage wants $50 to repair';
      }
      return 'E — get out · SPACE — handbrake';
    }
    const car = this.nearestCar(3.8);
    if (car) return `E — take the ${car.model.name}`;
    const clinic = this.world.landmarks.clinic;
    if (player.pos.distanceTo(new THREE.Vector3(clinic.x, 0, clinic.z)) < 7 && player.health < PLAYER.maxHealth) {
      return 'E — patch up at the clinic';
    }
    const raceAt = this.missions.raceStartPos();
    if (this.missions.stage >= 5 && !this.missions.race &&
        player.pos.distanceTo(new THREE.Vector3(raceAt.x, 0, raceAt.z)) < 7) {
      return 'E — run the Solmar Sprint ($300)';
    }
    return null;
  }

  // --- the loop -------------------------------------------------------------------

  frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.05);
    this.frames += 1;

    if (this.input.tap('Enter')) this.onEnter();
    if (this.input.tap('KeyP') && (this.state === 'playing' || this.state === 'paused')) {
      this.state = this.state === 'playing' ? 'paused' : 'playing';
      this.hud.showScreen(this.state === 'paused' ? 'pause' : null);
    }
    if (this.input.tap('KeyM') && this.state === 'playing') {
      this.saveGame();
      this.hud.showToast('Saved');
    }

    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'title') {
      this.camYaw += dt * 0.04;
      this.world.update(dt, now / 1000);
    }

    this.updateCamera(dt);
    this.hud.update();
    this.renderer.render(this.scene, this.camera);
    if (this.shotMode && this.frames === 10) window.__shotReady = true;
  }

  onEnter() {
    if (this.state === 'title') {
      this.state = 'playing';
      this.started = true;
      this.hud.showScreen(null);
      this.missions.startStory();
      this.sound.wake();
    } else if (this.state === 'dead' || this.state === 'busted') {
      this.respawn();
    } else if (this.state === 'complete') {
      this.state = 'playing';
      this.hud.showScreen(null);
      this.hud.showToast('Free roam: taxi fares and the Solmar Sprint pay at the garage');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.showScreen(null);
    }
  }

  refreshHud() {
    this.hud.setCash(this.cash);
    this.hud.setRespect(this.respect);
    this.hud.setClock(this.clockMinutes);
    this.hud.setStars(this.police.stars);
    this.hud.setHealth(this.player.health / PLAYER.maxHealth);
    this.hud.setBust(this.police.bustMeter);
    this.hud.setSpeed(this.player.car ? Math.abs(this.player.car.speed) * 3.6 : null);
    this.hud.setPrompt(this.currentPrompt());
    this.hud.drawMinimap(this);
  }

  update(dt) {
    const t = performance.now() / 1000;
    if (this.shotMode) {
      // A posed scene: the world breathes and the light bars flash, but no AI
      // moves — the composition the screenshot was staged with must hold.
      this.world.update(dt, t);
      this.tracers.update(dt);
      for (const cop of this.police.officers) cop.syncMesh(0);
      if (this.player.car) this.player.car.syncMesh(0);
      this.refreshHud();
      return;
    }
    this.clockMinutes += dt * 1.5;
    const look = this.input.lookDelta();
    this.camYaw += look.x;

    if (this.input.tap('KeyE')) this.tryInteract();

    const player = this.player;
    if (player.car) {
      const control = {
        throttle: (this.input.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.input.down('KeyS', 'ArrowDown') ? 1 : 0),
        steer: (this.input.down('KeyA', 'ArrowLeft') ? 1 : 0) - (this.input.down('KeyD', 'ArrowRight') ? 1 : 0),
        handbrake: this.input.down('Space'),
      };
      player.car.update(dt, control, this.world);
      player.updateInCar(dt);
      this.sound.setEngine(true, Math.abs(player.car.speed) / 40);
      if (player.car.crashPulse > 4) {
        this.sound.crash(Math.min(1, player.car.crashPulse / 26));
        if (player.car.crashPulse > 9) this.damagePlayer(2);
        player.car.crashPulse = 0;
      }
      // Running someone down is the loudest crime there is.
      for (const ped of this.pedestrians.peds) {
        if (ped.state !== 'down' && Math.abs(player.car.speed) > 4 &&
            ped.pos.distanceTo(player.car.pos) < 1.9) {
          this.pedestrians.knockDown(ped);
          this.sound.hit();
          this.reportCrime('ped', WANTED.hitPed, ped.pos);
        }
      }
      // Trading paint with traffic.
      for (const other of this.traffic.cars) {
        if (player.car.collideWith(other) && Math.abs(player.car.speed - other.speed) > 6) {
          this.reportCrime('hitcar', WANTED.hitCar, player.car.pos);
        }
      }
    } else {
      player.updateOnFoot(dt, this.input, this.camYaw, this.world, this);
      this.sound.setEngine(false, 0);
    }

    const obstacles = [...this.parked.map((c) => c.pos), ...(player.car ? [player.car.pos] : [])];
    this.traffic.update(dt, this.world, obstacles);
    for (const car of this.parked) {
      if (car !== player.car) {
        car.update(dt, { throttle: 0, steer: 0, handbrake: true }, this.world);
      }
    }
    this.pedestrians.update(dt, this.world);
    this.police.update(dt, this);
    this.missions.update(dt);
    this.tracers.update(dt);
    this.world.update(dt, t);

    // The loop: a soft synth bass line while the city is alive.
    this.musicTimer -= dt;
    if (this.musicTimer <= 0) {
      this.musicTimer = 0.46;
      this.sound.musicTick(this.bar);
      this.bar += 1;
    }

    this.refreshHud();
  }

  updateCamera(dt) {
    if (this.shotCamera) {
      this.camera.position.copy(this.shotCamera.pos);
      this.camera.lookAt(this.shotCamera.look);
      return;
    }
    const target = this.player.pos;
    if (this.state === 'title') {
      const r = 120;
      this.camera.position.set(Math.sin(this.camYaw) * r, 46, Math.cos(this.camYaw) * r);
      this.camera.lookAt(0, 6, 0);
      return;
    }
    const inCar = Boolean(this.player.car);
    if (inCar) {
      // The chase camera settles behind the car.
      let diff = this.player.car.angle - this.camYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.camYaw += diff * Math.min(1, dt * 3.2);
    }
    const dist = inCar ? 10.5 : 7;
    const height = inCar ? 3.8 : 3.1;
    const fx = Math.sin(this.camYaw);
    const fz = Math.cos(this.camYaw);
    this.camera.position.set(
      target.x - fx * dist,
      target.y + height,
      target.z - fz * dist,
    );
    this.camera.lookAt(target.x + fx * 6, target.y + 1.5, target.z + fz * 6);
  }
}

new Game();
