import { canExpose, findMahjong, type Exposure } from './analysis';
import type { Card } from './card';
import { JOKER, fullSet, removeTiles, shuffle, sortTiles, tileName, type Rng, type Tile } from './tiles';

export type { Exposure };

export interface Player {
  rack: Tile[];
  exposures: Exposure[];
}

/** Charleston pass directions as seat offsets: right, across, left, then left, across, right. */
export const PASS_DIRS = [1, 2, 3, 3, 2, 1];
export const PASS_NAMES = ['right', 'across', 'left', 'left', 'across', 'right'];
/** Passes where a player may forward incoming tiles unseen instead of giving their own. */
export const BLIND_STEPS = [2, 5];

export interface Charleston {
  stage: 'pass' | 'vote' | 'courtesyOffer' | 'courtesyPass';
  /** Index into PASS_DIRS during the pass stage. */
  step: number;
  picks: (Tile[] | null)[];
  votes: (boolean | null)[];
  offers: (number | null)[];
}

export type CallResponse = { kind: 'pass' } | { kind: 'mahjong' } | { kind: 'expose'; naturals: number; jokers: number };

export interface Result {
  winner: number | null;
  handText?: string;
  handCategory?: string;
  value?: number;
  /** Seat that threw the winning tile, or null when self-drawn. */
  discarder?: number | null;
  jokerless?: boolean;
  /** The winning hand laid out in card order, group by group. */
  groups?: { tiles: Tile[]; exposed: boolean }[];
  payments: number[];
}

export interface GameState {
  players: Player[];
  wall: Tile[];
  /** Discards still on the table (called tiles leave this list). */
  discards: Tile[];
  dealer: number;
  phase: 'charleston' | 'play' | 'over';
  ch: Charleston | null;
  turn: number;
  stage: 'discard' | 'calls';
  lastDiscard: { tile: Tile; by: number } | null;
  responses: (CallResponse | null)[];
  /** Tile the current player just drew, for highlighting. */
  lastDrawn: Tile | null;
  result: Result | null;
  scores: number[];
  /** Recent events; "{n}" stands for seat n's name. */
  log: string[];
}

export type Action =
  | { type: 'pass'; tiles: Tile[] }
  | { type: 'vote'; again: boolean }
  | { type: 'offer'; count: number }
  | { type: 'discard'; tile: Tile }
  | { type: 'call'; response: CallResponse }
  | { type: 'exchange'; seat: number; index: number }
  | { type: 'mahjong' };

const blank = <T>(v: T): T[] => [v, v, v, v];

export function newGame(rng: Rng, dealer = 0, scores: number[] = [0, 0, 0, 0]): GameState {
  const wall = shuffle(fullSet(), rng);
  const players: Player[] = [0, 1, 2, 3].map(() => ({ rack: [], exposures: [] }));
  for (let s = 0; s < 4; s++) players[s].rack = sortTiles(wall.splice(0, s === dealer ? 14 : 13));
  return {
    players,
    wall,
    discards: [],
    dealer,
    phase: 'charleston',
    ch: { stage: 'pass', step: 0, picks: blank(null), votes: blank(null), offers: blank(null) },
    turn: dealer,
    stage: 'discard',
    lastDiscard: null,
    responses: blank(null),
    lastDrawn: null,
    result: null,
    scores: [...scores],
    log: ['Charleston: pass three tiles to the right'],
  };
}

function say(s: GameState, text: string) {
  s.log.push(text);
  if (s.log.length > 40) s.log.splice(0, s.log.length - 40);
}

/** How many tiles this seat owes in a courtesy pass. */
export function courtesyCount(ch: Charleston, seat: number): number {
  return Math.min(ch.offers[seat] ?? 0, ch.offers[(seat + 2) % 4] ?? 0);
}

/** Does this seat owe a decision right now? */
export function isPending(s: GameState, seat: number): boolean {
  if (s.phase === 'charleston' && s.ch) {
    const ch = s.ch;
    if (ch.stage === 'pass') return ch.picks[seat] === null;
    if (ch.stage === 'vote') return ch.votes[seat] === null;
    if (ch.stage === 'courtesyOffer') return ch.offers[seat] === null;
    return ch.picks[seat] === null;
  }
  if (s.phase === 'play') return s.stage === 'discard' ? s.turn === seat : s.responses[seat] === null;
  return false;
}

function startPlay(s: GameState) {
  s.phase = 'play';
  s.ch = null;
  s.turn = s.dealer;
  s.stage = 'discard';
  for (const p of s.players) p.rack = sortTiles(p.rack);
  say(s, `{${s.dealer}} is East and discards first`);
}

