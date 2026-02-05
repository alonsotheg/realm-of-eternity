-- Migration: 003_farming_and_timers
-- Description: Farming patches, growth timers, and time-based game systems
-- Created: 2024-01-01

BEGIN;

-- =============================================================================
-- FARMING SYSTEM
-- =============================================================================

CREATE TABLE character_farming_patches (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    patch_id VARCHAR(50) NOT NULL,
    crop_id VARCHAR(50),
    planted_at TIMESTAMPTZ,
    growth_stage INTEGER NOT NULL DEFAULT 0,
    next_growth_at TIMESTAMPTZ,
    is_diseased BOOLEAN NOT NULL DEFAULT FALSE,
    disease_checked_at TIMESTAMPTZ,
    is_dead BOOLEAN NOT NULL DEFAULT FALSE,
    is_watered BOOLEAN NOT NULL DEFAULT FALSE,
    compost_type VARCHAR(20),
    times_checked INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (character_id, patch_id),
    CONSTRAINT compost_valid CHECK (compost_type IS NULL OR compost_type IN ('compost', 'supercompost', 'ultracompost'))
);

CREATE INDEX idx_farming_growth ON character_farming_patches(next_growth_at)
    WHERE next_growth_at IS NOT NULL AND is_dead = FALSE;

CREATE TABLE character_farming_storage (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    storage_id VARCHAR(50) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (character_id, storage_id, item_id),
    CONSTRAINT storage_quantity_bounds CHECK (quantity >= 0)
);

-- Tool leprechaun storage
CREATE TABLE character_tool_storage (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    secateurs BOOLEAN NOT NULL DEFAULT FALSE,
    magic_secateurs BOOLEAN NOT NULL DEFAULT FALSE,
    rake BOOLEAN NOT NULL DEFAULT FALSE,
    seed_dibber BOOLEAN NOT NULL DEFAULT FALSE,
    spade BOOLEAN NOT NULL DEFAULT FALSE,
    trowel BOOLEAN NOT NULL DEFAULT FALSE,
    watering_can_charges INTEGER NOT NULL DEFAULT 0,
    bottomless_bucket_charges INTEGER NOT NULL DEFAULT 0
);

-- =============================================================================
-- BIRDHOUSE RUNS
-- =============================================================================

CREATE TABLE character_birdhouses (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    location_id VARCHAR(50) NOT NULL,
    birdhouse_type VARCHAR(50),
    seed_type VARCHAR(50),
    placed_at TIMESTAMPTZ,
    ready_at TIMESTAMPTZ,

    PRIMARY KEY (character_id, location_id)
);

CREATE INDEX idx_birdhouses_ready ON character_birdhouses(ready_at)
    WHERE ready_at IS NOT NULL;

-- =============================================================================
-- PLAYER-OWNED HOUSE
-- =============================================================================

