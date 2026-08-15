# Study Buddy API

Base URL: `http://<host>:<port>` (default port `3000`, see `PORT` env var).

All request/response bodies are JSON unless noted otherwise. Send `Content-Type: application/json` on requests with a body.

## Authentication

Session-based auth via `express-session`. On successful `/login` or `/signup`, the server sets a `connect.sid` session cookie (httpOnly). Send it with subsequent requests (`credentials: "include"` in `fetch`) to access `/me` or stay logged in. `/logout` destroys the session.

---

## `GET /`

Health/liveness check. No auth required.

**Request**

| Body | Query |
|---|---|
| none | none |

**Success response**

| Status | Body |
|---|---|
| 200 | `hello world` (plain text, not JSON) |

**Error responses**

None — this route has no failure branches.

---

## `POST /signup`

Creates a new user account. No auth required.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | yes | Must be unique (DB constraint). No format/length check in code. |
| `email` | string | yes | Must be unique (DB constraint). No format validation in code — any non-empty string is accepted. |
| `password` | string | yes | Hashed with bcrypt (10 salt rounds). No length/strength check in code. |
| `role` | string | yes | Must be `"student"` or `"professor"`. |

**Success response**

`200 OK` — returns the created user's `id`, `username`, `email`, and `role` (no password/hash):

```json
{
  "id": 1,
  "username": "alice",
  "email": "alice@example.com",
  "role": "student"
}
```

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 400 | One or more of `username`, `email`, `password` is missing/falsy | `{ "error": "missing fields" }` |
| 400 | `role` is not `"student"` or `"professor"` | `{ "error": "role must be 'student' or 'professor'" }` |
| 400 | Database insert failed (e.g. `username` or `email` already taken, violating the `UNIQUE` constraint) | `{ "error": "could not create user" }` |
| 500 | `bcrypt.hash` failed | `{ "error": "something went wrong" }` |

---

## `POST /login`

Logs in with username/password. No auth required. On success, sets a session cookie.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `username` | string | yes | |
| `password` | string | yes | Compared against the stored bcrypt hash. |

**Success response**

`200 OK` — sets `connect.sid` cookie, returns the user's `id`, `username`, `email`, `role`:

```json
{
  "id": 1,
  "username": "alice",
  "email": "alice@example.com",
  "role": "student"
}
```

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 400 | `username` or `password` missing/falsy | `{ "error": "missing fields" }` |
| 401 | No user with that username, or password doesn't match | `{ "error": "invalid username or password" }` |
| 500 | Database or bcrypt error | `{ "error": "something went wrong" }` |

---

## `POST /logout`

Destroys the current session. No auth required (no-op if not logged in beyond clearing the cookie).

**Success response**

`200 OK` — `{ "ok": true }`

---

## `GET /me`

Returns the currently logged-in user based on the session cookie.

**Success response**

`200 OK`:

```json
{
  "id": 1,
  "username": "alice",
  "email": "alice@example.com",
  "role": "student"
}
```

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 401 | No valid session | `{ "error": "not logged in" }` |

---

## Games

A game is a live, host-paced multiple-choice round — modeled on Kahoot. A professor starts one from a study set, students join with a code, and everyone answers the same question at once by picking one of up to 4 choices. `games.status` moves `waiting` → `active` → `finished`. `current_term_index` (and the current question/choices) are shared by the whole game, not per-player — but unlike a fully automatic quiz, **the professor manually advances to the next question** by calling `POST /games/:id/next`; the server never advances on its own. This means a student who never answers can't stall the game, and the professor decides how long to leave a question open.

Classrooms, study sets, and assignments endpoints exist in `server.js` but aren't documented here yet.

### `POST /games`

Professor creates a game from one of their own study sets. Requires `professor` role. The set must have at least 2 terms — multiple choice needs at least one other term to draw a wrong answer from.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `set_id` | integer | yes | Must be a study set owned by the calling professor, with ≥ 2 terms. |

