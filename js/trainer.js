// Training loop, evaluation, strategy chart, and the evolution loop.
import { RULES, TABLE, Shoe, Table, mulberry32, randomSeed } from './engine.js';
import { bookAgent, bookAction } from './book.js';
import { trueCount } from './features.js';
import { buildModel, stakesOf } from './model.js';
import { MLP, softmax, sample, argmaxLegal } from './mlp.js';

export function makeShoe(school, rng) {
  if (school.cards === 'infinite') return new Shoe({ mode: 'infinite', rng });
  if (school.cards === 'single') return new Shoe({ mode: 'single', rng });
  if (school.cards === 'custom') return new Shoe({ mode: 'shoe', decks: school.decks, penetration: school.penetration, rng });
  return new Shoe({ mode: 'shoe', decks: 5, penetration: 0.75, rng });
}

function greedyIndex(head, obs, legal) {
  const s = head.scores(obs, legal);
  return argmaxLegal(s, legal);
}

// Plays a model with no exploration. Used by evaluation, evolution fitness, and the tournament.
export class PolicyAgent {
  constructor(model) { this.m = model; this.stats = { bets: 0, betSum: 0, byCount: new Map() }; }
  chooseBet(ctx) {
    const m = this.m;
    let chips = 1;
    if (m.betEnabled) { const obs = m.obsFor(ctx); chips = m.toEngine(ctx, greedyIndex(m.headFor('bet'), obs, m.legalFor(ctx))); }
    const tc = Math.max(-5, Math.min(5, Math.round(trueCount(ctx.tray, ctx.decksLeft))));
    const e = this.stats.byCount.get(tc) || { n: 0, sum: 0 }; e.n++; e.sum += chips; this.stats.byCount.set(tc, e);
    this.stats.bets++; this.stats.betSum += chips;
    return chips;
  }
  chooseAction(ctx) { const m = this.m; return m.toEngine(ctx, greedyIndex(m.headFor('play'), m.obsFor(ctx), m.legalFor(ctx))); }
}

function tableFor(cfg, learnerAgent, learnerName, shoe, sessionIndex, N, rng, table = TABLE) {
  const company = cfg.school.company || 0;
  const players = [];
  const pos = cfg.school.seat === 'fixed' ? 0 : sessionIndex % (company + 1);
  for (let i = 0; i <= company; i++) players.push(i === pos ? { agent: learnerAgent, name: learnerName } : { agent: bookAgent, name: `Bot ${i + 1}` });
  return { table: new Table({ rules: RULES, table: { ...table, sessionHands: N }, shoe, players, rng }), pos };
}

// Score of one finished session under a goal. Used by evolution fitness and evaluation summaries.
function sessionScore(goal, s) {
  const lw = x => (x < 0 ? x * goal.lossWeight : x);
  if (goal.type === 'everyHand' || goal.type === 'sessionTotal') return lw(s.final - s.start);
  if (goal.type === 'survive') return s.hands;
  if (goal.type === 'target') return s.hitTarget ? 1 : 0;
  return s.first ? 1 : 0;
}

