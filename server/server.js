// One web service: serves the game page and runs the WebSocket game server on the same port.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
const G = require('../shared/game.js');
const { Matchmaker } = require('./lobby.js');

const ROOT = path.join(__dirname, '..');
const FILES = {
  '/': 'public/index.html',
  '/online.js': 'public/online.js',
  '/shared/game.js': 'shared/game.js',
  '/shared/render.js': 'shared/render.js',
  '/shared/ui.js': 'shared/ui.js',
  '/shared/style.css': 'shared/style.css'
};
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

function createServer() {
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    if (url === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); res.end('ok'); return; }
    const file = FILES[url];
    if (!file) { res.writeHead(404); res.end(); return; }
    fs.readFile(path.join(ROOT, file), (err, data) => {
      if (err) { res.writeHead(500); res.end(); return; }
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)], 'cache-control': 'no-cache' });
      res.end(data);
    });
  });

  const mm = new Matchmaker();
  const wss = new WebSocketServer({ server, maxPayload: 4096 });
  let nextId = 1;

  wss.on('connection', ws => {
    const c = {
      id: nextId++, look: G.cleanLook(), lobby: null, inputs: [], ack: 0,
      send: m => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); }
    };
    ws.alive = true;
    ws.on('pong', () => { ws.alive = true; });
    c.send({ t: 'hi', id: c.id });
    ws.on('message', raw => {
      let m;
      try { m = JSON.parse(raw); } catch (e) { return; }
      if (!m || typeof m !== 'object') return;
      if (m.t === 'i' && Number.isInteger(m.q) && Number.isInteger(m.k)) mm.input(c, m.q, m.k);
      else if (m.t === 'q') { if (!c.lobby) c.look = G.cleanLook(m.look); mm.queue(c); }
      else if (m.t === 'x') { mm.leave(c); c.send({ t: 'home' }); }
    });
    ws.on('close', () => mm.leave(c));
  });

  // drop connections that stopped answering pings
  const beat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 20000);
  beat.unref();

  return {
    server, wss, mm,
    close: () => new Promise(done => { clearInterval(beat); mm.closeAll(); for (const ws of wss.clients) ws.terminate(); wss.close(); server.close(done); })
  };
}

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().server.listen(port, () => console.log(`Maze Tanks listening on port ${port}`));
}

module.exports = { createServer };
