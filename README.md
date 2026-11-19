# solmar-heat

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/whale99999/solmar-heat/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/whale99999/solmar-heat/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Heat is an original open-world crime game for the browser: explore the sun-soaked coastal city of Port Solmar on foot and by car, steal and drive vehicles, run story missions for the Marina crew, build a wanted level and outrun the police, fight rival crews, and save your progress as you climb from errand runner to the city's most wanted.

## Run it

```sh
node serve.ts
```

then open http://localhost:8080 in desktop Chrome. To hand the entry in: `mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts`.

## Controls

| Keys | What they do |
| --- | --- |
| `W A S D` / arrows | Walk, or throttle and steering in a car |
| `Shift` | Sprint on foot |
| `E` | Enter / steal a car, get out, repair at the garage, heal at the clinic, start the street race |
| Mouse | Aim (pointer locks on click) |
| Click | Punch up close, shoot once Marina gives you the pistol |
| `Space` | Handbrake |
| `P` | Pause · `M` | Save the game |
| `Enter` | Start, respawn, keep roaming |

## The story

Five missions for Marina Sol's crew, then the city is yours:

1. **First Wheels** — steal a ride and deliver it to Marina's Garage. There is a pistol in the glovebox.
2. **Package Run** — three pickups across town; the last one is watched.
3. **Rival Colors** — the Coral Kings hold the marina lot. Take it back.
4. **Harbor Heist** — load a crate at the marina under four stars of heat, then lose the police at the Palms Hideout.
5. **King of Solmar** — six checkpoints against the clock, the whole city as the track.

After the campaign, free roam pays: hail any taxi for fares, and the **Solmar Sprint** street race by the garage keeps a best time.

## Systems

- **Wanted level** — every crime adds heat; five stars at 500. Heat only cools while no officer can see you, so alleys and distance are the way out. Stand still near a stopped officer and the bust meter fills.
- **Police pursuit** — cruisers spawn off-screen on the avenue ring, lead their target to intercept a speeding car, spread across the road, ram at close range, and shoot from a stopped car at three stars and up.
- **Traffic** — drivers follow the avenue grid in the correct lane, brake for whatever is ahead (including you), panic at gunfire, and honk when you hold them up.
- **Combat** — fists up close, hitscan pistol with tracers at range; rivals strafe, keep a fighting distance, and return fire.
- **Saving** — cash, respect, campaign stage, the pistol and the race best persist in `localStorage` after every mission.

## Built

Plain ES modules over a vendored three.js — no build step, no network requests, no asset files. The city is procedural and seeded, so it is identical on every visit: textures are painted on canvases at load, the crowd and traffic run on the same seeded stream, and every sound is synthesised with WebAudio. `game/src/` is one module per job: `world` the city, `vehicles` the cars and their physics, `traffic`, `pedestrians`, `police`, `missions`, `combat`, `hud`, `audio`, `input`, `player`, and `config` with every tuning number in one place.

---

<sub>Entered on [make.fun](https://make.fun/?ref=881py9z1&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
