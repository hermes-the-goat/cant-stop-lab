"""Reproduce exact analytics, game-group holdout, and policy evaluation."""
import json
import random
import math
from pathlib import Path
import numpy as np
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import GroupShuffleSplit
from sklearn.metrics import accuracy_score, confusion_matrix, balanced_accuracy_score
from engine import Game, FEATURES, HEIGHTS, analytics, best_pairing, features, teacher

ROOT = Path(__file__).resolve().parent


def run_game(rng, policies, collect=False):
    g = Game()
    rows, labels = [], []
    rolls = busts = stops = 0
    while g.winner is None:
        dice = tuple(rng.randint(1, 6) for _ in range(4))
        rolls += 1
        move = best_pairing(g, dice)
        if move is None:
            busts += 1
            g.bust()
            continue
        g.move(move)
        x = features(g)
        action = policies[g.player](g, x)
        # All deployed policies share the mandatory terminal-victory guard.
        if x[2]+x[3] >= 5:
            action = 'STOP'
        if collect:
            rows.append(x)
            labels.append(teacher(g, x))
        if action == 'STOP':
            stops += 1
            g.stop()
        if rolls > 100000:
            raise RuntimeError('Unexpected runaway game')
    return dict(rolls=rolls, busts=busts, stops=stops, winner=g.winner,
                claims=[sum(p == i for p in g.claimed.values()) for i in range(2)], rows=rows, labels=labels)


def select_games(games, target):
    """Subset sum retains only whole games; no censored final trajectory."""
    parents = {0: None}
    for i, game in enumerate(games):
        for old in list(parents):
            new = old+game['rolls']
            if new <= target and new not in parents:
                parents[new] = (old, i)
        if target in parents:
            selected = []
            n = target
            while n:
                old, i = parents[n]
                selected.append(games[i])
                n = old
            return selected[::-1]
    raise ValueError('No whole-game subset meets target')


def export_tree(model, node=0):
    t = model.tree_
    result = dict(id=int(node), samples=int(t.n_node_samples[node]))
    if t.children_left[node] == -1:
        result['action'] = str(model.classes_[np.argmax(t.value[node][0])])
    else:
        result.update(feature=FEATURES[t.feature[node]], threshold=float(t.threshold[node]),
                      left=export_tree(model, t.children_left[node]), right=export_tree(model, t.children_right[node]))
    return result


def predict_tree(tree, x):
    while 'action' not in tree:
        tree = tree['left'] if x[FEATURES.index(tree['feature'])] <= tree['threshold'] else tree['right']
    return tree['action']


def wilson(wins, n):
    z = 1.959963984540054
    p = wins/n
    c = (p+z*z/(2*n))/(1+z*z/n)
    h = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/(1+z*z/n)
    return [c-h, c+h]


def conservative(g, x=None):
    x = features(g) if x is None else x
    return 'STOP' if x[2] or x[0] >= .35 else 'ROLL'


def evaluate(tree, opponent, seed, games=200):
    rng = random.Random(seed)
    wins = rolls = busts = 0
    policy = lambda g, x: predict_tree(tree, x)
    for i in range(games):
        seat = i % 2
        result = run_game(rng, (policy, opponent) if seat == 0 else (opponent, policy))
        wins += result['winner'] == seat
        rolls += result['rolls']
        busts += result['busts']
    return dict(games=games, wins=wins, losses=games-wins, winRate=wins/games,
                wilson95=wilson(wins, games), rolls=rolls, busts=busts, alternatingStarts=True, seed=seed)


def main():
    (ROOT/'data.json').write_text(json.dumps(analytics(), separators=(',', ':')))
    rng = random.Random(20260911)
    candidates = []
    candidate_rolls = 0
    # Oversample whole games, then choose a complete-game corpus of exactly 100000 rolls.
    while candidate_rolls < 103000:
        game = run_game(rng, (teacher, teacher), collect=True)
        candidates.append(game)
        candidate_rolls += game['rolls']
        if len(candidates) % 100 == 0:
            print(f'candidate games={len(candidates)} rolls={candidate_rolls}', flush=True)
    games = select_games(candidates, 100000)
    X = np.array([x for g in games for x in g['rows']])
    y = np.array([label for g in games for label in g['labels']])
    groups = np.array([i for i, g in enumerate(games) for _ in g['rows']])
    train, test = next(GroupShuffleSplit(n_splits=1, test_size=.25, random_state=73).split(X, y, groups))
    assert not set(groups[train]).intersection(groups[test])
    model = DecisionTreeClassifier(max_leaf_nodes=25, min_samples_leaf=80, random_state=73)
    model.fit(X[train], y[train])
    pred = model.predict(X[test])
    tree = export_tree(model)
    assert all(predict_tree(tree, x) == p for x, p in zip(X[test], pred))
    assert model.tree_.node_count <= 49
    meta = dict(rolls=sum(g['rolls'] for g in games), games=len(games), nodes=int(model.tree_.node_count),
                accuracy=float(accuracy_score(y[test], pred)), features=FEATURES,
                balancedAccuracy=float(balanced_accuracy_score(y[test], pred)),
                confusionMatrix=confusion_matrix(y[test], pred, labels=['ROLL', 'STOP']).tolist(),
                confusionLabels=['ROLL', 'STOP'], decisions=len(y), trainDecisions=len(train), testDecisions=len(test),
                trainGames=len(set(groups[train])), testGames=len(set(groups[test])),
                majorityBaseline=float(max(np.mean(y[test] == 'ROLL'), np.mean(y[test] == 'STOP'))),
                busts=sum(g['busts'] for g in games), stops=sum(g['stops'] for g in games),
                playerWins=[sum(g['winner'] == i for g in games) for i in range(2)],
                targetClaims=5, seed=20260911, splitSeed=73,
                candidateRolls=candidate_rolls, candidateGames=len(candidates),
                excludedCandidateRolls=candidate_rolls-100000,
                scope='Post-move STOP/ROLL; heuristic imitation, not optimal policy',
                completeGames=True, corpusSelection='Whole-game subset sum to exactly 100000 rolls; length-selection bias possible',
                terminalVictoryGuard=True, pairingPolicy='Shared deterministic race-aware heuristic: engine.best_pairing',
                featureDefinitions={
                    'turn_gain':'Sum of unbanked steps / respective column height',
                    'bust_risk':'Exact probability of no legal step on next roll, including closed/pending columns',
                    'summits_pending':'Active markers at summit, not yet banked',
                    'own_claimed':'Columns already claimed by current player',
                    'opponent_claimed':'Columns already claimed by opponent',
                    'opponent_threat':'Maximum opponent banked progress / height on any unclaimed column',
                    'free_markers':'3 minus active marker count (pending summits still occupy markers)'})
    meta['evaluation'] = {'vsTeacher': evaluate(tree, teacher, 991), 'vsConservative': evaluate(tree, conservative, 992)}
    meta['evaluationRolls'] = sum(v['rolls'] for v in meta['evaluation'].values())
    assert meta['rolls'] == 100000 and meta['decisions']+meta['busts'] == meta['rolls']
    (ROOT/'strategy.json').write_text(json.dumps(dict(meta=meta, tree=tree), separators=(',', ':')))
    print(json.dumps(meta, indent=2))


if __name__ == '__main__':
    main()
