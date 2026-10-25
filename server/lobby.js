// Matchmaking and lobbies. Each lobby runs the authoritative simulation at 60 updates per second.
const G = require('../shared/game.js');

const MAX_PLAYERS = 8;
const SNAP_EVERY = 3;      // snapshot every 3 updates = 20 per second
const MAX_QUEUED_INPUTS = 10;

const r1 = v => Math.round(v * 10) / 10;

class Lobby {
  constructor(id) {
    this.id = id;
    this.clients = new Set();
    this.match = new G.Match((Math.random() * 2147483647) | 0);
    this.sentVersion = -1;
    this.sentRound = 0;
    this.ticks = 0;
    this.timer = null;
  }
  get size() { return this.clients.size; }

  add(c) {
    this.clients.add(c);
    c.lobby = this;
    c.inputs = [];
    c.ack = 0;
    this.match.addPlayer(c.id, c.look);
    c.send({ t: 'lobby', id: this.id });
    if (this.match.state && this.sentRound === this.match.round) c.send(this.roundMsg());
    this.sentVersion = -1;
    if (!this.timer) this.start();
  }

  remove(c) {
    this.clients.delete(c);
    c.lobby = null;
    this.match.removePlayer(c.id);
    if (!this.clients.size) this.close();
  }

  start() {
    let last = process.hrtime.bigint(), acc = 0;
    this.timer = setInterval(() => {
      const now = process.hrtime.bigint();
      acc += Number(now - last) / 1e9;
      last = now;
      for (let n = 0; acc >= G.C.DT && n < 10; n++) { this.tick(); acc -= G.C.DT; }
      if (acc > G.C.DT) acc = 0; // too far behind: skip rather than spiral
    }, 1000 / G.C.TICK);
  }

  close() {
    clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    for (const c of this.clients) {
      const p = this.match.player(c.id);
      if (!c.inputs.length || !p) continue;
      const [seq, bits] = c.inputs.shift();
      c.ack = seq;
      p.input = G.decodeInput(bits);
    }
    this.match.step();
    this.ticks++;
    if (this.match.state && this.sentRound !== this.match.round) {
      this.sentRound = this.match.round;
      this.broadcast(JSON.stringify(this.roundMsg()));
    }
    if (this.match.version !== this.sentVersion) {
      this.sentVersion = this.match.version;
      this.broadcast(JSON.stringify(this.playersMsg()));
    }
    if (this.match.state && this.ticks % SNAP_EVERY === 0) {
      const body = JSON.stringify(this.snapshot()).slice(1);
      for (const c of this.clients) c.send('{"a":' + c.ack + ',' + body);
    }
  }

  broadcast(s) { for (const c of this.clients) c.send(s); }

  roundMsg() {
    const m = this.match.state.maze;
    return { t: 'r', n: this.match.round, maze: { w: m.w, h: m.h, hw: m.hw, vw: m.vw, off: m.off } };
  }

  playersMsg() {
    const m = this.match;
    return {
      t: 'pl', w: m.state ? 0 : 1,
      p: m.players.map(p => ({ id: p.id, look: p.look, wins: p.wins, kills: p.kills, out: !m.inRound(p.id) }))
    };
  }

  snapshot() {
    const st = this.match.state;
    return {
      t: 's', n: this.match.round, k: st.tick, ph: st.phase,
      T: st.tanks.map(t => [t.id, r1(t.x), r1(t.y), Math.round(t.a * 1e4) / 1e4, t.alive ? 1 : 0,
        t.weapon ? t.weapon.type : 0, t.charge, t.shield, t.weapon ? t.weapon.spin : 0]),
      P: st.projectiles.map(p => [p.id, p.type, r1(p.x), r1(p.y), p.owner,
        p.type === 'laser' ? p.path.map(q => [r1(q[0]), r1(q[1])])
          : p.type === 'missile' ? [r1(p.vx), r1(p.vy), p.target == null ? null : p.target] : 0]),
      F: st.fx.map(f => [f.id, r1(f.x), r1(f.y), f.big ? 1 : 0]),
      M: st.mines.map(m => [m.id, r1(m.x), r1(m.y), m.owner, m.age]),
      C: st.crates.map(c => [c.id, c.type, c.x, c.y]),
      B: st.beams.map(b => [b.id, r1(b.x1), r1(b.y1), r1(b.x2), r1(b.y2), b.owner, b.age])
    };
  }
}

// Queue rules: two waiting players start a lobby; later arrivals join a running lobby
// with a free seat (up to 8); when every lobby is full, arrivals wait for the next pair.
class Matchmaker {
  constructor() {
    this.waiting = [];
    this.lobbies = new Set();
    this.nextLobby = 1;
  }

  queue(c) {
    if (c.lobby || this.waiting.includes(c)) return;
    const open = [...this.lobbies].find(l => l.size < MAX_PLAYERS);
    if (open) { open.add(c); return; }
    this.waiting.push(c);
    c.send({ t: 'wait' });
    if (this.waiting.length >= 2) {
      const l = new Lobby(this.nextLobby++);
      this.lobbies.add(l);
      for (const w of this.waiting.splice(0, MAX_PLAYERS)) l.add(w);
    }
  }

  leave(c) {
    this.waiting = this.waiting.filter(w => w !== c);
    const l = c.lobby;
    if (!l) return;
    l.remove(c);
    if (!l.size) { this.lobbies.delete(l); return; }
    while (l.size < MAX_PLAYERS && this.waiting.length) l.add(this.waiting.shift());
  }

  input(c, seq, bits) {
    if (!c.lobby) return;
    c.inputs.push([seq, bits & 31]);
    if (c.inputs.length > MAX_QUEUED_INPUTS) c.inputs.shift();
  }

  closeAll() { for (const l of this.lobbies) l.close(); }
}

module.exports = { Lobby, Matchmaker, MAX_PLAYERS };
