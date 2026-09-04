// The option menu: every control on the builder page, its tooltip, when it applies, the recipes, and what cannot combine.

export const BRAINS = {
  tab: { label: 'Lookup table', tag: 'TAB' },
  val: { label: 'Value network', tag: 'VAL' },
  pol: { label: 'Policy network', tag: 'POL' },
  evo: { label: 'Evolution', tag: 'EVO' },
  mem: { label: 'Memory', tag: 'MEM' },
};
const NET = ['val', 'pol', 'evo'];
const LEARNS = ['tab', 'val', 'pol', 'mem'];

export const LAYERS = [
  { id: 'brain', title: 'Brain', blurb: 'The learning family. This choice most changes what the model is.' },
  { id: 'senses', title: 'Senses', blurb: 'What the model is shown. Two moments of decision: the bet before any cards, and the play during the hand. Every extra input multiplies what must be learned.' },
  { id: 'actions', title: 'Actions', blurb: 'What the model may do. Fewer moves train faster and show what a small vocabulary costs.' },
  { id: 'body', title: 'Body', blurb: 'The shape and size of the brain. Parameter count sets the weight class.' },
  { id: 'goal', title: 'Goal', blurb: 'What the model is rewarded for. Same brain, different goal, different gambler.' },
  { id: 'school', title: 'School', blurb: 'Where the model plays its training hands. Sent to a different school, the same model learns a different game.' },
  { id: 'teacher', title: 'Teacher', blurb: 'How the learning is paced. Most likely place to make a model that looks fine and plays terribly.' },
];

const C = (v, label, tip) => ({ v, label, tip });

