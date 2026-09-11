# Can't Stop: exact probabilities and a small imitation policy

## Scope and rules

Two players; first to **5 claimed columns** wins. Heights for columns 2–12 are `3,5,7,9,11,13,11,9,7,5,3`. At most three neutral markers may be active in a turn. A selected pairing must advance both sums whenever both can legally be used; with one marker free and two new distinct sums, choose either. A double advances twice unless the summit leaves room for only one step. A pending summit occupies a marker and cannot advance further. Claimed columns are closed to both players. Stopping banks all active progress and claims pending summits; busting erases only unbanked progress. Banking the fifth summit ends the game immediately.

`engine.Game.legal_moves(pairings)` returns legal step choices. `engine.best_pairing(game, dice)` is exported for arbitrary legal board/turn states and a supplied four-die outcome; it returns a tuple of steps or `None` for bust. The low-level `move` validates steps, while callers must select an option from `legal_moves` to enforce the pairing requirement. The state comprises `progress` (two dictionaries), `claimed` (column → owner), `active` (column → temporary position), and `player` (0 or 1).

## Exact analytics: data.json

All **1,296 ordered, equally likely outcomes** are enumerated in lexicographic order `(d1,d2,d3,d4)`, each die 1–6. The three **labelled disjoint pairings** are `(12|34)`, `(13|24)`, `(14|23)`. Each pair of sums is sorted internally, but duplicate pairings are deliberately retained: dice `(4,5,3,4)` yield `[[7,9],[7,9],[8,8]]`.

- `sums`: all 11 sums; `count` counts outcomes containing that sum in any of the six die pairs, and `p=count/1296`.
- `partners`: all 11 possible companions, ranked by `ways` descending then companion number ascending. `ways` counts labelled pairings containing the unordered combination (not outcomes); `rollCount` counts each outcome at most once; `p=rollCount/1296` is **unconditional**, not conditional on the first sum.
- `triples`: all 165 distinct triples; sorted by survival probability descending, expected gain descending, then lexicographically.
- Triple `count` counts outcomes with at least one usable sum. `p=count/1296`; `gain` is the unconditional expected maximum usable steps in any one pairing, including two for a usable double.
- `meanBust=1/(1-p)` is the expected index of the first busting roll (including that roll). `medianBust` is the first integer n with `1-p**n > 0.5`, a strict inequality.
- These triple statistics assume the same three active columns remain usable indefinitely. They **do not** account for summits, closed columns, or changing markers. The game engine's `bust_risk` does account for those restrictions.

The top-level contract is exactly `{sums,triples,rolls}`. No contract fields were removed or renamed.

## Pairing heuristic (not a learned or globally optimal solver)

All agents use the same deterministic legal pairing selector. Each step scores `(1 + 0.65 × opponent_fraction)/height`. Reaching a summit adds `0.8 + 0.6 × opponent_fraction`; reaching enough pending summits to win adds 100. Ties favor lexicographically smaller step tuples. Thus opponent banked progress explicitly affects race priorities, including blocking a near-finished opposing column. This is a greedy race-aware heuristic, not a search over full future games and not a claim of the best possible move.

## STOP/ROLL teacher and features

The exported decision tree handles **post-move STOP versus ROLL only**, after a legal move has already been selected. It does not directly choose dice pairings. The deployment wrapper forces STOP whenever banking pending summits wins; this guard is also used in evaluation. The raw tree can be inspected independently, but a consuming app should implement the same guard.

Feature order and units:

1. `turn_gain`: sum of unbanked steps divided by their respective column heights.
2. `bust_risk`: exact next-roll probability of no legal step.
3. `summits_pending`: active markers at the summit, not yet banked.
4. `own_claimed`: current player's already claimed column count.
5. `opponent_claimed`: other player's already claimed column count.
6. `opponent_threat`: maximum opponent banked position/height among unclaimed columns (0 if none).
7. `free_markers`: three minus active marker count; pending summits still occupy markers.

Exact next-roll survival is memoized by active and available columns. Exact expected best immediate normalized step gain is also memoized, including capacity and near-summit double constraints. The teacher first banks a winning turn. It also secures pending summits when risk exceeds 0.08, own claims are at least 3, or opponent threat is at least 0.7. Otherwise it compares expected immediate normalized gain against `bust_risk × (turn_gain + 0.6 × pending) × (1.15 + 0.35 × threat + 0.10 × own_claimed − 0.07 × opponent_claimed)`.

