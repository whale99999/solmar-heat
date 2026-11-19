// Combat helpers shared by the player, the police and the rival crews:
// hitscan tests against circles, and a pool of tracer lines that flash for a
// frame or two wherever a shot lands. Gunfire is instant and readable — a
// bright streak, a spark at the end, and the sound board does the rest.

import * as THREE from 'three';

export class Tracers {
  constructor(scene, max = 24) {
    this.pool = [];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    for (let i = 0; i < max; i++) {
      const line = new THREE.Line(
        geo.clone(),
        new THREE.LineBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0 }),
      );
      line.frustumCulled = false;
      line.visible = false;
      scene.add(line);
      this.pool.push({ line, life: 0, maxLife: 0.07 });
    }
    this.next = 0;
  }

  fire(from, to, color = 0xffd98a) {
    const slot = this.pool[this.next];
    this.next = (this.next + 1) % this.pool.length;
    const pos = slot.line.geometry.getAttribute('position');
    pos.setXYZ(0, from.x, from.y ?? 1.4, from.z);
    pos.setXYZ(1, to.x, to.y ?? 1.2, to.z);
    pos.needsUpdate = true;
    slot.line.material.color.setHex(color);
    slot.line.visible = true;
    // Longer shots hang in the air a touch longer, so a 40-unit pistol crack
    // across the avenue reads as travel, not a blink.
    const dist = Math.hypot(to.x - from.x, to.z - from.z);
    slot.life = slot.maxLife = 0.06 + Math.min(0.08, dist * 0.002);
  }

  update(dt) {
    for (const slot of this.pool) {
      if (!slot.line.visible) continue;
      slot.life -= dt;
      slot.line.material.opacity = Math.max(0, slot.life / slot.maxLife) * 0.9;
      if (slot.life <= 0) slot.line.visible = false;
    }
  }
}

// Nearest circle hit along a ray on the ground plane. Targets are
// { x, z, radius, ref }; returns the ref of the closest one in range, or null.
// The test is a true ray-versus-circle: the closest point of the ray segment
// to each centre decides, and hits are ranked by where the ray first enters
// the circle — so a wide target whose centre sits just past the range still
// counts when its near edge is inside it, and a centre off the line can
// still be clipped by its own radius.
export function hitscanGround(from, angle, range, targets) {
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);
  let best = null;
  let bestEntry = range;
  for (const t of targets) {
    const radius = t.radius ?? 0.6;
    const rx = t.x - from.x;
    const rz = t.z - from.z;
    const along = rx * dx + rz * dz;
    const closest = Math.max(0, Math.min(range, along));
    const px = rx - dx * closest;
    const pz = rz - dz * closest;
    if (px * px + pz * pz > radius * radius) continue;
    const entry = Math.max(0, along - radius);
    if (entry < bestEntry) {
      best = t.ref;
      bestEntry = entry;
    }
  }
  return best;
}

// A soft round shadow blob texture, shared by people and cars so the sunset
// light does not leave them floating.
export function blobShadowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 4, 32, 32, 30);
  g.addColorStop(0, 'rgba(0,0,0,.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
