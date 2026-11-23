import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { adviseCall, analyze, findMahjong, suggestDiscard, suggestPass } from '../engine/analysis';
import { getCard } from '../engine/card';
import { JOKER, sortTiles, tileName, type Tile } from '../engine/tiles';
import { infoFromView } from '../engine/view';
import { HintSheet, HintStrip } from './Hints';
import { CardList } from './CardScreen';
import type { Session } from './session';
import { prefs } from './session';
import { Backs, TileView } from './Tile';

const GROUP_NAMES: Record<number, string> = { 3: 'Pung', 4: 'Kong', 5: 'Quint', 6: 'Sextet' };
const WIND_ORDER = ['E', 'S', 'W', 'N'];
const POSITION = ['You', 'Right', 'Across', 'Left'];

const RACK_GAP = 5;

/** The player's own arrangement applied to the tiles they hold now: kept tiles stay put, new ones go on the end. */
function arrange(pref: Tile[], held: Tile[]): Tile[] {
  const left = [...held];
  const out: Tile[] = [];
  for (const t of pref) {
    const i = left.indexOf(t);
    if (i >= 0) {
      left.splice(i, 1);
      out.push(t);
    }
  }
  return [...out, ...left];
}

function moveItem<T>(arr: T[], from: number, to: number): T[] {
  const out = [...arr];
  out.splice(to, 0, ...out.splice(from, 1));
  return out;
}

function loadOrder(key: string): Tile[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [];
  } catch {
    return [];
  }
}

function Countdown({ seconds, resetKey }: { seconds: number; resetKey: string }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    setLeft(seconds);
    const start = Date.now();
    const id = setInterval(() => setLeft(Math.max(0, seconds - Math.floor((Date.now() - start) / 1000))), 250);
    return () => clearInterval(id);
  }, [seconds, resetKey]);
  return <span className="muted small">Passes automatically in {left}s</span>;
}

