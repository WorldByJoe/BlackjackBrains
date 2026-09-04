// The builder page. Renders the menu, live stats, runs training in a worker, draws the three views.
import { defaultConfig, buildModel, weightClass, experienceClass, verifyModel } from './model.js';
import { OPTIONS, LAYERS, BRAINS, RECIPES, applyRecipe, normalize, warnings, isVisible, getPath, setPath } from './menu.js';
import { randomHandle } from './names.js';
import { el, fmt, pct, chips, infoDot, attachTip, lineChart, barChart, css, download, readFile } from './ui.js';
import { PolicyAgent } from './trainer.js';

let cfg = normalize(defaultConfig());
let handle = randomHandle();
let created = new Date().toISOString();
let savedToContinue = null;   // parsed file when continuing training
let worker = null, running = false, lastReport = null, curve = [], startHands = 0;
const runLen = { mode: 'hands', minutes: 2 };  // hands lives in cfg.school.hands

const $ = s => document.querySelector(s);
const ACT_NAMES = { H: 'Hit', S: 'Stand', D: 'Double', P: 'Split', R: 'Surrender' };

// Which layers are open. Remembered across the frequent full re-renders, so choosing an
// option never collapses a section the user left open.
const openLayers = new Set(['brain']);

// ---------------------------------------------------------------- menu rendering
function renderMenu() {
  const host = $('#menu'); host.innerHTML = '';
  for (const layer of LAYERS) {
    const opts = OPTIONS.filter(o => o.layer === layer.id && isVisible(o, cfg));
    const det = el('details', { class: 'layer', open: openLayers.has(layer.id) ? '' : null });
    det.addEventListener('toggle', () => { if (det.open) openLayers.add(layer.id); else openLayers.delete(layer.id); });
    const sum = el('summary', {}, [
      el('span', { class: 'n', text: LAYERS.indexOf(layer) + 1 }),
      el('h3', { text: layer.title }),
      el('span', { class: 'caret', text: '▸' }),
    ]);
    det.append(sum);
    const body = el('div', { class: 'body' }, [el('div', { class: 'blurb', text: layer.blurb })]);
    for (const o of opts) body.append(renderOption(o));
    det.append(body); host.append(det);
  }
}

function renderOption(o) {
  const disabledReason = typeof o.disabled === 'function' ? o.disabled(cfg) : null;
  const val = getPath(cfg, o.path);
  const set = v => { setPath(cfg, o.path, v); normalize(cfg); refresh(); };

  if (o.type === 'radio') {
    const wrap = el('div', { class: 'radios' });
    for (const c of o.choices) {
      const sel = val === c.v;
      const tagBrain = o.path === 'brain' ? el('span', { class: 'tag ' + c.v, text: BRAINS[c.v].tag }) : null;
      const r = el('label', { class: 'radio' + (sel ? ' sel' : '') }, [
        el('input', { type: 'radio', name: o.id, checked: sel ? '' : null, onchange: () => set(c.v) }),
        el('div', {}, [el('div', { class: 't' }, [c.label, tagBrain]), el('div', { class: 'd', text: c.tip })]),
      ]);
      wrap.append(r);
    }
    return el('div', { class: 'opt' + (disabledReason ? ' disabled' : '') }, [
      el('div', { class: 'ctl' }, [wrap]),
    ]);
  }

  const lab = el('div', { class: 'lab' }, [o.label, o.trap ? el('span', { class: 'trap-badge', text: 'trap' }) : null, infoDot(o.tip)]);
  const ctl = el('div', { class: 'ctl' });
  if (o.type === 'toggle') {
    ctl.append(el('label', {}, [el('input', { type: 'checkbox', checked: val ? '' : null, disabled: disabledReason ? '' : null, onchange: e => set(e.target.checked) }), ' ', val ? 'on' : 'off']));
  } else if (o.type === 'select') {
    const sel = el('select', { disabled: disabledReason ? '' : null, onchange: e => { const c = o.choices[e.target.selectedIndex]; set(c.v); } });
    o.choices.forEach(c => sel.append(el('option', { selected: c.v === val ? '' : null }, [c.label])));
    ctl.append(sel);
    const cur = o.choices.find(c => c.v === val);
    if (cur && cur.tip) ctl.append(el('div', { class: 'hint', text: cur.tip }));
  } else if (o.type === 'number') {
    ctl.append(el('input', { type: 'number', value: val, onchange: e => set(+e.target.value || 0) }));
  } else if (o.type === 'log') {
    const row = el('div', { style: 'display:flex;gap:8px;align-items:center' });
    const inp = el('input', { type: 'range', min: Math.log10(o.min), max: Math.log10(o.max), step: 0.01, value: Math.log10(val), style: 'flex:1' });
    const out = el('span', { class: 'mono', style: 'width:64px;text-align:right' });
    const upd = v => { out.textContent = v < 0.001 ? v.toExponential(0) : v.toPrecision(2); };
    inp.oninput = () => { const v = +Math.pow(10, +inp.value).toPrecision(2); upd(v); setPath(cfg, o.path, v); sideOnly(); };
    inp.onchange = () => refresh();
    upd(val); row.append(inp, out); ctl.append(row);
  }
  if (disabledReason) ctl.append(el('div', { class: 'hint', text: disabledReason }));
  return el('div', { class: 'opt' + (disabledReason ? ' disabled' : '') }, [lab, ctl]);
}

