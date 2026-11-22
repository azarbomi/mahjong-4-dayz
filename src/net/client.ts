import type { Action } from '../engine/game';
import type { PlayerView } from '../engine/view';
import type { ClientMsg, HostMsg, Link, Lobby } from './protocol';

export type ClientStatus = 'connecting' | 'connected' | 'reconnecting' | 'full' | 'failed';

/** A player's end of the game: holds the latest lobby and view, and sends actions to the host. */
export class GameClient {
  lobby: Lobby | null = null;
  view: PlayerView | null = null;
  status: ClientStatus = 'connecting';
  /** Latest rejected-action message, with a counter so repeats still show. */
  error: { message: string; n: number } | null = null;
  version = 0;
  private link: Link | null = null;
  private listeners = new Set<() => void>();

  constructor(
    readonly id: string,
    public name: string,
  ) {}

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;

  private bump() {
    this.version++;
    for (const fn of this.listeners) fn();
  }

  setStatus(status: ClientStatus) {
    if (this.status === 'full' && status !== 'connected') return;
    this.status = status;
    this.bump();
  }

  setLink(link: Link) {
    this.link = link;
    link.onMessage = (raw) => {
      const msg = raw as HostMsg;
      if (msg.t === 'lobby') {
        this.lobby = msg.lobby;
        this.status = 'connected';
      } else if (msg.t === 'view') this.view = msg.view;
      else if (msg.t === 'error') this.error = { message: msg.message, n: (this.error?.n ?? 0) + 1 };
      else if (msg.t === 'full') this.status = 'full';
      this.bump();
    };
    link.onClose = () => {
      if (this.link === link) {
        this.link = null;
        this.setStatus('reconnecting');
      }
    };
    link.send({ t: 'hello', id: this.id, name: this.name } satisfies ClientMsg);
  }

  act(action: Action) {
    this.link?.send({ t: 'action', action } satisfies ClientMsg);
  }

  close() {
    this.link?.close();
    this.link = null;
  }
}
