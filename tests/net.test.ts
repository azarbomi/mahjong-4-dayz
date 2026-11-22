import { expect, it } from 'vitest';
import { botAction } from '../src/engine/bot';
import { BUILTIN_CARD } from '../src/engine/builtinCard';
import { getCard } from '../src/engine/card';
import { GameClient } from '../src/net/client';
import { GameHost } from '../src/net/host';
import { loopbackPair } from '../src/net/protocol';

const card = getCard(BUILTIN_CARD);

/** Wait until a condition holds (computer players share the event loop, so fixed sleeps are unreliable). */
async function until(cond: () => unknown, ms = 5000) {
  for (const start = Date.now(); !cond() && Date.now() - start < ms; ) await new Promise((r) => setTimeout(r, 5));
}

function join(host: GameHost, id: string, name: string) {
  const client = new GameClient(id, name);
  const [a, b] = loopbackPair();
  host.attach(a);
  client.setLink(b);
  // Play automatically, using only what this client was sent.
  client.subscribe(() => {
    const a = client.view && botAction(client.view, card);
    if (a) client.act(a);
  });
  return { client, link: b };
}

it('runs a hosted game for two people and two computer players', async () => {
  const host = new GameHost({ code: 'TESTS', cardText: BUILTIN_CARD, botDelay: 0, seed: 11 });
  const p1 = join(host, 'id-1', 'Ann');
  const p2 = join(host, 'id-2', 'Bea');
  await until(() => p2.client.lobby && p1.client.lobby?.seats[1].name === 'Bea');
  expect(p1.client.lobby?.seats.map((s) => s.name)).toEqual(['Ann', 'Bea', 'Mona', 'Dottie']);
  expect(p2.client.lobby?.you).toBe(1);

  let leaked = false;
  p2.client.subscribe(() => {
    const v = p2.client.view;
    if (v && v.phase !== 'over' && v.players.some((p) => p.rack)) leaked = true;
  });
  host.start();
  await until(() => p2.client.view);

  // Bea drops; the host covers her seat, then she comes back with the same id and keeps her seat.
  p2.link.close();
  await until(() => p1.client.lobby?.seats[1].connected === false);
  expect(p1.client.lobby?.seats[1]).toMatchObject({ name: 'Bea', connected: false });
  const back = join(host, 'id-2', 'Bea');
  await until(() => back.client.view);
  expect(back.client.lobby?.you).toBe(1);
  expect(back.client.view?.rack.length).toBeGreaterThanOrEqual(13);

  // A fifth person cannot take a seat once two more people fill the table.
  join(host, 'id-3', 'Cy');
  join(host, 'id-4', 'Di');
  const extra = join(host, 'id-5', 'Eve');
  await until(() => extra.client.status === 'full');
  expect(extra.client.status).toBe('full');

  await until(() => host.state?.phase === 'over', 20000);
  expect(host.state?.phase).toBe('over');
  await until(() => p1.client.view?.result);
  expect(p1.client.view?.result).toEqual(host.state?.result);
  expect(leaked).toBe(false);
  host.close();
}, 30000);
