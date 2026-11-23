import { describe, expect, it } from 'vitest';
import { adviseCall, analyze, findMahjong, suggestDiscard, type Info } from '../src/engine/analysis';
import { botAction } from '../src/engine/bot';
import { BUILTIN_CARD } from '../src/engine/builtinCard';
import { parseCard } from '../src/engine/card';
import { isPending, newGame, reduce, type GameState } from '../src/engine/game';
import { BAM, CRAK, DOT, EAST, FLOWER, GREEN, JOKER, NORTH, SOAP, SOUTH, countTiles, fullSet, mulberry32, type Tile } from '../src/engine/tiles';
import { viewFor } from '../src/engine/view';

const card = parseCard(BUILTIN_CARD);
const b = (n: number) => BAM + n - 1;
const c = (n: number) => CRAK + n - 1;
const d = (n: number) => DOT + n - 1;
const rep = (t: Tile, n: number) => Array<Tile>(n).fill(t);
const info = (rack: Tile[], extra: Partial<Info> = {}): Info => ({ rack, exposures: [], others: [], discards: [], ...extra });

describe('tile set', () => {
  it('has 152 tiles', () => expect(fullSet().length).toBe(152));
});

describe('card notation', () => {
  it('built-in card parses cleanly', () => {
    expect(card.errors).toEqual([]);
    expect(card.hands.length).toBeGreaterThan(40);
    for (const v of card.variants) expect(v.groups.reduce((s, g) => s + g.n, 0)).toBe(14);
  });
  it('expands suits and runs', () => {
    const one = parseCard('FF 1111a 2222a 3333a | 25 | run');
    expect(one.variants.length).toBe(3 * 7);
    const like = parseCard('FF 1111a 1111b 1111c | 25 | run');
    expect(like.variants.length).toBe(9);
    const fixed = parseCard('FF 2222a 4444a 6666a | 25');
    expect(fixed.variants.length).toBe(3);
  });
  it('matches dragons to suits and supports any dragon / any wind', () => {
    const m = parseCard('FF 111a 222a 333a DDDa | 30');
    expect(m.variants.every((v) => v.groups.some((g) => g.t === [GREEN, 32, SOAP][Math.floor(v.groups.find((x) => x.t < 27)!.t / 9)]))).toBe(true);
    expect(parseCard('FFFF NNNN SSSS DDx | 25').variants.length).toBe(3);
    expect(parseCard('VVVV FFFF 1111a 22a | 25').variants.length).toBe(12);
  });
  it('reports errors with line numbers', () => {
    const bad = parseCard('FF 1111a | 25\nFF 1111 2222a 3333a | 25\nhello | 25\nFF 1111a 2222a 3333a');
    expect(bad.errors.map((e) => e.line)).toEqual([1, 2, 3, 4]);
    expect(bad.errors[0].message).toMatch(/6 tiles/);
  });
  it('keeps = tokens fixed in run hands', () => {
    const k = parseCard('=2026a 1111b 1111c FF | 30 | run');
    expect(k.variants.length).toBe(3 * 9); // b and c are interchangeable
    expect(k.variants.every((v) => v.groups.some((g) => g.t === SOAP))).toBe(true);
  });
});

