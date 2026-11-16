# Meridian Yard — a three.js tactical FPS

Entry for the make.fun bounty **threejs-fps-02** ($1,000, deadline Tue 17 Nov 2026
05:30 WITA). Built locally; **not submitted yet**.

## The game

A round-based tactical shooter in the style Counter-Strike made famous — original
map, art, sounds and names, nothing copied. A dusk container yard, 36 × 28 m,
with three lanes (west, mid, east) and two objective sites, A and B.

- **Two teams of three:** you + 2 bot teammates attack; 3 defender bots hold the
  sites. First team to 3 round wins takes the match.
- **Objective:** plant the cell at Site A or B (hold E, 3 s), then defend it
  until detonation (25 s). Defenders run to defuse (4 s). Or win by elimination.
  Time out and the defenders hold the yard.
- **Economy:** $800 to start, $300 per kill, $300 for planting, $325 for a round
  win, $200 for a loss. Buy phase (15 s, press B): VK-7 rifle $700, Hornet SMG
  $500, frag grenade $300. P9 sidearm is free.
- **Gunplay:** hitscan with headshots (×2.5), torso and leg damage, recoil and
  spread that grows while moving — stopping to aim pays. Weapons reload and run
  out of ammunition; grenades bounce and explode (110 damage in 6 m).
- **Bots:** patrol lane routes, hold sites, engage on line of sight, strafe in
  duels, investigate gunfire they hear, and converge to defuse a planted cell.
- **Movement:** acceleration, friction, crouch, jump, axis-separated AABB
  collision with the map (shared by player and bots).
- **Sound:** fully procedural WebAudio (shots, hits, reloads, explosions, plant
  beeps, round stingers) — no audio files, no network requests.

## Controls

| Key | Action |
| --- | --- |
| W A S D / mouse | Move / look (click to lock the pointer) |
| Click | Fire (semi-auto pistol, full-auto rifle/SMG) |
| R | Reload |
| 1 / 2 / 3 | Rifle / SMG / sidearm |
| G | Throw frag grenade |
| E (hold) | Plant the cell at a site |
| B | Buy menu (buy phase) |
| Ctrl / C | Crouch, Space jump |

## Files

- `game/` — the playable game, static ES modules, no build step. `game/index.html`
  opens in desktop Chrome and plays single-player against bots, offline.
  - `game/src/` — 16 modules, one job each: `main.js` (boot + fixed 60 Hz loop),
    `state.js` (the one match state), `world.js` (map, sites, routes, line of
    sight), `physics.js` (shared body movement), `player.js`, `bots.js` (AI),
    `weapons.js`, `combat.js` (raycast shooting, grenades), `effects.js` (pooled
    tracers/sparks/explosions), `rounds.js` (buy/live/plant/defuse/match),
    `hud.js`, `input.js`, `audio.js`, `palette.js`, `rng.js` (seeded RNG).
  - `game/vendor/three/` — three.js 0.187.0 byte for byte, as the kit ships it.
- `main.ts` — Node 22, stdlib only: copies `game/` + `screenshots/` to `/output`
  and writes `dossier.json` with the kit's `vendor/makefun-threejs.ts`.
- `serve.ts` — tiny static server for local play: `node serve.ts`, then
  http://localhost:8080.
- `screenshots/` — 4 real renders, 1280×720: `1-start.png` (menu),
  `2-buy.png` (buy menu), `3-play.png` (mid-fight, two defenders down),
  `4-end.png` (round won, cell detonated). Taken with
  `?shot=start|buy|play|end&seed=1` in headless Chrome; `shots.json` lists them.
- `vendor/makefun-threejs.ts` — the kit's copy, unchanged.
- `kit/` + `kit.tar.gz` — working material, not part of the entry.

## Verification (16 Nov 2026, local)

- All 16 game modules parse as ES modules; three.js hashes match the kit
  (`three.core.min.js 613e370f…`, `three.module.min.js ef510bae…`); all 28 kit
  files match `kit.json` hashes. (The kit download's transport header sha256
  differs from the downloaded file's, as with the aggregator kit; the kit's own
  file list verifies clean, so the kit is genuine — re-check before submitting.)
- `main.ts` run twice produces byte-identical output: `dossier.json` 498,516
  bytes (< 1.5 MiB), dossier text 88,042 chars (< 160 KiB cap), 16 source files.
  `game/` is 19 files, ~2.1 MiB (< 48 MiB). Screenshots are 66–96 KiB each
  (< 256 KiB), 1280×720. No external references in `game/` (no network loads).
- Live play-test in headless Chrome via CDP, zero console errors:
  menu → buy phase → rifle bought ($800 → $100) → live round → bots patrol,
  engage, shoot and take damage → player killed → round ends → next round;
  plant at Site A → planted, +$300, detonation countdown runs → defender
  defuses (progress 0 → 4) → round lost → next round; grenade thrown → fuse →
  blast damages the player (100 → 21 hp). One real bug found and fixed in
  testing: planting froze at progress 0 because `rounds.js` only handled the
  `carried` state, not `planting`.

## Still needed from BOS before any submission

1. **GitHub account** — a public repo on BOS's own account (username
   `ical-iann`, created 16 Nov 2026), created after the bounty opened
   (2026-11-14T21:30Z), OSI licensed, with this entry's files at the root.
   Add `.makefun/owner.json` with `{"wallet": "34Tvf2NTCS2V9dq2oeKztL4vb15bgbQ3tEPwAxFo9bJJ"}`
   unless the repo owner is the GitHub account signed in to make.fun.
2. **Transcripts** of the AI coding-agent sessions that built the entry,
   bundled with the kit's `node cli/makefun.mjs bundle` and checked with
   `node cli/makefun.mjs check`.
3. **BOS's explicit confirmation to submit**, and the entry signature from the
   linked Solana wallet (escrow bounty: every entry is signed).
