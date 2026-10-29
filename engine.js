/*
 * Colonel Blotto engine — pure game logic, no DOM.
 * Works in the browser (window.Blotto) and in Node (require('./engine.js')).
 *
 * Rules object:
 *   mode         'classic' | 'penalty'
 *   n            number of castles
 *   soldiers     soldiers per player (S)
 *   values       point value of each castle (default 1..n)
 *   penalty      points lost per excess soldier on a castle you win (penalty mode)
 *   penaltyBasis 'margin'  -> excess = mine - theirs
 *                'minimum' -> excess = mine - theirs - 1 (the one soldier you needed is free)
 *   ties         'none' (nobody scores) | 'split' (each gets half)
 *   streak       bool, if true: winning `streakLen` castles in a row (in castle order)
 *                awards you every remaining castle
 *   streakLen    default 3
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Blotto = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EPS = 1e-9;
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const sum = (arr) => arr.reduce((s, x) => s + x, 0);

  function makeRules(o = {}) {
    const n = o.n ?? 10;
    return {
      mode: o.mode ?? 'classic',
      n,
      soldiers: o.soldiers ?? 100,
      values: o.values ?? range(n).map((i) => i + 1),
      penalty: o.penalty ?? 0.2,
      penaltyBasis: o.penaltyBasis ?? 'margin',
      ties: o.ties ?? 'none',
      streak: o.streak ?? false,
      streakLen: o.streakLen ?? 3,
    };
  }

  function validate(alloc, rules) {
    const errors = [];
    if (alloc.length !== rules.n) errors.push(`needs ${rules.n} castles, has ${alloc.length}`);
    if (alloc.some((x) => !Number.isInteger(x) || x < 0)) errors.push('allocations must be whole numbers ≥ 0');
    const total = sum(alloc);
    if (total !== rules.soldiers) errors.push(`uses ${total} of ${rules.soldiers} soldiers`);
    return { ok: errors.length === 0, total, remaining: rules.soldiers - total, errors };
  }

  function excessOf(margin, rules) {
    return rules.penaltyBasis === 'minimum' ? Math.max(0, margin - 1) : margin;
  }

  /* One castle, fully explained. */
  function castle(a, b, v, rules) {
    const r = { a, b, v, winner: 'T', margin: Math.abs(a - b), excess: 0, penalty: 0, ptsA: 0, ptsB: 0 };
    if (a === b) {
      if (rules.ties === 'split') r.ptsA = r.ptsB = v / 2;
      return r;
    }
    r.winner = a > b ? 'A' : 'B';
    let pts = v;
    if (rules.mode === 'penalty') {
      r.excess = excessOf(r.margin, rules);
      r.penalty = rules.penalty * r.excess;
      pts = v - r.penalty;
    }
    if (r.winner === 'A') r.ptsA = pts;
    else r.ptsB = pts;
    return r;
  }

  /* Full match with every intermediate value recorded (used for step-by-step display). */
  function play(A, B, rules) {
    const steps = [];
    let tA = 0, tB = 0, sA = 0, sB = 0, auto = null;
    for (let i = 0; i < rules.n; i++) {
      const v = rules.values[i];
      let st;
      if (auto) {
        st = {
          a: A[i], b: B[i], v, winner: auto.by, auto: true, margin: 0, excess: 0, penalty: 0,
          ptsA: auto.by === 'A' ? v : 0, ptsB: auto.by === 'B' ? v : 0,
        };
      } else {
        st = castle(A[i], B[i], v, rules);
        if (st.winner === 'A') { sA++; sB = 0; }
        else if (st.winner === 'B') { sB++; sA = 0; }
        else { sA = 0; sB = 0; }
        if (rules.streak && i < rules.n - 1 && (sA >= rules.streakLen || sB >= rules.streakLen)) {
          auto = { by: sA >= rules.streakLen ? 'A' : 'B', at: i };
          st.triggers = auto.by;
        }
      }
      st.i = i;
      st.streakA = sA;
      st.streakB = sB;
      tA += st.ptsA;
      tB += st.ptsB;
      st.totalA = tA;
      st.totalB = tB;
      steps.push(st);
    }
    return { steps, totalA: tA, totalB: tB, result: resultOf(tA, tB), auto };
  }

  /* Fast scorer for tournaments — must agree with play(). Returns [pointsA, pointsB]. */
  function score(A, B, rules) {
    const n = rules.n, V = rules.values;
    const pen = rules.mode === 'penalty', lam = rules.penalty;
    const free = rules.penaltyBasis === 'minimum' ? 1 : 0;
    const split = rules.ties === 'split', streak = rules.streak, L = rules.streakLen;
    let tA = 0, tB = 0, sA = 0, sB = 0;
    for (let i = 0; i < n; i++) {
      const a = A[i], b = B[i], v = V[i];
      if (a > b) { tA += pen ? v - lam * Math.max(0, a - b - free) : v; sA++; sB = 0; }
      else if (b > a) { tB += pen ? v - lam * Math.max(0, b - a - free) : v; sB++; sA = 0; }
      else { if (split) { tA += v / 2; tB += v / 2; } sA = 0; sB = 0; }
      if (streak && i < n - 1) {
        if (sA >= L) { for (let j = i + 1; j < n; j++) tA += V[j]; break; }
        if (sB >= L) { for (let j = i + 1; j < n; j++) tB += V[j]; break; }
      }
    }
    return [tA, tB];
  }

  /* 1 = A wins the match, 0.5 = draw, 0 = B wins. */
  function resultOf(tA, tB) {
    if (tA > tB + EPS) return 1;
    if (tB > tA + EPS) return 0;
    return 0.5;
  }

  /* ---------- allocation helpers ---------- */

  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* Scale non-negative weights to integers summing exactly to S (largest-remainder rounding). */
  function roundToSum(weights, S) {
    let w = weights.map((x) => Math.max(0, x));
    let tot = sum(w);
    if (tot <= 0) { w = w.map(() => 1); tot = w.length; }
    const raw = w.map((x) => (x / tot) * S);
    const out = raw.map(Math.floor);
    let left = S - sum(out);
    const order = range(w.length).sort((i, j) => (raw[j] - out[j]) - (raw[i] - out[i]) || j - i);
    for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k]]++;
    return out;
  }

  /* Uniformly random composition of S into n non-negative parts (stars and bars). */
  function randomComposition(n, S, rng) {
    if (n === 1) return [S];
    const cuts = new Set();
    while (cuts.size < n - 1) cuts.add(Math.floor(rng() * (S + n - 1)));
    const c = [...cuts].sort((a, b) => a - b);
    const out = [];
    let prev = -1;
    for (const x of c) { out.push(x - prev - 1); prev = x; }
    out.push(S + n - 2 - prev);
    return out;
  }

  /* Random allocation concentrated on a random subset of castles. */
  function randomSparse(n, S, rng) {
    const k = 2 + Math.floor(rng() * (n - 1));
    const idx = range(n).sort(() => rng() - 0.5).slice(0, Math.min(k, n));
    const part = randomComposition(idx.length, S, rng);
    const out = new Array(n).fill(0);
    idx.forEach((ci, j) => (out[ci] = part[j]));
    return out;
  }

  function randomAlloc(n, S, rng) {
    return rng() < 0.5 ? randomComposition(n, S, rng) : randomSparse(n, S, rng);
  }

  /* Force integers ≥ 0 summing to S by adding/removing single soldiers at random. */
  function repair(alloc, S, rng) {
    const out = alloc.map((x) => Math.max(0, Math.round(x)));
    let total = sum(out);
    while (total > S) {
      const i = Math.floor(rng() * out.length);
      if (out[i] > 0) { out[i]--; total--; }
    }
    while (total < S) { out[Math.floor(rng() * out.length)]++; total++; }
    return out;
  }

  function isDefaultValues(rules) {
    return rules.values.every((v, i) => v === i + 1);
  }

  function presets(rules) {
    const { n, soldiers: S, values: V } = rules;
    const out = [];
    const add = (name, desc, w) => out.push({ name, desc, alloc: roundToSum(w, S) });
    const sorted = [...V].sort((a, b) => a - b);
    const median = sorted[Math.floor((n - 1) / 2)];
    const maxV = Math.max(...V);

    add('Uniform', 'Same number of soldiers on every castle', V.map(() => 1));
    add('Proportional', 'Soldiers ∝ castle value', V);
    add('Value²', 'Soldiers ∝ value² — piles onto the big castles', V.map((v) => v * v));
    add('Skip low', 'Proportional, but gives up every castle at or below the median value', V.map((v) => (v > median ? v : 0)));

    const byValue = range(n).sort((a, b) => V[b] - V[a]);
    const half = sum(V) / 2;
    const pick = new Set();
    let acc = 0;
    for (const i of byValue) { if (acc > half) break; pick.add(i); acc += V[i]; }
    add('Top majority', 'Only the fewest top castles that together are worth a majority', V.map((v, i) => (pick.has(i) ? v : 0)));

    const mid = (n - 1) / 2, sd = Math.max(1, n / 4);
    add('Middle heavy', 'Bell curve centred on the middle castles', range(n).map((i) => Math.exp(-((i - mid) ** 2) / (2 * sd * sd))));
    add('Bottom heavy', 'Many cheap wins: soldiers ∝ (max value + 1 − value)', V.map((v) => maxV + 1 - v));

    if (n === 10 && S === 100 && isDefaultValues(rules)) {
      out.push({
        name: 'Riddler R1 winner',
        desc: 'Reported winning entry from FiveThirtyEight’s 2017 castle puzzle (classic rules)',
        alloc: [3, 5, 8, 10, 13, 1, 26, 30, 2, 2],
      });
    }
    return out;
  }

  /* ---------- best response (dynamic programming) ----------
   * Objective: maximise expected point differential (my points − opponent points),
   * summed castle by castle. The per-castle payoff only depends on (x, b, v), so the
   * total is additive and an exact knapsack DP over (castle, soldiers used) solves it.
   * The streak rule breaks additivity, so the DP ignores it (results are approximate
   * when the streak rule is on; actual scores are always evaluated with full rules).
   */

  function castleDiff(x, b, v, rules) {
    if (x === b) return 0; // tie: 0 for both, or v/2 each — differential is 0 either way
    const m = Math.abs(x - b);
    const pts = rules.mode === 'penalty' ? v - rules.penalty * excessOf(m, rules) : v;
    return x > b ? pts : -pts;
  }

  function newTable(rules) {
    return range(rules.n).map(() => new Float64Array(rules.soldiers + 1));
  }

  /* F[i][x] += w · diff(x soldiers vs opponent's opp[i] on castle i) */
  function addToTable(F, opp, w, rules) {
    const S = rules.soldiers;
    for (let i = 0; i < rules.n; i++) {
      const b = opp[i], v = rules.values[i], row = F[i];
      for (let x = 0; x <= S; x++) row[x] += w * castleDiff(x, b, v, rules);
    }
  }

  /* Exact maximiser of Σ_i scale·F[i][x_i] subject to Σ x_i = S. */
  function bestResponse(F, scale, rules) {
    const n = rules.n, S = rules.soldiers, W = S + 1;
    const dp = new Float64Array((n + 1) * W).fill(-Infinity);
    const choice = new Int32Array(n * W);
    dp[0] = 0;
    for (let i = 0; i < n; i++) {
      const row = F[i];
      for (let s = 0; s <= S; s++) {
        const base = dp[i * W + s];
        if (base === -Infinity) continue;
        for (let x = 0; x + s <= S; x++) {
          const val = base + row[x];
          const k = (i + 1) * W + s + x;
          if (val > dp[k] + EPS) { dp[k] = val; choice[i * W + s + x] = x; }
        }
      }
    }
    const alloc = new Array(n);
    let s = S;
    for (let i = n - 1; i >= 0; i--) { alloc[i] = choice[i * W + s]; s -= alloc[i]; }
    return { alloc, value: dp[n * W + S] * scale, gains: alloc.map((x, i) => F[i][x] * scale) };
  }

  function bestResponseTo(opponents, rules) {
    const F = newTable(rules);
    for (const o of opponents) addToTable(F, o, 1, rules);
    return { ...bestResponse(F, 1 / opponents.length, rules), table: F, scale: 1 / opponents.length };
  }

  return {
    EPS, range, sum, makeRules, validate, castle, play, score, resultOf,
    mulberry32, roundToSum, randomComposition, randomSparse, randomAlloc, repair, presets,
    castleDiff, newTable, addToTable, bestResponse, bestResponseTo, excessOf,
  };
});
