import { DRAGON_OF_SUIT, EAST, FLOWER, GREEN, NORTH, RED, SOAP, SOUTH, TOTAL, WEST, type Tile } from './tiles';

/*
 Hand notation, one hand per line:   tokens | value | flags
   tokens   groups separated by spaces. Repeated symbols form a group: 2222a is a kong of 2s in suit a.
            Different symbols in one token are singles: 2026a, NEWS.
   symbols  1-9 number (needs a suit letter after the token)   0 soap
            F flower   N E W S winds   G R green / red dragon
            D dragon: DDDa = dragon matching suit a, DDDx = any dragon (x, y are different dragons)
            V any one wind (the same wind everywhere in the hand)
   suits    a b c after a token: three different suits, any assignment
   flags    C concealed.  run: every number may shift up or down together (covers "any run" and
            "any like number").  Put = in front of a token to keep it fixed in a run hand.
 Lines starting with # are category headings.
*/

type Sym =
  | { k: 'num'; n: number; suit: number; fixed: boolean }
  | { k: 'dragonOf'; suit: number }
  | { k: 'anyDragon'; v: number }
  | { k: 'anyWind' }
  | { k: 'tile'; t: Tile };

export interface Group {
  t: Tile;
  n: number;
  /** Position of the group as written on the card, for display. */
  i: number;
}

export interface Hand {
  id: number;
  category: string;
  text: string;
  value: number;
  concealed: boolean;
  run: boolean;
  /** No group of three or more, so no jokers can ever be used. */
  singlesAndPairs: boolean;
}

export interface Variant {
  hand: number;
  /** Groups ordered singles and pairs first (use each group's i for the written order). */
  groups: Group[];
}

export interface CardError {
  line: number;
  message: string;
}

export interface Card {
  hands: Hand[];
  variants: Variant[];
  errors: CardError[];
}

const FIXED: Record<string, Tile> = { F: FLOWER, N: NORTH, E: EAST, W: WEST, S: SOUTH, G: GREEN, R: RED, '0': SOAP };

function parseTokens(text: string): { sym: Sym; n: number }[] {
  const out: { sym: Sym; n: number }[] = [];
  for (const raw of text.trim().split(/\s+/)) {
    const m = /^(=?)([0-9FNEWSGRDV]+)([abcxy]?)$/.exec(raw);
    if (!m) throw new Error(`Cannot read "${raw}"`);
    const [, eq, body, suffix] = m;
    let i = 0;
    while (i < body.length) {
      const ch = body[i];
      let n = 1;
      while (body[i + n] === ch) n++;
      i += n;
      let sym: Sym;
      if (ch >= '1' && ch <= '9') {
        if (!'abc'.includes(suffix) || !suffix) throw new Error(`"${raw}" needs a suit letter a, b or c`);
        sym = { k: 'num', n: +ch, suit: 'abc'.indexOf(suffix), fixed: !!eq };
      } else if (ch === 'D') {
        if (!suffix) throw new Error(`"${raw}" needs a suit letter (a, b, c) or x / y for any dragon`);
        sym = 'abc'.includes(suffix) ? { k: 'dragonOf', suit: 'abc'.indexOf(suffix) } : { k: 'anyDragon', v: 'xy'.indexOf(suffix) };
      } else if (ch === 'V') sym = { k: 'anyWind' };
      else sym = { k: 'tile', t: FIXED[ch] };
      out.push({ sym, n });
    }
  }
  return out;
}

const PERMS3 = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

