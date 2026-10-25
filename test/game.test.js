const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../shared/game.js');
const { C } = G;

// An empty w x h arena (outer walls only) plus optional extra wall rectangles.
function arena(w, h, extra = [], tanks = []) {
  const hw = [], vw = [];
  for (let y = 0; y <= h; y++) hw.push(new Array(w).fill(y === 0 || y === h ? 1 : 0));
  for (let y = 0; y < h; y++) vw.push(Array.from({ length: w + 1 }, (_, x) => (x === 0 || x === w ? 1 : 0)));
  const maze = { w, h, hw, vw };
  return {
    tick: 0, rng: { seed: 1 }, maze, walls: G.buildWalls(maze).concat(extra), tanks, projectiles: [], mines: [], beams: [], fx: [],
    crates: [], kills: [], phase: 'play', endTimer: 0, winner: null, crateTimer: 1e9, nextId: 1
  };
}
const tank = (id, x, y, a = 0) => ({ id, x, y, a, alive: true, weapon: null, charge: 0, shield: 0, fireHeld: false });
const run = (st, n, inputs = {}) => { for (let i = 0; i < n; i++) G.step(st, inputs); };
const press = (st, id) => { G.step(st, { [id]: { fire: true } }); G.step(st, {}); };
// (overlaps under 0.01 units come from rounding poses to their fine grid and are pushed out on the next move)
const overlapsWall = (st, t) => st.walls.some(w => { const m = G.sat(G.tankPoly(t.x, t.y, t.a), G.rectPoly(w)); return m && Math.hypot(m.x, m.y) > 0.01; });
const arm = (t, type) => {
  t.weapon = { type, ammo: { gatling: C.GAT_AMMO, double: C.DOUBLE_AMMO, shotgun: C.SHOT_AMMO, mine: C.MINE_AMMO }[type] || 1,
    spin: 0, bomb: null, bursts: type === 'gatling' ? C.GAT_BURSTS : 1, wait: false };
};
const started = m => { m.state.countdown = 0; return m; };

test('bullet reflects off a vertical wall: angle in equals angle out', () => {
  const st = arena(10, 10);
  const p = { type: 'bullet', x: 900, y: 500, vx: 100, vy: -60, r: C.BULLET_R, bounces: 0 };
  G.travel(st, p, 200);
  assert.equal(p.bounces, 1);
  assert.ok(p.vx < 0 && p.vy === -60, 'only the x component flips');
  assert.ok(Math.abs(Math.atan2(-p.vy, -p.vx) - Math.atan2(60, 100)) < 1e-9);
  assert.ok(p.x < 1000 - C.WALL - C.BULLET_R, 'stays inside the maze');
});

test('bullet reflects off a horizontal wall and reverses at a corner', () => {
  const st = arena(10, 10);
  const p = { type: 'bullet', x: 500, y: 50, vx: 30, vy: -80, r: C.BULLET_R, bounces: 0 };
  G.travel(st, p, 100);
  assert.equal(p.bounces, 1);
  assert.ok(p.vx === 30 && p.vy > 0);
  const q = { type: 'bullet', x: 950, y: 950, vx: 50, vy: 50, r: C.BULLET_R, bounces: 0 };
  G.travel(st, q, 100);
  assert.ok(q.vx < 0 && q.vy < 0, 'a corner sends it straight back');
});

test('bullet bounces off a wall end-cap and never passes through walls', () => {
  const cap = arena(10, 10, [{ x1: 300, y1: 497, x2: 600, y2: 503 }]);
  const c = { type: 'bullet', x: 700, y: 500, vx: -210, vy: 0, r: C.BULLET_R, bounces: 0 };
  G.travel(cap, c, 150);
  assert.ok(c.vx > 0 && c.bounces === 1 && c.x > 600, 'end-cap reflects');
  const st = arena(10, 10, [{ x1: 0, y1: 497, x2: 1000, y2: 503 }]);
  for (let i = 0; i < 200; i++) {
    const a = (i / 200) * Math.PI * 2;
    const p = { type: 'bullet', x: 450, y: 400, vx: Math.cos(a) * 210, vy: Math.sin(a) * 210, r: C.BULLET_R, bounces: 0 };
    for (let k = 0; k < 600; k++) {
      G.travel(st, p, 3.5);
      assert.ok(p.y < 500, `angle ${a.toFixed(2)} crossed the wall`);
    }
  }
});

