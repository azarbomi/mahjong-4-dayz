import type { Card, Hand, Variant } from './card';
import { JOKER, NT, TOTAL, tileName, type Tile } from './tiles';

export interface Exposure {
  /** The tile the group is made of. */
  tile: Tile;
  /** The actual tiles on the table: naturals and jokers. */
  tiles: Tile[];
}

/** Everything one player can see. */
export interface Info {
  rack: Tile[];
  exposures: Exposure[];
  /** Other players' exposures. */
  others: Exposure[];
  discards: Tile[];
}

interface Ctx {
  counts: Int16Array;
  jokers: number;
  exposures: Exposure[];
  unseen: Int16Array;
  /** Jokers that could still come to this player (in the wall, other racks, or redeemable). */
  reachJ: number;
}

export function makeCtx(info: Info): Ctx {
  const counts = new Int16Array(NT);
  const unseen = Int16Array.from(TOTAL);
  for (const t of info.rack) {
    counts[t]++;
    unseen[t]--;
  }
  for (const t of info.discards) unseen[t]--;
  for (const e of info.exposures) for (const t of e.tiles) unseen[t]--;
  for (const e of info.others) for (const t of e.tiles) unseen[t]--;
  let reachJ = unseen[JOKER];
  for (const e of info.others) {
    const j = e.tiles.filter((t) => t === JOKER).length;
    if (j && (counts[e.tile] > 0 || unseen[e.tile] > 0)) reachJ += j;
  }
  const jokers = counts[JOKER];
  counts[JOKER] = 0;
  return { counts, jokers, exposures: info.exposures, unseen, reachJ };
}

// Scratch space reused across evaluations.
const left = new Int16Array(NT);
const smallNeed = new Int16Array(NT);
const bigNeed = new Int16Array(NT);
const R = { away: 0, score: 0, dead: false, mask: 0 };

/** Evaluate one variant into R. Returns false when it cannot fit this player's exposures. */
function evalVariant(hand: Hand, v: Variant, c: Ctx): boolean {
  const gs = v.groups;
  let mask = 0;
  if (c.exposures.length) {
    if (hand.concealed) return false;
    for (const e of c.exposures) {
      let found = -1;
      for (let i = 0; i < gs.length; i++) {
        if (!((mask >> i) & 1) && gs[i].t === e.tile && gs[i].n === e.tiles.length) {
          found = i;
          break;
        }
      }
      if (found < 0) return false;
      mask |= 1 << found;
    }
  }
  left.set(c.counts);
  let S = 0;
  let B = 0;
  for (let i = 0; i < gs.length; i++) {
    if ((mask >> i) & 1) continue;
    const { t, n } = gs[i];
    const have = left[t] < n ? left[t] : n;
    left[t] -= have;
    const miss = n - have;
    if (miss) {
      if (n < 3) {
        S += miss;
        smallNeed[t] += miss;
      } else {
        B += miss;
        bigNeed[t] += miss;
      }
    }
  }
  let dead = false;
  let smallCost = 0;
  let bigCost = 0;
  let shortfall = 0;
  if (S || B) {
    for (let i = 0; i < gs.length; i++) {
      const t = gs[i].t;
      const s = smallNeed[t];
      const b = bigNeed[t];
      if (!s && !b) continue;
      const u = c.unseen[t];
      if (s) {
        if (u < s) dead = true;
        smallCost += s * (1.3 + 0.8 * (1 - Math.max(u, 0) / TOTAL[t]));
      }
      if (b) {
        const avail = Math.max(0, u - s);
        if (b > avail) shortfall += b - avail;
        bigCost += b * (1 + 0.5 * (1 - avail / TOTAL[t]));
      }
      smallNeed[t] = 0;
      bigNeed[t] = 0;
    }
  }
  const bigAway = Math.max(0, B - c.jokers);
  if (shortfall > c.jokers + c.reachJ) dead = true;
  R.away = S + bigAway;
  R.dead = dead;
  R.mask = mask;
  R.score = R.away === 0 ? 0 : (smallCost + (B ? (bigCost * bigAway) / B : 0)) * (hand.concealed ? 1.15 : 1) - hand.value / 250;
  return true;
}

export interface GroupStatus {
  t: Tile;
  n: number;
  /** Written position on the card. */
  i: number;
  /** Real tiles held for this group. */
  have: number;
  /** Jokers from the rack assigned to it. */
  jokers: number;
  miss: number;
  exposed: boolean;
}

export interface HandOption {
  hand: Hand;
  away: number;
  score: number;
  dead: boolean;
  deadReason?: string;
  groups: GroupStatus[];
  /** Tiles still needed, with how many copies are unaccounted for. */
  needs: { t: Tile; count: number; unseen: number; jokerOk: boolean }[];
  /** How many of each rack tile this hand uses (index = tile id, jokers included). */
  used: number[];
}

