Live deployment

Backend: https://backend-polished-reed-1119.fly.dev

What you need installed before starting
Node.js (v20+) — https://nodejs.org
Git
PostgreSQL 18 — https://www.postgresql.org/download/ (needed for local development; make sure psql works from your terminal after installing — on Windows this usually means adding C:\Program Files\PostgreSQL\18\bin to your PATH)
flyctl (only needed if you're doing deployment work) — install with:
Windows (PowerShell): irm https://fly.io/install.ps1 | iex
Mac/Linux: curl -L https://fly.io/install.sh | sh
Setup (do this after cloning)
Clone the repo:
   git clone https://github.com/charlestran2006/study-buddy.git
   cd study-buddy/backend
Install dependencies:
   npm install
Create a .env file in the backend folder (this is never committed to git — ask a teammate on Discord for the shared values if you don't have your own local Postgres set up yet):
   DATABASE_URL=postgres://postgres:YOUR_LOCAL_PASSWORD@localhost:5432/studybuddy
   SESSION_SECRET=any-random-string-works-locally
   PORT=3000
Set up your local database:
   psql -U postgres
sql
   CREATE DATABASE studybuddy;
   \c studybuddy

Then exit (\q) and load the schema:

   psql -U postgres -d studybuddy -f schema.sql
Run the server:
   node server.js

You should see http://0.0.0.0:3000 printed. Visit http://localhost:3000 in your browser to confirm it's working.

Testing an endpoint

From Git Bash (not PowerShell — PowerShell's curl behaves differently and will error):

curl -X POST -H "Content-Type: application/json" -d '{"username":"test","email":"test@test.com","password":"test123"}' http://localhost:3000/signup
Project structure
study-buddy/
└── backend/
    ├── server.js       — main Express app
    ├── schema.sql       — database table definitions
    ├── Dockerfile        — used for fly.io deployment only
    ├── fly.toml          — fly.io deployment config
    ├── .env.example      — template for your local .env
    └── package.json
Deployment

Deployment is handled through fly.io. If you need to redeploy:

flyctl deploy -a backend-polished-reed-1119

Only ask for deployment access if you're actually working on deployment — most day-to-day work just needs local setup above.

Database

5 tables: users, sets, terms, progress, favorites. Full definitions in schema.sql.

API endpoints (so far)
POST /signup — create an account
More endpoints will be added here as they're built.