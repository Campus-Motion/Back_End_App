# Campus Motion — REST API Documentation

**Base URL:** `https://<your-server>/api/v1/CampusMotion`  
**Format:** All requests and responses use `application/json`  
**Auth:** Protected routes require a Bearer JWT in the `Authorization` header

---

## Authentication

### Roles

| Role        | Description                                          |
| ----------- | ---------------------------------------------------- |
| `user`      | Default role, can manage own data                    |
| `moderator` | Can create events and post news                      |
| `admin`     | Full access including user management and moderation |

### JWT Usage

Include the token returned from `/auth/login` in every protected request:

```
Authorization: Bearer <access_token>
```

---

## Query Parameters

All list endpoints support the following optional query parameters for pagination and filtering.  
Example: `GET /events?limit=5&after=2026-04-01T00:00:00Z`

| Parameter | Type      | Default | Description                                                                 |
| --------- | --------- | ------- | --------------------------------------------------------------------------- |
| `limit`   | `integer` | `20`    | Max number of results to return (max: `100`)                                |
| `offset`  | `integer` | `0`     | Number of results to skip (for page-based pagination)                       |
| `cursor`  | `integer` | —       | ID of the last item seen (for cursor-based pagination, preferred for feeds) |
| `after`   | `ISO8601` | —       | Filter results after this timestamp                                         |
| `before`  | `ISO8601` | —       | Filter results before this timestamp                                        |
| `type`    | `string`  | —       | Filter by type (activities only: `run`, `walk`, etc.)                       |
| `public`  | `boolean` | —       | Filter by `is_public` (activities only)                                     |

### Pagination response envelope

All paginated endpoints wrap their data in a standard envelope:

```json
{
  "data": [ ...items ],
  "meta": {
    "total": 42,
    "limit": 20,
    "offset": 0,
    "has_more": true,
    "next_cursor": 17
  }
}
```

---

## Endpoints

### Auth

#### `POST /auth/register`

Create a new user account.

- **Access:** Public
- **Body:**

```json
{
  "username": "flavien",
  "email": "flavien@epfl.ch",
  "password": "securepassword123"
}
```

- **Returns:** `201`

```json
{ "message": "User registered successfully", "userId": 5 }
```

- **Errors:** `409` if email already exists

---

#### `POST /auth/login`

Authenticate and receive a JWT.

- **Access:** Public
- **Body:**

```json
{ "email": "flavien@epfl.ch", "password": "securepassword123" }
```

- **Returns:** `200`

```json
{ "access_token": "eyJhbGci..." }
```

- **Errors:** `401` if credentials are invalid

---

### Users

#### `GET /users/me`

Get the currently authenticated user's profile.

- **Access:** Authenticated
- **Returns:** `200`

```json
{
  "id": 5,
  "username": "flavien",
  "email": "flavien@epfl.ch",
  "photo_url": "/uploads/profiles/a3f8c2d1-9b4e-4f2a-b1c2.jpg",
  "role": "user",
  "created_at": "2026-03-26T10:00:00Z"
}
```

---

#### `GET /users/:id`

Get a public user profile.

- **Access:** Authenticated
- **Returns:** `200` — public fields only (no email, no health data)

```json
{
  "id": 2,
  "username": "alice",
  "photo_url": "/uploads/profiles/uuid.jpg",
  "role": "moderator",
  "created_at": "2026-01-01T00:00:00Z"
}
```

---

#### `PUT /users/me`

Update the current user's profile.

- **Access:** Authenticated (own profile only)
- **Body (all fields optional):**

```json
{ "username": "flavien_v2", "email": "new@epfl.ch" }
```

- **Returns:** `200` — updated user object

---

#### `POST /users/me/photo`

Upload a profile picture.

- **Access:** Authenticated
- **Content-Type:** `multipart/form-data`
- **Body:** form field `photo` containing the image file (JPEG, PNG, WebP — max 5MB)
- **Returns:** `200`

