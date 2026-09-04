// Basic strategy for multi-deck, dealer stands on soft 17, double after split, late surrender.
// Used by the house bots and as the answer key on the strategy chart.

function hard(total, d) {
  if (total >= 17) return 'S';
  if (total === 16) return d >= 9 || d === 1 ? 'R' : d <= 6 ? 'S' : 'H';
  if (total === 15) return d === 10 ? 'R' : d <= 6 && d >= 2 ? 'S' : 'H';
  if (total >= 13) return d >= 2 && d <= 6 ? 'S' : 'H';
  if (total === 12) return d >= 4 && d <= 6 ? 'S' : 'H';
  if (total === 11) return d === 1 ? 'H' : 'D';
  if (total === 10) return d >= 2 && d <= 9 ? 'D' : 'H';
  if (total === 9) return d >= 3 && d <= 6 ? 'D' : 'H';
  return 'H';
}
function soft(total, d) {
  if (total >= 19) return 'S';
  if (total === 18) return d >= 3 && d <= 6 ? 'D' : d === 2 || d === 7 || d === 8 ? 'S' : 'H';
  if (total === 17) return d >= 3 && d <= 6 ? 'D' : 'H';
  if (total >= 15) return d >= 4 && d <= 6 ? 'D' : 'H';
  return d >= 5 && d <= 6 ? 'D' : 'H';
}
function pair(v, d) {
  if (v === 1) return 'P';
  if (v === 10) return 'S';
  if (v === 9) return (d >= 2 && d <= 6) || d === 8 || d === 9 ? 'P' : 'S';
  if (v === 8) return 'P';
  if (v === 7) return d >= 2 && d <= 7 ? 'P' : 'H';
  if (v === 6) return d >= 2 && d <= 6 ? 'P' : 'H';
  if (v === 5) return hard(10, d);
  if (v === 4) return d === 5 || d === 6 ? 'P' : 'H';
  return d >= 2 && d <= 7 ? 'P' : 'H';
}

// hand: {total, soft, pair, cards}; d: dealer up value 1..10; legal: {H,S,D,P,R}
export function bookAction(hand, d, legal) {
  let a;
  if (hand.pair && legal.P) a = pair(hand.cards[0].v, d);
  else if (hand.soft) a = soft(hand.total, d);
  else a = hard(hand.total, d);
  if (a === 'P' && !legal.P) a = hand.cards[0].v === 1 ? soft(12, d) : hand.soft ? soft(hand.total, d) : hard(hand.total, d);
  if (a === 'D' && !legal.D) a = hand.soft && hand.total === 18 ? 'S' : 'H';
  if (a === 'R' && !legal.R) a = hand.total === 16 && d >= 2 && d <= 6 ? 'S' : 'H';
  if (a === 'D' && !legal.D) a = 'H';
  return a;
}

export const bookAgent = {
  chooseBet: () => 1,
  chooseAction: (ctx) => bookAction(ctx.hand, ctx.dealerUp, ctx.legal),
};
