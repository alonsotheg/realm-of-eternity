/**
 * Skills Service
 *
 * Server-authoritative skill and XP management system.
 * All XP gains are calculated and validated server-side.
 *
 * Client sends: Intent (action_complete, mine_ore, catch_fish)
 * Server validates, calculates XP, and emits: Result (xp_drop, level_up)
 */

import { Vector3 } from '../types/index.js';
import { XP_CONFIG } from '../validation/config.js';
import { flagAccount } from '../validation/anticheat-flagger.js';
import { movementValidator } from '../validation/movement-validator.js';
import { actionRateLimiter } from '../validation/action-rate-limiter.js';

// ============================================================================
// Types
// ============================================================================

export type SkillName =
  | 'attack' | 'strength' | 'defence' | 'ranged' | 'prayer' | 'magic'
  | 'hitpoints' | 'crafting' | 'mining' | 'smithing' | 'fishing' | 'cooking'
  | 'firemaking' | 'woodcutting' | 'runecrafting' | 'slayer' | 'farming'
  | 'construction' | 'hunter' | 'summoning' | 'dungeoneering' | 'divination'
  | 'invention' | 'archaeology' | 'agility' | 'herblore' | 'thieving' | 'fletching';

export interface SkillData {
  level: number;
  xp: number;
  virtualLevel: number; // Level if XP could go past 99/120
}

export interface PlayerSkills {
  characterId: string;
  skills: Map<SkillName, SkillData>;
  totalLevel: number;
  totalXp: number;
  combatLevel: number;
}

export interface SkillActionRequest {
  action: string;
  skill: SkillName;
  targetId?: string;
  targetType?: string;
  position?: Vector3;
  toolId?: string;
}

export interface SkillActionResult {
  success: boolean;
  xpGained?: number;
  leveledUp?: boolean;
  newLevel?: number;
  error?: string;
  itemsGained?: { itemId: string; quantity: number }[];
  resourceDepleted?: boolean;
}

export interface XPDropEvent {
  skill: SkillName;
  amount: number;
  totalXp: number;
  currentLevel: number;
}

export interface LevelUpEvent {
  skill: SkillName;
  newLevel: number;
  totalLevel: number;
  combatLevel?: number;
}

// ============================================================================
// XP Table (Level 1-120)
// ============================================================================

const XP_TABLE: number[] = [
  0,          // Level 1
  83,         // Level 2
  174,        // Level 3
  276,        // Level 4
  388,        // Level 5
  512,        // Level 6
  650,        // Level 7
  801,        // Level 8
  969,        // Level 9
  1154,       // Level 10
  1358,       // Level 11
  1584,       // Level 12
  1833,       // Level 13
  2107,       // Level 14
  2411,       // Level 15
  2746,       // Level 16
  3115,       // Level 17
  3523,       // Level 18
  3973,       // Level 19
  4470,       // Level 20
  5018,       // Level 21
  5624,       // Level 22
  6291,       // Level 23
  7028,       // Level 24
  7842,       // Level 25
  8740,       // Level 26
  9730,       // Level 27
  10824,      // Level 28
  12031,      // Level 29
  13363,      // Level 30
  14833,      // Level 31
  16456,      // Level 32
  18247,      // Level 33
  20224,      // Level 34
  22406,      // Level 35
  24815,      // Level 36
  27473,      // Level 37
  30408,      // Level 38
  33648,      // Level 39
  37224,      // Level 40
  41171,      // Level 41
  45529,      // Level 42
  50339,      // Level 43
  55649,      // Level 44
  61512,      // Level 45
  67983,      // Level 46
  75127,      // Level 47
  83014,      // Level 48
  91721,      // Level 49
  101333,     // Level 50
  111945,     // Level 51
  123660,     // Level 52
  136594,     // Level 53
  150872,     // Level 54
  166636,     // Level 55
  184040,     // Level 56
  203254,     // Level 57
  224466,     // Level 58
  247886,     // Level 59
  273742,     // Level 60
  302288,     // Level 61
  333804,     // Level 62
  368599,     // Level 63
  407015,     // Level 64
  449428,     // Level 65
  496254,     // Level 66
  547953,     // Level 67
  605032,     // Level 68
  668051,     // Level 69
  737627,     // Level 70
  814445,     // Level 71
  899257,     // Level 72
  992895,     // Level 73
  1096278,    // Level 74
  1210421,    // Level 75
  1336443,    // Level 76
  1475581,    // Level 77
  1629200,    // Level 78
  1798808,    // Level 79
  1986068,    // Level 80
  2192818,    // Level 81
  2421087,    // Level 82
  2673114,    // Level 83
  2951373,    // Level 84
  3258594,    // Level 85
  3597792,    // Level 86
  3972294,    // Level 87
  4385776,    // Level 88
  4842295,    // Level 89
  5346332,    // Level 90
  5902831,    // Level 91
  6517253,    // Level 92
  7195629,    // Level 93
  7944614,    // Level 94
  8771558,    // Level 95
  9684577,    // Level 96
  10692629,   // Level 97
  11805606,   // Level 98
  13034431,   // Level 99
  // Extended to 120 for elite skills
  14391160,   // Level 100
  15889109,   // Level 101
  17542976,   // Level 102
  19368992,   // Level 103
  21385073,   // Level 104
  23611006,   // Level 105
  26068632,   // Level 106
  28782069,   // Level 107
  31777943,   // Level 108
  35085654,   // Level 109
  38737661,   // Level 110
  42769801,   // Level 111
  47221641,   // Level 112
  52136869,   // Level 113
  57563718,   // Level 114
  63555443,   // Level 115
  70170840,   // Level 116
  77474828,   // Level 117
  85539082,   // Level 118
  94442737,   // Level 119
  104273167,  // Level 120
];

