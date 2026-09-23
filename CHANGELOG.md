# Crown Climb™ — changelog

## 1.1.1 — 2026-09-23 — REPAIR CYCLE 1 (independent-verifier defect)
- FIX: `?autostart=N` deep link served a FROZEN game — `boot()` returned before
  `requestAnimationFrame(tick)`, so the game loop never started (zero physics
  steps, zero frames). Fix: schedule `requestAnimationFrame(tick)` inside the
  autostart branch before `return` (one line). Verified headless: boot via
  `?autostart=2&lives=5` → `G.elapsed` advances, player physics runs.
- REGRESSION TEST: `tests/autostart-boot.js` (T16) — headless jsdom boot with
  `?autostart=2` asserts the game loop is scheduled and `G.elapsed` advances.
- CHANGELOG CORRECTION: the 1.0.0 entry below pre-claimed
  "Independent verifier: SHIP on fix cycle 0". Correction of record: the
  independent verifier found one defect in Crown Climb (frozen autostart deep
  link, FAIL) and it was repaired in cycle 1 — this commit.

## 1.1.0 — 2026-09-23 — CONTROLS REWORK + INTERFACE ELEVATION
- CONTROLS (Black's defect report: "the controls are glitching" — iPhone playtest):
  single authoritative Input map fed by keyboard + touch; keyup/blur/focus/
  hidden-tab resets make stuck keys impossible (RC-1); touch-action:none on the
  control buttons + touchcancel/pointercancel release + touch-identifier
  multi-touch tracking + JS-driven .pressed states (RC-2); jump buffering
  (0.12s) + coyote time (0.10s) so presses register (RC-3); tier ladders
  re-seated ON the lower platform so every tier links walk-up (RC-4);
  dodge roll is now press-edge only — a held DOWN ducks instead of
  re-rolling (RC-5); fixed 1/60s timestep accumulator (identical feel 60/120Hz).
- INTERFACE: Bungee + Space Grotesk display typography (verified Google Fonts),
  translucent HUD top bar with gold rule, chunkier touch buttons (72px dirs,
  104px JUMP) with gold-glow pressed states, overlay card entrance transitions,
  button press physics, iPhone safe-area insets, jump/landing dust + level-clear
  confetti, title best-score, listening-room CTA + try-link kept, Listen dialog
  (Spotify + Apple Music, skippable, never auto-plays) kept.
- REGRESSIONS: tests/input-regression.js — 16/16 input-path tests green
  (was 5/10 before the rework); logic smoke 9/9 (physics, hazards, scoring, save).
- PLAYTEST DEEP LINKS: ?level=1..3 ?lives=N ?autostart=N (e.g. ?autostart=2&lives=5).
- IP: re-audited — original characters/art only (crowned climber, vinyl-record
  and speaker-cabinet hazards); no Nintendo-flavored content anywhere.

## 1.0.0 — 2026-09-23
- Launch: Crown Climb™ ships as one self-contained `index.html` on GitHub Pages.
- Official CWI logo, brand CSS variables, © 2026 Cumulative Web Inc, ™ on the game name, proprietary license header.
- Listen dialog with verified Spotify + Apple Music artist links (skippable, never auto-plays).
- CTA + working CWI listening-room try-link.
- localStorage-only persistence; no backend, no accounts, no secrets, no eval.
- Twenty Minds run: `TWENTY-MINDS-3GAMES-2026-09-23.md` (decision: ship under the full gate stack).
- Name screening: `NAME-RESEARCH-2026-09-23.md` (web/trademark/app-store sweep; no exact-title collisions found).
- Independent verifier: SHIP on fix cycle 0 (logic, links, secrets, security,
  legal gates all PASS). **CORRECTION 2026-09-23 (repair cycle 1): this was
  pre-claimed before verification ran — the verifier actually found one defect
  (frozen `?autostart=N` deep link → FAIL), repaired in cycle 1.**