export function Table({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const c = session.client;
  useSyncExternalStore(c.subscribe, c.getVersion);
  const view = c.view!;
  const lobby = c.lobby!;
  const me = view.seat;
  const card = useMemo(() => getCard(lobby.cardText), [lobby.cardText]);
  const info = useMemo(() => infoFromView(view), [view]);
  const [hintsOn, setHintsOn] = useState(prefs.hints);
  const [sheet, setSheet] = useState<'hints' | 'menu' | 'card' | null>(null);
  const [focus, setFocus] = useState<number | null>(null);
  const [sel, setSel] = useState<number[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const discardsRef = useRef<HTMLElement>(null);
  useEffect(() => {
    discardsRef.current?.scrollTo({ top: discardsRef.current.scrollHeight });
  }, [view.discards.length]);

  // The rack is shown in the player's own order, remembered per room on this phone.
  const orderKey = `mj4d-order-${lobby.code}`;
  const [pref, setPref] = useState<Tile[]>(() => loadOrder(orderKey));
  const rack = useMemo(() => arrange(pref, view.rack), [pref, view.rack]);
  useEffect(() => {
    try {
      localStorage.setItem(orderKey, JSON.stringify(rack));
    } catch {
      /* storage unavailable */
    }
    if (rack.length !== pref.length || rack.some((t, i) => t !== pref[i])) setPref(rack);
  }, [rack, pref, orderKey]);

  // Dragging a rack tile to a new position.
  const rackRef = useRef<HTMLDivElement>(null);
  const rackNow = useRef(rack);
  rackNow.current = rack;
  const suppressClick = useRef(false);
  const [drag, setDrag] = useState<{ from: number; over: number; x: number; y: number } | null>(null);
  const geometry = () => {
    const r = rackRef.current!.getBoundingClientRect();
    const top = r.top + parseFloat(getComputedStyle(rackRef.current!).paddingTop);
    const w = (r.width - 6 * RACK_GAP) / 7;
    return { left: r.left, top, w, h: (w * 80) / 60 };
  };
  const slotAt = (x: number, y: number) => {
    const g = geometry();
    const col = Math.max(0, Math.min(6, Math.floor((x - g.left) / (g.w + RACK_GAP))));
    const row = Math.max(0, Math.floor((y - g.top) / (g.h + RACK_GAP)));
    return Math.min(rackNow.current.length - 1, row * 7 + col);
  };
  const startDrag = (from: number, e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let active = false;
    const move = (ev: PointerEvent) => {
      if (!active && Math.hypot(ev.clientX - x0, ev.clientY - y0) < 8) return;
      active = true;
      setDrag({ from, over: slotAt(ev.clientX, ev.clientY), x: ev.clientX, y: ev.clientY });
    };
    const end = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (!active) return;
      if (ev.type === 'pointerup') setPref(moveItem(rackNow.current, from, slotAt(ev.clientX, ev.clientY)));
      setDrag(null);
      // The click that follows a drag must not select the tile.
      suppressClick.current = true;
      setTimeout(() => (suppressClick.current = false), 60);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const name = (i: number) => (i === me ? 'You' : lobby.seats[i].name);
  const myTurn = view.phase === 'play' && view.stage === 'discard' && view.turn === me;
  const ch = view.phase === 'charleston' ? view.ch : null;
  const passing = !!ch && view.pending && (ch.stage === 'pass' || ch.stage === 'courtesyPass');

  const rackKey = rack.join(',') + view.phase + view.stage + (ch?.stage ?? '') + (ch?.direction ?? '');
  useEffect(() => setSel([]), [rackKey]);

  useEffect(() => {
    if (!c.error) return;
    setToast(c.error.message);
    const id = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(id);
  }, [c.error]);

  const options = useMemo(() => (hintsOn && view.phase !== 'over' ? analyze(card, info, 8) : []), [hintsOn, card, info, view.phase]);
  const suggested: Tile[] = useMemo(() => {
    if (!hintsOn) return [];
    if (passing) return suggestPass(card, info, ch!.count);
    if (myTurn) return [suggestDiscard(card, info)];
    return [];
  }, [hintsOn, passing, myTurn, card, info, ch]);
  const callAdvice = useMemo(
    () => (view.call && view.lastDiscard ? adviseCall(card, info, view.lastDiscard.tile) : null),
    [view.call, view.lastDiscard, card, info],
  );
  const canMahjong = myTurn && !!findMahjong(card, view.rack, info.exposures);

  // Which rack positions carry a hint dot, and which are dimmed while a hand is highlighted.
  const suggestIdx = useMemo(() => {
    const idx = new Set<number>();
    const pool = [...suggested];
    rack.forEach((t, i) => {
      const k = pool.indexOf(t);
      if (k >= 0) {
        pool.splice(k, 1);
        idx.add(i);
      }
    });
    return idx;
  }, [suggested, rack]);
  const focused = options.find((o) => o.hand.id === focus) ?? null;
  const usedIdx = useMemo(() => {
    if (!focused) return null;
    const left = [...focused.used];
    const idx = new Set<number>();
    rack.forEach((t, i) => {
      if (left[t] > 0) {
        left[t]--;
        idx.add(i);
      }
    });
    return idx;
  }, [focused, rack]);

  const toggle = (i: number) => {
    if (suppressClick.current) return;
    if (passing) {
      if (rack[i] === JOKER) return setToast('Jokers cannot be passed');
      setSel((s) => (s.includes(i) ? s.filter((x) => x !== i) : s.length < ch!.count ? [...s, i] : s));
    } else if (myTurn) setSel((s) => (s[0] === i ? [] : [i]));
  };
  const selTiles = sel.map((i) => rack[i]);
  const useSuggestion = () => setSel([...suggestIdx]);

  const exchanges = useMemo(() => {
    if (!myTurn) return [];
    const out: { seat: number; index: number; tile: Tile }[] = [];
    view.players.forEach((p, seat) =>
      p.exposures.forEach((e, index) => {
        if (e.tiles.includes(JOKER) && view.rack.includes(e.tile)) out.push({ seat, index, tile: e.tile });
      }),
    );
    return out;
  }, [myTurn, view.players, view.rack]);

  const exposeChoices = useMemo(() => {
    if (!view.call?.expose || !view.lastDiscard) return [];
    const t = view.lastDiscard.tile;
    const nat = view.rack.filter((x) => x === t).length;
    const jok = view.rack.filter((x) => x === JOKER).length;
    const out: { size: number; naturals: number; jokers: number }[] = [];
    for (let size = 3; size <= 6; size++) {
      const naturals = Math.min(nat, size - 1);
      const jokers = size - 1 - naturals;
      if (jokers <= jok) out.push({ size, naturals, jokers });
    }
    return out;
  }, [view.call, view.lastDiscard, view.rack]);

  const waitingOn = view.players.map((p, i) => (p.pending && i !== me ? name(i) : null)).filter(Boolean);
  const logLine = (view.log[view.log.length - 1] ?? '').replace(/\{(\d)\}/g, (_, d) => name(+d));

  let actions: React.ReactNode;
  if (view.phase === 'over') actions = null;
  else if (ch && !view.pending) actions = <p className="muted">Waiting for {waitingOn.join(', ') || 'the others'}…</p>;
  else if (ch && passing) {
    const need = ch.count;
    const ok = ch.blind ? sel.length <= 3 : sel.length === need;
    const label = ch.blind && sel.length < 3 ? `Pass ${sel.length} + ${3 - sel.length} blind` : `Pass ${sel.length}/${need} ${ch.direction}`;
    actions = (
      <>
        <p>
          {ch.stage === 'courtesyPass' ? 'Courtesy pass' : 'Charleston'}: choose {need} {need === 1 ? 'tile' : 'tiles'} to pass <b>{ch.direction}</b>
          {ch.blind ? ' (you may pass fewer and forward the rest unseen)' : ''}
        </p>
        <div className="btn-row">
          {hintsOn && suggested.length > 0 && (
            <button type="button" className="btn" onClick={useSuggestion}>
              Use hint
            </button>
          )}
          <button type="button" className="btn primary" disabled={!ok} onClick={() => c.act({ type: 'pass', tiles: selTiles })}>
            {label}
          </button>
        </div>
      </>
    );
  } else if (ch?.stage === 'vote')
    actions = (
      <>
        <p>First Charleston is done. Do a second one? Everyone must agree.</p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => c.act({ type: 'vote', again: false })}>
            Stop here
          </button>
          <button type="button" className="btn primary" onClick={() => c.act({ type: 'vote', again: true })}>
            Second Charleston
          </button>
        </div>
      </>
    );
  else if (ch?.stage === 'courtesyOffer')
    actions = (
      <>
        <p>Courtesy pass: how many tiles will you trade with {name((me + 2) % 4)}?</p>
        <div className="btn-row">
          {[0, 1, 2, 3].map((n) => (
            <button type="button" key={n} className="btn" onClick={() => c.act({ type: 'offer', count: n })}>
              {n}
            </button>
          ))}
        </div>
      </>
    );
  else if (view.call && view.lastDiscard) {
    const d = view.lastDiscard;
    actions = (
      <>
        <p className="call-line">
          {name(d.by)} discarded <TileView t={d.tile} size="sm" />
          {hintsOn && callAdvice && (
            <span className="hint-text">Hint: {callAdvice.mahjong ? 'Mahjong!' : callAdvice.recommend ? 'call it' : 'pass'}</span>
          )}
        </p>
        <div className="btn-row">
          <button type="button" className="btn" onClick={() => c.act({ type: 'call', response: { kind: 'pass' } })}>
            Pass
          </button>
          {exposeChoices.map((o) => (
            <button
              type="button"
              key={o.size}
              className="btn"
              onClick={() => c.act({ type: 'call', response: { kind: 'expose', naturals: o.naturals, jokers: o.jokers } })}
            >
              {GROUP_NAMES[o.size]}
              {o.jokers ? ` (${o.jokers}★)` : ''}
            </button>
          ))}
          {view.call.mahjong && (
            <button type="button" className="btn primary" onClick={() => c.act({ type: 'call', response: { kind: 'mahjong' } })}>
              Mahjong!
            </button>
          )}
        </div>
        <Countdown seconds={lobby.callSeconds} resetKey={`${view.discards.length}:${d.by}`} />
      </>
    );
  } else if (myTurn)
    actions = (
      <>
        <p>Your turn: choose a tile to discard</p>
        <div className="btn-row">
          {exchanges.map((x) => (
            <button type="button" key={`${x.seat}-${x.index}`} className="btn" onClick={() => c.act({ type: 'exchange', seat: x.seat, index: x.index })}>
              Swap {tileName(x.tile)} for ★
            </button>
          ))}
          {canMahjong && (
            <button type="button" className="btn primary" onClick={() => c.act({ type: 'mahjong' })}>
              Mahjong!
            </button>
          )}
          <button type="button" className="btn primary" disabled={sel.length !== 1} onClick={() => c.act({ type: 'discard', tile: selTiles[0] })}>
            {sel.length === 1 ? `Discard ${tileName(selTiles[0])}` : 'Discard'}
          </button>
        </div>
      </>
    );
  else actions = <p className="muted">Waiting for {waitingOn.join(', ') || name(view.turn)}…</p>;

  const result = view.result;
  return (
    <div className="table">
      <header className="topbar">
        <span className="small">
          {session.mode === 'solo' ? 'Solo' : `Room ${lobby.code}`} · Wall {view.wallCount}
        </span>
        <button type="button" className="btn ghost" onClick={() => setSheet('menu')}>
          Menu
        </button>
      </header>
      {c.status !== 'connected' && <div className="banner">Connection lost. Reconnecting…</div>}

      <section className="opps">
        {[3, 2, 1].map((d) => {
          const i = (me + d) % 4;
          const p = view.players[i];
          return (
            <div key={i} className={`opp${p.pending ? ' active' : ''}`}>
              <div className="opp-head">
                <span className="wind-badge">{WIND_ORDER[(i - view.dealer + 4) % 4]}</span>
                <span className="opp-name">{lobby.seats[i].name}</span>
                <Backs n={p.rackCount} />
              </div>
              <div className="muted opp-pos">
                {POSITION[d]}
                {!lobby.seats[i].connected && <span className="badge dead">away</span>}
              </div>
              {p.exposures.length > 0 && (
                <div className="exposures">
                  {p.exposures.map((e, k) => (
                    <span key={k} className="grp">
                      {e.tiles.map((t, j) => (
                        <TileView key={j} t={t} size="xs" />
                      ))}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="discards" aria-label="Discards" ref={discardsRef}>
        {view.discards.length === 0 && <span className="muted small">Discards will appear here</span>}
        {view.discards.map((t, i) => (
          <TileView key={i} t={t} size="sm" className={view.lastDiscard && i === view.discards.length - 1 ? 'last' : ''} />
        ))}
      </section>
      <div className="logline small" aria-live="polite">
        {logLine}
      </div>

      {hintsOn && view.phase !== 'over' && <HintStrip options={options} focus={focus} setFocus={setFocus} onOpen={() => setSheet('hints')} />}

      <section className="mine">
        <div className="mine-head">
          <span className="wind-badge">{WIND_ORDER[(me - view.dealer + 4) % 4]}</span>
          <span className="small">You · {view.scores[me]} pts</span>
          <button type="button" className="link sort" onClick={() => setPref(sortTiles(rack))}>
            Sort
          </button>
          <div className="exposures">
            {view.players[me].exposures.map((e, k) => (
              <span key={k} className="grp">
                {e.tiles.map((t, j) => (
                  <TileView key={j} t={t} size="xs" />
                ))}
              </span>
            ))}
          </div>
        </div>
        <div className="rack" ref={rackRef}>
          {drag
            ? moveItem(rack, drag.from, drag.over).map((t, i) => {
                if (i !== drag.over) return <TileView key={i} t={t} size="lg" onClick={() => {}} />;
                // The picked-up tile sits in its landing slot but is drawn under the finger.
                const g = geometry();
                const cx = g.left + (i % 7) * (g.w + RACK_GAP) + g.w / 2;
                const cy = g.top + Math.floor(i / 7) * (g.h + RACK_GAP) + g.h / 2;
                return (
                  <TileView
                    key="dragged"
                    t={t}
                    size="lg"
                    className="dragging"
                    style={{ transform: `translate(${drag.x - cx}px, ${drag.y - cy - 24}px) scale(1.12)` }}
                    onClick={() => {}}
                  />
                );
              })
            : rack.map((t, i) => {
                const cls = [
                  sel.includes(i) ? 'selected' : '',
                  suggestIdx.has(i) ? 'suggest' : '',
                  usedIdx && !usedIdx.has(i) ? 'dim' : '',
                  view.lastDrawn !== null && i === rack.length - 1 && t === view.lastDrawn ? 'drawn' : '',
                ].join(' ');
                return <TileView key={i} t={t} size="lg" className={cls} onClick={() => toggle(i)} onPointerDown={(e) => startDrag(i, e)} />;
              })}
        </div>
        <div className="actions">{actions}</div>
      </section>

      {toast && (
        <div className="toast" role="alert">
          {toast}
        </div>
      )}

      {sheet === 'hints' && <HintSheet options={options} onClose={() => setSheet(null)} />}
      {sheet === 'card' && (
        <div className="sheet-wrap" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Card" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>Card in play</h2>
              <button type="button" className="btn ghost" onClick={() => setSheet(null)}>
                Close
              </button>
            </div>
            <CardList card={card} />
          </div>
        </div>
      )}
      {sheet === 'menu' && (
        <div className="sheet-wrap" onClick={() => setSheet(null)}>
          <div className="sheet" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <h2>Menu</h2>
              <button type="button" className="btn ghost" onClick={() => setSheet(null)}>
                Close
              </button>
            </div>
            <table className="scores">
              <tbody>
                {lobby.seats.map((s, i) => (
                  <tr key={i}>
                    <td>{i === me ? `${s.name} (you)` : s.name}</td>
                    <td className="num">{view.scores[i]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="btn-col">
              <button
                type="button"
                className="btn"
                onClick={() => {
                  prefs.hints = !hintsOn;
                  setHintsOn(!hintsOn);
                  setSheet(null);
                }}
              >
                {hintsOn ? 'Turn hints off' : 'Turn hints on'}
              </button>
              <button type="button" className="btn" onClick={() => setSheet('card')}>
                View the card
              </button>
              <button type="button" className="btn danger" onClick={onLeave}>
                Leave game
              </button>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="sheet-wrap">
          <div className="sheet" role="dialog" aria-label="Game over">
            <h2>{result.winner === null ? 'Wall game' : `${name(result.winner)} ${result.winner === me ? 'win' : 'wins'}!`}</h2>
            {result.winner === null ? (
              <p>The wall ran out. Nobody scores.</p>
            ) : (
              <p>
                {result.handCategory}: <b>{result.handText}</b> · {result.value} points
                {result.jokerless ? ' · jokerless (double)' : ''} ·{' '}
                {result.discarder == null ? 'self-drawn, everyone pays double' : `${name(result.discarder)} threw the tile and ${result.discarder === me ? 'pay' : 'pays'} double`}
              </p>
            )}
            <table className="scores">
              <tbody>
                {[...view.players.keys()]
                  .sort((x, y) => Number(y === result.winner) - Number(x === result.winner))
                  .map((i) => {
                    const p = view.players[i];
                    return (
                  <tr key={i}>
                    <td>
                      <div>{name(i)}</div>
                      {i === result.winner && result.groups ? (
                        <div className="win-hand">
                          {result.groups.map((g, k) => (
                            <span key={k} className={`grp${g.exposed ? ' exposed' : ''}`}>
                              {g.tiles.map((t, j) => (
                                <TileView key={j} t={t} size="sm" />
                              ))}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <div className="reveal">
                          {p.exposures.flatMap((e) => e.tiles).map((t, j) => (
                            <TileView key={`e${j}`} t={t} size="xs" className="exposed-tile" />
                          ))}
                          {(p.rack ?? []).map((t, j) => (
                            <TileView key={j} t={t} size="xs" />
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="num">
                      {result.payments[i] > 0 ? '+' : ''}
                      {result.payments[i]}
                      <div className="muted small">{view.scores[i]} total</div>
                    </td>
                  </tr>
                    );
                  })}
              </tbody>
            </table>
            <div className="btn-col">
              {session.host ? (
                <button type="button" className="btn primary" onClick={() => session.host!.start()}>
                  Deal next game
                </button>
              ) : (
                <p className="muted">Waiting for {lobby.seats[lobby.hostSeat].name} to deal the next game…</p>
              )}
              <button type="button" className="btn" onClick={onLeave}>
                Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
