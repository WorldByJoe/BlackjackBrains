// Tournament: rebuild saved models into agents, then either duplicate (isolated, identical cards)
// or live (all at one shared table) scoring. Plus a step-by-step live table for animation.
import { RULES, TABLE, Shoe, Table, mulberry32, evalHand } from './engine.js';
import { buildModel, stakesOf } from './model.js';

// Stakes for a set of entries: the first entry's regime (all seats at one table share it).
function tableOf(entries) { const s = entries.length ? stakesOf(entries[0].model.config) : TABLE; return { ...TABLE, bankroll: s.bankroll, minBet: s.minBet, maxBet: s.maxBet }; }
import { PolicyAgent } from './trainer.js';
import { bookAgent } from './book.js';

export function loadEntry(file) {
  const model = buildModel(JSON.parse(JSON.stringify(file.config)), JSON.parse(JSON.stringify(file)));
  return { file, model, handle: file.handle, params: file.params, hands: file.training.hands, agent: new PolicyAgent(model) };
}

function median(a) { const s = a.slice().sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : 0; }
function quant(a, q) { const s = a.slice().sort((x, y) => x - y); if (!s.length) return 0; const i = (s.length - 1) * q, lo = Math.floor(i); return s[lo] + (i - lo) * ((s[Math.ceil(i)] ?? s[lo]) - s[lo]); }

// DUPLICATE: every entry plays its own copy of the same seeded shoe for N hands, R times. Fair and low-variance.
export function duplicateTournament(entries, { N = 300, R = 200, baseSeed = 1234, mode = 'shoe' } = {}) {
  const finals = entries.map(() => []);
  const wins = entries.map(() => 0), ruins = entries.map(() => 0);
  const lt = tableOf(entries);
  for (let r = 0; r < R; r++) {
    const seed = (baseSeed + r * 2654435761) >>> 0;
    const round = [];
    entries.forEach((e, ei) => {
      const rng = mulberry32(seed), shoe = new Shoe({ mode: mode === 'single' ? 'single' : 'shoe', decks: 5, penetration: 0.75, rng });
      const t = new Table({ rules: RULES, table: { ...lt, sessionHands: N }, shoe, players: [{ agent: e.agent, name: e.handle }], rng });
      const me = t.players[0];
      for (let h = 0; h < N && !me.sitOut; h++) t.playRound(N);
      finals[ei].push(me.bankroll); if (me.sitOut) ruins[ei]++; round.push(me.bankroll);
    });
    const best = Math.max(...round);
    round.forEach((b, ei) => { if (b === best) wins[ei] += 1 / round.filter(x => x === best).length; });
  }
  return entries.map((e, i) => summ(e, finals[i], wins[i] / R, ruins[i] / R, R, lt.bankroll));
}

// LIVE: all entries at one shared table, N hands, seats rotate each shoe. R replicate tables.
export function liveTournament(entries, { N = 300, R = 200, baseSeed = 5678, mode = 'shoe', bots = 0 } = {}) {
  const finals = entries.map(() => []); const wins = entries.map(() => 0), ruins = entries.map(() => 0);
  for (let r = 0; r < R; r++) {
    const res = playLiveTable(entries, { N, seed: (baseSeed + r * 40503) >>> 0, mode, bots, rotate: true });
    res.entryFinals.forEach((b, i) => { finals[i].push(b); if (res.entryBroke[i]) ruins[i]++; });
    const best = Math.max(...res.entryFinals);
    res.entryFinals.forEach((b, i) => { if (b === best) wins[i] += 1 / res.entryFinals.filter(x => x === best).length; });
  }
  return entries.map((e, i) => summ(e, finals[i], wins[i] / R, ruins[i] / R, R, tableOf(entries).bankroll));
}

function summ(e, finals, winRate, ruinRate, R, start = TABLE.bankroll) {
  return {
    handle: e.handle, params: e.params, hands: e.hands, entry: e,
    median: median(finals), mean: finals.reduce((a, b) => a + b, 0) / finals.length,
    q10: quant(finals, 0.1), q90: quant(finals, 0.9), winRate, ruinRate, sessions: R,
    edge: (median(finals) - start),
  };
}

// One shared table, seats optionally filled with book bots, seats rotate each shoe. Returns finals + a record for animation.
export function playLiveTable(entries, { N = 300, seed = 1, mode = 'shoe', bots = 0, rotate = true, record = false } = {}) {
  const rng = mulberry32(seed), shoe = new Shoe({ mode: mode === 'single' ? 'single' : 'shoe', decks: 5, penetration: 0.75, rng });
  const seats = entries.map(e => ({ agent: e.agent, name: e.handle, isModel: true }));
  for (let b = 0; b < bots; b++) seats.push({ agent: bookAgent, name: 'House Bot ' + (b + 1), isModel: false });
  const t = new Table({ rules: RULES, table: { ...tableOf(entries), sessionHands: N }, shoe, players: seats, rng });
  const idxOf = new Map(entries.map((e, i) => [e.handle, i]));
  const rounds = [];
  let lastShuffle = -1;
  for (let h = 0; h < N; h++) {
    if (t.activePlayers().length === 0) break;
    const rec = t.playRound(N);
    if (record) rounds.push(rec);
  }
  const entryFinals = entries.map(e => t.players.find(p => p.name === e.handle).bankroll);
  const entryBroke = entries.map(e => t.players.find(p => p.name === e.handle).sitOut);
  return { entryFinals, entryBroke, rounds, players: t.players.map(p => ({ name: p.name, isModel: seats.find(s => s.name === p.name).isModel, bankroll: p.bankroll })) };
}

// "Interesting" = big bet, a split or double happened, a blackjack, or a big swing. Used to decide real-time vs skip.
export function isInteresting(rec) {
  const d = rec.dealer;
  for (const p of rec.players) {
    if (p.bet >= 10) return true;
    if (Math.abs(p.net) >= 15) return true;
    for (const h of p.hands) { if (h.doubled || h.outcome === 'surrender' || h.outcome === 'blackjack') return true; }
    if (p.hands.length > 1) return true;
  }
  if (d && d.blackjack) return true;
  return false;
}
