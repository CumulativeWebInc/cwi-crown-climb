'use strict';
/* Crown Climb™ input regression suite (node, $0, no browser).
 * Loads ../index.html, extracts the game JS (logo data-URI stubbed for speed),
 * and dispatches synthetic keyboard/touch/focus events against a stubbed DOM.
 * Covers every fixed control path: stuck-key recovery, touchcancel,
 * multi-touch, jump buffer, coyote time, ladder linkage, duck/dodge,
 * rapid reversal, key repeat, slide-off lift, pressed visuals, visibility.
 * Run: node tests/input-regression.js   (exit 1 on any failure)
 */
const fs = require('fs'), vm = require('vm'), path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
let js = html.match(/<script>([\s\S]*)<\/script>/)[1];
js = js.replace(/logo: "data:image\/jpeg;base64,[A-Za-z0-9+/=\n]*?",/, 'logo: "stub",');

const winListeners = {}, els = {};
function makeEl(id) {
  const ls = {}, cls = new Set();
  return { id, _ls: ls,
    addEventListener(t, f) { (ls[t] = ls[t] || []).push(f); },
    removeEventListener() {},
    classList: { add(c) { cls.add(c); }, remove(c) { cls.delete(c); },
      contains(c) { return cls.has(c); }, toggle(c) { cls.has(c) ? cls.delete(c) : cls.add(c); } },
    style: {}, dataset: {}, textContent: '', innerHTML: '',
    appendChild() {}, querySelectorAll() { return []; },
    _fire(t, e) { (ls[t] || []).forEach(f => f(Object.assign({ preventDefault() {}, target: this }, e))); } };
}
function el(id) { return els[id] || (els[id] = makeEl(id)); }
['game','touch','menu','howto','panel','listen','pauseov','tLeft','tRight','tUp','tDown','tJump',
 'btnNew','btnContinue','btnHow','btnHowBack','btnPause','btnResume','btnRestart','btnQuit',
 'btnListen','btnSound','listenClose','lvlBtns','panelKicker','panelTitle','panelBody','panelBtns'
].forEach(el);
const canvasProxy = new Proxy({}, {
  get(t, k) { return (...a) => (k === 'measureText' ? { width: 10 } : canvasProxy); },
  set() { return true; },
});
els['game'].getContext = () => canvasProxy;
const docListeners = {};
const documentStub = {
  getElementById: id => el(id),
  createElement: tag => makeEl(tag),
  querySelectorAll: sel => Object.values(els).filter(e => e.classList.contains('pressed')),
  hidden: false,
  addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
  documentElement: {},
};
const windowStub = {
  addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); },
  matchMedia: () => ({ matches: false }),
};
function ImageStub() { this.complete = true; this.naturalWidth = 64; }
Object.defineProperty(ImageStub.prototype, 'src', { set() {}, get() { return ''; } });
const store = {};
const sandbox = {
  console,
  document: documentStub,
  window: windowStub,
  navigator: { maxTouchPoints: 2, userAgent: 'iPhone' },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  performance: { now: () => Date.now() },
  requestAnimationFrame: () => 0,
  Image: ImageStub,
  addEventListener: (t, f) => windowStub.addEventListener(t, f),
  setTimeout: () => 0, clearTimeout: () => {},
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(js, ctx, { filename: 'game.js' });
(winListeners['DOMContentLoaded'] || []).forEach(f => f());

function fireWin(t, e) { (winListeners[t] || []).forEach(f => f(Object.assign({ preventDefault() {} }, e))); }
function key(code, type, repeat = false) { fireWin(type, { code, repeat, preventDefault() {} }); }
function touch(id, type, tids) {
  el(id)._fire(type, { changedTouches: tids.map(i => ({ identifier: i })), preventDefault() {} });
}
const I = () => vm.runInContext('Input', ctx);
const R = c => vm.runInContext(c, ctx);
const results = [];
function test(name, fn) {
  try { R('resetInput()'); } catch (e) { const x = I(); x.left = x.right = x.up = x.down = false; }
  try { const ev = fn(); results.push({ name, pass: !!ev.pass, evidence: ev.evidence || '' }); }
  catch (e) { results.push({ name, pass: false, evidence: 'THREW: ' + e.message }); }
}

test('T1 stuck-key on window blur', () => {
  key('ArrowLeft', 'keydown'); const held = I().left === true;
  fireWin('blur', {});
  return { pass: held && I().left === false, evidence: `after keydown left=${held}, after blur left=${I().left}` };
});
test('T1b stuck-key on window focus', () => {
  key('ArrowRight', 'keydown'); const held = I().right === true;
  fireWin('focus', {}); key('ArrowRight', 'keyup');
  return { pass: held && I().right === false, evidence: `after keydown right=${held}, after focus right=${I().right}` };
});
test('T2 touchcancel releases button', () => {
  touch('tLeft', 'touchstart', [1]); const held = I().left === true;
  touch('tLeft', 'touchcancel', [1]);
  return { pass: held && I().left === false, evidence: `after touchstart left=${held}, after touchcancel left=${I().left}` };
});
test('T3 multi-touch run+jump', () => {
  touch('tRight', 'touchstart', [11]); touch('tJump', 'touchstart', [22]);
  const both = I().right === true && I().jumpQueued === true;
  touch('tJump', 'touchend', [22]);
  const rightHeld = I().right === true;
  touch('tRight', 'touchend', [11]);
  return { pass: both && rightHeld && I().right === false, evidence: `right+jump simultaneously=${both}, right survives jump lift=${rightHeld}` };
});
test('T4 jump buffering (press slightly before landing)', () => {
  R('startLevel(G,0,false)');
  R('G.p.y -= 8; G.p.vy = 0; G.p.onGround = false;'); // ~0.10s fall, inside the 0.12s buffer
  R('Input.jumpQueued = true');
  let jumped = false;
  for (let i = 0; i < 40; i++) {
    R('physicsStep(G,1/60,Input)');
    if (R('G.p.vy < -100 && !G.p.onGround')) { jumped = true; break; }
  }
  return { pass: jumped, evidence: `jump fired after landing within buffer window: ${jumped}` };
});
test('T5 coyote time (jump just after leaving edge)', () => {
  R('startLevel(G,0,false)');
  R('G.p.x = 830; G.p.vx = 120;'); // run off tier-0 right edge (span 0..820)
  R('physicsStep(G,1/60,Input)'); R('physicsStep(G,1/60,Input)'); // airborne ~0.03s
  const airborne = R('!G.p.onGround');
  R('Input.jumpQueued = true');
  R('physicsStep(G,1/60,Input)');
  return { pass: airborne && R('G.p.vy < -100'), evidence: `airborne=${airborne}, jump after leaving edge=${R('G.p.vy < -100')}` };
});
test('T6 ladder linkage (grabbable while grounded)', () => {
  const fails = [];
  for (let li = 0; li < 3; li++) {
    const lv = R(`buildLevel(${li})`);
    lv.ladders.forEach((L, k) => {
      if (L.final) return;
      const lower = lv.plats[k];
      const lo = Math.max(lower.x, L.x - 15), hi = Math.min(lower.x + lower.w, L.x + 15);
      if (!(lo <= hi)) fails.push(`L${li + 1} ladder${k}: x=${L.x} vs span [${lower.x},${lower.x + lower.w}]`);
    });
  }
  return { pass: fails.length === 0, evidence: fails.length ? fails.join(' | ') : 'all ladders reachable from lower platform while grounded' };
});
test('T7 sustained duck-hold while running must not spam dodge', () => {
  R('startLevel(G,0,false)'); R('G.p.vx = 220;');
  let dodges = 0, was = false;
  for (let i = 0; i < 90; i++) {
    R('Input.down = true'); R('physicsStep(G,1/60,Input)');
    const d = R('G.p.dodge > 0');
    if (d && !was) dodges++;
    was = d;
  }
  return { pass: dodges === 0, evidence: `dodge activations during 1.5s duck-hold: ${dodges} (expect 0)` };
});
test('T8 rapid direction reversal', () => {
  R('startLevel(G,0,false)');
  key('ArrowLeft', 'keydown'); key('ArrowRight', 'keydown'); key('ArrowLeft', 'keyup');
  R('physicsStep(G,1/60,Input)');
  const vx = R('G.p.vx');
  key('ArrowRight', 'keyup');
  return { pass: vx > 0, evidence: `left+right then release left -> vx=${vx.toFixed(1)} (expect >0)` };
});
test('T9 key repeat does not retrigger jump', () => {
  key('Space', 'keydown', true);
  return { pass: I().jumpQueued === false, evidence: `repeat keydown set jumpQueued=${I().jumpQueued}` };
});
test('T10 slide-off then lift releases', () => {
  touch('tRight', 'touchstart', [5]);
  touch('tRight', 'touchend', [5]); // iOS delivers touchend to the origin element
  return { pass: I().right === false, evidence: `right after slide-off lift=${I().right}` };
});
test('T11 pressed visual state tracks touch', () => {
  touch('tJump', 'touchstart', [3]);
  const on = el('tJump').classList.contains('pressed');
  touch('tJump', 'touchend', [3]);
  return { pass: on && !el('tJump').classList.contains('pressed'), evidence: `pressed on touchstart=${on}, cleared on touchend` };
});
test('T12 two fingers same button: lift one keeps held', () => {
  touch('tLeft', 'touchstart', [21]); touch('tLeft', 'touchstart', [22]);
  touch('tLeft', 'touchend', [21]);
  const held = I().left === true;
  touch('tLeft', 'touchend', [22]);
  return { pass: held && I().left === false, evidence: `left held after first lift=${held}, released after second` };
});
test('T13 visibilitychange hidden resets input', () => {
  key('ArrowLeft', 'keydown');
  documentStub.hidden = true;
  (docListeners['visibilitychange'] || []).forEach(f => f());
  documentStub.hidden = false; key('ArrowLeft', 'keyup');
  return { pass: I().left === false, evidence: `left after tab-hidden=${I().left}` };
});
test('T14 dodge fires once on fresh down-press, duck holds steady', () => {
  R('startLevel(G,0,false)'); R('G.p.vx = 220;');
  key('ArrowDown', 'keydown');
  R('physicsStep(G,1/60,Input)');
  const dodged = R('G.p.dodge > 0');
  let redodge = false, was = dodged;
  for (let i = 0; i < 90; i++) {
    R('physicsStep(G,1/60,Input)');
    const d = R('G.p.dodge > 0');
    if (d && !was) redodge = true; was = d;
  }
  key('ArrowDown', 'keyup');
  R('startLevel(G,0,false)');
  key('ArrowDown', 'keydown');
  for (let i = 0; i < 30; i++) R('physicsStep(G,1/60,Input)');
  const duckNoDodge = R('G.p.duck === true && G.p.dodge === 0');
  key('ArrowDown', 'keyup');
  return { pass: dodged && !redodge && duckNoDodge,
    evidence: `press-while-moving dodged=${dodged}, re-dodge on hold=${redodge}, press-while-still ducks cleanly=${duckNoDodge}` };
});
test('T15 release means instant stop (no runaway)', () => {
  R('startLevel(G,0,false)');
  key('ArrowRight', 'keydown');
  R('physicsStep(G,1/60,Input)');
  const v1 = R('G.p.vx');
  key('ArrowRight', 'keyup');
  for (let i = 0; i < 30; i++) R('physicsStep(G,1/60,Input)');
  const v2 = Math.abs(R('G.p.vx'));
  return { pass: v1 > 200 && v2 < 5, evidence: `vx while held=${v1.toFixed(0)}, 0.5s after release=${v2.toFixed(1)}` };
});

let fails = 0;
for (const r of results) {
  console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name} — ${r.evidence}`);
  if (!r.pass) fails++;
}
console.log(`\n${results.length - fails}/${results.length} input regression tests passing`);
process.exit(fails ? 1 : 0);
