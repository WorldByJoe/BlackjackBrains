// Tournament page: load models, run the leaderboard (duplicate or live), and animate one live table.
import { verifyModel, weightClass, experienceClass } from './model.js';
import { loadEntry, duplicateTournament, liveTournament, playLiveTable, isInteresting } from './tournament.js';
import { OPTIONS, LAYERS, BRAINS, isVisible, getPath } from './menu.js';
import { el, fmt, pct, chips, readFile, css, attachTip } from './ui.js';
import { TABLE, RULES } from './engine.js';

const $ = s => document.querySelector(s);
const COLORS = ['#1E6A48', '#B23A31', '#3B6EA8', '#A88434', '#7A4EA3', '#5A6B7C'];
let entries = [];
let specOpen = -1;   // index of the entry whose training options are shown
const CARD = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
const rankStr = c => (c.r || (c.v === 1 ? 'A' : c.v)) + (c.s || '');

function renderEntries() {
  const host = $('#entries'); host.innerHTML = '';
  if (!entries.length) { host.append(el('p', { class: 'blurb', text: 'No models loaded yet. Drop .bjbrain.json files above, or train some on the Train page.' })); $('#run').disabled = true; return; }
  $('#run').disabled = entries.length < 1;
  const t = el('table', { class: 'grid' });
  t.append(el('thead', {}, [el('tr', {}, ['', 'Model', 'Brain', 'Params', 'Weight', 'Trained', 'Class', ''].map(h => el('th', { text: h })))]));
  const b = el('tbody');
  entries.forEach((e, i) => {
    b.append(el('tr', {}, [
      el('td', {}, [el('span', { class: 'chip-dot', style: 'background:' + COLORS[i % COLORS.length] })]),
      el('td', {}, [el('b', { text: e.handle })]),
      el('td', { text: ({ tab: 'Lookup', val: 'Value net', pol: 'Policy net', evo: 'Evolved', mem: 'Memory' })[e.file.config.brain] }),
      el('td', { class: 'num', text: fmt(e.params) }),
      el('td', {}, [el('span', { class: 'pill', text: weightClass(e.params) })]),
      el('td', { class: 'num', text: chips(e.hands) }),
      el('td', {}, [el('span', { class: 'pill', text: experienceClass(e.hands) })]),
      el('td', { style: 'white-space:nowrap' }, [
        el('button', { class: 'btn small' + (specOpen === i ? ' primary' : ''), onclick: () => toggleSpec(i) }, ['options']),
        el('button', { class: 'btn small danger', style: 'margin-left:4px', onclick: () => { entries.splice(i, 1); if (specOpen === i) specOpen = -1; else if (specOpen > i) specOpen--; renderEntries(); renderSpec(); } }, ['remove']),
      ]),
    ]));
  });
  t.append(b); host.append(t);
  const cls = new Set(entries.map(e => weightClass(e.params) + '/' + experienceClass(e.hands)));
  if (cls.size > 1) host.append(el('p', { class: 'blurb', style: 'margin-top:8px', text: 'Heads up: these models are not all the same weight and experience class. Fair fights match class; mixed fields are fun but lopsided.' }));
  renderSpec();
}

function toggleSpec(i) { specOpen = specOpen === i ? -1 : i; renderEntries(); }

// The full sheet of choices a player made when training this model, read back from the saved file.
function renderSpec() {
  const host = $('#modelcard'); if (!host) return;
  if (specOpen < 0 || !entries[specOpen]) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false; host.innerHTML = '';
  host.append(specSheet(entries[specOpen].file));
}

function specSheet(file) {
  const cfg = file.config;
  const wrap = el('div', { class: 'spec' });
  wrap.append(el('div', { class: 'spec-head' }, [
    el('div', {}, [el('div', { class: 'spec-title', text: file.handle }),
      el('div', { class: 'spec-sub', text: `${BRAINS[cfg.brain].label} · ${fmt(file.params)} parameters · ${weightClass(file.params)} · ${chips(file.training.hands)} hands · ${experienceClass(file.training.hands)}` })]),
    el('button', { class: 'btn small', onclick: () => { specOpen = -1; renderEntries(); } }, ['close']),
  ]));
  wrap.append(el('div', { class: 'spec-note', text: 'Every choice this model was trained with. Toggles are listed only where the player turned them on.' }));
  const grid = el('div', { class: 'spec-grid' });
  for (const layer of LAYERS) {
    const opts = OPTIONS.filter(o => o.layer === layer.id && isVisible(o, cfg));
    const dl = el('dl', { class: 'spec-list' });
    let n = 0;
    for (const o of opts) {
      const v = getPath(cfg, o.path);
      if (o.type === 'toggle' && !v) continue;                 // show only enabled toggles
      if (o.path === 'brain') continue;                        // brain is already in the header
      let label;
      if (o.type === 'toggle') label = 'on';
      else if (o.choices) { const c = o.choices.find(c => c.v === v); label = c ? c.label : String(v); }
      else label = String(v);
      dl.append(el('dt', { text: o.label })); dl.append(el('dd', { text: label }));
      n++;
    }
    if (!n) dl.append(el('dt', { class: 'muted', text: '(standard)' }), el('dd', {}, ['']));
    grid.append(el('div', { class: 'spec-sec' }, [el('div', { class: 'spec-layer', text: layer.title }), dl]));
  }
  wrap.append(grid);
  const hist = file.training.history;
  if (hist && hist.length > 1) {
    wrap.append(el('div', { class: 'spec-hist', text: `Trained in ${hist.length} sessions: ` + hist.map(x => (x.hands || 0).toLocaleString() + ' hands' + (x.date ? ' (' + x.date.slice(0, 10) + ')' : '')).join(', ') }));
  }
  wrap.append(el('div', { class: 'spec-hist', text: `House rules stamped in file: ${RULES.decks}-deck shoe, dealer ${RULES.dealerHitsSoft17 ? 'hits' : 'stands'} soft 17, blackjack pays ${RULES.blackjackPays === 1.5 ? '3:2' : RULES.blackjackPays}.` }));
  return wrap;
}