CREATE TABLE character_house (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    location VARCHAR(50) NOT NULL DEFAULT 'rimmington',
    style VARCHAR(50) NOT NULL DEFAULT 'basic_wood',
    rooms JSONB NOT NULL DEFAULT '[]'::jsonb,
    total_value BIGINT NOT NULL DEFAULT 0,
    butler_type VARCHAR(50),
    butler_uses INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE character_house_storage (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    storage_type VARCHAR(50) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (character_id, storage_type, item_id)
);

-- Menagerie pets
CREATE TABLE character_menagerie_pets (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    pet_id VARCHAR(50) NOT NULL,
    stored_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (character_id, pet_id)
);

-- =============================================================================
-- DAILY/WEEKLY RESETS
-- =============================================================================

CREATE TABLE character_daily_challenges (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    challenge_date DATE NOT NULL,
    challenge_1_id VARCHAR(50),
    challenge_1_progress INTEGER DEFAULT 0,
    challenge_1_completed BOOLEAN DEFAULT FALSE,
    challenge_2_id VARCHAR(50),
    challenge_2_progress INTEGER DEFAULT 0,
    challenge_2_completed BOOLEAN DEFAULT FALSE,
    challenge_3_id VARCHAR(50),
    challenge_3_progress INTEGER DEFAULT 0,
    challenge_3_completed BOOLEAN DEFAULT FALSE,
    extended_challenge_id VARCHAR(50),
    extended_progress INTEGER DEFAULT 0,
    extended_completed BOOLEAN DEFAULT FALSE,

    PRIMARY KEY (character_id, challenge_date)
);

CREATE TABLE character_daily_limits (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    limit_type VARCHAR(50) NOT NULL,
    reset_date DATE NOT NULL,
    current_count INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (character_id, limit_type, reset_date)
);

-- Examples: battlestaves_bought, sand_collected, flax_spun, etc.

CREATE TABLE character_weekly_limits (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    limit_type VARCHAR(50) NOT NULL,
    reset_week DATE NOT NULL, -- Monday of the week
    current_count INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (character_id, limit_type, reset_week)
);

-- Examples: tears_of_guthix, penguin_points, circus_performance

-- =============================================================================
-- MINIGAME SCORES
-- =============================================================================

CREATE TABLE character_minigame_stats (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    minigame_id VARCHAR(50) NOT NULL,
    games_played INTEGER NOT NULL DEFAULT 0,
    games_won INTEGER NOT NULL DEFAULT 0,
    high_score INTEGER,
    total_points BIGINT NOT NULL DEFAULT 0,
    currency_balance INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (character_id, minigame_id)
);

-- Pest Control, Castle Wars, Soul Wars, etc.

CREATE TABLE character_minigame_unlocks (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    minigame_id VARCHAR(50) NOT NULL,
    unlock_id VARCHAR(50) NOT NULL,
    unlocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (character_id, minigame_id, unlock_id)
);

-- =============================================================================
-- TIMERS AND COOLDOWNS
-- =============================================================================

CREATE TABLE character_cooldowns (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    cooldown_type VARCHAR(50) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,

    PRIMARY KEY (character_id, cooldown_type)
);

CREATE INDEX idx_cooldowns_expires ON character_cooldowns(expires_at);

-- Examples: home_teleport, aura_recovery, instance_entry

CREATE TABLE character_buffs (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    buff_id VARCHAR(50) NOT NULL,
    stacks INTEGER NOT NULL DEFAULT 1,
    expires_at TIMESTAMPTZ,
    data JSONB,

    PRIMARY KEY (character_id, buff_id)
);

CREATE INDEX idx_buffs_expires ON character_buffs(expires_at)
    WHERE expires_at IS NOT NULL;

-- =============================================================================
-- COLLECTION LOG
-- =============================================================================

CREATE TABLE character_collection_log (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    category VARCHAR(50) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    obtained_count INTEGER NOT NULL DEFAULT 1,
    first_obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (character_id, category, item_id)
);

CREATE TABLE character_collection_kill_counts (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    source_id VARCHAR(50) NOT NULL,
    kill_count INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (character_id, source_id)
);

-- =============================================================================
-- PET SYSTEM
-- =============================================================================

CREATE TABLE character_pets (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    pet_id VARCHAR(50) NOT NULL,
    obtained_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    nickname VARCHAR(20),

    PRIMARY KEY (character_id, pet_id)
);

CREATE INDEX idx_pets_active ON character_pets(character_id) WHERE is_active = TRUE;

-- Only one pet active at a time
CREATE UNIQUE INDEX idx_pets_one_active ON character_pets(character_id)
    WHERE is_active = TRUE;

-- =============================================================================
-- CLEANUP FUNCTIONS
-- =============================================================================

-- Clean expired cooldowns
CREATE OR REPLACE FUNCTION cleanup_expired_cooldowns()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM character_cooldowns WHERE expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Clean expired buffs
CREATE OR REPLACE FUNCTION cleanup_expired_buffs()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM character_buffs WHERE expires_at IS NOT NULL AND expires_at < NOW();
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Process farming growth ticks
CREATE OR REPLACE FUNCTION process_farming_growth()
RETURNS INTEGER AS $$
DECLARE
    updated_count INTEGER;
BEGIN
    -- This is a simplified version; real implementation would be more complex
    UPDATE character_farming_patches
    SET
        growth_stage = growth_stage + 1,
        next_growth_at = CASE
            WHEN growth_stage + 1 >= 4 THEN NULL  -- Fully grown
            ELSE next_growth_at + INTERVAL '20 minutes'  -- Simplified
        END
    WHERE next_growth_at <= NOW()
      AND is_dead = FALSE
      AND crop_id IS NOT NULL;

    GET DIAGNOSTICS updated_count = ROW_COUNT;
    RETURN updated_count;
END;
$$ LANGUAGE plpgsql;

COMMIT;
