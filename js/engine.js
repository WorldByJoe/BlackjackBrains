// Blackjack engine: shoe, hands, dealer, one table of any number of seats.
// Agents plug in with chooseBet(ctx) and chooseAction(ctx); optional onHandEnd / onRoundEnd callbacks.

export const RULES = {
  decks: 5, penetration: 0.75, dealerHitsSoft17: false, blackjackPays: 1.5, peek: true,
  doubleAfterSplit: true, maxSplits: 3, resplitAces: false, surrender: true, autoStand21: true,
};
export const TABLE = { bankroll: 100, minBet: 1, maxBet: 25, ladder: [1, 2, 5, 10, 25], sessionHands: 300, seats: 6 };

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomSeed() { return (Math.random() * 4294967296) >>> 0; }

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];

export class Shoe {
  // mode: 'shoe' (reshuffle at penetration), 'single' (fresh deck every round), 'infinite' (draw with replacement)
  constructor({ mode = 'shoe', decks = 5, penetration = 0.75, rng }) {
    this.mode = mode;
    this.decks = mode === 'shoe' ? decks : 1;
    this.penetration = penetration;
    this.rng = rng || mulberry32(randomSeed());
    this.cards = [];
    this.pos = 0;
    this.tray = new Int32Array(10);
    this.shuffles = 0;
    this.reshuffle();
  }
  reshuffle() {
    const cards = [];
    for (let d = 0; d < this.decks; d++)
      for (let s = 0; s < 4; s++)
        for (let r = 0; r < 13; r++) cards.push({ v: r === 0 ? 1 : Math.min(10, r + 1), r: RANKS[r], s: SUITS[s] });
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(this.rng() * (i + 1));
      const t = cards[i]; cards[i] = cards[j]; cards[j] = t;
    }
    this.cards = cards; this.pos = 0; this.tray.fill(0); this.shuffles++;
  }
  needsShuffle() {
    if (this.mode !== 'shoe') return true;
    return this.pos >= this.cards.length * this.penetration;
  }
  drawHidden() {
    if (this.mode === 'infinite') return this.cards[Math.floor(this.rng() * this.cards.length)];
    if (this.pos >= this.cards.length) this.reshuffle();
    return this.cards[this.pos++];
  }
  reveal(card) { this.tray[card.v - 1]++; }
  draw() { const c = this.drawHidden(); this.reveal(c); return c; }
  cardsLeft() { return this.mode === 'infinite' ? this.cards.length : this.cards.length - this.pos; }
  fractionLeft() { return this.cardsLeft() / this.cards.length; }
  decksLeft() { return this.cardsLeft() / 52; }
}

export function evalHand(cards) {
  let t = 0, aces = 0;
  for (const c of cards) { t += c.v; if (c.v === 1) aces++; }
  let soft = false;
  if (aces > 0 && t + 10 <= 21) { t += 10; soft = true; }
  return { total: t, soft, bust: t > 21 };
}

export const ACTIONS = ['H', 'S', 'D', 'P', 'R'];