```json
{ "photo_url": "/uploads/profiles/a3f8c2d1-9b4e-4f2a-b1c2.jpg" }
```

---

#### `DELETE /users/me`

Request account deletion (RGPD right to erasure). Sets `deletion_requested_at` — does not hard-delete immediately.

- **Access:** Authenticated (own account only)
- **Returns:** `200`

```json
{ "message": "Deletion request registered" }
```

---

### Admin

All endpoints in this section require `admin` role. A `403` is returned for any other role.

---

#### `GET /admin/users`

List all users with their roles.

- **Access:** `admin` only
- **Query params:** `limit`, `offset`, `role` (filter by role)
- **Returns:** `200` — paginated user list with roles and account status

```json
{
  "data": [
    {
      "id": 1,
      "username": "alice",
      "email": "alice@epfl.ch",
      "role": "admin",
      "created_at": "..."
    },
    {
      "id": 2,
      "username": "bob",
      "email": "bob@epfl.ch",
      "role": "moderator",
      "created_at": "..."
    }
  ],
  "meta": { "total": 12, "limit": 20, "offset": 0, "has_more": false }
}
```

---

#### `PATCH /admin/users/:id/role`

Promote or demote a user's role.

- **Access:** `admin` only
- **Body:**

```json
{ "role": "moderator" }
```

- **Allowed values:** `"user"` `"moderator"` `"admin"`
- **Returns:** `200`

```json
{ "id": 3, "username": "candice", "role": "moderator" }
```

- **Errors:** `403` if trying to demote another `admin` (safety guard), `404` if user not found

---

#### `DELETE /admin/users/:id`

Hard-delete a user account and all associated data.

- **Access:** `admin` only
- **Returns:** `200`

```json
{ "message": "User deleted" }
```

- **Note:** Cascades to activities, health data, comments, likes (enforced by DB `ON DELETE CASCADE`)

---

#### `DELETE /admin/comments/:id`

Remove any comment regardless of author (moderation).

- **Access:** `admin` or `moderator`
- **Returns:** `200`

---

#### `DELETE /admin/activities/:id`

Remove any activity regardless of owner (moderation).

- **Access:** `admin` only
- **Returns:** `200`

---

#### `GET /admin/audit`

View the audit log of all sensitive actions.

- **Access:** `admin` only
- **Query params:** `limit`, `offset`, `after`, `before`, `user_id`
- **Returns:** `200`

```json
{
  "data": [
    {
      "id": 1,
      "user_id": 3,
      "action": "DELETE",
      "target_table": "health_data",
      "target_id": 2,
      "performed_at": "2026-04-01T10:00:00Z",
      "ip_address": "128.178.0.1"
    }
  ],
  "meta": { "total": 240, "limit": 20, "offset": 0, "has_more": true }
}
```

---

### Activities

#### `GET /activities`

Get activities visible to the current user (own + public).

- **Access:** Authenticated
- **RLS:** PostgreSQL automatically filters — returns own rows + rows where `is_public = true`
- **Query params:** `limit`, `cursor`, `type`, `public`
- **Returns:** `200`

```json
{
  "data": [
    {
      "id": 1,
      "title": "Morning Run",
      "type": "run",
      "user_id": 5,
      "is_public": true,
      "created_at": "2026-03-26T08:00:00Z",
      "duration": null,
      "body": null
    }
  ],
  "meta": { "total": 8, "limit": 20, "offset": 0, "has_more": false }
}
```

---

#### `GET /activities/:id`

Get a single activity.

- **Access:** Authenticated (owner, or public activity)
- **Returns:** `200` — activity object
- **Errors:** `404` if not found or not accessible

---

#### `POST /activities`

Create a new activity for the current user.

- **Access:** Authenticated
- **Body:**

```json
{
  "title": "Evening Hike",
  "type": "hike",
  "body": "Great trail near Lausanne",
  "is_public": true,
  "event_id": null
}
```

- **Types available:** `run` `walk` `cycle` `hike` `swim` `climbing` `other`
- **Returns:** `201` — created activity object