test('normal bullets: 7 per tank, last 20 seconds, kill the shooter too', () => {
  const st = arena(10, 10, [], [tank(1, 150, 150, 0), tank(2, 850, 850, 0)]);
  for (let i = 0; i < 9; i++) press(st, 1);
  assert.equal(st.projectiles.filter(p => p.owner === 1).length, 7);
  const life = st.projectiles[0].life;
  assert.equal(life, 20 * 60);
  const solo = arena(3, 1, [], [tank(1, 150, 50, 0)]);
  solo.tanks[0].x = 225; // nose close to the right wall: the shot comes straight back
  press(solo, 1);
  run(solo, 30);
  assert.equal(solo.tanks[0].alive, false, 'own bullet kills the shooter');
  assert.deepEqual(solo.kills, [[1, 1]]);
});

test('bullets expire after their lifetime and leave a puff of smoke', () => {
  const st = arena(10, 10, [], [tank(1, 150, 150, 0.3)]);
  press(st, 1);
  st.tanks[0].x = -1000; // move the tank out of the way
  run(st, C.BULLET_LIFE - 3);
  assert.equal(st.projectiles.length, 1);
  run(st, 3);
  assert.equal(st.projectiles.length, 0);
  assert.equal(st.fx.length, 1, 'timeout smoke');
  run(st, 20);
  assert.equal(st.fx.length, 0, 'smoke events are dropped after a moment');
});

test('minigun pellets last 5 seconds; minigun and shotgun pellets vanish without smoke', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0)]);
  G.shoot(st, st.tanks[0], 'gat', 0, 0, C.GAT_SPEED, C.PELLET_R, C.GAT_LIFE);
  G.shoot(st, st.tanks[0], 'pellet', 0.5, 0, C.BULLET_SPEED, C.PELLET_R, 30);
  st.tanks[0].x = -1000;
  run(st, 31);
  assert.deepEqual(st.projectiles.map(p => p.type), ['gat']);
  assert.equal(st.fx.length, 0);
  run(st, C.GAT_LIFE - 32);
  assert.equal(st.projectiles.length, 1);
  run(st, 1);
  assert.equal(st.projectiles.length, 0, 'gone after exactly 5 s');
  assert.equal(st.fx.length, 0);
});

test('fast wall lookup gives the same hits as checking every wall', () => {
  const st = G.newRound(11, [1, 2, 3, 4, 5, 6, 7, 8].map(id => ({ id })));
  const brute = (x, y, dx, dy, r) => {
    let best = null;
    for (const w of st.walls) {
      const h = G.castRay([w], x, y, dx, dy, r);
      if (h && (!best || h.t < best.t)) best = h;
    }
    return best;
  };
  const rng = { seed: 3 }, W = st.maze.w * 100, H = st.maze.h * 100;
  for (let i = 0; i < 3000; i++) {
    const x = G.rnd(rng) * W, y = G.rnd(rng) * H, a = G.rnd(rng) * 7, d = G.rnd(rng) * 300;
    const g = G.castRay(st.walls, x, y, Math.cos(a) * d, Math.sin(a) * d, 4), b = brute(x, y, Math.cos(a) * d, Math.sin(a) * d, 4);
    assert.deepEqual(g && [g.t, g.nx, g.ny], b && [b.t, b.nx, b.ny]);
  }
});

test('tanks cannot drive or rotate into walls (rotated rectangle)', () => {
  const st = arena(3, 3, [], [tank(1, 150, 150, 0.4)]);
  const t = st.tanks[0];
  for (let i = 0; i < 300; i++) {
    G.step(st, { 1: { up: true, left: i % 50 < 20 } });
    assert.ok(!overlapsWall(st, t), 'overlap after driving');
  }
  for (let i = 0; i < 200; i++) {
    G.step(st, { 1: { right: true } });
    assert.ok(!overlapsWall(st, t), 'overlap after rotating');
  }
  assert.ok(t.x > 0 && t.x < 300 && t.y > 0 && t.y < 300);
});