// ---------------------------------------------------------------- side panel
let previewModel = null;
function buildPreview() { try { previewModel = buildModel(JSON.parse(JSON.stringify(cfg))); } catch (e) { previewModel = null; } return previewModel; }

function renderSide() {
  const m = savedToContinue ? null : buildPreview();
  const params = savedToContinue ? savedToContinue.params : (m ? m.paramCount() : 0);
  const trained = savedToContinue ? savedToContinue.training.hands : 0;
  const s = $('#side'); s.innerHTML = '';
  s.append(el('div', { class: 'handle-row' }, [el('span', { class: 'handle', text: handle }), el('button', { class: 'btn small', title: 'New random handle', onclick: () => { if (!savedToContinue) { handle = randomHandle(); renderSide(); } } }, ['⟳'])]));
  s.append(el('div', { class: 'blurb', text: savedToContinue ? 'Continuing a saved model. Its handle and brain are fixed.' : 'This handle is the model\'s permanent name. Reroll before training if you like.' }));
  const rows = [
    ['Brain', BRAINS[cfg.brain].label],
    ['Parameters', params ? fmt(params) : '–'],
    ['Weight class', params ? weightClass(params) : '–'],
    ['Trained so far', chips(trained) + ' hands'],
    ['Experience', experienceClass(trained)],
    ['Goal', (OPTIONS.find(o => o.id === 'goal.type').choices.find(c => c.v === cfg.goal.type) || {}).label || cfg.goal.type],
    ['School', (OPTIONS.find(o => o.id === 'school.cards').choices.find(c => c.v === cfg.school.cards) || {}).label || cfg.school.cards],
  ];
  for (const [k, v] of rows) s.append(el('div', { class: 'stat' }, [el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v })]));
  s.append(el('div', { class: 'stat' }, [el('span', { class: 'k', text: 'Class after training' }), el('span', {}, [el('span', { class: 'klass', text: weightClass(params) + ' · ' + experienceClass(trained + cfg.school.hands) })])]));
  const warns = warnings(cfg);
  if (warns.length) { const ul = el('ul', { class: 'warns' }); warns.forEach(w => ul.append(el('li', { class: /will not learn|identical/.test(w) ? 'hard' : '', text: w }))); s.append(ul); }
}
function sideOnly() { renderSide(); }
function refresh() { renderMenu(); renderSide(); syncRunLen(); }

// ---------------------------------------------------------------- training length
function readRunLen() {
  if (runLen.mode === 'time') return { hands: 0, maxSeconds: Math.max(5, Math.round(runLen.minutes * 60)) };
  if (runLen.mode === 'open') return { hands: 0, maxSeconds: 0 };
  return { hands: cfg.school.hands, maxSeconds: 0 };
}
function syncRunLen() {
  const i = $('#rl-hands'); if (!i) return;
  if (document.activeElement !== i) i.value = cfg.school.hands;
  const est = $('#rl-est');
  if (est) est.textContent = `${chips(cfg.school.hands)} hands. Also sets the learning schedule, so the model paces its exploration to this length.`;
}
function setRunMode(mode) {
  runLen.mode = mode;
  document.querySelectorAll('.rl-mode').forEach(b => b.classList.toggle('on', b.dataset.mode === mode));
  document.querySelectorAll('.rl-body').forEach(b => { b.hidden = b.dataset.body !== mode; });
  $('#go').textContent = mode === 'open' ? 'Train until I stop' : 'Train this model';
}