const MAX_XP = 200000000; // 200M XP cap
const ELITE_SKILLS: Set<SkillName> = new Set(['invention', 'slayer', 'dungeoneering', 'herblore', 'farming']);

// ============================================================================
// In-Memory Storage (Would be PostgreSQL in production)
// ============================================================================

const playerSkillsMap: Map<string, PlayerSkills> = new Map();

// Resource state tracking
const resourceStates: Map<string, { depleted: boolean; respawnAt: number }> = new Map();

// ============================================================================
// Skills Service
// ============================================================================

export class SkillsService {
  /**
   * Initialize skills for a new player
   */
  initializePlayer(characterId: string): PlayerSkills {
    const skills = new Map<SkillName, SkillData>();

    const allSkills: SkillName[] = [
      'attack', 'strength', 'defence', 'ranged', 'prayer', 'magic',
      'hitpoints', 'crafting', 'mining', 'smithing', 'fishing', 'cooking',
      'firemaking', 'woodcutting', 'runecrafting', 'slayer', 'farming',
      'construction', 'hunter', 'summoning', 'dungeoneering', 'divination',
      'invention', 'archaeology', 'agility', 'herblore', 'thieving', 'fletching',
    ];

    for (const skill of allSkills) {
      // Hitpoints starts at 10, others at 1
      const startLevel = skill === 'hitpoints' ? 10 : 1;
      const startXp = skill === 'hitpoints' ? XP_TABLE[9] : 0;

      skills.set(skill, {
        level: startLevel,
        xp: startXp,
        virtualLevel: startLevel,
      });
    }

    const playerSkills: PlayerSkills = {
      characterId,
      skills,
      totalLevel: this.calculateTotalLevel(skills),
      totalXp: this.calculateTotalXp(skills),
      combatLevel: this.calculateCombatLevel(skills),
    };

    playerSkillsMap.set(characterId, playerSkills);
    return playerSkills;
  }

  /**
   * Remove player skills data
   */
  removePlayer(characterId: string): void {
    playerSkillsMap.delete(characterId);
  }

  /**
   * Get player skills
   */
  getPlayerSkills(characterId: string): PlayerSkills | null {
    return playerSkillsMap.get(characterId) ?? null;
  }

