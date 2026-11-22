// Tile ids: 0-8 bam 1-9, 9-17 crak 1-9, 18-26 dot 1-9, 27-30 winds N E W S,
// 31 green dragon, 32 red dragon, 33 white dragon (soap), 34 flower, 35 joker.
export type Tile = number;

export const BAM = 0;
export const CRAK = 9;
export const DOT = 18;
export const NORTH = 27;
export const EAST = 28;
export const WEST = 29;
export const SOUTH = 30;
export const GREEN = 31;
export const RED = 32;
export const SOAP = 33;
export const FLOWER = 34;
export const JOKER = 35;
export const NT = 36;

/** Copies of each tile in the 152-tile American set. */
export const TOTAL: number[] = Array.from({ length: NT }, (_, t) => (t === FLOWER || t === JOKER ? 8 : 4));

/** Dragon that goes with each suit (bam-green, crak-red, dot-soap). */
export const DRAGON_OF_SUIT = [GREEN, RED, SOAP];
export const SUIT_NAMES = ['Bam', 'Crak', 'Dot'];
const WIND_NAMES = ['North', 'East', 'West', 'South'];

export const isSuited = (t: Tile) => t < 27;
export const suitOf = (t: Tile) => Math.floor(t / 9);
export const rankOf = (t: Tile) => (t % 9) + 1;

export function tileName(t: Tile): string {
  if (t < 27) return `${rankOf(t)} ${SUIT_NAMES[suitOf(t)]}`;
  if (t <= SOUTH) return WIND_NAMES[t - NORTH];
  if (t === GREEN) return 'Green Dragon';
  if (t === RED) return 'Red Dragon';
  if (t === SOAP) return 'Soap';
  if (t === FLOWER) return 'Flower';
  return 'Joker';
}

export function fullSet(): Tile[] {
  const out: Tile[] = [];
  for (let t = 0; t < NT; t++) for (let i = 0; i < TOTAL[t]; i++) out.push(t);
  return out;
}

export function countTiles(tiles: Tile[]): number[] {
  const c = new Array<number>(NT).fill(0);
  for (const t of tiles) c[t]++;
  return c;
}

export function sortTiles(tiles: Tile[]): Tile[] {
  // Jokers first, then flowers, then suits, winds, dragons.
  const key = (t: Tile) => (t === JOKER ? -2 : t === FLOWER ? -1 : t);
  return [...tiles].sort((a, b) => key(a) - key(b));
}

export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Remove one copy of each listed tile from a rack; throws if one is missing. */
export function removeTiles(rack: Tile[], tiles: Tile[]): Tile[] {
  const out = [...rack];
  for (const t of tiles) {
    const i = out.indexOf(t);
    if (i < 0) throw new Error(`You do not hold ${tileName(t)}`);
    out.splice(i, 1);
  }
  return out;
}