async function addFiles(files) {
  for (const f of files) {
    try {
      const parsed = JSON.parse(await readFile(f));
      const issues = verifyModel(parsed);
      const e = loadEntry(parsed);
      if (issues.length) e.warn = issues.join(' ');
      entries.push(e);
    } catch (err) { alert('Could not load ' + f.name + ': ' + err.message); }
  }
  renderEntries();
}

// ---------------------------------------------------------------- leaderboard
function runLeaderboard() {
  if (!entries.length) return;
  const mode = $('#cards').value, R = +$('#reps').value, N = +$('#hands').value, kind = $('#kind').value, bots = +$('#bots').value;
  $('#run').disabled = true; $('#lb-status').textContent = 'playing ' + fmt(R) + (kind === 'live' ? ' shared tables' : ' × ' + entries.length + ' isolated sessions') + '…';
  entries.forEach(e => e.agent.stats = { bets: 0, betSum: 0, byCount: new Map() });
  setTimeout(() => {
    const t0 = performance.now();
    const res = kind === 'live' ? liveTournament(entries, { N, R, mode, bots }) : duplicateTournament(entries, { N, R, mode });
    const dt = ((performance.now() - t0) / 1000).toFixed(1);
    res.sort((a, b) => b.median - a.median || b.winRate - a.winRate);
    renderLeaderboard(res, kind, dt);
    $('#run').disabled = false;
  }, 30);
}

function renderLeaderboard(res, kind, dt) {
  const host = $('#leaderboard'); host.innerHTML = '';
  $('#lb-status').textContent = `${kind === 'live' ? 'Shared-table' : 'Duplicate (identical cards)'} result over ${fmt(res[0].sessions)} sessions, ${dt}s. Start bankroll ${TABLE.bankroll}.`;
  const t = el('table', { class: 'grid' });
  t.append(el('thead', {}, [el('tr', {}, ['#', 'Model', 'Median end', 'Edge', 'Typical range', kind === 'live' ? 'Win table' : 'Finish 1st', 'Ruin'].map(h => el('th', { text: h })))]));
  const b = el('tbody');
  const maxAbs = Math.max(1, ...res.map(r => Math.abs(r.edge)));
  res.forEach((r, i) => {
    const idx = entries.indexOf(r.entry);
    const edgeBar = el('div', { style: `display:inline-block;height:9px;border-radius:2px;width:${Math.abs(r.edge) / maxAbs * 60}px;background:${r.edge >= 0 ? css('--felt') : css('--red')};vertical-align:middle;margin-left:6px` });
    b.append(el('tr', {}, [
      el('td', { class: 'num', text: i + 1 }),
      el('td', {}, [el('span', { class: 'chip-dot', style: 'background:' + COLORS[idx % COLORS.length] }), el('b', { text: r.handle })]),
      el('td', { class: 'num', text: fmt(r.median) }),
      el('td', { class: 'num' }, [(r.edge >= 0 ? '+' : '') + fmt(r.edge), edgeBar]),
      el('td', { class: 'num', text: fmt(r.q10) + ' – ' + fmt(r.q90) }),
      el('td', { class: 'num', text: pct(r.winRate) }),
      el('td', { class: 'num', text: pct(r.ruinRate) }),
    ]));
  });
  t.append(b); host.append(t);
  host.append(el('p', { class: 'blurb', style: 'margin-top:10px', text: 'Median end is the middle final bankroll across sessions; blackjack is noisy, so the typical range (10th–90th percentile) is wide. "Finish 1st" is how often the model had the most chips that session.' }));
}

