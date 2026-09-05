// Assembles a model from a config: featurizer, action sets, one or two brains. Also save/load and the fingerprint.
import { RULES, TABLE, mulberry32, randomSeed } from './engine.js';
import { makeFeaturizer } from './features.js';
import { TabBrain, ValBrain, PolBrain, MemBrain, NetBrain, brainFromJSON } from './brains.js';

export const FORMAT = 1;
export const REWARD_UNIT = 1 / 25; // chips to reward units

export function defaultConfig() {
  return {
    brain: 'tab',
    tab: { rule: 'q', init: 'zero', step: 'fixed' },
    val: { double: false, replay: 0, targetRefresh: 1000 },
    pol: { baseline: 'none', entropy: 0.01, handsPerUpdate: 10 },
    evo: { pop: 50, selection: 'top', mutRate: 0.05, mutSize: 'medium', crossover: 'uniform', elites: 1, evalHands: 1000 },
    mem: { k: 5, capacity: 10000, forgetting: 'oldest', weighting: 'flat' },
    senses: { composition: false, nCards: false, tray: false, trueCount: false, depth: false, bankroll: false, handsLeft: false, currentBet: false, players: false, recent: false, noise: false, encoding: 'scaled' },
    actions: { double: true, split: true, surrender: true, ladder: 'flat', sharedBrain: false },
    body: { layers: 1, width: 16, activation: 'relu', init: 'random', dropout: 0, bankrollBins: 4, handsBins: 3 },
    goal: { type: 'everyHand', N: 300, target: 200, lossWeight: 1, timing: 'dense', gamma: 1 },
    stakes: { bankroll: 100, minBet: 1, maxBet: 25 },
    school: { cards: 'shoe', decks: 5, penetration: 0.75, company: 0, seat: 'rotating', hands: 100000, curriculum: 'none', seed: 0 },
    teacher: { lr: 0.01, exploration: 'epsilon', epsStart: 1, epsEnd: 0.01, epsOver: 0.5, epsShape: 'linear', temperature: 0.5, updateEvery: 1, optimizer: 'adam', batch: 32, lrSchedule: 'constant', clip: true, weightDecay: 0 },
  };
}

export const LADDERS = {
  flat: { chips: [1] }, three: { chips: [1, 5, 25] }, five: { chips: [1, 2, 5, 10, 25] }, allornothing: { chips: [1, 25] },
  wide: { chips: [1, 5, 25, 100, 500, 1000] },
  fraction: { fractions: [0.01, 0.05, 0.10, 0.25] },
};

// Table stakes a model was trained under; falls back to the standard table for older files.
export function stakesOf(cfg) {
  const s = cfg.stakes || {};
  return { bankroll: s.bankroll ?? TABLE.bankroll, minBet: s.minBet ?? TABLE.minBet, maxBet: s.maxBet ?? TABLE.maxBet };
}

export function playActionsFor(cfg) {
  const a = ['H', 'S'];
  if (cfg.actions.double) a.push('D');
  if (cfg.actions.split) a.push('P');
  if (cfg.actions.surrender) a.push('R');
  return a;
}

function makeBrain(cfg, kind, nInputs, nActions, rng, totalHands) {
  const hidden = Array(cfg.body.layers).fill(cfg.body.width);
  const opt = { type: cfg.teacher.optimizer, lr: cfg.teacher.lr, weightDecay: cfg.teacher.weightDecay, clip: cfg.teacher.clip };
  const net = { nInputs, nActions, hidden, activation: cfg.body.activation, init: cfg.body.init, dropout: cfg.body.dropout, rng, totalHands, lrSchedule: cfg.teacher.lrSchedule, opt };
  if (kind === 'tab') return new TabBrain({ nActions, rule: cfg.tab.rule, init: cfg.tab.init, step: cfg.tab.step, alpha: cfg.teacher.lr, gamma: cfg.goal.gamma, unit: REWARD_UNIT, rng });
  if (kind === 'val') return new ValBrain({ ...net, double: cfg.val.double, replay: cfg.val.replay, targetRefresh: cfg.val.targetRefresh, batch: cfg.teacher.batch, gamma: cfg.goal.gamma, updateEvery: cfg.teacher.updateEvery });
  if (kind === 'pol') return new PolBrain({ ...net, baseline: cfg.pol.baseline, entropy: cfg.pol.entropy, handsPerUpdate: cfg.pol.handsPerUpdate });
  if (kind === 'mem') return new MemBrain({ nActions, k: cfg.mem.k, capacity: cfg.mem.capacity, forgetting: cfg.mem.forgetting, weighting: cfg.mem.weighting, rng });
  return new NetBrain(net);
}

