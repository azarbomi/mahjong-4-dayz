import { useMemo, useState } from 'react';
import { BUILTIN_CARD } from '../engine/builtinCard';
import { parseCard, type Card } from '../engine/card';
import { prefs } from './session';
import { TileView } from './Tile';

/** Every hand on a card, drawn with one example of its tiles. */
export function CardList({ card }: { card: Card }) {
  const example = useMemo(() => {
    const m = new Map<number, Card['variants'][number]>();
    for (const v of card.variants) if (!m.has(v.hand)) m.set(v.hand, v);
    return m;
  }, [card]);
  const categories = [...new Set(card.hands.map((h) => h.category))];
  return (
    <div className="cardlist">
      {categories.map((cat) => (
        <section key={cat}>
          <h3>{cat}</h3>
          {card.hands
            .filter((h) => h.category === cat)
            .map((h) => (
              <div key={h.id} className="card-hand">
                <span className="hand-tiles">
                  {[...example.get(h.id)!.groups]
                    .sort((a, b) => a.i - b.i)
                    .map((g, gi) => (
                      <span key={gi} className="grp">
                        {Array.from({ length: g.n }, (_, k) => (
                          <TileView key={k} t={g.t} size="xs" />
                        ))}
                      </span>
                    ))}
                </span>
                <span className="small muted">
                  {h.value}
                  {h.concealed ? ' · concealed' : ''}
                  {h.run ? ' · any numbers in this pattern' : ''}
                </span>
              </div>
            ))}
        </section>
      ))}
      <p className="muted small">Suits are interchangeable in every hand; one example is shown. Dragons match their suit where they follow one.</p>
    </div>
  );
}

const HELP = `One hand per line:  tiles | points | flags

FF 2222a 4444a 6666b | 25
11a 222a 3333b 444c 55c | 30 | run
NNNN EEEE WW SS 11a | 30 | C

1-9 numbers, followed by a suit letter a, b or c
    (different letters = different suits)
0 soap    F flower    N E W S winds
G R  green / red dragon
DDDa dragon matching suit a    DDDx any dragon
VVV  any one wind
2026a  different symbols in a token are singles

Flags:  C  concealed
        run  the numbers may all move up or down
             together (any run, any like number)
=2026a keeps a token fixed inside a run hand
# Heading starts a category`;

export function CardScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'builtin' | 'mine'>(prefs.useCustom ? 'mine' : 'builtin');
  const [text, setText] = useState(prefs.customCard);
  const [use, setUse] = useState(prefs.useCustom);
  const [help, setHelp] = useState(false);
  const builtin = useMemo(() => parseCard(BUILTIN_CARD), []);
  const mine = useMemo(() => parseCard(text), [text]);
  const valid = mine.hands.length > 0 && mine.errors.length === 0;

  const update = (t: string) => {
    setText(t);
    prefs.customCard = t;
    if (!t.trim()) {
      setUse(false);
      prefs.useCustom = false;
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <button type="button" className="btn ghost" onClick={onBack}>
          ‹ Back
        </button>
        <span>Cards</span>
        <span />
      </header>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'builtin'} className={tab === 'builtin' ? 'on' : ''} onClick={() => setTab('builtin')}>
          Built-in card
        </button>
        <button type="button" role="tab" aria-selected={tab === 'mine'} className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
          My card
        </button>
      </div>
      <div className="page-body">
        <p className="banner-info small">
          Games you start use <b>{use && valid ? 'your card' : 'the built-in card'}</b>. In multiplayer everyone plays the host’s card.
        </p>
        {tab === 'builtin' ? (
          <>
            <p className="muted small">
              An original card made for this app. It is not the National Mah Jongg League card. If you own that card, type its hands under “My
              card”.
            </p>
            <CardList card={builtin} />
          </>
        ) : (
          <>
            <label className="check">
              <input
                type="checkbox"
                checked={use && valid}
                disabled={!valid}
                onChange={(e) => {
                  setUse(e.target.checked);
                  prefs.useCustom = e.target.checked;
                }}
              />
              Play with my card
            </label>
            <div className="btn-row left">
              <button type="button" className="btn" onClick={() => setHelp(!help)}>
                {help ? 'Hide notation' : 'How to write hands'}
              </button>
              {!text.trim() && (
                <button type="button" className="btn" onClick={() => update(BUILTIN_CARD)}>
                  Start from built-in
                </button>
              )}
            </div>
            {help && <pre className="help">{HELP}</pre>}
            <textarea
              className="editor"
              value={text}
              onChange={(e) => update(e.target.value)}
              spellCheck={false}
              autoCapitalize="off"
              autoCorrect="off"
              placeholder={'# 2468\nFF 2222a 4444a 6666a | 25'}
              aria-label="Card hands"
            />
            <p className="small">
              {mine.hands.length} {mine.hands.length === 1 ? 'hand' : 'hands'} understood
              {mine.errors.length ? `, ${mine.errors.length} ${mine.errors.length === 1 ? 'line needs' : 'lines need'} fixing` : ''}
            </p>
            {mine.errors.map((e) => (
              <p key={e.line} className="small dead-text">
                Line {e.line}: {e.message}
              </p>
            ))}
            {mine.hands.length > 0 && <CardList card={mine} />}
          </>
        )}
      </div>
    </div>
  );
}