test('movement is linear: constant speed, instant stop, constant turn rate', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0)]);
  const t = st.tanks[0];
  G.step(st, { 1: { up: true } });
  assert.ok(Math.abs(t.x - (150 + C.TANK_SPEED / 60)) < 1e-9);
  G.step(st, {});
  assert.ok(Math.abs(t.x - (150 + C.TANK_SPEED / 60)) < 1e-9, 'stops instantly');
  G.step(st, { 1: { right: true } });
  assert.ok(Math.abs(t.a - C.TANK_TURN / 60) < 1e-3);
});

test('tanks block each other', () => {
  const st = arena(10, 10, [], [tank(1, 300, 500, 0), tank(2, 380, 500, 0)]);
  run(st, 120, { 1: { up: true } });
  assert.equal(G.sat(G.tankPoly(300, 500, 0), G.tankPoly(380, 500, 0)), null);
  const [a, b] = st.tanks;
  assert.equal(G.sat(G.tankPoly(a.x, a.y, a.a), G.tankPoly(b.x, b.y, b.a)), null);
  assert.ok(a.x > 330, 'drove up to the other tank');
});

test('maze: irregular outline, every cell reachable, has loops, closed by walls, size varies', () => {
  const sizes = new Set();
  let holes = 0;
  for (let seed = 1; seed < 40; seed++) {
    const st = G.newRound(seed, [{ id: 1 }, { id: 2 }]);
    const m = st.maze, off = (x, y) => G.isOff(m, x, y);
    sizes.add(m.w + 'x' + m.h);
    const cells = [];
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (!off(x, y)) cells.push([x, y]);
    holes += cells.length < m.w * m.h;
    assert.ok(cells.length >= 0.6 * m.w * m.h);
    for (const [x, y] of cells) {
      // every edge between a maze cell and white space is a wall
      if (off(x, y - 1)) assert.ok(m.hw[y][x]);
      if (off(x, y + 1)) assert.ok(m.hw[y + 1][x]);
      if (off(x - 1, y)) assert.ok(m.vw[y][x]);
      if (off(x + 1, y)) assert.ok(m.vw[y][x + 1]);
      const [sx, sy] = cells[0];
      if (x !== sx || y !== sy) assert.ok(G.pathCells(st, (sx + 0.5) * 100, (sy + 0.5) * 100, (x + 0.5) * 100, (y + 0.5) * 100).length > 0, 'unreachable cell');
    }
    let open = 0;
    for (let y = 1; y < m.h; y++) for (let x = 0; x < m.w; x++) open += !m.hw[y][x] && !off(x, y - 1) && !off(x, y);
    for (let y = 0; y < m.h; y++) for (let x = 1; x < m.w; x++) open += !m.vw[y][x] && !off(x - 1, y) && !off(x, y);
    assert.ok(open > cells.length - 1, 'more openings than a tree, so there are loops');
    for (const t of st.tanks) assert.ok(!off(Math.floor(t.x / 100), Math.floor(t.y / 100)), 'tank spawned in white space');
    assert.notEqual(st.tanks[0].x + ',' + st.tanks[0].y, st.tanks[1].x + ',' + st.tanks[1].y);
  }
  assert.ok(sizes.size > 5);
  assert.ok(holes > 10, 'most mazes have an irregular outline');
});