  /**
   * Process a skill action request
   * This is the main entry point for all skilling activities
   */
  async processSkillAction(
    characterId: string,
    request: SkillActionRequest
  ): Promise<SkillActionResult> {
    const playerSkills = playerSkillsMap.get(characterId);
    if (!playerSkills) {
      return { success: false, error: 'Player not found' };
    }

    // Validate action with rate limiter
    const actionResult = await actionRateLimiter.validateAction(characterId, {
      type: 'skill_action',
      actionId: request.action,
      timestamp: Date.now(),
    });

    if (!actionResult.valid) {
      return { success: false, error: `Action rate limited: ${actionResult.reason}` };
    }

    // Validate position if provided
    if (request.position && request.targetId) {
      const isInRange = await this.validateActionRange(
        characterId,
        request.position,
        request.targetId
      );

      if (!isInRange) {
        await flagAccount(characterId, 'impossible_action', {
          reason: 'out_of_range',
          action: request.action,
          targetId: request.targetId,
        });
        return { success: false, error: 'Target out of range' };
      }
    }

    // Process based on action type
    switch (request.action) {
      case 'mine_ore':
        return this.processMiningAction(characterId, playerSkills, request);
      case 'chop_tree':
        return this.processWoodcuttingAction(characterId, playerSkills, request);
      case 'catch_fish':
        return this.processFishingAction(characterId, playerSkills, request);
      case 'cook_food':
        return this.processCookingAction(characterId, playerSkills, request);
      case 'smith_item':
        return this.processSmithingAction(characterId, playerSkills, request);
      default:
        return this.processGenericAction(characterId, playerSkills, request);
    }
  }

  /**
   * Grant XP to a player (server-authoritative)
   */
  async grantXp(
    characterId: string,
    skill: SkillName,
    baseXp: number,
    source: string
  ): Promise<{ xpGained: number; leveledUp: boolean; newLevel?: number }> {
    const playerSkills = playerSkillsMap.get(characterId);
    if (!playerSkills) {
      return { xpGained: 0, leveledUp: false };
    }

    const skillData = playerSkills.skills.get(skill);
    if (!skillData) {
      return { xpGained: 0, leveledUp: false };
    }

    // Apply multipliers
    const multipliedXp = this.applyXpMultipliers(characterId, baseXp);

    // Cap at max XP
    const newXp = Math.min(skillData.xp + multipliedXp, MAX_XP);
    const actualXpGained = newXp - skillData.xp;

    if (actualXpGained === 0) {
      return { xpGained: 0, leveledUp: false };
    }

    // Calculate new level
    const oldLevel = skillData.level;
    const maxLevel = ELITE_SKILLS.has(skill) ? 120 : 99;
    const newLevel = this.calculateLevelFromXp(newXp, maxLevel);

    // Update skill data
    skillData.xp = newXp;
    skillData.level = newLevel;
    skillData.virtualLevel = this.calculateLevelFromXp(newXp, 120);

    // Update totals
    playerSkills.totalXp = this.calculateTotalXp(playerSkills.skills);

    const leveledUp = newLevel > oldLevel;
    if (leveledUp) {
      playerSkills.totalLevel = this.calculateTotalLevel(playerSkills.skills);

      // Recalculate combat level if combat skill
      const combatSkills: SkillName[] = ['attack', 'strength', 'defence', 'hitpoints', 'ranged', 'magic', 'prayer', 'summoning'];
      if (combatSkills.includes(skill)) {
        playerSkills.combatLevel = this.calculateCombatLevel(playerSkills.skills);
      }
    }

    console.log(`[Skills] ${characterId} gained ${actualXpGained} ${skill} XP from ${source}`);

    return {
      xpGained: actualXpGained,
      leveledUp,
      newLevel: leveledUp ? newLevel : undefined,
    };
  }

  // ===========================================================================
  // Skill Action Processors
  // ===========================================================================

  private async processMiningAction(
    characterId: string,
    playerSkills: PlayerSkills,
    request: SkillActionRequest
  ): Promise<SkillActionResult> {
    const miningData = playerSkills.skills.get('mining');
    if (!miningData) {
      return { success: false, error: 'Mining skill not found' };
    }

    // Check resource state
    const resourceState = resourceStates.get(request.targetId ?? '');
    if (resourceState?.depleted && Date.now() < resourceState.respawnAt) {
      return { success: false, error: 'Resource is depleted', resourceDepleted: true };
    }

    // Get ore type from target
    const oreType = this.getOreTypeFromTarget(request.targetId ?? '');
    if (!oreType) {
      return { success: false, error: 'Invalid mining target' };
    }

    // Check level requirement
    const levelReq = this.getMiningLevelRequirement(oreType);
    if (miningData.level < levelReq) {
      return { success: false, error: `Requires ${levelReq} Mining` };
    }

    // Calculate success chance (simplified)
    const successChance = Math.min(0.95, 0.5 + (miningData.level - levelReq) * 0.02);
    const success = Math.random() < successChance;

    if (!success) {
      return { success: true, xpGained: 0 }; // Action succeeded but no ore
    }

    // Grant XP
    const baseXp = XP_CONFIG.baseXP.mining[oreType as keyof typeof XP_CONFIG.baseXP.mining] ?? 10;
    const xpResult = await this.grantXp(characterId, 'mining', baseXp, `mining_${oreType}`);

    // Deplete resource (random chance)
    if (Math.random() < 0.3) {
      resourceStates.set(request.targetId ?? '', {
        depleted: true,
        respawnAt: Date.now() + this.getOreRespawnTime(oreType),
      });
    }

    return {
      success: true,
      xpGained: xpResult.xpGained,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
      itemsGained: [{ itemId: oreType, quantity: 1 }],
      resourceDepleted: resourceStates.get(request.targetId ?? '')?.depleted,
    };
  }