function resolvePass(s: GameState, dir: number) {
  const ch = s.ch!;
  const picks = ch.picks as Tile[][];
  const prev = (i: number) => (i + 4 - dir) % 4;
  // outgoing[i][slot]: own picks first, remaining slots forwarded blind from what i receives.
  const resolve = (i: number, slot: number, depth: number): Tile | null => {
    if (slot < picks[i].length) return picks[i][slot];
    if (depth > 8) return null;
    return resolve(prev(i), slot - picks[i].length, depth + 1);
  };
  const outgoing = [0, 1, 2, 3].map((i) => [0, 1, 2].map((slot) => resolve(i, slot, 0)));
  for (let i = 0; i < 4; i++) {
    const k = picks[i].length;
    // Player keeps the last k incoming tiles; the first 3-k went straight on.
    const kept = outgoing[prev(i)].slice(3 - k).filter((t): t is Tile => t !== null);
    s.players[i].rack = sortTiles([...removeTiles(s.players[i].rack, picks[i]), ...kept]);
  }
}

function advanceCharleston(s: GameState) {
  const ch = s.ch!;
  if (ch.stage === 'pass') {
    if (ch.picks.some((p) => p === null)) return;
    resolvePass(s, PASS_DIRS[ch.step]);
    ch.picks = blank(null);
    if (ch.step === 2) {
      ch.stage = 'vote';
      say(s, 'First Charleston done. Do a second one?');
    } else if (ch.step === 5) {
      ch.stage = 'courtesyOffer';
      say(s, 'Courtesy pass: offer up to three tiles across');
    } else {
      ch.step++;
      say(s, `Charleston: pass three tiles ${PASS_NAMES[ch.step]}`);
    }
  } else if (ch.stage === 'vote') {
    if (ch.votes.some((v) => v === null)) return;
    if (ch.votes.every((v) => v)) {
      ch.stage = 'pass';
      ch.step = 3;
      say(s, 'Second Charleston: pass three tiles left');
    } else {
      ch.stage = 'courtesyOffer';
      say(s, 'No second Charleston. Courtesy pass: offer up to three tiles across');
    }
  } else if (ch.stage === 'courtesyOffer') {
    if (ch.offers.some((o) => o === null)) return;
    ch.stage = 'courtesyPass';
    ch.picks = [0, 1, 2, 3].map((i) => (courtesyCount(ch, i) === 0 ? [] : null));
    advanceCharleston(s);
  } else {
    if (ch.picks.some((p) => p === null)) return;
    const picks = ch.picks as Tile[][];
    for (let i = 0; i < 4; i++) {
      s.players[i].rack = sortTiles([...removeTiles(s.players[i].rack, picks[i]), ...picks[(i + 2) % 4]]);
    }
    startPlay(s);
  }
}

function finish(s: GameState, winner: number | null, card: Card, discarder: number | null) {
  s.phase = 'over';
  const payments = [0, 0, 0, 0];
  if (winner === null) {
    s.result = { winner: null, payments };
    say(s, 'Wall game: no tiles left, nobody wins');
    return;
  }
  const p = s.players[winner];
  const win = findMahjong(card, p.rack, p.exposures)!;
  const base = win.hand.value * (win.jokerless ? 2 : 1);
  for (let i = 0; i < 4; i++) {
    if (i === winner) continue;
    // Self-drawn: everyone pays double. Called: the discarder pays double.
    const pay = base * (discarder === null || discarder === i ? 2 : 1);
    payments[i] = -pay;
    payments[winner] += pay;
  }
  for (let i = 0; i < 4; i++) s.scores[i] += payments[i];
  s.result = {
    winner,
    handText: win.hand.text,
    handCategory: win.hand.category,
    value: win.hand.value,
    discarder,
    jokerless: win.jokerless,
    groups: win.groups,
    payments,
  };
  say(s, `{${winner}} declares Mahjong: ${win.hand.text} (${win.hand.value})`);
}

function drawFor(s: GameState, seat: number, card: Card) {
  s.lastDiscard = null;
  s.responses = blank(null);
  if (!s.wall.length) return finish(s, null, card, null);
  const t = s.wall.shift()!;
  s.players[seat].rack.push(t);
  s.lastDrawn = t;
  s.turn = seat;
  s.stage = 'discard';
}

function resolveCalls(s: GameState, card: Card) {
  if (s.responses.some((r) => r === null)) return;
  const { tile, by } = s.lastDiscard!;
  const order = [1, 2, 3].map((d) => (by + d) % 4);
  const mj = order.find((i) => s.responses[i]!.kind === 'mahjong');
  if (mj !== undefined) {
    s.discards.pop();
    s.players[mj].rack.push(tile);
    return finish(s, mj, card, by);
  }
  const ex = order.find((i) => s.responses[i]!.kind === 'expose');
  if (ex === undefined) return drawFor(s, (by + 1) % 4, card);
  const r = s.responses[ex] as { kind: 'expose'; naturals: number; jokers: number };
  const p = s.players[ex];
  const fromRack = [...Array(r.naturals).fill(tile), ...Array(r.jokers).fill(JOKER)];
  p.rack = removeTiles(p.rack, fromRack);
  p.exposures.push({ tile, tiles: [tile, ...fromRack] });
  s.discards.pop();
  s.lastDiscard = null;
  s.responses = blank(null);
  s.lastDrawn = null;
  s.turn = ex;
  s.stage = 'discard';
  say(s, `{${ex}} calls ${tileName(tile)} (${fromRack.length + 1} tiles)`);
}

