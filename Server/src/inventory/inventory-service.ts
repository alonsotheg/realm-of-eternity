/**
 * Inventory Service
 *
 * Handles inventory management, item stacking, and bank operations.
 */

import prisma from '../database/index.js';

const INVENTORY_SIZE = 28;
const BANK_TABS = 10;
const BANK_TAB_SIZE = 50;

export interface InventoryItem {
  slot: number;
  itemId: string;
  quantity: number;
  metadata?: Record<string, any>;
}

export interface BankItem {
  tab: number;
  slot: number;
  itemId: string;
  quantity: number;
  metadata?: Record<string, any>;
}

export interface ItemData {
  id: string;
  name: string;
  stackable: boolean;
  maxStack: number;
}

export class InventoryService {
  // Item data cache (loaded from game data files)
  private itemCache: Map<string, ItemData> = new Map();

  /**
   * Get character's inventory
   */
  async getInventory(characterId: string): Promise<InventoryItem[]> {
    const items = await prisma.inventoryItem.findMany({
      where: { characterId },
      orderBy: { slot: 'asc' },
    });

    return items.map((item) => ({
      slot: item.slot,
      itemId: item.itemId,
      quantity: item.quantity,
      metadata: item.metadata as Record<string, any> | undefined,
    }));
  }

  /**
   * Add item to inventory
   */
  async addItem(
    characterId: string,
    itemId: string,
    quantity: number = 1,
    metadata?: Record<string, any>
  ): Promise<{ success: boolean; slot?: number; error?: string }> {
    const itemData = this.getItemData(itemId);

    if (itemData?.stackable) {
      // Try to stack with existing item
      const existing = await prisma.inventoryItem.findFirst({
        where: { characterId, itemId },
      });

      if (existing) {
        const newQty = existing.quantity + quantity;
        const maxStack = itemData.maxStack || 999999999;

        if (newQty <= maxStack) {
          await prisma.inventoryItem.update({
            where: { id: existing.id },
            data: { quantity: newQty },
          });
          return { success: true, slot: existing.slot };
        }
      }
    }

    // Find empty slot
    const usedSlots = await prisma.inventoryItem.findMany({
      where: { characterId },
      select: { slot: true },
    });

    const usedSlotSet = new Set(usedSlots.map((s) => s.slot));
    let emptySlot = -1;

    for (let i = 0; i < INVENTORY_SIZE; i++) {
      if (!usedSlotSet.has(i)) {
        emptySlot = i;
        break;
      }
    }

    if (emptySlot === -1) {
      return { success: false, error: 'Inventory is full' };
    }

    await prisma.inventoryItem.create({
      data: {
        characterId,
        itemId,
        quantity,
        slot: emptySlot,
        metadata: metadata as any,
      },
    });

    return { success: true, slot: emptySlot };
  }