// A model: config + featurizer + heads. `saved` is a parsed model file to continue from.
export function buildModel(cfg, saved = null, rng = null) {
  rng = rng || mulberry32(cfg.school.seed || randomSeed());
  const F = makeFeaturizer(cfg);
  const playActions = playActionsFor(cfg);
  const ladder = LADDERS[cfg.actions.ladder];
  const betEnabled = cfg.actions.ladder !== 'flat';
  const betActions = ladder.chips ? ladder.chips : ladder.fractions;
  const shared = betEnabled && cfg.actions.sharedBrain && cfg.brain !== 'tab' && cfg.brain !== 'mem';
  const totalHands = cfg.school.hands || 1000000;
  const heads = {};
  if (shared) {
    heads.shared = saved ? brainFromJSON(saved.brain.shared, rng) : makeBrain(cfg, cfg.brain, F.sharedSize, betActions.length + playActions.length, rng, totalHands);
  } else {
    heads.play = saved ? brainFromJSON(saved.brain.play, rng) : makeBrain(cfg, cfg.brain, F.playSize, playActions.length, rng, totalHands);
    if (betEnabled) heads.bet = saved ? brainFromJSON(saved.brain.bet, rng) : makeBrain(cfg, cfg.brain, F.betSize, betActions.length, rng, totalHands);
  }
  const keyFn = cfg.brain === 'tab' ? { play: F.playKey, bet: F.betKey } : { play: F.bucketKey, bet: F.bucketKey };
  const m = {
    config: cfg, rng, F, playActions, betActions, betEnabled, shared, heads,
    headFor(phase) { return shared ? heads.shared : phase === 'play' ? heads.play : heads.bet; },
    obsFor(ctx) {
      const phase = ctx.phase;
      const x = shared ? F.shared(ctx) : phase === 'play' ? F.play(ctx) : F.bet(ctx);
      return { x, key: keyFn[phase](ctx) };
    },
    // legal mask over the head's action list for this phase (curriculum masking is applied by the trainer)
    legalFor(ctx) {
      const n = shared ? betActions.length + playActions.length : ctx.phase === 'play' ? playActions.length : betActions.length;
      const m = new Uint8Array(n);
      if (ctx.phase === 'bet') { for (let i = 0; i < betActions.length; i++) m[i] = 1; }
      else { const off = shared ? betActions.length : 0; playActions.forEach((a, i) => { m[off + i] = ctx.legal[a] ? 1 : 0; }); }
      return m;
    },
    toEngine(ctx, idx) {
      if (ctx.phase === 'bet') {
        const v = betActions[idx];
        if (ladder.fractions) return Math.max(ctx.minBet, Math.min(ctx.maxBet, Math.round(v * ctx.bankroll)));
        return v;
      }
      return playActions[shared ? idx - betActions.length : idx];
    },
    paramCount() { return Object.values(heads).reduce((s, h) => s + h.paramCount(), 0); },
    brainJSON() { const o = {}; for (const k in heads) o[k] = heads[k].toJSON(); return o; },
  };
  return m;
}

// Size and experience classes.
export function weightClass(params) { return params < 200 ? 'Featherweight' : params < 2000 ? 'Lightweight' : params < 20000 ? 'Middleweight' : 'Heavyweight'; }
export function experienceClass(hands) { return hands < 100000 ? 'Rookie' : hands < 1000000 ? 'Regular' : hands < 10000000 ? 'Veteran' : 'Grinder'; }

// 52-bit FNV-1a over the canonical JSON of the file minus its fingerprint. Visibility, not security.
export function fingerprint(obj) {
  const s = JSON.stringify({ ...obj, fingerprint: undefined });
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 16777619) >>> 0; h2 = Math.imul(h2 ^ (c * 31 + i), 16777619) >>> 0; }
  return (h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0'));
}

export function serializeModel({ model, handle, created, training, chart, evals }) {
  const file = {
    format: FORMAT, handle, created, updated: new Date().toISOString(),
    config: model.config, rules: RULES, table: TABLE,
    params: model.paramCount(), training, chart: chart || null, evals: evals || null,
    brain: model.brainJSON(),
  };
  file.fingerprint = fingerprint(file);
  return file;
}

export function verifyModel(file) {
  const issues = [];
  if (file.format !== FORMAT) issues.push('Unknown file format.');
  if (file.fingerprint !== fingerprint(file)) issues.push('Fingerprint does not match: this file has been edited since it was saved.');
  for (const k of Object.keys(RULES)) if (file.rules && file.rules[k] !== RULES[k]) issues.push(`House rule "${k}" differs from this table.`);
  return issues;
}