function detail(hand: Hand, v: Variant, c: Ctx, away: number, score: number, dead: boolean, mask: number): HandOption {
  const leftD = Array.from(c.counts);
  let jok = c.jokers;
  const used = new Array<number>(NT).fill(0);
  const groups: GroupStatus[] = v.groups.map((g, i) => {
    if ((mask >> i) & 1) return { ...g, have: g.n, jokers: 0, miss: 0, exposed: true };
    const have = Math.min(leftD[g.t], g.n);
    leftD[g.t] -= have;
    used[g.t] += have;
    return { ...g, have, jokers: 0, miss: g.n - have, exposed: false };
  });
  for (const g of groups) {
    if (g.n < 3 || !g.miss || !jok) continue;
    const j = Math.min(jok, g.miss);
    g.jokers = j;
    g.miss -= j;
    jok -= j;
    used[JOKER] += j;
  }
  const needMap = new Map<Tile, { count: number; jokerOk: boolean }>();
  let deadReason: string | undefined;
  for (const g of groups) {
    if (!g.miss) continue;
    const e = needMap.get(g.t) ?? { count: 0, jokerOk: true };
    e.count += g.miss;
    if (g.n < 3) e.jokerOk = false;
    needMap.set(g.t, e);
    if (g.n < 3 && c.unseen[g.t] < g.miss && !deadReason) deadReason = `No ${tileName(g.t)} left for the ${g.n === 1 ? 'single' : 'pair'}`;
  }
  if (dead && !deadReason) deadReason = 'Not enough tiles or jokers left';
  const needs = [...needMap].map(([t, e]) => ({ t, count: e.count, unseen: Math.max(0, c.unseen[t]), jokerOk: e.jokerOk }));
  // Show groups in a readable order: by tile, flowers first.
  return { hand, away, score, dead, deadReason: dead ? deadReason : undefined, groups, needs, used };
}

/** Best variant of every hand, fewest tiles away first (ties: easier tiles to get); dead hands last. */
export function analyze(card: Card, info: Info, top = 6, includeDead = true): HandOption[] {
  const c = makeCtx(info);
  const best = new Map<number, { v: Variant; away: number; score: number; dead: boolean; mask: number }>();
  for (const v of card.variants) {
    const hand = card.hands[v.hand];
    if (!evalVariant(hand, v, c)) continue;
    const cur = best.get(v.hand);
    if (!cur || (cur.dead && !R.dead) || (cur.dead === R.dead && R.score < cur.score)) {
      best.set(v.hand, { v, away: R.away, score: R.score, dead: R.dead, mask: R.mask });
    }
  }
  let list = [...best.values()];
  if (!includeDead) list = list.filter((b) => !b.dead);
  list.sort((a, b) => Number(a.dead) - Number(b.dead) || a.away - b.away || a.score - b.score);
  return list.slice(0, top).map((b) => detail(card.hands[b.v.hand], b.v, c, b.away, b.score, b.dead, b.mask));
}

function strengthOf(card: Card, variants: Variant[], c: Ctx): number {
  const best = new Map<number, number>();
  for (const v of variants) {
    if (!evalVariant(card.hands[v.hand], v, c) || R.dead) continue;
    const cur = best.get(v.hand);
    if (cur === undefined || R.score < cur) best.set(v.hand, R.score);
  }
  const scores = [...best.values()].sort((a, b) => a - b);
  let s = 0;
  for (let i = 0; i < scores.length && i < 4; i++) s += 0.5 ** i * Math.exp(-0.9 * scores[i]);
  return s;
}

/** The variants worth looking at when deciding what to give up. */
function candidates(card: Card, c: Ctx, n = 80): Variant[] {
  const scored: { v: Variant; s: number }[] = [];
  for (const v of card.variants) {
    if (evalVariant(card.hands[v.hand], v, c) && !R.dead) scored.push({ v, s: R.score });
  }
  scored.sort((a, b) => a.s - b.s);
  return scored.slice(0, n).map((x) => x.v);
}

function bestRemoval(card: Card, c: Ctx, cand: Variant[]): { tile: Tile; strength: number } | null {
  let best: { tile: Tile; strength: number } | null = null;
  for (let t = 0; t < NT; t++) {
    if (t === JOKER || !c.counts[t]) continue;
    c.counts[t]--;
    const s = strengthOf(card, cand, c);
    c.counts[t]++;
    if (!best || s > best.strength) best = { tile: t, strength: s };
  }
  return best;
}

/** The tile whose loss hurts least. Jokers are only offered when nothing else is held. */
export function suggestDiscard(card: Card, info: Info): Tile {
  const c = makeCtx(info);
  return bestRemoval(card, c, candidates(card, c))?.tile ?? JOKER;
}

