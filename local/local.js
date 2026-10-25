/* Maze Tanks local: two players on one keyboard. */
(function () {
  'use strict';
  const G = Game, U = UI, $ = s => document.querySelector(s);
  const STORE = 'mazeTanks.local';
  const DEFAULT_KEYS = [['KeyE', 'KeyD', 'KeyS', 'KeyF', 'KeyQ'], ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyM']];
  const DEFAULT_LOOKS = [{ body: 0, turret: 0, tread: 11, barrel: 0, acc: 0 }, { body: 4, turret: 4, tread: 11, barrel: 0, acc: 0 }];
  const ARROWS = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: '␣' };
  const keyLabel = code => ARROWS[code] || code.replace(/^(Key|Digit|Numpad)/, '');

  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { /* storage unavailable */ }
  const looks = [0, 1].map(i => G.cleanLook((saved.looks || DEFAULT_LOOKS)[i]));
  const keys = [0, 1].map(i => (Array.isArray(saved.keys?.[i]) && saved.keys[i].length === 5 ? saved.keys[i] : DEFAULT_KEYS[i]).slice());
  const save = () => { try { localStorage.setItem(STORE, JSON.stringify({ looks, keys })); } catch (e) { /* ignore */ } };

  const scene = new Render.Scene($('#game')), bar = U.statsBar($('#bar')), overlay = $('#overlay');
  const held = new Set(), tapped = new Set(); // tapped: pressed since the last update, so short taps still count
  let match = null, playing = false, acc = 0, lastT = performance.now(), prev = new Map(), remap = null;
  let ctl = null; // controls screen: { ready, sets, caps }

  function menu() {
    playing = false;
    ctl = null;
    overlay.hidden = false;
    overlay.textContent = '';
    overlay.classList.remove('dark');
    const wrap = U.el('div', 'row');
    wrap.style.gap = '28px';
    const card = i => {
      const c = U.el('div', 'card');
      const cv = U.el('canvas');
      Render.tankIcon(cv, looks[i], 128);
      const paint = U.button('paint', 'customise tank ' + (i + 1), 'small');
      const kb = U.button('keys', 'keys for player ' + (i + 1), 'small');
      cv.onclick = paint.onclick = () => openGarage(i);
      kb.onclick = () => openKeys(i);
      const r = U.el('div', 'row'); r.append(paint, kb);
      c.append(cv, r);
      return c;
    };
    const play = U.button('play', 'play', 'big dark');
    play.id = 'play';
    play.onclick = controls;
    wrap.append(card(0), play, card(1));
    overlay.append(wrap);
    play.focus();
  }

  function openGarage(i) {
    overlay.textContent = '';
    U.garage(overlay, looks[i], look => {
      looks[i] = look;
      save();
      if (match) match.player(i + 1).look = look;
      menu();
    });
  }

  function openKeys(i) {
    overlay.textContent = '';
    const panel = U.el('div', 'panel keys col');
    const rows = U.el('div', 'col');
    G.KEYS.forEach((name, k) => {
      const r = U.el('div', 'row', U.ICON[name]);
      const b = U.el('button', 'key');
      b.type = 'button';
      b.setAttribute('aria-label', name);
      b.textContent = keyLabel(keys[i][k]);
      b.onclick = () => {
        rows.querySelectorAll('.key').forEach(x => x.classList.remove('wait'));
        b.classList.add('wait');
        b.textContent = '…';
        remap = {
          i, set(code) {
            // a key already used elsewhere swaps places with the old binding
            for (const ks of keys) { const j = ks.indexOf(code); if (j >= 0) ks[j] = keys[i][k]; }
            keys[i][k] = code;
            save();
            openKeys(i);
          }
        };
      };
      r.append(b);
      rows.append(r);
    });
    const ok = U.button('check', 'done', 'dark');
    ok.onclick = () => { remap = null; menu(); };
    panel.append(rows, ok);
    overlay.append(panel);
  }

  // Before playing: each player's keys, and both press their fire key to say they're ready.
  function controls() {
    playing = false;
    overlay.hidden = false;
    overlay.textContent = '';
    overlay.classList.add('dark');
    const wrap = U.el('div', 'ctl'), logo = U.el('canvas', 'logo'), sets = U.el('div', 'sets');
    Render.tankIcon(logo, { body: 3, turret: 1, tread: 4, barrel: 2, acc: 0 }, 120);
    ctl = { ready: [false, false], sets: [], caps: [] };
    [0, 1].forEach(i => {
      const set = U.el('div', 'set'), caps = U.keycaps(keys[i]), tank = U.el('canvas', 'tank');
      Render.tankIcon(tank, looks[i], 84);
      set.append(caps.el, tank, U.el('span', 'tick', U.ICON.check));
      sets.append(set);
      ctl.sets.push(set);
      ctl.caps.push(caps);
    });
    wrap.append(logo, sets);
    overlay.append(wrap);
  }

  function start() {
    if (!match) {
      match = new G.Match((Math.random() * 2147483647) | 0);
      match.addPlayer(1, looks[0]);
      match.addPlayer(2, looks[1]);
    }
    held.clear();
    tapped.clear();
    acc = 0;
    playing = true;
    overlay.hidden = true;
    overlay.textContent = '';
    overlay.classList.remove('dark');
  }

  function tick() {
    const st = match.state;
    prev = new Map();
    for (const t of st.tanks) prev.set('t' + t.id, { x: t.x, y: t.y, a: t.a });
    for (const p of st.projectiles) prev.set('p' + p.id, { x: p.x, y: p.y });
    match.players.forEach((p, i) => {
      const k = keys[i];
      const on = c => held.has(c) || tapped.has(c);
      p.input = { up: on(k[0]), down: on(k[1]), left: on(k[2]), right: on(k[3]), fire: on(k[4]) };
    });
    tapped.clear();
    const round = match.round;
    match.step();
    if (match.round !== round) prev.clear();
  }

  function view(alpha) {
    const st = match && match.state;
    if (!st) return null;
    const lerp = (key, o) => {
      const p = prev.get(key);
      if (!p) return {};
      const v = { x: p.x + (o.x - p.x) * alpha, y: p.y + (o.y - p.y) * alpha };
      if (o.a !== undefined) v.a = p.a + G.wrap(o.a - p.a) * alpha;
      return v;
    };
    const lookMap = {};
    for (const p of match.players) lookMap[p.id] = p.look;
    return {
      round: match.round, tick: st.tick, maze: st.maze, walls: st.walls, mines: st.mines, crates: st.crates, beams: st.beams, fx: st.fx, looks: lookMap,
      tanks: st.tanks.map(t => ({
        ...t, ...lerp('t' + t.id, t), look: lookMap[t.id],
        weapon: t.weapon && t.weapon.type, spin: t.weapon ? t.weapon.spin : 0
      })),
      projectiles: st.projectiles.map(p => ({ ...p, ...lerp('p' + p.id, p) }))
    };
  }

  function frame(t) {
    requestAnimationFrame(frame); // first, so one bad frame can never stop the game
    const dt = Math.min(0.25, (t - lastT) / 1000);
    lastT = t;
    if (playing && match.state) {
      acc += dt;
      for (let n = 0; acc >= G.C.DT && n < 8; n++) { tick(); acc -= G.C.DT; }
      acc = Math.min(acc, G.C.DT);
    }
    scene.draw(view(playing ? acc / G.C.DT : 1), t);
    U.countdown($('#game'), $('#count'), playing && match.state ? match.state.countdown : 0);
    bar.update(match ? match.players : looks.map((look, i) => ({ id: i + 1, look, wins: 0, kills: 0 })));
  }

  addEventListener('keydown', e => {
    if (remap) { e.preventDefault(); const r = remap; remap = null; if (e.code !== 'Escape') r.set(e.code); else openKeys(r.i); return; }
    if (ctl) {
      if (e.code === 'Escape') { menu(); return; }
      if (keys.some(k => k.includes(e.code))) e.preventDefault();
      ctl.caps.forEach(c => c.press(e.code, true));
      keys.forEach((k, i) => { if (e.code === k[4]) { ctl.ready[i] = true; ctl.sets[i].classList.add('ok'); } });
      if (ctl.ready.every(Boolean)) { ctl = null; setTimeout(start, 500); }
      return;
    }
    if (!playing) return;
    if (e.code === 'Escape') { menu(); return; }
    if (keys.some(k => k.includes(e.code))) e.preventDefault();
    held.add(e.code);
    tapped.add(e.code);
  });
  addEventListener('keyup', e => {
    held.delete(e.code);
    if (ctl) ctl.caps.forEach(c => c.press(e.code, false));
  });
  addEventListener('blur', () => held.clear());

  window.mazeTanks = { scene, get match() { return match; }, get playing() { return playing; } }; // for tests
  menu();
  requestAnimationFrame(frame);
})();
