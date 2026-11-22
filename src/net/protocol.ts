import type { Action } from '../engine/game';
import type { PlayerView } from '../engine/view';

/** A two-way message channel: a WebRTC data connection, or an in-memory pair for the local player. */
export interface Link {
  send(msg: unknown): void;
  close(): void;
  onMessage: ((msg: unknown) => void) | null;
  onClose: (() => void) | null;
}

export interface Lobby {
  code: string;
  seats: { name: string; bot: boolean; connected: boolean }[];
  you: number;
  hostSeat: number;
  started: boolean;
  cardText: string;
  /** Seconds a player has to answer a discard before passing automatically. */
  callSeconds: number;
}

export type ClientMsg = { t: 'hello'; id: string; name: string } | { t: 'action'; action: Action };

export type HostMsg = { t: 'lobby'; lobby: Lobby } | { t: 'view'; view: PlayerView | null } | { t: 'error'; message: string } | { t: 'full' };

/** Two connected in-memory links. Delivery is asynchronous, like a real connection. */
export function loopbackPair(): [Link, Link] {
  const make = (): Link & { peer?: Link; open: boolean } => ({
    open: true,
    onMessage: null,
    onClose: null,
    send(msg) {
      const peer = this.peer!;
      const copy = JSON.parse(JSON.stringify(msg));
      setTimeout(() => this.open && peer.onMessage?.(copy), 0);
    },
    close() {
      if (!this.open) return;
      this.open = false;
      const peer = this.peer as Link & { open: boolean };
      setTimeout(() => {
        if (peer.open) {
          peer.open = false;
          peer.onClose?.();
        }
      }, 0);
    },
  });
  const a = make();
  const b = make();
  a.peer = b;
  b.peer = a;
  return [a, b];
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
export function makeRoomCode(): string {
  let s = '';
  for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  return s;
}
