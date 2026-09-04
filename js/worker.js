// Web worker: runs training in chunks so the page stays responsive.
import { createTrainer } from './trainer.js';
import { serializeModel } from './model.js';

const yieldCh = new MessageChannel(); yieldCh.port1.onmessage = () => loop();
const yieldNow = () => yieldCh.port2.postMessage(0);
let T = null, meta = null, state = 'idle', targetHands = 0, reportEvery = 0, nextReport = 0, lastReport = null, t0 = 0, handsAtStart = 0;

function snapshot() {
  const training = { hands: T.hands, generations: T.generation, curve: T.curve, seed: T.seed, history: (meta.history || []).concat([{ date: new Date().toISOString(), hands: T.hands - handsAtStart }]) };
  return serializeModel({ model: T.model, handle: meta.handle, created: meta.created, training, chart: lastReport ? lastReport.chart : null, evals: lastReport ? { byCount: lastReport.byCount } : null });
}

function loop() {
  if (state !== 'running') return;
  const chunk = T.cfg.brain === 'evo' ? T.cfg.evo.evalHands : (T.cfg.brain === 'tab' ? 5000 : 1000);
  const before = T.hands;
  try { T.step(chunk); } catch (e) { postMessage({ type: 'error', message: e.message + '\n' + e.stack }); state = 'idle'; return; }
  const elapsed = (performance.now() - t0) / 1000;
  const rate = (T.hands - handsAtStart) / Math.max(0.001, elapsed);
  postMessage({ type: 'progress', hands: T.hands, done: T.hands - handsAtStart, target: targetHands, rate, trainEV: T.trainingEV(), generation: T.generation, elapsed });
  if (T.hands >= nextReport || T.hands - handsAtStart >= targetHands) {
    nextReport = T.hands + reportEvery;
    lastReport = T.report(Math.min(2000, Math.max(500, Math.floor(targetHands / 20))));
    postMessage({ type: 'report', ...lastReport, curve: T.curve, hands: T.hands });
  }
  if (targetHands > 0 && T.hands - handsAtStart >= targetHands) { state = 'idle'; postMessage({ type: 'done', file: snapshot() }); return; }
  yieldNow();
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'start') {
    try { T = createTrainer(m.config, m.saved || null); } catch (err) { postMessage({ type: 'error', message: err.message + '\n' + err.stack }); return; }
    meta = { handle: m.handle, created: m.created, history: m.saved ? m.saved.training.history || [] : [] };
    targetHands = m.hands; handsAtStart = T.hands;
    reportEvery = Math.max(2000, Math.floor(targetHands / 25)); nextReport = T.hands + reportEvery;
    t0 = performance.now(); state = 'running'; lastReport = null;
    postMessage({ type: 'started', params: T.model.paramCount(), seed: T.seed });
    loop();
  } else if (m.type === 'pause') state = 'paused';
  else if (m.type === 'resume') { if (state === 'paused') { state = 'running'; loop(); } }
  else if (m.type === 'stop') { state = 'idle'; if (T) { lastReport = T.report(1000); postMessage({ type: 'report', ...lastReport, curve: T.curve, hands: T.hands }); postMessage({ type: 'done', file: snapshot() }); } }
};