  /**
   * Remove item from inventory
   */
  async removeItem(
    characterId: string,
    slot: number,
    quantity: number = 1
  ): Promise<{ success: boolean; removed?: number; error?: string }> {
    const item = await prisma.inventoryItem.findUnique({
      where: { characterId_slot: { characterId, slot } },
    });

    if (!item) {
      return { success: false, error: 'No item in slot' };
    }

    if (item.quantity <= quantity) {
      // Remove entire stack
      await prisma.inventoryItem.delete({
        where: { id: item.id },
      });
      return { success: true, removed: item.quantity };
    } else {
      // Reduce quantity
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: item.quantity - quantity },
      });
      return { success: true, removed: quantity };
    }
  }

  /**
   * Remove item by ID
   */
  async removeItemById(
    characterId: string,
    itemId: string,
    quantity: number = 1
  ): Promise<{ success: boolean; removed?: number; error?: string }> {
    const items = await prisma.inventoryItem.findMany({
      where: { characterId, itemId },
      orderBy: { slot: 'asc' },
    });

    let remaining = quantity;
    let totalRemoved = 0;

    for (const item of items) {
      if (remaining <= 0) break;

      if (item.quantity <= remaining) {
        await prisma.inventoryItem.delete({ where: { id: item.id } });
        remaining -= item.quantity;
        totalRemoved += item.quantity;
      } else {
        await prisma.inventoryItem.update({
          where: { id: item.id },
          data: { quantity: item.quantity - remaining },
        });
        totalRemoved += remaining;
        remaining = 0;
      }
    }

    if (totalRemoved === 0) {
      return { success: false, error: 'Item not found in inventory' };
    }

    return { success: true, removed: totalRemoved };
  }

  /**
   * Move item to different slot
   */
  async moveItem(
    characterId: string,
    fromSlot: number,
    toSlot: number
  ): Promise<{ success: boolean; error?: string }> {
    if (toSlot < 0 || toSlot >= INVENTORY_SIZE) {
      return { success: false, error: 'Invalid slot' };
    }

    const [fromItem, toItem] = await Promise.all([
      prisma.inventoryItem.findUnique({
        where: { characterId_slot: { characterId, slot: fromSlot } },
      }),
      prisma.inventoryItem.findUnique({
        where: { characterId_slot: { characterId, slot: toSlot } },
      }),
    ]);

    if (!fromItem) {
      return { success: false, error: 'No item in source slot' };
    }

    if (toItem) {
      // Swap items
      await prisma.$transaction([
        prisma.inventoryItem.update({
          where: { id: fromItem.id },
          data: { slot: -1 }, // Temporary
        }),
        prisma.inventoryItem.update({
          where: { id: toItem.id },
          data: { slot: fromSlot },
        }),
        prisma.inventoryItem.update({
          where: { id: fromItem.id },
          data: { slot: toSlot },
        }),
      ]);
    } else {
      // Move to empty slot
      await prisma.inventoryItem.update({
        where: { id: fromItem.id },
        data: { slot: toSlot },
      });
    }

    return { success: true };
  }

  /**
   * Get item count in inventory
   */
  async getItemCount(characterId: string, itemId: string): Promise<number> {
    const items = await prisma.inventoryItem.findMany({
      where: { characterId, itemId },
    });

    return items.reduce((sum, item) => sum + item.quantity, 0);
  }

  /**
   * Check if has item
   */
  async hasItem(
    characterId: string,
    itemId: string,
    quantity: number = 1
  ): Promise<boolean> {
    const count = await this.getItemCount(characterId, itemId);
    return count >= quantity;
  }

  /**
   * Get empty slot count
   */
  async getEmptySlots(characterId: string): Promise<number> {
    const usedSlots = await prisma.inventoryItem.count({
      where: { characterId },
    });
    return INVENTORY_SIZE - usedSlots;
  }

  // =========================================
  // BANK OPERATIONS
  // =========================================

  /**
   * Get character's bank
   */
  async getBank(characterId: string): Promise<BankItem[]> {
    const items = await prisma.bankItem.findMany({
      where: { characterId },
      orderBy: [{ tab: 'asc' }, { slot: 'asc' }],
    });

    return items.map((item) => ({
      tab: item.tab,
      slot: item.slot,
      itemId: item.itemId,
      quantity: item.quantity,
      metadata: item.metadata as Record<string, any> | undefined,
    }));
  }

  /**
   * Deposit item to bank
   */
  async depositToBank(
    characterId: string,
    inventorySlot: number,
    quantity?: number,
    bankTab: number = 0
  ): Promise<{ success: boolean; error?: string }> {
    const item = await prisma.inventoryItem.findUnique({
      where: { characterId_slot: { characterId, slot: inventorySlot } },
    });

    if (!item) {
      return { success: false, error: 'No item in inventory slot' };
    }

    const depositQty = quantity ?? item.quantity;
    if (depositQty > item.quantity) {
      return { success: false, error: 'Not enough items' };
    }

    // Try to stack in bank
    const itemData = this.getItemData(item.itemId);
    if (itemData?.stackable) {
      const existingBank = await prisma.bankItem.findFirst({
        where: { characterId, itemId: item.itemId, tab: bankTab },
      });

      if (existingBank) {
        await prisma.bankItem.update({
          where: { id: existingBank.id },
          data: { quantity: existingBank.quantity + depositQty },
        });

        // Remove from inventory
        if (depositQty >= item.quantity) {
          await prisma.inventoryItem.delete({ where: { id: item.id } });
        } else {
          await prisma.inventoryItem.update({
            where: { id: item.id },
            data: { quantity: item.quantity - depositQty },
          });
        }

        return { success: true };
      }
    }

    // Find empty bank slot
    const usedSlots = await prisma.bankItem.findMany({
      where: { characterId, tab: bankTab },
      select: { slot: true },
    });

    const usedSlotSet = new Set(usedSlots.map((s) => s.slot));
    let emptySlot = -1;

    for (let i = 0; i < BANK_TAB_SIZE; i++) {
      if (!usedSlotSet.has(i)) {
        emptySlot = i;
        break;
      }
    }

    if (emptySlot === -1) {
      return { success: false, error: 'Bank tab is full' };
    }

    // Create bank item
    await prisma.bankItem.create({
      data: {
        characterId,
        itemId: item.itemId,
        quantity: depositQty,
        tab: bankTab,
        slot: emptySlot,
        metadata: item.metadata,
      },
    });

    // Remove from inventory
    if (depositQty >= item.quantity) {
      await prisma.inventoryItem.delete({ where: { id: item.id } });
    } else {
      await prisma.inventoryItem.update({
        where: { id: item.id },
        data: { quantity: item.quantity - depositQty },
      });
    }

    return { success: true };
  }

  /**
   * Withdraw item from bank
   */
  async withdrawFromBank(
    characterId: string,
    bankTab: number,
    bankSlot: number,
    quantity?: number
  ): Promise<{ success: boolean; error?: string }> {
    const bankItem = await prisma.bankItem.findUnique({
      where: {
        characterId_tab_slot: { characterId, tab: bankTab, slot: bankSlot },
      },
    });

    if (!bankItem) {
      return { success: false, error: 'No item in bank slot' };
    }

    const withdrawQty = quantity ?? bankItem.quantity;
    if (withdrawQty > bankItem.quantity) {
      return { success: false, error: 'Not enough items' };
    }

    // Add to inventory
    const addResult = await this.addItem(
      characterId,
      bankItem.itemId,
      withdrawQty,
      bankItem.metadata as Record<string, any>
    );

    if (!addResult.success) {
      return addResult;
    }

    // Remove from bank
    if (withdrawQty >= bankItem.quantity) {
      await prisma.bankItem.delete({ where: { id: bankItem.id } });
    } else {
      await prisma.bankItem.update({
        where: { id: bankItem.id },
        data: { quantity: bankItem.quantity - withdrawQty },
      });
    }

    return { success: true };
  }

  /**
   * Get item data from cache
   */
  private getItemData(itemId: string): ItemData | undefined {
    return this.itemCache.get(itemId);
  }

  /**
   * Load item data into cache (call on startup)
   */
  loadItemData(items: ItemData[]): void {
    for (const item of items) {
      this.itemCache.set(item.id, item);
    }
    console.log(`[Inventory] Loaded ${items.length} item definitions`);
  }
}

export const inventoryService = new InventoryService();
