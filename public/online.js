/* Maze Tanks online client: predicts your own tank so controls feel instant, smooths everyone else. */
(function () {
  'use strict';
  const G = Game, U = UI, C = G.C, $ = s => document.querySelector(s);
  const STORE = 'mazeTanks.online';
  // Both classic layouts work: arrows + M, or E/S/D/F + Q. Space also fires.
  const BIND = { up: ['ArrowUp', 'KeyE'], down: ['ArrowDown', 'KeyD'], left: ['ArrowLeft', 'KeyS'], right: ['ArrowRight', 'KeyF'], fire: ['KeyM', 'KeyQ', 'Space'] };
  const ALLKEYS = new Set(Object.values(BIND).flat());
  const KEYSETS = [['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'], ['KeyE', 'KeyD', 'KeyS', 'KeyF', 'KeyQ']];
  const KEYS_MIN = 2500; // the controls stay up at least this long after pressing play
  const INTERP = 8; // others are drawn 8 updates (133 ms) behind the newest snapshot, smoothing out network jitter

  let look = null;
  try { const s = JSON.parse(localStorage.getItem(STORE)); if (s) look = G.cleanLook(s); } catch (e) { /* storage unavailable */ }
  if (!look) { const c = Math.floor(Math.random() * G.COLORS.length); look = G.cleanLook({ body: c, turret: c, tread: 11 }); }
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify(look)); } catch (e) { /* ignore */ } };

  const scene = new Render.Scene($('#game')), bar = U.statsBar($('#bar')), overlay = $('#overlay'), corner = $('#corner');
  const leave = U.button('close', 'leave', 'small'), eye = U.el('span', '', U.ICON.eye), wait = U.el('div', 'spin small');
  corner.append(wait, eye, leave);
  leave.onclick = () => send({ t: 'x' });

  let ws = null, me = null, screen = 'connect', retry = 0, keysAt = -Infinity, keyCaps = [];
  let players = [], waiting = false, maze = null, walls = null, roundNo = 0;
  let snaps = [], renderK = 0, world = null;
  let seq = 0, pending = [], pred = null, predPrev = null, cdLeft = 0;
  let fix = { x: 0, y: 0, a: 0 }; // small server corrections, faded out instead of snapped
  const held = new Set(), tapped = new Set();
  let acc = 0, lastT = performance.now();

  function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  function resetGame() {
    players = []; waiting = false; maze = null; walls = null; roundNo = 0;
    snaps = []; world = null; pending = []; pred = predPrev = null;
  }

  // The controls (both key sets), shown after pressing play; no confirmation needed online.
  function keysPanel() {
    const wrap = U.el('div', 'ctl'), logo = U.el('canvas', 'logo'), sets = U.el('div', 'sets');
    Render.tankIcon(logo, look, 120);
    keyCaps = KEYSETS.map(codes => U.keycaps(codes));
    for (const c of keyCaps) { const set = U.el('div', 'set'); set.append(c.el); sets.append(set); }
    wrap.append(logo, sets);
    return wrap;
  }

  function show(name) {
    screen = name;
    overlay.textContent = '';
    overlay.hidden = false;
    overlay.classList.remove('dark');
    keyCaps = [];
    corner.hidden = true;
    if (name === 'connect') overlay.append(U.el('div', 'spin'));
    if (name === 'home') {
      const wrap = U.el('div', 'row');
      wrap.style.gap = '28px';
      const card = U.el('div', 'card');
      const cv = U.el('canvas');
      Render.tankIcon(cv, look, 128);
      const paint = U.button('paint', 'customise tank', 'small');
      cv.onclick = paint.onclick = () => { overlay.textContent = ''; U.garage(overlay, look, l => { look = l; save(); show('home'); }); };
      card.append(cv, paint);
      const play = U.button('play', 'play', 'big dark');
      play.id = 'play';
      play.onclick = () => { keysAt = performance.now(); send({ t: 'q', look }); };
      wrap.append(card, play);
      overlay.append(wrap);
      play.focus();
    }
    if (name === 'queue') {
      overlay.classList.add('dark');
      const col = U.el('div', 'col');
      const cancel = U.button('close', 'cancel', 'small');
      cancel.onclick = () => send({ t: 'x' });
      col.style.gap = '24px';
      col.append(keysPanel(), U.el('div', 'spin'), cancel);
      overlay.append(col);
    }
    if (name === 'game') {
      corner.hidden = false;
      const left = KEYS_MIN - (performance.now() - keysAt);
      if (left > 0) { // matched straight away: keep the controls up a moment longer
        overlay.classList.add('dark');
        overlay.append(keysPanel());
        setTimeout(() => { if (screen === 'game') { overlay.hidden = true; overlay.textContent = ''; keyCaps = []; } }, left);
      } else overlay.hidden = true;
    }
    updateCorner();
  }

  function updateCorner() {
    const watching = players.some(p => p.id === me && p.out);
    wait.hidden = !waiting;
    eye.hidden = waiting || !watching;
  }

  function connect() {
    ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host);
    ws.onopen = () => { retry = 0; show('home'); };
    ws.onmessage = e => { try { onMessage(JSON.parse(e.data)); } catch (err) { console.error(err); } };
    ws.onclose = () => {
      ws = null;
      resetGame();
      show('connect');
      setTimeout(connect, Math.min(5000, 500 * 2 ** retry++));
    };
  }

  function onMessage(m) {
    switch (m.t) {
      case 'hi': me = m.id; break;
      case 'wait': show('queue'); break;
      case 'lobby': resetGame(); show('game'); break;
      case 'home': resetGame(); show('home'); break;
      case 'r':
        maze = m.maze; walls = G.buildWalls(maze); roundNo = m.n; cdLeft = m.cd;
        snaps = []; pending = []; pred = predPrev = null;
        break;
      case 'pl': players = m.p; waiting = !!m.w; updateCorner(); break;
      case 's':
        if (m.n !== roundNo) return;
        snaps.push(m);
        if (snaps.length > 40) snaps.shift();
        if (Math.abs(renderK - (m.k - INTERP)) > 20) renderK = m.k - INTERP;
        else renderK += (m.k - INTERP - renderK) * 0.1;
        reconcile(m);
        break;
    }
  }

  // Reset our tank to the server's state, then replay the inputs the server hasn't processed yet.
  function reconcile(s) {
    const mine = s.T.find(t => t[0] === me);
    if (!mine || !mine[4]) { pred = predPrev = null; return; }
    pending = pending.filter(p => p[0] > s.a);
    world = { walls, tanks: s.T.filter(t => t[0] !== me && t[4]).map(t => ({ id: t[0], x: t[1], y: t[2], a: t[3], alive: true })) };
    const t = { id: me, x: mine[1], y: mine[2], a: mine[3], alive: true, charge: mine[6] };
    world.tanks.push(t);
    for (const [, inp] of pending) if (inp.go) G.moveTank(world, t, inp);
    if (!pred) predPrev = { x: t.x, y: t.y, a: t.a };
    else {
      const ex = pred.x - t.x, ey = pred.y - t.y, ea = G.wrap(pred.a - t.a);
      if (Math.hypot(ex, ey) < 40) { fix.x += ex; fix.y += ey; fix.a += ea; } else fix = { x: 0, y: 0, a: 0 };
      predPrev = { x: predPrev.x - ex, y: predPrev.y - ey, a: predPrev.a - ea };
    }
    pred = t;
  }

  function localTick() {
    const inp = { go: cdLeft <= 0 };
    for (const k of G.KEYS) inp[k] = BIND[k].some(c => held.has(c) || tapped.has(c));
    tapped.clear();
    if (cdLeft > 0) cdLeft--;
    seq++;
    send({ t: 'i', q: seq, k: G.encodeInput(inp) });
    pending.push([seq, inp]);
    if (pending.length > 120) pending.shift();
    if (pred && inp.go) { predPrev = { x: pred.x, y: pred.y, a: pred.a }; G.moveTank(world, pred, inp); }
    renderK++;
  }

  const tankOf = r => ({ id: r[0], x: r[1], y: r[2], a: r[3], alive: !!r[4], weapon: r[5] || null, charge: r[6], shield: r[7], spin: r[8] });

  function view(alpha) {
    if (!maze || !snaps.length) return null;
    const rk = renderK + alpha;
    let i = snaps.findIndex(s => s.k >= rk);
    if (i < 0) i = snaps.length - 1;
    const b = snaps[i], a = snaps[Math.max(0, i - 1)], last = snaps[snaps.length - 1];
    const f = a === b ? 1 : Math.max(0, Math.min(1, (rk - a.k) / (b.k - a.k)));
    const lerp = (p, q) => (p ? { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, a: q.a === undefined ? undefined : p.a + G.wrap(q.a - p.a) * f } : q);
    const looks = {};
    for (const p of players) looks[p.id] = p.look;
    const before = new Map(a.T.map(r => [r[0], tankOf(r)]));
    const tanks = b.T.filter(r => r[0] !== me).map(r => {
      const t = tankOf(r);
      return { ...t, ...lerp(before.get(t.id), t), look: looks[t.id] };
    });
    const mineRow = last.T.find(r => r[0] === me);
    if (mineRow) {
      const t = { ...tankOf(mineRow), look: looks[me] };
      if (pred) {
        const p0 = predPrev || pred;
        t.x = p0.x + (pred.x - p0.x) * alpha + fix.x; t.y = p0.y + (pred.y - p0.y) * alpha + fix.y;
        t.a = p0.a + G.wrap(pred.a - p0.a) * alpha + fix.a;
      }
      tanks.push(t);
    }
    const prevP = new Map(a.P.map(p => [p[0], { x: p[2], y: p[3] }]));
    const projectiles = b.P.map(p => {
      const o = { id: p[0], type: p[1], owner: p[4], ...lerp(prevP.get(p[0]), { x: p[2], y: p[3] }) };
      if (p[1] === 'laser') o.path = p[5];
      if (p[1] === 'missile') { o.vx = p[5][0]; o.vy = p[5][1]; o.target = p[5][2]; }
      return o;
    });
    return {
      round: roundNo, tick: b.k, maze, walls, looks, tanks, projectiles,
      mines: b.M.map(m => ({ id: m[0], x: m[1], y: m[2], owner: m[3], age: m[4] })),
      crates: b.C.map(c => ({ id: c[0], type: c[1], x: c[2], y: c[3] })),
      beams: b.B.map(r => ({ id: r[0], x1: r[1], y1: r[2], x2: r[3], y2: r[4], owner: r[5], age: r[6] })),
      fx: b.F.map(f => ({ id: f[0], x: f[1], y: f[2], big: !!f[3] }))
    };
  }

  function frame(t) {
    requestAnimationFrame(frame); // first, so one bad frame can never stop the game
    const dt = Math.min(0.25, (t - lastT) / 1000);
    lastT = t;
    if (screen === 'game') {
      acc += dt;
      for (let n = 0; acc >= C.DT && n < 8; n++) { localTick(); acc -= C.DT; }
      acc = Math.min(acc, C.DT);
    }
    const fade = Math.pow(1e-13, dt); // corrections fade out within about 100 ms
    fix.x *= fade; fix.y *= fade; fix.a *= fade;
    scene.draw(screen === 'game' ? view(acc / C.DT) : null, t);
    U.countdown($('#game'), $('#count'), screen === 'game' && maze ? cdLeft : 0);
    bar.update(screen === 'game' ? players : [{ id: me, look, wins: 0, kills: 0 }], me);
  }

  addEventListener('keydown', e => {
    for (const c of keyCaps) c.press(e.code, true);
    if (screen !== 'game' || !ALLKEYS.has(e.code)) return;
    e.preventDefault();
    held.add(e.code);
    tapped.add(e.code);
  });
  addEventListener('keyup', e => {
    held.delete(e.code);
    for (const c of keyCaps) c.press(e.code, false);
  });
  addEventListener('blur', () => held.clear());

  window.mazeTanksOnline = { scene, get cd() { return cdLeft; }, get screen() { return screen; }, get me() { return me; }, get players() { return players; }, get pred() { return pred; }, get snaps() { return snaps; } };
  show('connect');
  connect();
  requestAnimationFrame(frame);
})();