---

#### `PUT /activities/:id`

Update an existing activity.

- **Access:** Authenticated (owner only, enforced by RLS)
- **Body (all fields optional):**

```json
{ "title": "Updated title", "is_public": false }
```

- **Returns:** `200` — updated activity object
- **Errors:** `403` if not owner

---

#### `DELETE /activities/:id`

Delete an activity.

- **Access:** Authenticated (owner only, enforced by RLS)
- **Returns:** `200`

```json
{ "message": "Activity deleted" }
```

---

### Activity Waypoints

#### `POST /activities/:id/waypoints`

Add GPS waypoints to an activity (route tracking).

- **Access:** Authenticated (owner only)
- **Body:**

```json
{
  "waypoints": [
    {
      "latitude": 46.5197,
      "longitude": 6.6323,
      "recorded_at": "2026-03-26T08:01:00Z",
      "sequence_order": 1
    },
    {
      "latitude": 46.52,
      "longitude": 6.633,
      "recorded_at": "2026-03-26T08:02:00Z",
      "sequence_order": 2
    }
  ]
}
```

- **Returns:** `201`

---

#### `GET /activities/:id/waypoints`

Get the GPS route of an activity.

- **Access:** Authenticated (owner, or public activity)
- **Returns:** `200` — ordered array of waypoints

---

### Events

#### `GET /events`

Get upcoming events.

- **Access:** Public (no JWT required)
- **Query params:** `limit`, `offset`, `after`, `before`
- **Example:** `GET /events?limit=5` — fetch only the next 5 events
- **Returns:** `200`

```json
{
  "data": [
    {
      "id": 1,
      "title": "Spring 5K",
      "body": "Come join us for a beautiful sunrise run.",
      "start_time": "2026-04-15T09:00:00Z",
      "end_time": "2026-04-15T11:00:00Z",
      "distance_m": 5000,
      "participant_count": 14,
      "created_at": "2026-03-01T00:00:00Z"
    }
  ],
  "meta": { "total": 4, "limit": 5, "offset": 0, "has_more": false }
}
```

---

#### `GET /events/:id`

Get a single event with full participant list.

- **Access:** Public
- **Returns:** `200` — event object + participants array

---

#### `POST /events`

Create a new event.

- **Access:** `admin` or `moderator` role
- **Body:**

```json
{
  "title": "Campus 10K",
  "body": "Annual spring race across campus.",
  "start_time": "2026-05-01T09:00:00Z",
  "end_time": "2026-05-01T11:00:00Z",
  "distance_m": 10000,
  "start_location_id": 1,
  "end_location_id": 2
}
```

- **Returns:** `201` — created event object

---

#### `PUT /events/:id`

Update an event.

- **Access:** `admin` or `moderator` (creator only)
- **Body (all fields optional):**

```json
{ "title": "Campus 10K – Updated Route", "distance_m": 10500 }
```

- **Returns:** `200`

---

#### `DELETE /events/:id`

Delete an event.

- **Access:** `admin` only
- **Returns:** `200`

---

#### `POST /events/:id/participants`

Join an event as the current user.

- **Access:** Authenticated
- **Returns:** `201`

```json
{ "message": "Joined event successfully", "joined_at": "2026-03-31T15:00:00Z" }
```

- **Errors:** `409` if already joined

---

#### `DELETE /events/:id/participants`

Leave an event.

- **Access:** Authenticated
- **Returns:** `200`

---

#### `GET /events/:id/participants`

List all participants of an event.

- **Access:** Public
- **Query params:** `limit`, `offset`
- **Returns:** `200` — paginated array of user objects (public fields only)

---

### News

#### `GET /news`

Get all published news articles.

- **Access:** Public
- **Query params:** `limit`, `cursor`, `before`
- **Returns:** `200` — paginated array of published articles (`is_published = true` only)

---

#### `GET /news/:id`

Get a single news article with its comments.

