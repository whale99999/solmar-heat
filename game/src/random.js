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
}
