// A small fully connected network with manual backprop and four optimizers. No dependencies.

function gauss(rng) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export class MLP {
  constructor(sizes, { activation = 'relu', init = 'random', dropout = 0, rng = Math.random } = {}) {
    this.sizes = sizes.slice(); this.activation = activation; this.dropout = dropout;
    this.W = []; this.b = []; this.gW = []; this.gB = [];
    for (let l = 0; l < sizes.length - 1; l++) {
      const nin = sizes[l], nout = sizes[l + 1];
      const W = new Float64Array(nin * nout), b = new Float64Array(nout);
      const lim = Math.sqrt(6 / (nin + nout));
      for (let i = 0; i < W.length; i++) W[i] = init === 'zeros' ? 0 : init === 'xavier' ? (rng() * 2 - 1) * lim : gauss(rng) * 0.1;
      this.W.push(W); this.b.push(b); this.gW.push(new Float64Array(nin * nout)); this.gB.push(new Float64Array(nout));
    }
    this.a = sizes.map(n => new Float64Array(n));   // activations per layer
    this.z = sizes.map(n => new Float64Array(n));   // pre-activations
    this.mask = sizes.map(n => new Float64Array(n).fill(1));
    this.d = sizes.map(n => new Float64Array(n));
    this.opt = null; this.t = 0;
  }
  paramCount() { return this.W.reduce((s, w) => s + w.length, 0) + this.b.reduce((s, b) => s + b.length, 0); }
  forward(x, train = false, rng = Math.random) {
    const L = this.sizes.length - 1, act = this.activation, drop = train && this.dropout > 0, dr = this.dropout;
    this.a[0].set(x);
    for (let l = 0; l < L; l++) {
      const nin = this.sizes[l], nout = this.sizes[l + 1], W = this.W[l], b = this.b[l], ain = this.a[l], z = this.z[l + 1], out = this.a[l + 1], mask = this.mask[l + 1];
      const last = l === L - 1;
      for (let j = 0; j < nout; j++) {
        let s = b[j]; const off = j * nin;
        for (let i = 0; i < nin; i++) s += W[off + i] * ain[i];
        z[j] = s;
        if (last) { out[j] = s; continue; }
        let y;
        if (act === 'relu') y = s > 0 ? s : 0; else if (act === 'lrelu') y = s > 0 ? s : 0.01 * s; else if (act === 'tanh') y = Math.tanh(s); else y = 1 / (1 + Math.exp(-s));
        if (drop) { const keep = rng() >= dr; mask[j] = keep ? 1 / (1 - dr) : 0; y *= mask[j]; } else mask[j] = 1;
        out[j] = y;
      }
    }
    return this.a[L];
  }
  // dOut: gradient of the loss with respect to the output. Accumulates into gW/gB.
  backward(dOut) {
    const L = this.sizes.length - 1, act = this.activation;
    let delta = this.d[L]; delta.set(dOut);
    for (let l = L - 1; l >= 0; l--) {
      const nin = this.sizes[l], nout = this.sizes[l + 1], W = this.W[l], gW = this.gW[l], gB = this.gB[l], ain = this.a[l];
      for (let j = 0; j < nout; j++) { const d = delta[j]; if (d === 0) continue; const off = j * nin; gB[j] += d; for (let i = 0; i < nin; i++) gW[off + i] += d * ain[i]; }
      if (l > 0) {
        const prev = this.d[l], zl = this.z[l], m = this.mask[l];
        for (let i = 0; i < nin; i++) {
          let s = 0; for (let j = 0; j < nout; j++) s += W[j * nin + i] * delta[j];
          const zi = zl[i]; let dd;
          if (act === 'relu') dd = zi > 0 ? 1 : 0; else if (act === 'lrelu') dd = zi > 0 ? 1 : 0.01; else if (act === 'tanh') { const t = Math.tanh(zi); dd = 1 - t * t; } else { const g = 1 / (1 + Math.exp(-zi)); dd = g * (1 - g); }
          prev[i] = s * dd * m[i];
        }
        delta = prev;
      }
    }
  }
  zeroGrad() { for (const g of this.gW) g.fill(0); for (const g of this.gB) g.fill(0); }
  // opt: {type:'sgd'|'momentum'|'rmsprop'|'adam', lr, weightDecay, clip}
  step(opt, scale = 1) {
    if (!this.opt || this.opt.type !== opt.type) {
      this.opt = { type: opt.type, m: this.W.map(w => new Float64Array(w.length)), v: this.W.map(w => new Float64Array(w.length)), mb: this.b.map(b => new Float64Array(b.length)), vb: this.b.map(b => new Float64Array(b.length)) };
      this.t = 0;
    }
    this.t++;
    let norm = 0;
    if (opt.clip) { for (const g of this.gW) for (let i = 0; i < g.length; i++) norm += g[i] * g[i]; for (const g of this.gB) for (let i = 0; i < g.length; i++) norm += g[i] * g[i]; norm = Math.sqrt(norm) * scale; }
    const cs = opt.clip && norm > 5 ? 5 / norm : 1;
    const upd = (P, G, m, v) => {
      for (let i = 0; i < P.length; i++) {
        let g = G[i] * scale * cs + (opt.weightDecay || 0) * P[i];
        if (opt.type === 'sgd') P[i] -= opt.lr * g;
        else if (opt.type === 'momentum') { m[i] = 0.9 * m[i] + g; P[i] -= opt.lr * m[i]; }
        else if (opt.type === 'rmsprop') { v[i] = 0.99 * v[i] + 0.01 * g * g; P[i] -= opt.lr * g / (Math.sqrt(v[i]) + 1e-8); }
        else { m[i] = 0.9 * m[i] + 0.1 * g; v[i] = 0.999 * v[i] + 0.001 * g * g; const mh = m[i] / (1 - Math.pow(0.9, this.t)), vh = v[i] / (1 - Math.pow(0.999, this.t)); P[i] -= opt.lr * mh / (Math.sqrt(vh) + 1e-8); }
      }
    };
    for (let l = 0; l < this.W.length; l++) { upd(this.W[l], this.gW[l], this.opt.m[l], this.opt.v[l]); upd(this.b[l], this.gB[l], this.opt.mb[l], this.opt.vb[l]); }
    this.zeroGrad();
  }
  copyFrom(other) { for (let l = 0; l < this.W.length; l++) { this.W[l].set(other.W[l]); this.b[l].set(other.b[l]); } }
  clone() { const c = new MLP(this.sizes, { activation: this.activation, init: 'zeros', dropout: this.dropout }); c.copyFrom(this); return c; }
  mutate(rng, rate, size) {
    for (const arr of this.W.concat(this.b)) for (let i = 0; i < arr.length; i++) if (rng() < rate) arr[i] += gauss(rng) * size;
  }
  static crossover(a, b, rng, mode) {
    const c = a.clone();
    if (mode === 'none') return c;
    for (let l = 0; l < c.W.length; l++) {
      for (const [arr, src] of [[c.W[l], b.W[l]], [c.b[l], b.b[l]]]) {
        if (mode === 'uniform') { for (let i = 0; i < arr.length; i++) if (rng() < 0.5) arr[i] = src[i]; }
        else { const cut = Math.floor(rng() * arr.length); for (let i = cut; i < arr.length; i++) arr[i] = src[i]; }
      }
    }
    return c;
  }
  toJSON() { return { sizes: this.sizes, activation: this.activation, dropout: this.dropout, W: this.W.map(w => Array.from(w)), b: this.b.map(b => Array.from(b)) }; }
  static fromJSON(j) {
    const m = new MLP(j.sizes, { activation: j.activation, init: 'zeros', dropout: j.dropout || 0 });
    for (let l = 0; l < m.W.length; l++) { m.W[l].set(j.W[l]); m.b[l].set(j.b[l]); }
    return m;
  }
}

export function softmax(logits, legal, temperature = 1) {
  const n = logits.length, p = new Float64Array(n);
  let mx = -Infinity;
  for (let i = 0; i < n; i++) if (legal[i]) mx = Math.max(mx, logits[i] / temperature);
  let s = 0;
  for (let i = 0; i < n; i++) if (legal[i]) { p[i] = Math.exp(logits[i] / temperature - mx); s += p[i]; }
  for (let i = 0; i < n; i++) p[i] /= s;
  return p;
}
export function sample(p, rng) { let r = rng(), acc = 0; for (let i = 0; i < p.length; i++) { acc += p[i]; if (r < acc) return i; } for (let i = p.length - 1; i >= 0; i--) if (p[i] > 0) return i; return 0; }
export function argmaxLegal(scores, legal) { let best = -1, bv = -Infinity; for (let i = 0; i < scores.length; i++) if (legal[i] && scores[i] > bv) { bv = scores[i]; best = i; } return best; }