// ---------------------------------------------------------------- recipes
function renderRecipes() {
  const host = $('#recipes'); host.innerHTML = '';
  for (const r of RECIPES) {
    host.append(el('button', { class: 'recipe', onclick: () => { cfg = applyRecipe(defaultConfig(), r); savedToContinue = null; handle = randomHandle(); refresh(); $('#builder').scrollIntoView({ behavior: 'smooth' }); } }, [
      el('div', { class: 'rn', text: r.name }), el('div', { class: 'rl', text: r.line }), el('div', { class: 'rb', text: r.blurb }),
    ]));
  }
}

// ---------------------------------------------------------------- training
function startTraining() {
  if (running) return;
  normalize(cfg);
  running = true; curve = savedToContinue && savedToContinue.training.curve ? savedToContinue.training.curve.slice() : []; lastReport = null;
  $('#train-panel').hidden = false; $('#go').disabled = true; $('#stop').disabled = false; $('#save').disabled = true;
  const { hands, maxSeconds } = readRunLen();
  $('#pbar').parentElement.classList.toggle('indet', hands === 0 && maxSeconds === 0);
  $('#pbar').style.width = '0%';
  worker = new Worker('js/worker.js', { type: 'module' });
  worker.onmessage = onWorker;
  worker.onerror = e => { $('#status').textContent = 'Worker error: ' + e.message; running = false; $('#go').disabled = false; };
  worker.postMessage({ type: 'start', config: JSON.parse(JSON.stringify(cfg)), saved: savedToContinue, handle, created, hands, maxSeconds });
  $('#status').textContent = 'starting…';
}
function stopTraining() { if (worker) worker.postMessage({ type: 'stop' }); }

let finishedFile = null;
function onWorker(e) {
  const m = e.data;
  if (m.type === 'started') { startHands = m.hands || 0; $('#status').textContent = `training ${BRAINS[cfg.brain].label}, ${fmt(m.params)} parameters`; }
  else if (m.type === 'progress') {
    if (!(m.target === 0 && m.maxSeconds === 0)) $('#pbar').style.width = Math.min(100, (m.frac || 0) * 100).toFixed(1) + '%';
    const time = m.maxSeconds > 0 ? `${m.elapsed.toFixed(0)}s / ${m.maxSeconds}s` : `${m.elapsed.toFixed(0)}s`;
    $('#status').textContent = `${chips(m.hands)} hands · ${fmt(m.rate)} hands/s · ${cfg.brain === 'evo' ? 'gen ' + m.generation + ' · ' : ''}${time}`;
    setMetric('train-ev', (m.trainEV >= 0 ? '+' : '') + m.trainEV.toFixed(3));
  } else if (m.type === 'report') { lastReport = m; curve = m.curve; drawViews(); }
  else if (m.type === 'done') { finishedFile = m.file; running = false; $('#go').disabled = false; $('#stop').disabled = true; $('#save').disabled = false; $('#pbar').parentElement.classList.remove('indet'); if (readRunLen().hands === 0 && readRunLen().maxSeconds === 0) $('#pbar').style.width = '100%'; $('#status').textContent = 'done · ' + chips(m.file.training.hands) + ' hands total. Save your model below.'; worker.terminate(); worker = null; }
  else if (m.type === 'error') { $('#status').textContent = 'Error: ' + m.message; running = false; $('#go').disabled = false; }
}

function setMetric(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }

function drawViews() {
  const r = lastReport; if (!r) return;
  // metrics
  setMetric('m-ev', (r.point.ev >= 0 ? '+' : '') + r.point.ev.toFixed(3));
  setMetric('m-bet', r.point.bet.toFixed(2));
  setMetric('m-ruin', pct(r.point.ruin));
  setMetric('m-final', fmt(r.point.final, 0));
  setMetric('m-agree', pct(r.point.agree));
  // learning curve
  lineChart($('#curve'), [
    { data: curve.map(p => ({ x: p.hands, y: p.ev })), color: css('--felt'), label: 'winnings/hand', width: 2 },
  ], { height: 150, zero: true, fmtX: chips, fmtY: v => v.toFixed(2) });
  // strategy chart
  drawStrategy(r.chart);
  // bankroll trace
  const tr = r.trace || [];
  lineChart($('#trace'), [{ data: tr.map((y, i) => ({ x: i, y })), color: css('--gold'), width: 1.5 }], { height: 130, ymin: 0, fmtX: v => v + 'h', fmtY: v => fmt(v) });
  // bet by count
  const bc = (r.byCount || []).filter(b => b.tc >= -3 && b.tc <= 5);
  barChart($('#bycount'), bc.map(b => ({ label: (b.tc > 0 ? '+' : '') + b.tc, value: b.bet || 0, n: b.n, color: b.tc > 0 ? css('--felt') : b.tc < 0 ? css('--red') : css('--muted') })), { height: 140, xlabel: 'true count (higher = more high cards left)' });
}

