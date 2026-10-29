/* Colonel Blotto Lab — UI, live simulations and charts. Game maths lives in engine.js. */
(() => {
  'use strict';
  const B = window.Blotto;
  const { range, sum } = B;
  const $ = (id) => document.getElementById(id);
  const num = (x) => { const r = Math.round(x * 100) / 100; return Number.isInteger(r) ? String(r) : r.toFixed(2); };
  const pct = (x) => (x * 100).toFixed(1) + '%';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const arr = (a) => '[' + a.join(', ') + ']';
  const clampInt = (v, lo, hi, d) => { const x = parseInt(v, 10); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const hasChart = typeof window.Chart !== 'undefined';

  let rules = B.makeRules();
  let mode = 'classic';
  let presetList = [];

  /* =========================================================
   * Theme, colours, chart helpers
   * ========================================================= */
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    return {
      surface: g('--surface-1'), surface2: g('--surface-2'), text: g('--text-primary'), text2: g('--text-secondary'),
      muted: g('--text-muted'), grid: g('--grid'), axis: g('--axis'),
      s1: g('--series-1'), s2: g('--series-2'), s1w: g('--series-1-wash'), s2w: g('--series-2-wash'),
      ramp: g('--ramp').split(',').map((s) => s.trim()),
    };
  }
  let C = readColors();

  $('themeBtn').onclick = () => {
    const root = document.documentElement;
    const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    root.dataset.theme = dark ? 'light' : 'dark';
    onTheme();
  };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme);
  function onTheme() { C = readColors(); buildAllCharts(); renderAll(); }

  const charts = {};
  function chart(key, canvasId, config) {
    if (charts[key]) charts[key].destroy();
    charts[key] = null;
    const el = $(canvasId);
    if (!el) return null;
    if (!hasChart) {
      el.parentElement.innerHTML = '<div class="nochart">Chart.js could not load (are you offline?). All calculations and tables still work.</div>';
      return null;
    }
    charts[key] = new Chart(el, config);
    return charts[key];
  }

  function opts({ x = '', y = '', horizontal = false, yMin, yMax, tooltip = {}, xTicks = {} } = {}) {
    const valueAxis = {
      grid: { color: C.grid }, border: { display: false }, ticks: { color: C.muted }, beginAtZero: true,
      title: { display: !!(horizontal ? x : y), text: horizontal ? x : y, color: C.muted },
    };
    if (yMin !== undefined) valueAxis.min = yMin;
    if (yMax !== undefined) valueAxis.max = yMax;
    const catAxis = {
      grid: { display: false }, border: { color: C.axis }, ticks: { color: C.muted, autoSkip: true, maxRotation: 0, ...xTicks },
      title: { display: !!(horizontal ? y : x), text: horizontal ? y : x, color: C.muted },
    };
    return {
      responsive: true, maintainAspectRatio: false, animation: { duration: 200 },
      indexAxis: horizontal ? 'y' : 'x',
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: C.surface, titleColor: C.text, bodyColor: C.text2, borderColor: C.axis, borderWidth: 1,
          padding: 8, cornerRadius: 6, usePointStyle: true, ...tooltip,
        },
      },
      scales: horizontal ? { x: valueAxis, y: catAxis } : { x: catAxis, y: valueAxis },
    };
  }
  const barDs = (label, color) => ({
    label, data: [], backgroundColor: color, borderRadius: 4, borderSkipped: 'start',
    categoryPercentage: 0.78, barPercentage: 0.92,
  });
  const lineDs = (label, color, extra = {}) => ({
    label, data: [], borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0,
    pointHoverRadius: 5, tension: 0, spanGaps: false, ...extra,
  });
  function setData(key, labels, ...series) {
    const ch = charts[key];
    if (!ch) return;
    ch.data.labels = labels;
    series.forEach((d, i) => (ch.data.datasets[i].data = d));
    ch.update('none');
  }

  /* ---------- heatmaps (plain canvas, with hover) ---------- */
  const hexRgb = (h) => { const x = parseInt(h.replace('#', ''), 16); return [(x >> 16) & 255, (x >> 8) & 255, x & 255]; };
  function rampColor(t) {
    const stops = C.ramp.map(hexRgb);
    t = Math.min(1, Math.max(0, t)) * (stops.length - 1);
    const k = Math.min(stops.length - 2, Math.floor(t)), f = t - k;
    const c = stops[k].map((v, j) => Math.round(v + (stops[k + 1][j] - v) * f));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }
  function drawHeat(canvas, cfg) {
    const dpr = window.devicePixelRatio || 1, W = canvas.clientWidth, Hh = canvas.clientHeight;
    if (!W) return;
    canvas.width = W * dpr; canvas.height = Hh * dpr;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, Hh);
    ctx.font = '11px system-ui, sans-serif';
    const L = 36, Bm = 20, T = 2, R = 2, { rows, cols } = cfg;
    if (!cols) {
      ctx.fillStyle = C.muted; ctx.textAlign = 'left';
      ctx.fillText(cfg.empty || 'Run the simulation to fill this in.', L, Hh / 2);
      canvas._heat = null;
      return;
    }
    const cw = (W - L - R) / cols, ch = (Hh - T - Bm) / rows, gap = cw >= 5 && ch >= 5 ? 1 : 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const v = cfg.value(r, c);
      ctx.fillStyle = v <= 0 ? C.surface2 : rampColor(v / (cfg.max || 1));
      ctx.fillRect(L + c * cw, T + r * ch, Math.max(1, cw - gap), Math.max(1, ch - gap));
    }
    ctx.fillStyle = C.muted;
    ctx.textAlign = 'right';
    const rStep = Math.ceil(12 / ch);
    for (let r = 0; r < rows; r += rStep) ctx.fillText(cfg.rowLabel(r), L - 6, T + r * ch + ch / 2 + 4);
    ctx.textAlign = 'center';
    const cStep = Math.max(1, Math.ceil(cols / Math.max(2, Math.floor((W - L) / 60))));
    for (let c = 0; c < cols; c += cStep) ctx.fillText(cfg.colLabel(c), L + c * cw + cw / 2, Hh - 5);
    canvas._heat = { L, T, cw, ch, rows, cols, cfg };
  }
  function heatHover(canvas, tip) {
    canvas.addEventListener('mousemove', (e) => {
      const h = canvas._heat;
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      const c = h ? Math.floor((x - h.L) / h.cw) : -1, r = h ? Math.floor((y - h.T) / h.ch) : -1;
      if (!h || c < 0 || r < 0 || c >= h.cols || r >= h.rows) { tip.style.display = 'none'; return; }
      tip.innerHTML = h.cfg.tip(r, c);
      tip.style.display = 'block';
      tip.style.left = Math.max(0, Math.min(x + 12, rect.width - tip.offsetWidth - 4)) + 'px';
      tip.style.top = (y + 14) + 'px';
    });
    canvas.addEventListener('mouseleave', () => (tip.style.display = 'none'));
  }
  heatHover($('hmEvo'), $('hmEvoTip'));
  heatHover($('hmFP'), $('hmFPTip'));

  /* =========================================================
   * Rules bar
   * ========================================================= */
  function readRules() {
    return B.makeRules({
      mode,
      n: clampInt($('rN').value, 2, 20, 10),
      soldiers: clampInt($('rS').value, 5, 300, 100),
      penalty: Math.max(0, parseFloat($('rL').value) || 0),
      penaltyBasis: $('rBasis').value,
      ties: $('rTies').value,
      streak: $('rStreak').checked,
      streakLen: clampInt($('rStreakLen').value, 2, 9, 3),
    });
  }
  function ruleText() {
    const total = sum(rules.values);
    let t = `${rules.n} castles worth 1–${rules.n} points (${total} in total). Each player has ${rules.soldiers} soldiers. ` +
      `More soldiers on a castle wins it. A tie scores ${rules.ties === 'split' ? 'half the points for each player' : 'nothing for either player'}.`;
    if (rules.mode === 'penalty') {
      t += ` <b>Penalty:</b> on every castle you win, you lose ${rules.penalty} points per extra soldier ` +
        (rules.penaltyBasis === 'minimum' ? '(your soldiers − theirs − 1).' : '(your soldiers − theirs).');
    }
    if (rules.streak) t += ` <b>Streak:</b> win ${rules.streakLen} castles in a row (in order 1, 2, 3…) and you take every remaining castle.`;
    $('ruleText').innerHTML = t + ' Higher total wins the match.';
  }
  function onRules() {
    const prev = rules;
    rules = readRules();
    document.body.classList.toggle('penalty', rules.mode === 'penalty');
    const structural = prev.n !== rules.n || prev.soldiers !== rules.soldiers;
    buildPresetSelects();
    if (structural) { defaultAllocs(); renderAllocTable(); buildAllCharts(); H.shown = 0; }
    ruleText();
    h2hChanged();
    tStop(); eReset(); fReset(); tSetup();
    tRender(true); eRender(); fRender();
  }
  $('modeSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    mode = b.dataset.mode;
    [...$('modeSeg').children].forEach((x) => x.classList.toggle('on', x === b));
    onRules();
  });
  ['rN', 'rS', 'rL', 'rBasis', 'rTies', 'rStreak', 'rStreakLen'].forEach((id) => $(id).addEventListener('change', onRules));

  /* Tabs */
  document.querySelector('.tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (b) showTab(b.dataset.tab);
  });
  function showTab(name) {
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x.dataset.tab === name));
    document.querySelectorAll('.tab-panel').forEach((x) => x.classList.toggle('on', x.id === 'tab-' + name));
    if (name === 'evo') eHeat();
    if (name === 'fp') fHeat();
    window.scrollTo({ top: document.querySelector('.tabs').offsetTop - 8, behavior: 'smooth' });
  }

  function buildPresetSelects() {
    presetList = B.presets(rules);
    const opt = presetList.map((p, k) => `<option value="${k}" title="${esc(p.desc)}">${esc(p.name)}</option>`).join('');
    $('presetA').innerHTML = '<option value="">Preset…</option>' + opt;
    $('presetB').innerHTML = '<option value="">Preset…</option>' + opt;
    $('fStart').innerHTML = opt + '<option value="random">Random</option>';
  }

  /* =========================================================
   * 1 · Head to head
   * ========================================================= */
  const H = { A: [], B: [], match: null, shown: 0, timer: null };

  function defaultAllocs() {
    const prop = presetList.findIndex((p) => p.name === 'Proportional');
    const uni = presetList.findIndex((p) => p.name === 'Uniform');
    H.A = presetList[prop].alloc.slice();
    H.B = presetList[uni].alloc.slice();
    $('presetA').value = String(prop);
    $('presetB').value = String(uni);
  }

  function renderAllocTable() {
    let h = '<thead><tr><th>Castle</th><th>Worth</th><th>A</th><th>B</th></tr></thead><tbody>';
    for (let i = 0; i < rules.n; i++) {
      h += `<tr><td>${i + 1}</td><td>${rules.values[i]}</td>` +
        ['A', 'B'].map((p) => `<td><input type="number" min="0" max="${rules.soldiers}" data-p="${p}" data-i="${i}" value="${H[p][i]}" aria-label="${p} soldiers on castle ${i + 1}"></td>`).join('') +
        '</tr>';
    }
    h += `</tbody><tfoot><tr><td>Total</td><td>${sum(rules.values)}</td><td id="sumA"></td><td id="sumB"></td></tr></tfoot>`;
    $('allocTable').innerHTML = h;
  }
  function syncInputs(p) {
    $('allocTable').querySelectorAll(`input[data-p="${p}"]`).forEach((el) => (el.value = H[p][+el.dataset.i]));
  }
  $('allocTable').addEventListener('input', (e) => {
    const el = e.target;
    if (!el.dataset.p) return;
    H[el.dataset.p][+el.dataset.i] = Math.max(0, parseInt(el.value, 10) || 0);
    $('preset' + el.dataset.p).value = '';
    $('brCard').classList.add('hidden');
    h2hChanged();
  });
  function setAlloc(p, alloc) {
    H[p] = alloc.slice();
    syncInputs(p);
    h2hChanged();
  }
  ['A', 'B'].forEach((p) => {
    $('preset' + p).addEventListener('change', (e) => {
      if (e.target.value === '') return;
      $('brCard').classList.add('hidden');
      setAlloc(p, presetList[+e.target.value].alloc);
    });
  });
  const h2hRng = B.mulberry32(Date.now() & 0xffff);
  document.querySelectorAll('[data-rand]').forEach((b) => (b.onclick = () => {
    const p = b.dataset.rand;
    $('preset' + p).value = '';
    $('brCard').classList.add('hidden');
    setAlloc(p, B.randomAlloc(rules.n, rules.soldiers, h2hRng));
  }));
  document.querySelectorAll('[data-br]').forEach((b) => (b.onclick = () => bestReply(b.dataset.br)));

  function updateSums() {
    for (const p of ['A', 'B']) {
      const v = B.validate(H[p], rules), el = $('sum' + p);
      if (!el) continue;
      el.className = v.ok ? 'ok' : 'bad';
      el.textContent = v.ok ? `${v.total} ✓` : `${v.total} (${v.remaining > 0 ? v.remaining + ' left' : -v.remaining + ' over'})`;
    }
  }

  function h2hChanged() {
    H.match = B.play(H.A, H.B, rules);
    H.shown = Math.min(H.shown, rules.n);
    updateSums();
    renderStep();
  }

  function stepFormula(st) {
    if (st.auto) return `awarded to ${st.winner} (${rules.streakLen}-in-a-row rule)`;
    if (st.winner === 'T') return `${st.a} = ${st.b} → tie, ` + (rules.ties === 'split' ? `each gets ${st.v}/2 = ${num(st.v / 2)}` : 'nobody scores');
    const [w, l] = st.winner === 'A' ? [st.a, st.b] : [st.b, st.a];
    if (rules.mode !== 'penalty') return `${w} > ${l} → ${st.winner} takes ${st.v}`;
    const ex = rules.penaltyBasis === 'minimum' ? `${w}−${l}−1 = ${st.excess}` : `${w}−${l} = ${st.excess}`;
    return `${w} > ${l}; extra = ${ex}; ${st.v} − ${rules.penalty}×${st.excess} = ${num(st.v - st.penalty)}`;
  }

  function stepNarration(st) {
    const c = `<b>Castle ${st.i + 1}</b> (worth ${st.v})`;
    let t;
    if (st.auto) {
      t = `${c}: already decided. ${st.winner} won ${rules.streakLen} castles in a row, so it collects these ${st.v} points without a fight.`;
    } else if (st.winner === 'T') {
      t = `${c}: A sends ${st.a}, B sends ${st.b}. Equal forces, so it’s a tie: ` +
        (rules.ties === 'split' ? `each side gets ${st.v} ÷ 2 = ${num(st.v / 2)} points.` : 'nobody scores.');
    } else {
      const W = st.winner, L = W === 'A' ? 'B' : 'A';
      const w = W === 'A' ? st.a : st.b, l = W === 'A' ? st.b : st.a;
      t = `${c}: A sends ${st.a}, B sends ${st.b}. ${w} > ${l}, so <b>${W} wins the castle</b>.`;
      if (rules.mode === 'penalty') {
        const exWhy = rules.penaltyBasis === 'minimum'
          ? `${W} needed only ${l + 1} to win, so ${w} − ${l} − 1 = ${st.excess} soldiers are extra`
          : `${W} has ${w} − ${l} = ${st.excess} more soldiers than ${L}`;
        t += ` ${exWhy}. Penalty = ${rules.penalty} × ${st.excess} = ${num(st.penalty)}, so ${W} scores ${st.v} − ${num(st.penalty)} = <b>${num(st.v - st.penalty)}</b>.`;
        if (st.v - st.penalty < 0) t += ' (Net negative: this win actually cost points!)';
      } else {
        t += ` ${W} scores <b>${st.v}</b>.`;
      }
    }
    if (st.triggers) t += ` <br>⚡ ${st.triggers} has now won ${rules.streakLen} in a row, so every remaining castle goes to ${st.triggers}.`;
    return t + `<br>Running score: <b>A ${num(st.totalA)}</b> – <b>B ${num(st.totalB)}</b>.`;
  }

  function renderStep() {
    const m = H.match, n = rules.n, shown = H.shown;
    const streakCol = rules.streak;
    let h = '<thead><tr><th>Castle</th><th>Worth</th><th>A</th><th>B</th><th>Result</th><th style="text-align:left">Calculation</th><th>A pts</th><th>B pts</th><th>Score A – B</th>' +
      (streakCol ? '<th>Streak A/B</th>' : '') + '</tr></thead><tbody>';
    for (let i = 0; i < n; i++) {
      const st = m.steps[i];
      if (i >= shown) {
        h += `<tr class="pending"><td>${i + 1}</td><td>${st.v}</td><td>${st.a}</td><td>${st.b}</td><td>—</td><td class="formula-cell">…</td><td>—</td><td>—</td><td>—</td>${streakCol ? '<td>—</td>' : ''}</tr>`;
        continue;
      }
      const cls = (st.winner === 'A' ? 'wA' : st.winner === 'B' ? 'wB' : '') + (i === shown - 1 ? ' current' : '');
      const res = st.auto ? `${st.winner} <span class="tag">streak</span>` : st.winner === 'T' ? 'Tie' : `${st.winner} wins`;
      h += `<tr class="${cls}"><td>${i + 1}</td><td>${st.v}</td><td>${st.a}</td><td>${st.b}</td><td class="win">${res}</td>` +
        `<td class="formula-cell">${esc(stepFormula(st))}</td><td>${num(st.ptsA)}</td><td>${num(st.ptsB)}</td>` +
        `<td>${num(st.totalA)} – ${num(st.totalB)}</td>` +
        (streakCol ? `<td>${st.auto ? '—' : st.streakA + ' / ' + st.streakB}${st.triggers ? ' ⚡' : ''}</td>` : '') + '</tr>';
    }
    $('calcTable').innerHTML = h + '</tbody>';

    const va = B.validate(H.A, rules), vb = B.validate(H.B, rules);
    const warn = [va.ok ? '' : `⚠ A ${va.errors.join(', ')}.`, vb.ok ? '' : `⚠ B ${vb.errors.join(', ')}.`].filter(Boolean).join(' ');
    const warnHtml = warn ? `<span class="bad">${esc(warn)}</span><br>` : '';
    $('narration').innerHTML = warnHtml + (shown === 0
      ? 'Press <b>Next castle</b> or <b>▶ Play</b> to fight the castles one at a time, in order.'
      : stepNarration(m.steps[shown - 1]));

    $('summary').innerHTML = shown === n ? summaryHtml(m) : '';
    renderH2HCharts();
  }

  function summaryHtml(m) {
    const terms = (p) => {
      const t = m.steps.map((s) => s['pts' + p]).filter((x) => x !== 0).map(num);
      return t.length ? t.join(' + ') + ' = ' + num(m['total' + p]) : '0';
    };
    const won = (p) => m.steps.filter((s) => s.winner === p).length;
    const ties = m.steps.filter((s) => s.winner === 'T').length;
    const wasted = (p) => sum(m.steps.filter((s) => s.winner !== p && s.winner !== 'T' && !s.auto).map((s) => (p === 'A' ? s.a : s.b)));
    const penalty = (p) => sum(m.steps.filter((s) => s.winner === p).map((s) => s.penalty));
    const diff = Math.abs(m.totalA - m.totalB);
    const verdict = m.result === 1 ? `<span style="color:var(--series-1)">A wins</span> by ${num(diff)}`
      : m.result === 0 ? `<span style="color:var(--series-2)">B wins</span> by ${num(diff)}` : 'Draw';
    let h = `<div class="eq">A total = ${terms('A')}\nB total = ${terms('B')}</div>` +
      `<span class="big">${verdict}</span><br>` +
      `Castles won: A ${won('A')}, B ${won('B')}, ties ${ties}. ` +
      `Soldiers spent on castles they lost: A ${wasted('A')}, B ${wasted('B')}.`;
    if (rules.mode === 'penalty') h += ` Penalty paid: A ${num(penalty('A'))}, B ${num(penalty('B'))}.`;
    if (m.auto) h += ` The streak rule fired after castle ${m.auto.at + 1}.`;
    return h;
  }

  function buildH2HCharts() {
    const labels = range(rules.n).map((i) => `C${i + 1}`);
    chart('alloc', 'chAlloc', {
      type: 'bar',
      data: { labels, datasets: [barDs('A', C.s1), barDs('B', C.s2)] },
      options: opts({
        x: 'castle', y: 'soldiers',
        tooltip: { callbacks: { title: (it) => `Castle ${it[0].dataIndex + 1} (worth ${rules.values[it[0].dataIndex]})` } },
      }),
    });
    chart('run', 'chRun', {
      type: 'line',
      data: { labels: ['start', ...labels], datasets: [lineDs('A', C.s1, { pointRadius: 3 }), lineDs('B', C.s2, { pointRadius: 3 })] },
      options: opts({ y: 'points' }),
    });
  }
  function renderH2HCharts() {
    const ch = charts.alloc, shown = H.shown, n = rules.n;
    if (ch) {
      ch.data.datasets[0].data = H.A.slice();
      ch.data.datasets[1].data = H.B.slice();
      const lit = (i) => shown === 0 || i < shown;
      ch.data.datasets[0].backgroundColor = range(n).map((i) => (lit(i) ? C.s1 : C.s1w));
      ch.data.datasets[1].backgroundColor = range(n).map((i) => (lit(i) ? C.s2 : C.s2w));
      ch.update();
    }
    const steps = H.match.steps.slice(0, shown);
    setData('run', ['start', ...range(n).map((i) => `C${i + 1}`)], [0, ...steps.map((s) => s.totalA)], [0, ...steps.map((s) => s.totalB)]);
  }

  /* Step controls */
  function hStop() { clearInterval(H.timer); H.timer = null; $('hPlay').textContent = '▶ Play'; }
  $('hReset').onclick = () => { hStop(); H.shown = 0; renderStep(); };
  $('hStep').onclick = () => { hStop(); if (H.shown < rules.n) H.shown++; renderStep(); };
  $('hAll').onclick = () => { hStop(); H.shown = rules.n; renderStep(); };
  $('hPlay').onclick = () => {
    if (H.timer) { hStop(); return; }
    if (H.shown >= rules.n) H.shown = 0;
    $('hPlay').textContent = '⏸ Pause';
    const tick = () => {
      H.shown++;
      renderStep();
      if (H.shown >= rules.n) hStop();
    };
    tick();
    if (H.timer === null && H.shown < rules.n) H.timer = setInterval(tick, +$('hSpeed').value);
  };

  /* Best reply with explanation */
  function bestReply(p) {
    const q = p === 'A' ? 'B' : 'A';
    const opp = H[q];
    const br = B.bestResponseTo([opp], rules);
    $('preset' + p).value = '';
    setAlloc(p, br.alloc);
    const F = br.table;
    const S = rules.soldiers;
    let rows = '';
    for (let i = 0; i < rules.n; i++) {
      const b = opp[i], x = br.alloc[i], v = rules.values[i];
      const outcome = x > b ? 'win' : x === b ? 'tie' : 'lose';
      const opt = [`0 → ${num(F[i][0])}`, b > 0 ? `${b} → 0` : null, b + 1 <= S ? `${b + 1} → ${num(F[i][b + 1])}` : null].filter(Boolean).join(' &nbsp;|&nbsp; ');
      const perSoldier = b + 1 <= S ? num((F[i][b + 1] - F[i][0]) / (b + 1)) : '—';
      rows += `<tr><td>${i + 1}</td><td>${v}</td><td>${b}</td><td class="formula-cell">${opt}</td><td>${perSoldier}</td><td><b>${x}</b></td><td>${outcome}</td><td>${num(F[i][x])}</td></tr>`;
    }
    const check = B.play(H.A, H.B, rules);
    const myTotal = p === 'A' ? check.totalA : check.totalB, theirTotal = p === 'A' ? check.totalB : check.totalA;
    $('brExplain').innerHTML =
      `<p>We want the allocation x₁…x<sub>${rules.n}</sub> for <b>${p}</b> (using exactly ${S} soldiers) that maximises ` +
      `Σ fᵢ(xᵢ), where fᵢ(x) = ${p}’s points − ${q}’s points on castle i when ${p} sends x and ${q} sends bᵢ.</p>` +
      `<p>On each castle only three choices really matter: <b>0</b> (give it up), <b>bᵢ</b> (tie) or <b>bᵢ+1</b> (win by the smallest margin). ` +
      `Sending more than bᵢ+1 wastes soldiers${rules.mode === 'penalty' ? ' and costs penalty points' : ''}. ` +
      `Sending between 1 and bᵢ−1 still loses${rules.mode === 'penalty' ? ' and only shrinks the opponent’s penalty' : ''}. ` +
      `Leftover soldiers have to go somewhere, and the DP parks them where they cost least. ` +
      `“Gain per soldier” = (f(bᵢ+1) − f(0)) ÷ (bᵢ+1): how much each soldier earns when it turns a loss into a win.</p>` +
      `<div class="scroll"><table class="calc"><thead><tr><th>Castle</th><th>Worth</th><th>${q} sends bᵢ</th><th style="text-align:left">Key options: soldiers → fᵢ</th><th>Gain / soldier</th><th>Chosen xᵢ</th><th>Outcome</th><th>fᵢ(xᵢ)</th></tr></thead><tbody>${rows}</tbody></table></div>` +
      `<div class="eq">Dynamic programme: D[0][0] = 0;  D[i+1][s+x] = max over x of ( D[i][s] + fᵢ(x) );  answer = D[${rules.n}][${S}]\n` +
      `Table size: ${rules.n} castles × ${S + 1} soldier totals, each trying up to ${S + 1} values of x.\n` +
      `Best total differential = ${br.gains.map(num).join(' + ')} = ${num(br.value)}</div>` +
      `<p>Check by actually playing the match: ${p} ${num(myTotal)} – ${q} ${num(theirTotal)} (difference ${num(myTotal - theirTotal)}).` +
      (rules.streak ? ' <span class="bad">The streak rule is on. The DP ignores it, so this reply is near-optimal rather than exact.</span>' : '') + '</p>';
    $('brCard').classList.remove('hidden');
    H.shown = rules.n;
    renderStep();
  }

  /* =========================================================
   * 2 · Tournament
   * ========================================================= */
  const T = { list: [], i: 0, j: 1, done: 0, total: 0, running: false, raf: 0, last: null, frame: 0 };

  function tSetup() {
    const rng = B.mulberry32(clampInt($('tSeed').value, 0, 1e9, 42));
    const list = [];
    const n = rules.n, S = rules.soldiers;
    if ($('tPresets').checked) presetList.forEach((p) => list.push({ name: p.name, alloc: p.alloc.slice() }));
    if ($('tAB').checked) {
      if (B.validate(H.A, rules).ok) list.push({ name: 'Your A', alloc: H.A.slice() });
      if (B.validate(H.B, rules).ok) list.push({ name: 'Your B', alloc: H.B.slice() });
    }
    if ($('tChamp').checked) {
      if (E.champ) list.push({ name: `Evolved champion (gen ${E.gen})`, alloc: E.champ.slice() });
      if (Fp.last) {
        list.push({ name: 'Equilibrium: latest best reply', alloc: Fp.last.br.alloc.slice() });
        for (let k = 0; k < 3; k++) list.push({ name: `Equilibrium mix sample ${k + 1}`, alloc: Fp.mix[Math.floor(rng() * Fp.mix.length)].slice() });
      }
    }
    const K = clampInt($('tK').value, 0, 400, 60);
    for (let k = 0; k < K; k++) list.push({ name: `Random ${k + 1}`, alloc: B.randomAlloc(n, S, rng) });
    list.forEach((e) => Object.assign(e, { mp: 0, w: 0, d: 0, l: 0, pf: 0, pa: 0, played: 0 }));
    Object.assign(T, { list, i: 0, j: 1, done: 0, total: (list.length * (list.length - 1)) / 2, last: null, frame: 0 });
  }
  function tMatch() {
    const N = T.list.length;
    if (T.i >= N - 1) return false;
    const a = T.list[T.i], b = T.list[T.j];
    const [pa, pb] = B.score(a.alloc, b.alloc, rules);
    const r = B.resultOf(pa, pb);
    a.mp += r; b.mp += 1 - r; a.played++; b.played++;
    a.pf += pa; a.pa += pb; b.pf += pb; b.pa += pa;
    if (r === 1) { a.w++; b.l++; } else if (r === 0) { a.l++; b.w++; } else { a.d++; b.d++; }
    T.last = [T.i, T.j];
    T.done++;
    if (++T.j >= N) { T.i++; T.j = T.i + 1; }
    return true;
  }
  function tLoop() {
    const k = +$('tSpeed').value;
    for (let c = 0; c < k; c++) if (!tMatch()) { T.running = false; break; }
    T.frame++;
    tRender(!T.running || T.frame % 20 === 0);
    if (T.running) T.raf = requestAnimationFrame(tLoop);
    else $('tRun').textContent = '▶ Run again';
  }
  function tStop() { T.running = false; cancelAnimationFrame(T.raf); $('tRun').textContent = '▶ Run'; }
  $('tRun').onclick = () => {
    if (T.running) { tStop(); $('tRun').textContent = '▶ Resume'; return; }
    if (T.done >= T.total || T.done === 0) tSetup();
    T.running = true;
    $('tRun').textContent = '⏸ Pause';
    tLoop();
  };
  $('tReset').onclick = () => { tStop(); tSetup(); tRender(true); };
  ['tK', 'tPresets', 'tAB', 'tChamp', 'tSeed'].forEach((id) => $(id).addEventListener('change', () => { tStop(); tSetup(); tRender(true); }));

  const winPct = (e) => (e.played ? e.mp / e.played : 0);
  function tRanked() {
    return T.list.map((e, k) => ({ e, k })).sort((x, y) => winPct(y.e) - winPct(x.e) || (y.e.pf - y.e.pa) - (x.e.pf - x.e.pa));
  }
  function kpi(k, v) { return `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

  function tRender(full) {
    $('tProg').style.width = T.total ? (100 * T.done) / T.total + '%' : '0';
    const ranked = tRanked();
    const leader = T.done ? ranked[0].e : null;
    $('tKpis').innerHTML = kpi('Entrants', T.list.length) + kpi('Matches', `${T.done.toLocaleString()} / ${T.total.toLocaleString()}`) +
      kpi('Leader', leader ? esc(leader.name) : '—') + kpi('Leader win %', leader ? pct(winPct(leader)) : '—');

    if (T.last) {
      const [ia, ib] = T.last, a = T.list[ia], b = T.list[ib];
      const m = B.play(a.alloc, b.alloc, rules);
      let rows = m.steps.map((s) => `<tr><td>C${s.i + 1}</td><td>${s.v}</td><td>${s.a}</td><td>${s.b}</td><td>${s.auto ? s.winner + '⚡' : s.winner === 'T' ? 'tie' : s.winner}</td><td>${num(s.ptsA)}</td><td>${num(s.ptsB)}</td></tr>`).join('');
      const verdict = m.result === 1 ? `${esc(a.name)} wins` : m.result === 0 ? `${esc(b.name)} wins` : 'Draw';
      $('tLive').innerHTML = `<div class="vs"><span class="dot" style="background:var(--series-1)"></span> A = ${esc(a.name)} &nbsp;vs&nbsp; <span class="dot" style="background:var(--series-2)"></span> B = ${esc(b.name)}</div>` +
        `<div class="scroll"><table><thead><tr><th>Castle</th><th>Worth</th><th>A</th><th>B</th><th>Winner</th><th>A pts</th><th>B pts</th></tr></thead><tbody>${rows}</tbody>` +
        `<tfoot><tr><td colspan="5">Total → ${verdict}</td><td>${num(m.totalA)}</td><td>${num(m.totalB)}</td></tr></tfoot></table></div>` +
        `<p class="hint">Standings update: A ${a.w}-${a.d}-${a.l} (${pct(winPct(a))}), B ${b.w}-${b.d}-${b.l} (${pct(winPct(b))}) &nbsp; [W-D-L]</p>`;
    } else {
      $('tLive').innerHTML = '<p class="hint">Press ▶ Run. Each match shows here as it is scored.</p>';
    }

    const top = ranked.slice(0, 15);
    setData('leader', top.map((x) => x.e.name), top.map((x) => +(winPct(x.e) * 100).toFixed(2)));
    if (charts.leader) charts.leader._top = top;

    if (full) {
      let h = '<thead><tr><th>#</th><th>Entrant</th><th style="text-align:left">Allocation</th><th>Played</th><th>W</th><th>D</th><th>L</th><th>Win %</th><th>Avg pts for</th><th>Avg pts against</th><th></th></tr></thead><tbody>';
      ranked.forEach(({ e, k }, r) => {
        h += `<tr><td>${r + 1}</td><td>${esc(e.name)}</td><td class="alloc">${arr(e.alloc)}</td><td>${e.played}</td><td>${e.w}</td><td>${e.d}</td><td>${e.l}</td>` +
          `<td>${pct(winPct(e))}</td><td>${e.played ? num(e.pf / e.played) : '—'}</td><td>${e.played ? num(e.pa / e.played) : '—'}</td>` +
          `<td><button class="btn small" data-to="A" data-k="${k}" type="button">→ A</button> <button class="btn small" data-to="B" data-k="${k}" type="button">→ B</button></td></tr>`;
      });
      $('tTable').innerHTML = h + '</tbody>';
    }
  }
  $('tTable').addEventListener('click', (e) => {
    const b = e.target.closest('[data-to]');
    if (!b) return;
    const p = b.dataset.to;
    $('preset' + p).value = '';
    setAlloc(p, T.list[+b.dataset.k].alloc);
    showTab('h2h');
  });
  function buildTourCharts() {
    chart('leader', 'chLeader', {
      type: 'bar',
      data: { labels: [], datasets: [{ ...barDs('Win %', C.s1), categoryPercentage: 0.85, barPercentage: 0.9 }] },
      options: opts({
        horizontal: true, x: 'win %', xTicks: {},
        tooltip: {
          callbacks: {
            label: (it) => {
              const x = charts.leader._top?.[it.dataIndex];
              return x ? ` ${pct(winPct(x.e))}   W-D-L ${x.e.w}-${x.e.d}-${x.e.l}   ${arr(x.e.alloc)}` : '';
            },
          },
        },
        yMax: 100,
      }),
    });
  }

  /* =========================================================
   * 3 · Evolution (genetic algorithm)
   * ========================================================= */
  const E = { pop: [], gen: 0, rng: null, bench: [], hist: [], heat: [], champ: null, info: null, running: false, timer: 0 };
  const HEAT_GENS = 80;

  function eBench() {
    const rng = B.mulberry32(99991);
    return [...presetList.map((p) => p.alloc), ...range(100).map(() => B.randomAlloc(rules.n, rules.soldiers, rng))];
  }
  function eReset() {
    eStop();
    E.rng = B.mulberry32(clampInt($('eSeed').value, 0, 1e9, 7));
    const P = clampInt($('ePop').value, 10, 200, 60);
    E.pop = range(P).map(() => B.randomAlloc(rules.n, rules.soldiers, E.rng));
    Object.assign(E, { gen: 0, hist: [], heat: [], champ: null, info: null, bench: eBench() });
  }

  function eGeneration() {
    const { pop, rng, bench } = E, P = pop.length, n = rules.n, S = rules.soldiers;
    const mix = $('eField').value === 'mix';
    const rate = Math.min(1, Math.max(0, parseFloat($('eMut').value) || 0));
    const maxMove = clampInt($('eMove').value, 1, 30, 4);
    const w = new Float64Array(P), d = new Float64Array(P), l = new Float64Array(P), benchMP = new Float64Array(P);
    const tally = (a, r) => { if (r === 1) w[a]++; else if (r === 0) l[a]++; else d[a]++; };

    for (let a = 0; a < P; a++) for (let b = a + 1; b < P; b++) {
      const [x, y] = B.score(pop[a], pop[b], rules), r = B.resultOf(x, y);
      tally(a, r); tally(b, 1 - r);
    }
    for (let k = 0; k < P; k++) for (const o of bench) {
      const [x, y] = B.score(pop[k], o, rules), r = B.resultOf(x, y);
      benchMP[k] += r;
      if (mix) tally(k, r);
    }
    const played = P - 1 + (mix ? bench.length : 0);
    const fit = range(P).map((k) => (w[k] + 0.5 * d[k]) / played);
    const order = range(P).sort((a, b) => fit[b] - fit[a]);
    const ci = order[0];
    const benchWin = range(P).map((k) => benchMP[k] / bench.length);

    E.champ = pop[ci].slice();
    E.hist.push({ gen: E.gen, champ: benchWin[ci], avg: sum(benchWin) / P });
    E.heat.push(range(n).map((i) => sum(pop.map((x) => x[i])) / P));

    const eliteN = Math.max(1, Math.round((P * clampInt($('eElite').value, 5, 60, 20)) / 100));
    const next = order.slice(0, eliteN).map((k) => pop[k].slice());
    const tsel = () => {
      const cands = [0, 1, 2].map(() => Math.floor(rng() * P));
      return { cands, pick: cands.reduce((a, b) => (fit[b] > fit[a] ? b : a)) };
    };
    let example = null;
    while (next.length < P) {
      const s1 = tsel(), s2 = tsel(), p1 = pop[s1.pick], p2 = pop[s2.pick];
      const mask = range(n).map(() => (rng() < 0.5 ? 1 : 2));
      const raw = mask.map((m, i) => (m === 1 ? p1[i] : p2[i]));
      const repaired = B.repair(raw, S, rng);
      const child = repaired.slice();
      const roll = rng();
      let mut = { roll, none: true };
      if (roll < rate) {
        const donors = range(n).filter((i) => child[i] > 0);
        const from = donors[Math.floor(rng() * donors.length)];
        let to = Math.floor(rng() * (n - 1));
        if (to >= from) to++;
        const k = Math.min(child[from], 1 + Math.floor(rng() * maxMove));
        child[from] -= k; child[to] += k;
        mut = { roll, from, to, k };
      }
      if (!example) example = { s1, s2, p1: p1.slice(), p2: p2.slice(), mask, raw, repaired, child: child.slice(), mut };
      next.push(child);
    }
    E.info = {
      gen: E.gen, P, ci, w: w[ci], d: d[ci], l: l[ci], played, mix, fit, order, eliteN, rate,
      eliteMin: fit[order[eliteN - 1]], example, champBench: benchWin[ci], benchN: bench.length,
    };
    E.pop = next;
    E.gen++;
  }

  function eStop() { E.running = false; clearTimeout(E.timer); cancelAnimationFrame(E.timer); $('eRun').textContent = '▶ Run'; }
  function eTick() {
    if (!E.running) return;
    const delay = +$('eSpeed').value;
    if (delay > 0) { eGeneration(); eRender(); E.timer = setTimeout(eTick, delay); }
    else {
      const t0 = performance.now();
      do eGeneration(); while (performance.now() - t0 < 14);
      eRender();
      E.timer = requestAnimationFrame(eTick);
    }
  }
  $('eRun').onclick = () => {
    if (E.running) { eStop(); return; }
    E.running = true;
    $('eRun').textContent = '⏸ Pause';
    eTick();
  };
  $('eStep').onclick = () => { eStop(); eGeneration(); eRender(); };
  $('eReset').onclick = () => { eReset(); eRender(); };
  ['ePop', 'eSeed'].forEach((id) => $(id).addEventListener('change', () => { eReset(); eRender(); }));
  $('eToA').onclick = () => { if (E.champ) { $('presetA').value = ''; setAlloc('A', E.champ); showTab('h2h'); } };

  function buildEvoCharts() {
    chart('evo', 'chEvo', {
      type: 'line',
      data: { labels: [], datasets: [lineDs('Champion', C.s1), lineDs('Population average', C.s2)] },
      options: opts({ x: 'generation', y: 'win % vs benchmark', yMin: 0, yMax: 100, tooltip: { callbacks: { label: (it) => ` ${it.dataset.label}: ${it.parsed.y.toFixed(1)}%` } } }),
    });
    chart('champ', 'chChamp', {
      type: 'bar',
      data: { labels: range(rules.n).map((i) => `C${i + 1}`), datasets: [barDs('Champion', C.s1)] },
      options: opts({ x: 'castle', y: 'soldiers' }),
    });
  }
  function eHeat() {
    const start = Math.max(0, E.heat.length - HEAT_GENS), cols = E.heat.length - start;
    let max = 0;
    for (let c = start; c < E.heat.length; c++) for (const v of E.heat[c]) max = Math.max(max, v);
    drawHeat($('hmEvo'), {
      rows: rules.n, cols, max,
      value: (r, c) => E.heat[start + c][r],
      rowLabel: (r) => `C${r + 1}`,
      colLabel: (c) => `g${start + c}`,
      tip: (r, c) => `Generation ${start + c}, castle ${r + 1}: <b>${num(E.heat[start + c][r])}</b> soldiers on average`,
      empty: 'Run the evolution to fill this in.',
    });
  }
  function eRender() {
    const hs = E.hist.slice(-300);
    setData('evo', hs.map((h) => h.gen), hs.map((h) => +(h.champ * 100).toFixed(2)), hs.map((h) => +(h.avg * 100).toFixed(2)));
    setData('champ', range(rules.n).map((i) => `C${i + 1}`), E.champ ? E.champ.slice() : []);
    eHeat();
    const last = E.hist[E.hist.length - 1];
    const best = E.hist.reduce((m, h) => Math.max(m, h.champ), 0);
    $('eKpis').innerHTML = kpi('Generation', E.gen) + kpi('Population', E.pop.length) +
      kpi('Champion vs benchmark', last ? pct(last.champ) : '—') + kpi('Best so far', last ? pct(best) : '—') +
      kpi('Population avg vs benchmark', last ? pct(last.avg) : '—');
    const I = E.info;
    if (!I) {
      $('eChampTxt').textContent = '';
      $('eLog').innerHTML = '<p class="hint">Press ▶ Run or “1 generation”. The calculations for each generation show here.</p>';
      return;
    }
    $('eChampTxt').innerHTML = `${arr(E.champ)} &nbsp;·&nbsp; fitness ${pct(I.fit[I.ci])} &nbsp;·&nbsp; ${pct(I.champBench)} vs benchmark`;
    const x = I.example, f = (k) => `#${k} (${pct(I.fit[k])})`;
    const castleHead = range(rules.n).map((i) => `<th>C${i + 1}</th>`).join('');
    const rowOf = (label, a, mark) => `<tr><td>${label}</td>${a.map((v, i) => `<td${mark && mark[i] ? ' style="font-weight:600"' : ''}>${v}</td>`).join('')}</tr>`;
    const m = x.mut;
    $('eLog').innerHTML =
      `<h3>① Fitness (generation ${I.gen})</h3>` +
      `<div>Each of ${I.P} strategies played ${I.P - 1} others${I.mix ? ` plus ${I.benchN} benchmark strategies` : ''} = ${I.played} games.</div>` +
      `<div class="eq">Champion #${I.ci}: W ${I.w}, D ${I.d}, L ${I.l}\nfitness = (W + ½·D) / games = (${I.w} + ½·${I.d}) / ${I.played} = ${(I.fit[I.ci]).toFixed(4)}</div>` +
      `<h3>② Selection</h3><div>Elite: the top ${I.eliteN} of ${I.P} (fitness ≥ ${pct(I.eliteMin)}) are copied unchanged. The other ${I.P - I.eliteN} places are filled with children.</div>` +
      `<h3>③ Breeding the first child</h3>` +
      `<div>Tournament selection: draw 3 at random, keep the fittest.<br>Parent 1 from ${x.s1.cands.map(f).join(', ')} → <b>#${x.s1.pick}</b><br>Parent 2 from ${x.s2.cands.map(f).join(', ')} → <b>#${x.s2.pick}</b></div>` +
      `<div class="scroll"><table class="calc"><thead><tr><th></th>${castleHead}<th>Σ</th></tr></thead><tbody>` +
      rowOf('Parent 1', [...x.p1, sum(x.p1)], x.mask.map((v) => v === 1)) +
      rowOf('Parent 2', [...x.p2, sum(x.p2)], x.mask.map((v) => v === 2)) +
      rowOf('Took from', x.mask.map((v) => 'P' + v)) +
      rowOf('Crossover', [...x.raw, sum(x.raw)]) +
      rowOf('Repaired', [...x.repaired, sum(x.repaired)]) +
      rowOf('Mutated', [...x.child, sum(x.child)]) +
      `</tbody></table></div>` +
      `<div>Uniform crossover takes each castle from a random parent. The crossover total was ${sum(x.raw)}` +
      (sum(x.raw) === rules.soldiers ? ', already exactly right.' : `, so the repair step ${sum(x.raw) > rules.soldiers ? 'removed' : 'added'} ${Math.abs(sum(x.raw) - rules.soldiers)} soldier(s) one at a time from random castles to get back to ${rules.soldiers}.`) + '</div>' +
      `<div>Mutation: rolled ${m.roll.toFixed(3)} ` + (m.none ? `≥ rate ${I.rate} → no mutation.` : `< rate ${I.rate} → moved ${m.k} soldier(s) from castle ${m.from + 1} to castle ${m.to + 1}.`) + '</div>';
  }

  /* =========================================================
   * 4 · Fictitious play
   * ========================================================= */
  const Fp = { table: null, t: 0, mix: [], keys: new Set(), sumAlloc: [], counts: [], maxSeen: 0, hist: [], last: null, running: false, timer: 0 };

  function fAdd(alloc) {
    B.addToTable(Fp.table, alloc, 1, rules);
    Fp.t++;
    Fp.mix.push(alloc);
    Fp.keys.add(alloc.join(','));
    alloc.forEach((x, i) => { Fp.sumAlloc[i] += x; Fp.counts[i][x]++; Fp.maxSeen = Math.max(Fp.maxSeen, x); });
  }
  function fReset() {
    fStop();
    Object.assign(Fp, {
      table: B.newTable(rules), t: 0, mix: [], keys: new Set(), sumAlloc: new Array(rules.n).fill(0),
      counts: range(rules.n).map(() => new Uint32Array(rules.soldiers + 1)), maxSeen: 0, hist: [], last: null,
    });
    const v = $('fStart').value;
    const start = v === 'random' || v === '' ? B.randomAlloc(rules.n, rules.soldiers, B.mulberry32(1)) : presetList[+v].alloc;
    fAdd(start.slice());
  }
  function fIter() {
    const t = Fp.t;
    const br = B.bestResponse(Fp.table, 1 / t, rules);
    const det = br.alloc.map((x, i) => {
      let lo = 0;
      for (let y = 0; y < x; y++) lo += Fp.counts[i][y];
      const eq = Fp.counts[i][x];
      return { x, gain: br.gains[i], beat: lo / t, tie: eq / t, lose: 1 - (lo + eq) / t };
    });
    const ci = clampInt($('fCastle').value, 1, rules.n, rules.n) - 1;
    Fp.last = { t, br, det, curve: Float64Array.from(Fp.table[ci], (v) => v / t), curveCastle: ci, isNew: !Fp.keys.has(br.alloc.join(',')) };
    Fp.hist.push({ t, e: br.value });
    fAdd(br.alloc);
  }
  function fStop() { Fp.running = false; clearTimeout(Fp.timer); cancelAnimationFrame(Fp.timer); $('fRun').textContent = '▶ Run'; }
  function fTick() {
    if (!Fp.running) return;
    const delay = +$('fSpeed').value;
    if (delay > 0) { fIter(); fRender(); Fp.timer = setTimeout(fTick, delay); }
    else {
      const t0 = performance.now();
      do fIter(); while (performance.now() - t0 < 14);
      fRender();
      Fp.timer = requestAnimationFrame(fTick);
    }
  }
  $('fRun').onclick = () => {
    if (Fp.running) { fStop(); return; }
    Fp.running = true;
    $('fRun').textContent = '⏸ Pause';
    fTick();
  };
  $('fStep').onclick = () => { fStop(); fIter(); fRender(); };
  $('fReset').onclick = () => { fReset(); fRender(); };
  $('fStart').addEventListener('change', () => { fReset(); fRender(); });
  $('fCastle').addEventListener('change', () => {
    if (Fp.last) {
      const ci = +$('fCastle').value - 1;
      // the curve shown belongs to the mixture the last best reply faced (t strategies)
      const t = Fp.last.t, prev = Fp.mix[Fp.mix.length - 1];
      Fp.last.curve = Float64Array.from(Fp.table[ci], (v, x) => (v - B.castleDiff(x, prev[ci], rules.values[ci], rules)) / t);
      Fp.last.curveCastle = ci;
    }
    fRender();
  });
  $('fToA').onclick = () => { if (Fp.last) { $('presetA').value = ''; setAlloc('A', Fp.last.br.alloc); showTab('h2h'); } };

  function buildFPCharts() {
    const keep = clampInt($('fCastle').value, 1, rules.n, rules.n);
    $('fCastle').innerHTML = range(rules.n).map((i) => `<option value="${i + 1}"${i + 1 === keep ? ' selected' : ''}>${i + 1}</option>`).join('');
    chart('fp', 'chFP', {
      type: 'line',
      data: { labels: [], datasets: [lineDs('Exploitability', C.s1)] },
      options: opts({ x: 'iteration', y: 'points', tooltip: { callbacks: { label: (it) => ` best reply edge: ${it.parsed.y.toFixed(3)} pts` } } }),
    });
    chart('fpMean', 'chFPMean', {
      type: 'bar',
      data: { labels: range(rules.n).map((i) => `C${i + 1}`), datasets: [barDs('Average soldiers', C.s1)] },
      options: opts({ x: 'castle', y: 'soldiers', tooltip: { callbacks: { label: (it) => ` ${it.parsed.y.toFixed(2)} soldiers on average` } } }),
    });
    chart('fpCurve', 'chFPCurve', {
      type: 'line',
      data: { labels: [], datasets: [lineDs('Expected gain', C.s1)] },
      options: opts({ x: 'soldiers sent to this castle', y: 'expected points (you − them)', tooltip: { callbacks: { title: (it) => `${it[0].label} soldiers`, label: (it) => ` expected gain ${it.parsed.y.toFixed(3)}` } } }),
    });
  }
  function fHeat() {
    const bs = Math.max(1, Math.ceil((Fp.maxSeen + 1) / 40)), cols = Math.ceil((Fp.maxSeen + 1) / bs);
    const val = (r, c) => { let s = 0; for (let x = c * bs; x < Math.min((c + 1) * bs, rules.soldiers + 1); x++) s += Fp.counts[r][x]; return s / Fp.t; };
    let max = 0;
    for (let r = 0; r < rules.n; r++) for (let c = 0; c < cols; c++) max = Math.max(max, val(r, c));
    const lab = (c) => (bs === 1 ? String(c) : `${c * bs}–${(c + 1) * bs - 1}`);
    drawHeat($('hmFP'), {
      rows: rules.n, cols: Fp.t ? cols : 0, max,
      value: val, rowLabel: (r) => `C${r + 1}`, colLabel: (c) => String(c * bs),
      tip: (r, c) => `Castle ${r + 1}, ${lab(c)} soldiers: <b>${pct(val(r, c))}</b> of the mixture`,
    });
  }
  function fRender() {
    const hs = Fp.hist, stride = Math.max(1, Math.ceil(hs.length / 400));
    const pts = hs.filter((_, k) => k % stride === 0 || k === hs.length - 1);
    setData('fp', pts.map((h) => h.t), pts.map((h) => +h.e.toFixed(4)));
    setData('fpMean', range(rules.n).map((i) => `C${i + 1}`), Fp.sumAlloc.map((s) => +(s / Fp.t).toFixed(3)));
    fHeat();
    const L = Fp.last;
    const best = hs.reduce((m, h) => Math.min(m, h.e), Infinity);
    $('fKpis').innerHTML = kpi('Iteration', hs.length) + kpi('Strategies in mixture', Fp.t) + kpi('Distinct strategies', Fp.keys.size) +
      kpi('Exploitability now', L ? num(L.br.value) + ' pts' : '—') + kpi('Lowest so far', hs.length ? num(best) + ' pts' : '—');

    if (L) {
      const ci = L.curveCastle, x0 = L.br.alloc[ci];
      setData('fpCurve', range(rules.soldiers + 1), Array.from(L.curve, (v) => +v.toFixed(4)));
      if (charts.fpCurve) {
        charts.fpCurve.data.datasets[0].pointRadius = range(rules.soldiers + 1).map((x) => (x === x0 ? 6 : 0));
        charts.fpCurve.update('none');
      }
      $('fCurveTxt').innerHTML = `f<sub>${ci + 1}</sub>(x) = (1/${L.t}) Σⱼ diff(x, bⱼ,${ci + 1}). The marked point is what the latest best reply sent here: ` +
        `<b>${x0}</b> soldiers for an expected ${num(L.curve[x0])} points. Steps in the curve sit where x passes a troop count the mixture often uses.`;
      const rows = L.det.map((d, i) => `<tr><td>${i + 1}</td><td>${rules.values[i]}</td><td><b>${d.x}</b></td><td>${pct(d.beat)}</td><td>${pct(d.tie)}</td><td>${pct(d.lose)}</td><td>${num(d.gain)}</td></tr>`).join('');
      $('fLog').innerHTML =
        `<h3>① The mixture</h3><div>After ${L.t} iteration(s) the mixture holds ${L.t} strategies, each with weight 1/${L.t}. For every castle i and every troop count x = 0…${rules.soldiers} we keep a running table</div>` +
        `<div class="eq">fᵢ(x) = (1/${L.t}) · Σⱼ diff(x, bⱼᵢ)   (${rules.n} × ${rules.soldiers + 1} = ${rules.n * (rules.soldiers + 1)} numbers, updated each time a strategy is added)</div>` +
        `<h3>② Exact best reply (dynamic programming)</h3><div>Maximise Σ fᵢ(xᵢ) with Σ xᵢ = ${rules.soldiers}:</div>` +
        `<div class="scroll"><table class="calc"><thead><tr><th>Castle</th><th>Worth</th><th>Sends x</th><th>Beats mix</th><th>Ties mix</th><th>Loses to mix</th><th>Expected fᵢ(x)</th></tr></thead><tbody>${rows}</tbody></table></div>` +
        `<div class="eq">best reply = ${arr(L.br.alloc)}\nedge vs mixture = ${L.det.map((d) => num(d.gain)).join(' + ')} = ${num(L.br.value)} points per match</div>` +
        `<h3>③ Update</h3><div>The game is symmetric, so its value is 0. An edge of ${num(L.br.value)} means the mixture can still be exploited by that much. ` +
        `This best reply is ${L.isNew ? '<b>new</b>' : 'one already in the mix'}. It joins the mixture, so the mix now has ${L.t + 1} strategies and will be harder to exploit next round.</div>` +
        (rules.streak ? '<p class="bad">The streak rule is on. Best replies here ignore it (it breaks the castle-by-castle sum), so the edge is approximate.</p>' : '');
    } else {
      setData('fpCurve', [], []);
      $('fCurveTxt').textContent = '';
      $('fLog').innerHTML = '<p class="hint">Press ▶ Run or “1 iteration”. The full calculation for each iteration shows here.</p>';
    }
  }

  /* =========================================================
   * Boot
   * ========================================================= */
  function buildAllCharts() { buildH2HCharts(); buildTourCharts(); buildEvoCharts(); buildFPCharts(); }
  function renderAll() { renderStep(); tRender(true); eRender(); fRender(); }

  let resizeT = 0;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { eHeat(); fHeat(); }, 120); });

  buildPresetSelects();
  defaultAllocs();
  renderAllocTable();
  ruleText();
  buildAllCharts();
  H.match = B.play(H.A, H.B, rules);
  updateSums();
  tSetup();
  eReset();
  fReset();
  renderAll();
})();
