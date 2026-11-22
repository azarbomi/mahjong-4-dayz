import type { HandOption } from '../engine/analysis';
import { JOKER } from '../engine/tiles';
import { TileView } from './Tile';

/** A hand drawn as tiles: held tiles solid, jokers standing in, missing tiles as outlines. */
export function HandTiles({ o }: { o: HandOption }) {
  const groups = [...o.groups].sort((a, b) => a.i - b.i);
  return (
    <span className="hand-tiles">
      {groups.map((g, gi) => (
        <span key={gi} className={`grp${g.exposed ? ' exposed' : ''}`}>
          {Array.from({ length: g.n }, (_, k) => {
            if (k < g.have) return <TileView key={k} t={g.t} size="xs" />;
            if (k < g.have + g.jokers) return <TileView key={k} t={JOKER} size="xs" />;
            return <TileView key={k} t={g.t} size="xs" className="missing" />;
          })}
        </span>
      ))}
    </span>
  );
}

function Away({ o }: { o: HandOption }) {
  if (o.dead) return <span className="badge dead">dead</span>;
  if (o.away === 0) return <span className="badge win">Mahjong</span>;
  return <span className="badge">{o.away} away</span>;
}

interface StripProps {
  options: HandOption[];
  focus: number | null;
  setFocus: (id: number | null) => void;
  onOpen: () => void;
}

/** The always-visible short list of the closest hands. */
export function HintStrip({ options, focus, setFocus, onOpen }: StripProps) {
  const alive = options.filter((o) => !o.dead).slice(0, 3);
  return (
    <section className="hints" aria-label="Closest hands">
      <div className="hints-head">
        <span>Closest hands</span>
        <button type="button" className="link" onClick={onOpen}>
          Details
        </button>
      </div>
      {alive.length === 0 && <div className="muted small">No hand on the card is reachable any more.</div>}
      {alive.map((o) => (
        <button
          type="button"
          key={o.hand.id}
          className={`hint-row${focus === o.hand.id ? ' focus' : ''}`}
          onClick={() => setFocus(focus === o.hand.id ? null : o.hand.id)}
          aria-pressed={focus === o.hand.id}
        >
          <HandTiles o={o} />
          <span className="hint-meta">
            <Away o={o} />
            <span className="muted">
              {o.hand.value}
              {o.hand.concealed ? ' C' : ''}
            </span>
          </span>
        </button>
      ))}
    </section>
  );
}

/** Full detail: what each hand still needs and how many copies are unaccounted for. */
export function HintSheet({ options, onClose }: { options: HandOption[]; onClose: () => void }) {
  return (
    <div className="sheet-wrap" onClick={onClose}>
      <div className="sheet" role="dialog" aria-label="Hand recommendations" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>Hands to go for</h2>
          <button type="button" className="btn ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="muted small">
          Ranked by how many tiles you still need and how many of them are left. Outlined tiles are missing. A count like “2 left” is copies
          not yet discarded, exposed or in your rack.
        </p>
        {options.map((o) => (
          <div key={o.hand.id} className={`sheet-hand${o.dead ? ' is-dead' : ''}`}>
            <div className="sheet-hand-top">
              <span className="muted small">
                {o.hand.category} · {o.hand.value} points{o.hand.concealed ? ' · concealed' : ''}
              </span>
              <Away o={o} />
            </div>
            <HandTiles o={o} />
            {o.dead ? (
              <div className="small dead-text">{o.deadReason}</div>
            ) : (
              o.needs.length > 0 && (
                <div className="needs">
                  <span className="muted small">Need</span>
                  {o.needs.map((n) => (
                    <span key={n.t} className="need">
                      <TileView t={n.t} size="xs" />
                      <span className="small">
                        ×{n.count} · {n.unseen} left{n.jokerOk ? '' : ' · no joker'}
                      </span>
                    </span>
                  ))}
                </div>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
