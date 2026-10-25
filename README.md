# Maze Tanks

Top-down tank battles in a random maze: bullets bounce off walls, power-up crates appear over time, and the last tank standing wins the round. Flat 2D art, no text in the game.

Two versions share one game-logic module (`shared/game.js`):

- **Local**: `dist/maze-tanks.html`, a single offline file for 2 players on one keyboard. Open it in a browser.
- **Online**: a Node.js web service (`server/`, `public/`) for up to 8 players per lobby, ready for Render.com.

## Controls

| | Forward | Back | Turn left | Turn right | Fire |
|---|---|---|---|---|---|
| Local player 1 | E | D | S | F | Q |
| Local player 2 | ↑ | ↓ | ← | → | M |
| Online | ↑ or E | ↓ or D | ← or S | → or F | M, Q or Space |

Local keys can be remapped with the keyboard button under each tank. Esc pauses back to the menu. Click a tank (or the palette button) to open the garage.

## Rules

- A new random maze every round, always landscape, from tiny (3×2 cells) to huge (up to 24 wide), and from tight mazes to open arenas with scattered cover. Floor shading is random, with dark cells grouped together.
- Each round starts with a 3-2-1 countdown over a blurred view.
- Normal bullets bounce, last 20 seconds, at most 7 per tank on screen, and kill any tank, including the one that fired. A bullet that times out leaves a puff of smoke.
- Two bullet sizes: normal shots, and tiny irregular pellets (minigun, shotgun, mines, frag shrapnel).
- When one tank is left, the round ends after 3 seconds. If that tank dies in those 3 seconds, the round is a draw.
- Crates appear in random cells. Drive over one to collect it. While you hold a weapon, you drive over other crates without taking them; a shield is picked up any time.
- The stats bar shows each player's wins and kills for the session (local) or lobby (online). Killing yourself doesn't count as a kill.
- Online: players who join mid-round watch until the next round starts.

## Power-ups

The list matches TankTrouble.com's crates plus the death ray and frag bomb from the original game. The exact numbers aren't published, so these values are approximations.

| Crate | What it does |
|---|---|
| Gatling gun | Hold fire: spins up for 1 s, then fires a burst of 40 tiny pellets that last 5 s. Release and hold again for a second burst. |
| Laser | Shows a long dotted aiming line. One extremely fast beam that bounces and passes through every tank in its path. |
| Homing missile | Flies and bounces for 3 s, then locks on to the closest tank (possibly you) and hunts it through the maze, trailing smoke in that tank's colour. It switches only if another tank stays much closer for 2 s. Lasts 30 s. |
| Death ray | 2 s charge with the tank frozen, then a beam that goes through walls and stops at white space. |
| Frag bomb | A big, slow shot. Fire again (or hit a tank, or wait 10 s) to burst it into 24 shards that stop at walls. |
| Double barrel | Two thick barrels that fire one at a time, taking turns: 14 shots. |
| Shotgun | 24 short-range pellets in a spread, 3 shots. |
| Mines | 3 mines. Each arms after 2 s, fades almost out of sight, and bursts into 200 tiny pellets when a tank drives over it. |
| Shield | A blue force field for 6 s. Nothing can hit you; every shot bounces off it, your own included. |

## Deploy to Render (free tier)

1. **Create an empty GitHub repo.** On github.com: New repository, name it (e.g. `maze-tanks`), leave README/.gitignore/license unticked.
2. **Push this project to it.** From this folder:
   ```
   git init && git add . && git commit -m "Maze Tanks"
   git branch -M main
   git remote add origin https://github.com/<you>/maze-tanks.git
   git push -u origin main
   ```
3. **Create the service.** On dashboard.render.com: New → Blueprint → connect GitHub → pick the repo → Apply. Render reads `render.yaml` (free Node web service, `npm install`, `npm start`, health check `/healthz`).
   Without the Blueprint: New → Web Service → pick the repo → Runtime Node, Build `npm install`, Start `npm start`, Instance type Free.
4. **Play.** When the deploy shows "Live", open the `https://<name>.onrender.com` link and share it.

The free tier sleeps after about 15 minutes without visitors. The first visit after that waits about a minute while the service wakes up (the page itself is served by the sleeping service). Once the page is loaded, a spinner shows while it connects or reconnects.

## Development

```
npm install
npm start            # http://localhost:3000
npm test             # game logic + WebSocket server tests
npm run build        # rebuild dist/maze-tanks.html from shared/ and local/
npm run e2e          # browser checks; needs: npm i -D playwright && npx playwright install chromium
```

Layout: `shared/` (logic, drawing, screens, style), `local/` (local page source), `public/` (online page), `server/` (HTTP + WebSocket server, matchmaking), `scripts/build-local.js`, `test/`.