export const OPTIONS = [
  // ---------------------------------------------------------------- brain
  { id: 'brain', layer: 'brain', path: 'brain', label: 'Learning family', type: 'radio', choices: [
    C('tab', 'Lookup table', 'One row per situation, one column per move; each cell is a running estimate of how well that move has paid. Nothing hidden, every cell printable. Learns the book strategy and nothing more, because it cannot hold the discard tray.'),
    C('val', 'Value network', 'A neural network guesses how good each move is, so situations that look alike share what they learn. The only brain that can discover card counting, because it can take the discard tray as input.'),
    C('pol', 'Policy network', 'The network outputs the move itself as probabilities and is nudged toward whatever preceded good outcomes. It never estimates value; it just gets more confident.'),
    C('evo', 'Evolution', 'A population of random networks plays a stretch of hands; the best reproduce with mutation, the rest are discarded. No calculus, no reward per hand, only survival of the richest.'),
    C('mem', 'Memory', 'Stores every situation it has been in with what happened, and decides by averaging the k most similar memories. Never generalizes, never forgets until full.'),
  ], tip: 'Five ways to learn the same game. Hover each for what it teaches.' },
  { id: 'tab.rule', layer: 'brain', path: 'tab.rule', only: ['tab'], label: 'Update rule', type: 'select', choices: [
    C('q', 'Q-learning', 'After each move, nudge the cell toward the reward plus the best cell in the next situation. Learns the best possible play even while exploring badly.'),
    C('sarsa', 'SARSA', 'Like Q-learning, but nudges toward the move it actually took next, mistakes included. Learns a more cautious strategy while it is still exploring.'),
    C('mc', 'Monte Carlo', 'Waits until the hand is over, then nudges every cell it visited toward what actually happened. Simple and unbiased, but noisier.'),
  ], tip: 'How a cell is updated after experience.' },
  { id: 'tab.init', layer: 'brain', path: 'tab.init', only: ['tab'], label: 'Starting values', type: 'select', choices: [
    C('zero', 'Zero', 'Every move starts out looking neutral.'),
    C('optimistic', 'Optimistic (+1)', 'Every move starts out looking wonderful, so the table tries everything at least once before believing anything. A built-in reason to explore.'),
    C('pessimistic', 'Pessimistic (−1)', 'Every move starts out looking terrible. The first move that works gets repeated; the rest may never be tried.'),
    C('random', 'Random', 'Arbitrary starting opinions. Watch how long they take to wash out.'),
  ], tip: 'What every cell holds before any experience.' },
  { id: 'tab.step', layer: 'brain', path: 'tab.step', only: ['tab'], label: 'Step size', type: 'select', choices: [
    C('fixed', 'Fixed', 'Every lesson moves the cell by the same fraction, set by the learning rate. Never fully settles, adapts if the world changes.'),
    C('decay', 'Shrinking with visits', 'The nth visit moves the cell by 1/n, so the cell becomes a plain average of everything seen. Settles exactly, but stops adapting.'),
  ], tip: 'How far each lesson moves a cell.' },
  { id: 'val.double', layer: 'brain', path: 'val.double', only: ['val'], label: 'Double estimator', type: 'toggle', tip: 'Use one network to pick the best next move and a second, slower copy to score it. Curbs the habit of over-rating moves the network has rarely tried.' },
  { id: 'val.replay', layer: 'brain', path: 'val.replay', only: ['val'], label: 'Experience replay', type: 'select', choices: [
    C(0, 'Off', 'Learn only from the latest hands, then forget them.'),
    C(1000, '1,000 memories', 'Keep a small memory of past decisions and re-learn from random samples of it.'),
    C(10000, '10,000 memories', 'A medium memory. Old and new hands are mixed, which steadies learning.'),
    C(100000, '100,000 memories', 'A long memory. Learning is steadiest, but old mistakes linger in the mix.'),
  ], tip: 'Instead of learning only from the hand just played, keep a memory of old decisions and re-learn from a shuffled sample of it.' },
  { id: 'val.targetRefresh', layer: 'brain', path: 'val.targetRefresh', only: ['val'], label: 'Target refresh', type: 'select', choices: [
    C(100, 'Every 100 hands', 'The yardstick moves often. Faster, twitchier.'),
    C(1000, 'Every 1,000 hands', 'A steady middle.'),
    C(10000, 'Every 10,000 hands', 'The yardstick barely moves. Very stable, very slow.'),
  ], tip: 'The network learns against a frozen copy of itself, refreshed now and then. Refreshing too often makes it chase its own tail.' },
  { id: 'pol.baseline', layer: 'brain', path: 'pol.baseline', only: ['pol'], label: 'Baseline', type: 'select', choices: [
    C('none', 'None', 'Every outcome pushes the policy. Noisy, because winning a hand you were going to win anyway still looks like praise.'),
    C('mean', 'Running average', 'Compare each outcome with the average outcome, so only better-than-usual results push the policy up.'),
    C('critic', 'Learned critic', 'A second network learns to predict the outcome of each situation, so the policy is pushed only by surprises. This is the actor-critic design.'),
  ], tip: 'What an outcome is compared against before it counts as good or bad news.' },
  { id: 'pol.entropy', layer: 'brain', path: 'pol.entropy', only: ['pol'], label: 'Entropy bonus', type: 'select', choices: [
    C(0, '0', 'No bonus. The policy may commit early and never reconsider.'),
    C(0.01, '0.01', 'A small nudge to keep options open.'),
    C(0.05, '0.05', 'A firm nudge. Stays undecided longer.'),
    C(0.1, '0.1', 'A strong nudge. May never fully commit.'),
  ], tip: 'A small reward for staying undecided, so the policy does not commit to a move before it has seen enough.' },
  { id: 'pol.handsPerUpdate', layer: 'brain', path: 'pol.handsPerUpdate', only: ['pol'], label: 'Hands per update', type: 'select', choices: [
    C(1, '1', 'Update after every hand. Fast reacting, very noisy.'), C(10, '10', 'A batch of ten hands per update.'), C(100, '100', 'A hundred hands per update. Smoother, slower.'), C(1000, '1,000', 'A thousand hands per update. Very smooth, very slow.'),
  ], tip: 'How many hands are gathered before the policy is nudged.' },
  { id: 'evo.pop', layer: 'brain', path: 'evo.pop', only: ['evo'], label: 'Population', type: 'select', choices: [
    C(1, '1 (hill climber)', 'One network, mutated each generation, kept only if it does better. The simplest search there is.'),
    C(10, '10', 'A small population. Fast generations, little diversity.'), C(50, '50', 'A healthy population.'), C(200, '200', 'A large population. Slow generations, lots of diversity.'),
  ], tip: 'How many networks are alive at once.' },
  { id: 'evo.selection', layer: 'brain', path: 'evo.selection', only: ['evo'], label: 'Selection', type: 'select', choices: [
    C('top', 'Top half', 'Parents are drawn from the richest half of the population.'),
    C('tournament', 'Tournament of 3', 'Pick three at random, the richest of them becomes a parent. Gentle pressure.'),
    C('roulette', 'Fitness-proportional', 'Everyone can reproduce, in proportion to how much they won. Weak pressure, keeps diversity.'),
  ], tip: 'Who gets to reproduce.' },
  { id: 'evo.mutRate', layer: 'brain', path: 'evo.mutRate', only: ['evo'], label: 'Mutation rate', type: 'select', choices: [C(0.01, '1%', 'One weight in a hundred changes.'), C(0.05, '5%', 'One weight in twenty changes.'), C(0.2, '20%', 'One weight in five changes. Children barely resemble their parents.')], tip: 'What fraction of a child\'s weights are altered.' },
  { id: 'evo.mutSize', layer: 'brain', path: 'evo.mutSize', only: ['evo'], label: 'Mutation size', type: 'select', choices: [C('small', 'Small', 'Fine adjustments.'), C('medium', 'Medium', 'Noticeable changes.'), C('large', 'Large', 'Wild swings.')], tip: 'How far an altered weight moves.' },
  { id: 'evo.crossover', layer: 'brain', path: 'evo.crossover', only: ['evo'], label: 'Crossover', type: 'select', choices: [C('none', 'None', 'Children are mutated copies of one parent.'), C('uniform', 'Uniform', 'Each weight comes from either parent at random.'), C('onepoint', 'One-point', 'The first part of the weights from one parent, the rest from the other.')], tip: 'How two parents combine into a child.' },
  { id: 'evo.elites', layer: 'brain', path: 'evo.elites', only: ['evo'], label: 'Elites kept', type: 'select', choices: [C(0, '0', 'Nobody survives unchanged. The best can be lost.'), C(1, '1', 'The champion survives unchanged.'), C(5, '5', 'The five best survive unchanged.')], tip: 'How many of the best survive into the next generation untouched.' },
  { id: 'evo.evalHands', layer: 'brain', path: 'evo.evalHands', only: ['evo'], label: 'Hands per fitness test', type: 'select', choices: [C(100, '100', 'A short test. Fast, but luck dominates.'), C(1000, '1,000', 'A fair test.'), C(10000, '10,000', 'A long test. Slow generations, honest scores.')], tip: 'How many hands each network plays to earn its score. Short tests are noisy, long ones are slow.' },
  { id: 'mem.k', layer: 'brain', path: 'mem.k', only: ['mem'], label: 'Neighbours (k)', type: 'select', choices: [C(1, '1', 'Copy the single most similar memory. Jumpy.'), C(5, '5', 'Average five.'), C(20, '20', 'Average twenty. Smooth.'), C(50, '50', 'Average fifty. Very smooth, slow to notice differences.')], tip: 'How many similar memories are averaged to make a decision.' },
  { id: 'mem.capacity', layer: 'brain', path: 'mem.capacity', only: ['mem'], label: 'Capacity', type: 'select', choices: [C(1000, '1,000', 'A small memory.'), C(10000, '10,000', 'A medium memory.'), C(100000, '100,000', 'A large memory. Slower decisions.')], tip: 'How many memories fit before forgetting begins. Also the parameter count.' },
  { id: 'mem.forgetting', layer: 'brain', path: 'mem.forgetting', only: ['mem'], label: 'Forgetting', type: 'select', choices: [C('oldest', 'Oldest first', 'Drop the oldest memory.'), C('random', 'Random', 'Drop one at random.'), C('surprise', 'Keep the surprising ones', 'Drop the memory that was most predictable when it was stored.')], tip: 'Which memory is dropped when the memory is full.' },
  { id: 'mem.weighting', layer: 'brain', path: 'mem.weighting', only: ['mem'], label: 'Weighting', type: 'select', choices: [C('flat', 'Flat', 'Every neighbour counts equally.'), C('inverse', 'Closer counts more', 'Nearer memories carry more weight.')], tip: 'Whether nearer memories count more.' },

  // ---------------------------------------------------------------- senses
  { id: 'senses.composition', layer: 'senses', path: 'senses.composition', label: 'Hand composition', type: 'toggle', tip: 'Show how many of each rank are in the hand, not just the total. Lets composition-dependent play emerge. Multiplies a lookup table about twentyfold.' },
  { id: 'senses.nCards', layer: 'senses', path: 'senses.nCards', label: 'Cards in hand', type: 'toggle', tip: 'Two cards or five. Matters mostly for doubling, which is only offered on two.' },
  { id: 'senses.tray', layer: 'senses', path: 'senses.tray', label: 'Discard tray', type: 'toggle', tip: 'Ten numbers: how many aces, twos, and so on through tens have been seen since the last shuffle. The doorway to counting. Nobody tells the model which ranks matter.', disabled: cfg => cfg.brain === 'tab' ? 'A lookup table cannot hold the tray: ten more inputs would multiply it into billions of rows. This is why networks exist.' : null },
  { id: 'senses.depth', layer: 'senses', path: 'senses.depth', label: 'Shoe depth', type: 'toggle', tip: 'Fraction of the shoe still to be dealt. A tray only means something relative to what is left.' },
  { id: 'senses.bankroll', layer: 'senses', path: 'senses.bankroll', label: 'Bankroll', type: 'toggle', tip: 'Chips in hand as a fraction of the starting stack. Needed for the survive and target goals to make sense. Binned for a lookup table.' },
  { id: 'senses.handsLeft', layer: 'senses', path: 'senses.handsLeft', label: 'Hands remaining', type: 'toggle', tip: 'How close the session is to its end. Lets a model play the clock.' },
  { id: 'senses.currentBet', layer: 'senses', path: 'senses.currentBet', label: 'Current bet', type: 'toggle', tip: 'So the play decision knows what is at stake on this hand.' },
  { id: 'senses.players', layer: 'senses', path: 'senses.players', label: 'Players at the table', type: 'toggle', tip: 'Company changes how fast the tray fills.' },
  { id: 'senses.recent', layer: 'senses', path: 'senses.recent', label: 'Recent outcomes', trap: true, type: 'toggle', tip: 'The last five wins and losses. Carries no real information. A model can learn a hot-hand superstition from noise.' },
  { id: 'senses.noise', layer: 'senses', path: 'senses.noise', label: 'Random number', trap: true, type: 'toggle', tip: 'Pure noise. Tests whether the brain learns to ignore what does not matter.' },
  { id: 'senses.encoding', layer: 'senses', path: 'senses.encoding', only: NET.concat(['mem']), label: 'Encoding', type: 'select', choices: [
    C('scaled', 'Scaled numbers', 'A hand total of 16 is fed as the number 0.76. Compact; the network must learn that 16 and 17 are different worlds.'),
    C('onehot', 'One-hot', 'A hand total of 16 is a switch that is on only for 16. Many inputs, but every total is its own thing.'),
    C('both', 'Both', 'Both representations at once.'),
  ], tip: 'How a number like the hand total is presented to the network.' },

  // ---------------------------------------------------------------- actions
  { id: 'actions.double', layer: 'actions', path: 'actions.double', label: 'May double', type: 'toggle', tip: 'Double the bet on the first two cards and take exactly one more card.' },
  { id: 'actions.split', layer: 'actions', path: 'actions.split', label: 'May split', type: 'toggle', tip: 'Turn a pair into two hands, each with its own bet.' },
  { id: 'actions.surrender', layer: 'actions', path: 'actions.surrender', label: 'May surrender', type: 'toggle', tip: 'Give up the first two cards for half the bet back. Right only in a handful of spots.' },
  { id: 'actions.ladder', layer: 'actions', path: 'actions.ladder', label: 'Bet ladder', type: 'select', choices: [
    C('flat', 'Flat 1 chip', 'Always bet one chip. There is no betting to learn; only the play matters.'),
    C('three', '1 · 5 · 25', 'Three chip sizes.'),
    C('five', '1 · 2 · 5 · 10 · 25', 'The full ladder of real denominations.'),
    C('allornothing', 'All or nothing: 1 · 25', 'Minimum or maximum, nothing between.'),
    C('fraction', 'Fraction of bankroll', 'Bet 1%, 5%, 10% or 25% of what is in hand, rounded to chips and clamped to the table. Needs the bankroll input.'),
  ], tip: 'What bet sizes the model chooses among before each hand.' },
  { id: 'actions.sharedBrain', layer: 'actions', path: 'actions.sharedBrain', only: NET, label: 'One brain for bet and play', type: 'toggle', tip: 'Betting and playing share one network with a phase flag, so what is learned about the tray helps both. Off means two separate networks.', disabled: cfg => cfg.actions.ladder === 'flat' ? 'Only applies when the model bets.' : null },

  // ---------------------------------------------------------------- body
  { id: 'body.layers', layer: 'body', path: 'body.layers', only: NET, label: 'Hidden layers', type: 'select', choices: [C(1, '1', 'One layer of neurons between input and output. Enough for the book chart.'), C(2, '2', 'Two layers. Can combine features, such as tray and depth.'), C(3, '3', 'Three layers. Deeper than this game needs, but slower to train.')], tip: 'How many layers of neurons sit between what the model sees and what it does.' },
  { id: 'body.width', layer: 'body', path: 'body.width', only: NET, label: 'Width', type: 'select', choices: [4, 8, 16, 32, 64, 128].map(w => C(w, String(w), `${w} neurons in each hidden layer.`)), tip: 'Neurons per hidden layer. The main size dial.' },
  { id: 'body.activation', layer: 'body', path: 'body.activation', only: NET, label: 'Activation', type: 'select', choices: [
    C('relu', 'ReLU', 'Passes positives, blocks negatives. The modern default; trains fast.'),
    C('lrelu', 'Leaky ReLU', 'Like ReLU but lets a trickle of negatives through, so neurons cannot die.'),
    C('tanh', 'tanh', 'A smooth S-curve from −1 to 1. Classic, a little slower.'),
    C('sigmoid', 'Sigmoid', 'A smooth S-curve from 0 to 1. The historical choice; trains slowest.'),
  ], tip: 'The bend in each neuron. Without one, the whole network is a straight line.' },
  { id: 'body.init', layer: 'body', path: 'body.init', only: NET, label: 'Initial weights', type: 'select', choices: [
    C('random', 'Small random', 'Small random numbers. Every neuron starts out slightly different.'),
    C('xavier', 'Xavier', 'Random numbers sized to the layer, so signals neither vanish nor blow up.'),
    C('zeros', 'All zeros', 'Every neuron starts identical and stays identical forever. The model will look like it is training and learn nothing.'),
  ], trap: true, tip: 'What the weights hold before training. One of these is a trap.' },
  { id: 'body.dropout', layer: 'body', path: 'body.dropout', only: ['val', 'pol'], label: 'Dropout', type: 'select', choices: [C(0, '0', 'Off.'), C(0.1, '0.1', 'Silence one neuron in ten during each training step.'), C(0.3, '0.3', 'Silence three in ten. Strong medicine.')], tip: 'Randomly silence neurons during training so the network cannot lean on any one of them. Discourages memorizing.' },
  { id: 'body.bankrollBins', layer: 'body', path: 'body.bankrollBins', only: ['tab'], label: 'Bankroll bins', type: 'select', choices: [C(4, '4', 'Low, medium, high, flush.'), C(10, '10', 'Ten steps of 20 chips.')], tip: 'A table cannot take a continuous bankroll, so it sees it in bins. Only matters when the bankroll input is on.' },
  { id: 'body.handsBins', layer: 'body', path: 'body.handsBins', only: ['tab'], label: 'Hands-remaining bins', type: 'select', choices: [C(3, '3', 'Early, middle, late.'), C(6, '6', 'Six stages.')], tip: 'Only matters when the hands-remaining input is on.' },

  // ---------------------------------------------------------------- goal
  { id: 'goal.type', layer: 'goal', path: 'goal.type', label: 'Goal', type: 'radio', choices: [
    C('everyHand', 'Every hand counts', 'Reward is the net chips on each hand; each hand is its own lesson. The purest "what is the right play." Betting stays small unless the tray says otherwise.'),
    C('sessionTotal', 'Session total', 'Reward is the bankroll after N hands. The same in the long run, but the bankroll is real, so a broke model stops earning.'),
    C('survive', 'Survive', 'Reward is how many hands the model lasts before going broke. The cautious one: stops doubling and splitting when the stack gets thin.'),
    C('target', 'Hit a target', 'Reward is 1 if the bankroll reaches the target before N hands, else 0. Bold play is mathematically correct here even without counting. The high roller.'),
    C('champion', 'Table champion', 'Reward is 1 if the model has the most chips at a table of bots after N hands. Trains in the tournament\'s own currency: coming first, not average winnings.'),
  ], tip: 'What the model is rewarded for. This is where a family fields a whole table of temperaments.' },
  { id: 'goal.N', layer: 'goal', path: 'goal.N', label: 'Session length (N)', type: 'select', choices: [C(100, '100 hands', 'A short session.'), C(300, '300 hands', 'The tournament length.'), C(1000, '1,000 hands', 'A long session.')], tip: 'How many hands make one session. The tournament plays 300.' },
  { id: 'goal.target', layer: 'goal', path: 'goal.target', label: 'Target', type: 'select', choices: [C(150, '150 chips', 'Up by half.'), C(200, '200 chips', 'Double up.'), C(300, '300 chips', 'Triple up. Rarely reached without wild betting.')], only: cfg => cfg.goal.type === 'target', tip: 'The bankroll that counts as success.' },
  { id: 'goal.lossWeight', layer: 'goal', path: 'goal.lossWeight', label: 'Loss weighting', type: 'select', choices: [C(1, 'Losses count 1×', 'A lost chip hurts exactly as much as a won chip helps.'), C(1.5, 'Losses count 1.5×', 'The loss-averse brain. Same money, different feelings about it.'), C(2, 'Losses count 2×', 'Strongly loss-averse. Will pass up good gambles.')], tip: 'How much a lost chip hurts compared with a won chip.' },
  { id: 'goal.timing', layer: 'goal', path: 'goal.timing', label: 'Reward timing', type: 'select', choices: [C('dense', 'Every hand', 'Each hand\'s result is a lesson as soon as it happens.'), C('sparse', 'End of session only', 'Nothing is learned until the session ends, then one number arrives. The model must work out which of hundreds of hands mattered. Much slower.')], only: cfg => cfg.goal.type === 'sessionTotal' || cfg.goal.type === 'survive', tip: 'Dense versus sparse reward. The credit-assignment lesson.' },
  { id: 'goal.gamma', layer: 'goal', path: 'goal.gamma', label: 'Discount', type: 'select', choices: [C(0.9, '0.9', 'A chip ten hands away is worth a third of a chip now. Short-sighted.'), C(0.99, '0.99', 'Mild impatience.'), C(1, '1.0', 'A chip later is worth a chip now.')], only: cfg => cfg.goal.type !== 'everyHand' && cfg.brain !== 'evo', tip: 'How much a chip won later is worth compared with one won now. Decisive for session goals.' },

  // ---------------------------------------------------------------- school
  { id: 'school.cards', layer: 'school', path: 'school.cards', label: 'Cards', type: 'radio', choices: [
    C('infinite', 'Infinite deck', 'Every card is drawn with replacement. The textbook approximation; the past tells you nothing.'),
    C('single', 'Single deck, fresh every hand', 'One deck, reshuffled every hand. Nothing seen earlier carries information.'),
    C('shoe', '5-deck shoe, 75% dealt', 'The tournament shoe. The only school where the discard tray means anything.'),
    C('custom', 'Custom shoe', 'Choose the number of decks and how deep the dealer goes before reshuffling.'),
  ], tip: 'Where the cards come from. The same model, sent to a different school, learns a different game.' },
  { id: 'school.decks', layer: 'school', path: 'school.decks', label: 'Decks', type: 'select', choices: [1, 2, 4, 6, 8].map(d => C(d, String(d), `${d} deck${d > 1 ? 's' : ''} in the shoe.`)), only: cfg => cfg.school.cards === 'custom', tip: 'Fewer decks, stronger swings in the tray.' },
  { id: 'school.penetration', layer: 'school', path: 'school.penetration', label: 'Dealt before reshuffle', type: 'select', choices: [C(0.5, '50%', 'Reshuffle halfway. Counting barely pays.'), C(0.75, '75%', 'Typical.'), C(0.9, '90%', 'Deep. Counting pays best.')], only: cfg => cfg.school.cards === 'custom', tip: 'How deep into the shoe the dealer goes.' },
  { id: 'school.company', layer: 'school', path: 'school.company', label: 'Company', type: 'select', choices: [C(0, 'Solo', 'Alone with the dealer.'), C(1, '1 house bot', 'One bot playing the book and betting flat.'), C(2, '2 house bots', ''), C(3, '3 house bots', ''), C(5, '5 house bots', 'A full table. The tray fills several times faster per round, as it will in the live tournament.')], tip: 'Other seats at the table, filled by bots that play the book and bet one chip. Changes how fast the tray fills.' },
  { id: 'school.seat', layer: 'school', path: 'school.seat', label: 'Seat', type: 'select', choices: [C('fixed', 'Fixed', 'Always first base.'), C('rotating', 'Rotating', 'A different seat every session. Third base sees the most cards before acting.')], only: cfg => cfg.school.company > 0, tip: 'Where the model sits. Only matters with company.' },
  { id: 'school.hands', layer: 'school', path: 'school.hands', label: 'Training amount', type: 'select', choices: [C(10000, '10,000 hands', 'A taste. Seconds.'), C(100000, '100,000 hands', 'Enough for a table to learn most of the book.'), C(1000000, '1,000,000 hands', 'Enough for a table to match the book, or for a network to find the tray.'), C(10000000, '10,000,000 hands', 'A long night.')], tip: 'Hands played is the training currency for every brain, and it is stamped in the file. A saved model can be reopened and trained further.' },
  { id: 'school.curriculum', layer: 'school', path: 'school.curriculum', label: 'Curriculum', type: 'select', choices: [C('none', 'None', 'All moves available from the first hand.'), C('stages', 'Unlock moves in stages', 'Hit and stand first, then double, then split, then surrender, each unlocked a tenth of the way through training. Sometimes faster, sometimes a trap.')], tip: 'Whether moves are unlocked gradually.' },
  { id: 'school.seed', layer: 'school', path: 'school.seed', label: 'Seed', type: 'number', tip: 'Zero means a random seed. Any other number makes the training run repeatable to the card.' },

  // ---------------------------------------------------------------- teacher
  { id: 'teacher.lr', layer: 'teacher', path: 'teacher.lr', only: LEARNS.filter(b => b !== 'mem'), label: 'Learning rate', type: 'log', min: 0.0001, max: 0.5, tip: 'Step size per lesson. Too large and it never settles, too small and it never arrives. Tables like 0.005 to 0.02 (or use the shrinking step size); networks like 0.0003 to 0.003.' },
  { id: 'teacher.exploration', layer: 'teacher', path: 'teacher.exploration', only: ['tab', 'val', 'mem'], label: 'Exploration', type: 'select', choices: [
    C('epsilon', 'Epsilon-greedy', 'Usually take the favourite move; with probability epsilon take a random one. Epsilon fades over training.'),
    C('softmax', 'Softmax', 'Pick moves in proportion to how good they look, controlled by a temperature.'),
    C('curiosity', 'Curiosity bonus', 'Add a bonus to moves that have rarely been tried in this situation. Explores where it is ignorant.'),
    C('none', 'None', 'Always take the favourite. Only works with optimistic starting values.'),
  ], tip: 'How often the model tries something other than its current favourite.' },
  { id: 'teacher.epsStart', layer: 'teacher', path: 'teacher.epsStart', only: cfg => ['tab', 'val', 'mem'].includes(cfg.brain) && cfg.teacher.exploration === 'epsilon', label: 'Epsilon start', type: 'select', choices: [C(1, '1.0', 'Completely random at first.'), C(0.5, '0.5', 'Half random at first.'), C(0.1, '0.1', 'Mostly greedy from the start.')], tip: 'How random the model is at the beginning.' },
  { id: 'teacher.epsEnd', layer: 'teacher', path: 'teacher.epsEnd', only: cfg => ['tab', 'val', 'mem'].includes(cfg.brain) && cfg.teacher.exploration === 'epsilon', label: 'Epsilon end', type: 'select', choices: [C(0.1, '0.1', 'Still one random move in ten at the end.'), C(0.01, '0.01', 'One in a hundred.'), C(0, '0', 'Fully greedy at the end.')], tip: 'How random the model is at the end of the schedule.' },
  { id: 'teacher.epsOver', layer: 'teacher', path: 'teacher.epsOver', only: cfg => ['tab', 'val', 'mem'].includes(cfg.brain) && cfg.teacher.exploration === 'epsilon', label: 'Epsilon fades over', type: 'select', choices: [C(0.1, 'First 10% of training', 'Stops exploring early. Freezes its early mistakes.'), C(0.5, 'First 50%', 'A balance.'), C(1, 'All of training', 'Explores to the very end.')], tip: 'How much of the training run the fade takes.' },
  { id: 'teacher.epsShape', layer: 'teacher', path: 'teacher.epsShape', only: cfg => ['tab', 'val', 'mem'].includes(cfg.brain) && cfg.teacher.exploration === 'epsilon', label: 'Fade shape', type: 'select', choices: [C('linear', 'Linear', 'A straight fade.'), C('exp', 'Exponential', 'Fast at first, then slow.')], tip: 'The shape of the fade.' },
  { id: 'teacher.temperature', layer: 'teacher', path: 'teacher.temperature', only: cfg => ['tab', 'val', 'mem'].includes(cfg.brain) && cfg.teacher.exploration === 'softmax', label: 'Temperature', type: 'select', choices: [C(0.1, '0.1 (cold)', 'Nearly greedy.'), C(0.5, '0.5', ''), C(1, '1', ''), C(5, '5 (hot)', 'Nearly random.')], tip: 'Hot means nearly random, cold means nearly greedy.' },
  { id: 'teacher.updateEvery', layer: 'teacher', path: 'teacher.updateEvery', only: ['val'], label: 'Update timing', type: 'select', choices: [C(1, 'Every hand', 'Learn immediately.'), C(10, 'Every 10 hands', 'Learn in small batches.'), C(100, 'Every 100 hands', 'Learn in large batches.')], tip: 'How often the network takes a learning step.' },
  { id: 'teacher.optimizer', layer: 'teacher', path: 'teacher.optimizer', only: ['val', 'pol'], label: 'Optimizer', type: 'select', choices: [
    C('sgd', 'SGD', 'Plain gradient descent. Step in the direction that reduces error.'),
    C('momentum', 'Momentum', 'Gradient descent with inertia. Rolls through small bumps.'),
    C('rmsprop', 'RMSProp', 'Scales each weight\'s step by how noisy its gradient has been.'),
    C('adam', 'Adam', 'Momentum and RMSProp together. The modern default.'),
  ], tip: 'Four generations of the same idea: how to turn a gradient into a step.' },
  { id: 'teacher.batch', layer: 'teacher', path: 'teacher.batch', only: cfg => cfg.brain === 'val' && cfg.val.replay > 0, label: 'Batch size', type: 'select', choices: [C(8, '8', ''), C(32, '32', ''), C(128, '128', '')], tip: 'How many memories are averaged per step when replay is on.' },
  { id: 'teacher.lrSchedule', layer: 'teacher', path: 'teacher.lrSchedule', only: ['val', 'pol'], label: 'Learning-rate schedule', type: 'select', choices: [C('constant', 'Constant', 'Same step size throughout.'), C('halving', 'Halve every 100k hands', 'Big steps early, small steps late.'), C('cosine', 'Cosine fade', 'A smooth fade to nearly zero by the end.')], tip: 'Whether the step size shrinks as training goes on.' },
  { id: 'teacher.clip', layer: 'teacher', path: 'teacher.clip', only: ['val', 'pol'], label: 'Gradient clipping', type: 'toggle', tip: 'A seat belt against one wild hand yanking the weights.' },
  { id: 'teacher.weightDecay', layer: 'teacher', path: 'teacher.weightDecay', only: ['val', 'pol'], label: 'Weight decay', type: 'select', choices: [C(0, '0', 'Off.'), C(0.0001, '0.0001', 'A gentle pull toward small weights.'), C(0.001, '0.001', 'A firm pull. Against memorizing.')], tip: 'A gentle pull toward small weights, against memorizing.' },
];

