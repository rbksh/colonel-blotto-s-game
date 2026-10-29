# Colonel Blotto's Game

**Live demo:** https://rbksh.github.io/colonel-blotto-s-game/

An interactive simulator for the Colonel Blotto game. You can play a single match step by step, or watch tournaments, evolution and equilibrium searches run live, with every calculation shown.

---

## 1. What is Colonel Blotto?

Two generals fight over several castles.

- Each general has the same number of soldiers (here **100**).
- There are **10 castles**. Castle 1 is worth 1 point, castle 2 is worth 2 points, … castle 10 is worth 10 points.
- Both generals **secretly** decide how many soldiers to send to each castle. The numbers must add up to exactly 100.
- On each castle, **whoever sent more soldiers wins that castle's points**. If both sent the same number, nobody gets the points.
- The general with **more total points wins**.

Example (only 3 castles shown):

| Castle (points) | You | Opponent | Who wins | Your points |
|---|---|---|---|---|
| 1 | 5 | 10 | Opponent | 0 |
| 2 | 20 | 15 | You | 2 |
| 3 | 30 | 30 | Tie | 0 |

## 2. Why is it interesting?

There is **no single best strategy**. Whatever you choose, there is an allocation that beats it: take one soldier off a few castles and use them to win a castle you were losing. So the best play is to be unpredictable and mix between strategies. This simulator explores that.

## 3. The two versions

**Classic:** the rules above.

**Jane Street penalty version:** same rules, but winning by too much costs you. On every castle you win, you **lose 0.2 points for each extra soldier** you had over your opponent.

> Castle 9: you send 50, they send 10. You win, but you had 40 extra soldiers.
> Penalty = 0.2 × 40 = 8, so you only score 9 − 8 = **1 point**.

That makes overkill a bad idea. You want to win each castle by as little as possible.

You can also change the number of castles, soldiers, the penalty amount, the tie rule, and switch on an optional "win 3 castles in a row and you take all the rest" rule.

## 4. What's in the simulator

| Tab | What it does |
|---|---|
| **1 · Head to head** | Pick soldiers for players A and B, then play the battle **one castle at a time**. Each castle's maths is written out, and the charts update as you go. *Best reply* finds the strongest possible counter to your opponent and explains how. |
| **2 · Tournament** | Dozens of strategies all play each other. You watch each match being scored and the leaderboard change. |
| **3 · Evolution** | A genetic algorithm "breeds" better strategies: the winners survive, mix and mutate. Every step of each generation is shown. |
| **4 · Equilibrium search** | *Fictitious play*: keep adding the best counter to everything played so far. The mix slowly becomes hard to beat, which approximates the game's equilibrium. |
| **How it works** | The formulas and theory. |

## 5. How the best reply is calculated (simple version)

On each castle you really have three sensible choices: send **0** (give it up), **match** the opponent (tie), or send **one more** than them (win cheaply). The program checks every way of spending exactly 100 soldiers across the castles and keeps the one that scores best. It does this with a standard technique called *dynamic programming*.

## 6. Run it yourself

No installation needed:

1. Download or clone this repo.
2. Open `index.html` in any browser.

Run the tests (needs Node.js): `node test/engine.test.js`

## 7. Files

| File | Purpose |
|---|---|
| `index.html` | The page |
| `styles.css` | Look and feel (light and dark mode) |
| `engine.js` | The game rules and maths |
| `app.js` | Buttons, charts and live simulations |
| `test/engine.test.js` | Checks that the maths is right |
