-- =============================================================
-- Fitness Tracking Database — Campus Motion (EPFL DIAS lab)
-- Version 4: Full Social Features + E2EE + Roles + RLS
-- PostgreSQL compatible
-- =============================================================

-- ─────────────────────────────────────────
-- Extensions
-- ─────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─────────────────────────────────────────
-- Enums
-- ─────────────────────────────────────────
CREATE TYPE activity_type     AS ENUM ('run', 'walk', 'cycle', 'hike', 'swim', 'climbing', 'other');
CREATE TYPE user_role         AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE notification_type AS ENUM ('like', 'comment', 'follow', 'event_join');

-- ─────────────────────────────────────────
-- Roles
-- ─────────────────────────────────────────
-- Note: Add WITH LOGIN PASSWORD '...' in production
CREATE ROLE api_role WITH LOGIN PASSWORD 'secure_api_password';
CREATE ROLE auth_role WITH LOGIN PASSWORD 'secure_auth_password';
CREATE ROLE admin_role WITH LOGIN PASSWORD 'secure_admin_password' BYPASSRLS;

-- ─────────────────────────────────────────
-- Tables
-- ─────────────────────────────────────────

-- 1. locations
CREATE TABLE locations (
    id        SERIAL         PRIMARY KEY,
    latitude  NUMERIC(9,6)   NOT NULL,
    longitude NUMERIC(9,6)   NOT NULL,
    label     VARCHAR
);

-- 2. users
CREATE TABLE users (
    id            SERIAL     PRIMARY KEY,
    username      VARCHAR    NOT NULL UNIQUE,
    email         VARCHAR    NOT NULL UNIQUE,
    photo_url     VARCHAR,
    section       VARCHAR,
    role          user_role  NOT NULL DEFAULT 'user',
    created_at    TIMESTAMP  NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP,
    last_login_at TIMESTAMP
);

-- 3. user_secret
CREATE TABLE user_secret (
    id            INTEGER  PRIMARY KEY,
    password_hash VARCHAR  NOT NULL,

    CONSTRAINT fk_user_secret
        FOREIGN KEY (id) REFERENCES users (id) ON DELETE CASCADE
);