test('mazes are always landscape, from tiny to huge, from tight to wide open', () => {
  const areas = [], open = [];
  for (let seed = 1; seed < 300; seed++) {
    const m = G.newRound(seed, [{ id: 1 }, { id: 2 }]).maze;
    assert.ok(m.w > m.h, `landscape ${m.w}x${m.h}`);
    areas.push(m.w * m.h);
    let walls = 0, all = 0;
    for (let y = 1; y < m.h; y++) for (let x = 0; x < m.w; x++) if (!G.isOff(m, x, y - 1) && !G.isOff(m, x, y)) { all++; walls += m.hw[y][x]; }
    for (let y = 0; y < m.h; y++) for (let x = 1; x < m.w; x++) if (!G.isOff(m, x - 1, y) && !G.isOff(m, x, y)) { all++; walls += m.vw[y][x]; }
    open.push(1 - walls / all);
  }
  assert.ok(Math.min(...areas) <= 8, 'some are tiny: ' + Math.min(...areas));
  assert.ok(Math.max(...areas) >= 150, 'some are huge: ' + Math.max(...areas));
  assert.ok(Math.min(...open) < 0.6 && Math.max(...open) > 0.75, `tight and open: ${Math.min(...open)} - ${Math.max(...open)}`);
  assert.ok(Math.max(...open) < 0.97, 'even open arenas keep some walls');
  for (let seed = 1; seed < 50; seed++) {
    const m = G.newRound(seed, [1, 2, 3, 4, 5, 6, 7, 8].map(id => ({ id }))).maze;
    assert.ok(m.w > m.h && m.w * m.h >= 24, 'room for 8 players');
  }
});

test('floor shading is random with dark cells grouped together, not a checkerboard', () => {
  let same = 0, pairs = 0, dark = 0, cells = 0;
  for (let seed = 1; seed < 40; seed++) {
    const m = G.newRound(seed, [{ id: 1 }, { id: 2 }]).maze;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
      const v = m.shade[y * m.w + x];
      cells++; dark += v;
      if (x + 1 < m.w) { pairs++; same += v === m.shade[y * m.w + x + 1]; }
      if (y + 1 < m.h) { pairs++; same += v === m.shade[(y + 1) * m.w + x]; }
    }
  }
  assert.ok(same / pairs > 0.65, 'neighbours usually match (a checkerboard never does): ' + same / pairs);
  assert.ok(dark / cells > 0.2 && dark / cells < 0.8, 'a mix of both shades');
});

test('each round starts with a 3 second countdown: nothing moves or fires until it ends', () => {
  const m = new G.Match(9);
  m.addPlayer(1, {}); m.addPlayer(2, {});
  const t = m.state.tanks[0], x = t.x, a = t.a;
  m.player(1).input = { up: true, right: true, fire: true };
  for (let i = 0; i < C.COUNTDOWN; i++) m.step();
  assert.equal(m.state.countdown, 0);
  assert.deepEqual([t.x, t.a, m.state.projectiles.length], [x, a, 0]);
  m.player(1).input = { right: true };
  m.step();
  assert.notEqual(t.a, a, 'moves once the countdown is over');
});

test('online inputs: held back until the sender\'s countdown is over', () => {
  const st = arena(10, 10, [], [tank(1, 500, 500, 0)]);
  st.countdown = 20; // a laggy client's countdown can end slightly after the server's
  G.control(st, st.tanks[0], { up: true, go: false });
  assert.equal(st.tanks[0].x, 500);
  G.control(st, st.tanks[0], { up: true, go: true });
  assert.ok(st.tanks[0].x > 500);
  const x = st.tanks[0].x;
  st.countdown = 100; // claiming 'go' far too early is ignored
  G.control(st, st.tanks[0], { up: true, go: true });
  assert.equal(st.tanks[0].x, x);
});

test('round end: last tank standing wins after the delay', () => {
  const m = new G.Match(5);
  m.addPlayer(1, {}); m.addPlayer(2, {});
  started(m);
  assert.equal(m.round, 1);
  G.kill(m.state, m.state.tanks[1], 1);
  m.step();
  assert.equal(m.state.phase, 'ending');
  assert.equal(m.player(1).kills, 1);
  for (let i = 0; i < C.END_DELAY; i++) m.step();
  assert.equal(m.round, 2, 'next round started');
  assert.equal(m.player(1).wins, 1);
  assert.equal(m.player(2).wins, 0);
});

