-- Migration: 001_initial_schema
-- Description: Initial database schema for Realm of Eternity
-- Created: 2024-01-01

BEGIN;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- =============================================================================
-- ACCOUNTS
-- =============================================================================

CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(20) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    email_verified BOOLEAN NOT NULL DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,
    mfa_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secret VARCHAR(32),
    account_status VARCHAR(20) NOT NULL DEFAULT 'active',
    membership_type VARCHAR(20) NOT NULL DEFAULT 'free',
    membership_expires_at TIMESTAMPTZ,

    CONSTRAINT accounts_username_length CHECK (LENGTH(username) >= 3),
    CONSTRAINT accounts_status_valid CHECK (account_status IN ('active', 'suspended', 'banned', 'deleted')),
    CONSTRAINT accounts_membership_valid CHECK (membership_type IN ('free', 'member', 'premium'))
);

CREATE INDEX idx_accounts_username ON accounts(LOWER(username));
CREATE INDEX idx_accounts_email ON accounts(LOWER(email));
CREATE INDEX idx_accounts_status ON accounts(account_status);

CREATE TABLE account_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    refresh_token_hash VARCHAR(255) NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_sessions_account ON account_sessions(account_id);
CREATE INDEX idx_sessions_expires ON account_sessions(expires_at);

CREATE TABLE account_bans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    banned_by UUID REFERENCES accounts(id),
    banned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    is_permanent BOOLEAN NOT NULL DEFAULT FALSE,
    lifted_at TIMESTAMPTZ,
    lifted_by UUID REFERENCES accounts(id)
);

CREATE INDEX idx_bans_account ON account_bans(account_id);
CREATE INDEX idx_bans_active ON account_bans(account_id) WHERE lifted_at IS NULL;

-- =============================================================================
-- CHARACTERS
-- =============================================================================

CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    name VARCHAR(12) UNIQUE NOT NULL,
    display_name VARCHAR(12) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    play_time_minutes INTEGER NOT NULL DEFAULT 0,
    game_mode VARCHAR(20) NOT NULL DEFAULT 'normal',
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,

    -- Location
    world_id INTEGER,
    region VARCHAR(50),
    position_x FLOAT,
    position_y FLOAT,
    position_z FLOAT,
    rotation_yaw FLOAT,

    -- Progression
    total_level INTEGER NOT NULL DEFAULT 32,
    combat_level INTEGER NOT NULL DEFAULT 3,
    quest_points INTEGER NOT NULL DEFAULT 0,
    achievement_points INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT characters_name_length CHECK (LENGTH(name) >= 1),
    CONSTRAINT characters_mode_valid CHECK (game_mode IN ('normal', 'ironman', 'hardcore_ironman', 'ultimate_ironman'))
);

CREATE INDEX idx_characters_account ON characters(account_id);
CREATE INDEX idx_characters_name ON characters(LOWER(name));
CREATE INDEX idx_characters_total_level ON characters(total_level DESC);

CREATE TABLE character_appearance (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    gender VARCHAR(10) NOT NULL DEFAULT 'male',
    skin_color INTEGER NOT NULL DEFAULT 0,
    hair_style INTEGER NOT NULL DEFAULT 0,
    hair_color INTEGER NOT NULL DEFAULT 0,
    facial_hair INTEGER NOT NULL DEFAULT 0,
    torso INTEGER NOT NULL DEFAULT 0,
    arms INTEGER NOT NULL DEFAULT 0,
    legs INTEGER NOT NULL DEFAULT 0,
    feet INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT appearance_gender_valid CHECK (gender IN ('male', 'female'))
);

-- =============================================================================
-- SKILLS
-- =============================================================================

CREATE TABLE character_skills (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    skill_name VARCHAR(20) NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    xp BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY (character_id, skill_name),
    CONSTRAINT skills_level_bounds CHECK (level >= 1 AND level <= 120),
    CONSTRAINT skills_xp_bounds CHECK (xp >= 0)
);

