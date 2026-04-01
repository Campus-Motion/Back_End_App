-- =============================================================
-- Fitness Tracking Database — Campus Motion (EPFL DIAS lab)
-- Generated from dataDiagramv1.txt
-- PostgreSQL compatible
-- =============================================================

-- ─────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────
CREATE TYPE activity_type AS ENUM ('run', 'walk', 'cycle', 'hike');
CREATE TYPE user_role     AS ENUM ('admin', 'moderator', 'user');

-- ─────────────────────────────────────────
-- Tables (ordered to respect FK dependencies)
-- ─────────────────────────────────────────


-- 1. locations (no foreign keys)
CREATE TABLE locations (
    id          SERIAL          PRIMARY KEY,
    latitude    NUMERIC(9,6)    NOT NULL,
    longitude   NUMERIC(9,6)    NOT NULL,
    label       VARCHAR                   -- Optional human-readable name for this point
);

-- 2. users (no foreign keys)
CREATE TABLE users (
    id            SERIAL      PRIMARY KEY,
    username      VARCHAR     NOT NULL UNIQUE,
    email         VARCHAR     NOT NULL UNIQUE,
    role          user_role   NOT NULL DEFAULT 'user',
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP,
    last_login_at TIMESTAMP
);

-- 3. users_secret (one-to-one with users, stores sensitive info like password hashes)
CREATE TABLE users_secret(
    user_id       INTEGER     PRIMARY KEY, -- One-to-one with users
    password_hash VARCHAR     NOT NULL, -- Bcrypt or Argon2 hash, never plaintext

    CONSTRAINT fk_user_secret
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 4. health_data (depends on: users, encryption_keys)
CREATE TABLE health_data (
    id                    SERIAL          PRIMARY KEY,
    user_id               INTEGER         NOT NULL UNIQUE, -- One-to-one with users
    born                  DATE            NOT NULL,
    weight_kg             NUMERIC(5,2),                   -- In kilograms
    height_cm             NUMERIC(5,2),                   -- In centimeters
    heart_rate_bpm        INTEGER,                        -- Resting heart rate in bpm
    sensitive_data        JSONB,                          -- Encrypted additional health fields
    consent_given_at      TIMESTAMP,                      -- RGPD: explicit user consent timestamp
    retain_until          DATE,                           -- RGPD: scheduled data retention limit
    deletion_requested_at TIMESTAMP,                      -- RGPD: right to erasure request
    measured_at           TIMESTAMP       NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_health_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
);

-- 5. events (depends on: users, locations)
CREATE TABLE events (
    id                INTEGER         GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title             VARCHAR         NOT NULL,
    user_id           INTEGER         NOT NULL,
    start_location_id INTEGER,
    end_location_id   INTEGER,
    start_time        TIMESTAMP       NOT NULL,
    end_time          TIMESTAMP,
    distance_m        NUMERIC(10,2),                      -- Total distance in meters
    created_at        TIMESTAMP       NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_event_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_event_start_location
        FOREIGN KEY (start_location_id) REFERENCES locations (id),
    CONSTRAINT fk_event_end_location
        FOREIGN KEY (end_location_id) REFERENCES locations (id)
);

-- 6. activities (depends on: users, events)
CREATE TABLE activities (
    id         SERIAL          PRIMARY KEY,
    title      VARCHAR         NOT NULL,
    body       TEXT,                                       -- Content / description of the activity
    type       activity_type   NOT NULL,
    user_id    INTEGER         NOT NULL,
    event_id   INTEGER,
    created_at TIMESTAMP       NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    duration   INTERVAL,                                   -- Total duration of the activity

    CONSTRAINT fk_activity_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_activity_event
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE SET NULL
);

-- 7. activity_waypoints — join table (depends on: activities, locations)
CREATE TABLE activity_waypoints (
    id             SERIAL    PRIMARY KEY,
    activity_id    INTEGER   NOT NULL,
    location_id    INTEGER   NOT NULL,
    recorded_at    TIMESTAMP NOT NULL,
    sequence_order INTEGER   NOT NULL, -- Order of the waypoint in the route

    CONSTRAINT fk_waypoint_activity
        FOREIGN KEY (activity_id) REFERENCES activities (id) ON DELETE CASCADE,
    CONSTRAINT fk_waypoint_location
        FOREIGN KEY (location_id) REFERENCES locations (id)
);

-- 8. audit_log — RGPD full audit trail (depends on: users)
CREATE TABLE audit_log (
    id           SERIAL    PRIMARY KEY,
    user_id      INTEGER   NOT NULL,     -- Who performed the action
    action       VARCHAR   NOT NULL,     -- e.g. READ, UPDATE, DELETE
    target_table VARCHAR   NOT NULL,     -- Which table was accessed
    target_id    INTEGER   NOT NULL,     -- Which record was accessed
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ip_address   VARCHAR,

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────
CREATE INDEX idx_activities_user_id        ON activities (user_id);
CREATE INDEX idx_activities_event_id       ON activities (event_id);
CREATE INDEX idx_health_data_user_id       ON health_data (user_id);
CREATE INDEX idx_audit_log_user_id         ON audit_log (user_id);
CREATE INDEX idx_audit_log_performed_at    ON audit_log (performed_at);
CREATE INDEX idx_activity_waypoints_act_id ON activity_waypoints (activity_id);
CREATE INDEX idx_events_user_id            ON events (user_id);

-- ─────────────────────────────────────────
-- Sample Records
-- ─────────────────────────────────────────

-- Users (password_hash is a placeholder bcrypt hash)
INSERT INTO users (id, username, email, password_hash, role) VALUES
    (1, 'Alice',   'alice@epfl.ch',   '$2b$12$placeholderHashForAlice000000000000', 'admin'),
    (2, 'Bob',     'bob@epfl.ch',     '$2b$12$placeholderHashForBob0000000000000', 'moderator'),
    (3, 'Candice', 'candice@epfl.ch', '$2b$12$placeholderHashForCandice00000000', 'moderator'),
    (4, 'Lui',     'lui@epfl.ch',     '$2b$12$placeholderHashForLui000000000000', 'user');

-- Health data (one record per user, RGPD consent tracked)
INSERT INTO health_data (id, user_id, born, encryption_key_id, consent_given_at) VALUES
    (1, 1, '1990-01-01', 1, NOW()),
    (2, 2, '1985-06-15', 1, NOW()),
    (3, 3, '1992-03-22', 1, NOW()),
    (4, 4, '1998-11-05', 1, NOW());

-- Activities
INSERT INTO activities (id, title, type, user_id) VALUES
    (1, 'Morning Run',      'run',  1),
    (2, 'Trail Guidelines', 'hike', 2),
    (3, 'Hello all!',       'walk', 4);

-- Events
INSERT INTO events (id, title, user_id, start_time) OVERRIDING SYSTEM VALUE VALUES
    (1, 'Spring 5K',    1, NOW()),
    (2, 'Campus Hike',  2, NOW()),
    (3, 'Evening Walk', 3, NOW()),
    (4, 'Trail Blazer', 4, NOW());