test('round end: a tank killed during the delay makes it a draw', () => {
  const m = new G.Match(6);
  m.addPlayer(1, {}); m.addPlayer(2, {});
  started(m);
  G.kill(m.state, m.state.tanks[1], 1);
  m.step();
  for (let i = 0; i < 30; i++) m.step();
  G.kill(m.state, m.state.tanks[0], 1); // own goal during the delay
  for (let i = 0; i < C.END_DELAY; i++) m.step();
  assert.equal(m.round, 2);
  assert.equal(m.player(1).wins + m.player(2).wins, 0);
  assert.equal(m.player(1).kills, 1, 'self-kill does not count');
});

test('mid-round joiners spectate until the next round', () => {
  const m = new G.Match(7);
  m.addPlayer(1, {}); m.addPlayer(2, {});
  m.addPlayer(3, {});
  started(m);
  assert.equal(m.inRound(3), false);
  G.kill(m.state, m.state.tanks[1], 1);
  for (let i = 0; i <= C.END_DELAY; i++) m.step();
  assert.equal(m.inRound(3), true);
  assert.equal(m.state.tanks.length, 3);
});

test('crates spawn in free cells; driving over collects; holding a weapon blocks pickup', () => {
  const st = arena(4, 4, [], [tank(1, 150, 150, 0)]);
  st.crateTimer = 1;
  G.step(st, {});
  assert.equal(st.crates.length, 1);
  assert.ok(G.POWERUPS.includes(st.crates[0].type));
  st.crates = [{ id: 99, type: 'laser', x: 160, y: 150 }, { id: 98, type: 'gatling', x: 140, y: 150 }];
  G.step(st, {});
  assert.equal(st.tanks[0].weapon.type, 'laser');
  assert.equal(st.crates.length, 1, 'second crate stays while a weapon is held');
});

test('minigun: spins up, then two long bursts of the smallest pellets (release between bursts)', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0)]);
  st.tanks[0].shield = 1e6; // so its own pellets can't end the test early
  arm(st.tanks[0], 'gatling');
  run(st, C.GAT_SPIN - 1, { 1: { fire: true } });
  assert.equal(st.projectiles.length, 0);
  run(st, C.GAT_EVERY * C.GAT_AMMO + 30, { 1: { fire: true } });
  const gats = st.projectiles.filter(p => p.type === 'gat');
  assert.equal(gats.length, C.GAT_AMMO, 'first burst, then it stops while fire is still held');
  assert.ok(gats.every(p => p.r === C.PELLET_R), 'smallest pellets');
  assert.equal(st.tanks[0].weapon.type, 'gatling', 'second burst left');
  G.step(st, {}); // release
  const before = st.nextId;
  run(st, C.GAT_SPIN + C.GAT_EVERY * C.GAT_AMMO, { 1: { fire: true } });
  assert.equal(st.nextId - before, C.GAT_AMMO, 'second burst');
  assert.equal(st.tanks[0].weapon, null);
});

test('laser: one fast beam that bounces and passes through every tank in its path', () => {
  const st = arena(10, 3, [], [tank(1, 100, 150, 0), tank(2, 400, 150, 0), tank(3, 700, 150, 0)]);
  arm(st.tanks[0], 'laser');
  const aim = G.tracePath(st, 130, 150, 0, C.AIM_LEN);
  assert.ok(aim.length >= 2);
  press(st, 1);
  run(st, 30);
  assert.equal(st.tanks[1].alive, false);
  assert.equal(st.tanks[2].alive, false);
  assert.equal(st.tanks[0].weapon, null);
  const st2 = arena(10, 3, [], [tank(1, 100, 150, 1.0)]);
  arm(st2.tanks[0], 'laser');
  st2.tanks[0].x = -1000; st2.tanks[0].alive = false; // shoot from a ghost so the beam path is free
  const p = G.shoot(st2, { ...st2.tanks[0], x: 100, y: 150 }, 'laser', 0, 0, C.LASER_SPEED, C.LASER_R, C.LASER_LIFE, { path: [] });
  run(st2, 40);
  assert.ok(p.bounces >= 2 && p.path.length >= 3);
});