/** Up to n tiles to pass in the Charleston (never jokers). */
export function suggestPass(card: Card, info: Info, n: number): Tile[] {
  const c = makeCtx(info);
  const cand = candidates(card, c, 160);
  const out: Tile[] = [];
  for (let i = 0; i < n; i++) {
    const b = bestRemoval(card, c, cand);
    if (!b) break;
    c.counts[b.tile]--;
    out.push(b.tile);
  }
  return out;
}

export interface Win {
  hand: Hand;
  jokerless: boolean;
  /** The hand in the order written on the card: each group's actual tiles, jokers included. */
  groups: { tiles: Tile[]; exposed: boolean }[];
}

export function findMahjong(card: Card, rack: Tile[], exposures: Exposure[]): Win | null {
  if (rack.length + exposures.reduce((s, e) => s + e.tiles.length, 0) !== 14) return null;
  const c = makeCtx({ rack, exposures, others: [], discards: [] });
  let best: { hand: Hand; v: Variant; mask: number } | null = null;
  for (const v of card.variants) {
    const hand = card.hands[v.hand];
    if (evalVariant(hand, v, c) && R.away === 0 && (!best || hand.value > best.hand.value)) best = { hand, v, mask: R.mask };
  }
  if (!best) return null;
  const { hand, v, mask } = best;
  const jokerless = !hand.singlesAndPairs && !rack.includes(JOKER) && !exposures.some((e) => e.tiles.includes(JOKER));
  // Pair each exposure with the group it fills (same matching order as evalVariant).
  const exposedTiles = new Map<number, Tile[]>();
  for (const e of exposures) {
    const gi = v.groups.findIndex((g, i) => !exposedTiles.has(i) && g.t === e.tile && g.n === e.tiles.length);
    exposedTiles.set(gi, e.tiles);
  }
  const status = detail(hand, v, c, 0, 0, false, mask).groups;
  const groups = status
    .map((g, gi) => ({
      i: g.i,
      exposed: g.exposed,
      tiles: exposedTiles.get(gi) ?? [...Array<Tile>(g.have).fill(g.t), ...Array<Tile>(g.jokers).fill(JOKER)],
    }))
    .sort((x, y) => x.i - y.i)
    .map(({ tiles, exposed }) => ({ tiles, exposed }));
  return { hand, jokerless, groups };
}

export interface CallAdvice {
  mahjong: boolean;
  canExpose: boolean;
  /** Best way to expose, when exposing is possible. */
  best: { naturals: number; jokers: number } | null;
  recommend: boolean;
}

/** May this rack call the tile for an exposure at all? */
export function canExpose(rack: Tile[], tile: Tile): boolean {
  if (tile === JOKER) return false;
  let n = 0;
  for (const t of rack) if (t === tile || t === JOKER) n++;
  return n >= 2;
}

/** Advice for a discard that was just thrown. `info.discards` must include that tile. */
export function adviseCall(card: Card, info: Info, tile: Tile): CallAdvice {
  const mahjong = tile !== JOKER && !!findMahjong(card, [...info.rack, tile], info.exposures);
  if (!canExpose(info.rack, tile)) return { mahjong, canExpose: false, best: null, recommend: false };
  const c0 = makeCtx(info);
  const passStrength = strengthOf(card, card.variants, c0);
  const nat = c0.counts[tile];
  const discards = [...info.discards];
  const di = discards.lastIndexOf(tile);
  if (di >= 0) discards.splice(di, 1);
  let best: { naturals: number; jokers: number; strength: number } | null = null;
  for (let size = 3; size <= 6; size++) {
    const naturals = Math.min(nat, size - 1);
    const jokers = size - 1 - naturals;
    if (jokers > c0.jokers) break;
    const rack = [...info.rack];
    for (let i = 0; i < naturals; i++) rack.splice(rack.indexOf(tile), 1);
    for (let i = 0; i < jokers; i++) rack.splice(rack.indexOf(JOKER), 1);
    const exposure: Exposure = { tile, tiles: [...Array(naturals + 1).fill(tile), ...Array(jokers).fill(JOKER)] };
    const c = makeCtx({ rack, exposures: [...info.exposures, exposure], others: info.others, discards });
    const cand = candidates(card, c);
    // After calling, a discard is owed; judge the position after the best one.
    const strength = rack.length ? (bestRemoval(card, c, cand)?.strength ?? strengthOf(card, cand, c)) : strengthOf(card, cand, c);
    if (!best || strength > best.strength + 1e-9) best = { naturals, jokers, strength };
  }
  return {
    mahjong,
    canExpose: true,
    best: best && { naturals: best.naturals, jokers: best.jokers },
    // Exposing commits the hand and shows it to the table, so it has to help clearly.
    recommend: !!best && best.strength > passStrength * 1.5,
  };
}
