// The HUD: every scrap of DOM the player reads — cash and respect, the clock,
// the wanted stars, health and bust bars, the speedometer, the objective line,
// banners, toasts, prompts, the full screens, and the circular minimap with
// its blips. Game code calls small setters; this class owns the elements and
// the minimap's canvas drawing.

import { WORLD } from './config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.cashEl = $('cash');
    this.respectEl = $('respect');
    this.clockEl = $('clock');
    this.starsEl = $('stars');
    this.starSpans = [...this.starsEl.children];
    this.healthEl = $('health-fill');
    this.bustWrap = $('bust-wrap');
    this.bustEl = $('bust-fill');
    this.speedoEl = $('speedo');
    this.speedNumEl = $('speed-num');
    this.objectiveEl = $('objective');
    this.bannerEl = $('banner');
    this.bannerTitle = this.bannerEl.querySelector('.big');
    this.bannerSub = this.bannerEl.querySelector('.sub');
    this.toastEl = $('toast');
    this.promptEl = $('prompt');
    this.screens = {
      title: $('title-screen'),
      pause: $('pause-screen'),
      dead: $('death-screen'),
      busted: $('busted-screen'),
      complete: $('complete-screen'),
    };
    this.bannerUntil = 0;
    this.toastUntil = 0;
    this.objectiveText = '';
    this.objectiveDist = null;
    this.mapCtx = $('minimap').getContext('2d');
    this.mapBase = null; // the static minimap layer, painted once
  }

  setCash(n) {
    this.cashEl.textContent = `$${Math.floor(n).toLocaleString('en-US')}`;
  }

  setRespect(n) {
    this.respectEl.textContent = `RESPECT ★ ${Math.floor(n)}`;
  }

  setClock(minutes) {
    const h = Math.floor(minutes / 60) % 24;
    const m = Math.floor(minutes % 60);
    this.clockEl.textContent = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')} · PORT SOLMAR`;
  }

  setStars(n) {
    this.starSpans.forEach((s, i) => {
      s.classList.toggle('on', i < n);
      s.classList.toggle('off', i >= n);
    });
  }

  setHealth(frac) {
    this.healthEl.style.width = `${Math.max(0, frac * 100)}%`;
    this.healthEl.style.background = frac < 0.3 ? '#ff4757' : '#2ee6a8';
    // Under a third, the bar throbs — health you have to notice without
    // having to read it. setHealth runs every frame, so the pulse is free.
    this.healthEl.style.opacity = frac < 0.3 ? `${0.55 + 0.45 * Math.abs(Math.sin(performance.now() / 240))}` : '1';
  }

  setBust(frac) {
    if (frac > 0.02) {
      this.bustWrap.style.display = 'block';
      this.bustEl.style.width = `${frac * 100}%`;
    } else {
      this.bustWrap.style.display = 'none';
    }
  }

  setSpeed(kmh) {
    if (kmh === null) {
      this.speedoEl.style.display = 'none';
    } else {
      this.speedoEl.style.display = 'block';
      this.speedNumEl.textContent = `${Math.round(kmh)}`;
    }
  }

  setObjective(text) {
    this.objectiveText = text;
    this.renderObjective();
  }

  setObjectiveDistance(d) {
    this.objectiveDist = d;
    this.renderObjective();
  }

  renderObjective() {
    if (!this.objectiveText) {
      this.objectiveEl.style.display = 'none';
      return;
    }
    this.objectiveEl.style.display = 'block';
    const dist = this.objectiveDist !== null && this.objectiveDist > 12
      ? ` — ${Math.round(this.objectiveDist)}m`
      : '';
    this.objectiveEl.textContent = `➤ ${this.objectiveText}${dist}`;
  }

  showBanner(title, sub = '') {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.bannerEl.style.display = 'block';
    this.bannerUntil = performance.now() + 4200;
  }

  showToast(text) {
    this.toastEl.textContent = text;
    this.toastEl.style.display = 'block';
    this.toastUntil = performance.now() + 3200;
  }

  setPrompt(text) {
    if (text) {
      this.promptEl.textContent = text;
      this.promptEl.style.display = 'block';
    } else {
      this.promptEl.style.display = 'none';
    }
  }

  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      el.style.display = key === name ? 'flex' : 'none';
    }
  }

  update() {
    const now = performance.now();
    if (this.bannerUntil && now > this.bannerUntil) {
      this.bannerEl.style.display = 'none';
      this.bannerUntil = 0;
    }
    if (this.toastUntil && now > this.toastUntil) {
      this.toastEl.style.display = 'none';
      this.toastUntil = 0;
    }
  }

  // The minimap: the whole city at a glance. Roads as a grid, the beach as a
  // band, the player as an arrow, police as flashing blips, the objective as
  // a gold diamond, rivals as red dots.
  // The static layer — backdrop, beach, water, the avenue grid — never
  // changes, so it is painted once into an offscreen canvas and blitted;
  // only the blips are drawn per frame.
  paintMapBase() {
    const S = 188;
    const half = 230;
    const toPx = (x) => ((x + half) / (half * 2)) * S;
    const base = document.createElement('canvas');
    base.width = base.height = S;
    const ctx = base.getContext('2d');
    ctx.fillStyle = 'rgba(20,16,32,.92)';
    ctx.fillRect(0, 0, S, S);
    ctx.fillStyle = '#e8cf9f';
    ctx.fillRect(0, toPx(WORLD.beachZ), S, S - toPx(WORLD.beachZ));
    ctx.fillStyle = '#1d6f8e';
    ctx.fillRect(0, toPx(WORLD.oceanZ), S, S - toPx(WORLD.oceanZ));
    ctx.strokeStyle = 'rgba(255,255,255,.34)';
    ctx.lineWidth = 2;
    for (let i = -WORLD.gridHalf; i <= WORLD.gridHalf; i++) {
      const c = i * WORLD.blockPitch;
      ctx.beginPath();
      ctx.moveTo(toPx(c), 0);
      ctx.lineTo(toPx(c), S);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, toPx(c));
      ctx.lineTo(S, toPx(c));
      ctx.stroke();
    }
    this.mapBase = base;
  }

  drawMinimap(game) {
    const ctx = this.mapCtx;
    const S = 188;
    const half = 230;
    const toPx = (x) => ((x + half) / (half * 2)) * S;
    if (!this.mapBase) this.paintMapBase();
    ctx.clearRect(0, 0, S, S);
    ctx.drawImage(this.mapBase, 0, 0);
    const dot = (x, z, color, r = 3) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(toPx(x), toPx(z), r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const rival of game.missions.rivals) {
      if (!rival.dead) dot(rival.pos.x, rival.pos.z, '#ff4757', 3);
    }
    const flash = Math.sin(performance.now() / 160) > 0;
    for (const cop of game.police.officers) {
      dot(cop.pos.x, cop.pos.z, flash ? '#ff3344' : '#4488ff', 3.4);
    }
    const obj = game.missions.objective;
    if (obj && obj.pos) {
      const x = toPx(obj.pos.x);
      const y = toPx(obj.pos.z);
      ctx.fillStyle = '#ffd75e';
      ctx.beginPath();
      ctx.moveTo(x, y - 6);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x, y + 6);
      ctx.lineTo(x - 5, y);
      ctx.closePath();
      ctx.fill();
    }
    // The player arrow, turned by the camera.
    const px = toPx(game.player.pos.x);
    const py = toPx(game.player.pos.z);
    const a = game.camYaw;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(Math.PI - a);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.4, 5);
    ctx.lineTo(0, 2.4);
    ctx.lineTo(-4.4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