**Success response**

`200 OK`:

```json
{
  "id": 1,
  "set_id": 4,
  "join_code": "A1B2C3D4",
  "status": "waiting",
  "current_term_index": 0,
  "created_at": "2026-08-11T12:00:00.000Z"
}
```

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 400 | `set_id` missing | `{ "error": "missing fields" }` |
| 404 | No study set with that id owned by this professor | `{ "error": "study set not found" }` |
| 400 | Set has fewer than 2 terms | `{ "error": "study set needs at least 2 terms to play as a game" }` |
| 400 | Insert failed | `{ "error": "could not create game" }` |
| 500 | Database error | `{ "error": "something went wrong" }` |

---

### `POST /games/join`

Student joins a game by code. Requires `student` role. Only allowed while the game is `waiting` — once a professor starts the game, joining is rejected.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `code` | string | yes | Case-insensitive; matched uppercased against `join_code`. |

**Success response**

`200 OK` — returns the game's `id` and `status`:

```json
{ "id": 1, "status": "waiting" }
```

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 400 | `code` missing | `{ "error": "missing fields" }` |
| 404 | No game with that join code | `{ "error": "invalid join code" }` |
| 400 | Game is not in `waiting` status | `{ "error": "game has already started" }` |
| 400 | Already joined (unique constraint) | `{ "error": "already joined this game" }` |
| 500 | Database error | `{ "error": "something went wrong" }` |

---

### `GET /games/:id`

Professor's host view of a game — polled to show player count, the live question, a per-choice tally, and how many have answered so far. Requires `professor` role and ownership.

**Success response**

`200 OK`:

```json
{
  "id": 1,
  "set_id": 4,
  "join_code": "A1B2C3D4",
  "status": "active",
  "current_term_index": 1,
  "created_at": "2026-08-11T12:00:00.000Z",
  "total_terms": 2,
  "player_count": 2,
  "current_term": { "id": 9, "term": "capital of japan" },
  "choices": [
    { "term_id": 9, "definition": "tokyo" },
    { "term_id": 7, "definition": "paris" }
  ],
  "answered_count": 1,
  "correct_count": 1
}
```

`current_term`, `choices`, `answered_count`, and `correct_count` are only meaningful while `status` is `active`; while `waiting` or `finished`, `current_term`/`choices` are `null` and the counts are `0`.

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 404 | No game with that id owned by this professor | `{ "error": "game not found" }` |
| 500 | Database error | `{ "error": "something went wrong" }` |

---

### `POST /games/:id/start`

Professor starts their own game: sets `status` to `active`, `current_term_index` to `0`, and generates the multiple-choice options for the first question. Requires `professor` role and ownership of the game.

**Success response**

`200 OK` — the updated game row (same shape as `POST /games`, with `status: "active"`).

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 404 | No game with that id owned by this professor | `{ "error": "game not found" }` |
| 400 | Game is not `waiting` (already started/finished) | `{ "error": "game has already started" }` |
| 500 | Database error | `{ "error": "something went wrong" }` |

---

### `POST /games/:id/next`

Professor manually advances the game to the next question — generating new multiple-choice options — or marks it `finished` if the current question was the last one. This is the *only* way a game advances; there's no auto-advance, so it's safe to call even if not every player has answered yet. Requires `professor` role and ownership of the game.

**Success response**

`200 OK` — the updated game row (same shape as `POST /games/:id/start`; `status` is `"active"` with an incremented `current_term_index`, or `"finished"` if that was the last term).

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 404 | No game with that id owned by this professor | `{ "error": "game not found" }` |
| 400 | Game is not `active` | `{ "error": "game is not active" }` |
| 500 | Database error | `{ "error": "something went wrong" }` |

---

### `POST /games/:id/answer`

Student picks one of the current question's multiple-choice options. Requires `student` role and that the student has joined this game. Runs in a DB transaction with a row lock on the game so a concurrent `POST /games/:id/next` from the professor can't race a student's submission into an inconsistent state.

