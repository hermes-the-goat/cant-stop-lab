import importlib.util
import pytest


def test_training_pipeline():
    assert importlib.util.find_spec('train') is not None, 'training pipeline missing'
    from train import run_game, select_games, export_tree, predict_tree
    from engine import teacher
    import random
    from sklearn.tree import DecisionTreeClassifier
    game = run_game(random.Random(42), (teacher, teacher), collect=True)
    assert game['winner'] in (0, 1)
    assert game['claims'][game['winner']] >= 5
    assert game['rolls'] == game['busts'] + len(game['rows'])
    assert sum(g['rolls'] for g in select_games([{'rolls': 8}, {'rolls': 3}, {'rolls': 5}], 11)) == 11
    model = DecisionTreeClassifier(max_leaf_nodes=25).fit([[0]*7, [1]*7], ['ROLL', 'STOP'])
    tree = export_tree(model)
    assert predict_tree(tree, [0]*7) == 'ROLL'
    assert predict_tree(tree, [1]*7) == 'STOP'



def test_legal_turn_and_pairing_policy():
    import engine
    assert hasattr(engine, 'Game'), 'legal game engine missing'
    g = engine.Game()
    assert g.legal_moves(((6, 8),)) == [(6, 8)]
    g.active = {4: 1, 5: 1}
    assert set(g.legal_moves(((6, 8),))) == {(6,), (8,)}
    g.active = {6: 10, 7: 12, 8: 10}
    assert g.legal_moves(((6, 6),)) == [(6,)]
    g.move((6,))
    assert g.legal_moves(((6, 6),)) == []
    assert g.legal_moves(((6, 7),)) == [(7,)]
    g.bust()
    assert g.active == {} and g.player == 1
    assert all(v == 0 for p in g.progress for v in p.values())
    g.active = {2: 3, 3: 5}
    g.stop()
    assert g.claimed[2] == 1 and g.claimed[3] == 1
    assert g.progress[1][2] == 3
    assert g.legal_moves(((2, 3),)) == []
    assert engine.best_pairing(g, (1, 1, 1, 1)) is None
    with pytest.raises(ValueError):
        g.move((2,))


def test_exact_cached_survival_and_teacher():
    import engine
    assert hasattr(engine, 'survival'), 'cached survival missing'
    g = engine.Game()
    g.active = {6: 1, 7: 1, 8: 1}
    p = sum(bool(g.legal_moves(r)) for r in engine.ROLLS)/1296
    assert engine.survival(tuple(sorted(g.active)), tuple(range(2, 13))) == p
    g.claimed = {2: 0, 3: 0, 4: 0, 5: 0}
    g.active = {6: 11}
    assert engine.teacher(g) == 'STOP'
    assert engine.features(g)[2] == 1



def test_exact_enumeration():
    assert importlib.util.find_spec('engine') is not None, 'engine implementation missing'
    from engine import pairings, analytics
    assert pairings((4, 5, 3, 4)) == ((7, 9), (7, 9), (8, 8))
    data = analytics()
    assert len(data['rolls']) == 1296
    assert len(data['triples']) == 165
    assert len(data['sums']) == 11
    for row in data['sums']:
        n = row['n']
        assert row['count'] == sum(any(n in p for p in r) for r in data['rolls'])
        assert row['p'] == row['count'] / 1296
        assert row['partners'] == sorted(row['partners'], key=lambda x: (-x['ways'], x['n']))
        for partner in row['partners']:
            combo = sorted((n, partner['n']))
            assert partner['ways'] == sum(sorted(p) == combo for r in data['rolls'] for p in r)
            assert partner['rollCount'] == sum(any(sorted(p) == combo for p in r) for r in data['rolls'])
    assert data['triples'] == sorted(data['triples'], key=lambda x: (-x['p'], -x['gain'], x['cols']))
    for row in data['triples']:
        counts = [max(sum(n in row['cols'] for n in p) for p in roll) for roll in data['rolls']]
        assert row['count'] == sum(n > 0 for n in counts)
        assert row['gain'] == sum(counts) / 1296
        assert row['meanBust'] == 1 / (1 - row['p'])
        m = row['medianBust']
        assert 1-row['p']**m > .5
        assert m == 1 or 1-row['p']**(m-1) <= .5
