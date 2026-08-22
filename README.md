# Study Buddy

Flashcard/quiz app with a class-wide struggle heatmap. CS375 group
project.

## Live deployment

Backend: https://study-buddy-backend-g74y.onrender.com

(Free tier — spins down after inactivity, so the first request after a
while can take ~30-60s to wake up.)

## What you need installed before starting

- **Node.js** (v20+) — https://nodejs.org
- **Git**
- **PostgreSQL 18** — https://www.postgresql.org/download/
  (needed for local development; make sure `psql` works from your
  terminal after installing — on Windows this usually means adding
  `C:\Program Files\PostgreSQL\18\bin` to your PATH)
- **Render account** (only needed if you're doing deployment work) —
  the app deploys from `render.yaml` at the repo root; no CLI install
  needed, deploys happen through the Render dashboard.

## Setup (do this after cloning)

1. Clone the repo:
```
   git clone https://github.com/charlestran2006/study-buddy.git
   cd study-buddy/backend
```

2. Install dependencies:
```
   npm install
```

3. Create a `.env` file in the `backend` folder (this is never
   committed to git — ask a teammate on Discord for the shared values
   if you don't have your own local Postgres set up yet):
```
   DATABASE_URL=postgres://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/studybuddy
   SESSION_SECRET=any-random-string-works-locally
   PORT=3000
```

4. Set up your local database:
```
   psql -U postgres
```
```sql
   CREATE DATABASE studybuddy;
   \c studybuddy
```
   Then exit (`\q`) and load the schema:
```
   psql -U postgres -d studybuddy -f schema.sql
```

5. Run the server:
```
   node server.js
```
   You should see `http://0.0.0.0:3000` printed. Visit
   `http://localhost:3000` in your browser to confirm it's working.

## Testing an endpoint

From Git Bash (not PowerShell — PowerShell's `curl` behaves
differently and will error):
```
curl -X POST -H "Content-Type: application/json" -d '{"username":"test","email":"test@test.com","password":"test123"}' http://localhost:3000/signup
```

## Project structure

```
study-buddy/
├── render.yaml            — Render deployment blueprint (web service + Postgres)
└── backend/
    ├── server.js          — HTTP server entry point, wires up WebSocket upgrade
    ├── app.js             — Express app, session middleware, route mounting
    ├── game.js            — live-game WebSocket logic
    ├── db.js              — Postgres pool
    ├── routes/            — REST route handlers (auth, sets, classrooms, games, assignments, study)
    ├── middleware/         — auth middleware (requireAuth, requireProfessor, requireStudent)
    ├── public/            — static frontend (HTML/CSS/JS)
    ├── schema.sql         — database table definitions
    ├── migrations/        — incremental schema changes (already folded into schema.sql)
    ├── Dockerfile         — used for both Render and Fly deployment
    ├── fly.toml           — Fly.io deployment config (legacy, not the current live deploy)
    ├── .env.example       — template for your local .env
    └── package.json
```

## Deployment

Deployment is handled through Render, via the `render.yaml` blueprint
at the repo root. Pushing to `main` on GitHub auto-redeploys the live
service (`study-buddy-backend`) through Render's Blueprint sync — no
manual deploy step needed in the common case. If auto-deploy doesn't
pick up a push, trigger it manually from the service's page in the
Render dashboard ("Manual Deploy" → "Deploy latest commit").

A `fly.toml` still exists from an earlier deployment on Fly.io, but
Render is the current live deployment.

## Database

Tables: `users`, `sets`, `terms`, `progress`, `favorites`,
`classrooms`, `classroom_students`, `assignments`, `games`,
`game_players`, `game_answers`. Full definitions in `schema.sql`.

## API endpoints

See `backend/API.md` for the full endpoint reference (auth, sets,
classrooms, assignments, live games, study/heatmap).
