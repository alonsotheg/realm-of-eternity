/**
 * Skill Service
 *
 * Handles skill progression, XP gains, and level-ups.
 */

import prisma from '../database/index.js';
import {
  SKILLS,
  getLevelFromXp,
  getXpProgress,
  getSkill,
} from './skill-data.js';

export interface SkillGainResult {
  skillId: string;
  xpGained: number;
  newTotalXp: number;
  previousLevel: number;
  newLevel: number;
  leveledUp: boolean;
}

export interface SkillState {
  skillId: string;
  name: string;
  level: number;
  experience: number;
  xpToNextLevel: number;
  progressPercent: number;
}

export class SkillService {
  /**
   * Get all skills for a character
   */
  async getSkills(characterId: string): Promise<SkillState[]> {
    const skills = await prisma.characterSkill.findMany({
      where: { characterId },
    });

    return skills.map((skill) => {
      const definition = getSkill(skill.skillId);
      const progress = getXpProgress(Number(skill.experience));

      return {
        skillId: skill.skillId,
        name: definition?.name ?? skill.skillId,
        level: skill.level,
        experience: Number(skill.experience),
        xpToNextLevel: progress.xpToNextLevel,
        progressPercent: progress.progressPercent,
      };
    });
  }

  /**
   * Get a single skill for a character
   */
  async getSkill(
    characterId: string,
    skillId: string
  ): Promise<SkillState | null> {
    const skill = await prisma.characterSkill.findUnique({
      where: {
        characterId_skillId: { characterId, skillId },
      },
    });

    if (!skill) return null;

    const definition = getSkill(skillId);
    const progress = getXpProgress(Number(skill.experience));

    return {
      skillId: skill.skillId,
      name: definition?.name ?? skill.skillId,
      level: skill.level,
      experience: Number(skill.experience),
      xpToNextLevel: progress.xpToNextLevel,
      progressPercent: progress.progressPercent,
    };
  }

  /**
   * Add XP to a skill
   */
  async addXp(
    characterId: string,
    skillId: string,
    xpAmount: number
  ): Promise<SkillGainResult | null> {
    const skill = await prisma.characterSkill.findUnique({
      where: {
        characterId_skillId: { characterId, skillId },
      },
    });

    if (!skill) return null;

    const definition = getSkill(skillId);
    if (!definition) return null;

    const previousLevel = skill.level;
    const previousXp = Number(skill.experience);
    const newTotalXp = previousXp + xpAmount;
    const newLevel = Math.min(getLevelFromXp(newTotalXp), definition.masteryLevel);
    const leveledUp = newLevel > previousLevel;

    // Update the skill
    await prisma.characterSkill.update({
      where: {
        characterId_skillId: { characterId, skillId },
      },
      data: {
        experience: BigInt(newTotalXp),
        level: newLevel,
      },
    });

    // Log the XP gain
    if (leveledUp) {
      console.log(
        `[Skills] ${characterId} leveled up ${skillId}: ${previousLevel} -> ${newLevel}`
      );

      // Log the level up event
      await prisma.playerAction.create({
        data: {
          characterId,
          action: 'LEVEL_UP',
          details: {
            skillId,
            previousLevel,
            newLevel,
          },
        },
      });
    }

    return {
      skillId,
      xpGained: xpAmount,
      newTotalXp,
      previousLevel,
      newLevel,
      leveledUp,
    };
  }

  /**
   * Add XP to multiple skills at once
   */
  async addXpBatch(
    characterId: string,
    xpGains: Array<{ skillId: string; amount: number }>
  ): Promise<SkillGainResult[]> {
    const results: SkillGainResult[] = [];

    for (const gain of xpGains) {
      const result = await this.addXp(characterId, gain.skillId, gain.amount);
      if (result) {
        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get total level (sum of all skill levels)
   */
  async getTotalLevel(characterId: string): Promise<number> {
    const skills = await prisma.characterSkill.findMany({
      where: { characterId },
      select: { level: true },
    });

    return skills.reduce((sum, s) => sum + s.level, 0);
  }

  /**
   * Get combat level
   */
  async getCombatLevel(characterId: string): Promise<number> {
    const skills = await prisma.characterSkill.findMany({
      where: {
        characterId,
        skillId: { in: ['melee', 'ranged', 'magic', 'defense', 'prayer'] },
      },
    });

    const getLevel = (id: string) =>
      skills.find((s) => s.skillId === id)?.level ?? 1;

    const melee = getLevel('melee');
    const ranged = getLevel('ranged');
    const magic = getLevel('magic');
    const defense = getLevel('defense');
    const prayer = getLevel('prayer');

    const base = defense + Math.floor(prayer / 2);
    const highestCombat = Math.max(melee * 1.3, ranged * 1.3, magic * 1.3);

    return Math.floor((base + highestCombat) / 4);
  }

  /**
   * Check if character meets skill requirements
   */
  async meetsRequirements(
    characterId: string,
    requirements: Record<string, number>
  ): Promise<{ meets: boolean; missing: Array<{ skillId: string; required: number; current: number }> }> {
    const skillIds = Object.keys(requirements);

    const skills = await prisma.characterSkill.findMany({
      where: {
        characterId,
        skillId: { in: skillIds },
      },
    });

    const missing: Array<{ skillId: string; required: number; current: number }> = [];

    for (const [skillId, required] of Object.entries(requirements)) {
      const skill = skills.find((s) => s.skillId === skillId);
      const current = skill?.level ?? 1;

      if (current < required) {
        missing.push({ skillId, required, current });
      }
    }

    return {
      meets: missing.length === 0,
      missing,
    };
  }

  /**
   * Initialize skills for a new character
   */
  async initializeSkills(characterId: string): Promise<void> {
    const skillCreates = SKILLS.map((skill) => ({
      characterId,
      skillId: skill.id,
      level: 1,
      experience: BigInt(0),
    }));

    await prisma.characterSkill.createMany({
      data: skillCreates,
    });
  }
}

export const skillService = new SkillService();
