# Campus Motion — Roles & Permissions Reference

This document defines every role in the system, what each can do,
and the hard limits that cannot be overridden at the application level.

---

## Overview: Two Layers of Roles

Campus Motion has **two independent role systems** that work together:

| Layer                   | Where it lives      | Controls                                      |
| ----------------------- | ------------------- | --------------------------------------------- |
| **PostgreSQL DB roles** | Database            | Which tables/rows a connection can touch      |
| **Application roles**   | `users.role` column | Which API endpoints a logged-in user can call |

A request passes through **both** layers. Passing one does not bypass the other.

---

## Layer 1 — PostgreSQL Database Roles

These are the actual database users used by the API server to connect to PostgreSQL.
They are defined in `schema_v4.sql` and cannot be changed at runtime.

The design principle is: **GRANT is the outer wall, RLS is the inner filter.**
A role can only read rows from a table if (1) it has GRANT permission on that table,
AND (2) the RLS policy for that row evaluates to true.

```
Incoming query
      │
      ▼
Does the role have GRANT on this table?
      │
      ├── NO  →  Permission denied (stopped here, RLS never runs)
      │
      └── YES → Does the RLS policy allow this row?
                      │
                      ├── NO  → Row is invisible (filtered silently)
                      └── YES →  Row returned
```

---

### `auth_role`

Used exclusively by the authentication service (register / login).

| Permission                       | Tables          |
| -------------------------------- | --------------- |
| `SELECT`                         | `users`         |
| `SELECT, INSERT, UPDATE, DELETE` | `user_secret`   |
| No access                        | Everything else |

**Why so limited:** This role only needs to check passwords and create accounts.
It deliberately cannot read activities, health data, or any other user content.
Isolation ensures a bug in the auth service cannot leak application data.

---

### `api_role`

Used by all authenticated API endpoints (activities, events, news, health data, social features).