test('homing missile: bounces first, then follows the maze to the nearest tank', () => {
  // a U-shaped route: the target is behind a wall and must be reached through the maze
  const st = arena(5, 3, [{ x1: 97, y1: 97, x2: 403, y2: 103 }], [tank(1, 50, 50, 0), tank(2, 450, 250, 0)]);
  st.tanks[0].x = 50; st.tanks[0].y = 250; st.tanks[0].a = 0;
  st.tanks[1].x = 50; st.tanks[1].y = 50;
  arm(st.tanks[0], 'missile');
  press(st, 1);
  const m = st.projectiles[0];
  assert.equal(m.type, 'missile');
  st.tanks[0].x = -5000; // shooter leaves so the target is the nearest tank
  let t = 0;
  while (st.tanks[1].alive && t++ < C.MISSILE_LIFE) G.step(st, {});
  assert.equal(st.tanks[1].alive, false, 'missile found the target');
  assert.ok(t > C.MISSILE_SEEK);
});

test('homing missile: keeps its lock unless another tank stays much closer for a while', () => {
  const st = arena(20, 5, [], [tank(1, -5000, 250, 0), tank(2, 1900, 250, 0), tank(3, -5000, 50, 0)]);
  const m = { id: 99, type: 'missile', owner: 1, x: 300, y: 250, vx: C.MISSILE_SPEED, vy: 0, r: C.MISSILE_R, life: 1e6,
    age: C.MISSILE_SEEK, bounces: 0, target: null, rival: 0 };
  st.projectiles.push(m);
  G.step(st, {});
  assert.equal(m.target, 2, 'locks on to the closest tank');
  const near = n => { for (let i = 0; i < n; i++) { Object.assign(st.tanks[2], { x: m.x, y: m.y - 90 }); G.step(st, {}); } };
  near(C.MISSILE_SWITCH - 20);
  assert.equal(m.target, 2, 'a brief pass does not steal the lock');
  st.tanks[2].x = -5000;
  run(st, 5);
  near(C.MISSILE_SWITCH + 5);
  assert.equal(m.target, 3, 'staying close for a while does');
});

test('death ray: stops at white space (a hole in the maze)', () => {
  const st = arena(8, 1, [], [tank(1, 50, 50, 0)]);
  st.maze.off = [0, 0, 0, 0, 1, 1, 1, 1];
  arm(st.tanks[0], 'deathray');
  G.step(st, { 1: { fire: true } });
  run(st, C.RAY_CHARGE + 1);
  assert.ok(Math.abs(st.beams[0].x2 - 400) <= 2);
});

test('death ray: charges 2s with the tank frozen, then a beam through walls to the outer wall', () => {
  const st = arena(8, 1, [{ x1: 297, y1: 0, x2: 303, y2: 100 }], [tank(1, 50, 50, 0), tank(2, 650, 50, 0)]);
  arm(st.tanks[0], 'deathray');
  G.step(st, { 1: { fire: true } });
  const x0 = st.tanks[0].x;
  run(st, C.RAY_CHARGE - 2, { 1: { up: true } });
  assert.equal(st.tanks[0].x, x0, 'frozen while charging');
  assert.equal(st.tanks[1].alive, true);
  run(st, 3);
  assert.equal(st.beams.length, 1);
  assert.ok(Math.abs(st.beams[0].x2 - 800) <= 2, 'beam stops at the outer wall');
  assert.equal(st.tanks[1].alive, false, 'killed through the wall');
  assert.equal(st.tanks[0].alive, true);
});

test('frag bomb: second press bursts it into shrapnel that stops at walls', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0), tank(2, 450, 500, 0)]);
  arm(st.tanks[0], 'frag');
  press(st, 1);
  run(st, 60);
  assert.equal(st.projectiles[0].type, 'frag');
  press(st, 1);
  const shards = st.projectiles.filter(p => p.type === 'shard');
  assert.equal(shards.length, C.FRAG_SHARDS);
  assert.equal(st.tanks[0].weapon, null);
  run(st, C.SHARD_LIFE + 2);
  assert.equal(st.projectiles.length, 0);
  assert.equal(st.tanks[1].alive, false, 'nearby tank caught by shrapnel');
});

test('frag bomb: explodes on its own when the fuse runs out', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0)]);
  arm(st.tanks[0], 'frag');
  press(st, 1);
  st.tanks[0].x = -1000;
  run(st, C.FRAG_FUSE);
  assert.ok(st.projectiles.some(p => p.type === 'shard'));
});

