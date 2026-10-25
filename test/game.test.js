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
    tick: 0, rng: { seed: 1 }, maze, walls: G.buildWalls(maze).concat(extra), tanks, projectiles: [], mines: [], beams: [],
    crates: [], kills: [], phase: 'play', endTimer: 0, winner: null, crateTimer: 1e9, nextId: 1
  };
}
const tank = (id, x, y, a = 0) => ({ id, x, y, a, alive: true, weapon: null, charge: 0, shield: 0, fireHeld: false });
const run = (st, n, inputs = {}) => { for (let i = 0; i < n; i++) G.step(st, inputs); };
const press = (st, id) => { G.step(st, { [id]: { fire: true } }); G.step(st, {}); };
const overlapsWall = (st, t) => st.walls.some(w => G.sat(G.tankPoly(t.x, t.y, t.a), G.rectPoly(w)));
const arm = (t, type) => { t.weapon = { type, ammo: { gatling: C.GAT_AMMO, double: C.DOUBLE_AMMO, shotgun: C.SHOT_AMMO, mine: C.MINE_AMMO }[type] || 1, spin: 0, bomb: null }; };

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

test('normal bullets: 5 per tank, last 10 seconds, kill the shooter too', () => {
  const st = arena(10, 10, [], [tank(1, 150, 150, 0), tank(2, 850, 850, 0)]);
  for (let i = 0; i < 7; i++) press(st, 1);
  assert.equal(st.projectiles.filter(p => p.owner === 1).length, 5);
  const life = st.projectiles[0].life;
  assert.equal(life, 10 * 60);
  const solo = arena(3, 1, [], [tank(1, 150, 50, 0)]);
  solo.tanks[0].x = 225; // nose close to the right wall: the shot comes straight back
  press(solo, 1);
  run(solo, 30);
  assert.equal(solo.tanks[0].alive, false, 'own bullet kills the shooter');
  assert.deepEqual(solo.kills, [[1, 1]]);
});

test('bullets expire after their lifetime', () => {
  const st = arena(10, 10, [], [tank(1, 150, 150, 0.3)]);
  press(st, 1);
  st.tanks[0].x = -1000; // move the tank out of the way
  run(st, C.BULLET_LIFE - 3);
  assert.equal(st.projectiles.length, 1);
  run(st, 3);
  assert.equal(st.projectiles.length, 0);
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
  assert.ok(Math.abs(t.a - C.TANK_TURN / 60) < 1e-9);
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

test('round end: last tank standing wins after the delay', () => {
  const m = new G.Match(5);
  m.addPlayer(1, {}); m.addPlayer(2, {});
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

test('gatling: spins up for a second, then fires a stream while held', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0)]);
  arm(st.tanks[0], 'gatling');
  run(st, C.GAT_SPIN - 1, { 1: { fire: true } });
  assert.equal(st.projectiles.length, 0);
  run(st, C.GAT_EVERY * C.GAT_AMMO, { 1: { fire: true } });
  assert.equal(st.projectiles.filter(p => p.type === 'gat').length, C.GAT_AMMO);
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

test('double barrel: two parallel bullets per shot, five shots', () => {
  const st = arena(10, 10, [], [tank(1, 150, 500, 0)]);
  arm(st.tanks[0], 'double');
  press(st, 1);
  const [a, b] = st.projectiles;
  assert.ok(Math.abs(Math.abs(a.y - b.y) - 2 * C.DOUBLE_GAP) < 1e-6 && a.vx === b.vx);
  for (let i = 1; i < C.DOUBLE_AMMO; i++) press(st, 1);
  assert.equal(st.projectiles.length, 2 * C.DOUBLE_AMMO);
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

test('mines: three per crate, arm after a delay, explode under a tank', () => {
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
  run(st, C.MINE_ARM);
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

test('input encoding round-trips', () => {
  const i = { up: true, down: false, left: true, right: false, fire: true };
  assert.deepEqual(G.decodeInput(G.encodeInput(i)), i);
});
