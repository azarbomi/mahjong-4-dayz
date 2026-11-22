import { adviseCall, analyze, findMahjong, suggestDiscard, suggestPass } from './analysis';
import type { Card } from './card';
import type { Action } from './game';
import { JOKER } from './tiles';
import { infoFromView, type PlayerView } from './view';

/** Decide a computer player's move from exactly what a human in that seat would see. */
export function botAction(v: PlayerView, card: Card): Action | null {
  if (!v.pending) return null;
  const info = infoFromView(v);
  if (v.phase === 'charleston' && v.ch) {
    if (v.ch.stage === 'pass') return { type: 'pass', tiles: suggestPass(card, info, 3) };
    if (v.ch.stage === 'courtesyPass') return { type: 'pass', tiles: suggestPass(card, info, v.ch.count) };
    const best = analyze(card, info, 1, false)[0];
    if (v.ch.stage === 'vote') return { type: 'vote', again: !best || best.away >= 5 };
    // Offer as many tiles as the best hand has no use for.
    const spare = best ? v.rack.length - best.used.reduce((a, b) => a + b, 0) : 3;
    return { type: 'offer', count: Math.max(0, Math.min(3, spare)) };
  }
  if (v.phase !== 'play') return null;
  if (v.stage === 'calls') {
    if (!v.lastDiscard) return null;
    const advice = adviseCall(card, info, v.lastDiscard.tile);
    if (advice.mahjong) return { type: 'call', response: { kind: 'mahjong' } };
    if (advice.recommend && advice.best) return { type: 'call', response: { kind: 'expose', ...advice.best } };
    return { type: 'call', response: { kind: 'pass' } };
  }
  if (findMahjong(card, v.rack, info.exposures)) return { type: 'mahjong' };
  // Redeem a joker whenever a held tile matches an exposure that contains one.
  for (let seat = 0; seat < 4; seat++) {
    const exps = v.players[seat].exposures;
    for (let index = 0; index < exps.length; index++) {
      if (exps[index].tiles.includes(JOKER) && v.rack.includes(exps[index].tile)) return { type: 'exchange', seat, index };
    }
  }
  return { type: 'discard', tile: suggestDiscard(card, info) };
}