describe('analysis', () => {
  const evens = [FLOWER, FLOWER, ...rep(b(2), 4), ...rep(b(4), 4), ...rep(b(6), 3)];
  it('counts tiles away', () => {
    const top = analyze(card, info(evens))[0];
    expect(top.hand.text).toBe('FF 2222a 4444a 6666a');
    expect(top.away).toBe(1);
    expect(top.needs).toEqual([{ t: b(6), count: 1, unseen: 1, jokerOk: true }]);
  });
  it('lets jokers fill groups of three or more but not pairs', () => {
    const withJoker = [FLOWER, JOKER, ...rep(b(2), 4), ...rep(b(4), 4), ...rep(b(6), 3)];
    const o = analyze(card, info(withJoker), 60).find((h) => h.hand.text === 'FF 2222a 4444a 6666a')!;
    expect(o.away).toBe(1); // joker completes the kong, the flower pair still needs a real flower
    expect(o.needs).toEqual([{ t: FLOWER, count: 1, unseen: 7, jokerOk: false }]);
    expect(findMahjong(card, [FLOWER, FLOWER, JOKER, ...rep(b(2), 4), ...rep(b(4), 4), ...rep(b(6), 3)], [])?.hand.text).toBe('FF 2222a 4444a 6666a');
    expect(findMahjong(card, [FLOWER, JOKER, ...rep(b(2), 4), ...rep(b(4), 4), ...rep(b(6), 4)], [])).toBeNull();
  });
  it('marks a hand dead when a pair tile is gone', () => {
    // Needs a pair of 9 dots; all four are in the discards.
    const rack = [...rep(b(1), 3), ...rep(b(3), 3), ...rep(c(5), 3), ...rep(c(7), 3), d(2)];
    const find = (i: Info) => analyze(card, i, 99).find((h) => h.hand.text === '111a 333b 555c 777a 99b');
    expect(find(info(rack))?.dead).toBe(false);
    const gone = info(rack, { discards: [...rep(b(9), 4), ...rep(c(9), 4), ...rep(d(9), 4)] });
    const o = find(gone)!;
    expect(o.dead).toBe(true);
    expect(o.deadReason).toMatch(/left for the pair/);
  });
  it('marks a kong dead only when tiles and jokers are both gone', () => {
    const rack = [FLOWER, FLOWER, ...rep(b(2), 4), ...rep(b(4), 4), b(6), d(1), d(3)];
    const find = (i: Info) => analyze(card, i, 99).find((h) => h.hand.text === 'FF 2222a 4444a 6666a')!;
    expect(find(info(rack, { discards: rep(b(6), 3) })).dead).toBe(false); // jokers can still fill it
    const sixes = [...rep(b(6), 3), ...rep(c(6), 3), ...rep(d(6), 3)];
    expect(find(info(rack, { discards: [...sixes, ...rep(JOKER, 8)] })).dead).toBe(true);
  });
  it('respects exposures and concealed hands', () => {
    const exposures = [{ tile: b(2), tiles: rep(b(2), 4) }];
    const rack = [FLOWER, FLOWER, ...rep(b(4), 4), ...rep(b(6), 4)];
    expect(findMahjong(card, rack, exposures)?.hand.text).toBe('FF 2222a 4444a 6666a');
    // A pung of 2 bam fits no kong hand.
    const all = analyze(card, info(rack.slice(1), { exposures: [{ tile: b(2), tiles: rep(b(2), 3) }] }), 99);
    expect(all.some((h) => h.hand.text === 'FF 2222a 4444a 6666a')).toBe(false);
    expect(all.some((h) => h.hand.concealed)).toBe(false);
  });
  it('lays out a winning hand in card order with jokers in their groups', () => {
    // FF 2222a 4444a 6666a with the 4s exposed (one joker) and a joker in the 6s.
    const exposures = [{ tile: b(4), tiles: [b(4), b(4), JOKER, b(4)] }];
    const rack = [b(6), JOKER, b(2), FLOWER, b(6), b(2), b(6), FLOWER, b(2), b(2)];
    const win = findMahjong(card, rack, exposures)!;
    expect(win.hand.text).toBe('FF 2222a 4444a 6666a');
    expect(win.groups).toEqual([
      { tiles: [FLOWER, FLOWER], exposed: false },
      { tiles: rep(b(2), 4), exposed: false },
      { tiles: [b(4), b(4), JOKER, b(4)], exposed: true },
      { tiles: [b(6), b(6), b(6), JOKER], exposed: false },
    ]);
  });
  it('suggests discarding the tile that helps least', () => {
    expect(suggestDiscard(card, info([...evens, NORTH]))).toBe(NORTH);
  });
  it('advises calls', () => {
    const rack = [FLOWER, FLOWER, ...rep(b(2), 4), ...rep(b(4), 4), ...rep(b(6), 3)];
    const win = adviseCall(card, info(rack, { discards: [b(6)] }), b(6));
    expect(win.mahjong).toBe(true);
    const r2 = [FLOWER, FLOWER, ...rep(b(2), 4), ...rep(b(4), 3), ...rep(b(6), 2), EAST, SOUTH];
    const a = adviseCall(card, info(r2, { discards: [b(4)] }), b(4));
    expect(a).toMatchObject({ mahjong: false, canExpose: true, recommend: true, best: { naturals: 3, jokers: 0 } });
    expect(adviseCall(card, info(r2, { discards: [EAST] }), EAST).canExpose).toBe(false);
  });
});

function playOut(seed: number): GameState {
  let s = newGame(mulberry32(seed), seed % 4);
  for (let step = 0; step < 3000 && s.phase !== 'over'; step++) {
    const seat = [0, 1, 2, 3].find((i) => isPending(s, i));
    if (seat === undefined) throw new Error('nobody can move');
    const a = botAction(viewFor(s, seat, card), card);
    if (!a) throw new Error('bot has no move');
    s = reduce(s, seat, a, card);
    const all = [...s.wall, ...s.discards, ...s.players.flatMap((p) => [...p.rack, ...p.exposures.flatMap((e) => e.tiles)])];
    expect(countTiles(all)).toEqual(countTiles(fullSet()));
    if (s.phase === 'play' && s.stage === 'discard') {
      s.players.forEach((p, i) => {
        const n = p.rack.length + p.exposures.reduce((x, e) => x + e.tiles.length, 0);
        expect(n).toBe(i === s.turn ? 14 : 13);
      });
    }
  }
  return s;
}

