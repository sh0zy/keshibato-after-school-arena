# 消しバト！ Implementation Plan

> **For agentic workers:** Execute assigned modules in parallel, with integration and verification by the root agent. User has authorized implementation directly.

**Goal:** Create the Japanese browser game described in the supplied full specification, including editable Blender assets, real 3D physics, equipment, modes, audio, saves and reproducible validation.

**Architecture:** React controls screens while an imperative Three.js scene renders the game. A renderer-independent Rapier world owns all collision, mass, impulses, effects and turn resolution. Shared typed data powers both visual assembly and compound colliders; bounded snapshots support save and replay.

**Tech Stack:** React, Vite, TypeScript, Three.js, Rapier, Blender Python, Python wave synthesis, Web Audio, localStorage, Vitest, Playwright.

---

### 1. Project and data contracts
- [x] Inspect the empty workspace and installed Blender, Node, Python and browsers.
- [x] Read source specification; retain all no-time-limit rules.
- [x] Establish `src/game/types.ts` shared interfaces. Coordinates: Y up, +Z front, standard size 1.3 × 0.6 × 3. Blender models authored at metres and uniformly scaled ×50 once on load.
- [ ] Install dependencies with `npm.cmd install` and retain lockfile.

### 2. Asset creation
Files: `scripts/generate_assets.py`, `assets/source/stationery.blend`, `public/models/*.glb`, `public/icons/*.png`, `public/textures/*`.
- [ ] Generate 6 bevelled eraser bodies with sockets, 20 recognisable equipment items with mount origin, desk and stage props in Blender 5.1.
- [ ] Export valid glTF materials and bake shared texture marks. Reopen blend, inspect GLB bounds and render asset previews.
- [ ] Generate 8 original loop tracks, 3 jingles and event sound files with `scripts/generate_audio.py`; check peak amplitude and boundaries.

### 3. Physics and rules
Files: `src/game/physics.ts`, `src/game/equipment.ts`, `src/game/ai.ts`, `src/game/physics.test.ts`.
- [ ] Build one compound rigid body per eraser, mass from colliders only; identical equipment transforms for mesh and colliders.
- [ ] Apply bounded impulses at the selected hit point; CCD and fixed 1/120 steps; stop world while aiming.
- [ ] Resolve all falling bodies after each shot before winner selection. Lower platforms remain valid; falling beyond stage fallY eliminates a body.
- [ ] Implement surface effects, jump energy split, metal-filtered reciprocal magnet, once-per-shot strike, glide/brush/curve and optional simulated prediction.
- [ ] Validate no third equipment, duplicate equipment, mass and center shift, supported overhang, simultaneous falls, pause, save/restore, strong AI simulation and deterministic shots.

### 4. Game and customization screens
Files: `src/App.tsx`, `src/style.css`, `src/components/*`, `src/game/scene.ts`, `src/game/input.ts`.
- [ ] Build mint/paper workshop: large live 3D assembly, body swatches, searchable equipment, explicit 2-slot replacement, socket and orientation controls, combo descriptions, real physics stats.
- [ ] Build CPU/local/practice battles with pointer, touch cancellation, multi-touch separation, keyboard aim, camera mode, pause/restart/save and clear player/result UI.
- [ ] Add 10 stages with geometry matching colliders and generous visible open edges.
- [ ] Add challenge, tour, tournament, 2v2, collection, JSON assembly sharing, replay and photo export.
- [ ] Add validated stage editor, local save/import/export and instant test.

### 5. Integration and verification
Files: `README.md`, `docs/verification.md`, `docs/licenses.md`, `tests/browser.mjs`.
- [ ] Run `npm.cmd test` for meaningful core-rule and validation tests.
- [ ] Run `npm.cmd run build` for strict TypeScript and production bundling.
- [ ] Use installed browser automation to inspect desktop and mobile, drag a real shot, observe CPU turn, equip two parts and replacement, save and resume, settings and results.
- [ ] Capture workshop and battle screenshots; record actual measured results and any limitations. Confirm all referenced assets exist.
- [ ] Supply working launch scripts, Japanese instructions, editable sources and exact regeneration commands.