// Greedy evaluation over roughly `hands` hands. Returns per-hand EV, bets, ruin rate, mean final bankroll, bet by true count.
export function evaluate(model, { hands = 2000, seed = 12345, N = null } = {}) {
  const cfg = model.config, goal = cfg.goal;
  const n = N || goal.N || 300;
  const stk = stakesOf(cfg), localTable = { ...TABLE, bankroll: stk.bankroll, minBet: stk.minBet, maxBet: stk.maxBet };
  const rng = mulberry32(seed), shoe = makeShoe(cfg.school, rng);
  const agent = new PolicyAgent(model);
  let played = 0, sessions = 0, ruined = 0, finalSum = 0, netSum = 0, scoreSum = 0, si = 0;
  while (played < hands) {
    const { table, pos } = tableFor(cfg, agent, 'eval', shoe, si++, n, rng, localTable);
    const me = table.players[pos];
    let h = 0, hit = false;
    for (; h < n; h++) { if (me.sitOut) break; table.playRound(n); if (goal.type === 'target' && me.bankroll >= goal.target) { hit = true; h++; break; } }
    played += h; sessions++;
    if (me.sitOut) ruined++;
    finalSum += me.bankroll; netSum += me.bankroll - me.startBankroll;
    const first = table.players.every(p => p === me || p.bankroll < me.bankroll);
    scoreSum += sessionScore(goal, { final: me.bankroll, start: me.startBankroll, hands: h, hitTarget: hit, first });
  }
  const byCount = [];
  for (let tc = -5; tc <= 5; tc++) { const e = agent.stats.byCount.get(tc); byCount.push({ tc, n: e ? e.n : 0, bet: e ? e.sum / e.n : null }); }
  return { hands: played, sessions, evPerHand: netSum / played, meanBet: agent.stats.betSum / Math.max(1, agent.stats.bets), ruinRate: ruined / sessions, meanFinal: finalSum / sessions, goalScore: scoreSum / sessions, byCount };
}

// What the play head would do in every book-chart cell, with neutral context. Letters H S D P R.
export function strategyChart(model) {
  const N = model.config.goal.N || 300;
  const base = { phase: 'play', seat: 0, nPlayers: 1, bankroll: 100, startBankroll: 100, round: 0, handsRemaining: N, sessionHands: N, tray: new Int32Array(10), cardsLeft: 260, fractionLeft: 1, decksLeft: 5, decks: 5, recent: [0, 0, 0, 0, 0], rng: () => 0.5, minBet: 1, maxBet: 25, bet: 1 };
  const ask = (cards, d, pair) => {
    let t = 0, aces = 0; for (const c of cards) { t += c.v; if (c.v === 1) aces++; }
    let soft = false; if (aces && t + 10 <= 21) { t += 10; soft = true; }
    const legal = { H: true, S: true, D: true, P: pair, R: true };
    const ctx = { ...base, dealerUp: d, legal, hand: { cards, total: t, soft, pair, nCards: 2, fromSplit: false } };
    const book = bookAction(ctx.hand, d, legal);
    const mine = model.toEngine(ctx, greedyIndex(model.headFor('play'), model.obsFor(ctx), model.legalFor(ctx)));
    return { mine, book };
  };
  const dealers = [2, 3, 4, 5, 6, 7, 8, 9, 10, 1];
  const rows = [], rowsBook = [], labels = [];
  let agree = 0, total = 0;
  const push = (label, cards, pair) => {
    const r = [], b = [];
    for (const d of dealers) { const { mine, book } = ask(cards, d, pair); r.push(mine); b.push(book); if (mine === book) agree++; total++; }
    rows.push(r); rowsBook.push(b); labels.push(label);
  };
  for (let t = 5; t <= 20; t++) push(`hard ${t}`, t <= 11 ? [{ v: t - 2 }, { v: 2 }] : [{ v: 10 }, { v: t - 10 }], false);
  for (let t = 13; t <= 21; t++) push(`soft ${t}`, [{ v: 1 }, { v: t - 11 }], false);
  for (let v = 1; v <= 10; v++) push(`${v === 1 ? 'A' : v},${v === 1 ? 'A' : v}`, [{ v }, { v }], true);
  return { dealers, labels, rows, book: rowsBook, agreement: agree / total };
}

