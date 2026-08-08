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
