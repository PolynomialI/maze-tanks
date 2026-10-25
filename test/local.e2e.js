// Playwright check of the offline page: two players on one keyboard. Screenshots go to test/screens/.
// Run: node scripts/build-local.js && node test/local.e2e.js
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

const file = 'file://' + path.join(__dirname, '../dist/maze-tanks.html');
const shots = path.join(__dirname, 'screens');
fs.mkdirSync(shots, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  const step = async (name, fn) => { await fn(); console.log('ok -', name); };
  const tanks = () => page.evaluate(() => mazeTanks.match.state.tanks.map(t => ({ x: t.x, y: t.y, a: t.a, alive: t.alive })));
  const hold = async (key, ms) => { await page.keyboard.down(key); await page.waitForTimeout(ms); await page.keyboard.up(key); };

  await page.goto(file);
  await step('menu shows two tanks, a play button and the stats bar', async () => {
    await page.waitForSelector('#play');
    assert.equal(await page.locator('.card').count(), 2);
    assert.equal(await page.locator('#bar .pl').count(), 2);
    await page.screenshot({ path: path.join(shots, 'local-menu.png') });
  });

  await step('no visible text apart from numbers and key names', async () => {
    const text = (await page.locator('body').innerText()).replace(/\s+/g, '');
    assert.match(text, /^[0-9]*$/, 'unexpected text: ' + text);
  });

  await step('garage changes colours, previewed live and saved', async () => {
    await page.locator('.card canvas').first().click();
    await page.waitForSelector('.garage');
    await page.locator('.garage .row').nth(1).locator('.swatch').nth(6).click(); // body: blue
    await page.locator('.garage .row').nth(4).locator('.choice').nth(1).click(); // accessory: hat
    await page.locator('.garage .row').nth(3).locator('.choice').nth(3).click(); // barrel style 4
    await page.screenshot({ path: path.join(shots, 'local-garage.png') });
    await page.locator('.garage .btn').click();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mazeTanks.local')).looks[0]);
    assert.deepEqual([saved.body, saved.acc, saved.barrel], [6, 1, 3]);
  });

  await step('keys can be remapped (player 1 forward -> W)', async () => {
    await page.locator('.card').first().locator('.btn').nth(1).click();
    await page.locator('.keys .key').first().click();
    await page.keyboard.press('KeyW');
    assert.equal(await page.locator('.keys .key').first().innerText(), 'W');
    await page.screenshot({ path: path.join(shots, 'local-keys.png') });
    await page.locator('.keys .btn').click();
  });

  await step('controls screen: each player presses their fire key to confirm, then the game starts', async () => {
    await page.click('#play');
    await page.waitForSelector('.ctl');
    assert.equal(await page.locator('.ctl .set').count(), 2);
    assert.deepEqual(await page.locator('.ctl .set').first().locator('.cap').allInnerTexts(), ['W', 'D', 'S', 'F', 'Q'], 'player 1 keys as remapped');
    await page.screenshot({ path: path.join(shots, 'local-controls.png') });
    await page.keyboard.press('KeyQ');
    assert.deepEqual(await page.locator('.ctl .set.ok').count(), 1, 'player 1 ready');
    await page.waitForTimeout(700);
    assert.equal(await page.evaluate(() => mazeTanks.playing), false, 'waits for player 2');
    await page.screenshot({ path: path.join(shots, 'local-controls-p1-ready.png') });
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => mazeTanks.playing, null, { timeout: 2000 });
  });

  await step('play starts a round with two tanks after a 3-2-1 countdown over a blurred view', async () => {
    assert.equal(await page.locator('#overlay').isHidden(), true);
    const t = await tanks();
    assert.equal(t.length, 2);
    await page.waitForSelector('#count:not([hidden])');
    assert.equal(await page.locator('#count').innerText(), '3');
    assert.equal(await page.evaluate(() => document.querySelector('#game').classList.contains('blur')), true);
    await page.screenshot({ path: path.join(shots, 'local-countdown.png') });
    await hold('KeyW', 300);
    assert.deepEqual((await tanks())[0], t[0], 'no driving during the countdown');
    await page.waitForFunction(() => mazeTanks.match.state.countdown === 0, null, { timeout: 5000 });
    assert.equal(await page.locator('#count').isHidden(), true);
    assert.equal(await page.evaluate(() => document.querySelector('#game').classList.contains('blur')), false);
  });

  await step('player 1 drives (W) and turns (S); player 2 turns (←) and drives back (↓)', async () => {
    const a = await tanks();
    await hold('KeyS', 300);
    await hold('KeyW', 500);
    await hold('ArrowLeft', 300);
    await hold('ArrowDown', 400);
    const b = await tanks();
    assert.notEqual(a[0].a, b[0].a, 'p1 turned');
    assert.ok(Math.hypot(a[0].x - b[0].x, a[0].y - b[0].y) > 5, 'p1 drove');
    assert.notEqual(a[1].a, b[1].a, 'p2 turned');
  });

  await step('both players fire (Q and M)', async () => {
    // centre each tank in its cell so a point-blank wall can't bounce the shot straight back
    await page.evaluate(() => { for (const t of mazeTanks.match.state.tanks) { t.x = (Math.floor(t.x / 100) + 0.5) * 100; t.y = (Math.floor(t.y / 100) + 0.5) * 100; } });
    await page.keyboard.press('KeyQ');
    await page.keyboard.press('KeyM');
    await page.waitForTimeout(50);
    const owners = await page.evaluate(() => mazeTanks.match.state.projectiles.map(p => p.owner));
    assert.ok(owners.includes(1) && owners.includes(2));
    await page.screenshot({ path: path.join(shots, 'local-play.png') });
    // bullets now last 20 s: clear them so a stray hit can't change the later steps
    await page.evaluate(() => { mazeTanks.match.state.projectiles = []; });
    assert.deepEqual((await tanks()).map(t => t.alive), [true, true]);
  });

  await step('power-ups, crates, shield, mines and aim line render (art check)', async () => {
    await page.evaluate(() => {
      const st = mazeTanks.match.state, G = Game, [a, b] = st.tanks;
      st.projectiles = [];
      a.weapon = { type: 'laser', ammo: 1, spin: 0, bomb: null };
      b.shield = 300;
      st.crates = G.POWERUPS.map((type, i) => ({ id: 900 + i, type, x: ((i % st.maze.w) + 0.5) * 100, y: (Math.floor(i / st.maze.w) + 0.5) * 100 }))
        .filter(c => Math.hypot(c.x - a.x, c.y - a.y) > 60 && Math.hypot(c.x - b.x, c.y - b.y) > 60);
      st.mines.push({ id: 800, owner: 2, x: b.x + 40, y: b.y, age: 0 });
      G.shoot(st, b, 'missile', 0, 0, G.C.MISSILE_SPEED, G.C.MISSILE_R, G.C.MISSILE_LIFE, { target: 1, rival: 0 });
      st.projectiles.at(-1).age = G.C.MISSILE_SEEK; // locked on to player 1
      st.crateTimer = 1e9;
    });
    await page.waitForTimeout(250);
    const smoke = await page.evaluate(() => mazeTanks.scene.smoke.map(s => s.color));
    const target = await page.evaluate(() => Game.COLORS[mazeTanks.match.player(1).look.body]);
    assert.ok(smoke.includes(target), 'missile smoke takes the colour of the tank it is chasing');
    await page.screenshot({ path: path.join(shots, 'local-powerups.png') });
  });

  await step('a kill ends the round: winner +1 win, killer +1 kill, tank breaks apart', async () => {
    await page.evaluate(() => { const st = mazeTanks.match.state; st.projectiles = []; st.mines = []; Game.kill(st, st.tanks[1], 1); });
    await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(shots, 'local-explosion.png') });
    await page.waitForFunction(() => mazeTanks.match.round === 2, null, { timeout: 6000 });
    const stats = await page.evaluate(() => mazeTanks.match.players.map(p => [p.wins, p.kills]));
    assert.deepEqual(stats, [[1, 1], [0, 0]]);
    await page.waitForTimeout(100);
    assert.deepEqual(await page.locator('#bar .st b').allInnerTexts(), ['1', '1', '0', '0']);
    await page.screenshot({ path: path.join(shots, 'local-round2.png') });
  });

  await step('escape pauses back to the menu; stats are kept', async () => {
    await page.keyboard.press('Escape');
    await page.waitForSelector('#play');
    await page.click('#play');
    await page.keyboard.press('KeyQ');
    await page.keyboard.press('KeyM');
    await page.waitForFunction(() => mazeTanks.playing, null, { timeout: 2000 });
    assert.equal(await page.evaluate(() => mazeTanks.match.players[0].wins), 1);
  });

  await step('settings survive a reload', async () => {
    await page.reload();
    await page.waitForSelector('#play');
    const look = await page.evaluate(() => JSON.parse(localStorage.getItem('mazeTanks.local')).looks[0].body);
    assert.equal(look, 6);
  });

  assert.deepEqual(errors, [], 'console errors');
  console.log('all local checks passed; screenshots in test/screens');
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
