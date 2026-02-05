/**
 * Skill Definitions and XP Tables
 *
 * Core skill system data and calculations.
 */

export interface SkillDefinition {
  id: string;
  name: string;
  category: 'combat' | 'gathering' | 'crafting' | 'support';
  description: string;
  maxLevel: number;
  masteryLevel: number;
}

export const SKILLS: SkillDefinition[] = [
  // Combat Skills
  {
    id: 'melee',
    name: 'Melee',
    category: 'combat',
    description: 'Proficiency with swords, axes, and maces',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'ranged',
    name: 'Ranged',
    category: 'combat',
    description: 'Proficiency with bows, crossbows, and thrown weapons',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'magic',
    name: 'Magic',
    category: 'combat',
    description: 'Cast elemental spells and utility magic',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'defense',
    name: 'Defense',
    category: 'combat',
    description: 'Armor proficiency and damage reduction',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'prayer',
    name: 'Prayer',
    category: 'combat',
    description: 'Divine buffs and protective abilities',
    maxLevel: 99,
    masteryLevel: 120,
  },

  // Gathering Skills
  {
    id: 'mining',
    name: 'Mining',
    category: 'gathering',
    description: 'Extract ores and gems from rock deposits',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'woodcutting',
    name: 'Woodcutting',
    category: 'gathering',
    description: 'Harvest logs from trees',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'fishing',
    name: 'Fishing',
    category: 'gathering',
    description: 'Catch fish and sea creatures',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'hunting',
    name: 'Hunting',
    category: 'gathering',
    description: 'Track and trap animals',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'farming',
    name: 'Farming',
    category: 'gathering',
    description: 'Grow crops and herbs',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'foraging',
    name: 'Foraging',
    category: 'gathering',
    description: 'Find wild plants and herbs',
    maxLevel: 99,
    masteryLevel: 120,
  },

  // Crafting Skills
  {
    id: 'smithing',
    name: 'Smithing',
    category: 'crafting',
    description: 'Forge weapons and armor from metal bars',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'fletching',
    name: 'Fletching',
    category: 'crafting',
    description: 'Create bows and arrows',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'crafting',
    name: 'Crafting',
    category: 'crafting',
    description: 'Create leather goods and jewelry',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'cooking',
    name: 'Cooking',
    category: 'crafting',
    description: 'Prepare food that restores health and grants buffs',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'alchemy',
    name: 'Alchemy',
    category: 'crafting',
    description: 'Brew potions with various effects',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'enchanting',
    name: 'Enchanting',
    category: 'crafting',
    description: 'Add magical properties to items',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'construction',
    name: 'Construction',
    category: 'crafting',
    description: 'Build player housing and furniture',
    maxLevel: 99,
    masteryLevel: 120,
  },

  // Support Skills
  {
    id: 'thieving',
    name: 'Thieving',
    category: 'support',
    description: 'Pickpocket NPCs and pick locks',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'agility',
    name: 'Agility',
    category: 'support',
    description: 'Access shortcuts and reduce run energy drain',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'slayer',
    name: 'Slayer',
    category: 'support',
    description: 'Hunt specific monsters for rewards',
    maxLevel: 99,
    masteryLevel: 120,
  },
  {
    id: 'dungeoneering',
    name: 'Dungeoneering',
    category: 'support',
    description: 'Explore procedural dungeons',
    maxLevel: 99,
    masteryLevel: 120,
  },
];

/**
 * XP required to reach a specific level
 * Formula: level^2 * 100
 */
export function getXpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(Math.pow(level - 1, 2) * 100);
}

/**
 * Total XP required from level 1 to target level
 */
export function getTotalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 2; l <= level; l++) {
    total += getXpForLevel(l);
  }
  return total;
}

/**
 * Calculate level from total XP
 */
export function getLevelFromXp(totalXp: number): number {
  let level = 1;
  let xpRequired = 0;

  while (level < 120) {
    const nextLevelXp = getXpForLevel(level + 1);
    if (xpRequired + nextLevelXp > totalXp) {
      break;
    }
    xpRequired += nextLevelXp;
    level++;
  }

  return level;
}

/**
 * Calculate XP progress towards next level
 */
export function getXpProgress(totalXp: number): {
  currentLevel: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  progressPercent: number;
} {
  const currentLevel = getLevelFromXp(totalXp);
  const xpForCurrentLevel = getTotalXpForLevel(currentLevel);
  const xpIntoLevel = totalXp - xpForCurrentLevel;

  if (currentLevel >= 120) {
    return {
      currentLevel,
      xpIntoLevel,
      xpToNextLevel: 0,
      progressPercent: 100,
    };
  }

  const xpToNextLevel = getXpForLevel(currentLevel + 1);
  const progressPercent = (xpIntoLevel / xpToNextLevel) * 100;

  return {
    currentLevel,
    xpIntoLevel,
    xpToNextLevel,
    progressPercent,
  };
}

/**
 * Get skill by ID
 */
export function getSkill(skillId: string): SkillDefinition | undefined {
  return SKILLS.find((s) => s.id === skillId);
}

/**
 * Get all skills by category
 */
export function getSkillsByCategory(
  category: SkillDefinition['category']
): SkillDefinition[] {
  return SKILLS.filter((s) => s.category === category);
}

// Pre-calculated XP table for levels 1-120
export const XP_TABLE: number[] = [];
for (let level = 1; level <= 120; level++) {
  XP_TABLE[level] = getTotalXpForLevel(level);
}