This is **supervised imitation of a hand-written heuristic**, not reinforcement learning, dynamic programming, minimax, or an optimal-policy proof. The teacher uses additional board details for expected gain that are absent from the seven tree features, so perfect imitation need not be possible.

## Simulation, corpus selection and split

Reproduce from this directory with:

```sh
python3 -m pytest test_engine.py -q
python3 train.py
```

No package installation is required: Python, NumPy, scikit-learn and pytest are used. Seed `20260911` controls teacher self-play; game-group split seed is `73`. Candidate games start with player 0, with identical teacher policies for both players.

The learning corpus contains **exactly 100,000 actually simulated dice rolls in 1,225 complete games**. There are 95,181 post-move decision examples, 4,819 busts and 28,612 banked turns. Player wins are 691 / 534.

**Important accounting disclosure:** to meet an exact roll total without censoring the final game, 1,263 complete candidate games (103,036 rolls) were generated; a whole-game subset-sum retained 1,225 games totalling exactly 100,000 rolls. The other 3,036 candidate rolls are selection overhead, not learning/evaluation data. Thus this is not a claim that the entire program executed only 100,000 dice rolls. Selection by game length may introduce bias. Every retained game is complete; no dice outcomes were fabricated and no partial final game is counted.

A 75%/25% **game-group** split yields 918 fit games / 307 held-out games, or 71,478 / 23,703 decision rows. No game's rows appear in both sets. The exported tree is the model fit only on the training partition, **not refitted on the holdout**. Both labels and fit/holdout states come from teacher self-play, so these accuracy figures do not by themselves establish win strength.

## Measured model and gameplay results

CART classifier: `max_leaf_nodes=25`, `min_samples_leaf=80`, `random_state=73`; **49 total nodes** (one model only, under the 50-node limit).

- Held-out action accuracy: **95.6377%**.
- Balanced accuracy: **95.3912%**.
- Held-out majority-action baseline: **69.6283%**.
- Confusion matrix, true rows / predicted columns ordered `[ROLL, STOP]`: `[[15847,657],[377,6822]]`.

Independent gameplay evaluation uses fresh random seeds, 200 complete games per opponent, and alternates the tree's starting seat (100 games each). Both sides share the same pairing heuristic, so this tests stopping policies rather than independent pairing quality. The deployed tree includes the winning-STOP guard.

| Opponent | Tree wins | Win rate | 95% Wilson interval | Evaluation rolls |
|---|---:|---:|---:|---:|
| Teacher, seed 991 | 98 / 200 | 49.0% | 42.16%–55.88% | 16,179 |
| Conservative, seed 992 | 185 / 200 | 92.5% | 88.00%–95.40% | 13,878 |

The conservative baseline stops on any pending summit or `turn_gain >= 0.35`, otherwise rolls. It is intentionally simple, not a strong known benchmark. Total evaluation rolls: **30,057**, separate from the exact 100,000-roll learning corpus and from candidate-selection overhead. The teacher comparison does not demonstrate superiority. Wilson intervals summarize finite-game uncertainty under this evaluation setup, not generalization to all strategies.

## strategy.json contract

Top-level `{meta,tree}`; required `meta` fields `rolls,games,nodes,accuracy,features` are present. `accuracy` is a fraction in [0,1]. Internal nodes are `{id,feature,threshold,left,right,samples}` with feature **names**, not numeric indices, and `<= threshold` routes left. Leaves are `{id,action,samples}` with uppercase STOP/ROLL. `samples` counts fit-partition rows reaching that node. Additional metadata includes split sizes, seeds, feature definitions, confusion matrix, candidate-roll accounting, gameplay evaluation and uncertainty. There is no additional pairing tree. Floating-point thresholds come directly from scikit-learn; exported-tree predictions were checked against sklearn on every held-out row.

## Verification

Tests were written and executed RED before the associated analytics, legal engine, and training pipeline implementations, then GREEN. The canonical within-pair sorting example also had its own observed failing regression test before correction. Tests independently recount every sum, every companion and every triple from all outcomes; they check strict geometric medians, forced moves, one-free-marker choices, doubles at a summit, closed columns, bust reset, banked claims, exact survival, the winning guard, complete simulated games, subset totals and tree traversal. Generation asserts exact roll accounting, no game-group leakage, at most 49 nodes, and exported prediction agreement.
