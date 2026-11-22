import { useEffect, useState, useSyncExternalStore } from 'react';
import { CardScreen } from './CardScreen';
import { clearSaved, prefs, savedGame, startJoin, startLocal, type Session } from './session';
import { Table } from './Table';

function Lobby({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const c = session.client;
  useSyncExternalStore(c.subscribe, c.getVersion);
  const [, force] = useState(0);
  useEffect(() => {
    session.onRoomStatus = () => force((n) => n + 1);
    return () => {
      session.onRoomStatus = null;
    };
  }, [session]);
  const [copied, setCopied] = useState(false);
  const lobby = c.lobby;
  const link = `${location.origin}${location.pathname}?join=${session.code}`;

  const share = async () => {
    try {
      if (navigator.share) await navigator.share({ title: 'Mahjong 4 Dayz', text: `Join my mahjong game with code ${session.code}`, url: link });
      else {
        await navigator.clipboard.writeText(link);
        setCopied(true);
      }
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <div className="page">
      <header className="topbar">
        <button type="button" className="btn ghost" onClick={onLeave}>
          ‹ Leave
        </button>
        <span>Game room</span>
        <span />
      </header>
      <div className="page-body center">
        <p className="muted">Room code</p>
        <div className="code" aria-label={`Room code ${session.code}`}>
          {session.code}
        </div>
        {session.host && (
          <button type="button" className="btn" onClick={share}>
            {copied ? 'Link copied' : 'Share invite link'}
          </button>
        )}
        {session.host && !session.roomStatus.ok && (
          <p className="banner">{session.roomStatus.detail ?? 'Opening the room…'}</p>
        )}
        {c.status === 'full' ? (
          <p className="banner">This game already has four players.</p>
        ) : c.status === 'failed' ? (
          <p className="banner">Cannot find that room. Check the code, and that the host has the game open. Still trying…</p>
        ) : !lobby ? (
          <p className="muted">Connecting to the host…</p>
        ) : (
          <>
            <ul className="seats">
              {lobby.seats.map((s, i) => (
                <li key={i}>
                  <span>
                    {s.name}
                    {i === lobby.you ? ' (you)' : ''}
                    {i === lobby.hostSeat ? ' · host' : ''}
                  </span>
                  <span className="muted small">
                    {s.bot ? 'computer' : s.connected ? 'ready' : 'away'}
                    {session.host && !s.bot && i !== lobby.you && (
                      <button type="button" className="link" onClick={() => session.host!.kick(i)}>
                        remove
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted small">Seats without a person are played by the computer. Friends can also join after the game starts.</p>
            {session.host ? (
              <button type="button" className="btn primary big" onClick={() => session.host!.start()}>
                Start game
              </button>
            ) : (
              <p>Waiting for {lobby.seats[lobby.hostSeat].name} to start…</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Game({ session, onLeave }: { session: Session; onLeave: () => void }) {
  const c = session.client;
  useSyncExternalStore(c.subscribe, c.getVersion);
  if (c.view && c.lobby) return <Table session={session} onLeave={onLeave} />;
  if (session.mode === 'solo') return <div className="page center muted">Dealing…</div>;
  return <Lobby session={session} onLeave={onLeave} />;
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [screen, setScreen] = useState<'home' | 'cards' | 'about'>('home');
  const [name, setName] = useState(prefs.name);
  const [code, setCode] = useState(() => (new URLSearchParams(location.search).get('join') ?? prefs.lastRoom).toUpperCase().slice(0, 5));
  const [saved, setSaved] = useState(savedGame);
  const [hints, setHints] = useState(prefs.hints);

  const playerName = () => {
    const n = name.trim() || 'Player';
    prefs.name = n;
    return n;
  };
  const begin = (s: Session) => {
    history.replaceState(null, '', location.pathname);
    setSession(s);
  };
  const leave = () => {
    if (session?.host && session.client.view && session.client.view.phase !== 'over') {
      if (!confirm(session.mode === 'host' ? 'Leave? The game pauses for everyone until you resume it.' : 'Leave this game? You can resume it later.')) return;
    }
    session?.leave();
    setSession(null);
    setSaved(savedGame());
  };

  if (session) return <Game session={session} onLeave={leave} />;
  if (screen === 'cards') return <CardScreen onBack={() => setScreen('home')} />;
  if (screen === 'about')
    return (
      <div className="page">
        <header className="topbar">
          <button type="button" className="btn ghost" onClick={() => setScreen('home')}>
            ‹ Back
          </button>
          <span>How it works</span>
          <span />
        </header>
        <div className="page-body prose">
          <h3>Install it</h3>
          <p>iPhone: open this page in Safari, tap Share, then “Add to Home Screen”. Android: open it in Chrome, tap the menu, then “Install app”.</p>
          <h3>Play together</h3>
          <p>
            One person taps “Host a game” and shares the five-letter code or the invite link. Everyone else enters the code under “Join”. Empty
            seats are played by the computer.
          </p>
          <p>
            The game runs on the host’s phone and the phones talk to each other directly. The host should keep the app open; if it closes, the
            game pauses and the host can pick it up again with “Resume”. If you drop out, the computer covers your seat until you rejoin with
            the same code. On some office or school networks direct connections are blocked; mobile data or home Wi-Fi usually works.
          </p>
          <h3>Rules</h3>
          <p>
            American mahjong with 152 tiles: Charleston (with blind passes, an optional second Charleston and a courtesy pass), calling discards
            for pungs, kongs, quints and Mahjong, joker exchange, and scoring with double pay for the discarder, for self-drawn wins and for
            jokerless hands. A Mahjong call beats an exposure; otherwise the next player in turn gets the tile.
          </p>
          <h3>Hints</h3>
          <p>
            “Closest hands” lists the hands on the card you are nearest to, counting jokers and what has already been discarded or exposed. Tap a
            hand to highlight its tiles in your rack. A dot marks the tile the hint would pass or discard. Turn hints off in the game menu.
          </p>
        </div>
      </div>
    );

  return (
    <div className="page home">
      <div className="page-body center">
        <h1>Mahjong 4 Dayz</h1>
        <p className="muted">American mahjong with friends</p>
        <label className="field">
          <span>Your name</span>
          <input value={name} maxLength={16} onChange={(e) => setName(e.target.value)} placeholder="Player" autoComplete="nickname" />
        </label>
        {saved && (
          <button type="button" className="btn primary big" onClick={() => begin(startLocal(saved.mode, playerName(), saved.snap))}>
            Resume {saved.mode === 'host' ? `room ${saved.snap.code}` : 'solo game'}
          </button>
        )}
        <button
          type="button"
          className={`btn big${saved ? '' : ' primary'}`}
          onClick={() => {
            clearSaved();
            begin(startLocal('solo', playerName()));
          }}
        >
          Play solo
        </button>
        <button
          type="button"
          className="btn big"
          onClick={() => {
            clearSaved();
            begin(startLocal('host', playerName()));
          }}
        >
          Host a game
        </button>
        <form
          className="join"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.length === 5) begin(startJoin(playerName(), code));
          }}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 5))}
            placeholder="CODE"
            aria-label="Room code"
            autoCapitalize="characters"
            autoComplete="off"
          />
          <button type="submit" className="btn" disabled={code.length !== 5}>
            Join
          </button>
        </form>
        <label className="check">
          <input
            type="checkbox"
            checked={hints}
            onChange={(e) => {
              setHints(e.target.checked);
              prefs.hints = e.target.checked;
            }}
          />
          Show hand hints while I play
        </label>
        <div className="btn-row">
          <button type="button" className="btn ghost" onClick={() => setScreen('cards')}>
            Cards
          </button>
          <button type="button" className="btn ghost" onClick={() => setScreen('about')}>
            How it works
          </button>
        </div>
      </div>
    </div>
  );
}
