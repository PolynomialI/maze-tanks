// Online server tested with simulated players over real WebSockets.
const test = require('node:test');
const assert = require('node:assert/strict');
const WebSocket = require('ws');
const G = require('../shared/game.js');
const { createServer } = require('../server/server.js');

let app, url;
test.before(async () => {
  app = createServer();
  await new Promise(r => app.server.listen(0, r));
  url = 'ws://127.0.0.1:' + app.server.address().port;
});
test.after(() => app.close());

function player(look = { body: 3 }) {
  const ws = new WebSocket(url), msgs = [], waiters = [];
  ws.on('message', d => {
    const m = JSON.parse(d);
    msgs.push(m);
    for (const w of waiters.slice()) if (w.pred(m)) { waiters.splice(waiters.indexOf(w), 1); w.done(m); }
  });
  const p = {
    ws, msgs, look,
    open: new Promise(r => ws.on('open', r)),
    send: m => ws.send(JSON.stringify(m)),
    // resolve with the first message (past or future) matching pred
    next(pred, ms = 3000) {
      const old = msgs.find(pred);
      if (old) return Promise.resolve(old);
      return new Promise((done, fail) => {
        const w = { pred, done };
        waiters.push(w);
        setTimeout(() => fail(new Error('timeout waiting for message')), ms).unref();
      });
    },
    last: t => [...msgs].reverse().find(m => m.t === t),
    queue() { p.send({ t: 'q', look }); },
    close() { ws.close(); }
  };
  return p;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hello = async p => { await p.open; return (await p.next(m => m.t === 'hi')).id; };

test('serves the page, the shared modules and a health check', async () => {
  const base = url.replace('ws:', 'http:');
  for (const path of ['/', '/online.js', '/shared/game.js', '/shared/render.js', '/shared/ui.js', '/shared/style.css', '/healthz']) {
    const r = await fetch(base + path);
    assert.equal(r.status, 200, path);
  }
  assert.equal((await fetch(base + '/server/server.js')).status, 404);
});

test('matchmaking: 2 start a lobby, 3rd-8th join it, 9th waits and starts a new one with the 10th', async () => {
  const ps = Array.from({ length: 10 }, (_, i) => player({ body: i % 12 }));
  const ids = [];
  for (const p of ps) ids.push(await hello(p));

  ps[0].queue();
  await ps[0].next(m => m.t === 'wait');
  ps[1].queue();
  const l0 = await ps[0].next(m => m.t === 'lobby'), l1 = await ps[1].next(m => m.t === 'lobby');
  assert.equal(l0.id, l1.id);
  const r = await ps[0].next(m => m.t === 'r');
  assert.ok(r.maze.w >= 4 && r.maze.off.length === r.maze.w * r.maze.h);
  const s = await ps[0].next(m => m.t === 's');
  assert.equal(s.T.length, 2, 'game started with two tanks');

  for (let i = 2; i < 8; i++) {
    ps[i].queue();
    const l = await ps[i].next(m => m.t === 'lobby');
    assert.equal(l.id, l0.id, `player ${i + 1} joins the running lobby`);
    await ps[i].next(m => m.t === 'r'); // gets the current maze so it can watch
  }
  await sleep(100);
  const pl = ps[0].last('pl');
  assert.equal(pl.p.length, 8);
  assert.deepEqual(pl.p.filter(p => p.out).map(p => p.id), ids.slice(2, 8), 'mid-round joiners watch until next round');
  assert.equal(ps[7].last('s').T.length, 2);
  assert.equal(pl.p[3].look.body, 3, 'looks are shared with everyone');

  ps[8].queue();
  await ps[8].next(m => m.t === 'wait');
  await sleep(100);
  assert.ok(!ps[8].msgs.some(m => m.t === 'lobby'), 'lobby full, 9th waits');
  ps[9].queue();
  const l8 = await ps[8].next(m => m.t === 'lobby'), l9 = await ps[9].next(m => m.t === 'lobby');
  assert.equal(l8.id, l9.id);
  assert.notEqual(l8.id, l0.id, 'new lobby');
  assert.equal(app.mm.lobbies.size, 2);

  // a player in the full lobby disconnects: the others see it, and the next arrival takes the seat
  ps[5].close();
  await ps[0].next(m => m.t === 'pl' && m.p.length === 7);
  const late = player();
  await hello(late);
  late.queue();
  assert.equal((await late.next(m => m.t === 'lobby')).id, l0.id);

  // the second lobby empties and closes
  ps[8].close(); ps[9].close();
  await sleep(150);
  assert.equal(app.mm.lobbies.size, 1);
  for (const p of [...ps, late]) p.close();
  await sleep(150);
  assert.equal(app.mm.lobbies.size, 0, 'empty lobbies close');
});

test('inputs drive the tank on the server and are acknowledged', async () => {
  const [a, b] = [player(), player()];
  const ida = await hello(a); await hello(b);
  a.queue(); b.queue();
  const s0 = await a.next(m => m.t === 's');
  const t0 = s0.T.find(t => t[0] === ida);
  for (let q = 1; q <= 60; q++) { a.send({ t: 'i', q, k: G.encodeInput({ left: true }) }); await sleep(16); }
  const s1 = await a.next(m => m.t === 's' && m.a === 60, 3000);
  const t1 = s1.T.find(t => t[0] === ida);
  assert.ok(Math.abs(G.wrap(t1[3] - t0[3])) > 1, 'tank rotated');
  a.close(); b.close();
  await sleep(100);
});

test('stats: kills and wins are counted; a disconnect mid-round gives the round to the survivor', async () => {
  const [a, b] = [player(), player()];
  const ida = await hello(a), idb = await hello(b);
  a.queue(); b.queue();
  await a.next(m => m.t === 's');
  const lobby = [...app.mm.lobbies].find(l => l.match.player(ida));
  // round 1: a kills b
  const st = lobby.match.state;
  G.kill(st, st.tanks.find(t => t.id === idb), ida);
  let pl = await a.next(m => m.t === 'pl' && m.p.find(p => p.id === ida).wins === 1, 5000);
  assert.deepEqual(pl.p.map(p => [p.wins, p.kills]), [[1, 1], [0, 0]]);
  // round 2: b leaves, a wins again, then the lobby waits for players
  await a.next(m => m.t === 'r' && m.n === 2);
  b.close();
  pl = await a.next(m => m.t === 'pl' && m.w === 1, 5000);
  assert.deepEqual(pl.p.map(p => [p.id, p.wins, p.kills]), [[ida, 2, 1]]);
  // a newcomer joins the waiting lobby and a new round starts straight away
  const c = player();
  await hello(c);
  c.queue();
  await c.next(m => m.t === 'lobby');
  pl = await a.next(m => m.t === 'pl' && m.w === 0 && m.p.length === 2);
  assert.equal(pl.p.every(p => !p.out), true);
  a.close(); c.close();
  await sleep(100);
});

test('leaving the queue or a lobby returns home; bad messages are ignored', async () => {
  const a = player();
  await hello(a);
  a.ws.send('not json');
  a.send({ t: 'i', q: 'x', k: 1 });
  a.queue();
  await a.next(m => m.t === 'wait');
  a.send({ t: 'x' });
  await a.next(m => m.t === 'home');
  assert.equal(app.mm.waiting.length, 0);
  a.close();
});
