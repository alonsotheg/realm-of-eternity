-- Migration: 002_highscores_tables
-- Description: Highscores and leaderboard tables with materialized views
-- Created: 2024-01-01

BEGIN;

-- =============================================================================
-- HIGHSCORE TABLES
-- =============================================================================

-- Overall highscores (materialized for performance)
CREATE MATERIALIZED VIEW mv_highscores_overall AS
SELECT
    c.id AS character_id,
    c.name AS character_name,
    c.game_mode,
    SUM(cs.xp) AS total_xp,
    SUM(cs.level) AS total_level,
    RANK() OVER (ORDER BY SUM(cs.xp) DESC) AS rank
FROM characters c
JOIN character_skills cs ON c.id = cs.character_id
WHERE c.is_deleted = FALSE
GROUP BY c.id, c.name, c.game_mode
ORDER BY total_xp DESC;

CREATE UNIQUE INDEX idx_mv_highscores_overall_char ON mv_highscores_overall(character_id);
CREATE INDEX idx_mv_highscores_overall_rank ON mv_highscores_overall(rank);

-- Skill-specific highscores
CREATE MATERIALIZED VIEW mv_highscores_skills AS
SELECT
    cs.character_id,
    c.name AS character_name,
    c.game_mode,
    cs.skill_name,
    cs.level,
    cs.xp,
    RANK() OVER (PARTITION BY cs.skill_name ORDER BY cs.xp DESC) AS rank
FROM character_skills cs
JOIN characters c ON cs.character_id = c.id
WHERE c.is_deleted = FALSE
ORDER BY cs.skill_name, cs.xp DESC;

CREATE UNIQUE INDEX idx_mv_highscores_skills_pk ON mv_highscores_skills(character_id, skill_name);
CREATE INDEX idx_mv_highscores_skills_rank ON mv_highscores_skills(skill_name, rank);

-- Boss kill highscores
CREATE MATERIALIZED VIEW mv_highscores_bosses AS
SELECT
    bk.character_id,
    c.name AS character_name,
    c.game_mode,
    bk.boss_id,
    bk.kill_count,
    bk.fastest_kill_seconds,
    RANK() OVER (PARTITION BY bk.boss_id ORDER BY bk.kill_count DESC) AS rank
FROM character_boss_kills bk
JOIN characters c ON bk.character_id = c.id
WHERE c.is_deleted = FALSE AND bk.kill_count > 0
ORDER BY bk.boss_id, bk.kill_count DESC;

CREATE UNIQUE INDEX idx_mv_highscores_bosses_pk ON mv_highscores_bosses(character_id, boss_id);
CREATE INDEX idx_mv_highscores_bosses_rank ON mv_highscores_bosses(boss_id, rank);

-- Speedrun leaderboards
CREATE MATERIALIZED VIEW mv_highscores_speedruns AS
SELECT
    bk.character_id,
    c.name AS character_name,
    c.game_mode,
    bk.boss_id,
    bk.fastest_kill_seconds,
    RANK() OVER (PARTITION BY bk.boss_id ORDER BY bk.fastest_kill_seconds ASC) AS rank
FROM character_boss_kills bk
JOIN characters c ON bk.character_id = c.id
WHERE c.is_deleted = FALSE AND bk.fastest_kill_seconds IS NOT NULL
ORDER BY bk.boss_id, bk.fastest_kill_seconds ASC;

CREATE UNIQUE INDEX idx_mv_highscores_speedruns_pk ON mv_highscores_speedruns(character_id, boss_id);
CREATE INDEX idx_mv_highscores_speedruns_rank ON mv_highscores_speedruns(boss_id, rank);

-- Clan highscores
CREATE MATERIALIZED VIEW mv_highscores_clans AS
SELECT
    cl.id AS clan_id,
    cl.name AS clan_name,
    cl.member_count,
    cl.total_xp,
    cl.citadel_tier,
    RANK() OVER (ORDER BY cl.total_xp DESC) AS rank
FROM clans cl
ORDER BY cl.total_xp DESC;

CREATE UNIQUE INDEX idx_mv_highscores_clans_pk ON mv_highscores_clans(clan_id);
CREATE INDEX idx_mv_highscores_clans_rank ON mv_highscores_clans(rank);

-- =============================================================================
-- IRONMAN-SPECIFIC HIGHSCORES
-- =============================================================================

CREATE MATERIALIZED VIEW mv_highscores_ironman AS
SELECT
    c.id AS character_id,
    c.name AS character_name,
    c.game_mode,
    SUM(cs.xp) AS total_xp,
    SUM(cs.level) AS total_level,
    RANK() OVER (PARTITION BY c.game_mode ORDER BY SUM(cs.xp) DESC) AS rank
