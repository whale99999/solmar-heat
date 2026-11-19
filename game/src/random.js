// A small seeded random number generator (mulberry32). The same seed grows the
// same city every load, which keeps the screenshot scenes repeatable and the
// traffic honest: nothing in Solmar Heat depends on Math.random.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  float(min = 0, max = 1) {
    return min + this.next() * (max - min);
  }
  int(min, max) {
    return Math.floor(this.float(min, max + 1));
  }
  pick(list) {
    return list[Math.floor(this.next() * list.length) % list.length];
  }
  chance(p) {
    return this.next() < p;
  }
  // Fisher–Yates with this stream: a copy of the list in a seeded order, so
  // layouts that want variety without favourites (neon signs, crowd colours)
  // still come out identical on every load.
  shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  // A rough bell curve around a centre: the average of three draws, so most
  // values land mid-range and the extremes stay rare (crowd walking speeds).
  spread(centre, width) {
    const t = (this.next() + this.next() + this.next()) / 3;
    return centre + (t - 0.5) * 2 * width;
  }
}