/** Can this seat do anything with the current discard? */
export function callOptions(s: GameState, seat: number, card: Card): { expose: boolean; mahjong: boolean } {
  if (!s.lastDiscard || s.lastDiscard.by === seat || s.lastDiscard.tile === JOKER) return { expose: false, mahjong: false };
  const p = s.players[seat];
  const tile = s.lastDiscard.tile;
  return {
    expose: canExpose(p.rack, tile),
    mahjong: !!findMahjong(card, [...p.rack, tile], p.exposures),
  };
}

/** Apply one player's action. Returns the new state; throws an Error with a readable message if illegal. */
export function reduce(prev: GameState, seat: number, a: Action, card: Card): GameState {
  const s: GameState = structuredClone(prev);
  const p = s.players[seat];
  const fail = (msg: string): never => {
    throw new Error(msg);
  };

  if (s.phase === 'charleston') {
    const ch = s.ch!;
    if (a.type === 'pass' && (ch.stage === 'pass' || ch.stage === 'courtesyPass')) {
      if (ch.picks[seat] !== null) fail('You already passed');
      if (a.tiles.includes(JOKER)) fail('Jokers cannot be passed');
      if (ch.stage === 'pass') {
        const blind = BLIND_STEPS.includes(ch.step);
        if (a.tiles.length > 3 || (!blind && a.tiles.length !== 3)) fail('Pass exactly three tiles');
      } else if (a.tiles.length !== courtesyCount(ch, seat)) fail(`Pass exactly ${courtesyCount(ch, seat)} tiles`);
      removeTiles(p.rack, a.tiles);
      ch.picks[seat] = [...a.tiles];
    } else if (a.type === 'vote' && ch.stage === 'vote') {
      if (ch.votes[seat] !== null) fail('You already voted');
      ch.votes[seat] = a.again;
    } else if (a.type === 'offer' && ch.stage === 'courtesyOffer') {
      if (ch.offers[seat] !== null) fail('You already chose');
      if (![0, 1, 2, 3].includes(a.count)) fail('Offer 0 to 3 tiles');
      ch.offers[seat] = a.count;
    } else fail('Not possible right now');
    advanceCharleston(s);
    return s;
  }

  if (s.phase !== 'play') fail('The game is over');

  if (a.type === 'call') {
    if (s.stage !== 'calls' || s.responses[seat] !== null) fail('Nothing to call');
    const tile = s.lastDiscard!.tile;
    const r = a.response;
    if (r.kind === 'mahjong') {
      if (!findMahjong(card, [...p.rack, tile], p.exposures)) fail('That tile does not complete a hand on the card');
    } else if (r.kind === 'expose') {
      const size = r.naturals + r.jokers + 1;
      if (tile === JOKER || r.naturals < 0 || r.jokers < 0 || size < 3 || size > 6) fail('An exposure needs three to six tiles');
      if (p.rack.filter((t) => t === tile).length < r.naturals || p.rack.filter((t) => t === JOKER).length < r.jokers)
        fail('You do not hold those tiles');
    }
    s.responses[seat] = r;
    resolveCalls(s, card);
    return s;
  }

  if (s.stage !== 'discard' || s.turn !== seat) fail('It is not your turn');

  if (a.type === 'discard') {
    p.rack = sortTiles(removeTiles(p.rack, [a.tile]));
    s.discards.push(a.tile);
    s.lastDiscard = { tile: a.tile, by: seat };
    s.lastDrawn = null;
    s.stage = 'calls';
    say(s, `{${seat}} discards ${tileName(a.tile)}`);
    // Seats with no legal call pass automatically so play is not held up.
    s.responses = [0, 1, 2, 3].map((i) => {
      if (i === seat) return { kind: 'pass' as const };
      const o = callOptions(s, i, card);
      return o.expose || o.mahjong ? null : { kind: 'pass' as const };
    });
    resolveCalls(s, card);
  } else if (a.type === 'exchange') {
    const e = s.players[a.seat]?.exposures[a.index];
    if (!e) fail('No such exposure');
    const ji = e.tiles.indexOf(JOKER);
    if (ji < 0) fail('That exposure has no joker');
    p.rack = removeTiles(p.rack, [e.tile]);
    e.tiles[ji] = e.tile;
    p.rack.push(JOKER);
    s.lastDrawn = JOKER;
    say(s, `{${seat}} swaps ${tileName(e.tile)} for a joker`);
  } else if (a.type === 'mahjong') {
    if (!findMahjong(card, p.rack, p.exposures)) fail('Your tiles do not make a hand on the card');
    finish(s, seat, card, null);
  } else fail('Not possible right now');
  return s;
}