FROM characters c
JOIN character_skills cs ON c.id = cs.character_id
WHERE c.is_deleted = FALSE
  AND c.game_mode IN ('ironman', 'hardcore_ironman', 'ultimate_ironman')
GROUP BY c.id, c.name, c.game_mode
ORDER BY c.game_mode, total_xp DESC;

CREATE UNIQUE INDEX idx_mv_highscores_ironman_pk ON mv_highscores_ironman(character_id);
CREATE INDEX idx_mv_highscores_ironman_mode ON mv_highscores_ironman(game_mode, rank);

-- =============================================================================
-- REFRESH SCHEDULING
-- =============================================================================

-- Track last refresh times
CREATE TABLE highscore_refresh_log (
    view_name VARCHAR(50) PRIMARY KEY,
    last_refresh TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    refresh_duration_ms INTEGER,
    rows_affected INTEGER
);

INSERT INTO highscore_refresh_log (view_name, last_refresh)
VALUES
    ('mv_highscores_overall', NOW()),
    ('mv_highscores_skills', NOW()),
    ('mv_highscores_bosses', NOW()),
    ('mv_highscores_speedruns', NOW()),
    ('mv_highscores_clans', NOW()),
    ('mv_highscores_ironman', NOW());

-- Function to refresh all highscores
CREATE OR REPLACE FUNCTION refresh_all_highscores()
RETURNS void AS $$
DECLARE
    start_time TIMESTAMPTZ;
    duration_ms INTEGER;
    row_count INTEGER;
BEGIN
    -- Overall
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_highscores_overall;
    duration_ms := EXTRACT(MILLISECOND FROM clock_timestamp() - start_time);
    SELECT COUNT(*) INTO row_count FROM mv_highscores_overall;
    UPDATE highscore_refresh_log
    SET last_refresh = NOW(), refresh_duration_ms = duration_ms, rows_affected = row_count
    WHERE view_name = 'mv_highscores_overall';

    -- Skills
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_highscores_skills;
    duration_ms := EXTRACT(MILLISECOND FROM clock_timestamp() - start_time);
    SELECT COUNT(*) INTO row_count FROM mv_highscores_skills;
    UPDATE highscore_refresh_log
    SET last_refresh = NOW(), refresh_duration_ms = duration_ms, rows_affected = row_count
    WHERE view_name = 'mv_highscores_skills';

    -- Bosses
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_highscores_bosses;
    duration_ms := EXTRACT(MILLISECOND FROM clock_timestamp() - start_time);
    SELECT COUNT(*) INTO row_count FROM mv_highscores_bosses;
    UPDATE highscore_refresh_log
    SET last_refresh = NOW(), refresh_duration_ms = duration_ms, rows_affected = row_count
    WHERE view_name = 'mv_highscores_bosses';

    -- Speedruns
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_highscores_speedruns;
    duration_ms := EXTRACT(MILLISECOND FROM clock_timestamp() - start_time);
    SELECT COUNT(*) INTO row_count FROM mv_highscores_speedruns;
    UPDATE highscore_refresh_log
    SET last_refresh = NOW(), refresh_duration_ms = duration_ms, rows_affected = row_count
    WHERE view_name = 'mv_highscores_speedruns';

    -- Clans
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_highscores_clans;
    duration_ms := EXTRACT(MILLISECOND FROM clock_timestamp() - start_time);
    SELECT COUNT(*) INTO row_count FROM mv_highscores_clans;
    UPDATE highscore_refresh_log
    SET last_refresh = NOW(), refresh_duration_ms = duration_ms, rows_affected = row_count
    WHERE view_name = 'mv_highscores_clans';

    -- Ironman
    start_time := clock_timestamp();
    REFRESH MATERIALIZED VIEW CONCURRENTLY mv_highscores_ironman;
    duration_ms := EXTRACT(MILLISECOND FROM clock_timestamp() - start_time);
    SELECT COUNT(*) INTO row_count FROM mv_highscores_ironman;
    UPDATE highscore_refresh_log
    SET last_refresh = NOW(), refresh_duration_ms = duration_ms, rows_affected = row_count
    WHERE view_name = 'mv_highscores_ironman';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- HELPER VIEWS FOR API
-- =============================================================================

-- Player lookup with all rankings
CREATE VIEW v_player_rankings AS
SELECT
    c.id AS character_id,
    c.name AS character_name,
    c.game_mode,
    ho.rank AS overall_rank,
    ho.total_xp,
    ho.total_level
FROM characters c
LEFT JOIN mv_highscores_overall ho ON c.id = ho.character_id
WHERE c.is_deleted = FALSE;

-- Skill rankings for a player
CREATE VIEW v_player_skill_rankings AS
SELECT
    hs.character_id,
    hs.character_name,
    hs.skill_name,
    hs.level,
    hs.xp,
    hs.rank
FROM mv_highscores_skills hs;

COMMIT;