- **Access:** Public
- **Returns:** `200` — news object + comments array

---

#### `POST /news`

Create a news article (saved as draft by default).

- **Access:** `admin` or `moderator` role required
- **Body:**

```json
{
  "title": "New trail open",
  "body": "The south campus trail is now open.",
  "photo_url": "/uploads/news/uuid.jpg",
  "is_published": false
}
```

- **Returns:** `201`

---

#### `POST /news/:id/photo`

Upload a cover photo for a news article.

- **Access:** `admin` or `moderator` (author only)
- **Content-Type:** `multipart/form-data`
- **Body:** form field `photo` (JPEG, PNG, WebP — max 10MB)
- **Returns:** `200`

```json
{ "photo_url": "/uploads/news/uuid.jpg" }
```

---

#### `PUT /news/:id`

Update or publish a news article. Setting `is_published: true` automatically sets `published_at` via DB trigger.

- **Access:** `admin` or `moderator` (author only)
- **Returns:** `200`

---

#### `DELETE /news/:id`

Delete a news article and all its comments.

- **Access:** `admin` only
- **Returns:** `200`

---

### Comments

#### `GET /comments`

Get comments for a news article or activity.

- **Access:** Public for news comments; Authenticated for activity comments
- **Query params:** `news_id` OR `activity_id` (required), `limit`, `cursor`
- **Example:** `GET /comments?news_id=1&limit=10`
- **Returns:** `200` — paginated array of comments

---

#### `POST /comments`

Post a comment on a news article or activity. Exactly one of `news_id` or `activity_id` must be provided (enforced by DB CHECK constraint).

- **Access:** Authenticated
- **Body:**

```json
{ "body": "Great run!", "activity_id": 1 }
```

or

```json
{ "body": "Thanks for the update!", "news_id": 2 }
```

- **Returns:** `201`

---

#### `PUT /comments/:id`

Edit a comment.

- **Access:** Authenticated (author only)
- **Body:**

```json
{ "body": "Updated comment text" }
```

- **Returns:** `200`

---

#### `DELETE /comments/:id`

Delete a comment.

- **Access:** Authenticated (author or `admin`/`moderator`)
- **Returns:** `200`

---

### Likes

#### `GET /likes`

Get like counts for a news article or activity.

- **Access:** Public for news; Authenticated for activities
- **Query params:** `news_id` OR `activity_id` (required)
- **Example:** `GET /likes?activity_id=1`
- **Returns:** `200`

```json
{ "count": 12, "liked_by_me": true }
```

---

#### `POST /likes`

Like a news article or activity. Exactly one of `news_id` or `activity_id` must be set.

- **Access:** Authenticated
- **Body:**

```json
{ "activity_id": 1 }
```

- **Returns:** `201`
- **Errors:** `409` if already liked (DB unique constraint)

---

#### `DELETE /likes`

Remove a like.

- **Access:** Authenticated (own like only)
- **Body:**

```json
{ "activity_id": 1 }
```

- **Returns:** `200`

---

### Social — Follows

#### `GET /users/:id/followers`

Get the list of users who follow this user.

- **Access:** Authenticated
- **Query params:** `limit`, `cursor`
- **Returns:** `200` — paginated array of public user profiles

---

#### `GET /users/:id/following`

Get the list of users this user follows.

- **Access:** Authenticated
- **Query params:** `limit`, `cursor`
- **Returns:** `200` — paginated array of public user profiles

---

#### `POST /users/:id/follow`

Follow another user.

- **Access:** Authenticated
- **Returns:** `201`
- **Errors:** `400` if trying to follow yourself (DB CHECK constraint), `409` if already following

---

#### `DELETE /users/:id/follow`

Unfollow a user.

- **Access:** Authenticated
- **Returns:** `200`

---

### Notifications

#### `GET /notifications`

Get all notifications for the current user.

- **Access:** Authenticated (own only, enforced by RLS)
- **Query params:** `limit`, `cursor`, `is_read` (filter by read status)
- **Returns:** `200`