export function getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
export function setPath(obj, path, v) { const ks = path.split('.'); let o = obj; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; o[ks[ks.length - 1]] = v; }

export function isVisible(opt, cfg) {
  if (!opt.only) return true;
  if (typeof opt.only === 'function') return opt.only(cfg);
  return opt.only.includes(cfg.brain);
}

// Blocks stop training; warnings are shown and training proceeds. Fixes are applied silently by normalize().
export function normalize(cfg) {
  if (cfg.brain === 'tab') cfg.senses.tray = false;
  if (cfg.actions.ladder === 'fraction') cfg.senses.bankroll = true;
  if (cfg.goal.type === 'champion' && cfg.school.company === 0) cfg.school.company = 1;
  if (cfg.actions.ladder === 'flat') cfg.actions.sharedBrain = false;
  if (cfg.brain === 'mem' && cfg.mem.capacity > 100000) cfg.mem.capacity = 100000;
  return cfg;
}
export function warnings(cfg) {
  const w = [];
  if (cfg.brain === 'tab' && (cfg.senses.recent || cfg.senses.noise) && (cfg.senses.composition)) w.push('A table with composition plus trap inputs has millions of rows and will learn very slowly.');
  if (['survive', 'target', 'champion'].includes(cfg.goal.type) && !cfg.senses.bankroll) w.push('This goal is about the bankroll, but the model cannot see its bankroll. It will not know how close to ruin it is.');
  if (cfg.senses.tray && cfg.school.cards !== 'shoe' && cfg.school.cards !== 'custom') w.push('The discard tray is on, but this school reshuffles every hand, so the tray will never carry information.');
  if (cfg.brain === 'mem' && cfg.senses.tray) w.push('Memory with the tray on: similarity in many dimensions is slow. A larger capacity helps.');
  if (cfg.body.init === 'zeros' && ['val', 'pol', 'evo'].includes(cfg.brain)) w.push('All-zero weights: every neuron is identical and will stay identical. This model will not learn.');
  if (cfg.teacher.exploration === 'none' && cfg.brain === 'tab' && cfg.tab.init !== 'optimistic') w.push('No exploration and non-optimistic starting values: the table will repeat the first move that ever worked.');
  if (cfg.goal.timing === 'sparse' && cfg.brain !== 'evo') w.push('End-of-session reward is much slower to learn from. Expect to need ten times the hands.');
  if (cfg.goal.type !== 'everyHand' && cfg.actions.ladder === 'flat' && !cfg.senses.bankroll) w.push('With a flat bet and no bankroll input, this goal will behave much like "every hand counts."');
  return w;
}