function drawStrategy(chart) {
  if (!chart) return;
  const host = $('#strategy'); host.innerHTML = '';
  const t = el('table', { class: 'sc' });
  const head = el('tr', {}, [el('th', { text: '' })].concat(chart.dealers.map(d => el('th', { text: d === 1 ? 'A' : d }))));
  t.append(el('thead', {}, [head]));
  const body = el('tbody');
  chart.labels.forEach((lab, i) => {
    const tr = el('tr', {}, [el('th', { text: lab })]);
    chart.rows[i].forEach((a, j) => {
      const book = chart.book[i][j];
      const td = el('td', { class: 'a-' + a });
      td.textContent = a;
      if (a !== book) { td.style.outline = '2px solid ' + css('--ink'); td.style.outlineOffset = '-2px'; }
      attachTip(td, `${lab} vs ${chart.dealers[j] === 1 ? 'A' : chart.dealers[j]}: plays ${ACT_NAMES[a]}${a !== book ? ', book says ' + ACT_NAMES[book] : ' (matches book)'}`);
      tr.append(td);
    });
    body.append(tr);
  });
  t.append(body); host.append(t);
  host.append(el('div', { class: 'legend' }, [...['H', 'S', 'D', 'P', 'R'].map(a => el('span', {}, [el('span', { class: 'sw a-' + a }), ACT_NAMES[a]])), el('span', {}, [el('span', { class: 'sw', style: 'outline:2px solid var(--ink);background:transparent' }), 'differs from book']),
  ]));
  $('#agree-note').textContent = `Agrees with basic strategy on ${pct(chart.agreement)} of cells. Outlined cells differ.`;
}

// ---------------------------------------------------------------- save / load
function saveModel() {
  if (!finishedFile) return;
  const safe = handle.replace(/[^\w]+/g, '-');
  download(`${safe}.bjbrain.json`, JSON.stringify(finishedFile));
}
async function loadModel(file) {
  try {
    const parsed = JSON.parse(await readFile(file));
    const issues = verifyModel(parsed);
    savedToContinue = parsed; cfg = normalize(parsed.config); handle = parsed.handle; created = parsed.created;
    finishedFile = parsed;
    refresh();
    $('#status').textContent = (issues.length ? '⚠ ' + issues.join(' ') + ' ' : '') + `Loaded ${handle}: ${chips(parsed.training.hands)} hands. Set a new training amount and continue.`;
    $('#train-panel').hidden = false; $('#save').disabled = false;
    if (parsed.chart) { lastReport = { chart: parsed.chart, point: { ev: 0, bet: 0, ruin: 0, final: 0, agree: parsed.chart.agreement }, byCount: parsed.evals ? parsed.evals.byCount : [] }; drawStrategy(parsed.chart); }
    $('#builder').scrollIntoView({ behavior: 'smooth' });
  } catch (e) { $('#status').textContent = 'Could not read that file: ' + e.message; }
}

// ---------------------------------------------------------------- wire up
export function init() {
  renderRecipes(); refresh();
  $('#go').onclick = startTraining;
  $('#stop').onclick = stopTraining;
  $('#save').onclick = saveModel;
  $('#reroll').onclick = () => { if (!savedToContinue) { handle = randomHandle(); renderSide(); } };
  const fi = $('#loadfile'); fi.onchange = e => { if (e.target.files[0]) loadModel(e.target.files[0]); };
  $('#loadbtn').onclick = () => fi.click();
  $('#fresh').onclick = () => { savedToContinue = null; finishedFile = null; cfg = normalize(defaultConfig()); handle = randomHandle(); created = new Date().toISOString(); $('#train-panel').hidden = true; refresh(); };
  // training length
  document.querySelectorAll('.rl-mode').forEach(b => { b.onclick = () => setRunMode(b.dataset.mode); });
  $('#rl-hands').onchange = e => { cfg.school.hands = Math.max(1000, Math.round(+e.target.value || 0)); e.target.value = cfg.school.hands; renderSide(); syncRunLen(); };
  document.querySelectorAll('.rl-presets button').forEach(b => { b.onclick = () => { cfg.school.hands = +b.dataset.h; renderSide(); syncRunLen(); }; });
  $('#rl-min').onchange = e => { runLen.minutes = Math.max(0.25, +e.target.value || 1); e.target.value = runLen.minutes; };
  setRunMode('hands'); syncRunLen();
}