CREATE INDEX idx_skills_character ON character_skills(character_id);
CREATE INDEX idx_skills_ranking ON character_skills(skill_name, xp DESC);

-- Insert default skills for new characters (trigger will handle this)
CREATE OR REPLACE FUNCTION init_character_skills()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO character_skills (character_id, skill_name, level, xp)
    VALUES
        (NEW.id, 'attack', 1, 0),
        (NEW.id, 'strength', 1, 0),
        (NEW.id, 'defence', 1, 0),
        (NEW.id, 'ranged', 1, 0),
        (NEW.id, 'prayer', 1, 0),
        (NEW.id, 'magic', 1, 0),
        (NEW.id, 'hitpoints', 10, 1154),
        (NEW.id, 'crafting', 1, 0),
        (NEW.id, 'mining', 1, 0),
        (NEW.id, 'smithing', 1, 0),
        (NEW.id, 'fishing', 1, 0),
        (NEW.id, 'cooking', 1, 0),
        (NEW.id, 'firemaking', 1, 0),
        (NEW.id, 'woodcutting', 1, 0),
        (NEW.id, 'runecrafting', 1, 0),
        (NEW.id, 'slayer', 1, 0),
        (NEW.id, 'farming', 1, 0),
        (NEW.id, 'construction', 1, 0),
        (NEW.id, 'hunter', 1, 0),
        (NEW.id, 'summoning', 1, 0),
        (NEW.id, 'dungeoneering', 1, 0),
        (NEW.id, 'divination', 1, 0),
        (NEW.id, 'invention', 1, 0),
        (NEW.id, 'archaeology', 1, 0),
        (NEW.id, 'agility', 1, 0),
        (NEW.id, 'herblore', 1, 0),
        (NEW.id, 'thieving', 1, 0),
        (NEW.id, 'fletching', 1, 0);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_init_skills
    AFTER INSERT ON characters
    FOR EACH ROW
    EXECUTE FUNCTION init_character_skills();

-- =============================================================================
-- INVENTORY & BANK
-- =============================================================================

CREATE TABLE character_inventory (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    slot INTEGER NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    charges INTEGER,

    PRIMARY KEY (character_id, slot),
    CONSTRAINT inventory_slot_bounds CHECK (slot >= 0 AND slot <= 27),
    CONSTRAINT inventory_quantity_positive CHECK (quantity > 0)
);

CREATE INDEX idx_inventory_character ON character_inventory(character_id);

CREATE TABLE character_equipment (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    slot VARCHAR(20) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    charges INTEGER,
    augmented BOOLEAN DEFAULT FALSE,
    perks JSONB,

    PRIMARY KEY (character_id, slot),
    CONSTRAINT equipment_slot_valid CHECK (slot IN (
        'head', 'cape', 'neck', 'ammo', 'main_hand', 'body',
        'off_hand', 'legs', 'hands', 'feet', 'ring', 'pocket', 'aura'
    ))
);

CREATE INDEX idx_equipment_character ON character_equipment(character_id);

CREATE TABLE character_bank (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    tab INTEGER NOT NULL DEFAULT 0,
    slot INTEGER NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 1,
    placeholder BOOLEAN NOT NULL DEFAULT FALSE,

    PRIMARY KEY (character_id, tab, slot),
    CONSTRAINT bank_tab_bounds CHECK (tab >= 0 AND tab <= 9),
    CONSTRAINT bank_quantity_positive CHECK (quantity > 0 OR placeholder = TRUE)
);

CREATE INDEX idx_bank_character ON character_bank(character_id);

CREATE TABLE character_bank_settings (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    capacity INTEGER NOT NULL DEFAULT 800,
    insert_mode VARCHAR(20) NOT NULL DEFAULT 'first_available',
    withdraw_mode VARCHAR(20) NOT NULL DEFAULT 'item',
    always_placeholder BOOLEAN NOT NULL DEFAULT FALSE
);