The client must send back the `term_id` of the question it believes is current (from `GET /games/:id/state`) as a guard: if the professor has already called `/next` in the meantime, the server rejects the stale submission instead of silently scoring it against the wrong question.

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `term_id` | integer | yes | The `id` of the question (term) being answered — must match the game's current question. |
| `selected_term_id` | integer | yes | The `term_id` of the chosen option, from the `choices` array in `GET /games/:id/state`. Correct iff it equals `term_id`. |

**Scoring**

- Correct: `100` base points + a streak bonus of `20` per consecutive correct answer beyond the first, capped at `+100` (so a streak of 6+ caps at 200 total for that answer).
- Incorrect: `0` points, streak resets to `0`.

**Success response**

`200 OK`:

```json
{
  "correct": true,
  "correct_term_id": 9,
  "points_awarded": 120,
  "score": 220,
  "streak": 2
}
```

`correct_term_id` is always returned (even on a wrong answer) so the client can highlight which of the displayed choices was actually correct.

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 400 | `term_id` or `selected_term_id` missing | `{ "error": "missing fields" }` |
| 404 | No such game | `{ "error": "game not found" }` |
| 400 | Game is not `active` | `{ "error": "game is not active" }` |
| 403 | Caller hasn't joined this game | `{ "error": "you have not joined this game" }` |
| 409 | Submitted `term_id` doesn't match the game's current question (professor already advanced) | `{ "error": "the question has changed, please refresh" }` |
| 409 | Already answered this question (unique constraint) | `{ "error": "already answered this question" }` |
| 500 | Database error | `{ "error": "something went wrong" }` |

---

### `GET /games/:id/state`

Per-viewer live game state, meant to be polled. A professor sees their own game (must own it); a student sees it only if they've joined.

**Success response** — `200 OK`, shape depends on status:

While `waiting`:

```json
{ "id": 1, "status": "waiting", "score": 0, "streak": 0 }
```

(`score`/`streak` are omitted for the professor's own view.)

While `active` or `finished`:

```json
{
  "id": 1,
  "status": "active",
  "current_term_index": 1,
  "total_terms": 2,
  "current_term": { "id": 9, "term": "capital of japan" },
  "choices": [
    { "term_id": 9, "definition": "tokyo" },
    { "term_id": 7, "definition": "paris" }
  ],
  "score": 100,
  "streak": 1,
  "answered": false,
  "last_answer": null
}
```

- `choices` never marks which option is correct — the client only learns that from `POST /games/:id/answer`'s response (or from `last_answer` below, after answering).
- For a student who has already answered the current question, `answered` is `true` and `last_answer` is `{ "selected_term_id": 7, "correct_term_id": 9, "is_correct": false }`, so a page refresh mid-question still shows the right highlighted state and a repeat submission isn't needed.
- While `status` is `finished`, `current_term` and `choices` are `null`.

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 404 | No such game | `{ "error": "game not found" }` |
| 403 | Professor doesn't own the game, or student hasn't joined it | `{ "error": "not authorized for this game" }` |
| 500 | Database error | `{ "error": "something went wrong" }` |

---

### `GET /games/:id/leaderboard`

Ranked scores for a game. Accessible to the professor who owns the game, or any student who has joined it.

**Success response**

`200 OK`:

```json
{
  "game_id": 1,
  "status": "finished",
  "players": [
    { "rank": 1, "username": "alice", "score": 220, "streak": 2 },
    { "rank": 2, "username": "bob", "score": 100, "streak": 1 }
  ]
}
```

Ranked by `score` descending, ties broken by join order.

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 404 | No such game | `{ "error": "game not found" }` |
| 403 | Caller neither owns nor has joined the game | `{ "error": "not authorized for this game" }` |
| 500 | Database error | `{ "error": "something went wrong" }` |
