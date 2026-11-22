import { BUILTIN_CARD } from '../engine/builtinCard';
import { parseCard } from '../engine/card';
import { GameClient } from '../net/client';
import { GameHost, type HostSnapshot } from '../net/host';
import { hostRoom, joinRoom, type PeerHandle } from '../net/peer';
import { loopbackPair, makeRoomCode } from '../net/protocol';

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const set = (k: string, v: string | null) => {
  try {
    if (v === null) localStorage.removeItem(k);
    else localStorage.setItem(k, v);
  } catch {
    /* storage unavailable: carry on without saving */
  }
};

export const prefs = {
  get name() {
    return get('mj4d-name') ?? '';
  },
  set name(v: string) {
    set('mj4d-name', v);
  },
  get hints() {
    return get('mj4d-hints') !== 'off';
  },
  set hints(v: boolean) {
    set('mj4d-hints', v ? 'on' : 'off');
  },
  get customCard() {
    return get('mj4d-card') ?? '';
  },
  set customCard(v: string) {
    set('mj4d-card', v || null);
  },
  get useCustom() {
    return get('mj4d-card-use') === 'custom' && !!get('mj4d-card');
  },
  set useCustom(v: boolean) {
    set('mj4d-card-use', v ? 'custom' : null);
  },
  /** Room most recently joined, so a dropped player can get back in quickly. */
  get lastRoom() {
    return get('mj4d-last-room') ?? '';
  },
  set lastRoom(v: string) {
    set('mj4d-last-room', v || null);
  },
  get id() {
    let id = get('mj4d-id');
    if (!id) {
      id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      set('mj4d-id', id);
    }
    return id;
  },
};

/** The card new games are played with: the player's own if it is switched on and usable. */
export function activeCardText(): string {
  if (prefs.useCustom) {
    const c = parseCard(prefs.customCard);
    if (c.hands.length && !c.errors.length) return prefs.customCard;
  }
  return BUILTIN_CARD;
}

export interface Session {
  mode: 'solo' | 'host' | 'join';
  code: string;
  client: GameClient;
  host: GameHost | null;
  /** Problem with the room's matchmaking connection, shown to the host. */
  roomStatus: { ok: boolean; detail?: string };
  onRoomStatus: (() => void) | null;
  leave(): void;
}

interface Saved {
  mode: 'solo' | 'host';
  snap: HostSnapshot;
}

export function savedGame(): Saved | null {
  try {
    const s = JSON.parse(get('mj4d-saved') ?? 'null') as Saved | null;
    return s && s.snap?.state && s.snap.state.phase !== 'over' ? s : null;
  } catch {
    return null;
  }
}

export function clearSaved() {
  set('mj4d-saved', null);
}

/** Start (or resume) a game run from this phone: solo, or as host of a room. */
export function startLocal(mode: 'solo' | 'host', name: string, resume?: HostSnapshot): Session {
  const save = (snap: HostSnapshot) => set('mj4d-saved', snap.state ? JSON.stringify({ mode, snap }) : null);
  const host = resume
    ? GameHost.restore(resume, { onChange: save })
    : new GameHost({ code: makeRoomCode(), cardText: activeCardText(), onChange: save });
  const client = new GameClient(prefs.id, name);
  const [a, b] = loopbackPair();
  host.attach(a);
  client.setLink(b);
  const session: Session = {
    mode,
    code: host.code,
    client,
    host,
    roomStatus: { ok: mode === 'solo' },
    onRoomStatus: null,
    leave() {
      peer?.close();
      host.close();
    },
  };
  const peer: PeerHandle | null =
    mode === 'host'
      ? hostRoom(
          host.code,
          (link) => host.attach(link),
          (ok, detail) => {
            session.roomStatus = { ok, detail };
            session.onRoomStatus?.();
          },
        )
      : null;
  if (mode === 'solo' && !resume) host.start();
  return session;
}

export function startJoin(name: string, code: string): Session {
  prefs.lastRoom = code.toUpperCase();
  const client = new GameClient(prefs.id, name);
  const peer = joinRoom(
    code,
    (link) => client.setLink(link),
    (s) => client.setStatus(s),
  );
  return {
    mode: 'join',
    code: code.toUpperCase(),
    client,
    host: null,
    roomStatus: { ok: true },
    onRoomStatus: null,
    leave() {
      peer.close();
      client.close();
    },
  };
}
