/**
 * Validation Configuration
 *
 * Loads and provides validation configuration from anticheat.json
 * and other server configuration sources.
 */

import { ValidationConfig } from './types.js';

/**
 * Default validation configuration
 * Values aligned with Server/config/anticheat.json
 */
export const validationConfig: ValidationConfig = {
  movement: {
    // From anticheat.json: movement_validation
    maxSpeedMultiplier: 1.15,
    teleportThresholdUnits: 100,
    positionHistorySamples: 60,
    rubberBandingEnabled: true,
    maxCorrectionsPerMinute: 5,
    correctionThresholdUnits: 50,
    // Base speeds in units per second
    baseWalkSpeed: 220,   // ~2.2 tiles/tick at 600ms ticks
    baseRunSpeed: 440,    // ~4.4 tiles/tick when running
  },

  actions: {
    // Game tick system - 600ms per tick (matching RS3)
    tickDurationMs: 600,
    maxActionsPerTick: 1,
    maxPrayerSwitchesPerTick: 3,  // Prayer switching is more lenient
    suspiciousThreshold: 10,
    globalCooldownMs: 580,  // Slightly less than tick for tolerance
  },

  packets: {
    // From anticheat.json: packet_validation
    maxPacketAgeMs: 30000,       // 30 seconds max packet age
    clockSkewToleranceMs: 5000,  // 5 second clock skew tolerance
    keyRotationMinutes: 60,
    sequenceWindow: 1000,
    nonceExpiryMs: 60000,        // 1 minute nonce expiry
  },

  anticheat: {
    enabled: true,
    severityThresholds: {
      low: 100,      // 100 low severity flags before escalation
      medium: 25,    // 25 medium flags
      high: 5,       // 5 high flags
      critical: 1,   // 1 critical flag = immediate action
    },
    autoResponseEnabled: true,
    flagRetentionDays: 90,
  },
};

/**
 * Action tick costs
 * Defines how many "action points" each action type consumes per tick
 */
export const ACTION_TICK_COSTS: Record<string, number> = {
  // Combat abilities - 1 tick each
  basic_ability: 1,
  threshold_ability: 1,
  ultimate_ability: 1,
  special_attack: 1,

  // Consumables - 1 tick each
  eat_food: 1,
  drink_potion: 1,

  // Prayer switching - free but limited
  switch_prayer: 0,

  // Equipment - 1 tick
  equip_item: 1,

  // Item actions - 1 tick
  drop_item: 1,
  pickup_item: 1,

  // Interactions - 1 tick
  interact_object: 1,
  interact_npc: 1,

  // Skill actions - 1 tick
  skill_action: 1,
};

/**
 * Movement ability IDs that allow exceptional movement
 */
export const MOVEMENT_ABILITIES = new Set([
  'surge',
  'escape',
  'bladed_dive',
  'barge',
  'dive',
  'double_surge',
  'mobile_perk',
]);

/**
 * Ability cooldowns in milliseconds
 */
export const ABILITY_COOLDOWNS: Record<string, number> = {
  // Movement abilities
  surge: 20000,       // 20 seconds
  escape: 20000,
  bladed_dive: 20000,
  barge: 20000,

  // Basic abilities (3-5 second cooldowns)
  slice: 3000,
  punish: 3000,
  dismember: 3000,
  sever: 3000,
  fury: 5000,

  // Threshold abilities (15-30 second cooldowns)
  assault: 30000,
  hurricane: 30000,
  destroy: 20000,
  slaughter: 30000,

  // Ultimate abilities (60+ second cooldowns)
  berserk: 60000,
  overpower: 30000,
  meteor_strike: 60000,
  pulverise: 60000,

  // Defensive abilities
  resonance: 30000,
  devotion: 60000,
  barricade: 60000,
  reflect: 15000,
  anticipation: 24000,
  freedom: 30000,
  preparation: 21000,
};

/**
 * XP calculation configuration
 */
export const XP_CONFIG = {
  // Base XP values for common actions
  baseXP: {
    mining: {
      copper_ore: 17.5,
      tin_ore: 17.5,
      iron_ore: 35,
      coal: 50,
      mithril_ore: 80,
      adamantite_ore: 95,
      runite_ore: 125,
    },
    woodcutting: {
      normal_tree: 25,
      oak_tree: 37.5,
      willow_tree: 67.5,
      maple_tree: 100,
      yew_tree: 175,
      magic_tree: 250,
    },
    fishing: {
      shrimp: 10,
      sardine: 20,
      trout: 50,
      salmon: 70,
      lobster: 90,
      swordfish: 100,
      shark: 110,
    },
  },

  // XP multipliers
  multipliers: {
    outfit_bonus: 0.05,        // 5% per outfit piece (max 6%)
    aura_bonus: 0.10,          // 10% for relevant aura
    double_xp_weekend: 2.0,    // Double XP events
    well_of_goodwill: 0.10,    // 10% from community event
  },
};

/**
 * Grand Exchange configuration
 */
export const GE_CONFIG = {
  maxActiveOffers: 8,
  maxQuantityPerOffer: 2147483647,  // Max 32-bit signed int
  maxPricePerItem: 2147483647,
  minPricePerItem: 1,
  buyLimitWindow: 4 * 60 * 60 * 1000,  // 4 hours in ms
  priceUpdateInterval: 60 * 1000,      // 1 minute
};