function expand(handIdx: number, groups: { sym: Sym; n: number }[], run: boolean): Variant[] {
  const nums = groups.filter((g) => g.sym.k === 'num' && !(g.sym as { fixed: boolean }).fixed).map((g) => (g.sym as { n: number }).n);
  const offsets: number[] = [];
  if (run && nums.length) {
    for (let d = 1 - Math.min(...nums); d <= 9 - Math.max(...nums); d++) offsets.push(d);
  } else offsets.push(0);
  const usesWind = groups.some((g) => g.sym.k === 'anyWind');
  const usesAnyDragon = groups.some((g) => g.sym.k === 'anyDragon');
  const winds = usesWind ? [NORTH, EAST, WEST, SOUTH] : [NORTH];
  const dragonPerms = usesAnyDragon ? PERMS3 : [PERMS3[0]];
  const seen = new Set<string>();
  const out: Variant[] = [];
  for (const sp of PERMS3)
    for (const dp of dragonPerms)
      for (const wind of winds)
        for (const d of offsets) {
          const gs: Group[] = groups.map(({ sym, n }, i) => {
            switch (sym.k) {
              case 'num':
                return { t: sp[sym.suit] * 9 + sym.n - 1 + (sym.fixed ? 0 : d), n, i };
              case 'dragonOf':
                return { t: DRAGON_OF_SUIT[sp[sym.suit]], n, i };
              case 'anyDragon':
                return { t: DRAGON_OF_SUIT[dp[sym.v]], n, i };
              case 'anyWind':
                return { t: wind, n, i };
              default:
                return { t: sym.t, n, i };
            }
          });
          gs.sort((a, b) => (a.n < 3 ? 0 : 1) - (b.n < 3 ? 0 : 1) || a.t - b.t || a.n - b.n);
          const key = gs.map((g) => `${g.t}:${g.n}`).join(',');
          if (seen.has(key)) continue;
          seen.add(key);
          // Singles and pairs need real tiles, so they cannot ask for more copies than exist.
          const small = new Map<Tile, number>();
          for (const g of gs) if (g.n < 3) small.set(g.t, (small.get(g.t) ?? 0) + g.n);
          if ([...small].some(([t, n]) => n > TOTAL[t])) continue;
          out.push({ hand: handIdx, groups: gs });
        }
  return out;
}

export function parseCard(text: string): Card {
  const card: Card = { hands: [], variants: [], errors: [] };
  let category = 'Hands';
  text.split('\n').forEach((rawLine, idx) => {
    const line = rawLine.trim();
    if (!line) return;
    if (line.startsWith('#')) {
      category = line.replace(/^#+\s*/, '') || 'Hands';
      return;
    }
    try {
      const parts = line.split('|').map((s) => s.trim());
      if (parts.length < 2) throw new Error('Add the value after a | (for example: FF 1111a 2222a 3333a | 25)');
      const value = Number(parts[1]);
      if (!Number.isFinite(value) || value <= 0) throw new Error(`"${parts[1]}" is not a point value`);
      const flags = (parts[2] ?? '').split(/[\s,]+/).filter(Boolean);
      const bad = flags.find((f) => !['C', 'c', 'run', 'n'].includes(f));
      if (bad) throw new Error(`Unknown flag "${bad}" (use C or run)`);
      const run = flags.includes('run') || flags.includes('n');
      const groups = parseTokens(parts[0]);
      const total = groups.reduce((s, g) => s + g.n, 0);
      if (total !== 14) throw new Error(`Hand has ${total} tiles, it needs 14`);
      const id = card.hands.length;
      const variants = expand(id, groups, run);
      if (!variants.length) throw new Error('This hand cannot be made from the tile set');
      card.hands.push({
        id,
        category,
        text: parts[0].replace(/\s+/g, ' '),
        value,
        concealed: flags.includes('C') || flags.includes('c'),
        run,
        singlesAndPairs: groups.every((g) => g.n < 3),
      });
      card.variants.push(...variants);
    } catch (e) {
      card.errors.push({ line: idx + 1, message: (e as Error).message });
    }
  });
  return card;
}

const cache = new Map<string, Card>();
export function getCard(text: string): Card {
  let c = cache.get(text);
  if (!c) {
    c = parseCard(text);
    if (cache.size > 8) cache.clear();
    cache.set(text, c);
  }
  return c;
}
