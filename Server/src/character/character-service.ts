/**
 * Character Service
 *
 * Handles character creation, management, and persistence.
 */

import prisma from '../database/index.js';
import { Race } from '@prisma/client';
import { SKILLS, getXpForLevel } from '../skills/skill-data.js';

const MAX_CHARACTERS_PER_ACCOUNT = 3;

export interface CharacterAppearance {
  skinTone: number;
  hairStyle: number;
  hairColor: number;
  faceShape: number;
  bodyType: number;
  eyeColor: number;
  markings: number;
}

export interface CreateCharacterInput {
  accountId: string;
  name: string;
  race: Race;
  appearance: CharacterAppearance;
}

export interface CharacterSummary {
  id: string;
  name: string;
  race: Race;
  totalLevel: number;
  combatLevel: number;
  playTime: number;
  lastPlayed: Date;
}

export interface CharacterFull {
  id: string;
  name: string;
  race: Race;
  appearance: CharacterAppearance;
  position: { x: number; y: number; z: number };
  rotation: number;
  zoneId: number;
  health: number;
  maxHealth: number;
  mana: number;
  maxMana: number;
  skills: Record<string, { level: number; experience: number }>;
  playTime: number;
}

export class CharacterService {
  /**
   * Get all characters for an account
   */
  async getCharacters(accountId: string): Promise<CharacterSummary[]> {
    const characters = await prisma.character.findMany({
      where: {
        accountId,
        isDeleted: false,
      },
      include: {
        skills: true,
      },
      orderBy: {
        lastPlayed: 'desc',
      },
    });

    return characters.map((char) => {
      const totalLevel = char.skills.reduce((sum, s) => sum + s.level, 0);
      const combatLevel = this.calculateCombatLevel(char.skills);

      return {
        id: char.id,
        name: char.name,
        race: char.race,
        totalLevel,
        combatLevel,
        playTime: char.playTime,
        lastPlayed: char.lastPlayed,
      };
    });
  }

  /**
   * Create a new character
   */
  async createCharacter(
    input: CreateCharacterInput
  ): Promise<{ success: boolean; error?: string; characterId?: string }> {
    // Check character limit
    const existingCount = await prisma.character.count({
      where: {
        accountId: input.accountId,
        isDeleted: false,
      },
    });

    if (existingCount >= MAX_CHARACTERS_PER_ACCOUNT) {
      return {
        success: false,
        error: `Maximum of ${MAX_CHARACTERS_PER_ACCOUNT} characters allowed`,
      };
    }

    // Validate character name
    const nameValidation = this.validateName(input.name);
    if (!nameValidation.valid) {
      return { success: false, error: nameValidation.error };
    }

    // Check if name is taken
    const existingName = await prisma.character.findUnique({
      where: { name: input.name },
    });

    if (existingName) {
      return { success: false, error: 'Character name already taken' };
    }

    // Create character with initial skills
    const character = await prisma.character.create({
      data: {
        accountId: input.accountId,
        name: input.name,
        race: input.race,
        appearance: input.appearance as any,
        // Starting position in Sunhaven Valley
        positionX: 500,
        positionY: 500,
        positionZ: 0,
        rotation: 0,
        zoneId: 1,
        health: 100,
        maxHealth: 100,
        mana: 50,
        maxMana: 50,
        // Create equipment record
        equipment: {
          create: {},
        },
        // Initialize all skills at level 1
        skills: {
          create: SKILLS.map((skill) => ({
            skillId: skill.id,
            level: 1,
            experience: BigInt(0),
          })),
        },
      },
    });

    console.log(`[Character] Created new character: ${character.name}`);

    return {
      success: true,
      characterId: character.id,
    };
  }

  /**
   * Get full character data for gameplay
   */
  async getCharacter(characterId: string): Promise<CharacterFull | null> {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: {
        skills: true,
        equipment: true,
      },
    });

    if (!character || character.isDeleted) {
      return null;
    }

    const skills: Record<string, { level: number; experience: number }> = {};
    for (const skill of character.skills) {
      skills[skill.skillId] = {
        level: skill.level,
        experience: Number(skill.experience),
      };
    }

    return {
      id: character.id,
      name: character.name,
      race: character.race,
      appearance: character.appearance as CharacterAppearance,
      position: {
        x: character.positionX,
        y: character.positionY,
        z: character.positionZ,
      },
      rotation: character.rotation,
      zoneId: character.zoneId,
      health: character.health,
      maxHealth: character.maxHealth,
      mana: character.mana,
      maxMana: character.maxMana,
      skills,
      playTime: character.playTime,
    };
  }

  /**
   * Delete a character (soft delete)
   */
  async deleteCharacter(
    accountId: string,
    characterId: string
  ): Promise<{ success: boolean; error?: string }> {
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character) {
      return { success: false, error: 'Character not found' };
    }

    if (character.accountId !== accountId) {
      return { success: false, error: 'Not authorized' };
    }

    await prisma.character.update({
      where: { id: characterId },
      data: { isDeleted: true },
    });

    console.log(`[Character] Deleted character: ${character.name}`);

    return { success: true };
  }

  /**
   * Update character position
   */
  async updatePosition(
    characterId: string,
    position: { x: number; y: number; z: number },
    rotation: number,
    zoneId: number
  ): Promise<void> {
    await prisma.character.update({
      where: { id: characterId },
      data: {
        positionX: position.x,
        positionY: position.y,
        positionZ: position.z,
        rotation,
        zoneId,
        lastPlayed: new Date(),
      },
    });
  }

  /**
   * Update character health and mana
   */
  async updateVitals(
    characterId: string,
    health: number,
    mana: number
  ): Promise<void> {
    await prisma.character.update({
      where: { id: characterId },
      data: { health, mana },
    });
  }

  /**
   * Update play time
   */
  async addPlayTime(characterId: string, seconds: number): Promise<void> {
    await prisma.character.update({
      where: { id: characterId },
      data: {
        playTime: { increment: seconds },
        lastPlayed: new Date(),
      },
    });
  }

  /**
   * Calculate combat level from skills
   */
  private calculateCombatLevel(
    skills: Array<{ skillId: string; level: number }>
  ): number {
    const getLevel = (id: string) =>
      skills.find((s) => s.skillId === id)?.level ?? 1;

    const melee = getLevel('melee');
    const ranged = getLevel('ranged');
    const magic = getLevel('magic');
    const defense = getLevel('defense');
    const prayer = getLevel('prayer');

    // Combat level formula based on primary combat skills
    const base = defense + Math.floor(prayer / 2);
    const meleeContrib = melee * 1.3;
    const rangedContrib = ranged * 1.3;
    const magicContrib = magic * 1.3;

    const highestCombat = Math.max(meleeContrib, rangedContrib, magicContrib);

    return Math.floor((base + highestCombat) / 4);
  }

  /**
   * Validate character name
   */
  private validateName(name: string): { valid: boolean; error?: string } {
    if (name.length < 3) {
      return { valid: false, error: 'Name must be at least 3 characters' };
    }
    if (name.length > 12) {
      return { valid: false, error: 'Name must be 12 characters or less' };
    }
    if (!/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(name)) {
      return {
        valid: false,
        error: 'Name must start with a letter and contain only letters, numbers, underscores, and hyphens',
      };
    }

    // Check for banned words (expand this list)
    const bannedWords = ['admin', 'moderator', 'gm', 'developer'];
    const lowerName = name.toLowerCase();
    for (const word of bannedWords) {
      if (lowerName.includes(word)) {
        return { valid: false, error: 'Name contains reserved words' };
      }
    }

    return { valid: true };
  }
}

export const characterService = new CharacterService();
