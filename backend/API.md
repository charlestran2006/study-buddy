# Study Buddy API

Base URL: `http://<host>:<port>` (default port `3000`, see `PORT` env var).

All request/response bodies are JSON unless noted otherwise. Send `Content-Type: application/json` on requests with a body.

## Authentication

No authentication is implemented yet — there is no login route, no session middleware, and no route currently checks for a session. Once session-based auth is added, protected routes will require a valid session cookie to be sent with the request, and will respond `401 Unauthorized` if it is missing or invalid. This section will be updated with the specific cookie name and login flow once that code exists.

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

**Success response**

`200 OK` — returns the created user's `id`, `username`, and `email` (no password/hash):

```json
{
  "id": 1,
  "username": "alice",
  "email": "alice@example.com"
}
```

**Error responses**

| Status | Condition | Body |
|---|---|---|
| 400 | One or more of `username`, `email`, `password` is missing/falsy | `{ "error": "missing fields" }` |
| 400 | Database insert failed (e.g. `username` or `email` already taken, violating the `UNIQUE` constraint) | `{ "error": "could not create user" }` |
| 500 | `bcrypt.hash` failed | `{ "error": "something went wrong" }` |
