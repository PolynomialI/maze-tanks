/* Maze Tanks: shared game logic for the local page, the online client and the server.
 * Pure simulation, no drawing. Fixed 60 updates per second; units are maze pixels (one cell = 100). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Game = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const TICK = 60;
  const C = {
    TICK, DT: 1 / TICK,
    CELL: 100, WALL: 4,                          // wall half-thickness
    TANK_L: 40, TANK_W: 32, MUZZLE: 30,
    TANK_SPEED: 165, TANK_BACK: 115.5, TANK_TURN: 3.6,
    BULLET_R: 4, BULLET_SPEED: 210, BULLET_LIFE: 20 * TICK, MAX_BULLETS: 7,
    END_DELAY: 3 * TICK, COUNTDOWN: 3 * TICK,
    CRATE_R: 13, CRATE_MAX: 3, CRATE_MIN_T: 3 * TICK, CRATE_MAX_T: 8 * TICK,
    GAT_AMMO: 40, GAT_BURSTS: 2, GAT_SPIN: TICK, GAT_EVERY: 4, GAT_SPEED: 240, GAT_LIFE: 5 * TICK, GAT_SPREAD: 0.12,
    LASER_SPEED: 3000, LASER_LIFE: 48, LASER_R: 1.5, AIM_LEN: 2400,
    MISSILE_SPEED: 180, MISSILE_R: 5, MISSILE_LIFE: 30 * TICK, MISSILE_SEEK: 3 * TICK, MISSILE_TURN: 3.5,
    MISSILE_SWITCH: 2 * TICK, MISSILE_SWITCH_RATIO: 0.6,  // another tank must stay this much closer this long to steal the lock
    RAY_CHARGE: 2 * TICK, RAY_LIFE: 36, RAY_KILL: 12, RAY_W: 6,
    FRAG_SPEED: 170, FRAG_R: 6, FRAG_FUSE: 10 * TICK, FRAG_SHARDS: 24, SHARD_SPEED: 320, SHARD_LIFE: 27, SHARD_R: 2,
    DOUBLE_AMMO: 7, DOUBLE_GAP: 6,
    SHOT_AMMO: 3, SHOT_PELLETS: 24, SHOT_SPREAD: 0.4, SHOT_LIFE: 150, PELLET_R: 2,
    MINE_AMMO: 3, MINE_ARM: 2 * TICK, MINE_R: 9, MINE_PELLETS: 200,
    SHIELD_TIME: 6 * TICK, SHIELD_R: 36,
    STEP: 5                                      // longest projectile sub-step
  };
  const POWERUPS = ['gatling', 'laser', 'missile', 'deathray', 'frag', 'double', 'shotgun', 'mine', 'shield'];
  const AMMO = { gatling: C.GAT_AMMO, double: C.DOUBLE_AMMO, shotgun: C.SHOT_AMMO, mine: C.MINE_AMMO };
  const COLORS = ['#e2493b', '#f08c24', '#f2c230', '#8cc63f', '#2e9e4f', '#26a69a', '#3d8fe0', '#2f55b8', '#8e5cc7', '#e46aa7', '#8a6a52', '#4f5359'];
  const LOOK = { colors: COLORS.length, barrels: 4, accessories: 5 };
  const NOINPUT = {};
  const FIZZLE = { bullet: 1, missile: 1 }; // shots that leave a puff of smoke when they time out

  // ---------- random ----------
  function rnd(s) {
    let t = (s.seed = (s.seed + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function rint(s, a, b) { return a + Math.floor(rnd(s) * (b - a + 1)); }
  function wrap(a) { while (a > Math.PI) a -= 2 * Math.PI; while (a <= -Math.PI) a += 2 * Math.PI; return a; }

  // ---------- maze ----------
  // hw[y][x]: wall on the top edge of cell (x,y), y = 0..h. vw[y][x]: wall on the left edge, x = 0..w.
  // off[c] = 1 marks a hole: a cell cut out of the maze (drawn as white space).
  const isOff = (m, x, y) => x < 0 || y < 0 || x >= m.w || y >= m.h || (m.off ? m.off[y * m.w + x] === 1 : false);

  // Cut 1-3 random rectangles out of the grid and keep the largest connected part (at least 60% of cells).
  function carveHoles(w, h, s) {
    for (let tries = 0; tries < 30; tries++) {
      const off = new Array(w * h).fill(0);
      for (let k = rint(s, 1, 3); k > 0; k--) {
        const rw = rint(s, 1, Math.max(1, w >> 1)), rh = rint(s, 1, Math.max(1, h >> 1));
        const x0 = rint(s, 0, w - rw), y0 = rint(s, 0, h - rh);
        for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) off[y * w + x] = 1;
      }
      let best = [];
      const seen = new Uint8Array(w * h);
      for (let c0 = 0; c0 < w * h; c0++) {
        if (off[c0] || seen[c0]) continue;
        const comp = [c0];
        seen[c0] = 1;
        for (let i = 0; i < comp.length; i++) {
          const c = comp[i], x = c % w;
          for (const n of [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, c - w, c + w])
            if (n >= 0 && n < w * h && !off[n] && !seen[n]) { seen[n] = 1; comp.push(n); }
        }
        if (comp.length > best.length) best = comp;
      }
      // neighbouring cell pairs; a thin snake-like shape would leave no room for loops
      const inBest = new Set(best);
      const pairs = best.reduce((n, c) => n + (c % w < w - 1 && inBest.has(c + 1)) + inBest.has(c + w), 0);
      if (best.length >= 0.6 * w * h && pairs >= best.length + 2) {
        off.fill(1);
        for (const c of best) off[c] = 0;
        return off;
      }
    }
    return new Array(w * h).fill(0);
  }

  function makeMaze(w, h, s, loops = 0.2, holes = true, rooms = 0) {
    const off = holes ? carveHoles(w, h, s) : new Array(w * h).fill(0);
    const hw = [], vw = [];
    for (let y = 0; y <= h; y++) hw.push(new Array(w).fill(1));
    for (let y = 0; y < h; y++) vw.push(new Array(w + 1).fill(1));
    const seen = Uint8Array.from(off);
    const active = off.map((o, c) => (o ? -1 : c)).filter(c => c >= 0);
    const stack = [active[rint(s, 0, active.length - 1)]];
    seen[stack[0]] = 1;
    while (stack.length) {
      const c = stack[stack.length - 1], x = c % w, y = (c / w) | 0, opts = [];
      if (x > 0 && !seen[c - 1]) opts.push(c - 1);
      if (x < w - 1 && !seen[c + 1]) opts.push(c + 1);
      if (y > 0 && !seen[c - w]) opts.push(c - w);
      if (y < h - 1 && !seen[c + w]) opts.push(c + w);
      if (!opts.length) { stack.pop(); continue; }
      const n = opts[Math.floor(rnd(s) * opts.length)];
      const nx = n % w, ny = (n / w) | 0;
      if (ny === y) vw[y][Math.max(x, nx)] = 0; else hw[Math.max(y, ny)][x] = 0;
      seen[n] = 1;
      stack.push(n);
    }
    const m = { w, h, hw, vw, off };
    // no walls between two holes (or a hole and the outside)
    for (let y = 0; y <= h; y++) for (let x = 0; x < w; x++) if (isOff(m, x, y - 1) && isOff(m, x, y)) hw[y][x] = 0;
    for (let y = 0; y < h; y++) for (let x = 0; x <= w; x++) if (isOff(m, x - 1, y) && isOff(m, x, y)) vw[y][x] = 0;
    // knock out a share (loops) of the remaining interior walls so the maze has loops; always at least one
    const inner = [];
    for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) if (hw[y][x] && !isOff(m, x, y - 1) && !isOff(m, x, y)) inner.push([hw, x, y]);
    for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) if (vw[y][x] && !isOff(m, x - 1, y) && !isOff(m, x, y)) inner.push([vw, x, y]);
    for (let n = Math.min(inner.length - 1, Math.max(1, Math.round(inner.length * loops))); n > 0; n--) {
      const [g, x, y] = inner.splice(Math.floor(rnd(s) * inner.length), 1)[0];
      g[y][x] = 0;
    }
    // open rooms: every wall inside a random rectangle removed
    for (let r = 0; r < rooms; r++) {
      const rw = rint(s, 2, Math.max(2, Math.min(6, Math.floor(w * 0.6)))), rh = rint(s, 2, Math.max(2, Math.min(4, Math.floor(h * 0.6))));
      const x0 = rint(s, 0, w - rw), y0 = rint(s, 0, h - rh);
      for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) {
        if (isOff(m, x, y)) continue;
        if (x > x0 && !isOff(m, x - 1, y)) vw[y][x] = 0;
        if (y > y0 && !isOff(m, x, y - 1)) hw[y][x] = 0;
      }
    }
    // floor shading: random light/dark cells, smoothed so dark cells cluster together
    let shade = Array.from({ length: w * h }, () => (rnd(s) < 0.45 ? 1 : 0));
    for (let it = 0; it < 2; it++) shade = shade.map((v, c) => {
      const x = c % w, y = (c / w) | 0;
      let dark = 0, all = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (x + dx < 0 || y + dy < 0 || x + dx >= w || y + dy >= h) continue;
        all++; dark += shade[(y + dy) * w + x + dx];
      }
      return dark * 2 > all ? 1 : dark * 2 < all ? 0 : v;
    });
    m.shade = shade;
    return m;
  }

  // Always landscape, from tiny to huge, and from tight mazes to wide-open arenas.
  function mazeShape(s, n) {
    const minH = n <= 2 ? 2 : n <= 4 ? 3 : 4, size = rnd(s);
    let h = size < 0.15 ? rint(s, 2, 3) : size < 0.4 ? rint(s, 3, 5) : size < 0.75 ? rint(s, 5, 8) : rint(s, 8, 12);
    h = Math.max(h, minH);
    let w = Math.min(24, Math.max(h + 1, Math.round(h * (1.35 + rnd(s) * 0.75))));
    while (w * h < 3 * n) { h++; w = Math.max(w, Math.round(h * 1.4)); }
    const style = rnd(s); // 45% tight mazes, 35% medium, 20% open arenas that still keep some cover
    const loops = style < 0.45 ? 0.05 + rnd(s) * 0.1 : style < 0.8 ? 0.15 + rnd(s) * 0.2 : 0.35 + rnd(s) * 0.25;
    const rooms = w * h < 20 ? 0 : style < 0.45 ? 0 : style < 0.8 ? rint(s, 0, 1) : rint(s, 1, 2);
    return { w, h, loops, rooms, holes: w * h >= 12 };
  }

  // Wall rectangles (collinear runs merged so there are no seams).
  function buildWalls(m) {
    const S = C.CELL, T = C.WALL, out = [];
    for (let y = 0; y <= m.h; y++) for (let x = 0; x < m.w;) {
      if (!m.hw[y][x]) { x++; continue; }
      let e = x; while (e < m.w && m.hw[y][e]) e++;
      out.push({ x1: x * S - T, y1: y * S - T, x2: e * S + T, y2: y * S + T });
      x = e;
    }
    for (let x = 0; x <= m.w; x++) for (let y = 0; y < m.h;) {
      if (!m.vw[y][x]) { y++; continue; }
      let e = y; while (e < m.h && m.vw[e][x]) e++;
      out.push({ x1: x * S - T, y1: y * S - T, x2: x * S + T, y2: e * S + T });
      y = e;
    }
    return out;
  }

  // ---------- wall lookup ----------
  // Walls bucketed by maze cell, so collision checks only look at nearby walls.
  let stamp = 0;
  function wallGrid(walls) {
    if (walls.grid) return walls.grid;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const w of walls) { x0 = Math.min(x0, w.x1); y0 = Math.min(y0, w.y1); x1 = Math.max(x1, w.x2); y1 = Math.max(y1, w.y2); }
    const g = { gx: Math.floor(x0 / C.CELL), gy: Math.floor(y0 / C.CELL) };
    g.nx = Math.floor(x1 / C.CELL) - g.gx + 1;
    g.ny = Math.floor(y1 / C.CELL) - g.gy + 1;
    g.cells = Array.from({ length: g.nx * g.ny }, () => []);
    for (const w of walls) forCells(g, w.x1, w.y1, w.x2, w.y2, c => g.cells[c].push(w));
    Object.defineProperty(walls, 'grid', { value: g });
    return g;
  }
  function forCells(g, x1, y1, x2, y2, f) {
    const cx1 = Math.max(0, Math.floor(x1 / C.CELL) - g.gx), cx2 = Math.min(g.nx - 1, Math.floor(x2 / C.CELL) - g.gx);
    const cy1 = Math.max(0, Math.floor(y1 / C.CELL) - g.gy), cy2 = Math.min(g.ny - 1, Math.floor(y2 / C.CELL) - g.gy);
    for (let y = cy1; y <= cy2; y++) for (let x = cx1; x <= cx2; x++) f(y * g.nx + x);
  }
  // Calls f once for each wall overlapping the box.
  function nearWalls(walls, x1, y1, x2, y2, f) {
    if (!walls.length) return;
    const g = wallGrid(walls), q = ++stamp;
    forCells(g, x1, y1, x2, y2, c => { for (const w of g.cells[c]) if (w.seen !== q) { w.seen = q; f(w); } });
  }

  // ---------- geometry ----------
  function tankPoly(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a), l = C.TANK_L / 2, w = C.TANK_W / 2;
    return [[x + c * l - s * w, y + s * l + c * w], [x + c * l + s * w, y + s * l - c * w],
      [x - c * l + s * w, y - s * l - c * w], [x - c * l - s * w, y - s * l + c * w]];
  }
  function rectPoly(r) { return [[r.x1, r.y1], [r.x2, r.y1], [r.x2, r.y2], [r.x1, r.y2]]; }

  // Separating-axis test for two rectangles; returns the push that moves pa out of pb, or null.
  function sat(pa, pb) {
    let best = Infinity, bx = 0, by = 0;
    const cax = (pa[0][0] + pa[2][0]) / 2, cay = (pa[0][1] + pa[2][1]) / 2;
    const cbx = (pb[0][0] + pb[2][0]) / 2, cby = (pb[0][1] + pb[2][1]) / 2;
    for (const poly of [pa, pb]) for (let i = 0; i < 2; i++) {
      let nx = poly[i][1] - poly[i + 1][1], ny = poly[i + 1][0] - poly[i][0];
      const len = Math.hypot(nx, ny); nx /= len; ny /= len;
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
      for (const v of pa) { const d = v[0] * nx + v[1] * ny; if (d < a0) a0 = d; if (d > a1) a1 = d; }
      for (const v of pb) { const d = v[0] * nx + v[1] * ny; if (d < b0) b0 = d; if (d > b1) b1 = d; }
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return null;
      if (o < best) {
        best = o;
        const dir = (cax - cbx) * nx + (cay - cby) * ny < 0 ? -1 : 1;
        bx = nx * dir; by = ny * dir;
      }
    }
    return { x: bx * best, y: by * best };
  }

  function hitsTank(t, x, y, r) {
    const c = Math.cos(t.a), s = Math.sin(t.a), dx = x - t.x, dy = y - t.y;
    const lx = dx * c + dy * s, ly = -dx * s + dy * c;
    const qx = Math.max(-C.TANK_L / 2, Math.min(C.TANK_L / 2, lx));
    const qy = Math.max(-C.TANK_W / 2, Math.min(C.TANK_W / 2, ly));
    return (lx - qx) ** 2 + (ly - qy) ** 2 < r * r;
  }

  // First wall hit by a circle of radius r moving from (x,y) by (dx,dy). t is the fraction travelled.
  function castRay(walls, x, y, dx, dy, r) {
    let bt = Infinity, bnx = 0, bny = 0;
    nearWalls(walls, Math.min(x, x + dx) - r, Math.min(y, y + dy) - r, Math.max(x, x + dx) + r, Math.max(y, y + dy) + r, w => {
      const x1 = w.x1 - r, x2 = w.x2 + r, y1 = w.y1 - r, y2 = w.y2 + r;
      let tx0 = -Infinity, tx1 = Infinity, ty0 = -Infinity, ty1 = Infinity;
      if (dx) { const a = (x1 - x) / dx, b = (x2 - x) / dx; tx0 = Math.min(a, b); tx1 = Math.max(a, b); }
      else if (x <= x1 || x >= x2) return;
      if (dy) { const a = (y1 - y) / dy, b = (y2 - y) / dy; ty0 = Math.min(a, b); ty1 = Math.max(a, b); }
      else if (y <= y1 || y >= y2) return;
      const t0 = Math.max(tx0, ty0), t1 = Math.min(tx1, ty1);
      if (t1 <= t0 || t0 < 0 || t0 > 1 || t0 >= bt) return;
      bt = t0;
      bnx = tx0 >= ty0 - 1e-9 ? -Math.sign(dx) : 0;
      bny = ty0 >= tx0 - 1e-9 ? -Math.sign(dy) : 0;
    });
    return bt === Infinity ? null : { t: bt, nx: bnx, ny: bny };
  }

  // Move a projectile along its velocity by dist, bouncing off walls (shards stop at walls).
  function travel(state, p, dist) {
    const sp = Math.hypot(p.vx, p.vy);
    if (!sp) return;
    for (let i = 0; i < 12 && dist > 1e-6; i++) {
      const dx = p.vx / sp * dist, dy = p.vy / sp * dist;
      const h = castRay(state.walls, p.x, p.y, dx, dy, p.r);
      if (!h) { p.x += dx; p.y += dy; return; }
      p.x += dx * h.t + h.nx * 1e-3; p.y += dy * h.t + h.ny * 1e-3;
      dist -= dist * h.t;
      if (p.type === 'shard') { p.dead = true; return; }
      if (h.nx) p.vx = -p.vx;
      if (h.ny) p.vy = -p.vy;
      p.bounces++;
      if (p.path) p.path.push([p.x, p.y]);
    }
  }

  // Bouncing path of a laser from (x,y) at angle a, used for the aiming line.
  function tracePath(state, x, y, a, len) {
    const p = { type: 'aim', x, y, vx: Math.cos(a), vy: Math.sin(a), r: C.LASER_R, bounces: 0, path: [[x, y]] };
    travel(state, p, len);
    p.path.push([p.x, p.y]);
    return p.path;
  }

  // ---------- tanks ----------
  // Try a pose; small overlaps are pushed out (so tanks slide along walls), anything bigger is refused.
  function placeTank(state, tank, x, y, a) {
    const ox = x, oy = y, R = 26 + C.WALL;
    for (let it = 0; it < 6; it++) {
      const poly = tankPoly(x, y, a);
      let push = null;
      nearWalls(state.walls, x - R, y - R, x + R, y + R, w => { if (!push) push = sat(poly, rectPoly(w)); });
      if (!push) for (const o of state.tanks) {
        if (o === tank || !o.alive || Math.abs(o.x - x) > 52 || Math.abs(o.y - y) > 52) continue;
        if ((push = sat(poly, tankPoly(o.x, o.y, o.a)))) break;
      }
      if (!push) return Math.hypot(x - ox, y - oy) <= 4 ? [x, y] : null;
      x += push.x; y += push.y;
    }
    return null;
  }

  // Tank poses live on a fine grid (1/256 unit, 1/4096 rad) so a snapshot carries them exactly and a client
  // replaying its inputs from one gets bit-for-bit the same result as the server.
  const snap = v => Math.round(v * 256) / 256, snapA = a => Math.round(wrap(a) * 4096) / 4096;

  function moveTank(state, t, inp) {
    if (!t.alive || t.charge > 0) return;
    const turn = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (turn) {
      const a = snapA(t.a + turn * C.TANK_TURN * C.DT);
      const p = placeTank(state, t, t.x, t.y, a);
      if (p) { t.x = snap(p[0]); t.y = snap(p[1]); t.a = a; }
    }
    const mv = (inp.up ? 1 : 0) - (inp.down ? 1 : 0);
    if (mv) {
      const d = (mv > 0 ? C.TANK_SPEED : -C.TANK_BACK) * C.DT;
      const p = placeTank(state, t, t.x + Math.cos(t.a) * d, t.y + Math.sin(t.a) * d, t.a);
      if (p) { t.x = snap(p[0]); t.y = snap(p[1]); }
    }
  }

  function kill(state, t, by) {
    if (!t.alive) return;
    t.alive = false; t.weapon = null; t.charge = 0; t.shield = 0;
    state.kills.push([by, t.id]);
  }

  // ---------- weapons ----------
  // Projectiles start at the tank centre and travel out to the muzzle, so a barrel poking into a wall bounces the shot.
  function shoot(state, t, type, ang, side, speed, r, life, extra) {
    const a = t.a + ang;
    const p = Object.assign({
      id: state.nextId++, type, owner: t.id,
      x: t.x - Math.sin(t.a) * side, y: t.y + Math.cos(t.a) * side,
      vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r, life, age: 0, bounces: 0
    }, extra);
    if (p.path) p.path = [[p.x, p.y]];
    travel(state, p, C.MUZZLE);
    state.projectiles.push(p);
    return p;
  }

  // n tiny pieces flying out in all directions: 'shard' stops at walls, 'pellet' bounces.
  function burst(state, x, y, owner, n, speed, life, type = 'shard') {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rnd(state.rng) * 0.25, v = speed * (0.8 + 0.4 * rnd(state.rng));
      state.projectiles.push({ id: state.nextId++, type, owner, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        r: type === 'pellet' ? C.PELLET_R : C.SHARD_R, life: Math.round(life * (0.8 + 0.2 * rnd(state.rng))), age: 0, bounces: 0 });
    }
  }

  function explodeFrag(state, p) {
    p.dead = true;
    burst(state, p.x, p.y, p.owner, C.FRAG_SHARDS, C.SHARD_SPEED, C.SHARD_LIFE);
    const o = state.tanks.find(t => t.id === p.owner);
    if (o && o.weapon && o.weapon.bomb === p.id) o.weapon = null;
  }

  function fireRay(state, t) {
    const c = Math.cos(t.a), s = Math.sin(t.a), x1 = t.x + c * C.MUZZLE, y1 = t.y + s * C.MUZZLE;
    // passes through walls but stops at white space (a hole or the edge of the maze)
    const out = d => isOff(state.maze, Math.floor((x1 + c * d) / C.CELL), Math.floor((y1 + s * d) / C.CELL));
    let d = 0;
    if (!out(0)) while (d < 1e4 && !out(d + 2)) d += 2;
    state.beams.push({ id: state.nextId++, owner: t.id, x1, y1, x2: x1 + c * d, y2: y1 + s * d, age: 0 });
  }

  function fire(state, t, inp) {
    const press = !!inp.fire && !t.fireHeld;
    t.fireHeld = !!inp.fire;
    if (t.charge > 0) {
      if (--t.charge === 0) { fireRay(state, t); t.weapon = null; }
      return;
    }
    const w = t.weapon, rng = state.rng;
    if (!w) {
      if (press && state.projectiles.filter(p => p.owner === t.id && p.normal && !p.dead).length < C.MAX_BULLETS)
        shoot(state, t, 'bullet', 0, 0, C.BULLET_SPEED, C.BULLET_R, C.BULLET_LIFE, { normal: true });
      return;
    }
    switch (w.type) {
      case 'gatling': // hold to spin up and fire; a finished burst needs a release before the next one
        if (!inp.fire) { w.spin = 0; w.wait = false; break; }
        if (w.wait) break;
        if (++w.spin >= C.GAT_SPIN && (w.spin - C.GAT_SPIN) % C.GAT_EVERY === 0) {
          shoot(state, t, 'gat', (rnd(rng) * 2 - 1) * C.GAT_SPREAD, 0, C.GAT_SPEED, C.PELLET_R, C.GAT_LIFE);
          if (--w.ammo > 0) break;
          if (--w.bursts <= 0) t.weapon = null;
          else { w.ammo = C.GAT_AMMO; w.wait = true; w.spin = 0; }
        }
        break;
      case 'laser':
        if (press) { shoot(state, t, 'laser', 0, 0, C.LASER_SPEED, C.LASER_R, C.LASER_LIFE, { path: [] }); t.weapon = null; }
        break;
      case 'missile':
        if (press) { shoot(state, t, 'missile', 0, 0, C.MISSILE_SPEED, C.MISSILE_R, C.MISSILE_LIFE, { target: null, rival: 0 }); t.weapon = null; }
        break;
      case 'deathray':
        if (press) t.charge = C.RAY_CHARGE;
        break;
      case 'frag':
        if (!press) break;
        if (w.bomb == null) w.bomb = shoot(state, t, 'frag', 0, 0, C.FRAG_SPEED, C.FRAG_R, C.FRAG_FUSE).id;
        else {
          const b = state.projectiles.find(p => p.id === w.bomb && !p.dead);
          if (b) explodeFrag(state, b);
          t.weapon = null;
        }
        break;
      case 'double':
        if (!press) break;
        for (const side of [-1, 1]) shoot(state, t, 'bullet', 0, side * C.DOUBLE_GAP, C.BULLET_SPEED, C.BULLET_R, C.BULLET_LIFE);
        if (--w.ammo <= 0) t.weapon = null;
        break;
      case 'shotgun':
        if (!press) break;
        for (let i = 0; i < C.SHOT_PELLETS; i++)
          shoot(state, t, 'pellet', (rnd(rng) * 2 - 1) * C.SHOT_SPREAD, 0, C.BULLET_SPEED * (1.1 + rnd(rng) * 0.5),
            C.PELLET_R, C.SHOT_LIFE - rint(rng, 0, 30));
        if (--w.ammo <= 0) t.weapon = null;
        break;
      case 'mine':
        if (!press) break;
        state.mines.push({ id: state.nextId++, owner: t.id, x: t.x, y: t.y, age: 0 });
        if (--w.ammo <= 0) t.weapon = null;
        break;
    }
  }

  // ---------- missiles ----------
  function cellOf(state, x, y) {
    const m = state.maze;
    const cx = Math.max(0, Math.min(m.w - 1, Math.floor(x / C.CELL))), cy = Math.max(0, Math.min(m.h - 1, Math.floor(y / C.CELL)));
    return cy * m.w + cx;
  }

  // Cells on the shortest maze path from (x0,y0) to (x1,y1), excluding the start cell.
  function pathCells(state, x0, y0, x1, y1) {
    const m = state.maze, w = m.w, s = cellOf(state, x0, y0), g = cellOf(state, x1, y1);
    const prev = new Int32Array(w * m.h).fill(-1), q = [s];
    prev[s] = s;
    for (let i = 0; i < q.length && prev[g] < 0; i++) {
      const c = q[i], x = c % w, y = (c / w) | 0;
      const go = n => { if (prev[n] < 0) { prev[n] = c; q.push(n); } };
      if (x < w - 1 && !m.vw[y][x + 1]) go(c + 1);
      if (x > 0 && !m.vw[y][x]) go(c - 1);
      if (y < m.h - 1 && !m.hw[y + 1][x]) go(c + w);
      if (y > 0 && !m.hw[y][x]) go(c - w);
    }
    if (prev[g] < 0) return [];
    const path = [];
    for (let c = g; c !== s; c = prev[c]) path.push(c);
    return path.reverse();
  }

  function steerMissile(state, p) {
    if (p.age < C.MISSILE_SEEK) return;
    let near = null, nd = Infinity;
    for (const o of state.tanks) {
      const d = o.alive ? Math.hypot(o.x - p.x, o.y - p.y) : Infinity;
      if (d < nd) { nd = d; near = o; }
    }
    const cur = state.tanks.find(o => o.id === p.target && o.alive);
    if (!cur) { p.target = near ? near.id : null; p.rival = 0; }
    else if (near !== cur && nd < C.MISSILE_SWITCH_RATIO * Math.hypot(cur.x - p.x, cur.y - p.y)) {
      // switch only after another tank has stayed much closer for a while
      if (++p.rival >= C.MISSILE_SWITCH) { p.target = near.id; p.rival = 0; }
    } else p.rival = 0;
    const t = state.tanks.find(o => o.id === p.target && o.alive);
    if (!t) return;
    let gx = t.x, gy = t.y;
    const clear = (x, y) => !castRay(state.walls, p.x, p.y, x - p.x, y - p.y, p.r);
    if (!clear(t.x, t.y)) {
      const path = pathCells(state, p.x, p.y, t.x, t.y), w = state.maze.w;
      for (let i = Math.min(2, path.length - 1); i >= 0; i--) {
        const cx = (path[i] % w + 0.5) * C.CELL, cy = (((path[i] / w) | 0) + 0.5) * C.CELL;
        gx = cx; gy = cy;
        if (clear(cx, cy)) break;
      }
    }
    const head = Math.atan2(p.vy, p.vx), d = wrap(Math.atan2(gy - p.y, gx - p.x) - head), m = C.MISSILE_TURN * C.DT;
    const a = head + Math.max(-m, Math.min(m, d));
    p.vx = Math.cos(a) * C.MISSILE_SPEED; p.vy = Math.sin(a) * C.MISSILE_SPEED;
  }

  // ---------- per-tick systems ----------
  // Shots bounce off a force field: anything inside it heading toward the tank is turned back.
  function shieldBounce(state, p, px, py) {
    for (const t of state.tanks) {
      if (!t.alive || !t.shield) continue;
      const R = C.SHIELD_R + p.r, dx = p.x - t.x, dy = p.y - t.y, d = Math.hypot(dx, dy);
      if (d > R || d === 0) continue;
      const nx = dx / d, ny = dy / d, dot = p.vx * nx + p.vy * ny;
      if (dot >= 0) continue;
      p.vx -= 2 * dot * nx; p.vy -= 2 * dot * ny;
      if (Math.hypot(px - t.x, py - t.y) > R) { p.x = px; p.y = py; }
      p.bounces++;
      if (p.path) p.path.push([p.x, p.y]);
    }
  }

  function stepProjectiles(state) {
    const n0 = state.projectiles.length;
    for (let i = 0; i < n0; i++) {
      const p = state.projectiles[i];
      if (p.dead) continue;
      p.age++;
      if (p.type === 'missile') steerMissile(state, p);
      const dist = Math.hypot(p.vx, p.vy) * C.DT, n = Math.max(1, Math.ceil(dist / C.STEP));
      for (let k = 0; k < n && !p.dead; k++) {
        const px = p.x, py = p.y;
        travel(state, p, dist / n);
        if (p.dead) break;
        shieldBounce(state, p, px, py);
        for (const t of state.tanks) {
          if (!t.alive || t.shield || !hitsTank(t, p.x, p.y, p.r)) continue;
          if (p.type === 'frag') { explodeFrag(state, p); break; }
          kill(state, t, p.owner);
          if (p.type !== 'laser') { p.dead = true; break; }
        }
      }
      if (p.path && !p.dead) p.head = [p.x, p.y];
      if (!p.dead && p.age >= p.life) {
        if (p.type === 'frag') explodeFrag(state, p);
        else {
          p.dead = true;
          if (FIZZLE[p.type]) state.fx.push({ id: state.nextId++, x: p.x, y: p.y, tick: state.tick, big: p.type === 'missile' });
        }
      }
    }
  }

  function stepMines(state) {
    for (const m of state.mines) {
      if (++m.age < C.MINE_ARM) continue;
      if (state.tanks.some(t => t.alive && hitsTank(t, m.x, m.y, C.MINE_R))) {
        m.dead = true;
        burst(state, m.x, m.y, m.owner, C.MINE_PELLETS, C.BULLET_SPEED * 1.35, C.SHOT_LIFE, 'pellet');
      }
    }
    state.mines = state.mines.filter(m => !m.dead);
  }

  function stepBeams(state) {
    for (const b of state.beams) {
      if (++b.age > C.RAY_KILL) continue;
      const dx = b.x2 - b.x1, dy = b.y2 - b.y1, len = Math.hypot(dx, dy) || 1;
      for (const t of state.tanks) {
        if (!t.alive || t.shield) continue;
        const u = Math.max(0, Math.min(len, ((t.x - b.x1) * dx + (t.y - b.y1) * dy) / len));
        if (Math.hypot(b.x1 + dx / len * u - t.x, b.y1 + dy / len * u - t.y) > 26 + C.RAY_W) continue;
        for (let s = 0; s <= len; s += 4)
          if (hitsTank(t, b.x1 + dx / len * s, b.y1 + dy / len * s, C.RAY_W)) { kill(state, t, b.owner); break; }
      }
    }
    state.beams = state.beams.filter(b => b.age < C.RAY_LIFE);
  }

  function stepCrates(state) {
    const m = state.maze;
    if (state.crates.length < C.CRATE_MAX && --state.crateTimer <= 0) {
      state.crateTimer = rint(state.rng, C.CRATE_MIN_T, C.CRATE_MAX_T);
      const free = [];
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        if (isOff(m, x, y)) continue;
        const cx = (x + 0.5) * C.CELL, cy = (y + 0.5) * C.CELL;
        if (state.tanks.some(t => t.alive && Math.hypot(t.x - cx, t.y - cy) < 60)) continue;
        if (state.crates.some(c => c.x === cx && c.y === cy)) continue;
        free.push([cx, cy]);
      }
      if (free.length) {
        const [x, y] = free[rint(state.rng, 0, free.length - 1)];
        state.crates.push({ id: state.nextId++, type: POWERUPS[rint(state.rng, 0, POWERUPS.length - 1)], x, y });
      }
    }
    for (const c of state.crates) for (const t of state.tanks) {
      if (c.taken || !t.alive || !hitsTank(t, c.x, c.y, C.CRATE_R)) continue;
      if (c.type === 'shield') { if (t.shield) continue; t.shield = C.SHIELD_TIME; }
      else {
        if (t.weapon || t.charge) continue;
        t.weapon = { type: c.type, ammo: AMMO[c.type] || 1, spin: 0, bomb: null, bursts: c.type === 'gatling' ? C.GAT_BURSTS : 1, wait: false };
      }
      c.taken = true;
    }
    state.crates = state.crates.filter(c => !c.taken);
  }

  // ---------- rounds ----------
  function newRound(seed, players) {
    const s = { seed: seed | 0 }, n = players.length;
    const { w, h, loops, rooms, holes } = mazeShape(s, n);
    const maze = makeMaze(w, h, s, loops, holes, rooms);
    const cells = [...Array(w * h).keys()].filter(c => !maze.off[c]);
    for (let i = cells.length - 1; i > 0; i--) { const j = rint(s, 0, i); [cells[i], cells[j]] = [cells[j], cells[i]]; }
    const picks = [];
    const far = c => picks.every(p => Math.abs(p % w - c % w) + Math.abs(((p / w) | 0) - ((c / w) | 0)) >= 2);
    for (const c of cells) if (picks.length < n && far(c)) picks.push(c);
    for (const c of cells) if (picks.length < n && !picks.includes(c)) picks.push(c);
    const state = {
      tick: 0, rng: s, maze, walls: buildWalls(maze), tanks: [], projectiles: [], mines: [], beams: [], crates: [], fx: [],
      kills: [], phase: 'play', endTimer: 0, winner: null, crateTimer: rint(s, C.CRATE_MIN_T, C.CRATE_MAX_T), nextId: 1,
      countdown: C.COUNTDOWN
    };
    players.forEach((p, i) => state.tanks.push({
      id: p.id, x: (picks[i] % w + 0.5) * C.CELL, y: (((picks[i] / w) | 0) + 0.5) * C.CELL,
      a: snapA(rnd(s) * Math.PI * 2 - Math.PI), alive: true, weapon: null, charge: 0, shield: 0, fireHeld: true
    }));
    return state;
  }

  // One 1/60 s of a player's input. Online inputs carry 'go' (the client's countdown is over; its countdown starts
  // after the server's, so a 'go' while the server still has over half a second left is ignored).
  // Local inputs follow the round's own countdown.
  function control(state, t, inp) {
    if (!t.alive) return;
    if (inp.go === undefined ? state.countdown > 0 : !inp.go || state.countdown > C.TICK / 2) return;
    moveTank(state, t, inp);
    fire(state, t, inp);
  }

  // Everything except the players' own tanks: shots, mines, rays, crates, round end.
  function stepWorld(state) {
    state.tick++;
    if (state.countdown > 0) { state.countdown--; return; }
    for (const t of state.tanks) if (t.alive && t.shield > 0) t.shield--;
    stepProjectiles(state);
    stepMines(state);
    stepBeams(state);
    stepCrates(state);
    state.projectiles = state.projectiles.filter(p => !p.dead);
    state.fx = state.fx.filter(f => state.tick - f.tick < 20); // kept briefly so snapshots carry them
    const alive = state.tanks.filter(t => t.alive);
    if (state.phase === 'play' && alive.length <= 1) { state.phase = 'ending'; state.endTimer = C.END_DELAY; }
    else if (state.phase === 'ending' && --state.endTimer <= 0) {
      state.phase = 'over';
      state.winner = alive.length === 1 ? alive[0].id : null;
    }
  }

  function step(state, inputs) {
    for (const t of state.tanks) control(state, t, inputs[t.id] || NOINPUT);
    stepWorld(state);
  }

  // A series of rounds with per-player wins and kills. Players who join mid-round watch until the next one.
  class Match {
    constructor(seed) {
      this.rng = { seed: seed | 0 };
      this.players = [];
      this.state = null;
      this.round = 0;
      this.version = 0;                         // bumps whenever the player list or stats change
    }
    player(id) { return this.players.find(p => p.id === id); }
    addPlayer(id, look) {
      this.players.push({ id, look: cleanLook(look), wins: 0, kills: 0, input: NOINPUT });
      this.version++;
      if (!this.state && this.players.length >= 2) this.startRound();
    }
    removePlayer(id) {
      this.players = this.players.filter(p => p.id !== id);
      if (this.state) this.state.tanks = this.state.tanks.filter(t => t.id !== id);
      this.version++;
    }
    startRound() {
      this.round++;
      this.state = newRound(Math.floor(rnd(this.rng) * 2147483647), this.players);
      this.version++;
    }
    inRound(id) { return !!this.state && this.state.tanks.some(t => t.id === id); }
    // Local play: every player's current input, then the world.
    step() {
      if (!this.state) return;
      for (const p of this.players) this.control(p.id, p.input);
      this.advance();
    }
    // Online: the server applies each received input as it arrives, then advances the world once per update.
    control(id, inp) {
      const t = this.state && this.state.tanks.find(o => o.id === id);
      if (t) control(this.state, t, inp);
    }
    advance() {
      const st = this.state;
      if (!st) return;
      stepWorld(st);
      for (const [by, victim] of st.kills) {
        const p = by !== victim && this.player(by);
        if (p) { p.kills++; this.version++; }
      }
      st.kills.length = 0;
      if (st.phase === 'over') {
        const w = st.winner != null && this.player(st.winner);
        if (w) w.wins++;
        this.state = null;
        this.version++;
        if (this.players.length >= 2) this.startRound();
      }
    }
  }

  function cleanLook(l) {
    l = l || {};
    const pick = (v, n, d) => (Number.isInteger(v) && v >= 0 && v < n ? v : d);
    return {
      body: pick(l.body, LOOK.colors, 0), turret: pick(l.turret, LOOK.colors, 0), tread: pick(l.tread, LOOK.colors, 11),
      barrel: pick(l.barrel, LOOK.barrels, 0), acc: pick(l.acc, LOOK.accessories, 0)
    };
  }

  const KEYS = ['up', 'down', 'left', 'right', 'fire'];
  // Bits 0-4: KEYS; bit 5: go (the sender's round countdown is over).
  function encodeInput(i) { return KEYS.reduce((b, k, n) => b | (i[k] ? 1 << n : 0), i.go === false ? 0 : 32); }
  function decodeInput(b) { const i = { go: !!(b & 32) }; KEYS.forEach((k, n) => { i[k] = !!(b & (1 << n)); }); return i; }

  return {
    C, POWERUPS, COLORS, LOOK, KEYS, rnd, rint, wrap, isOff, makeMaze, buildWalls, tankPoly, rectPoly, sat, hitsTank, castRay,
    travel, tracePath, placeTank, moveTank, control, fire, shoot, kill, pathCells, newRound, step, stepWorld, Match, cleanLook,
    encodeInput, decodeInput
  };
});
