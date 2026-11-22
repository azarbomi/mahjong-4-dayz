import { botAction } from '../engine/bot';
import { getCard } from '../engine/card';
import { isPending, newGame, reduce, type Action, type GameState } from '../engine/game';
import { mulberry32 } from '../engine/tiles';
import { viewFor } from '../engine/view';
import type { ClientMsg, HostMsg, Link, Lobby } from './protocol';

interface Seat {
  /** Player id, or null for a computer player. */
  id: string | null;
  name: string;
  link: Link | null;
}

export interface HostSnapshot {
  code: string;
  cardText: string;
  seats: { id: string | null; name: string }[];
  state: GameState | null;
}

export interface HostOptions {
  code: string;
  cardText: string;
  /** Milliseconds a computer player "thinks". */
  botDelay?: number;
  callSeconds?: number;
  seed?: number;
  onChange?: (snap: HostSnapshot) => void;
}

const BOT_NAMES = ['Ruth', 'Sylvia', 'Mona', 'Dottie'];

/** Runs the game. It lives on the host's phone; every player (the host included) talks to it over a Link. */
export class GameHost {
  seats: Seat[] = BOT_NAMES.map((name) => ({ id: null, name, link: null }));
  state: GameState | null = null;
  cardText: string;
  readonly code: string;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private rng: () => number;
  private closed = false;

  constructor(private opts: HostOptions) {
    this.code = opts.code;
    this.cardText = opts.cardText;
    this.rng = mulberry32(opts.seed ?? (Date.now() ^ (Math.random() * 2 ** 31)));
  }

  static restore(snap: HostSnapshot, opts: Omit<HostOptions, 'code' | 'cardText'>): GameHost {
    const h = new GameHost({ ...opts, code: snap.code, cardText: snap.cardText });
    h.seats = snap.seats.map((s) => ({ ...s, link: null }));
    h.state = snap.state;
    h.schedule();
    return h;
  }

  private get card() {
    return getCard(this.cardText);
  }

  attach(link: Link) {
    link.onMessage = (raw) => {
      const msg = raw as ClientMsg;
      if (msg?.t === 'hello' && typeof msg.id === 'string') this.join(link, msg.id, String(msg.name || 'Player').slice(0, 16));
      else if (msg?.t === 'action') {
        const seat = this.seats.findIndex((s) => s.link === link);
        if (seat >= 0) this.apply(seat, msg.action, link);
      }
    };
    link.onClose = () => {
      const seat = this.seats.find((s) => s.link === link);
      if (seat) {
        seat.link = null;
        this.changed();
      }
    };
  }

  private join(link: Link, id: string, name: string) {
    let seat = this.seats.findIndex((s) => s.id === id);
    if (seat < 0) seat = this.seats.findIndex((s) => s.id === null);
    if (seat < 0) {
      link.send({ t: 'full' } satisfies HostMsg);
      return;
    }
    const old = this.seats[seat].link;
    if (old && old !== link) {
      old.onClose = null;
      old.close();
    }
    this.seats[seat] = { id, name, link };
    this.changed();
  }

  /** Turn a human seat back into a computer player (host only). */
  kick(seat: number) {
    const s = this.seats[seat];
    if (!s.id) return;
    s.link?.close();
    this.seats[seat] = { id: null, name: BOT_NAMES[seat], link: null };
    this.changed();
  }

  setCard(text: string) {
    if (this.state && this.state.phase !== 'over') return;
    this.cardText = text;
    this.changed();
  }

  start() {
    const prev = this.state;
    const dealer = prev ? (prev.dealer + 1) % 4 : 0;
    this.state = newGame(this.rng, dealer, prev?.scores);
    this.changed();
  }

  private apply(seat: number, action: Action, link?: Link) {
    if (!this.state) return;
    try {
      this.state = reduce(this.state, seat, action, this.card);
    } catch (e) {
      link?.send({ t: 'error', message: (e as Error).message } satisfies HostMsg);
      return;
    }
    this.changed();
  }

  private lobbyFor(seat: number): Lobby {
    return {
      code: this.code,
      seats: this.seats.map((s) => ({ name: s.name, bot: s.id === null, connected: s.id === null || !!s.link })),
      you: seat,
      hostSeat: 0,
      started: !!this.state,
      cardText: this.cardText,
      callSeconds: this.opts.callSeconds ?? 20,
    };
  }

  private changed() {
    if (this.closed) return;
    this.seats.forEach((s, i) => {
      if (!s.link) return;
      s.link.send({ t: 'lobby', lobby: this.lobbyFor(i) } satisfies HostMsg);
      s.link.send({ t: 'view', view: this.state ? viewFor(this.state, i, this.card) : null } satisfies HostMsg);
    });
    this.opts.onChange?.(this.snapshot());
    this.schedule();
  }

  snapshot(): HostSnapshot {
    return { code: this.code, cardText: this.cardText, seats: this.seats.map(({ id, name }) => ({ id, name })), state: this.state };
  }

  /** Line up computer moves, stand-in moves for players who dropped, and the call timeout. */
  private schedule() {
    const s = this.state;
    const wanted = new Map<string, { seat: number; delay: number; auto: 'bot' | 'pass' }>();
    if (s && s.phase !== 'over') {
      const moment = `${s.phase}:${s.ch?.stage}:${s.ch?.step}:${s.stage}:${s.turn}:${s.discards.length}:${s.wall.length}`;
      for (let seat = 0; seat < 4; seat++) {
        if (!isPending(s, seat)) continue;
        const who = this.seats[seat];
        const base = this.opts.botDelay ?? 900;
        if (who.id === null) wanted.set(`${moment}:${seat}:bot`, { seat, delay: base * (0.7 + Math.random() * 0.6), auto: 'bot' });
        else if (!who.link) wanted.set(`${moment}:${seat}:away`, { seat, delay: base * 6, auto: 'bot' });
        else if (s.phase === 'play' && s.stage === 'calls')
          wanted.set(`${moment}:${seat}:call`, { seat, delay: (this.opts.callSeconds ?? 20) * 1000, auto: 'pass' });
      }
    }
    for (const [key, t] of this.timers) {
      if (!wanted.has(key)) {
        clearTimeout(t);
        this.timers.delete(key);
      }
    }
    for (const [key, w] of wanted) {
      if (this.timers.has(key)) continue;
      this.timers.set(
        key,
        setTimeout(() => {
          this.timers.delete(key);
          if (!this.state || !isPending(this.state, w.seat)) return;
          const action: Action | null =
            w.auto === 'pass' ? { type: 'call', response: { kind: 'pass' } } : botAction(viewFor(this.state, w.seat, this.card), this.card);
          if (action) this.apply(w.seat, action);
        }, w.delay),
      );
    }
  }

  close() {
    this.closed = true;
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    for (const s of this.seats) s.link?.close();
  }
}
