// Web worker: runs training in chunks so the page stays responsive.
// Stops on a hand target, a wall-clock limit, or a manual stop, whichever comes first.
import { createTrainer } from './trainer.js';
import { serializeModel } from './model.js';

const yieldCh = new MessageChannel(); yieldCh.port1.onmessage = () => loop();
const yieldNow = () => yieldCh.port2.postMessage(0);
let T = null, meta = null, state = 'idle';
let targetHands = 0, maxSeconds = 0, t0 = 0, handsAtStart = 0, lastReportAt = 0, lastReport = null;

function snapshot() {
  const training = { hands: T.hands, generations: T.generation, curve: T.curve, seed: T.seed, history: (meta.history || []).concat([{ date: new Date().toISOString(), hands: T.hands - handsAtStart }]) };
  return serializeModel({ model: T.model, handle: meta.handle, created: meta.created, training, chart: lastReport ? lastReport.chart : null, evals: lastReport ? { byCount: lastReport.byCount } : null });
}
function makeReport() {
  const evalHands = targetHands > 0 ? Math.min(2000, Math.max(600, Math.floor(targetHands / 20))) : 1500;
  lastReport = T.report(evalHands);
  postMessage({ type: 'report', ...lastReport, curve: T.curve, hands: T.hands });
  lastReportAt = performance.now();
}
function done() { state = 'idle'; if (lastReportAt === 0 || performance.now() - lastReportAt > 200) makeReport(); postMessage({ type: 'done', file: snapshot() }); }

function loop() {
  if (state !== 'running') return;
  const chunk = T.cfg.brain === 'evo' ? T.cfg.evo.evalHands : (T.cfg.brain === 'tab' ? 5000 : 1000);
  try { T.step(chunk); } catch (e) { postMessage({ type: 'error', message: e.message + '\n' + e.stack }); state = 'idle'; return; }
  const now = performance.now(), elapsed = (now - t0) / 1000, doneHands = T.hands - handsAtStart;
  const rate = doneHands / Math.max(0.001, elapsed);
  const frac = maxSeconds > 0 ? elapsed / maxSeconds : targetHands > 0 ? doneHands / targetHands : 0;
  postMessage({ type: 'progress', hands: T.hands, done: doneHands, target: targetHands, maxSeconds, frac, rate, trainEV: T.trainingEV(), generation: T.generation, elapsed });
  const finished = (targetHands > 0 && doneHands >= targetHands) || (maxSeconds > 0 && elapsed >= maxSeconds);
  if (finished) { done(); return; }
  if (now - lastReportAt > 1400) makeReport();
  yieldNow();
}

onmessage = (e) => {
  const m = e.data;
  if (m.type === 'start') {
    try { T = createTrainer(m.config, m.saved || null); } catch (err) { postMessage({ type: 'error', message: err.message + '\n' + err.stack }); return; }
    meta = { handle: m.handle, created: m.created, history: m.saved ? m.saved.training.history || [] : [] };
    targetHands = m.hands || 0; maxSeconds = m.maxSeconds || 0; handsAtStart = T.hands;
    t0 = performance.now(); lastReportAt = 0; state = 'running'; lastReport = null;
    postMessage({ type: 'started', params: T.model.paramCount(), seed: T.seed });
    loop();
  } else if (m.type === 'pause') state = 'paused';
  else if (m.type === 'resume') { if (state === 'paused') { state = 'running'; loop(); } }
  else if (m.type === 'stop') { if (state !== 'idle' && T) { state = 'idle'; done(); } }
};
