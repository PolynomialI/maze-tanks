/* Maze Tanks: icon-only screens shared by the local and online pages (stats bar, garage, buttons). */
(function (root, factory) {
  root.UI = factory(root.Game, root.Render);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (G, R) {
  'use strict';
  const S = body => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
  const ICON = {
    play: S('<path d="M8 5v14l11-7z" fill="currentColor"/>'),
    check: S('<path d="M4 12.5l5 5L20 6.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'),
    close: S('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>'),
    trophy: S('<path d="M7 3h10v3h3v2.5A4.5 4.5 0 0 1 15.9 13 5 5 0 0 1 13 15.8V18h3.5v3h-9v-3H11v-2.2A5 5 0 0 1 8.1 13 4.5 4.5 0 0 1 4 8.5V6h3zm0 5H6v.5a2.5 2.5 0 0 0 1.2 2.1A6 6 0 0 1 7 9.5zm10 0v1.5c0 .4 0 .8-.2 1.1A2.5 2.5 0 0 0 18 8.5V8z" fill="currentColor"/>'),
    kill: S('<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="12" r="1.8" fill="currentColor"/>'),
    keys: S('<rect x="2" y="6" width="20" height="12" rx="2.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>'),
    paint: S('<path d="M12 3a9 9 0 0 0 0 18c1.2 0 1.7-.8 1.7-1.6 0-1-.8-1.3-.8-2.1 0-.9.7-1.5 1.6-1.5H16a5 5 0 0 0 5-5c0-4.3-4-7.8-9-7.8z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="7.5" cy="11.5" r="1.6" fill="currentColor"/><circle cx="10" cy="7.5" r="1.6" fill="currentColor"/><circle cx="15" cy="7.5" r="1.6" fill="currentColor"/>'),
    eye: S('<path d="M12 5C6.5 5 2.5 12 2.5 12S6.5 19 12 19s9.5-7 9.5-7S17.5 5 12 5zm0 11a4 4 0 1 1 0-8 4 4 0 0 1 0 8z" fill="currentColor"/>'),
    up: S('<path d="M12 3l-7 8h4.5v10h5V11H19z" fill="currentColor"/>'),
    down: S('<path d="M12 21l7-8h-4.5V3h-5v10H5z" fill="currentColor"/>'),
    left: S('<path d="M12 4V1L7 5.5 12 10V7a6 6 0 1 1-6 6H3.5A8.5 8.5 0 1 0 12 4z" fill="currentColor"/>'),
    right: S('<path d="M12 4V1l5 4.5L12 10V7a6 6 0 1 0 6 6h2.5A8.5 8.5 0 1 1 12 4z" fill="currentColor"/>'),
    fire: S('<circle cx="12" cy="12" r="4" fill="currentColor"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2 19 19M5 19l2.8-2.8M16.2 7.8 19 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>')
  };

  function el(tag, cls, html) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function button(icon, label, cls = '') {
    const b = el('button', 'btn ' + cls, ICON[icon] || '');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    return b;
  }

  // Bottom bar: each player's tank, wins and kills. players: [{id, look, wins, kills, out}]
  function statsBar(host) {
    let sig = '';
    return {
      update(players, me) {
        const s = JSON.stringify([players.map(p => [p.id, p.look, p.wins, p.kills, !!p.out]), me]);
        if (s === sig) return;
        sig = s;
        host.textContent = '';
        for (const p of players) {
          const d = el('div', 'pl' + (p.out ? ' out' : '') + (p.id === me ? ' me' : ''));
          const cv = el('canvas', 'ic');
          R.tankIcon(cv, p.look, 34, { span: 58 });
          d.append(cv);
          d.insertAdjacentHTML('beforeend',
            `<span class="st" aria-label="wins">${ICON.trophy}<b>${p.wins | 0}</b></span><span class="st" aria-label="kills">${ICON.kill}<b>${p.kills | 0}</b></span>`);
          host.append(d);
        }
      }
    };
  }

  // Garage: pick tread/body/turret colours, barrel and accessory; live layered preview.
  function garage(host, look, onDone) {
    look = G.cleanLook(look);
    const panel = el('div', 'panel garage');
    const preview = el('canvas', 'preview');
    const opts = el('div', 'opts');
    const ok = button('check', 'done', 'dark');
    panel.append(preview, opts, ok);
    host.append(panel);
    const redraws = [];
    const redraw = () => { R.tankIcon(preview, look, 168, { span: 76 }); redraws.forEach(f => f()); };

    const HI = '#2b2b2b', LO = '#d6d6d6';
    for (const part of ['tread', 'body', 'turret']) {
      const row = el('div', 'row');
      const ic = el('canvas', 'part');
      R.tankIcon(ic, look, 46, { span: 60, paint: { tread: LO, body: LO, turret: LO, [part]: HI }, noAcc: true });
      row.append(ic);
      G.COLORS.forEach((c, i) => {
        const b = el('button', 'swatch');
        b.type = 'button';
        b.style.background = c;
        b.setAttribute('aria-label', part + ' colour ' + (i + 1));
        b.onclick = () => { look[part] = i; redraw(); };
        redraws.push(() => b.classList.toggle('on', look[part] === i));
        row.append(b);
      });
      opts.append(row);
    }
    const choiceRow = (key, n, draw) => {
      const row = el('div', 'row');
      for (let i = 0; i < n; i++) {
        const b = el('button', 'choice');
        b.type = 'button';
        b.setAttribute('aria-label', key + ' ' + (i + 1));
        const cv = el('canvas');
        b.append(cv);
        b.onclick = () => { look[key] = i; redraw(); };
        redraws.push(() => { b.classList.toggle('on', look[key] === i); draw(cv, i); });
        row.append(b);
      }
      opts.append(row);
    };
    choiceRow('barrel', G.LOOK.barrels, (cv, i) => R.tankIcon(cv, { ...look, barrel: i, acc: 0 }, 40, { span: 64 }));
    choiceRow('acc', G.LOOK.accessories, (cv, i) => R.tankIcon(cv, { ...look, acc: i }, 40, { span: 76 }));
    redraw();
    ok.onclick = () => { panel.remove(); onDone(look); };
    ok.focus();
  }

  return { ICON, el, button, statsBar, garage };
});