```json
{
  "data": [
    {
      "id": 1,
      "type": "like",
      "message": "Alice liked your activity",
      "is_read": false,
      "ref_id": 1,
      "ref_table": "activities",
      "created_at": "2026-03-31T10:00:00Z"
    }
  ],
  "meta": { "total": 5, "limit": 20, "offset": 0, "has_more": false }
}
```

---

#### `PUT /notifications/:id/read`

Mark a single notification as read.

- **Access:** Authenticated (own only)
- **Returns:** `200`

---

#### `PUT /notifications/read-all`

Mark all notifications as read at once.

- **Access:** Authenticated
- **Returns:** `200`

```json
{ "message": "All notifications marked as read" }
```

---

### Health Data

#### `GET /health`

Get the current user's health data. Sensitive fields are returned as E2EE ciphertext — decryption happens client-side only. The server never sees plaintext health values.

- **Access:** Authenticated (strictly own data, enforced by RLS)
- **Returns:** `200`

```json
{
  "born": "1998-11-05",
  "weight_kg": null,
  "height_cm": null,
  "sensitive_data": "U2FsdGVkX1+Base64CipherText==",
  "client_key_version": 1,
  "consent_given_at": "2026-03-26T10:00:00Z",
  "retain_until": "2028-03-26",
  "deletion_requested_at": null
}
```

---

#### `POST /health`

Create the health data record for the current user (one record per user — enforced by DB unique constraint).

- **Access:** Authenticated
- **Body:**

```json
{
  "born": "1998-11-05",
  "sensitive_data": "U2FsdGVkX1+Base64CipherText==",
  "client_key_version": 1,
  "consent_given_at": "2026-03-31T15:00:00Z",
  "retain_until": "2028-03-31"
}
```

- **Returns:** `201`
- **Errors:** `409` if record already exists

---

#### `PUT /health`

Update health data (e.g. after re-encryption with a new key version).

- **Access:** Authenticated (own only)
- **Body (all fields optional):**

```json
{
  "sensitive_data": "U2FsdGVkX1+NewCipherText==",
  "client_key_version": 2
}
```

- **Returns:** `200`

---

#### `DELETE /health`

Request deletion of health data only (RGPD — separate from full account deletion).

- **Access:** Authenticated (own only)
- **Returns:** `200`

```json
{ "message": "Health data deletion request registered" }
```

---

## Standard Error Responses

| Code  | Meaning                                     |
| ----- | ------------------------------------------- |
| `400` | Bad request — missing or invalid fields     |
| `401` | Unauthorized — missing or invalid JWT       |
| `403` | Forbidden — valid JWT but insufficient role |
| `404` | Resource not found                          |
| `409` | Conflict — duplicate entry                  |
| `422` | Unprocessable — business rule violation     |
| `500` | Internal server error                       |

---

## Security Notes

- Passwords are hashed with **Argon2** and stored in `user_secret`, a table inaccessible to the API role
- Health `sensitive_data` is **E2EE** — the server stores only Base64 ciphertext, never plaintext
- Row-Level Security (RLS) on `activities`, `health_data`, and `notifications` enforces data isolation at the PostgreSQL level — the API cannot bypass it
- All inputs use **parameterized queries** (postgres.js tagged templates) — no SQL injection possible
- JWT expiry: `7d` (configurable via `JWT_SECRET` env variable)
- Role changes are logged to `audit_log` automatically
- The `audit_log` table is inaccessible to the `api_role` — only admins can read it via `/admin/audit`

---

## Changelog

| Version | Date       | Changes                                                                     |
| ------- | ---------- | --------------------------------------------------------------------------- |
| `v1.0`  | 2026-03-26 | Initial release — auth, activities, events, news                            |
| `v1.1`  | 2026-03-31 | Added social features: likes, comments, follows, notifications              |
| `v1.2`  | 2026-04-01 | Added admin endpoints, photo uploads, query parameters, pagination envelope |