export const RECIPES = [
  { name: 'The Accountant', line: 'TAB · Q-learning · every hand counts · flat bet', blurb: 'Learns the book chart and nothing else. The control group: its chart should match the printed one.',
    cfg: { brain: 'tab', tab: { rule: 'q', init: 'optimistic', step: 'decay' }, actions: { ladder: 'flat' }, goal: { type: 'everyHand' }, school: { cards: 'shoe', hands: 300000 }, teacher: { lr: 0.01, exploration: 'epsilon', epsStart: 0.5, epsEnd: 0.01, epsOver: 0.5 } } },
  { name: 'The Card Sharp', line: 'VAL · tray + shoe depth · 5-deck school · session total · full ladder', blurb: 'Built to discover counting. Give it a million hands and watch whether the bet rises late in the shoe.',
    cfg: { brain: 'val', val: { double: true, replay: 10000, targetRefresh: 1000 }, senses: { tray: true, depth: true, bankroll: true, encoding: 'both' }, actions: { ladder: 'five', sharedBrain: false }, body: { layers: 2, width: 32, activation: 'relu', init: 'xavier' }, goal: { type: 'sessionTotal', N: 300, timing: 'dense', gamma: 0.99 }, school: { cards: 'shoe', hands: 1000000 }, teacher: { lr: 0.001, exploration: 'epsilon', epsStart: 1, epsEnd: 0.01, epsOver: 0.5, optimizer: 'adam', batch: 32, updateEvery: 4 } } },
  { name: 'The High Roller', line: 'POL · hit a target of 200 · all-or-nothing ladder · single-deck school', blurb: 'Goes broke most sessions and wins the table some of them. A goal shapes a gambler more than a brain does.',
    cfg: { brain: 'pol', pol: { baseline: 'mean', entropy: 0.01, handsPerUpdate: 10 }, senses: { bankroll: true, handsLeft: true }, actions: { ladder: 'allornothing' }, body: { layers: 1, width: 16, init: 'xavier' }, goal: { type: 'target', target: 200, N: 300, gamma: 1 }, school: { cards: 'single', hands: 300000 }, teacher: { lr: 0.001, optimizer: 'adam' } } },
  { name: 'The Darwinist', line: 'EVO · population 50 · tournament selection · survive', blurb: 'Never sees a reward. Generations of networks are dealt out and the poorest are culled. Cautious by the third hour.',
    cfg: { brain: 'evo', evo: { pop: 50, selection: 'tournament', mutRate: 0.05, mutSize: 'medium', crossover: 'uniform', elites: 1, evalHands: 1000 }, senses: { bankroll: true }, actions: { ladder: 'three' }, body: { layers: 1, width: 16, init: 'xavier' }, goal: { type: 'survive', N: 300 }, school: { cards: 'shoe', hands: 1000000 } } },
  { name: 'The Elephant', line: 'MEM · k = 20 · 100k memories · every hand counts', blurb: 'Remembers everything and reasons about nothing. Plays well in situations it has seen, stalls in ones it has not.',
    cfg: { brain: 'mem', mem: { k: 20, capacity: 100000, forgetting: 'oldest', weighting: 'flat' }, senses: { encoding: 'scaled' }, actions: { ladder: 'flat' }, goal: { type: 'everyHand' }, school: { cards: 'single', hands: 100000 }, teacher: { exploration: 'epsilon', epsStart: 1, epsEnd: 0.05, epsOver: 0.5 } } },
  { name: 'The Superstitious Uncle', line: 'VAL · recent outcomes + random number · single-deck school', blurb: 'Fed two inputs that mean nothing. Does it learn to ignore them, or build a theory about hot streaks?',
    cfg: { brain: 'val', val: { double: false, replay: 1000, targetRefresh: 1000 }, senses: { recent: true, noise: true, encoding: 'onehot' }, actions: { ladder: 'three' }, body: { layers: 1, width: 16, init: 'random' }, goal: { type: 'everyHand' }, school: { cards: 'single', hands: 300000 }, teacher: { lr: 0.001, exploration: 'epsilon', epsStart: 1, epsEnd: 0.05, epsOver: 0.5, optimizer: 'adam' } } },
];

export function applyRecipe(base, recipe) {
  const cfg = JSON.parse(JSON.stringify(base));
  for (const k in recipe.cfg) {
    if (typeof recipe.cfg[k] === 'object') Object.assign(cfg[k], recipe.cfg[k]); else cfg[k] = recipe.cfg[k];
  }
  if (cfg.brain !== 'tab' && !('lr' in (recipe.cfg.teacher || {}))) cfg.teacher.lr = 0.001;
  return normalize(cfg);
}
