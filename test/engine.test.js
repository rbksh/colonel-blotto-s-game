// Run: node test/engine.test.js
const assert = require('assert');
const B = require('../engine.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ok  ' + name); }
  catch (e) { console.error('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
}
const close = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg ?? ''} expected ${b}, got ${a}`);

const classic = B.makeRules();
const penalty = B.makeRules({ mode: 'penalty' });
const uniform = Array(10).fill(10);
const prop = B.roundToSum([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 100);

test('roundToSum hits the exact total', () => {
  assert.strictEqual(B.sum(prop), 100);
  assert.deepStrictEqual(prop, [2, 4, 5, 7, 9, 11, 13, 15, 16, 18]);
});

test('classic: uniform vs proportional', () => {
  // prop beats uniform on castles 6..10 (6+7+8+9+10 = 40), uniform wins 1..5 (15)
  const [a, b] = B.score(uniform, prop, classic);
  close(a, 15); close(b, 40);
});

test('classic: ties score nothing, split rule gives half', () => {
  const [a, b] = B.score(uniform, uniform, classic);
  close(a, 0); close(b, 0);
  const [c, d] = B.score(uniform, uniform, B.makeRules({ ties: 'split' }));
  close(c, 27.5); close(d, 27.5);
});

test('penalty: 0.2 per excess soldier on castles you win', () => {
  const A = [0, 0, 0, 0, 0, 0, 0, 0, 50, 50];
  const [a, b] = B.score(A, uniform, penalty);
  // A wins 9 and 10 each by 40: 9 - 8 + 10 - 8 = 3; uniform wins 1..8 by 10: Σv - 8*2 = 36 - 16 = 20
  close(a, 3); close(b, 20);
  const [c] = B.score(A, uniform, B.makeRules({ mode: 'penalty', penaltyBasis: 'minimum' }));
  close(c, 9 - 0.2 * 39 + 10 - 0.2 * 39);
});

test('streak rule awards remaining castles', () => {
  const A = [34, 33, 33, 0, 0, 0, 0, 0, 0, 0];
  const r = B.makeRules({ streak: true });
  const [a, b] = B.score(A, uniform, r);
  close(a, 55); close(b, 0);
  const p = B.play(A, uniform, r);
  assert.strictEqual(p.auto.by, 'A'); assert.strictEqual(p.auto.at, 2);
});

test('play() and score() agree on random matches under every rule combo', () => {
  const rng = B.mulberry32(7);
  for (const mode of ['classic', 'penalty']) for (const ties of ['none', 'split'])
    for (const streak of [false, true]) for (const penaltyBasis of ['margin', 'minimum']) {
      const r = B.makeRules({ mode, ties, streak, penaltyBasis });
      for (let k = 0; k < 300; k++) {
        const X = B.randomAlloc(10, 100, rng), Y = B.randomAlloc(10, 100, rng);
        const p = B.play(X, Y, r), [a, b] = B.score(X, Y, r);
        close(p.totalA, a); close(p.totalB, b);
      }
    }
});

test('random allocations are valid', () => {
  const rng = B.mulberry32(1);
  for (let k = 0; k < 1000; k++) {
    assert.ok(B.validate(B.randomComposition(10, 100, rng), classic).ok);
    assert.ok(B.validate(B.randomSparse(10, 100, rng), classic).ok);
  }
  for (const p of B.presets(classic)) assert.ok(B.validate(p.alloc, classic).ok, p.name);
});

test('best response DP matches brute force on a small game', () => {
  const rng = B.mulberry32(3);
  for (const mode of ['classic', 'penalty']) {
    const r = B.makeRules({ mode, n: 4, soldiers: 12, values: [1, 2, 3, 4], penalty: 0.3 });
    for (let k = 0; k < 40; k++) {
      const opps = [B.randomAlloc(4, 12, rng), B.randomAlloc(4, 12, rng), B.randomAlloc(4, 12, rng)];
      const br = B.bestResponseTo(opps, r);
      let best = -Infinity;
      for (let a = 0; a <= 12; a++) for (let b = 0; a + b <= 12; b++) for (let c = 0; a + b + c <= 12; c++) {
        const X = [a, b, c, 12 - a - b - c];
        const v = opps.reduce((s, o) => { const [p, q] = B.score(X, o, r); return s + p - q; }, 0) / 3;
        best = Math.max(best, v);
      }
      close(br.value, best, mode);
      const check = opps.reduce((s, o) => { const [p, q] = B.score(br.alloc, o, r); return s + p - q; }, 0) / 3;
      close(check, best, 'alloc achieves value');
      assert.strictEqual(B.sum(br.alloc), 12);
    }
  }
});

test('best response vs uniform (classic) wins by the maximum possible margin', () => {
  // Beating 10 on a castle costs 11; 100 soldiers buys 9 castles at 11 = 99.
  // Best: win castles 2..10 (54), lose castle 1 → differential 54 - 1 = 53.
  const br = B.bestResponseTo([uniform], classic);
  close(br.value, 53);
});

console.log(`\n${passed} tests passed${process.exitCode ? ', some FAILED' : ''}`);
