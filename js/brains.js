// The five learning families. All share one interface used by the trainer:
//   scores(obs, legal) -> Float64Array of per-action scores (Q-values, or probabilities for the policy brain)
//   learn(steps)        -> consume a finished chain of steps {obs:{x,key}, a, r, G, next:{obs,legal}|null, an}
//   onHand(hands)       -> per-hand tick for time-based updates
//   paramCount(), toJSON(), static fromJSON()
import { MLP, softmax, argmaxLegal } from './mlp.js';

function lrAt(lr, schedule, hands, total) {
  if (schedule === 'halving') return lr * Math.pow(0.5, Math.floor(hands / 100000));
  if (schedule === 'cosine') { const p = Math.min(1, hands / Math.max(1, total)); return lr * Math.max(0.05, 0.5 * (1 + Math.cos(Math.PI * p))); }
  return lr;
}

// ---------------------------------------------------------------- lookup table
export class TabBrain {
  // unit: the reward for winning one chip. Optimism means "as good as a sure one-chip win".
  constructor({ nActions, rule = 'q', init = 'zero', step = 'fixed', alpha = 0.05, gamma = 1, unit = 0.04, rng = Math.random }) {
    Object.assign(this, { kind: 'tab', nActions, rule, init, step, alpha, gamma, unit, rng });
    this.q = new Map(); this.visits = new Map();
    this.initVec = new Float64Array(nActions);
    if (init === 'optimistic') this.initVec.fill(unit); else if (init === 'pessimistic') this.initVec.fill(-unit);
    else if (init === 'random') for (let i = 0; i < nActions; i++) this.initVec[i] = (rng() - 0.5) * unit;
  }
  get(key) {
    let q = this.q.get(key);
    if (!q) {
      q = new Float64Array(this.nActions);
      if (this.init === 'random') for (let i = 0; i < q.length; i++) q[i] = (this.rng() - 0.5) * this.unit; else q.set(this.initVec);
      this.q.set(key, q); this.visits.set(key, new Int32Array(this.nActions));
    }
    return q;
  }
  scores(obs) { return this.q.get(obs.key) || this.initVec; }
  learn(steps) {
    for (const s of steps) {
      const q = this.get(s.obs.key), v = this.visits.get(s.obs.key);
      let target;
      if (this.rule === 'mc') target = s.G;
      else if (!s.next) target = s.r;
      else if (this.rule === 'sarsa') target = s.r + this.gamma * this.get(s.next.obs.key)[s.an];
      else { const qn = this.get(s.next.obs.key); let mx = -Infinity; for (let i = 0; i < qn.length; i++) if (s.next.legal[i] && qn[i] > mx) mx = qn[i]; target = s.r + this.gamma * mx; }
      v[s.a]++;
      const a = this.step === 'decay' ? 1 / (1 + v[s.a]) : this.alpha;
      q[s.a] += a * (target - q[s.a]);
    }
  }
  onHand() {}
  paramCount() { return this.q.size * this.nActions; }
  toJSON() { return { kind: 'tab', nActions: this.nActions, rule: this.rule, init: this.init, step: this.step, alpha: this.alpha, gamma: this.gamma, unit: this.unit, q: Array.from(this.q.entries()).map(([k, v]) => [k, Array.from(v)]), visits: Array.from(this.visits.entries()).map(([k, v]) => [k, Array.from(v)]) }; }
  static fromJSON(j, rng) {
    const b = new TabBrain({ ...j, rng });
    for (const [k, v] of j.q) b.q.set(k, Float64Array.from(v));
    for (const [k, v] of j.visits || []) b.visits.set(k, Int32Array.from(v));
    return b;
  }
}

