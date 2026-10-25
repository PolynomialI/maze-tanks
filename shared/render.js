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
      case 'double': R(8, -9.5, 22, 7); R(8, 2.5, 22, 7); break;
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

  // Irregular splinter shapes (pellets, shrapnel, crumbling tank pieces), picked by id so each piece keeps its shape.
  function splinters(count, seed) {
    const out = [], r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < count; i++) {
      const n = 3 + Math.floor(r() * 3), stretch = 1.2 + r() * 0.8, a0 = r() * TAU, pts = [];
      for (let k = 0; k < n; k++) {
        const a = a0 + ((k + (r() - 0.5) * 0.6) / n) * TAU, d = 0.45 + r() * 0.55;
        pts.push(Math.cos(a) * d * stretch, Math.sin(a) * d);
      }
      out.push(pts);
    }
    return out;
  }
  const CHIPS = splinters(16, 7);
  const PELLETS = CHIPS.map(pts => pts.map(v => v * 2));
  const BULLET_SIZE = { bullet: C.BULLET_R, frag: C.FRAG_R };
  const EXHAUST = '#8c8579', SMOKE = '#9c9c9c', BLAST = '#5e5e5e';

  // ---------- effect textures: smoke puffs and the force field ----------
  const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function rgbOf(c) {
    if (c[0] === '#') { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
    return c.match(/\d+/g).slice(0, 3).map(Number);
  }

  // Fractal value noise in [0, 1] on a size x size grid.
  function noise(size, seed) {
    const out = new Float32Array(size * size), r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    let amp = 0.5, total = 0;
    for (let cells = 4; cells <= 32; cells *= 2, amp /= 2) {
      const g = Array.from({ length: (cells + 1) * (cells + 1) }, r), w = cells + 1;
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells, fy = (y / size) * cells, ix = fx | 0, iy = fy | 0;
        const ux = smooth(0, 1, fx - ix), uy = smooth(0, 1, fy - iy);
        const p = g[iy * w + ix], q = g[iy * w + ix + 1], u = g[(iy + 1) * w + ix], v = g[(iy + 1) * w + ix + 1];
        out[y * size + x] += amp * (p + (q - p) * ux + (u - p) * uy + (p - q - u + v) * ux * uy);
      }
      total += amp;
    }
    for (let i = 0; i < out.length; i++) out[i] /= total;
    return out;
  }

  // Billowy smoke puffs: noisy outline, wispy density, lit from the top left. Four shapes, tinted per colour.
  const PUFF = 64, puffCache = new Map();
  let puffMasks = null;
  function puffSprites(color) {
    let sprites = puffCache.get(color);
    if (sprites) return sprites;
    puffMasks = puffMasks || [0, 1, 2, 3].map(i => {
      const shape = noise(PUFF, 101 + i * 977), dens = noise(PUFF, 5 + i * 131);
      const alpha = new Float32Array(PUFF * PUFF), light = new Float32Array(PUFF * PUFF);
      for (let y = 0; y < PUFF; y++) for (let x = 0; x < PUFF; x++) {
        const dx = ((x + 0.5) / PUFF) * 2 - 1, dy = ((y + 0.5) / PUFF) * 2 - 1, j = y * PUFF + x;
        const d = Math.hypot(dx, dy) + (shape[j] - 0.5) * 0.7;
        alpha[j] = (1 - smooth(0.25, 0.95, d)) * (0.45 + 0.55 * smooth(0.25, 0.75, dens[j]));
        light[j] = 0.86 + 0.35 * (dens[j] - 0.5) - 0.16 * (dx + dy);
      }
      return { alpha, light };
    });
    const rgb = rgbOf(color);
    sprites = puffMasks.map(({ alpha, light }) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = PUFF;
      const c = cv.getContext('2d'), img = c.createImageData(PUFF, PUFF);
      for (let j = 0; j < alpha.length; j++) {
        const l = light[j];
        for (let ch = 0; ch < 3; ch++) {
          const v = rgb[ch];
          img.data[j * 4 + ch] = Math.max(0, Math.min(255, l > 1 ? v + (255 - v) * (l - 1) * 2 : v * l));
        }
        img.data[j * 4 + 3] = alpha[j] * 255;
      }
      c.putImageData(img, 0, 0);
      return cv;
    });
    puffCache.set(color, sprites);
    return sprites;
  }

  // Hexagon lattice for the force field, brighter toward the rim.
  let hexTex = null;
  function hexTexture() {
    if (hexTex) return hexTex;
    const S = 256, R = S / 2, h = 12, cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const c = cv.getContext('2d');
    c.lineWidth = 1.4;
    for (let row = -12; row <= 12; row++) for (let col = -12; col <= 12; col++) {
      const cx = R + (col + (row & 1) / 2) * h * Math.sqrt(3), cy = R + row * h * 1.5, d = Math.hypot(cx - R, cy - R) / R;
      if (d > 1.08) continue;
      c.strokeStyle = `rgba(40,120,235,${(0.1 + 0.7 * d * d * d).toFixed(3)})`;
      c.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; c.lineTo(cx + Math.cos(a) * h * 0.9, cy + Math.sin(a) * h * 0.9); }
      c.closePath();
      c.stroke();
    }
    return (hexTex = cv);
  }

  // A destroyed tank crumbles into irregular shards cut from its own picture.
  function disintegrate(t) {
    const N = 96, B = 3, cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const c = cv.getContext('2d');
    drawTank(c, t.look, N / 2, N / 2, 0, { weapon: t.weapon });
    const img = c.getImageData(0, 0, N, N).data, ca = Math.cos(t.a), sa = Math.sin(t.a), out = [];
    for (let y = 0; y < N; y += B) for (let x = 0; x < N; x += B) {
      const i = ((y + 1) * N + x + 1) * 4;
      if (img[i + 3] < 128) continue;
      const lx = x + B / 2 - N / 2, ly = y + B / 2 - N / 2, wx = ca * lx - sa * ly, wy = sa * lx + ca * ly;
      const a = Math.atan2(wy, wx) + (Math.random() - 0.5) * 1.2, sp = 10 + Math.random() * 50 + Math.hypot(lx, ly) * 2;
      out.push({ x: t.x + wx, y: t.y + wy, a: Math.random() * TAU, va: (Math.random() - 0.5) * 8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        color: `rgb(${img[i]},${img[i + 1]},${img[i + 2]})`, shape: CHIPS[Math.floor(Math.random() * CHIPS.length)],
        wait: Math.random() * 0.25, life: 0.6 + Math.random() * 0.8 });
    }
    return out;
  }

  class Scene {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.bits = [];          // shards of destroyed tanks
      this.smoke = [];         // puffs: exhaust, missile trails, timed-out shots, explosions
      this.alive = new Map();
      this.trail = new Map();  // where each tank / missile last left a puff
      this.tracks = new Map(); // where each tank last left a tread mark
      this.seenFx = new Set();
      this.decal = null;       // tread marks, 1 px per maze unit, fading over time
      this.frame = 0;
      this.round = null;
      this.last = 0;
    }

    puff(x, y, r0, r1, life, color, alpha, vx = 0, vy = 0) {
      this.smoke.push({ x, y, r0, r1, life, t: 0, color, alpha, vx, vy,
        rot: Math.random() * TAU, spin: (Math.random() - 0.5) * 1.2, v: Math.floor(Math.random() * 4) });
    }

    // Tread marks: a track band with cleat stripes under each tread, drawn into a fading floor layer.
    marks(v) {
      const W = v.maze.w * C.CELL, H = v.maze.h * C.CELL;
      if (!this.decal || this.decal.width !== W || this.decal.height !== H) {
        this.decal = document.createElement('canvas');
        this.decal.width = W; this.decal.height = H;
      }
      const c = this.decal.getContext('2d');
      if (++this.frame % 12 === 0) {
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = 'rgba(0,0,0,0.12)';
        c.fillRect(0, 0, W, H);
        c.globalCompositeOperation = 'source-over';
      }
      for (const t of v.tanks) {
        if (!t.alive) continue;
        const last = this.tracks.get(t.id), d = last ? Math.hypot(t.x - last.x, t.y - last.y) : Infinity;
        if (d < 4) continue;
        this.tracks.set(t.id, { x: t.x, y: t.y });
        if (d > 30) continue; // first sighting or a jump: no mark
        const cos = Math.cos(t.a), sin = Math.sin(t.a);
        for (const side of [-11.5, 11.5]) {
          c.setTransform(cos, sin, -sin, cos, t.x - sin * side, t.y + cos * side);
          c.fillStyle = 'rgba(80,70,58,0.08)'; c.fillRect(-2, -4.5, 4, 9);
          c.fillStyle = 'rgba(60,52,42,0.18)'; c.fillRect(-0.9, -4.5, 1.8, 9);
        }
      }
      c.setTransform(1, 0, 0, 1, 0, 0);
    }

    // Start effects for what changed since the last frame, then age everything by dt.
    effects(v, dt, lookOf) {
      if (v.round !== this.round) {
        this.round = v.round;
        this.bits = []; this.smoke = [];
        this.alive.clear(); this.trail.clear(); this.tracks.clear(); this.seenFx.clear();
        if (this.decal) this.decal.getContext('2d').clearRect(0, 0, this.decal.width, this.decal.height);
      }
      this.marks(v);
      for (const t of v.tanks) {
        if (this.alive.get(t.id) === true && !t.alive && t.look) {
          this.bits.push(...disintegrate(t));
          for (let i = 0; i < 9; i++) {
            const a = Math.random() * TAU, s = 15 + Math.random() * 30;
            this.puff(t.x, t.y, 8, 26 + Math.random() * 8, 1.2 + Math.random() * 0.6, BLAST, 0.55, Math.cos(a) * s, Math.sin(a) * s);
          }
        }
        this.alive.set(t.id, t.alive);
        if (!t.alive) continue;
        // exhaust: a puff from alternate rear corners every few units driven
        const last = this.trail.get(t.id);
        if (!last) this.trail.set(t.id, { x: t.x, y: t.y, side: 1 });
        else if (Math.hypot(t.x - last.x, t.y - last.y) > 7) {
          const c = Math.cos(t.a), s = Math.sin(t.a), side = -last.side;
          this.puff(t.x - c * 21 - s * 8 * side, t.y - s * 21 + c * 8 * side, 3, 12, 1, EXHAUST, 0.5, -c * 14, -s * 14);
          this.trail.set(t.id, { x: t.x, y: t.y, side });
        }
      }
      for (const p of v.projectiles) {
        if (p.type !== 'missile') continue;
        const last = this.trail.get('m' + p.id);
        if (last && Math.hypot(p.x - last.x, p.y - last.y) < 5) continue;
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const color = p.target != null ? col(lookOf(p.target).body) : SMOKE;
        this.puff(p.x - (p.vx / sp) * 9, p.y - (p.vy / sp) * 9, 3, 13, 1.2, color, 0.75);
        this.trail.set('m' + p.id, { x: p.x, y: p.y });
      }
      for (const f of v.fx || []) {
        if (this.seenFx.has(f.id)) continue;
        this.seenFx.add(f.id);
        for (let i = 0; i < (f.big ? 8 : 4); i++) {
          const a = Math.random() * TAU, s = 6 + Math.random() * 12;
          this.puff(f.x, f.y, 2, f.big ? 18 : 11, 0.7 + Math.random() * 0.4, SMOKE, 0.6, Math.cos(a) * s, Math.sin(a) * s);
        }
      }
      const drag = Math.pow(0.15, dt);
      for (const b of this.bits) {
        if (b.wait > 0) { b.wait -= dt; continue; }
        b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.va * dt;
        b.vx *= drag; b.vy *= drag; b.life -= dt;
      }
      for (const s of this.smoke) { s.t += dt; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= drag; s.vy *= drag; }
      this.bits = this.bits.filter(b => b.life > 0);
      this.smoke = this.smoke.filter(s => s.t < s.life);
    }

    // Glowing energy bubble: soft blue body, turning hex lattice, glowing rim and sweeping highlights.
    shield(t, time) {
      const ctx = this.ctx, k = this.k, R = C.SHIELD_R * (1 + 0.025 * Math.sin(time * 5 + t.id));
      const on = t.shield < 60 && Math.floor(time * 10) % 2 ? 0.35 : 1; // flickers before it runs out
      ctx.save();
      ctx.globalAlpha = on;
      const g = ctx.createRadialGradient(t.x, t.y, R * 0.1, t.x, t.y, R * 1.15);
      g.addColorStop(0, 'rgba(90,170,255,0.04)');
      g.addColorStop(0.62, 'rgba(80,160,255,0.12)');
      g.addColorStop(0.86, 'rgba(60,145,255,0.32)');
      g.addColorStop(0.94, 'rgba(110,190,255,0.55)');
      g.addColorStop(1, 'rgba(60,145,255,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(t.x, t.y, R * 1.15, 0, TAU); ctx.fill();
      ctx.save();
      ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, TAU); ctx.clip();
      ctx.translate(t.x, t.y); ctx.rotate(time * 0.3);
      ctx.globalAlpha = 0.6 * on;
      ctx.drawImage(hexTexture(), -R, -R, 2 * R, 2 * R);
      ctx.restore();
      ctx.shadowColor = 'rgba(40,140,255,0.9)';
      ctx.shadowBlur = 8 * k;
      ctx.strokeStyle = 'rgba(90,175,255,0.95)';
      ctx.lineWidth = 1.8;
      ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, TAU); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 2.2;
      ctx.lineCap = 'round';
      for (const [a0, len] of [[time * 2.1, 0.9], [-time * 1.5 + 2, 0.55]]) {
        ctx.beginPath(); ctx.arc(t.x, t.y, R, a0, a0 + len); ctx.stroke();
      }
      ctx.restore();
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
      this.view = v;
      if (!v) return;

      const looks = v.looks || {}, lookOf = id => looks[id] || { body: 11, turret: 11, tread: 11, barrel: 0, acc: 0 };
      this.effects(v, dt, lookOf);

      const m = v.maze, W = m.w * C.CELL, H = m.h * C.CELL, pad = 12;
      const k = Math.min(W0 / (W + 2 * pad), H0 / (H + 2 * pad));
      this.k = k; this.ox = (W0 - W * k) / 2; this.oy = (H0 - H * k) / 2;
      ctx.setTransform(k, 0, 0, k, this.ox, this.oy);
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        if (G.isOff(m, x, y)) continue;
        ctx.fillStyle = FLOOR[m.shade ? m.shade[y * m.w + x] : (x + y) % 2];
        ctx.fillRect(x * C.CELL, y * C.CELL, C.CELL, C.CELL);
      }
      ctx.drawImage(this.decal, 0, 0, W, H);

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
        ctx.strokeStyle = col((t.look || lookOf(t.id)).turret);
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

      // crumbling tanks under the walls
      for (const b of this.bits) {
        const s = Math.min(1, b.life / 0.4) * 2.3;
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.a); ctx.scale(s, s);
        ctx.fillStyle = b.color;
        ctx.beginPath(); poly(ctx, b.shape)(); ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = WALL;
      for (const w of v.walls) ctx.fillRect(w.x1, w.y1, w.x2 - w.x1, w.y2 - w.y1);

      // smoke drifts over the floor and walls, under the tanks
      for (const s of this.smoke) {
        const f = s.t / s.life, r = s.r0 + (s.r1 - s.r0) * (1 - (1 - f) * (1 - f)), a = s.rot + s.spin * s.t;
        ctx.globalAlpha = s.alpha * Math.min(1, f * 6) * Math.pow(1 - f, 1.3);
        ctx.setTransform(k * Math.cos(a), k * Math.sin(a), -k * Math.sin(a), k * Math.cos(a), this.ox + k * s.x, this.oy + k * s.y);
        ctx.drawImage(puffSprites(s.color)[s.v], -r, -r, 2 * r, 2 * r);
      }
      ctx.setTransform(k, 0, 0, k, this.ox, this.oy);
      ctx.globalAlpha = 1;

      // (a player who just left can still be in the delayed view: draw their tank in neutral colours)
      for (const t of v.tanks) if (t.alive) drawTank(ctx, t.look || lookOf(t.id), t.x, t.y, t.a, t);

      // projectiles: tiny splinters (minigun, shotgun, mines, shrapnel), normal bullets, frag bomb, laser and missile
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
        } else if (p.type === 'pellet' || p.type === 'shard' || p.type === 'gat') {
          ctx.save();
          ctx.translate(p.x, p.y); ctx.rotate(p.id * 1.7);
          ctx.fillStyle = INK;
          ctx.beginPath(); poly(ctx, PELLETS[p.id % PELLETS.length])(); ctx.fill();
          ctx.restore();
        } else {
          ctx.fillStyle = INK;
          ctx.beginPath(); ctx.arc(p.x, p.y, BULLET_SIZE[p.type] || C.BULLET_R, 0, TAU); ctx.fill();
        }
      }

      for (const t of v.tanks) if (t.alive && t.shield) this.shield(t, now / 1000);
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
