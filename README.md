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

- A new random maze every round, with loops and an irregular outline. Its size varies.
- Normal bullets bounce, last 10 seconds, at most 5 per tank on screen, and kill any tank, including the one that fired.
- When one tank is left, the round ends after 3 seconds. If that tank dies in those 3 seconds, the round is a draw.
- Crates appear in random cells. Drive over one to collect it. While you hold a weapon, you drive over other crates without taking them; a shield is picked up any time.
- The stats bar shows each player's wins and kills for the session (local) or lobby (online). Killing yourself doesn't count as a kill.
- Online: players who join mid-round watch until the next round starts.

## Power-ups

The list matches TankTrouble.com's crates plus the death ray and frag bomb from the original game. The exact numbers aren't published, so these values are approximations.

| Crate | What it does |
|---|---|
| Gatling gun | Hold fire: spins up for 1 s, then fires a stream of 25 small bullets. |
| Laser | Shows a dotted aiming line. One very fast beam that bounces and passes through every tank in its path. |
| Homing missile | Bounces like a bullet for 2.5 s, then hunts the nearest tank (possibly you) through the maze. |
| Death ray | 2 s charge with the tank frozen, then a beam that goes through walls and stops at white space. |
| Frag bomb | A big, slow shot. Fire again (or hit a tank, or wait 10 s) to burst it into 24 shards that stop at walls. |
| Double barrel | Two parallel bullets per shot, 5 shots. |
| Shotgun | 14 short-range pellets in a spread, 3 shots. |
| Mines | 3 mines. Each arms after 2 s, fades almost out of sight, and bursts into shrapnel when a tank drives over it. |
| Shield | 6 s. Bounces incoming shots; shots fired from inside the shield can still hit you. |

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