// ---------------------------------------------------------------- value network
export class ValBrain {
  constructor(o) {
    const { nInputs, nActions, hidden = [16], activation = 'relu', init = 'random', dropout = 0, double = false, replay = 0, targetRefresh = 1000,
      opt = { type: 'adam', lr: 0.001, weightDecay: 0, clip: true }, batch = 32, gamma = 1, updateEvery = 1, lrSchedule = 'constant', totalHands = 100000, rng = Math.random, net = null } = o;
    Object.assign(this, { kind: 'val', nInputs, nActions, hidden, double, replay, targetRefresh, opt, batch, gamma, updateEvery, lrSchedule, totalHands, rng });
    this.net = net || new MLP([nInputs, ...hidden, nActions], { activation, init, dropout, rng });
    this.target = this.net.clone();
    this.buffer = []; this.bufPos = 0; this.pending = []; this.hands = 0;
  }
  scores(obs) { return Float64Array.from(this.net.forward(obs.x)); }
  learn(steps) {
    if (this.replay > 0) for (const s of steps) { if (this.buffer.length < this.replay) this.buffer.push(s); else { this.buffer[this.bufPos] = s; this.bufPos = (this.bufPos + 1) % this.replay; } }
    else for (const s of steps) this.pending.push(s);
  }
  onHand(hands) {
    this.hands = hands;
    if (hands % this.updateEvery === 0) this.update();
    if (hands % this.targetRefresh === 0) this.target.copyFrom(this.net);
  }
  targetFor(s) {
    if (!s.next) return s.r;
    const qt = this.target.forward(s.next.obs.x);
    let v;
    if (this.double) { const qo = this.net.forward(s.next.obs.x); const a = argmaxLegal(qo, s.next.legal); v = qt[a]; }
    else v = qt[argmaxLegal(qt, s.next.legal)];
    return s.r + this.gamma * v;
  }
  update() {
    let batch;
    if (this.replay > 0) { if (this.buffer.length < Math.min(this.batch, 32)) return; batch = []; for (let i = 0; i < this.batch; i++) batch.push(this.buffer[Math.floor(this.rng() * this.buffer.length)]); }
    else { if (this.pending.length === 0) return; batch = this.pending; this.pending = []; }
    const ys = batch.map(s => this.targetFor(s));
    const dOut = new Float64Array(this.nActions);
    for (let i = 0; i < batch.length; i++) {
      const s = batch[i], q = this.net.forward(s.obs.x, true, this.rng);
      dOut.fill(0); dOut[s.a] = Math.max(-1, Math.min(1, q[s.a] - ys[i]));
      this.net.backward(dOut);
    }
    this.net.step({ ...this.opt, lr: lrAt(this.opt.lr, this.lrSchedule, this.hands, this.totalHands) }, 1 / batch.length);
  }
  paramCount() { return this.net.paramCount(); }
  toJSON() { return { kind: 'val', nInputs: this.nInputs, nActions: this.nActions, hidden: this.hidden, double: this.double, replay: this.replay, targetRefresh: this.targetRefresh, opt: this.opt, batch: this.batch, gamma: this.gamma, updateEvery: this.updateEvery, lrSchedule: this.lrSchedule, totalHands: this.totalHands, net: this.net.toJSON() }; }
  static fromJSON(j, rng) { return new ValBrain({ ...j, rng, net: MLP.fromJSON(j.net) }); }
}

// ---------------------------------------------------------------- policy network
export class PolBrain {
  constructor(o) {
    const { nInputs, nActions, hidden = [16], activation = 'relu', init = 'random', dropout = 0, baseline = 'none', entropy = 0, handsPerUpdate = 10,
      opt = { type: 'adam', lr: 0.001, weightDecay: 0, clip: true }, lrSchedule = 'constant', totalHands = 100000, rng = Math.random, net = null, critic = null } = o;
    Object.assign(this, { kind: 'pol', nInputs, nActions, hidden, baseline, entropy, handsPerUpdate, opt, lrSchedule, totalHands, rng });
    this.net = net || new MLP([nInputs, ...hidden, nActions], { activation, init, dropout, rng });
    this.critic = baseline === 'critic' ? (critic || new MLP([nInputs, ...hidden, 1], { activation, init: init === 'zeros' ? 'random' : init, dropout: 0, rng })) : null;
    this.meanG = 0; this.pending = []; this.hands = 0;
  }
  scores(obs, legal) { return softmax(this.net.forward(obs.x), legal); }
  learn(steps) { for (const s of steps) this.pending.push(s); }
  onHand(hands) { this.hands = hands; if (hands % this.handsPerUpdate === 0) this.update(); }
  update() {
    const batch = this.pending; if (batch.length === 0) return; this.pending = [];
    const lr = lrAt(this.opt.lr, this.lrSchedule, this.hands, this.totalHands);
    for (const s of batch) {
      let b = 0;
      if (this.baseline === 'mean') b = this.meanG;
      else if (this.baseline === 'critic') { const v = this.critic.forward(s.obs.x, true, this.rng)[0]; b = v; this.critic.backward([Math.max(-2, Math.min(2, v - s.G))]); }
      const adv = s.G - b;
      const logits = this.net.forward(s.obs.x, true, this.rng), p = softmax(logits, s.legal);
      const d = new Float64Array(this.nActions);
      let H = 0; for (let i = 0; i < p.length; i++) if (p[i] > 1e-12) H -= p[i] * Math.log(p[i]);
      for (let i = 0; i < p.length; i++) {
        if (!s.legal[i]) continue;
        d[i] = adv * (p[i] - (i === s.a ? 1 : 0));
        if (this.entropy > 0 && p[i] > 1e-12) d[i] += this.entropy * p[i] * (Math.log(p[i]) + H);
      }
      this.net.backward(d);
      this.meanG += 0.01 * (s.G - this.meanG);
    }
    this.net.step({ ...this.opt, lr }, 1 / batch.length);
    if (this.critic) this.critic.step({ ...this.opt, lr }, 1 / batch.length);
  }
  paramCount() { return this.net.paramCount() + (this.critic ? this.critic.paramCount() : 0); }
  toJSON() { return { kind: 'pol', nInputs: this.nInputs, nActions: this.nActions, hidden: this.hidden, baseline: this.baseline, entropy: this.entropy, handsPerUpdate: this.handsPerUpdate, opt: this.opt, lrSchedule: this.lrSchedule, totalHands: this.totalHands, net: this.net.toJSON(), critic: this.critic ? this.critic.toJSON() : null }; }
  static fromJSON(j, rng) { return new PolBrain({ ...j, rng, net: MLP.fromJSON(j.net), critic: j.critic ? MLP.fromJSON(j.critic) : null }); }
}