-- =============================================================================
-- QUESTS
-- =============================================================================

CREATE TABLE character_quests (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    quest_id VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'not_started',
    current_stage INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    PRIMARY KEY (character_id, quest_id),
    CONSTRAINT quest_status_valid CHECK (status IN ('not_started', 'in_progress', 'completed'))
);

CREATE INDEX idx_quests_character ON character_quests(character_id);
CREATE INDEX idx_quests_status ON character_quests(character_id, status);

CREATE TABLE character_quest_variables (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    quest_id VARCHAR(50) NOT NULL,
    variable_name VARCHAR(50) NOT NULL,
    variable_value TEXT,

    PRIMARY KEY (character_id, quest_id, variable_name)
);

-- =============================================================================
-- ACHIEVEMENTS
-- =============================================================================

CREATE TABLE character_achievements (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (character_id, achievement_id)
);

CREATE INDEX idx_achievements_character ON character_achievements(character_id);

CREATE TABLE character_achievement_progress (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    achievement_id VARCHAR(50) NOT NULL,
    progress INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (character_id, achievement_id)
);

-- =============================================================================
-- COMBAT
-- =============================================================================

CREATE TABLE character_combat_stats (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    kills_total BIGINT NOT NULL DEFAULT 0,
    deaths_total BIGINT NOT NULL DEFAULT 0,
    damage_dealt_total BIGINT NOT NULL DEFAULT 0,
    damage_taken_total BIGINT NOT NULL DEFAULT 0,
    highest_hit INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE character_boss_kills (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    boss_id VARCHAR(50) NOT NULL,
    kill_count INTEGER NOT NULL DEFAULT 0,
    fastest_kill_seconds FLOAT,
    last_kill_at TIMESTAMPTZ,

    PRIMARY KEY (character_id, boss_id)
);

CREATE INDEX idx_boss_kills_boss ON character_boss_kills(boss_id, kill_count DESC);

CREATE TABLE character_slayer (
    character_id UUID PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
    current_task_monster VARCHAR(50),
    current_task_amount INTEGER,
    current_task_remaining INTEGER,
    current_master VARCHAR(50),
    task_streak INTEGER NOT NULL DEFAULT 0,
    slayer_points INTEGER NOT NULL DEFAULT 0,
    tasks_completed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE character_action_bars (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    bar_id INTEGER NOT NULL,
    slot INTEGER NOT NULL,
    action_type VARCHAR(20) NOT NULL,
    action_id VARCHAR(50) NOT NULL,

    PRIMARY KEY (character_id, bar_id, slot),
    CONSTRAINT action_bar_bounds CHECK (bar_id >= 0 AND bar_id <= 4),
    CONSTRAINT action_slot_bounds CHECK (slot >= 0 AND slot <= 13),
    CONSTRAINT action_type_valid CHECK (action_type IN ('ability', 'item', 'prayer', 'spell'))
);

-- =============================================================================
-- GRAND EXCHANGE
-- =============================================================================

CREATE TABLE ge_offers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    offer_type VARCHAR(10) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    price_each INTEGER NOT NULL,
    quantity_filled INTEGER NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    CONSTRAINT offer_type_valid CHECK (offer_type IN ('buy', 'sell')),
    CONSTRAINT offer_status_valid CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),
    CONSTRAINT offer_quantity_positive CHECK (quantity > 0),
    CONSTRAINT offer_price_positive CHECK (price_each > 0)
);

CREATE INDEX idx_ge_offers_character ON ge_offers(character_id);
CREATE INDEX idx_ge_offers_item ON ge_offers(item_id, offer_type, status);
CREATE INDEX idx_ge_offers_active ON ge_offers(status) WHERE status = 'active';
CREATE INDEX idx_ge_offers_matching ON ge_offers(item_id, offer_type, price_each) WHERE status = 'active';

