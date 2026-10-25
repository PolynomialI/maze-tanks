/* Maze Tanks: flat 2D drawing shared by the local and online pages. */
(function (root, factory) {
  root.Render = factory(root.Game);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G) {
  'use strict';
  const { C, COLORS } = G;
  // Light grey checkered floor, white space around and inside the maze, mid-grey walls, near-black outlines.
  const FLOOR = ['#e6e6e6', '#d9d9d9'], WALL = '#6b6b6b', INK = '#1f1f1f', OUTSIDE = '#ffffff', CRATE = '#bdbdbd';
  const TAU = Math.PI * 2;

  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = v => Math.round(v * (1 - f));
    return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
  }
  const col = i => COLORS[i] || COLORS[0];

  function part(ctx, fill, path) {
    ctx.beginPath();
    path();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = INK;
    ctx.stroke();
  }
  const box = (ctx, x, y, w, h) => () => ctx.rect(x, y, w, h);
  const disc = (ctx, x, y, r) => () => ctx.arc(x, y, r, 0, TAU);
  const poly = (ctx, pts) => () => { ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); };

  // Layers in order: treads, body, turret, barrel, accessory. Tank faces +x in its own space.
  // o.paint overrides part colours (the garage uses it to highlight one layer).
  function drawTank(ctx, look, x, y, a, o = {}) {
    const p = o.paint || {}, tread = p.tread || col(look.tread), body = p.body || col(look.body), tur = p.turret || col(look.turret);
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(a);
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    part(ctx, tread, () => { ctx.rect(-20, -16, 40, 9); ctx.rect(-20, 7, 40, 9); });
    part(ctx, body, () => ctx.roundRect ? ctx.roundRect(-16, -12, 32, 24, 3) : ctx.rect(-16, -12, 32, 24));
    part(ctx, tur, disc(ctx, -1, 0, 10.5));
    drawBarrel(ctx, look, tur, o);
    if (!o.noAcc) drawAccessory(ctx, look.acc);
    ctx.restore();
  }

  function drawBarrel(ctx, look, tur, o) {
    const R = (x, y, w, h) => part(ctx, tur, box(ctx, x, y, w, h));
    switch (o.weapon) {
      case 'gatling':
        for (let k = 0; k < 3; k++) R(4, Math.sin((o.spin || 0) * 0.6 + k * 2.094) * 4 - 1.2, 26, 2.4);
        break;
      case 'laser': part(ctx, tur, poly(ctx, [8, -3, 26, -7, 26, 7, 8, 3])); break;
      case 'missile': part(ctx, tur, poly(ctx, [-6, -4, 20, -4, 28, 0, 20, 4, -6, 4])); break;
      case 'deathray':
        R(4, -4, 18, 8); R(21, -9, 5, 18);
        if (o.charge) part(ctx, tur, disc(ctx, 31, 0, 2 + 8 * (1 - o.charge / C.RAY_CHARGE)));
        break;
      case 'frag': R(8, -5, 18, 10); part(ctx, tur, disc(ctx, 26, 0, 5.5)); break;
      case 'double': R(8, -7, 22, 5); R(8, 2, 22, 5); break;
      case 'shotgun': part(ctx, tur, poly(ctx, [4, -3, 28, -6, 28, 6, 4, 3])); break;
      case 'mine': part(ctx, tur, disc(ctx, 11, 0, 5)); part(ctx, INK, disc(ctx, 11, 0, 1.5)); break;
      default:
        switch (look.barrel) {
          case 1: R(8, -2.5, 25, 5); break;
          case 2: R(8, -5, 20, 10); break;
          case 3: R(8, -3.5, 17, 7); R(24, -6, 6, 12); break;
          default: R(8, -3.5, 22, 7);
        }
    }
  }

  function drawAccessory(ctx, acc) {
    switch (acc) {
      case 1: // hat
        part(ctx, '#333333', disc(ctx, -1, 0, 9.5));
        part(ctx, '#c0392b', disc(ctx, -1, 0, 6.2));
        part(ctx, '#333333', disc(ctx, -1, 0, 4.6));
        break;
      case 2: // antenna
        ctx.beginPath(); ctx.moveTo(-13, -9); ctx.lineTo(-34, -14); ctx.strokeStyle = INK; ctx.lineWidth = 1.3; ctx.stroke();
        ctx.lineWidth = 1.5;
        part(ctx, '#e2493b', disc(ctx, -34, -14, 2.2));
        break;
      case 3: // flag
        part(ctx, '#ffffff', poly(ctx, [-13, 8, -31, 11, -13, 15]));
        part(ctx, INK, disc(ctx, -13, 8, 1.6));
        break;
      case 4: { // crown
        const pts = [];
        for (let i = 0; i < 10; i++) { const r = i % 2 ? 3.6 : 7.5, a = i * Math.PI / 5; pts.push(-1 + Math.cos(a) * r, Math.sin(a) * r); }
        part(ctx, '#f2c230', poly(ctx, pts));
        break;
      }
    }
  }

  // Flat crate icons, drawn in a 24-unit box centred on (0,0).
  function drawIcon(ctx, type) {
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const line = (...p) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]); ctx.stroke(); };
    const fill = f => { ctx.beginPath(); f(); ctx.fill(); };
    switch (type) {
      case 'gatling': for (const y of [-4, 0, 4]) line(-3, y, 8, y); fill(() => ctx.arc(-5, 0, 4, 0, TAU)); break;
      case 'laser': line(-8, 6, -1, -6, 7, 6); fill(() => ctx.arc(7, 6, 2, 0, TAU)); break;
      case 'missile': fill(() => { ctx.moveTo(9, 0); ctx.lineTo(3, -3.5); ctx.lineTo(-6, -3.5); ctx.lineTo(-9, -7); ctx.lineTo(-9, 7); ctx.lineTo(-6, 3.5); ctx.lineTo(3, 3.5); ctx.closePath(); }); break;
      case 'deathray': fill(() => { ctx.moveTo(2, -10); ctx.lineTo(-6, 1); ctx.lineTo(0, 1); ctx.lineTo(-2, 10); ctx.lineTo(6, -2); ctx.lineTo(0, -2); ctx.closePath(); }); break;
      case 'frag':
        fill(() => ctx.arc(0, 0, 4.5, 0, TAU));
        for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; line(Math.cos(a) * 6.5, Math.sin(a) * 6.5, Math.cos(a) * 9, Math.sin(a) * 9); }
        break;
      case 'double': fill(() => { ctx.rect(-8, -6, 16, 4); ctx.rect(-8, 2, 16, 4); }); break;
      case 'shotgun': line(-8, 0, 8, -7); line(-8, 0, 8, 0); line(-8, 0, 8, 7); break;
      case 'mine':
        fill(() => ctx.arc(0, 0, 6, 0, TAU));
        for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; fill(() => ctx.arc(Math.cos(a) * 8, Math.sin(a) * 8, 1.8, 0, TAU)); }
        break;
      case 'shield': fill(() => { ctx.moveTo(0, -9); ctx.lineTo(8, -6); ctx.lineTo(7, 2); ctx.lineTo(0, 9); ctx.lineTo(-7, 2); ctx.lineTo(-8, -6); ctx.closePath(); }); break;
    }
  }

  function drawCrate(ctx, c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(Math.PI / 4);
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(-13, -13, 26, 26, 3) : ctx.rect(-13, -13, 26, 26);
    ctx.fillStyle = CRATE; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = WALL; ctx.stroke();
    ctx.rotate(-Math.PI / 4);
    ctx.scale(0.85, 0.85);
    drawIcon(ctx, c.type);
    ctx.restore();
  }

  // Pieces of a destroyed tank flying apart.
  function debrisFor(t) {
    const L = t.look, c = Math.cos(t.a), s = Math.sin(t.a), out = [];
    const add = (lx, ly, shape, w, h, fill) => {
      const d = Math.hypot(lx, ly) || 1, sp = 60 + Math.random() * 110, j = (Math.random() - 0.5) * 0.8;
      const dx = (lx / d) * Math.cos(j) - (ly / d) * Math.sin(j), dy = (lx / d) * Math.sin(j) + (ly / d) * Math.cos(j);
      out.push({ shape, w, h, fill, x: t.x + c * lx - s * ly, y: t.y + s * lx + c * ly, a: t.a,
        vx: (c * dx - s * dy) * sp, vy: (s * dx + c * dy) * sp, va: (Math.random() - 0.5) * 12, life: 1.4 + Math.random() * 0.4 });
    };
    add(-2, -11.5, 'rect', 40, 9, col(L.tread)); add(2, 11.5, 'rect', 40, 9, col(L.tread));
    for (const [x, y] of [[-8.5, -6], [8.5, -6], [-8.5, 6], [8.5, 6]]) add(x, y, 'rect', 17, 12, col(L.body));
    add(-1, 0.5, 'disc', 10.5, 10.5, col(L.turret));
    add(19, 0, 'rect', 22, 7, col(L.turret));
    return out;
  }

  class Scene {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.debris = [];
      this.alive = new Map();
      this.round = null;
      this.last = 0;
    }

    draw(v, now) {
      const cv = this.cv, ctx = this.ctx, d = window.devicePixelRatio || 1, r = cv.getBoundingClientRect();
      const W0 = Math.max(1, Math.round(r.width * d)), H0 = Math.max(1, Math.round(r.height * d));
      if (cv.width !== W0 || cv.height !== H0) { cv.width = W0; cv.height = H0; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = OUTSIDE;
      ctx.fillRect(0, 0, W0, H0);
      const dt = Math.min(0.05, Math.max(0, (now - this.last) / 1000));
      this.last = now;
      if (!v) return;

      if (v.round !== this.round) { this.round = v.round; this.debris = []; this.alive.clear(); }
      for (const t of v.tanks) {
        if (this.alive.get(t.id) === true && !t.alive && t.look) this.debris.push(...debrisFor(t));
        this.alive.set(t.id, t.alive);
      }
      for (const p of this.debris) {
        const f = Math.pow(0.12, dt);
        p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
        p.vx *= f; p.vy *= f; p.va *= f; p.life -= dt;
      }
      this.debris = this.debris.filter(p => p.life > 0);

      const m = v.maze, W = m.w * C.CELL, H = m.h * C.CELL, pad = 12;
      const k = Math.min(W0 / (W + 2 * pad), H0 / (H + 2 * pad));
      ctx.setTransform(k, 0, 0, k, (W0 - W * k) / 2, (H0 - H * k) / 2);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        if (G.isOff(m, x, y)) continue;
        ctx.fillStyle = FLOOR[(x + y) % 2];
        ctx.fillRect(x * C.CELL, y * C.CELL, C.CELL, C.CELL);
      }

      const looks = v.looks || {}, lookOf = id => looks[id] || { body: 11, turret: 11, tread: 11, barrel: 0, acc: 0 };
      // mines (fade out once armed)
      for (const m of v.mines) {
        ctx.globalAlpha = m.age < C.MINE_ARM ? 1 : 0.18;
        ctx.lineWidth = 2;
        part(ctx, col(lookOf(m.owner).body), disc(ctx, m.x, m.y, 8));
        part(ctx, INK, disc(ctx, m.x, m.y, 2.5));
      }
      ctx.globalAlpha = 1;
      for (const c of v.crates) drawCrate(ctx, c);

      // laser aiming lines
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.setLineDash([0.1, 7]);
      for (const t of v.tanks) {
        if (!t.alive || t.weapon !== 'laser') continue;
        const path = G.tracePath(v, t.x, t.y, t.a, C.AIM_LEN);
        ctx.strokeStyle = col(t.look.turret);
        ctx.beginPath(); path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
      }
      ctx.setLineDash([]);

      // death rays
      for (const b of v.beams) {
        ctx.globalAlpha = Math.max(0, 1 - b.age / C.RAY_LIFE);
        ctx.lineCap = 'butt';
        ctx.strokeStyle = shade(col(lookOf(b.owner).turret), 0.45); ctx.lineWidth = C.RAY_W * 2 + 3;
        ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
        ctx.strokeStyle = col(lookOf(b.owner).turret); ctx.lineWidth = C.RAY_W * 2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // debris under the walls, then walls, then tanks
      ctx.lineWidth = 2;
      for (const p of this.debris) {
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.a);
        const s = Math.min(1, p.life / 0.35); ctx.scale(s, s);
        part(ctx, p.fill, p.shape === 'disc' ? disc(ctx, 0, 0, p.w) : box(ctx, -p.w / 2, -p.h / 2, p.w, p.h));
        ctx.restore();
      }
      ctx.fillStyle = WALL;
      for (const w of v.walls) ctx.fillRect(w.x1, w.y1, w.x2 - w.x1, w.y2 - w.y1);
      for (const t of v.tanks) if (t.alive) drawTank(ctx, t.look, t.x, t.y, t.a, t);

      // projectiles
      for (const p of v.projectiles) {
        if (p.type === 'laser') {
          ctx.strokeStyle = col(lookOf(p.owner).turret); ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          ctx.beginPath();
          p.path.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.lineTo(p.x, p.y); ctx.stroke();
        } else if (p.type === 'missile') {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx));
          ctx.lineWidth = 1.5;
          const fin = p.target != null ? col(lookOf(p.target).body) : '#9a9a9a';
          part(ctx, fin, poly(ctx, [-8, -6, -3, 0, -8, 6]));
          part(ctx, col(lookOf(p.owner).turret), poly(ctx, [-8, -3, 4, -3, 9, 0, 4, 3, -8, 3]));
          ctx.restore();
        } else {
          ctx.fillStyle = INK;
          ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2.5, p.r), 0, TAU); ctx.fill();
        }
      }

      // shields
      ctx.lineWidth = 2; ctx.strokeStyle = INK; ctx.setLineDash([7, 5]);
      for (const t of v.tanks) {
        if (!t.alive || !t.shield) continue;
        ctx.lineDashOffset = -(v.tick || 0) * 0.6;
        ctx.globalAlpha = t.shield < 60 && (v.tick >> 3) % 2 ? 0.3 : 1;
        ctx.beginPath(); ctx.arc(t.x, t.y, C.SHIELD_R, 0, TAU); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
    }
  }

  // A tank facing up, centred in a square canvas of css size px.
  function tankIcon(cv, look, px, o = {}) {
    const d = window.devicePixelRatio || 1, ctx = cv.getContext('2d');
    cv.width = cv.height = Math.round(px * d);
    cv.style.width = cv.style.height = px + 'px';
    const k = (px * d) / (o.span || 80);
    ctx.setTransform(k, 0, 0, k, cv.width / 2, cv.height / 2);
    drawTank(ctx, look, 0, 4, -Math.PI / 2, o);
  }

  return { drawTank, drawIcon, drawCrate, tankIcon, Scene, shade, INK, WALL };
});
