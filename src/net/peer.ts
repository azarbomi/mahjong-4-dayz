import Peer, { type DataConnection, type PeerOptions } from 'peerjs';
import type { Link } from './protocol';

const PREFIX = 'mj4d-room-';

/** Uses the public PeerJS broker unless a signaling server is given as ?signal=host:port (for testing). */
function peerOptions(): PeerOptions {
  const fromUrl = new URLSearchParams(location.search).get('signal');
  if (fromUrl) sessionStorage.setItem('mj4d-signal', fromUrl);
  const custom = fromUrl ?? sessionStorage.getItem('mj4d-signal');
  if (!custom) return {};
  const [host, port] = custom.split(':');
  return { host, port: Number(port || 9000), path: '/', secure: false };
}

function wrap(conn: DataConnection): Link {
  const link: Link = {
    onMessage: null,
    onClose: null,
    send: (msg) => {
      if (conn.open) conn.send(msg);
    },
    close: () => conn.close(),
  };
  let closed = false;
  const closeOnce = () => {
    if (closed) return;
    closed = true;
    link.onClose?.();
  };
  conn.on('data', (d) => link.onMessage?.(d));
  conn.on('close', closeOnce);
  conn.on('error', closeOnce);
  conn.on('iceStateChanged', (state) => {
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      conn.close();
      closeOnce();
    }
  });
  return link;
}

export interface PeerHandle {
  close(): void;
}

/** Open a room that other phones can join by code. */
export function hostRoom(code: string, onLink: (link: Link) => void, onStatus: (ok: boolean, detail?: string) => void): PeerHandle {
  let peer: Peer;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const open = () => {
    peer = new Peer(PREFIX + code, peerOptions());
    peer.on('open', () => onStatus(true));
    peer.on('connection', (conn) => conn.on('open', () => onLink(wrap(conn))));
    peer.on('disconnected', () => {
      onStatus(false, 'Lost the matchmaking server, retrying');
      if (!closed && !peer.destroyed) retry = setTimeout(() => !peer.destroyed && peer.reconnect(), 2000);
    });
    peer.on('error', (err) => {
      if (closed) return;
      const fatal = ['unavailable-id', 'network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type);
      if (!fatal) return;
      onStatus(false, err.type === 'unavailable-id' ? 'Room code is still in use, retrying' : 'Cannot reach the matchmaking server, retrying');
      peer.destroy();
      retry = setTimeout(open, 3000);
    });
  };
  open();
  return {
    close() {
      closed = true;
      clearTimeout(retry);
      peer.destroy();
    },
  };
}

/** Connect to a room and keep reconnecting if the connection drops. */
export function joinRoom(code: string, onLink: (link: Link) => void, onStatus: (s: 'connecting' | 'reconnecting' | 'failed') => void): PeerHandle {
  let peer: Peer | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let attempts = 0;
  const again = () => {
    if (closed) return;
    peer?.destroy();
    peer = null;
    attempts++;
    onStatus(attempts > 6 ? 'failed' : 'reconnecting');
    clearTimeout(retry);
    retry = setTimeout(connect, 2000);
  };
  const connect = () => {
    if (closed) return;
    const p = new Peer(peerOptions());
    peer = p;
    p.on('open', () => {
      const conn = p.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'json' });
      const timeout = setTimeout(() => !conn.open && p === peer && again(), 12000);
      conn.on('open', () => {
        clearTimeout(timeout);
        attempts = 0;
        const link = wrap(conn);
        onLink(link);
        const userClose = link.onClose;
        link.onClose = () => {
          userClose?.();
          if (p === peer) again();
        };
      });
    });
    p.on('error', () => p === peer && again());
  };
  onStatus('connecting');
  connect();
  return {
    close() {
      closed = true;
      clearTimeout(retry);
      peer?.destroy();
    },
  };
}