| Permission                       | Tables                                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SELECT, INSERT, UPDATE, DELETE` | `locations`, `users`, `health_data`, `events`, `event_participants`, `activities`, `activity_waypoints`, `news`, `comments`, `likes`, `user_follows`, `notifications` |
| No access                        | `user_secret`, `audit_log`                                                                                                                                            |

**Row-Level Security (RLS) further restricts this role at query time:**

| Table           | RLS Rule                                                                                   |
| --------------- | ------------------------------------------------------------------------------------------ |
| `activities`    | SELECT: own rows + rows where `is_public = TRUE`. INSERT / UPDATE / DELETE: own rows only. |
| `health_data`   | All operations: own row only (matched by `app.current_user_id` session variable).          |
| `notifications` | All operations: own rows only.                                                             |

`api_role` has broad table GRANTs, but RLS ensures every query is automatically
scoped to the requesting user. No application-level filter is needed — the DB enforces it.

---

### `admin_role`

Used exclusively by admin API endpoints (`/admin/*`).

| Permission                       | Tables                                                                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SELECT, INSERT, UPDATE, DELETE` | `locations`, `users`, `events`, `event_participants`, `activities`, `activity_waypoints`, `news`, `comments`, `likes`, `user_follows`, `notifications`, `audit_log` |
| `SELECT` only                    | `user_secret` (read-only, for account investigation)                                                                                                                |
| No access                        | `health_data`                                                                                                                                                       |

**Special attribute:** `BYPASSRLS`

This allows `admin_role` to see all rows in tables where it has GRANT permission,
bypassing the RLS user-scoping filters. This is how an admin can list all users'
activities or all notifications for moderation.

`BYPASSRLS` has **no effect** on `health_data` because `admin_role` has no GRANT
on that table. The permission wall stops the query before RLS even evaluates.

---

## Health Data — Absolute Protection

`health_data` is the most sensitive table in the system. It stores
E2EE ciphertext of biometric information and is governed by Swiss LDP/RGPD.

Two independent mechanisms protect it:

1. **GRANT wall:** Only `api_role` has access — `admin_role` and `auth_role` do not.
2. **RLS policy:** Even `api_role` can only see the row where `user_id` matches the
   authenticated user's ID, set via `app.current_user_id` at the start of each transaction.

| Who                                    | Can access health_data? | Mechanism                     |
| -------------------------------------- | ----------------------- | ----------------------------- |
| Data owner (authenticated user)        | YES Own row only        | GRANT (api_role) + RLS match  |
| Other authenticated users              | NO                      | RLS blocks foreign rows       |
| `admin_role`                           | NO                      | No GRANT — stopped before RLS |
| `auth_role`                            | NO                      | No GRANT — stopped before RLS |
| PostgreSQL `admin` superuser (VM only) | YES Raw DB access       | Never used by the API         |

**Even with DB access, health content is unreadable.**
`sensitive_data` is a Base64 ciphertext. The decryption key never leaves the
user's device — the server stores only the encrypted blob and cannot invert it.

---

## Layer 2 — Application Roles

These are stored in `users.role` and checked by NestJS guards at the HTTP layer.
They determine which API endpoints a logged-in user can call.

---

### `user` (default)

Every new account starts as `user`. Can only manage their own content.

**Can:**

- Register and log in
- View and update their own profile, upload a profile photo
- Create, read, update, and delete their own activities
- Add GPS waypoints to their own activities
- Read all public activities (RLS enforces this at DB level)
- Read all published news and events (public, no JWT needed)
- Join and leave events
- Post and delete their own comments
- Like and unlike news and activities
- Follow and unfollow other users
- Read and manage their own notifications
- Read and write their own health data (E2EE)
- Request deletion of their own account or health data (RGPD)

**Cannot:**

- Read another user's private activities or health data
- Create events or news
- Access any `/admin/*` endpoint
- Change any user's role

---

### `moderator`

Elevated trust role, typically assigned to EPFL staff or sports coordinators.
Inherits everything `user` can do, plus:

**Additionally can:**

- Create and update events (`POST /events`, `PUT /events/:id`)
- Create, update, and publish news articles (`POST /news`, `PUT /news/:id`)
- Upload cover photos for news articles (`POST /news/:id/photo`)
- Delete any comment for moderation purposes

**Still cannot:**

- Access `/admin/users` (user list and role management)
- Delete events or news articles
- Access audit logs
- Read any other user's private activities or health data

---

### `admin`

Highest application role. Reserved for the project owner and designated lab contact.
Inherits everything `moderator` can do, plus:

**Additionally can:**

- List all users with their roles (`GET /admin/users`)
- Promote or demote any user's role (`PATCH /admin/users/:id/role`)
- Hard-delete any user account and all their data (`DELETE /admin/users/:id`)
- Delete any event or news article
- Remove any activity for moderation
- Read the full audit log (`GET /admin/audit`)
- See all activities and notifications from all users (via `BYPASSRLS` on `admin_role`)

**Hard limits — admin CANNOT, by design:**

- Read or write any user's `health_data` — no DB GRANT exists, `BYPASSRLS` is irrelevant
- Decrypt health content — E2EE key never reaches the server
- Read plaintext passwords — `user_secret` contains only Argon2 hashes
- Demote another `admin` — safety guard enforced in application code
- Execute arbitrary SQL or access PostgreSQL system tables
- Access Docker, the VM filesystem, or any infrastructure beyond the API

---

## Role Assignment Flow

```
New account registered
        │
        ▼
  role = 'user'   (default, hardcoded in INSERT)
        │
        ├── Promoted by admin → 'moderator'
        │
        └── Promoted by admin → 'admin'
```

Role changes are written to `audit_log` automatically with the acting admin's
`user_id`, timestamp, and IP address. Role escalation cannot be self-initiated.

---

## Security Properties Summary

| Property                                      | Mechanism                                  | Cannot be bypassed by         |
| --------------------------------------------- | ------------------------------------------ | ----------------------------- |
| Users see only own private activities         | RLS on `api_role`                          | Application code bugs         |
| Users see only own notifications              | RLS on `api_role`                          | Application code bugs         |
| Users see only own health data                | RLS on `api_role`                          | Application code bugs         |
| Admin sees all activities/notifications       | `BYPASSRLS` on `admin_role`                | —                             |
| Admin cannot read health data                 | No GRANT on `health_data` for `admin_role` | `BYPASSRLS`, application code |
| Health content unreadable even with DB access | E2EE, key never leaves client              | Server, DB, admin, attacker   |
| Passwords never exposed                       | Argon2 hash only, `user_secret` isolated   | All API roles                 |
| All privileged actions traceable              | `audit_log` table                          | —                             |

---

## DB Role to NestJS Connection Mapping

| DB Role      | NestJS injection token | Used by                                               |
| ------------ | ---------------------- | ----------------------------------------------------- |
| `auth_role`  | `'AUTH_DB'`            | `AuthService` (register, login)                       |
| `api_role`   | `'API_DB'`             | All other services (activities, events, health, etc.) |
| `admin_role` | `'ADMIN_DB'`           | `AdminService` only                                   |

---

## Operational Guide

**Promote to moderator (via API, requires admin JWT):**

```bash
curl.exe -X PATCH http://localhost:3000/admin/users/3/role \
  -H "Authorization: Bearer ADMIN_JWT" \
  -H "Content-Type: application/json" \
  -d '{"role": "moderator"}'
```

**Create your first admin account:**

```bash
# 1. Register via API normally
curl.exe -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "flavien", "email": "flavien@epfl.ch", "password": "yourpassword"}'

# 2. Promote directly in DB (only needed once, before any admin exists)
docker exec -it campus_motion_db psql -U admin -d campus_motion
UPDATE users SET role = 'admin' WHERE email = 'flavien@epfl.ch';
```

**Revoke VM SSH access for a team member:**

```bash
# On the EPFL VM — remove their line from authorized_keys
nano ~/.ssh/authorized_keys
```

---

_Last updated: April 2026 — Campus Motion v1.2_
