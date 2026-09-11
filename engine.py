"""Exact four-die analytics and legal two-player Can't Stop engine."""
from itertools import product, combinations
from functools import lru_cache

HEIGHTS = dict(zip(range(2, 13), (3, 5, 7, 9, 11, 13, 11, 9, 7, 5, 3)))
FEATURES = ['turn_gain', 'bust_risk', 'summits_pending', 'own_claimed', 'opponent_claimed', 'opponent_threat', 'free_markers']


def pairings(dice):
    a, b, c, d = dice
    return tuple(tuple(sorted(p)) for p in ((a+b, c+d), (a+c, b+d), (a+d, b+c)))


ROLLS = tuple(pairings(d) for d in product(range(1, 7), repeat=4))


def analytics():
    sums = []
    for n in HEIGHTS:
        count = sum(any(n in p for p in r) for r in ROLLS)
        partners = []
        for m in HEIGHTS:
            combo = sorted((n, m))
            ways = sum(sorted(p) == combo for r in ROLLS for p in r)
            count_pair = sum(any(sorted(p) == combo for p in r) for r in ROLLS)
            partners.append(dict(n=m, rollCount=count_pair, p=count_pair/1296, ways=ways))
        sums.append(dict(n=n, count=count, p=count/1296, partners=sorted(partners, key=lambda x: (-x['ways'], x['n']))))
    triples = []
    for cols in combinations(HEIGHTS, 3):
        gains = [max(sum(n in cols for n in p) for p in r) for r in ROLLS]
        count = sum(g > 0 for g in gains)
        p = count/1296
        median = 1
        while 1-p**median <= .5:
            median += 1
        triples.append(dict(cols=list(cols), count=count, p=p, meanBust=1/(1-p), medianBust=median, gain=sum(gains)/1296))
    triples.sort(key=lambda x: (-x['p'], -x['gain'], x['cols']))
    return dict(sums=sums, triples=triples, rolls=ROLLS)


class Game:
    def __init__(self):
        self.progress = [{n: 0 for n in HEIGHTS} for _ in range(2)]
        self.claimed = {}
        self.active = {}
        self.player = 0
        self.winner = None

    def can_step(self, n, active):
        return n not in self.claimed and active.get(n, self.progress[self.player][n]) < HEIGHTS[n] and (n in active or len(active) < 3)

    def legal_moves(self, pairs):
        moves = set()
        for pair in pairs:
            choices = []
            for order in (pair, pair[::-1]):
                active = self.active.copy()
                steps = []
                for n in order:
                    if self.can_step(n, active):
                        active[n] = active.get(n, self.progress[self.player][n]) + 1
                        steps.append(n)
                choices.append(tuple(sorted(steps)))
            length = max(map(len, choices))
            moves.update(c for c in choices if len(c) == length and c)
        return sorted(moves)

    def move(self, steps):
        active = self.active.copy()
        for n in steps:
            if not self.can_step(n, active):
                raise ValueError('Illegal step')
            active[n] = active.get(n, self.progress[self.player][n]) + 1
        self.active = active

    def bust(self):
        self.active = {}
        self.player = 1-self.player

    def stop(self):
        for n, v in self.active.items():
            self.progress[self.player][n] = v
            if v == HEIGHTS[n]:
                self.claimed[n] = self.player
        if sum(p == self.player for p in self.claimed.values()) >= 5:
            self.winner = self.player
        self.bust()


@lru_cache(maxsize=None)
def survival(active, available):
    usable = set(available) if len(active) < 3 else set(active).intersection(available)
    return sum(any(n in usable for pair in roll for n in pair) for roll in ROLLS)/1296


def features(g):
    p = g.player
    available = tuple(n for n in HEIGHTS if n not in g.claimed and g.active.get(n, 0) < HEIGHTS[n])
    risk = 1-survival(tuple(sorted(g.active)), available)
    gain = sum((v-g.progress[p][n])/HEIGHTS[n] for n, v in g.active.items())
    pending = sum(v == HEIGHTS[n] for n, v in g.active.items())
    own = sum(v == p for v in g.claimed.values())
    opp = len(g.claimed)-own
    threat = max((g.progress[1-p][n]/HEIGHTS[n] for n in HEIGHTS if n not in g.claimed), default=0)
    return [gain, risk, pending, own, opp, threat, 3-len(g.active)]


@lru_cache(maxsize=32768)
def expected_normalized_gain(active, available, remaining):
    # Exact best immediate normalized step gain; heights constrain doubles.
    active = set(active)
    available = set(available)
    remaining = dict(remaining)
    total = 0.0
    for roll in ROLLS:
        best = 0.0
        for pair in roll:
            for order in (pair, pair[::-1]):
                used = set(active)
                taken = {}
                value = 0.0
                for n in order:
                    if n in available and (n in used or len(used) < 3) and taken.get(n, 0) < remaining.get(n, 2):
                        used.add(n)
                        taken[n] = taken.get(n, 0)+1
                        value += 1/HEIGHTS[n]
                best = max(best, value)
        total += best
    return total/1296


def teacher(g, x=None):
    x = features(g) if x is None else x
    gain, risk, pending, own, opp, threat, free = x
    if own+pending >= 5:
        return 'STOP'
    # Race-aware risk aversion; secure near-victory and contested summits.
    if pending and (risk > .08 or own >= 3 or threat >= .7):
        return 'STOP'
    available = tuple(n for n in HEIGHTS if n not in g.claimed and g.active.get(n, 0) < HEIGHTS[n])
    remaining = tuple((n, 1) for n in available if HEIGHTS[n]-g.active.get(n, g.progress[g.player][n]) == 1)
    expected = expected_normalized_gain(tuple(sorted(g.active)), available, remaining)
    loss = gain + pending*.6
    risk_aversion = 1.15 + .35*threat + .10*own - .07*opp
    return 'ROLL' if expected > risk*loss*risk_aversion else 'STOP'


def best_pairing(g, dice):
    """Return legal steps for a supplied four-die outcome, or None on bust.

    This is a deterministic race-aware heuristic, not an optimal solver.
    """
    options = g.legal_moves(pairings(dice))
    if not options:
        return None
    def score(steps):
        active = g.active.copy()
        score = 0.0
        for n in steps:
            v = active.get(n, g.progress[g.player][n])+1
            active[n] = v
            opponent = g.progress[1-g.player][n]/HEIGHTS[n]
            score += (1 + .65*opponent)/HEIGHTS[n]
            if v == HEIGHTS[n]:
                score += .8 + .6*opponent
                if sum(p == g.player for p in g.claimed.values()) + sum(v == HEIGHTS[k] for k, v in active.items()) >= 5:
                    score += 100
        return score, tuple(-n for n in steps)
    return max(options, key=score)

