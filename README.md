# Blackjack Brains

A browser game about machine learning, dressed up as blackjack. Design a small learning system, train it by letting it play thousands of hands against the dealer, save it as a file, then load everyone's trained models into a tournament and watch them play for money. Nobody writes a strategy: each model has to discover what works from winning and losing.

Built for friends and family to get a hands-on feel for the diversity of ML approaches. No install, no accounts, no server. Everything runs in the browser and trains on your own machine.

**Live:** https://worldbyjoe.github.io/BlackjackBrains/

## The three pages

- **Train** (`index.html`) — build a model through eight layers of choices, then train it and watch it learn. Start from one of six recipe "personalities" and tweak from there. Save the trained model as a `.bjbrain.json` file.
- **Tournament** (`tournament.html`) — load model files and rank them, either with identical cards in isolation (the fair measure) or all seated at one shared table (the casino way, watchable hand by hand).
- **Guide** (`guide.html`) — the house rules, what each choice does, and how card counting is meant to emerge on its own.

## The five brains

| Brain | What it is | Teaches |
|---|---|---|
| Lookup table | One cell per situation and move, updated from experience | Learning from reward, and why a table cannot scale |
| Value network | A neural net that rates each move | Generalization; the only brain that can discover counting |
| Policy network | A neural net that picks the move directly | Value vs. policy learning |
| Evolution | A population of nets; the richest reproduce with mutation | Search without gradients |
| Memory | Averages the k most similar past situations | Learning by example |

## How counting emerges

There is no "counting" switch. There is a sense called the **discard tray**: ten numbers giving how many of each card value have been dealt since the last shuffle. Give it to a network, train on the shoe, and it can learn on its own that a low-card-rich tray means bet bigger. A lookup table cannot hold the tray, which is the point. The Train page charts average bet by true count so you can see whether a model found it.

## Rules

Las Vegas Strip: 5-deck shoe (75% penetration), dealer stands on soft 17, blackjack pays 3:2, double any two and after split, split to four hands, late surrender, no insurance. Start 100 chips, bets 1–25, 300 hands per session. Fixed for everyone and stamped into every model file so tournaments are fair.

## Running locally

Static files only. From this folder:

```bash
python3 -m http.server 8766
```

Then open http://localhost:8766/ . Training runs in a Web Worker, so the page stays responsive. Models are plain JSON you download and share.

## Code layout

```
index.html tournament.html guide.html   the three pages
css/app.css                             shared styling
js/engine.js        blackjack rules, shoe, dealer, multi-seat table
js/book.js          basic-strategy bot and the answer key
js/mlp.js           small neural net (manual backprop, four optimizers)
js/brains.js        the five learning families
js/features.js      turns game state into what a brain sees
js/model.js         assembles a model from a config; save/load; fingerprint
js/trainer.js       training loop, evaluation, strategy chart, evolution
js/worker.js        runs training off the main thread
js/menu.js          every menu option, its tooltip, recipes, and rules
js/names.js         random permanent handles
js/ui.js            DOM and chart helpers
js/trainer-ui.js    the Train page
js/tournament-ui.js the Tournament page
test/index.html     headless correctness + speed tests
```

Open `test/` in the browser to run the test suite.
