/**
 * Resource Manager
 *
 * Manages gathering nodes (mining rocks, trees, fishing spots, etc.)
 */

import { v4 as uuidv4 } from 'uuid';
import prisma from '../database/index.js';

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface ResourceTemplate {
  id: string;
  name: string;
  type: ResourceType;
  skillRequired: string;
  levelRequired: number;
  xpGained: number;
  harvestTime: number; // milliseconds
  respawnTime: number; // seconds
  yields: ResourceYield[];
}

export type ResourceType = 'ore' | 'tree' | 'fish' | 'plant' | 'special';

export interface ResourceYield {
  itemId: string;
  quantity: number | [number, number];
  chance: number;
  bonusLevelReq?: number; // Extra chance if above this level
}

export interface ResourceNode {
  id: string;
  templateId: string;
  position: Vector3;
  zoneId: number;
  isDepleted: boolean;
  respawnAt?: number;
}

export class ResourceManager {
  private templates: Map<string, ResourceTemplate> = new Map();
  private nodes: Map<string, ResourceNode> = new Map();
  private nodesByZone: Map<number, Set<string>> = new Map();

  /**
   * Load resource templates
   */
  loadTemplates(templates: ResourceTemplate[]): void {
    for (const template of templates) {
      this.templates.set(template.id, template);
    }
    console.log(
      `[ResourceManager] Loaded ${templates.length} resource templates`
    );
  }

  /**
   * Spawn a resource node
   */
  spawnNode(
    templateId: string,
    position: Vector3,
    zoneId: number
  ): ResourceNode | null {
    const template = this.templates.get(templateId);
    if (!template) {
      console.error(`[ResourceManager] Template not found: ${templateId}`);
      return null;
    }

    const node: ResourceNode = {
      id: uuidv4(),
      templateId,
      position,
      zoneId,
      isDepleted: false,
    };

    this.nodes.set(node.id, node);

    if (!this.nodesByZone.has(zoneId)) {
      this.nodesByZone.set(zoneId, new Set());
    }
    this.nodesByZone.get(zoneId)!.add(node.id);

    return node;
  }

  /**
   * Get nodes in zone
   */
  getNodesInZone(zoneId: number): ResourceNode[] {
    const nodeIds = this.nodesByZone.get(zoneId);
    if (!nodeIds) return [];

    return Array.from(nodeIds)
      .map((id) => this.nodes.get(id))
      .filter((node): node is ResourceNode => node !== undefined);
  }

  /**
   * Get available nodes near position
   */
  getAvailableNodes(
    zoneId: number,
    position: Vector3,
    radius: number,
    resourceType?: ResourceType
  ): ResourceNode[] {
    const nodes = this.getNodesInZone(zoneId);

    return nodes.filter((node) => {
      if (node.isDepleted) return false;

      const template = this.templates.get(node.templateId);
      if (!template) return false;

      if (resourceType && template.type !== resourceType) return false;

      const dist = this.distance(node.position, position);
      return dist <= radius;
    });
  }

  /**
   * Attempt to harvest a resource
   */
  async harvest(
    nodeId: string,
    characterId: string,
    playerLevel: number
  ): Promise<{
    success: boolean;
    error?: string;
    items?: Array<{ itemId: string; quantity: number }>;
    xp?: number;
  }> {
    const node = this.nodes.get(nodeId);
    if (!node) {
      return { success: false, error: 'Node not found' };
    }

    if (node.isDepleted) {
      return { success: false, error: 'Resource is depleted' };
    }

    const template = this.templates.get(node.templateId);
    if (!template) {
      return { success: false, error: 'Invalid resource' };
    }

    if (playerLevel < template.levelRequired) {
      return {
        success: false,
        error: `Requires ${template.skillRequired} level ${template.levelRequired}`,
      };
    }

    // Calculate yields
    const items: Array<{ itemId: string; quantity: number }> = [];

    for (const yield_ of template.yields) {
      let chance = yield_.chance;

      // Bonus chance for higher levels
      if (yield_.bonusLevelReq && playerLevel >= yield_.bonusLevelReq) {
        chance = Math.min(1, chance * 1.5);
      }

      if (Math.random() <= chance) {
        const quantity = Array.isArray(yield_.quantity)
          ? Math.floor(
              Math.random() * (yield_.quantity[1] - yield_.quantity[0] + 1) +
                yield_.quantity[0]
            )
          : yield_.quantity;

        items.push({ itemId: yield_.itemId, quantity });
      }
    }

    // Deplete the node
    node.isDepleted = true;
    node.respawnAt = Date.now() + template.respawnTime * 1000;

    // Log to database for persistence
    await prisma.resourceNode.upsert({
      where: { nodeId: nodeId },
      update: {
        depletedAt: new Date(),
        respawnAt: new Date(node.respawnAt),
      },
      create: {
        nodeId: nodeId,
        resourceType: template.type,
        zoneId: node.zoneId,
        positionX: node.position.x,
        positionY: node.position.y,
        positionZ: node.position.z,
        depletedAt: new Date(),
        respawnAt: new Date(node.respawnAt),
      },
    });

    return {
      success: true,
      items,
      xp: template.xpGained,
    };
  }

  /**
   * Update resources (process respawns)
   */
  update(now: number): void {
    for (const node of this.nodes.values()) {
      if (node.isDepleted && node.respawnAt && now >= node.respawnAt) {
        node.isDepleted = false;
        node.respawnAt = undefined;
      }
    }
  }

  /**
   * Load persisted node states from database
   */
  async loadPersistedStates(): Promise<void> {
    const persisted = await prisma.resourceNode.findMany({
      where: {
        respawnAt: { gt: new Date() },
      },
    });

    for (const record of persisted) {
      const node = this.nodes.get(record.nodeId);
      if (node && record.respawnAt) {
        node.isDepleted = true;
        node.respawnAt = record.respawnAt.getTime();
      }
    }

    console.log(
      `[ResourceManager] Loaded ${persisted.length} depleted node states`
    );
  }

  /**
   * Get template
   */
  getTemplate(templateId: string): ResourceTemplate | undefined {
    return this.templates.get(templateId);
  }

  /**
   * Distance calculation
   */
  private distance(a: Vector3, b: Vector3): number {
    return Math.sqrt(
      Math.pow(a.x - b.x, 2) + Math.pow(a.y - b.y, 2) + Math.pow(a.z - b.z, 2)
    );
  }
}

export const resourceManager = new ResourceManager();
