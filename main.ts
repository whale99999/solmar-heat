// The hand-in program for the gta6-01 entry (Node 22, standard library only).
//
// What is being handed in is the game/ folder beside this file: Solmar Heat, a
// 3D open-world crime game for a desktop browser — a sunset coastal city you
// can walk and drive, with traffic, pedestrians, a five-star wanted system
// with pursuing police, fist and gun combat, a five-mission story, taxi fares
// and a street race. It loads fully offline: three.js is vendored under
// game/vendor/, every texture is painted procedurally at load, and the sound
// is synthesised. There is no build step and no network request.
//
// This program's own job is only the hand-in. It copies game/ and the four
// staged screenshots in screenshots/ (the first by name is the cover) into
// the output directory and writes dossier.json there with the vendored
// make.fun library, which is also what rebuilds and checks the same bytes at
// the gate — so the caps below are the scorer's own, not a local invention:
// at most 4 screenshots of 256 KiB, at most 993 files and 48 MiB under game/,
// no game path over 1000 bytes, dossier text capped at 163,840 bytes.
//
// Play it first if you like: `node serve.ts`, then http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