// ------------------------------------------------------------------ the trainer
export function createTrainer(cfg, saved = null) {
  const seed = cfg.school.seed || randomSeed();
  const rng = mulberry32(seed);
  const model = buildModel(cfg, saved, mulberry32(seed ^ 0x9e3779b9));
  const goal = cfg.goal, N = goal.N || 300;
  const totalHands = cfg.school.hands || 1000000;
  const shoe = makeShoe(cfg.school, rng);
  const T = {
    model, cfg, hands: saved ? saved.training.hands : 0, sessionHands: 0, sessions: 0, generation: saved && saved.training.generations || 0,
    recentNets: new Float64Array(20000), recentN: 0, recentI: 0, trace: [], lastTrace: [], curve: saved && saved.training.curve ? saved.training.curve.slice() : [], done: false,
  };
  const stk = stakesOf(cfg), localTable = { ...TABLE, bankroll: stk.bankroll, minBet: stk.minBet, maxBet: stk.maxBet };
  const R = 1 / stk.maxBet;  // scale chip outcomes to ~unit range regardless of stakes
  const startHands = T.hands;
  const progress = () => Math.min(1, (T.hands - startHands) / Math.max(1, cfg.school.hands || 1000000));
  const shapeHand = net => (net < 0 ? net * goal.lossWeight : net) * R;
  const perHandGoal = goal.type === 'everyHand';
  const dense = goal.type === 'everyHand' || (goal.timing === 'dense' && (goal.type === 'sessionTotal' || goal.type === 'survive'));
  const visits = new Map();

  // ---- action selection with exploration
  function select(head, obs, legal, ctx) {
    const t = cfg.teacher, s = head.scores(obs, legal);
    if (head.kind === 'pol') return sample(s, rng);
    if (head.kind === 'evo') return argmaxLegal(s, legal);
    const mode = t.exploration;
    if (mode === 'epsilon') {
      const p = progress(), over = Math.max(0.01, t.epsOver), f = Math.min(1, p / over);
      const eps = t.epsShape === 'exp' ? t.epsStart * Math.pow(Math.max(1e-4, t.epsEnd / Math.max(1e-4, t.epsStart)), f) : t.epsStart + (t.epsEnd - t.epsStart) * f;
      if (rng() < eps) { const idx = []; for (let i = 0; i < legal.length; i++) if (legal[i]) idx.push(i); return idx[Math.floor(rng() * idx.length)]; }
      return argmaxLegal(s, legal);
    }
    if (mode === 'softmax') return sample(softmax(s, legal, t.temperature * R), rng);
    if (mode === 'curiosity') {
      const key = obs.key + '|' + ctx.phase;
      let v = visits.get(key); if (!v) { v = new Int32Array(legal.length); visits.set(key, v); }
      const b = Float64Array.from(s); for (let i = 0; i < b.length; i++) b[i] += 2 * R / Math.sqrt(1 + v[i]);
      const a = argmaxLegal(b, legal); v[a]++; return a;
    }
    return argmaxLegal(s, legal);
  }
  function curriculumMask(legal, ctx) {
    if (cfg.school.curriculum !== 'stages' || ctx.phase !== 'play') return legal;
    const stage = Math.floor(progress() / 0.1);
    const off = model.shared ? model.betActions.length : 0;
    const m = Uint8Array.from(legal);
    model.playActions.forEach((a, i) => { if ((a === 'D' && stage < 1) || (a === 'P' && stage < 2) || (a === 'R' && stage < 3)) m[off + i] = 0; });
    return m;
  }

  // ---- step chains
  const chains = { play: { steps: [], open: null, hand: [] }, bet: { steps: [], open: null } };
  const chainFor = phase => (model.shared ? chains.play : chains[phase]);
  function link(step, phase) {
    const c = chainFor(phase);
    if (c.open) { c.open.next = { obs: step.obs, legal: step.legal }; c.open.an = step.a; }
    c.steps.push(step); c.open = step;
  }
  function flush(c, head) {
    const st = c.steps; if (st.length === 0) return;
    let G = 0;
    for (let i = st.length - 1; i >= 0; i--) { G = st[i].r + (st[i].next ? goal.gamma * G : 0); st[i].G = G; }
    head.learn(st);
    c.steps = []; c.open = null;
  }
  function pushNet(x) { T.recentNets[T.recentI] = x; T.recentI = (T.recentI + 1) % T.recentNets.length; if (T.recentN < T.recentNets.length) T.recentN++; }
  const agent = {
    chooseBet(ctx) {
      if (!model.betEnabled) return 1;
      const obs = model.obsFor(ctx), legal = model.legalFor(ctx), head = model.headFor('bet');
      const a = select(head, obs, legal, ctx);
      link({ obs, a, legal, r: 0, next: null, an: -1, hand: null }, 'bet');
      return model.toEngine(ctx, a);
    },
    chooseAction(ctx) {
      const obs = model.obsFor(ctx), legal = curriculumMask(model.legalFor(ctx), ctx), head = model.headFor('play');
      const a = select(head, obs, legal, ctx);
      link({ obs, a, legal, r: 0, next: null, an: -1, hand: ctx.handRef }, 'play');
      return model.toEngine(ctx, a);
    },
    // Reward for a finished hand goes to that hand's last decision. Per-hand goals end the episode there.
    onHandEnd(hand, net) {
      if (!dense || goal.type === 'survive') return;
      const c = chainFor('play');
      let i = c.steps.length - 1; while (i >= 0 && c.steps[i].hand !== hand) i--;
      const s = i >= 0 ? c.steps[i] : (perHandGoal ? null : c.open);
      if (s) s.r += shapeHand(net);
      if (i >= 0 && perHandGoal && !model.shared) c.steps[i].next = null;
    },
    onRoundEnd(net, bankroll) {
      const cb = chainFor('bet');
      if (model.betEnabled && dense && goal.type !== 'survive' && !model.shared && cb.open) cb.open.r += shapeHand(net);
      if (dense && goal.type === 'survive') for (const c of new Set([chains.play, cb])) if (c.open) c.open.r += R;
      if (perHandGoal) {
        const heads = model.shared ? [[chains.play, model.heads.shared]] : [[chains.play, model.heads.play], [chains.bet, model.heads.bet]];
        for (const [c, h] of heads) if (h) { if (c.open) c.open.next = null; flush(c, h); }
      }
      pushNet(net);
      T.trace.push(bankroll);
    },
  };

  // ---- sessions
  let table = null, me = null, pos = 0;
  function startSession() {
    ({ table, pos } = tableFor(cfg, agent, 'learner', shoe, T.sessions, N, rng, localTable));
    me = table.players[pos]; T.sessionHands = 0; T.trace = [];
  }
  function endSession(hit) {
    const finalScore = (() => {
      if (goal.type === 'sessionTotal' && goal.timing === 'sparse') { const d = (me.bankroll - me.startBankroll) / Math.max(1, me.startBankroll) * 100; return d < 0 ? d * goal.lossWeight : d; }
      if (goal.type === 'survive' && goal.timing === 'sparse') return T.sessionHands / N;
      if (goal.type === 'target') return hit ? 1 : 0;
      if (goal.type === 'champion') return table.players.every(p => p === me || p.bankroll < me.bankroll) ? 1 : 0;
      return 0;
    })();
    const heads = model.shared ? [[chains.play, model.heads.shared]] : [[chains.play, model.heads.play], [chains.bet, model.heads.bet]];
    for (const [c, h] of heads) { if (!h) continue; if (c.open) { c.open.r += finalScore; c.open.next = null; } flush(c, h); }
    T.sessions++; T.lastTrace = T.trace; table = null;
  }
  function playOneHand() {
    if (!table) startSession();
    table.playRound(N); T.hands++; T.sessionHands++;
    for (const h of Object.values(model.heads)) h.onHand(T.hands);
    const hit = goal.type === 'target' && me.bankroll >= goal.target;
    if (me.sitOut || hit || T.sessionHands >= N || table.activePlayers().length === 0) endSession(hit);
  }

  // ---- evolution
  let evo = null;
  function genomeOf() { const g = {}; for (const k in model.heads) g[k] = model.heads[k].net; return g; }
  function setChampion(g) { for (const k in g) model.heads[k].net.copyFrom(g[k]); }
  function evoInit() {
    const e = cfg.evo, size = { small: 0.05, medium: 0.2, large: 0.5 }[e.mutSize];
    const seedG = genomeOf();
    const pop = [];
    for (let i = 0; i < e.pop; i++) { const g = {}; for (const k in seedG) { g[k] = seedG[k].clone(); if (i > 0 || !saved) g[k].mutate(rng, i === 0 ? 0 : Math.max(e.mutRate, 0.5), size); } pop.push({ g, fit: null }); }
    evo = { pop, idx: 0, size, best: null };
  }
  function evoEvaluate(ind) {
    const e = cfg.evo;
    const heads = {}; for (const k in ind.g) heads[k] = { kind: 'evo', scores: (obs) => Float64Array.from(ind.g[k].forward(obs.x)) };
    const proxy = { ...model, heads, headFor: phase => (model.shared ? heads.shared : phase === 'play' ? heads.play : heads.bet) };
    const ev = evaluate(proxy, { hands: e.evalHands, seed: (seed + T.generation * 7919) >>> 0, N });
    T.hands += ev.hands; pushNet(ev.evPerHand);
    ind.fit = goal.type === 'everyHand' ? ev.evPerHand : ev.goalScore;
  }
  function evoNext() {
    const e = cfg.evo, pop = evo.pop.slice().sort((a, b) => b.fit - a.fit);
    if (!evo.best || pop[0].fit >= evo.best.fit) { evo.best = pop[0]; setChampion(pop[0].g); }
    const pick = () => {
      if (e.selection === 'tournament') { let b = null; for (let i = 0; i < 3; i++) { const c = pop[Math.floor(rng() * pop.length)]; if (!b || c.fit > b.fit) b = c; } return b; }
      if (e.selection === 'roulette') { const mn = pop[pop.length - 1].fit; const w = pop.map(p => p.fit - mn + 1e-6); const tot = w.reduce((a, b) => a + b, 0); let r = rng() * tot; for (let i = 0; i < pop.length; i++) { r -= w[i]; if (r <= 0) return pop[i]; } return pop[0]; }
      return pop[Math.floor(rng() * Math.max(1, Math.floor(pop.length / 2)))];
    };
    const next = [];
    for (let i = 0; i < Math.min(e.elites, pop.length); i++) next.push({ g: pop[i].g, fit: pop[i].fit });
    while (next.length < e.pop) {
      const a = pick(), b = pick(), g = {};
      for (const k in a.g) { g[k] = MLP.crossover(a.g[k], b.g[k], rng, e.crossover); g[k].mutate(rng, e.mutRate, evo.size); }
      next.push({ g, fit: null });
    }
    evo.pop = next; evo.idx = 0; T.generation++; T.sessions++;
  }

  // ---- public
  T.step = function (nHands) {
    const target = T.hands + nHands;
    if (cfg.brain === 'evo') {
      if (!evo) evoInit();
      while (T.hands < target) {
        if (evo.idx >= evo.pop.length) evoNext();
        const ind = evo.pop[evo.idx++];
        if (ind.fit === null) evoEvaluate(ind);
      }
    } else while (T.hands < target) playOneHand();
  };
  T.trainingEV = function () { if (!T.recentN) return 0; let s = 0; for (let i = 0; i < T.recentN; i++) s += T.recentNets[i]; return s / T.recentN; };
  T.report = function (evalHands) {
    const ev = evaluate(model, { hands: evalHands, seed: 4242, N });
    const chart = strategyChart(model);
    const point = { hands: T.hands, ev: ev.evPerHand, bet: ev.meanBet, ruin: ev.ruinRate, final: ev.meanFinal, agree: chart.agreement, trainEV: T.trainingEV(), goalScore: ev.goalScore };
    T.curve.push(point);
    return { point, chart, byCount: ev.byCount, trace: T.lastTrace.length ? T.lastTrace : T.trace, generation: T.generation };
  };
  T.seed = seed;
  return T;
}