  private async processWoodcuttingAction(
    characterId: string,
    playerSkills: PlayerSkills,
    request: SkillActionRequest
  ): Promise<SkillActionResult> {
    const wcData = playerSkills.skills.get('woodcutting');
    if (!wcData) {
      return { success: false, error: 'Woodcutting skill not found' };
    }

    const treeType = this.getTreeTypeFromTarget(request.targetId ?? '');
    if (!treeType) {
      return { success: false, error: 'Invalid woodcutting target' };
    }

    const baseXp = XP_CONFIG.baseXP.woodcutting[treeType as keyof typeof XP_CONFIG.baseXP.woodcutting] ?? 25;
    const xpResult = await this.grantXp(characterId, 'woodcutting', baseXp, `woodcutting_${treeType}`);

    return {
      success: true,
      xpGained: xpResult.xpGained,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
      itemsGained: [{ itemId: `${treeType}_logs`, quantity: 1 }],
    };
  }

  private async processFishingAction(
    characterId: string,
    playerSkills: PlayerSkills,
    request: SkillActionRequest
  ): Promise<SkillActionResult> {
    const fishingData = playerSkills.skills.get('fishing');
    if (!fishingData) {
      return { success: false, error: 'Fishing skill not found' };
    }

    const fishType = this.getFishTypeFromTarget(request.targetId ?? '');
    if (!fishType) {
      return { success: false, error: 'Invalid fishing spot' };
    }

    const baseXp = XP_CONFIG.baseXP.fishing[fishType as keyof typeof XP_CONFIG.baseXP.fishing] ?? 10;
    const xpResult = await this.grantXp(characterId, 'fishing', baseXp, `fishing_${fishType}`);

    return {
      success: true,
      xpGained: xpResult.xpGained,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
      itemsGained: [{ itemId: `raw_${fishType}`, quantity: 1 }],
    };
  }

  private async processCookingAction(
    characterId: string,
    playerSkills: PlayerSkills,
    request: SkillActionRequest
  ): Promise<SkillActionResult> {
    // Cooking processes raw food into cooked food
    // XP and burn chance depend on level and food type
    const cookingData = playerSkills.skills.get('cooking');
    if (!cookingData) {
      return { success: false, error: 'Cooking skill not found' };
    }

    // Simplified: fixed XP for now
    const xpResult = await this.grantXp(characterId, 'cooking', 100, 'cooking');

    return {
      success: true,
      xpGained: xpResult.xpGained,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
    };
  }

  private async processSmithingAction(
    characterId: string,
    playerSkills: PlayerSkills,
    request: SkillActionRequest
  ): Promise<SkillActionResult> {
    const smithingData = playerSkills.skills.get('smithing');
    if (!smithingData) {
      return { success: false, error: 'Smithing skill not found' };
    }

    // Simplified: fixed XP for now
    const xpResult = await this.grantXp(characterId, 'smithing', 50, 'smithing');

    return {
      success: true,
      xpGained: xpResult.xpGained,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
    };
  }

  private async processGenericAction(
    characterId: string,
    playerSkills: PlayerSkills,
    request: SkillActionRequest
  ): Promise<SkillActionResult> {
    const skillData = playerSkills.skills.get(request.skill);
    if (!skillData) {
      return { success: false, error: `Skill ${request.skill} not found` };
    }

    // Generic XP grant
    const xpResult = await this.grantXp(characterId, request.skill, 10, request.action);

    return {
      success: true,
      xpGained: xpResult.xpGained,
      leveledUp: xpResult.leveledUp,
      newLevel: xpResult.newLevel,
    };
  }