-- 4. health_data (E2EE)
CREATE TABLE health_data (
    id                    SERIAL        PRIMARY KEY,
    user_id               INTEGER       NOT NULL UNIQUE,
    born                  DATE          NOT NULL,
    weight_kg             NUMERIC(5,2),
    height_cm             NUMERIC(5,2),
    heart_rate_bpm        INTEGER,
    sensitive_data        TEXT,          -- Base64 E2EE ciphertext
    client_key_version    INTEGER,       -- Which local key version was used
    consent_given_at      TIMESTAMP,
    retain_until          DATE,
    deletion_requested_at TIMESTAMP,
    measured_at           TIMESTAMP     NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_health_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 5. events
CREATE TABLE events (
    id                INTEGER        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title             VARCHAR        NOT NULL,
    body             TEXT,
    user_id           INTEGER,
    start_location_id INTEGER,
    end_location_id   INTEGER,
    start_time        TIMESTAMP      NOT NULL,
    end_time          TIMESTAMP,
    distance_m        NUMERIC(10,2),
    created_at        TIMESTAMP      NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_event_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_event_start_location
        FOREIGN KEY (start_location_id) REFERENCES locations (id),
    CONSTRAINT fk_event_end_location
        FOREIGN KEY (end_location_id) REFERENCES locations (id)
);

-- 6. event_participants
CREATE TABLE event_participants (
    user_id   INTEGER   NOT NULL,
    event_id  INTEGER   NOT NULL,
    joined_at TIMESTAMP NOT NULL DEFAULT NOW(),

    PRIMARY KEY (user_id, event_id),

    CONSTRAINT fk_ep_user
        FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
    CONSTRAINT fk_ep_event
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE CASCADE
);

-- 7. activities
CREATE TABLE activities (
    id         SERIAL         PRIMARY KEY,
    title      VARCHAR        NOT NULL,
    body       TEXT,
    type       activity_type  NOT NULL,
    user_id    INTEGER        NOT NULL,
    event_id   INTEGER,
    is_public  BOOLEAN        NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP      NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP,
    duration   INTERVAL,

    CONSTRAINT fk_activity_user
        FOREIGN KEY (user_id)  REFERENCES users (id)  ON DELETE CASCADE,
    CONSTRAINT fk_activity_event
        FOREIGN KEY (event_id) REFERENCES events (id) ON DELETE SET NULL
);

-- 8. activity_waypoints
CREATE TABLE activity_waypoints (
    id             SERIAL    PRIMARY KEY,
    activity_id    INTEGER   NOT NULL,
    location_id    INTEGER   NOT NULL,
    recorded_at    TIMESTAMP NOT NULL,
    sequence_order INTEGER   NOT NULL,

    CONSTRAINT fk_waypoint_activity
        FOREIGN KEY (activity_id) REFERENCES activities (id) ON DELETE CASCADE,
    CONSTRAINT fk_waypoint_location
        FOREIGN KEY (location_id) REFERENCES locations (id)
);

-- 9. news
CREATE TABLE news (
    id           SERIAL     PRIMARY KEY,
    title        VARCHAR    NOT NULL,
    body         TEXT       NOT NULL,
    photo_url    VARCHAR,
    author_id    INTEGER,
    is_published BOOLEAN    NOT NULL DEFAULT FALSE,
    published_at TIMESTAMP,
    created_at   TIMESTAMP  NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMP,

    CONSTRAINT fk_news_author
        FOREIGN KEY (author_id) REFERENCES users (id) ON DELETE SET NULL
);

-- 10. comments (polymorphic: on news OR activity)
CREATE TABLE comments (
    id          SERIAL    PRIMARY KEY,
    author_id   INTEGER   NOT NULL,
    body        TEXT      NOT NULL,
    news_id     INTEGER,
    activity_id INTEGER,
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMP,

    CONSTRAINT fk_comment_author
        FOREIGN KEY (author_id)   REFERENCES users (id)       ON DELETE CASCADE,
    CONSTRAINT fk_comment_news
        FOREIGN KEY (news_id)     REFERENCES news (id)        ON DELETE CASCADE,
    CONSTRAINT fk_comment_activity
        FOREIGN KEY (activity_id) REFERENCES activities (id)  ON DELETE CASCADE,
    CONSTRAINT chk_comment_single_target
        CHECK (
            (news_id IS NOT NULL AND activity_id IS NULL) OR
            (news_id IS NULL AND activity_id IS NOT NULL)
        )
);

-- 11. likes (polymorphic: on news OR activity)
CREATE TABLE likes (
    id          SERIAL  PRIMARY KEY,
    user_id     INTEGER NOT NULL,
    news_id     INTEGER,
    activity_id INTEGER,

    CONSTRAINT fk_like_user
        FOREIGN KEY (user_id)     REFERENCES users (id)       ON DELETE CASCADE,
    CONSTRAINT fk_like_news
        FOREIGN KEY (news_id)     REFERENCES news (id)        ON DELETE CASCADE,
    CONSTRAINT fk_like_activity
        FOREIGN KEY (activity_id) REFERENCES activities (id)  ON DELETE CASCADE,
    CONSTRAINT chk_like_single_target
        CHECK (
            (news_id IS NOT NULL AND activity_id IS NULL) OR
            (news_id IS NULL AND activity_id IS NOT NULL)
        ),
    CONSTRAINT uq_like_news     UNIQUE (user_id, news_id),
    CONSTRAINT uq_like_activity UNIQUE (user_id, activity_id)
);

-- 12. user_follows
CREATE TABLE user_follows (
    follower_id  INTEGER   NOT NULL,
    following_id INTEGER   NOT NULL,
    created_at   TIMESTAMP NOT NULL DEFAULT NOW(),

    PRIMARY KEY (follower_id, following_id),

    CONSTRAINT fk_follower
        FOREIGN KEY (follower_id)  REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_following
        FOREIGN KEY (following_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT chk_no_self_follow
        CHECK (follower_id <> following_id)
);

-- 13. notifications
CREATE TABLE notifications (
    id         SERIAL            PRIMARY KEY,
    user_id    INTEGER           NOT NULL,
    type       notification_type NOT NULL,
    message    VARCHAR           NOT NULL,
    is_read    BOOLEAN           NOT NULL DEFAULT FALSE,
    ref_id     INTEGER,
    ref_table  VARCHAR,
    created_at TIMESTAMP         NOT NULL DEFAULT NOW(),

    CONSTRAINT fk_notif_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 14. audit_log
CREATE TABLE audit_log (
    id           SERIAL    PRIMARY KEY,
    user_id      INTEGER   NOT NULL,
    action       VARCHAR   NOT NULL,
    target_table VARCHAR   NOT NULL,
    target_id    INTEGER   NOT NULL,
    performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
    ip_address   VARCHAR,

    CONSTRAINT fk_audit_user
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 15. Activity photos (multiple per activity)
CREATE TABLE activity_photos (
  id          SERIAL PRIMARY KEY,
  activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  photo_url   VARCHAR(500) NOT NULL,
  position    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 16. Event photos (multiple per event)
CREATE TABLE event_photos (
  id          SERIAL PRIMARY KEY,
  event_id    INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  photo_url   VARCHAR(500) NOT NULL,
  position    INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ─────────────────────────────────────────
-- Triggers
-- ─────────────────────────────────────────

-- Auto-set published_at when news is published
CREATE OR REPLACE FUNCTION set_news_published_at()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_published = TRUE AND OLD.is_published = FALSE THEN
        NEW.published_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_news_published_at
    BEFORE UPDATE ON news
    FOR EACH ROW
    EXECUTE FUNCTION set_news_published_at();

-- ─────────────────────────────────────────
-- Indexes
-- ─────────────────────────────────────────
CREATE INDEX idx_activities_user_id        ON activities (user_id);
CREATE INDEX idx_activities_event_id       ON activities (event_id);
CREATE INDEX idx_activities_is_public      ON activities (is_public);
CREATE INDEX idx_health_data_user_id       ON health_data (user_id);
CREATE INDEX idx_audit_log_user_id         ON audit_log (user_id);
CREATE INDEX idx_audit_log_performed_at    ON audit_log (performed_at);
CREATE INDEX idx_activity_waypoints_act_id ON activity_waypoints (activity_id);
CREATE INDEX idx_events_user_id            ON events (user_id);
CREATE INDEX idx_news_author_id            ON news (author_id);
CREATE INDEX idx_news_is_published         ON news (is_published);
CREATE INDEX idx_comments_news_id          ON comments (news_id);
CREATE INDEX idx_comments_activity_id      ON comments (activity_id);
CREATE INDEX idx_likes_news_id             ON likes (news_id);
CREATE INDEX idx_likes_activity_id         ON likes (activity_id);
CREATE INDEX idx_notifications_user_id     ON notifications (user_id);
CREATE INDEX idx_notifications_is_read     ON notifications (is_read);
CREATE INDEX idx_user_follows_follower     ON user_follows (follower_id);
CREATE INDEX idx_user_follows_following    ON user_follows (following_id);
CREATE INDEX idx_activity_photos_activity_id ON activity_photos (activity_id);
CREATE INDEX idx_event_photos_event_id        ON event_photos (event_id);

-- ─────────────────────────────────────────
-- Permissions (Grants)
-- ─────────────────────────────────────────

-- api_role: full access to all public tables, CANNOT see user_secret or audit_log
GRANT SELECT, INSERT, UPDATE, DELETE ON
    locations, users, health_data, events, event_participants,
    activities, activity_waypoints, news, comments, likes,
    user_follows, notifications, event_photos, activity_photos
TO api_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO api_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON
    locations, users, events, event_participants,
    activities, activity_waypoints, news, comments, likes,
    user_follows, notifications, event_photos, activity_photos, audit_log
TO admin_role;

-- auth_role: ONLY for login / password management
GRANT SELECT, INSERT, UPDATE, DELETE ON user_secret TO auth_role;
GRANT SELECT, INSERT, UPDATE ON users TO auth_role;
GRANT USAGE, SELECT ON SEQUENCE users_id_seq TO auth_role;

-- ─────────────────────────────────────────
-- Row-Level Security (RLS)
-- ─────────────────────────────────────────

-- health_data: strictly private (own row only)
ALTER TABLE health_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY health_data_isolation ON health_data
    FOR ALL TO api_role
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

-- activities: own rows + any public row
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;

-- SELECT: your own rows + any public row
CREATE POLICY activities_select ON activities
    FOR SELECT TO api_role
    USING (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        OR is_public = TRUE
    );

-- INSERT: only your own rows (user_id must match you)
CREATE POLICY activities_insert ON activities
    FOR INSERT TO api_role
    WITH CHECK (
        user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    );

-- UPDATE: only your own rows, can't reassign to another user
CREATE POLICY activities_update ON activities
    FOR UPDATE TO api_role
    USING  (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer)
    WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

-- DELETE: only your own rows
CREATE POLICY activities_delete ON activities
    FOR DELETE TO api_role
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

-- notifications: strictly private (own notifications only)
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_isolation ON notifications
    FOR ALL TO api_role
    USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

-- news: authors see all their news; regular users only see published news
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

-- Regular users only see published news; authors and admins see all
CREATE POLICY news_select ON news FOR SELECT TO api_role
    USING (
        is_published = TRUE
        OR author_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
    );

CREATE POLICY news_insert ON news FOR INSERT TO api_role
    WITH CHECK (author_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

CREATE POLICY news_update ON news FOR UPDATE TO api_role
    USING  (author_id = NULLIF(current_setting('app.current_user_id', true), '')::integer)
    WITH CHECK (author_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

CREATE POLICY news_delete ON news FOR DELETE TO api_role
    USING (author_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

-- comments: can see a comment only if you can see its parent (public activity or yours, or any news)
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;

-- Can see a comment only if you can see its parent (public activity or yours, or any news)
CREATE POLICY comments_select ON comments FOR SELECT TO api_role
    USING (
        news_id IS NOT NULL  -- news comments always visible (news RLS handles the news itself)
        OR activity_id IN (
            SELECT id FROM activities
            WHERE is_public = TRUE
               OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        )
    );

CREATE POLICY comments_insert ON comments FOR INSERT TO api_role
    WITH CHECK (author_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

CREATE POLICY comments_update ON comments FOR UPDATE TO api_role
    USING  (author_id = NULLIF(current_setting('app.current_user_id', true), '')::integer)
    WITH CHECK (author_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

CREATE POLICY comments_delete ON comments FOR DELETE TO api_role
    USING (author_id = NULLIF(current_setting('app.current_user_id', true), '')::integer);

-- activity_photos: can see photos only if you can see the parent activity (public or yours)
ALTER TABLE activity_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_photos_select ON activity_photos FOR SELECT TO api_role
    USING (
        activity_id IN (
            SELECT id FROM activities
            WHERE is_public = TRUE
               OR user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        )
    );

CREATE POLICY activity_photos_insert ON activity_photos FOR INSERT TO api_role
    WITH CHECK (
        activity_id IN (
            SELECT id FROM activities
            WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        )
    );

CREATE POLICY activity_photos_delete ON activity_photos FOR DELETE TO api_role
    USING (
        activity_id IN (
            SELECT id FROM activities
            WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        )
    );

-- event_photos: can see photos only if you can see the parent event (yours)
ALTER TABLE event_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_photos_select ON event_photos FOR SELECT TO api_role USING (TRUE);

CREATE POLICY event_photos_insert ON event_photos FOR INSERT TO api_role
    WITH CHECK (
        event_id IN (
            SELECT id FROM events
            WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        )
    );

CREATE POLICY event_photos_delete ON event_photos FOR DELETE TO api_role
    USING (
        event_id IN (
            SELECT id FROM events
            WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::integer
        )
    );

-- ─────────────────────────────────────────
-- Sample Records
-- ─────────────────────────────────────────

INSERT INTO users (id, username, email, role) VALUES
    (1, 'Alice',   'alice@epfl.ch',   'admin'),
    (2, 'Bob',     'bob@epfl.ch',     'moderator'),
    (3, 'Candice', 'candice@epfl.ch', 'moderator'),
    (4, 'Lui',     'lui@epfl.ch',     'user');

INSERT INTO user_secret (id, password_hash) VALUES
    (1, '$2b$12$placeholderHashForAlice000000000000'),
    (2, '$2b$12$placeholderHashForBob0000000000000'),
    (3, '$2b$12$placeholderHashForCandice00000000'),
    (4, '$2b$12$placeholderHashForLui000000000000');

INSERT INTO health_data (id, user_id, born, sensitive_data, client_key_version, consent_given_at) VALUES
    (1, 1, '1990-01-01', 'U2FsdGVkX1+dummyBase64Data111==', 1, NOW()),
    (2, 2, '1985-06-15', 'U2FsdGVkX1+dummyBase64Data222==', 1, NOW()),
    (3, 3, '1992-03-22', 'U2FsdGVkX1+dummyBase64Data333==', 1, NOW()),
    (4, 4, '1998-11-05', 'U2FsdGVkX1+dummyBase64Data444==', 1, NOW());

INSERT INTO activities (id, title, type, user_id, is_public) VALUES
    (1, 'Morning Run',      'run',  1, TRUE),
    (2, 'Trail Guidelines', 'hike', 2, TRUE),
    (3, 'Hello all!',       'walk', 4, FALSE);

INSERT INTO events (id, title, user_id, start_time) OVERRIDING SYSTEM VALUE VALUES
    (1, 'Spring 5K',    1, NOW()),
    (2, 'Campus Hike',  2, NOW()),
    (3, 'Evening Walk', 3, NOW()),
    (4, 'Trail Blazer', 4, NOW());

INSERT INTO news (id, title, body, author_id, is_published, published_at) VALUES
    (1, 'Welcome to Campus Motion!', 'We are excited to launch the new Campus Motion platform.', 1, TRUE,  NOW()),
    (2, 'New Trail Available',       'A new hiking trail has been added to Campus Motion.',       2, TRUE,  NOW()),
    (3, 'Upcoming Spring 5K Event',  'Save the date for the Spring 5K event on April 15th.',      1, FALSE, NULL);


-- Reset sequences to avoid collision with manually inserted sample data
SELECT setval('users_id_seq', (SELECT MAX(id) FROM users));
SELECT setval('activities_id_seq', (SELECT MAX(id) FROM activities));
SELECT setval('events_id_seq', (SELECT MAX(id) FROM events));
SELECT setval('health_data_id_seq', (SELECT MAX(id) FROM health_data));
SELECT setval('news_id_seq', (SELECT MAX(id) FROM news));
