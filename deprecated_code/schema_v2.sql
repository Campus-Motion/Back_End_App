-- =============================================================
-- Fitness Tracking Database — Campus Motion (EPFL DIAS lab)
-- Version 2: E2EE + Separated Credentials + RLS Prepared
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
-- Roles (For API vs Auth separation)
-- ─────────────────────────────────────────
-- Note: In production, add WITH LOGIN PASSWORD 'your_secure_password';
CREATE ROLE api_role;
CREATE ROLE auth_role;

-- ─────────────────────────────────────────
-- Tables (ordered to respect FK dependencies)
-- ─────────────────────────────────────────

-- 1. locations
CREATE TABLE locations (
    id          SERIAL          PRIMARY KEY,
    latitude    NUMERIC(9,6)    NOT NULL,
    longitude   NUMERIC(9,6)    NOT NULL,
    label       VARCHAR                   -- Optional human-readable name for this point
);

-- 2. users (Base profile, no passwords)
CREATE TABLE users (
    id            SERIAL      PRIMARY KEY,
    username      VARCHAR     NOT NULL UNIQUE,
    email         VARCHAR     NOT NULL UNIQUE,
    role          user_role   NOT NULL DEFAULT 'user',
    created_at    TIMESTAMP   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP,
    last_login_at TIMESTAMP
);

-- 3. users_secret (Strictly for Passwords)
CREATE TABLE users_secret(
    user_id       INTEGER     PRIMARY KEY, -- One-to-one with users
    password_hash VARCHAR     NOT NULL,    -- Bcrypt or Argon2 hash, never plaintext

    CONSTRAINT fk_user_secret
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 4. health_data (E2EE implementation)
CREATE TABLE health_data (
    id                    SERIAL          PRIMARY KEY,
    user_id               INTEGER         NOT NULL UNIQUE, -- One-to-one with users
    born                  DATE            NOT NULL,
    weight_kg             NUMERIC(5,2),                    -- In kilograms
    height_cm             NUMERIC(5,2),                    -- In centimeters
    heart_rate_bpm        INTEGER,                         -- Resting heart rate in bpm

    -- E2EE Payload
    sensitive_data        TEXT,                            -- Base64 encoded ciphertext of the E2EE data
    client_key_version    INTEGER,                         -- Tells the client app which local key was used

    -- RGPD Compliance
    consent_given_at      TIMESTAMP,                       -- RGPD: explicit user consent timestamp
    retain_until          DATE,                            -- RGPD: scheduled data retention limit
    deletion_requested_at TIMESTAMP,                       -- RGPD: right to erasure request
    measured_at           TIMESTAMP       NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_health_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 5. events
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

-- 6. activities
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

-- 7. activity_waypoints
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

-- 8. audit_log
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
-- Permissions (Grants)
-- ─────────────────────────────────────────
-- API Role: Full access to standard tables, NO access to users_secret
GRANT SELECT, INSERT, UPDATE, DELETE ON locations, users, health_data, events, activities, activity_waypoints, audit_log TO api_role;

-- Auth Role: Only access to users_secret for login, and users to find the user_id
GRANT SELECT, INSERT, UPDATE, DELETE ON users_secret TO auth_role;
GRANT SELECT ON users TO auth_role;

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

-- 1. Insert base users
INSERT INTO users (id, username, email, role) VALUES
    (1, 'Alice',   'alice@epfl.ch',   'admin'),
    (2, 'Bob',     'bob@epfl.ch',     'moderator'),
    (3, 'Candice', 'candice@epfl.ch', 'moderator'),
    (4, 'Lui',     'lui@epfl.ch',     'user');

-- 2. Insert user passwords securely into users_secret
INSERT INTO users_secret (user_id, password_hash) VALUES
    (1, '$2b$12$placeholderHashForAlice000000000000'),
    (2, '$2b$12$placeholderHashForBob0000000000000'),
    (3, '$2b$12$placeholderHashForCandice00000000'),
    (4, '$2b$12$placeholderHashForLui000000000000');

-- 3. Insert health data (E2EE compliant, no encryption_key_id)
INSERT INTO health_data (id, user_id, born, sensitive_data, client_key_version, consent_given_at) VALUES
    (1, 1, '1990-01-01', 'U2FsdGVkX1+dummyBase64Data123==', 1, NOW()),
    (2, 2, '1985-06-15', 'U2FsdGVkX1+dummyBase64Data456==', 1, NOW()),
    (3, 3, '1992-03-22', 'U2FsdGVkX1+dummyBase64Data789==', 1, NOW()),
    (4, 4, '1998-11-05', 'U2FsdGVkX1+dummyBase64Data000==', 1, NOW());

-- 4. Insert activities
INSERT INTO activities (id, title, type, user_id) VALUES
    (1, 'Morning Run',      'run',  1),
    (2, 'Trail Guidelines', 'hike', 2),
    (3, 'Hello all!',       'walk', 4);

-- 5. Insert events
INSERT INTO events (id, title, user_id, start_time) OVERRIDING SYSTEM VALUE VALUES
    (1, 'Spring 5K',    1, NOW()),
    (2, 'Campus Hike',  2, NOW()),
    (3, 'Evening Walk', 3, NOW()),
    (4, 'Trail Blazer', 4, NOW());