CREATE TABLE ge_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    buy_offer_id UUID NOT NULL REFERENCES ge_offers(id),
    sell_offer_id UUID NOT NULL REFERENCES ge_offers(id),
    quantity INTEGER NOT NULL,
    price_each INTEGER NOT NULL,
    total_value BIGINT NOT NULL,
    transacted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ge_transactions_offers ON ge_transactions(buy_offer_id, sell_offer_id);
CREATE INDEX idx_ge_transactions_time ON ge_transactions(transacted_at DESC);

CREATE TABLE ge_price_history (
    item_id VARCHAR(50) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    average_price INTEGER NOT NULL,
    volume INTEGER NOT NULL DEFAULT 0,
    high_price INTEGER,
    low_price INTEGER,

    PRIMARY KEY (item_id, timestamp)
);

CREATE INDEX idx_ge_prices_item ON ge_price_history(item_id, timestamp DESC);

-- =============================================================================
-- SOCIAL
-- =============================================================================

CREATE TABLE character_friends (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    friend_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    notes VARCHAR(100),

    PRIMARY KEY (character_id, friend_character_id),
    CONSTRAINT no_self_friend CHECK (character_id != friend_character_id)
);

CREATE INDEX idx_friends_character ON character_friends(character_id);

CREATE TABLE character_ignore (
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    ignored_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (character_id, ignored_character_id),
    CONSTRAINT no_self_ignore CHECK (character_id != ignored_character_id)
);

CREATE TABLE clans (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(20) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    owner_character_id UUID NOT NULL REFERENCES characters(id),
    member_count INTEGER NOT NULL DEFAULT 1,
    citadel_tier INTEGER NOT NULL DEFAULT 0,
    total_xp BIGINT NOT NULL DEFAULT 0,
    settings JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX idx_clans_name ON clans(LOWER(name));
CREATE INDEX idx_clans_owner ON clans(owner_character_id);

CREATE TABLE clan_members (
    clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    rank VARCHAR(20) NOT NULL DEFAULT 'recruit',
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    xp_contributed BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY (clan_id, character_id),
    CONSTRAINT clan_rank_valid CHECK (rank IN (
        'owner', 'deputy_owner', 'overseer', 'coordinator',
        'organiser', 'admin', 'general', 'captain',
        'lieutenant', 'sergeant', 'corporal', 'recruit'
    ))
);

CREATE INDEX idx_clan_members_character ON clan_members(character_id);

CREATE TABLE clan_invites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    clan_id UUID NOT NULL REFERENCES clans(id) ON DELETE CASCADE,
    invited_character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES characters(id),
    invited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    UNIQUE (clan_id, invited_character_id)
);

-- =============================================================================
-- CHAT & MESSAGING
-- =============================================================================

CREATE TABLE private_messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    sender_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    read_at TIMESTAMPTZ,

    CONSTRAINT message_length CHECK (LENGTH(message) <= 500)
);

CREATE INDEX idx_pm_sender ON private_messages(sender_id, sent_at DESC);
CREATE INDEX idx_pm_recipient ON private_messages(recipient_id, sent_at DESC);

CREATE TABLE chat_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reporter_id UUID NOT NULL REFERENCES characters(id),
    reported_id UUID NOT NULL REFERENCES characters(id),
    message_snapshot TEXT,
    reason VARCHAR(50) NOT NULL,
    reported_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reviewed BOOLEAN NOT NULL DEFAULT FALSE,
    reviewed_by UUID REFERENCES accounts(id),
    reviewed_at TIMESTAMPTZ,
    action_taken VARCHAR(50)
);

CREATE INDEX idx_reports_pending ON chat_reports(reviewed) WHERE reviewed = FALSE;

-- =============================================================================
-- AUDIT & LOGGING
-- =============================================================================

