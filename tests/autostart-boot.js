'use strict';
/* Crown Climb™ autostart-boot regression test (node, $0, no browser). — T16.
 * Regression guard for repair cycle 1 (2026-09-23): the `?autostart=N` deep
 * link used to serve a FROZEN game because boot() returned before
 * requestAnimationFrame(tick) was ever scheduled. This test boots with
 * ?autostart=2&lives=5 (the recommended iPhone playtest link), pumps a real
 * rAF frame queue, and asserts the game loop runs: G.screen==="play" and
 * G.elapsed advances (physics steps + frames actually drawn).
 * Run: node tests/autostart-boot.js   (exit 1 on any failure)
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
// rAF frame queue: collect callbacks, then pump them manually with 16.7ms steps.
let rafQueue = [], rafScheduled = 0, now = 1000;
const store = {};
const sandbox = {
  console,
  document: documentStub,
  window: { addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); },
            matchMedia: () => ({ matches: false }) },
  location: { search: '?autostart=2&lives=5' }, // the deep link under test
  navigator: { maxTouchPoints: 2, userAgent: 'iPhone' },
  localStorage: {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; },
  },
  performance: { now: () => now },
  requestAnimationFrame: cb => { rafQueue.push(cb); rafScheduled++; return rafScheduled; },
  // node's vm.createContext does not expose URLSearchParams as a global; the
  // game uses it in boot() (inside try/catch), so inject it for headless tests.
  URLSearchParams,
  Image: function ImageStub() { this.complete = true; this.naturalWidth = 64; },
  addEventListener: (t, f) => (winListeners[t] = winListeners[t] || []).push(f),
  setTimeout: () => 0, clearTimeout: () => {},
};
sandbox.globalThis = sandbox;
const ctx = vm.createContext(sandbox);
vm.runInContext(js, ctx, { filename: 'game.js' });
(winListeners['DOMContentLoaded'] || []).forEach(f => f());

const R = c => vm.runInContext(c, ctx);
// Pump N rAF frames at 60Hz.
function pumpFrames(n) { for (let i = 0; i < n; i++) { const cb = rafQueue.shift(); if (!cb) break; now += 1000 / 60; cb(now); } }

const results = [];
function test(name, fn) {
  try { const ev = fn(); results.push({ name, pass: !!ev.pass, evidence: ev.evidence || '' }); }
  catch (e) { results.push({ name, pass: false, evidence: 'THREW: ' + e.message }); }
}

test('T16 autostart deep link boots a LIVE game loop', () => {
  const screen = R('G.screen');
  const level = R('G.level');
  const elapsedBefore = R('G.elapsed');
  const scheduledAtBoot = rafScheduled >= 1; // loop must be scheduled even via the early return
  pumpFrames(90); // ~1.5s of frames
  const elapsedAfter = R('G.elapsed');
  const pass = scheduledAtBoot && screen === 'play' && elapsedBefore === 0 && elapsedAfter > 1.0;
  return { pass,
    evidence: `rAF scheduled at boot=${scheduledAtBoot}, screen=${screen}, level=${level}, ` +
              `elapsed before=${elapsedBefore} after=${elapsedAfter.toFixed(3)}s (90 frames)` };
});

const fails = results.filter(r => !r.pass);
results.forEach(r => console.log((r.pass ? 'PASS' : 'FAIL') + ' ' + r.name + ' — ' + r.evidence));
console.log(`\n${results.length - fails.length}/${results.length} PASS`);
process.exit(fails.length ? 1 : 0);
