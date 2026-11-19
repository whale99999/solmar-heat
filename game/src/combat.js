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
      this.pool.push({ line, life: 0 });
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
    slot.life = 0.07;
  }

  update(dt) {
    for (const slot of this.pool) {
      if (!slot.line.visible) continue;
      slot.life -= dt;
      slot.line.material.opacity = Math.max(0, slot.life / 0.07) * 0.9;
      if (slot.life <= 0) slot.line.visible = false;
    }
  }
}

// Nearest circle hit along a ray on the ground plane. Targets are
// { x, z, radius, ref }; returns the ref of the closest one in range, or null.
export function hitscanGround(from, angle, range, targets) {
  const dx = Math.sin(angle);
  const dz = Math.cos(angle);
  let best = null;
  let bestT = range;
  for (const t of targets) {
    const rx = t.x - from.x;
    const rz = t.z - from.z;
    const along = rx * dx + rz * dz;
    if (along < 0 || along > bestT) continue;
    const side = Math.abs(rx * dz - rz * dx);
    if (side <= (t.radius ?? 0.6)) {
      best = t.ref;
      bestT = along;
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