describe('game', () => {
  it('deals 14 to East and 13 to the others', () => {
    const s = newGame(mulberry32(1), 2);
    expect(s.players.map((p) => p.rack.length)).toEqual([13, 13, 14, 13]);
    expect(s.wall.length).toBe(152 - 53);
  });
  it('rejects illegal actions', () => {
    const s = newGame(mulberry32(1));
    expect(() => reduce(s, 0, { type: 'discard', tile: s.players[0].rack[0] }, card)).toThrow();
    expect(() => reduce(s, 0, { type: 'pass', tiles: s.players[0].rack.slice(0, 2) }, card)).toThrow(/three/);
    expect(() => reduce(s, 0, { type: 'pass', tiles: [JOKER, JOKER, JOKER] }, card)).toThrow();
  });
  it('passes tiles the right way round, including blind passes', () => {
    let s = newGame(mulberry32(7));
    const before = s.players.map((p) => [...p.rack]);
    const picks = before.map((r) => r.filter((t) => t !== JOKER).slice(0, 3));
    for (let i = 0; i < 4; i++) s = reduce(s, i, { type: 'pass', tiles: picks[i] }, card);
    // Seat 1 is to the right of seat 0 and receives seat 0's tiles.
    for (const t of new Set(picks[0])) {
      const got = countTiles(s.players[1].rack)[t] - countTiles(before[1])[t] + picks[1].filter((x) => x === t).length;
      expect(got).toBe(picks[0].filter((x) => x === t).length);
    }
    for (let i = 0; i < 4; i++) s = reduce(s, i, { type: 'pass', tiles: s.players[i].rack.filter((t) => t !== JOKER).slice(0, 3) }, card);
    // Blind pass to the left: seat 0 gives nothing of its own, so its rack is untouched.
    const rack0 = [...s.players[0].rack];
    s = reduce(s, 0, { type: 'pass', tiles: [] }, card);
    for (let i = 1; i < 4; i++) s = reduce(s, i, { type: 'pass', tiles: s.players[i].rack.filter((t) => t !== JOKER).slice(0, 3) }, card);
    expect(s.players[0].rack).toEqual(rack0);
    expect(s.players.map((p) => p.rack.length)).toEqual([14, 13, 13, 13]);
    expect(s.ch?.stage).toBe('vote');
  });
  it('gives mahjong priority over an exposure and pays the discarder double', () => {
    let s = newGame(mulberry32(3));
    s.phase = 'play';
    s.ch = null;
    s.players[0].rack = [b(6), ...s.players[0].rack.slice(1)];
    s.players[1].rack = [b(6), b(6), ...s.players[1].rack.slice(2)];
    s.players[2].rack = [FLOWER, FLOWER, ...rep(b(2), 4), ...rep(b(4), 4), ...rep(b(6), 3)].slice(0, 13);
    s.players[2].rack = [FLOWER, FLOWER, ...rep(b(2), 4), ...rep(b(4), 4), b(6), JOKER, JOKER];
    s = reduce(s, 0, { type: 'discard', tile: b(6) }, card);
    expect(s.responses[3]).toEqual({ kind: 'pass' });
    s = reduce(s, 1, { type: 'call', response: { kind: 'expose', naturals: 2, jokers: 0 } }, card);
    s = reduce(s, 2, { type: 'call', response: { kind: 'mahjong' } }, card);
    expect(s.result?.winner).toBe(2);
    expect(s.result?.payments).toEqual([-50, -25, 100, -25]);
  });
  it('supports joker exchange', () => {
    let s = newGame(mulberry32(4));
    s.phase = 'play';
    s.ch = null;
    s.players[1].exposures = [{ tile: NORTH, tiles: [NORTH, NORTH, JOKER] }];
    s.players[0].rack[0] = NORTH;
    s = reduce(s, 0, { type: 'exchange', seat: 1, index: 0 }, card);
    expect(s.players[1].exposures[0].tiles).toEqual([NORTH, NORTH, NORTH]);
    expect(s.players[0].rack).toContain(JOKER);
  });
  it('hides other racks in a player view', () => {
    const s = newGame(mulberry32(5));
    const v = viewFor(s, 1, card);
    expect(v.rack).toEqual(s.players[1].rack);
    expect(JSON.stringify(v.players)).not.toContain('"rack":');
  });
  it('plays complete bot games without breaking any invariant', () => {
    let wins = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = playOut(seed);
      expect(s.phase).toBe('over');
      expect(s.result!.payments.reduce((a, x) => a + x, 0)).toBe(0);
      if (s.result!.winner !== null) {
        wins++;
        const w = s.players[s.result!.winner];
        const held = [...w.rack, ...w.exposures.flatMap((e) => e.tiles)];
        expect(countTiles(s.result!.groups!.flatMap((g) => g.tiles))).toEqual(countTiles(held));
      }
    }
    console.log(`bot games won: ${wins}/40`);
    expect(wins).toBeGreaterThan(0);
  }, 120000);
});