// ---------------------------------------------------------------- live animated table
let live = null;
function setupLive() {
  if (entries.length < 1) { alert('Load at least one model first.'); return; }
  const N = +$('#hands').value, mode = $('#cards').value, bots = +$('#bots').value;
  const res = playLiveTable(entries, { N, seed: (Math.random() * 1e9) >>> 0, mode, bots, record: true });
  live = { res, i: 0, N, playing: false, banks: {}, timer: null };
  res.players.forEach(p => live.banks[p.name] = TABLE.bankroll);
  $('#felt').hidden = false;
  drawFelt(null);
  $('#play').textContent = '▶ Play'; $('#live-status').textContent = `${res.rounds.length} hands dealt. Press play.`;
}
function stepLive(auto) {
  if (!live || live.i >= live.res.rounds.length) { pauseLive(); if (live) $('#live-status').textContent = 'Session complete.'; return; }
  const rec = live.res.rounds[live.i++];
  for (const p of rec.players) live.banks[p.name] = p.bankroll;
  drawFelt(rec);
  const skip = $('#skip').checked && !isInteresting(rec);
  $('#live-status').textContent = `Hand ${live.i} of ${live.res.rounds.length}` + (rec.shuffled ? ' · shuffle' : '');
  if (auto && live.playing) {
    const base = +$('#speed').value;
    live.timer = setTimeout(() => stepLive(true), skip ? 12 : base);
  }
}
function playLive() { if (!live) return; live.playing = !live.playing; $('#play').textContent = live.playing ? '❚❚ Pause' : '▶ Play'; if (live.playing) stepLive(true); else clearTimeout(live.timer); }
function pauseLive() { if (live) { live.playing = false; clearTimeout(live.timer); } const p = $('#play'); if (p) p.textContent = '▶ Play'; }

function drawFelt(rec) {
  const host = $('#felt-body'); host.innerHTML = '';
  // dealer
  const dealer = el('div', { class: 'seat dealer' }, [el('div', { class: 'seat-name', text: 'Dealer' }),
    el('div', { class: 'cards' }, rec && rec.dealer ? rec.dealer.cards.map(c => cardEl(c)) : [cardEl(null), cardEl(null)]),
    el('div', { class: 'tot', text: rec && rec.dealer ? (rec.dealer.bust ? 'bust' : rec.dealer.total) : '' })]);
  host.append(dealer);
  const seatsWrap = el('div', { class: 'seats' });
  live.res.players.forEach((pl, i) => {
    const pr = rec ? rec.players.find(x => x.name === pl.name) : null;
    const idx = entries.findIndex(e => e.handle === pl.name);
    const color = pl.isModel && idx >= 0 ? COLORS[idx % COLORS.length] : css('--muted');
    const handEls = [];
    if (pr) for (const h of pr.hands) handEls.push(el('div', { class: 'hand' }, [
      el('div', { class: 'cards' }, h.cards.map(c => cardEl(c))),
      el('div', { class: 'tot', text: outcomeLabel(h) }),
    ]));
    else handEls.push(el('div', { class: 'hand' }, [el('div', { class: 'cards' }, [cardEl(null), cardEl(null)])]));
    const net = pr ? pr.net : 0;
    seatsWrap.append(el('div', { class: 'seat' + (pl.isModel ? '' : ' bot') }, [
      el('div', { class: 'seat-name' }, [el('span', { class: 'chip-dot', style: 'background:' + color }), pl.name, pl.isModel ? '' : ' 🤖']),
      ...handEls,
      el('div', { class: 'money' }, [
        el('span', { class: 'bank', text: fmt(live.banks[pl.name]) }),
        pr ? el('span', { class: 'delta', style: 'color:' + (net > 0 ? css('--felt') : net < 0 ? css('--red') : css('--muted')), text: net === 0 ? '' : (net > 0 ? '+' : '') + net }) : '',
        pr ? el('span', { class: 'bet-tag', text: 'bet ' + pr.bet }) : '',
      ]),
    ]));
  });
  host.append(seatsWrap);
}
function cardEl(c) {
  if (!c) return el('div', { class: 'pcard back' });
  const red = c.s === '♥' || c.s === '♦';
  return el('div', { class: 'pcard' + (red ? ' red' : '') }, [rankStr(c)]);
}
function outcomeLabel(h) {
  const ev = evalTotal(h.cards);
  const o = { win: 'win', lose: 'lose', push: 'push', bust: 'bust', blackjack: 'BJ!', surrender: 'surr' }[h.outcome] || ev;
  return (h.doubled ? '×2 ' : '') + o + (h.outcome && h.outcome !== 'bust' && h.outcome !== 'blackjack' ? ' (' + ev + ')' : '');
}
function evalTotal(cards) { let t = 0, a = 0; for (const c of cards) { t += c.v; if (c.v === 1) a++; } if (a && t + 10 <= 21) t += 10; return t; }

// ---------------------------------------------------------------- wire up
export function init() {
  const drop = $('#drop');
  ['dragover', 'dragenter'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
  $('#pick').onclick = () => $('#files').click();
  $('#files').onchange = e => addFiles(e.target.files);
  $('#run').onclick = runLeaderboard;
  $('#deal').onclick = setupLive;
  $('#play').onclick = playLive;
  $('#step').onclick = () => { pauseLive(); stepLive(false); };
  renderEntries();
}
