// Turns an engine ctx into what a brain sees: a feature vector for networks and memory,
// a discrete key for lookup tables. The senses config decides which optional inputs exist.

const TOTAL_MIN = 4, TOTAL_MAX = 21;

function bankrollBin(frac, bins) {
  if (bins === 10) return Math.min(9, Math.floor(frac * 5));
  return frac < 0.5 ? 0 : frac < 1 ? 1 : frac < 2 ? 2 : 3;
}

export function makeFeaturizer(config) {
  const s = config.senses, enc = s.encoding, body = config.body;
  const oneHot = enc === 'onehot' || enc === 'both', scaled = enc === 'scaled' || enc === 'both';
  const bins = { bankroll: body.bankrollBins || 4, hands: body.handsBins || 3 };

  // ---- layout for the play vector -------------------------------------------------------
  const play = [];
  if (scaled) play.push({ n: 1, f: (c, o, i) => { o[i] = c.hand.total / 21; } });
  if (oneHot) play.push({ n: 18, f: (c, o, i) => { o[i + Math.max(0, Math.min(17, c.hand.total - TOTAL_MIN))] = 1; } });
  play.push({ n: 1, f: (c, o, i) => { o[i] = c.hand.soft ? 1 : 0; } });
  if (scaled) play.push({ n: 1, f: (c, o, i) => { o[i] = c.dealerUp / 10; } });
  if (oneHot) play.push({ n: 10, f: (c, o, i) => { o[i + c.dealerUp - 1] = 1; } });
  play.push({ n: 3, f: (c, o, i) => { o[i] = c.legal.D ? 1 : 0; o[i + 1] = c.legal.P ? 1 : 0; o[i + 2] = c.legal.R ? 1 : 0; } });
  if (s.composition) play.push({ n: 10, f: (c, o, i) => { for (const k of c.hand.cards) o[i + k.v - 1] += 0.25; } });
  if (s.nCards) {
    if (scaled) play.push({ n: 1, f: (c, o, i) => { o[i] = c.hand.nCards / 5; } });
    if (oneHot) play.push({ n: 4, f: (c, o, i) => { o[i + Math.min(3, c.hand.nCards - 2)] = 1; } });
  }
  if (s.currentBet) play.push({ n: 1, f: (c, o, i) => { o[i] = c.bet / c.maxBet; } });
  const shared = sharedParts(s);
  const playParts = play.concat(shared);
  const betParts = [{ n: 1, f: (c, o, i) => { o[i] = 1; } }].concat(shared);
  const size = parts => parts.reduce((a, p) => a + p.n, 0);
  const playSize = size(playParts), betSize = size(betParts);
  const fill = (parts, c, o) => { let i = 0; for (const p of parts) { p.f(c, o, i); i += p.n; } return o; };

  // ---- discrete keys for lookup tables and memory buckets --------------------------------
  function extraKey(c) {
    let k = '';
    if (s.trueCount) k += '|t' + Math.max(-6, Math.min(6, Math.round(trueCount(c.tray, c.decksLeft))));
    if (s.bankroll) k += '|b' + bankrollBin(c.bankroll / c.startBankroll, bins.bankroll);
    if (s.handsLeft) k += '|h' + Math.min(bins.hands - 1, Math.floor(bins.hands * c.handsRemaining / c.sessionHands));
    if (s.players) k += '|p' + c.nPlayers;
    if (s.recent) k += '|r' + c.recent.map(x => x + 1).join('');
    if (s.noise) k += '|n' + Math.floor(c.rng() * 4);
    return k;
  }
  function coreKey(c) {
    const h = c.hand;
    let k = h.total + (h.soft ? 's' : 'h') + (h.pair ? 'p' : '') + '|' + c.dealerUp + '|' + (c.legal.D ? 1 : 0) + (c.legal.P ? 1 : 0) + (c.legal.R ? 1 : 0);
    if (s.composition) { const cc = new Array(10).fill(0); for (const x of h.cards) cc[x.v - 1]++; k += '|c' + cc.join(''); }
    if (s.nCards) k += '|n' + h.nCards;
    if (s.currentBet) k += '|w' + c.bet;
    return k;
  }
  return {
    playSize, betSize, sharedSize: 1 + playSize,
    play: (c) => fill(playParts, c, new Float64Array(playSize)),
    bet: (c) => fill(betParts, c, new Float64Array(betSize)),
    // shared brain: [isPlay, play features...]; bet phase leaves hand parts at zero, fills the shared tail
    shared: (c) => {
      const o = new Float64Array(1 + playSize);
      if (c.phase === 'play') { o[0] = 1; fill(playParts, c, o.subarray(1)); }
      else { let i = 1 + size(play); for (const p of shared) { p.f(c, o, i); i += p.n; } }
      return o;
    },
    playKey: (c) => coreKey(c) + extraKey(c),
    betKey: (c) => 'bet' + extraKey(c),
    bucketKey: (c) => c.phase === 'play' ? coreKey(c) : 'bet',
  };
}

function sharedParts(s) {
  const parts = [];
  if (s.trueCount) parts.push({ n: 1, f: (c, o, i) => { o[i] = Math.max(-1, Math.min(1, trueCount(c.tray, c.decksLeft) / 10)); } });
  if (s.tray) parts.push({ n: 10, f: (c, o, i) => { const d = c.decks; for (let v = 0; v < 10; v++) o[i + v] = c.tray[v] / (v === 9 ? 16 * d : 4 * d); } });
  if (s.depth) parts.push({ n: 1, f: (c, o, i) => { o[i] = c.fractionLeft; } });
  if (s.bankroll) parts.push({ n: 1, f: (c, o, i) => { o[i] = Math.min(3, c.bankroll / c.startBankroll); } });
  if (s.handsLeft) parts.push({ n: 1, f: (c, o, i) => { o[i] = c.handsRemaining / c.sessionHands; } });
  if (s.players) parts.push({ n: 1, f: (c, o, i) => { o[i] = c.nPlayers / 6; } });
  if (s.recent) parts.push({ n: 5, f: (c, o, i) => { for (let k = 0; k < 5; k++) o[i + k] = c.recent[k]; } });
  if (s.noise) parts.push({ n: 1, f: (c, o, i) => { o[i] = c.rng(); } });
  return parts;
}

// Hi-Lo true count from the tray. Diagnostic only, never shown to a brain.
export function trueCount(tray, decksLeft) {
  const low = tray[1] + tray[2] + tray[3] + tray[4] + tray[5];
  const high = tray[9] + tray[0];
  return (low - high) / Math.max(0.5, decksLeft);
}
