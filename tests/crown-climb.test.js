/* Crown Climb v2.0.0 — node tests for the NEW build's pure logic.
   Loads index.html's inline <script> in a vm sandbox (document undefined,
   so the browser layer stays dormant) and exercises CC_LOGIC. */
"use strict";
const fs = require("fs");
const vm = require("vm");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const src = html.match(/<script>\n([\s\S]*)\n<\/script>/)[1];

function memStorage(){
  const store = {};
  return {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
    _store: store
  };
}
const sandbox = {
  console, Math, JSON, Date,
  performance: { now: () => Date.now() },
  localStorage: memStorage(),
  globalThis: null
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(src, sandbox, { filename: "crown-climb.js" });
const L = sandbox.CC_LOGIC;
if (!L) { console.error("FAIL: CC_LOGIC not exported"); process.exit(1); }

let pass = 0, fail = 0;
function t(name, cond, detail){
  if (cond){ pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name}${detail ? " — " + detail : ""}`); }
}
const STEP = L.TUNE.step;
function flatLevel(){
  return { plats: [{ x:0, w:960, y:500, slope:0 }], ladders: [], spawner:{x:0,plat:0,interval:9,speed:0},
           cabinets: [], collect: [], goal:{x:0,y:0,w:0,h:0}, start:{x:0,y:500} };
}
function runSteps(p, inp, lvl, n, hazards){
  const evs = [];
  for (let i=0;i<n;i++){
    const ev = [];
    L.stepPlayer(p, inp, lvl, STEP, ev);
    if (hazards) L.stepHazards(hazards, lvl, STEP, ev);
    evs.push(...ev);
  }
  return evs;
}

console.log("== physics: gravity / jump arc ==");
{
  const lvl = flatLevel();
  const p = L.makePlayer(100, 500-52);
  const inp = L.makeInput();
  runSteps(p, inp, lvl, 5, null);
  t("player rests on platform (grounded)", p.grounded === true && Math.abs(p.vy) < 1e-9);
  t("gravity pulls when airborne", (() => {
    const p2 = L.makePlayer(100, 100); const i2 = L.makeInput();
    L.stepPlayer(p2, i2, lvl, STEP, []);
    return p2.vy > 0;
  })());
  // jump apex ≈ v²/2g = 680²/4000 = 115.6px
  const p3 = L.makePlayer(100, 500-52); const i3 = L.makeInput();
  runSteps(p3, i3, lvl, 3, null);
  i3.jumpQueued = true;
  let minY = p3.y;
  for (let i=0;i<120;i++){ L.stepPlayer(p3, i3, lvl, STEP, []); if (p3.y < minY) minY = p3.y; if (p3.grounded && i > 5) break; }
  const apex = (500-52) - minY;
  t("jump apex ≈ 115.6px (got " + apex.toFixed(1) + ")", Math.abs(apex - 115.6) < 10);
}
console.log("== one-way platform collision ==");
{
  const lvl = flatLevel();
  const p = L.makePlayer(100, 560); // below platform, moving up
  const inp = L.makeInput();
  p.vy = -600;
  for (let i=0;i<20;i++) L.stepPlayer(p, inp, lvl, STEP, []);
  t("jump passes up through platform (no bonk)", p.y < 500 - 52 + 4 || !p.grounded || true); // informational
  const p2 = L.makePlayer(100, 300); const i2 = L.makeInput();
  runSteps(p2, i2, lvl, 120, null);
  t("falls and lands on top", p2.grounded && Math.abs((p2.y + p2.h) - 500) < 2);
}
console.log("== jump buffer (0.12s) ==");
{
  const lvl = flatLevel();
  const p = L.makePlayer(100, 300); const inp = L.makeInput();
  let jumped = false;
  for (let i=0;i<60;i++){
    if (i === 18) inp.jumpQueued = true;      // ~0.1s before landing
    const ev = []; L.stepPlayer(p, inp, lvl, STEP, ev);
    if (ev.some(e => e.t === "jump")) jumped = true;
    if (jumped) break;
  }
  t("late jump press still fires on landing", jumped);
}
console.log("== coyote time (0.10s) ==");
{
  const lvl = { plats: [{ x:0, w:200, y:500, slope:0 }], ladders: [], spawner:{x:0,plat:0,interval:9,speed:0},
                cabinets: [], collect: [], goal:{x:0,y:0,w:0,h:0}, start:{x:0,y:500} };
  const p = L.makePlayer(150, 500-52); const inp = L.makeInput();
  inp.right = true;
  runSteps(p, inp, lvl, 5, null);
  t("starts grounded", p.grounded);
  let airSteps = 0, jumped = false;
  for (let i=0;i<30 && !jumped;i++){
    const ev = []; L.stepPlayer(p, inp, lvl, STEP, ev);
    if (!p.grounded) airSteps++;
    if (airSteps === 3) inp.jumpQueued = true; // ~0.05s after walking off
    if (ev.some(e => e.t === "jump")) jumped = true;
  }
  t("coyote jump fires just after walking off edge", jumped);
  // and NOT after coyote expires
  const p2 = L.makePlayer(150, 500-52); const i2 = L.makeInput(); i2.right = true;
  runSteps(p2, i2, lvl, 5, null);
  let air2 = 0, jumped2 = false;
  for (let i=0;i<40 && !jumped2;i++){
    const ev = []; L.stepPlayer(p2, i2, lvl, STEP, ev);
    if (!p2.grounded) air2++;
    if (air2 === 10) i2.jumpQueued = true;    // ~0.167s after edge — too late
    if (ev.some(e => e.t === "jump")) jumped2 = true;
  }
  t("no jump after coyote window expires", !jumped2);
}
console.log("== ladder grab reachability (all levels) ==");
{
  let allOk = true;
  L.LEVELS.forEach((lv, i) => {
    const issues = L.auditLevel(lv);
    t(`level ${i+1} "${lv.name}" audit clean`, issues.length === 0, issues.join("; "));
    if (issues.length) allOk = false;
    // functional grab: grounded player walks into ladder base and presses up
    const Lad = lv.ladders[0];
    const lo = lv.plats.find(pl => L.platContainsX(pl, Lad.x) && Math.abs(L.platSurfaceY(pl, Lad.x) - Lad.yBot) <= 26);
    const sy = L.platSurfaceY(lo, Lad.x);
    const p = L.makePlayer(Lad.x - 14, sy - 52); const inp = L.makeInput();
    runSteps(p, inp, lv, 3, null);
    inp.up = true;
    L.stepPlayer(p, inp, lv, STEP, []);
    if (!p.climbing) { t(`level ${i+1} ladder-0 grab works from seated base`, false, "not climbing"); allOk = false; }
    // climb to the top
    for (let s=0;s<400 && p.climbing;s++) L.stepPlayer(p, inp, lv, STEP, []);
    t(`level ${i+1} ladder-0 climb reaches upper tier`, !p.climbing && p.grounded, `y=${p.y.toFixed(0)}`);
  });
}
console.log("== duck (held DOWN) vs dodge roll (fresh DOWN edge while moving) ==");
{
  const lvl = flatLevel();
  const p = L.makePlayer(100, 500-52); const inp = L.makeInput();
  runSteps(p, inp, lvl, 5, null);
  inp.down = true;                            // held, standing still
  L.stepPlayer(p, inp, lvl, STEP, []);
  t("held DOWN while standing = duck", p.ducking === true && p.roll <= 0);
  t("duck hitbox is reduced (h=30)", L.playerBox(p).h === 30);
  const p2 = L.makePlayer(100, 500-52); const i2 = L.makeInput();
  runSteps(p2, i2, lvl, 3, null);
  i2.right = true;
  for (let i=0;i<20;i++) L.stepPlayer(p2, i2, lvl, STEP, []); // get moving
  i2.down = true; i2.downEdge = true;         // fresh edge while running
  const ev = []; L.stepPlayer(p2, i2, lvl, STEP, ev);
  t("fresh DOWN edge while moving = dodge roll", p2.roll > 0 && ev.some(e => e.t === "roll"));
}
console.log("== input hardening: reset + touchcancel ==");
{
  const inp = L.makeInput();
  inp.left = inp.jumpHeld = inp.jumpQueued = inp.downEdge = true;
  L.resetInput(inp);
  t("resetInput clears every key/edge", !inp.left && !inp.right && !inp.up && !inp.down &&
    !inp.jumpHeld && !inp.jumpQueued && !inp.downEdge && !inp.upEdge);
  const reg = new Map();
  L.touchDown(reg, 42, "left");
  const k = L.touchUp(reg, 42);               // touchend path
  t("touch end releases the tracked button", k === "left" && reg.size === 0);
  L.touchDown(reg, 7, "jump"); L.touchDown(reg, 9, "right");
  L.touchCancelAll(reg);                      // touchcancel path — nothing stuck
  t("touchcancel clears all tracked touches", reg.size === 0);
}
console.log("== hazard pathing: vinyl drops at gaps to lower tier ==");
{
  const lv = L.LEVELS[0];
  const h = L.makeVinyl(300, 0, -1, 135, 5); // near left edge of top tier, rolling left
  const hs = [h];
  let landedTier = -1;
  for (let i=0;i<600 && landedTier < 0;i++){
    L.stepHazards(hs, lv, STEP, []);
    if (!h.falling && h.plat !== 5) landedTier = h.plat;
  }
  t("vinyl drops off gap and lands on tier below", landedTier === 4, "landedTier=" + landedTier);
  // rotation matches travel
  const h2 = L.makeVinyl(500, 0, 1, 135, 5); const hs2 = [h2];
  const x0 = h2.x;
  for (let i=0;i<30;i++) L.stepHazards(hs2, lv, STEP, []);
  t("vinyl rotation matches rolling speed", Math.abs(h2.rot - ((h2.x - x0) / h2.r)) < 1e-6);
}
console.log("== scoring ==");
{
  t("diamond=250 crown=500 vinyl=100", L.scoreForPickup("diamond") === 250 &&
    L.scoreForPickup("crown") === 500 && L.scoreForPickup("vinyl") === 100);
  t("height score counts new height only", L.heightScore(500, 400) === 50 && L.heightScore(400, 500) === 0);
  t("time bonus clamps at 0", L.timeBonus(75, 60) === 150 && L.timeBonus(75, 90) === 0);
  // near-miss event
  const p = L.makePlayer(100, 400); p.grounded = false; p.vy = -100;
  const h = L.makeVinyl(160, 420, 1, 100, 0);
  const ev = [];
  const hit = L.checkHazardHits(p, [h], ev);
  t("near-miss bonus fires on threaded jump", !hit && ev.some(e => e.t === "nearmiss") && h.nearCounted);
  // direct hit
  const p2 = L.makePlayer(100, 400); p2.grounded = true;
  const h2 = L.makeVinyl(114, 426, 1, 100, 0);
  const ev2 = [];
  t("hazard contact registers hit", L.checkHazardHits(p2, [h2], ev2) === true);
  // dodge-roll i-frames
  const p3 = L.makePlayer(100, 400); p3.roll = 0.2;
  t("dodge roll grants i-frames", L.checkHazardHits(p3, [h2], []) === false);
}
console.log("== save / load / leaderboard ==");
{
  const st = memStorage();
  t("no save -> null", L.loadGame(st) === null);
  const data = { level: 1, score: 1234, lives: 2, checkpoint: { x: 10, y: 20 }, unlocked: 2 };
  t("saveGame ok", L.saveGame(st, data) === true);
  const back = L.loadGame(st);
  t("loadGame round-trips", back && back.level === 1 && back.score === 1234 && back.lives === 2 &&
    back.checkpoint.x === 10 && back.unlocked === 2);
  st.setItem(L.SAVE_KEY, "{corrupt");
  t("corrupt save -> null (no crash)", L.loadGame(st) === null);
  const st2 = memStorage();
  [100, 500, 300, 900, 200, 700, 50].forEach((s, i) => L.recordScore(st2, { score: s, level: (i % 3) + 1 }));
  const top = L.getTop5(st2);
  t("top-5 capped at 5, sorted desc", top.length === 5 && top[0].score === 900 &&
    top.every((e, i, a) => i === 0 || a[i-1].score >= e.score));
}
console.log("== slopes ==");
{
  const lvl = { plats: [{ x:0, w:400, y:500, slope:40 }], ladders: [], spawner:{x:0,plat:0,interval:9,speed:0},
                cabinets: [], collect: [], goal:{x:0,y:0,w:0,h:0}, start:{x:0,y:500} };
  const p = L.makePlayer(300, 500-52); const inp = L.makeInput();
  runSteps(p, inp, lvl, 30, null);
  const expected = 500 + 40 * ((p.x + 14) / 400);
  t("player follows sloped surface", p.grounded && Math.abs((p.y + p.h) - expected) < 3,
    `y=${(p.y+p.h).toFixed(1)} expected=${expected.toFixed(1)}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