test('double barrel: barrels fire one at a time, alternating, 14 shots', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0)]);
  arm(st.tanks[0], 'double');
  press(st, 1);
  assert.equal(st.projectiles.length, 1, 'one bullet per press');
  press(st, 1);
  const [a, b] = st.projectiles;
  assert.ok(Math.abs(Math.abs(a.y - b.y) - 2 * C.DOUBLE_GAP) < 1e-6 && a.vx === b.vx, 'left barrel, then right');
  for (let i = 2; i < 14; i++) press(st, 1);
  assert.equal(st.projectiles.length, 14);
  assert.equal(st.tanks[0].weapon, null);
});

test('shotgun: spread of short-lived pellets, three shots', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0)]);
  arm(st.tanks[0], 'shotgun');
  press(st, 1);
  assert.equal(st.projectiles.length, C.SHOT_PELLETS);
  const angles = st.projectiles.map(p => Math.atan2(p.vy, p.vx));
  assert.ok(Math.max(...angles) - Math.min(...angles) > 0.2, 'pellets spread out');
  press(st, 1); press(st, 1);
  assert.equal(st.tanks[0].weapon, null);
  run(st, C.SHOT_LIFE);
  assert.equal(st.projectiles.length, 0);
});

test('mines: three per crate, arm after a delay, spew 200 tiny pellets under a tank', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0), tank(2, 800, 500, 0)]);
  arm(st.tanks[0], 'mine');
  press(st, 1);
  assert.equal(st.mines.length, 1);
  run(st, 30, { 1: { up: true } });
  press(st, 1); press(st, 1);
  assert.equal(st.mines.length, 3);
  assert.equal(st.tanks[0].weapon, null);
  st.tanks[0].x = 500; st.tanks[0].y = 900;
  const m = st.mines[0];
  st.tanks[1].x = m.x; st.tanks[1].y = m.y;
  run(st, 5);
  assert.equal(st.tanks[1].alive, true, 'not armed yet');
  let k = 0;
  while (st.mines.length === 3 && k++ < C.MINE_ARM) G.step(st, {});
  assert.equal(st.projectiles.filter(p => p.type === 'pellet').length, C.MINE_PELLETS);
  run(st, 2);
  assert.equal(st.tanks[1].alive, false);
  assert.equal(st.mines.length, 2);
});

test('shield: deflects incoming bullets for six seconds', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0), tank(2, 500, 500, Math.PI)]);
  st.crates = [{ id: 50, type: 'shield', x: 500, y: 500 }];
  G.step(st, {});
  assert.equal(st.tanks[1].shield, C.SHIELD_TIME);
  press(st, 1);
  st.tanks[0].y = 900; // shooter steps aside so the deflected bullet misses it
  run(st, 120);
  assert.equal(st.tanks[1].alive, true, 'bullet bounced off the shield');
  assert.ok(st.projectiles[0].bounces >= 1);
  run(st, C.SHIELD_TIME);
  assert.equal(st.tanks[1].shield, 0);
});

test('shield: nothing can hit a shielded tank, even its own shot coming straight back', () => {
  const st = arena(3, 1, [], [tank(1, 225, 50, 0)]); // nose close to the right wall
  st.tanks[0].shield = C.SHIELD_TIME;
  press(st, 1);
  run(st, 60);
  assert.equal(st.tanks[0].alive, true);
  st.projectiles.push({ id: 900, type: 'bullet', owner: 1, x: 100, y: 50, vx: 0, vy: 0, r: 4, life: 1e5, age: 0, bounces: 0 });
  run(st, 60, { 1: { down: true } }); // back into a bullet sitting still
  assert.equal(st.tanks[0].alive, true);
});

test('input encoding round-trips, including the countdown flag', () => {
  const i = { go: true, up: true, down: false, left: true, right: false, fire: true };
  assert.deepEqual(G.decodeInput(G.encodeInput(i)), i);
  assert.equal(G.decodeInput(G.encodeInput({ go: false })).go, false);
});
