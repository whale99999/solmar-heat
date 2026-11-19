// Solmar Heat — every tuning number, name and colour in one place.
// Port Solmar is an original sun-soaked coastal city: a grid of avenues, a beach
// strip along the south edge, a marina on the south-west pier. Nothing here is
// borrowed from any commercial game; every name below was invented for this one.

export const WORLD = {
  seed: 20261119,
  blockPitch: 46,          // distance between avenue centrelines
  roadHalf: 7,             // half the width of an avenue
  gridHalf: 3,             // avenues run from -3..3 pitches each way (7 avenues)
  beachZ: 196,             // sand starts here, ocean beyond
  oceanZ: 224,
  cityEdge: 176,           // invisible wall for cars and the player
};

export const PLAYER = {
  walkSpeed: 7.2,
  sprintSpeed: 11.5,
  accelRate: 13,           // how fast on-foot velocity catches up with intent
  turnRate: 14,            // how fast Rico turns to face his movement
  radius: 0.55,
  maxHealth: 100,
  punchRange: 1.7,
  punchDamage: 34,
  gunDamage: 26,
  gunRange: 42,
  fireCooldown: 0.22,
};

export const CAR = {
  accel: 15.5,
  brake: 26,
  reverse: 8,
  reverseTop: 16,          // fastest the reverse gear will pull, whatever the model
  drag: 0.55,
  handbrakeDrag: 26,       // speed scrubbed per second with the handbrake held
  gripTurn: 1.85,          // steering rate at speed
  maxSpeed: 41,            // ~92 mph on the speedo
  radius: 1.55,
};

export const POLICE = {
  sightRange: 60,          // an officer this close keeps the heat from cooling
  spawnMin: 62,            // pursuit cars appear on a ring this far out...
  spawnMax: 86,            // ...up to this far, always off-screen
  spawnInterval: 1.6,      // seconds between reinforcements
  retireRange: 150,        // officers farther than this give up and despawn
  shootStars: 3,           // at this many stars stopped officers open fire
  shootRange: 20,
  ramRange: 11,            // this close to a driving player, they stop being polite
  bustRange: 6.5,          // an officer this close to a slow player makes the bust
};

export const GAME = {
  dayRate: 1.5,            // game-clock minutes per real second
  crimeDebounceMs: 1200,   // one incident, one report: same crime inside this window counts once
  repairCost: 50,          // Marina's crew patches a car for this
  bustFine: 150,           // bail, capped by the cash on hand
  wastedFine: 100,         // the clinic's bill, likewise capped
};

export const WANTED = {
  // crime points: 100 points = one star
  theft: 60,
  hitPed: 55,
  hitCar: 22,
  shotFired: 14,
  rivalDown: 45,
  missionHeat: 130,
  decayPerSecond: 3.2,     // only while no police officer can see the player
  bustFillSeconds: 2.6,    // standing next to a stopped officer fills the meter
};

export const PALETTE = {
  sky: 0x2c1a4d,
  fog: 0x51325e,
  sun: 0xffb36b,
  road: 0x2e2a33,
  roadLine: 0xf7d774,
  sidewalk: 0x8d8578,
  sand: 0xe8cf9f,
  ocean: 0x1d6f8e,
  grass: 0x4d7d43,
  buildingTones: [0xd9a066, 0xe8e3d8, 0x9fd8e8, 0xf2b8c6, 0xb8e6c9, 0xf7e8a0, 0xc9b8f2, 0xe88f5d, 0xfff3e0, 0x7fd4c1],
  carPaints: [0xd23c2e, 0x2e7fd2, 0xf2b134, 0x39c26d, 0xe8e8ec, 0x22242a, 0x8e44ad, 0xff6fa5, 0x18b8a6, 0xf26d21],
  policeBody: 0xf2f4f6,
  policeTrim: 0x1d3fbf,
  taxiPaint: 0xffc21f,
};

export const NAMES = {
  city: 'Port Solmar',
  player: 'Rico Vale',
  fixer: 'Marina Sol',
  crew: 'the Marina crew',
  rivals: 'the Coral Kings',
  police: 'Solmar PD',
  garage: 'Marina’s Garage',
  clinic: 'Solmar Clinic',
  hideout: 'the Palms Hideout',
};

export const CAR_MODELS = [
  { name: 'Cielo Convertible', topSpeed: 1.12, accel: 1.1, hue: 0 },
  { name: 'Brumo Pickup', topSpeed: 0.88, accel: 0.95, hue: 1 },
  { name: 'Vela Sedan', topSpeed: 1.0, accel: 1.0, hue: 2 },
  { name: 'Tiburon Coupe', topSpeed: 1.18, accel: 1.2, hue: 3 },
  { name: 'Palma Taxi', topSpeed: 0.95, accel: 0.95, hue: 4 },
  { name: 'Duna Buggy', topSpeed: 0.92, accel: 1.15, hue: 5 },
];
