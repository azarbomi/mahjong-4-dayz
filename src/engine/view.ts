import type { Info } from './analysis';
import type { Card } from './card';
import { BLIND_STEPS, PASS_NAMES, callOptions, courtesyCount, isPending, type Exposure, type GameState, type Result } from './game';
import type { Tile } from './tiles';

/** What one seat is allowed to see. This is the only game data sent to that player's phone. */
export interface PlayerView {
  seat: number;
  rack: Tile[];
  lastDrawn: Tile | null;
  players: { rackCount: number; exposures: Exposure[]; rack?: Tile[]; pending: boolean }[];
  discards: Tile[];
  wallCount: number;
  dealer: number;
  phase: GameState['phase'];
  ch: null | {
    stage: 'pass' | 'vote' | 'courtesyOffer' | 'courtesyPass';
    direction: string;
    blind: boolean;
    /** Exact number of tiles owed (courtesy pass), otherwise 3. */
    count: number;
  };
  turn: number;
  stage: GameState['stage'];
  lastDiscard: { tile: Tile; by: number } | null;
  /** Set while this seat must answer a discard. */
  call: { expose: boolean; mahjong: boolean } | null;
  pending: boolean;
  result: Result | null;
  scores: number[];
  log: string[];
}

export function viewFor(s: GameState, seat: number, card: Card): PlayerView {
  const over = s.phase === 'over';
  const ch = s.ch;
  return {
    seat,
    rack: s.players[seat].rack,
    lastDrawn: s.turn === seat ? s.lastDrawn : null,
    players: s.players.map((p, i) => ({
      rackCount: p.rack.length,
      exposures: p.exposures,
      rack: over ? p.rack : undefined,
      pending: isPending(s, i),
    })),
    discards: s.discards,
    wallCount: s.wall.length,
    dealer: s.dealer,
    phase: s.phase,
    ch: ch && {
      stage: ch.stage,
      direction: ch.stage === 'pass' ? PASS_NAMES[ch.step] : 'across',
      blind: ch.stage === 'pass' && BLIND_STEPS.includes(ch.step),
      count: ch.stage === 'courtesyPass' ? courtesyCount(ch, seat) : 3,
    },
    turn: s.turn,
    stage: s.stage,
    lastDiscard: s.lastDiscard,
    call: s.phase === 'play' && s.stage === 'calls' && s.responses[seat] === null ? callOptions(s, seat, card) : null,
    pending: isPending(s, seat),
    result: s.result,
    scores: s.scores,
    log: s.log,
  };
}

/** The public information a seat can base decisions on. */
export function infoFromView(v: PlayerView): Info {
  return {
    rack: v.rack,
    exposures: v.players[v.seat].exposures,
    others: v.players.flatMap((p, i) => (i === v.seat ? [] : p.exposures)),
    discards: v.discards,
  };
}