  // ===========================================================================
  // Calculation Helpers
  // ===========================================================================

  private calculateLevelFromXp(xp: number, maxLevel: number): number {
    for (let level = maxLevel; level >= 1; level--) {
      if (xp >= (XP_TABLE[level - 1] ?? 0)) {
        return level;
      }
    }
    return 1;
  }

  private calculateTotalLevel(skills: Map<SkillName, SkillData>): number {
    let total = 0;
    for (const skillData of skills.values()) {
      total += skillData.level;
    }
    return total;
  }

  private calculateTotalXp(skills: Map<SkillName, SkillData>): number {
    let total = 0;
    for (const skillData of skills.values()) {
      total += skillData.xp;
    }
    return total;
  }

  private calculateCombatLevel(skills: Map<SkillName, SkillData>): number {
    const attack = skills.get('attack')?.level ?? 1;
    const strength = skills.get('strength')?.level ?? 1;
    const defence = skills.get('defence')?.level ?? 1;
    const hitpoints = skills.get('hitpoints')?.level ?? 10;
    const prayer = skills.get('prayer')?.level ?? 1;
    const ranged = skills.get('ranged')?.level ?? 1;
    const magic = skills.get('magic')?.level ?? 1;
    const summoning = skills.get('summoning')?.level ?? 1;

    // RS3 combat level formula
    const base = (defence + hitpoints + Math.floor(prayer / 2) + Math.floor(summoning / 2)) * 0.25;
    const melee = (attack + strength) * 0.325;
    const rangedMagic = Math.max(Math.floor(ranged * 1.5), Math.floor(magic * 1.5)) * 0.325;

    return Math.floor(base + Math.max(melee, rangedMagic));
  }

  private applyXpMultipliers(characterId: string, baseXp: number): number {
    let multiplier = 1.0;

    // In a real implementation, check for:
    // - Outfit bonuses (check equipment)
    // - Active auras
    // - Double XP events
    // - Well of Goodwill bonus
    // For now, return base XP

    return Math.floor(baseXp * multiplier);
  }

  private async validateActionRange(
    characterId: string,
    playerPos: Vector3,
    targetId: string
  ): Promise<boolean> {
    // Get server-authoritative player position
    const serverPos = movementValidator.getPlayerPosition(characterId);
    if (!serverPos) return false;

    // Check if claimed position matches server position (within tolerance)
    const positionDiff = Math.sqrt(
      Math.pow(playerPos.x - serverPos.x, 2) +
      Math.pow(playerPos.y - serverPos.y, 2) +
      Math.pow(playerPos.z - serverPos.z, 2)
    );

    if (positionDiff > 10) {
      return false; // Position mismatch
    }

    // Check distance to target (would look up target position in world)
    // Simplified: assume valid if within 10 units
    return true;
  }

  // ===========================================================================
  // Target Type Helpers
  // ===========================================================================

  private getOreTypeFromTarget(targetId: string): string | null {
    // Parse target ID to get ore type
    // Format: rock_<oretype>_<id>
    const match = targetId.match(/rock_(\w+)_\d+/);
    return match ? match[1] : null;
  }

  private getTreeTypeFromTarget(targetId: string): string | null {
    const match = targetId.match(/tree_(\w+)_\d+/);
    return match ? match[1] : null;
  }

  private getFishTypeFromTarget(targetId: string): string | null {
    const match = targetId.match(/fishing_spot_(\w+)_\d+/);
    return match ? match[1] : null;
  }

  private getMiningLevelRequirement(oreType: string): number {
    const requirements: Record<string, number> = {
      copper_ore: 1,
      tin_ore: 1,
      iron_ore: 15,
      coal: 30,
      mithril_ore: 55,
      adamantite_ore: 70,
      runite_ore: 85,
    };
    return requirements[oreType] ?? 1;
  }

  private getOreRespawnTime(oreType: string): number {
    const respawnTimes: Record<string, number> = {
      copper_ore: 2000,
      tin_ore: 2000,
      iron_ore: 5000,
      coal: 30000,
      mithril_ore: 120000,
      adamantite_ore: 240000,
      runite_ore: 720000,
    };
    return respawnTimes[oreType] ?? 5000;
  }
}

// Export singleton instance
export const skillsService = new SkillsService();