CREATE TABLE login_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    ip_address INET NOT NULL,
    user_agent TEXT,
    success BOOLEAN NOT NULL,
    failure_reason VARCHAR(50),
    logged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_login_history_account ON login_history(account_id, logged_at DESC);
CREATE INDEX idx_login_history_ip ON login_history(ip_address, logged_at DESC);

CREATE TABLE trade_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_1_id UUID NOT NULL REFERENCES characters(id),
    character_2_id UUID NOT NULL REFERENCES characters(id),
    items_given_1 JSONB NOT NULL,
    items_given_2 JSONB NOT NULL,
    gold_given_1 BIGINT NOT NULL DEFAULT 0,
    gold_given_2 BIGINT NOT NULL DEFAULT 0,
    traded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trade_log_characters ON trade_log(character_1_id, character_2_id, traded_at DESC);

CREATE TABLE item_drop_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id),
    npc_id VARCHAR(50) NOT NULL,
    item_id VARCHAR(50) NOT NULL,
    quantity INTEGER NOT NULL,
    dropped_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_drops_character ON item_drop_log(character_id, dropped_at DESC);
CREATE INDEX idx_drops_item ON item_drop_log(item_id, dropped_at DESC);

-- Partition large tables by time (for production)
-- Note: This is a simplified example; actual partitioning would be more complex

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Calculate combat level
CREATE OR REPLACE FUNCTION calculate_combat_level(
    p_attack INTEGER, p_strength INTEGER, p_defence INTEGER,
    p_hitpoints INTEGER, p_prayer INTEGER, p_summoning INTEGER,
    p_ranged INTEGER, p_magic INTEGER
) RETURNS INTEGER AS $$
DECLARE
    base FLOAT;
    melee FLOAT;
    range_magic FLOAT;
BEGIN
    base := (p_defence + p_hitpoints + FLOOR(p_prayer / 2) + FLOOR(p_summoning / 2)) * 0.25;
    melee := (p_attack + p_strength) * 0.325;
    range_magic := GREATEST(FLOOR(p_ranged * 1.5), FLOOR(p_magic * 1.5)) * 0.325;
    RETURN FLOOR(base + GREATEST(melee, range_magic));
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update character levels summary
CREATE OR REPLACE FUNCTION update_character_levels()
RETURNS TRIGGER AS $$
DECLARE
    v_total INTEGER;
    v_combat INTEGER;
    v_attack INTEGER;
    v_strength INTEGER;
    v_defence INTEGER;
    v_hitpoints INTEGER;
    v_prayer INTEGER;
    v_summoning INTEGER;
    v_ranged INTEGER;
    v_magic INTEGER;
BEGIN
    SELECT
        SUM(level),
        MAX(CASE WHEN skill_name = 'attack' THEN level END),
        MAX(CASE WHEN skill_name = 'strength' THEN level END),
        MAX(CASE WHEN skill_name = 'defence' THEN level END),
        MAX(CASE WHEN skill_name = 'hitpoints' THEN level END),
        MAX(CASE WHEN skill_name = 'prayer' THEN level END),
        MAX(CASE WHEN skill_name = 'summoning' THEN level END),
        MAX(CASE WHEN skill_name = 'ranged' THEN level END),
        MAX(CASE WHEN skill_name = 'magic' THEN level END)
    INTO v_total, v_attack, v_strength, v_defence, v_hitpoints,
         v_prayer, v_summoning, v_ranged, v_magic
    FROM character_skills
    WHERE character_id = NEW.character_id;

    v_combat := calculate_combat_level(
        v_attack, v_strength, v_defence, v_hitpoints,
        v_prayer, v_summoning, v_ranged, v_magic
    );

    UPDATE characters
    SET total_level = v_total, combat_level = v_combat
    WHERE id = NEW.character_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_levels
    AFTER UPDATE OF level ON character_skills
    FOR EACH ROW
    EXECUTE FUNCTION update_character_levels();

COMMIT;