// ---------------------------------------------------------------- memory (nearest neighbours)
export class MemBrain {
  constructor({ nActions, k = 5, capacity = 10000, forgetting = 'oldest', weighting = 'flat', rng = Math.random }) {
    Object.assign(this, { kind: 'mem', nActions, k, capacity, forgetting, weighting, rng });
    this.buckets = new Map(); this.count = 0;
  }
  scores(obs) {
    const out = new Float64Array(this.nActions);
    const b = this.buckets.get(obs.key); if (!b) return out;
    const x = obs.x, n = b.length;
    const d = new Float64Array(n);
    for (let i = 0; i < n; i++) { const y = b[i].x; let s = 0; for (let j = 0; j < x.length; j++) { const t = x[j] - y[j]; s += t * t; } d[i] = s; }
    let idx = Array.from({ length: n }, (_, i) => i);
    if (n > this.k) { idx.sort((p, q) => d[p] - d[q]); idx = idx.slice(0, this.k); }
    const sum = new Float64Array(this.nActions), w = new Float64Array(this.nActions);
    for (const i of idx) { const m = b[i], wt = this.weighting === 'inverse' ? 1 / (Math.sqrt(d[i]) + 0.05) : 1; sum[m.a] += wt * m.G; w[m.a] += wt; }
    for (let a = 0; a < this.nActions; a++) out[a] = w[a] > 0 ? sum[a] / w[a] : 0;
    return out;
  }
  learn(steps) {
    for (const s of steps) {
      const pred = this.scores(s.obs)[s.a];
      let b = this.buckets.get(s.obs.key); if (!b) { b = []; this.buckets.set(s.obs.key, b); }
      b.push({ x: s.obs.x, a: s.a, G: s.G, s: Math.abs(s.G - pred) });
      this.count++;
      if (this.count > this.capacity) {
        if (this.forgetting === 'random') b.splice(Math.floor(this.rng() * b.length), 1);
        else if (this.forgetting === 'surprise') { let mi = 0; for (let i = 1; i < b.length; i++) if (b[i].s < b[mi].s) mi = i; b.splice(mi, 1); }
        else b.shift();
        this.count--;
      }
    }
  }
  onHand() {}
  paramCount() { return this.count; }
  toJSON() { return { kind: 'mem', nActions: this.nActions, k: this.k, capacity: this.capacity, forgetting: this.forgetting, weighting: this.weighting, buckets: Array.from(this.buckets.entries()).map(([k, b]) => [k, b.map(m => [Array.from(m.x), m.a, m.G, m.s])]) }; }
  static fromJSON(j, rng) {
    const b = new MemBrain({ ...j, rng });
    for (const [k, arr] of j.buckets) { b.buckets.set(k, arr.map(m => ({ x: Float64Array.from(m[0]), a: m[1], G: m[2], s: m[3] }))); b.count += arr.length; }
    return b;
  }
}

// ---------------------------------------------------------------- evolved network (acts only; evolution runs in the trainer)
export class NetBrain {
  constructor({ nInputs, nActions, hidden = [16], activation = 'relu', init = 'random', rng = Math.random, net = null }) {
    Object.assign(this, { kind: 'evo', nInputs, nActions, hidden });
    this.net = net || new MLP([nInputs, ...hidden, nActions], { activation, init, dropout: 0, rng });
  }
  scores(obs) { return Float64Array.from(this.net.forward(obs.x)); }
  learn() {}
  onHand() {}
  paramCount() { return this.net.paramCount(); }
  toJSON() { return { kind: 'evo', nInputs: this.nInputs, nActions: this.nActions, hidden: this.hidden, net: this.net.toJSON() }; }
  static fromJSON(j) { return new NetBrain({ ...j, net: MLP.fromJSON(j.net) }); }
}

export function brainFromJSON(j, rng) {
  return { tab: TabBrain, val: ValBrain, pol: PolBrain, mem: MemBrain, evo: NetBrain }[j.kind].fromJSON(j, rng);
}