export class Table {
  // players: [{ agent, bankroll, name }]
  constructor({ rules = RULES, table = TABLE, shoe, players, rng }) {
    this.rules = rules; this.table = table; this.shoe = shoe; this.rng = rng || shoe.rng;
    this.players = players.map((p, i) => ({
      agent: p.agent, name: p.name || `Seat ${i + 1}`, bankroll: p.bankroll ?? table.bankroll,
      startBankroll: p.bankroll ?? table.bankroll, seat: i, sitOut: false, recent: [0, 0, 0, 0, 0], hands: [], roundBet: 0,
    }));
    this.round = 0;
  }
  activePlayers() { return this.players.filter(p => !p.sitOut); }
  ctxBase(p, sessionHands) {
    const s = this.shoe;
    return {
      seat: p.seat, nPlayers: this.players.length, bankroll: p.bankroll, startBankroll: p.startBankroll,
      round: this.round, handsRemaining: sessionHands - this.round, sessionHands,
      tray: s.tray, cardsLeft: s.cardsLeft(), fractionLeft: s.fractionLeft(), decksLeft: s.decksLeft(), decks: s.decks,
      recent: p.recent, rng: this.rng, minBet: this.table.minBet, maxBet: this.table.maxBet,
    };
  }
  playRound(sessionHands = this.table.sessionHands) {
    const { rules, table, shoe } = this;
    const shuffled = shoe.needsShuffle();
    if (shuffled) shoe.reshuffle();
    const rec = { round: this.round, shuffled, players: [], dealer: null };
    const active = [];
    for (const p of this.players) {
      p.hands = [];
      if (p.sitOut || p.bankroll < table.minBet) { p.sitOut = true; continue; }
      const ctx = this.ctxBase(p, sessionHands); ctx.phase = 'bet';
      let bet = Math.round(p.agent.chooseBet(ctx));
      if (!(bet >= table.minBet)) bet = table.minBet;
      bet = Math.min(bet, table.maxBet, Math.floor(p.bankroll));
      p.bankroll -= bet; p.roundBet = bet;
      p.hands = [{ cards: [], bet, fromSplit: false, splitAces: false, doubled: false, outcome: null, net: 0, actions: [] }];
      active.push(p);
    }
    if (active.length === 0) { this.round++; return rec; }
    for (const p of active) p.hands[0].cards.push(shoe.draw());
    const up = shoe.draw();
    for (const p of active) p.hands[0].cards.push(shoe.draw());
    const hole = shoe.drawHidden();
    const dealer = [up, hole];
    const dealerBJ = (up.v === 1 && hole.v === 10) || (up.v === 10 && hole.v === 1);
    let anyLive = false;
    if (rules.peek && dealerBJ) {
      shoe.reveal(hole);
      for (const p of active) {
        const h = p.hands[0];
        const nat = evalHand(h.cards).total === 21;
        if (nat) { p.bankroll += h.bet; h.outcome = 'push'; h.net = 0; }
        else { h.outcome = 'lose'; h.net = -h.bet; }
      }
    } else {
      for (const p of active) {
        const h0 = p.hands[0];
        if (evalHand(h0.cards).total === 21) {
          p.bankroll += h0.bet * (1 + rules.blackjackPays);
          h0.outcome = 'blackjack'; h0.net = h0.bet * rules.blackjackPays;
          continue;
        }
        this.playHands(p, up.v, sessionHands);
        for (const h of p.hands) if (h.outcome === null) anyLive = true;
      }
      shoe.reveal(hole);
      if (anyLive) {
        for (;;) {
          const ev = evalHand(dealer);
          if (ev.total > 17 || (ev.total === 17 && !(ev.soft && rules.dealerHitsSoft17))) break;
          dealer.push(shoe.draw());
        }
      }
      const dev = evalHand(dealer);
      for (const p of active) for (const h of p.hands) {
        if (h.outcome !== null) continue;
        const t = evalHand(h.cards).total;
        if (dev.bust || t > dev.total) { p.bankroll += 2 * h.bet; h.outcome = 'win'; h.net = h.bet; }
        else if (t === dev.total) { p.bankroll += h.bet; h.outcome = 'push'; h.net = 0; }
        else { h.outcome = 'lose'; h.net = -h.bet; }
      }
    }
    const dev = evalHand(dealer);
    rec.dealer = { cards: dealer, total: dev.total, bust: dev.bust, blackjack: dealerBJ };
    for (const p of active) {
      let net = 0;
      for (const h of p.hands) { net += h.net; if (p.agent.onHandEnd) p.agent.onHandEnd(h, h.net); }
      p.recent = p.recent.slice(1).concat([Math.sign(net)]);
      if (p.agent.onRoundEnd) p.agent.onRoundEnd(net, p.bankroll);
      if (p.bankroll < table.minBet) p.sitOut = true;
      rec.players.push({ seat: p.seat, name: p.name, bet: p.roundBet, hands: p.hands, net, bankroll: p.bankroll, broke: p.sitOut });
    }
    this.round++;
    return rec;
  }
  playHands(p, dealerUp, sessionHands) {
    const { rules, shoe } = this;
    let i = 0;
    while (i < p.hands.length) {
      const h = p.hands[i];
      if (h.splitAces) { i++; continue; }
      for (;;) {
        const ev = evalHand(h.cards);
        if (ev.bust) { h.outcome = 'bust'; h.net = -h.bet; break; }
        if (ev.total === 21 && rules.autoStand21) break;
        const two = h.cards.length === 2;
        const pair = two && h.cards[0].v === h.cards[1].v;
        const legal = {
          H: true, S: true,
          D: two && p.bankroll >= h.bet && (!h.fromSplit || rules.doubleAfterSplit),
          P: pair && p.hands.length < 1 + rules.maxSplits && p.bankroll >= h.bet && !(h.cards[0].v === 1 && h.fromSplit && !rules.resplitAces),
          R: rules.surrender && two && !h.fromSplit,
        };
        const ctx = this.ctxBase(p, sessionHands);
        ctx.phase = 'play';
        ctx.hand = { cards: h.cards, total: ev.total, soft: ev.soft, pair, nCards: h.cards.length, fromSplit: h.fromSplit };
        ctx.dealerUp = dealerUp; ctx.legal = legal; ctx.bet = h.bet; ctx.handIndex = i; ctx.handRef = h;
        let a = p.agent.chooseAction(ctx);
        if (!legal[a]) a = 'S';
        h.actions.push({ a, total: ev.total, soft: ev.soft, pair, dealerUp, legal: { ...legal } });
        if (a === 'H') { h.cards.push(shoe.draw()); continue; }
        if (a === 'S') break;
        if (a === 'D') {
          p.bankroll -= h.bet; h.bet *= 2; h.doubled = true; h.cards.push(shoe.draw());
          const e2 = evalHand(h.cards);
          if (e2.bust) { h.outcome = 'bust'; h.net = -h.bet; }
          break;
        }
        if (a === 'R') { h.outcome = 'surrender'; h.net = -h.bet / 2; p.bankroll += h.bet / 2; break; }
        if (a === 'P') {
          p.bankroll -= h.bet;
          const c2 = h.cards.pop();
          const nh = { cards: [c2], bet: h.bet, fromSplit: true, splitAces: false, doubled: false, outcome: null, net: 0, actions: [] };
          h.fromSplit = true;
          h.cards.push(shoe.draw()); nh.cards.push(shoe.draw());
          p.hands.splice(i + 1, 0, nh);
          if (c2.v === 1) { h.splitAces = true; nh.splitAces = true; break; }
          continue;
        }
        break;
      }
      i++;
    }
  }
}

// Plays one session: up to `hands` rounds, stopping early when every seat is broke.
export function runSession({ rules = RULES, table = TABLE, shoe, players, hands = table.sessionHands, onRound = null, rng }) {
  const t = new Table({ rules, table, shoe, players, rng });
  let played = 0;
  for (let r = 0; r < hands; r++) {
    if (t.activePlayers().length === 0) break;
    const rec = t.playRound(hands);
    played++;
    if (onRound && onRound(rec, t) === false) break;
  }
  return { played, players: t.players.map(p => ({ name: p.name, bankroll: p.bankroll, broke: p.sitOut, start: p.startBankroll })) };
}
