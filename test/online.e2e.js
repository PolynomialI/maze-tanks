// Playwright check of the online client against a local server. Screenshots go to test/screens/.
// Run: node test/online.e2e.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('path');
const { createServer } = require('../server/server.js');
const G = require('../shared/game.js');

const shots = path.join(__dirname, 'screens');

(async () => {
  let app = createServer();
  await new Promise(r => app.server.listen(0, r));
  const port = app.server.address().port, url = 'http://127.0.0.1:' + port + '/';
  const browser = await chromium.launch();
  const errors = [];
  const open = async () => {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    await page.waitForSelector('#play');
    return page;
  };
  const step = async (name, fn) => { await fn(); console.log('ok -', name); };
  const myTank = page => page.evaluate(() => { const s = mazeTanksOnline.snaps.at(-1); return s && s.T.find(t => t[0] === mazeTanksOnline.me); });

  const [a, b] = [await open(), await open()];
  await step('home screen: tank, garage and play, no text', async () => {
    assert.match((await a.locator('body').innerText()).replace(/\s+/g, ''), /^[0-9]*$/);
    await a.screenshot({ path: path.join(shots, 'online-home.png') });
  });

  await step('garage look is sent to the server and shown to others', async () => {
    await a.locator('.card .btn').click();
    await a.locator('.garage .row').nth(1).locator('.swatch').nth(8).click(); // purple body
    await a.locator('.garage .btn').click();
    await a.click('#play');
    await a.waitForFunction(() => mazeTanksOnline.screen === 'queue');
    await a.waitForSelector('#overlay.dark .ctl'); // controls shown while waiting, no confirmation needed
    assert.equal(await a.locator('.ctl .set').count(), 2);
    await a.screenshot({ path: path.join(shots, 'online-queue.png') });
    await b.click('#play');
    await b.waitForFunction(() => mazeTanksOnline.players.length === 2);
    await b.waitForSelector('#count:not([hidden])'); // round countdown over a blurred view
    assert.equal(await b.evaluate(() => document.querySelector('#game').classList.contains('blur')), true);
    const seen = await b.evaluate(() => mazeTanksOnline.players.map(p => p.look.body));
    assert.ok(seen.includes(8));
  });

  await step('own tank responds instantly (prediction) and the server agrees', async () => {
    await a.waitForFunction(() => mazeTanksOnline.pred && mazeTanksOnline.cd === 0, null, { timeout: 6000 });
    assert.equal(await a.locator('#count').isHidden(), true);
    const p0 = await a.evaluate(() => ({ ...mazeTanksOnline.pred }));
    await a.keyboard.down('ArrowLeft');
    await a.waitForFunction(a0 => mazeTanksOnline.pred.a !== a0, p0.a, { timeout: 500 }); // turns on screen right away
    await a.waitForTimeout(500);
    await a.keyboard.up('ArrowLeft');
    await a.waitForTimeout(400);
    const pred = await a.evaluate(() => mazeTanksOnline.pred), server = await myTank(a);
    assert.deepEqual([pred.x, pred.y, pred.a], [server[1], server[2], server[3]], 'prediction matches the server exactly');
  });

  await step('bullets of all three sizes are drawn on the other player\'s screen (pixel check)', async () => {
    const ida = await a.evaluate(() => mazeTanksOnline.me);
    // open spots (cell centres and quarter points, clear of walls) away from the tanks; mazes can be tiny
    const st = [...app.mm.lobbies][0].match.state, free = [];
    for (let y = 0; y < st.maze.h; y++) for (let x = 0; x < st.maze.w; x++) for (const [ox, oy] of [[0, 0], [-25, -25], [25, -25], [-25, 25], [25, 25]]) {
      const cx = (x + 0.5) * 100 + ox, cy = (y + 0.5) * 100 + oy;
      if (!G.isOff(st.maze, x, y) && st.tanks.every(t => Math.hypot(t.x - cx, t.y - cy) > 60)) free.push([cx, cy]);
    }
    ['bullet', 'gat', 'pellet'].forEach((type, i) =>
      st.projectiles.push({ id: 5000 + i, type, owner: ida, x: free[i][0], y: free[i][1], vx: 0, vy: 0, r: 2, life: 1e6, age: 0, bounces: 0 }));
    for (const type of ['bullet', 'gat', 'pellet']) {
      await b.waitForFunction(type => {
        const s = mazeTanksOnline.scene, p = s.view && s.view.projectiles.find(q => q.type === type);
        if (!p) return false;
        const px = s.ctx.getImageData(Math.round(p.x * s.k + s.ox) - 2, Math.round(p.y * s.k + s.oy) - 2, 5, 5).data;
        let darkest = 255;
        for (let i = 0; i < px.length; i += 4) darkest = Math.min(darkest, px[i], px[i + 1], px[i + 2]);
        return darkest < 120; // a dark shot on the light floor
      }, type, { timeout: 3000 });
    }
    await b.screenshot({ path: path.join(shots, 'online-bullets.png') });
    // a missile locked on to player 2 trails smoke in player 2's colour on both screens
    const idb = await b.evaluate(() => mazeTanksOnline.me);
    const room = p => Math.min(...st.tanks.map(t => Math.hypot(p[0] - t.x, p[1] - t.y)));
    const far = free.reduce((f, p) => (room(p) > room(f) ? p : f)); // as far from every tank as possible
    st.projectiles.push({ id: 5100, type: 'missile', owner: ida, x: far[0], y: far[1], vx: 0, vy: 0, r: 5, life: 1e6,
      age: G.C.MISSILE_SEEK, bounces: 0, target: idb, rival: 0 });
    for (const page of [a, b]) {
      await page.waitForFunction(idb => {
        const look = mazeTanksOnline.players.find(p => p.id === idb).look;
        return mazeTanksOnline.scene.smoke.some(s => s.color === Game.COLORS[look.body]);
      }, idb, { timeout: 3000 });
    }
    st.projectiles = st.projectiles.filter(p => p.id < 5000);
  });

  await step('firing creates a bullet seen by both players', async () => {
    await a.keyboard.press('Space');
    await b.waitForFunction(() => mazeTanksOnline.snaps.at(-1).P.length > 0, null, { timeout: 2000 });
    await b.screenshot({ path: path.join(shots, 'online-play.png') });
  });

  const c = await open();
  await step('a third player joins mid-round and watches (eye icon)', async () => {
    await c.click('#play');
    await c.waitForFunction(() => mazeTanksOnline.screen === 'game' && mazeTanksOnline.players.length === 3);
    await c.waitForSelector('.ctl'); // matched straight away: the controls stay up briefly, then the game shows
    await c.waitForFunction(() => document.querySelector('#overlay').hidden, null, { timeout: 4000 });
    await c.waitForSelector('#corner span:not([hidden]) svg');
    assert.equal(await c.locator('#bar .pl').count(), 3);
    await c.waitForTimeout(300);
    await c.screenshot({ path: path.join(shots, 'online-spectate.png') });
  });

  await step('a player with a tank leaves mid-round: they go home, the others keep playing smoothly', async () => {
    const idc = await c.evaluate(() => mazeTanksOnline.me);
    [...app.mm.lobbies][0].match.startRound(); // next round: the third player now has a tank
    await a.waitForFunction(idc => mazeTanksOnline.snaps.length && mazeTanksOnline.snaps.at(-1).T.some(t => t[0] === idc), idc);
    await c.locator('#corner .btn').click();
    await c.waitForFunction(() => mazeTanksOnline.screen === 'home');
    await a.waitForFunction(() => mazeTanksOnline.players.length === 2);
    // the departed tank is still in the delayed view for a moment; drawing must carry on
    const before = await a.evaluate(() => mazeTanksOnline.scene.last);
    await a.waitForTimeout(400);
    assert.ok(await a.evaluate(() => mazeTanksOnline.scene.last) > before, 'still drawing frames');
  });

  await step('server goes away: waking spinner, then reconnects by itself', async () => {
    await app.close();
    await a.waitForFunction(() => mazeTanksOnline.screen === 'connect');
    await a.waitForSelector('#overlay .spin');
    await a.screenshot({ path: path.join(shots, 'online-waking.png') });
    app = createServer();
    await new Promise(r => app.server.listen(port, r));
    await a.waitForFunction(() => mazeTanksOnline.screen === 'home', null, { timeout: 10000 });
  });

  assert.deepEqual(errors, [], 'page errors');
  console.log('all online checks passed; screenshots in test/screens');
  await browser.close();
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
