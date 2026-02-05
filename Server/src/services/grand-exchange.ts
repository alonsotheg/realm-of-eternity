/**
 * Grand Exchange Service
 *
 * Server-authoritative implementation of the Grand Exchange marketplace.
 * All transactions are validated and processed server-side.
 *
 * Client sends: Intent (request_buy_item, request_sell_item)
 * Server validates, executes, and emits: Result (offer_created, offer_matched)
 */

import { v4 as uuidv4 } from 'uuid';
import { GE_CONFIG } from '../validation/config.js';
import { flagAccount } from '../validation/anticheat-flagger.js';

// ============================================================================
// Types
// ============================================================================

export interface GEOffer {
  id: string;
  characterId: string;
  accountId: string;
  type: 'buy' | 'sell';
  itemId: string;
  quantity: number;
  priceEach: number;
  quantityFilled: number;
  status: 'active' | 'completed' | 'cancelled' | 'expired';
  createdAt: number;
  completedAt?: number;
  slot: number; // 0-7 for the 8 GE slots
}

export interface GETransaction {
  id: string;
  buyOfferId: string;
  sellOfferId: string;
  itemId: string;
  quantity: number;
  priceEach: number;
  totalValue: number;
  transactedAt: number;
}

export interface CreateOfferRequest {
  type: 'buy' | 'sell';
  itemId: string;
  quantity: number;
  priceEach: number;
}

export interface CreateOfferResult {
  success: boolean;
  offer?: GEOffer;
  error?: string;
  errorCode?: GEErrorCode;
}

export type GEErrorCode =
  | 'INSUFFICIENT_GOLD'
  | 'INSUFFICIENT_ITEMS'
  | 'NO_AVAILABLE_SLOT'
  | 'INVALID_ITEM'
  | 'INVALID_QUANTITY'
  | 'INVALID_PRICE'
  | 'ITEM_NOT_TRADEABLE'
  | 'BUY_LIMIT_EXCEEDED'
  | 'RATE_LIMITED';

export interface PlayerInventory {
  gold: number;
  items: Map<string, number>; // itemId -> quantity
}

export interface ItemDefinition {
  id: string;
  name: string;
  tradeable: boolean;
  buyLimit?: number; // Per 4-hour buy limit
  members: boolean;
}

// ============================================================================
// In-Memory Storage (Would be PostgreSQL in production)
// ============================================================================

const activeOffers: Map<string, GEOffer> = new Map();
const playerOffers: Map<string, Set<string>> = new Map(); // characterId -> offerIds
const transactions: GETransaction[] = [];
const buyLimits: Map<string, Map<string, { count: number; resetAt: number }>> = new Map();

// Mock item database (would be loaded from Data/Items)
const itemDatabase: Map<string, ItemDefinition> = new Map([
  ['obsidian_blade', { id: 'obsidian_blade', name: 'Obsidian Blade', tradeable: true, buyLimit: 70, members: true }],
  ['voidfang_whip', { id: 'voidfang_whip', name: 'Voidfang Whip', tradeable: true, buyLimit: 70, members: true }],
  ['gold_coins', { id: 'gold_coins', name: 'Coins', tradeable: false, members: false }],
  ['iron_ore', { id: 'iron_ore', name: 'Iron Ore', tradeable: true, buyLimit: 25000, members: false }],
  ['silverscale_fish', { id: 'silverscale_fish', name: 'Silverscale Fish', tradeable: true, buyLimit: 10000, members: false }],
]);

// Mock player inventories (would be database)
const playerInventories: Map<string, PlayerInventory> = new Map();

// ============================================================================
// Grand Exchange Service
// ============================================================================

export class GrandExchangeService {
  /**
   * Create a new buy or sell offer
   */
  async createOffer(
    characterId: string,
    accountId: string,
    request: CreateOfferRequest
  ): Promise<CreateOfferResult> {
    // Validate request
    const validationResult = await this.validateOfferRequest(
      characterId,
      accountId,
      request
    );

    if (!validationResult.valid) {
      return {
        success: false,
        error: validationResult.error,
        errorCode: validationResult.errorCode,
      };
    }

    // Find available slot
    const slot = this.findAvailableSlot(characterId);
    if (slot === -1) {
      return {
        success: false,
        error: 'No available Grand Exchange slots',
        errorCode: 'NO_AVAILABLE_SLOT',
      };
    }

    // Reserve resources (gold for buy, items for sell)
    if (request.type === 'buy') {
      const totalCost = request.quantity * request.priceEach;
      await this.deductGold(characterId, totalCost);
    } else {
      await this.deductItems(characterId, request.itemId, request.quantity);
    }

    // Create offer
    const offer: GEOffer = {
      id: uuidv4(),
      characterId,
      accountId,
      type: request.type,
      itemId: request.itemId,
      quantity: request.quantity,
      priceEach: request.priceEach,
      quantityFilled: 0,
      status: 'active',
      createdAt: Date.now(),
      slot,
    };

    // Store offer
    activeOffers.set(offer.id, offer);

    const playerOfferSet = playerOffers.get(characterId) ?? new Set();
    playerOfferSet.add(offer.id);
    playerOffers.set(characterId, playerOfferSet);

    // Attempt to match immediately
    await this.matchOffers(offer);

    return {
      success: true,
      offer,
    };
  }

  /**
   * Cancel an existing offer
   */
  async cancelOffer(
    characterId: string,
    offerId: string
  ): Promise<{ success: boolean; error?: string }> {
    const offer = activeOffers.get(offerId);

    if (!offer) {
      return { success: false, error: 'Offer not found' };
    }

    if (offer.characterId !== characterId) {
      await flagAccount(characterId, 'economy_anomaly', {
        reason: 'cancel_other_player_offer',
        offerId,
        offerOwner: offer.characterId,
      });
      return { success: false, error: 'Cannot cancel another player\'s offer' };
    }

    if (offer.status !== 'active') {
      return { success: false, error: 'Offer is not active' };
    }

    // Refund remaining resources
    const remainingQuantity = offer.quantity - offer.quantityFilled;

    if (offer.type === 'buy') {
      const refund = remainingQuantity * offer.priceEach;
      await this.addGold(characterId, refund);
    } else {
      await this.addItems(characterId, offer.itemId, remainingQuantity);
    }

    // Mark as cancelled
    offer.status = 'cancelled';
    offer.completedAt = Date.now();

    return { success: true };
  }

  /**
   * Get all offers for a player
   */
  getPlayerOffers(characterId: string): GEOffer[] {
    const offerIds = playerOffers.get(characterId);
    if (!offerIds) return [];

    const offers: GEOffer[] = [];
    for (const offerId of offerIds) {
      const offer = activeOffers.get(offerId);
      if (offer) {
        offers.push(offer);
      }
    }

    return offers.sort((a, b) => a.slot - b.slot);
  }

  /**
   * Collect completed offer items/gold
   */
  async collectOffer(
    characterId: string,
    offerId: string
  ): Promise<{ success: boolean; collected?: { gold: number; items: Map<string, number> } }> {
    const offer = activeOffers.get(offerId);

    if (!offer || offer.characterId !== characterId) {
      return { success: false };
    }

    const collected: { gold: number; items: Map<string, number> } = {
      gold: 0,
      items: new Map(),
    };

    if (offer.type === 'buy' && offer.quantityFilled > 0) {
      // Buyer collects items
      collected.items.set(offer.itemId, offer.quantityFilled);
      await this.addItems(characterId, offer.itemId, offer.quantityFilled);
    } else if (offer.type === 'sell' && offer.quantityFilled > 0) {
      // Seller collects gold
      // Note: Gold was already added during matching, this is just for tracking
      collected.gold = offer.quantityFilled * offer.priceEach;
    }

    // If fully completed, remove from active offers
    if (offer.status === 'completed' || offer.status === 'cancelled') {
      activeOffers.delete(offerId);
      playerOffers.get(characterId)?.delete(offerId);
    }

    return { success: true, collected };
  }

  // ===========================================================================
  // Validation
  // ===========================================================================

  private async validateOfferRequest(
    characterId: string,
    accountId: string,
    request: CreateOfferRequest
  ): Promise<{ valid: boolean; error?: string; errorCode?: GEErrorCode }> {
    // Validate item exists and is tradeable
    const item = itemDatabase.get(request.itemId);
    if (!item) {
      return { valid: false, error: 'Item not found', errorCode: 'INVALID_ITEM' };
    }

    if (!item.tradeable) {
      await flagAccount(characterId, 'economy_anomaly', {
        reason: 'trade_untradeable_item',
        itemId: request.itemId,
      });
      return { valid: false, error: 'Item cannot be traded', errorCode: 'ITEM_NOT_TRADEABLE' };
    }

    // Validate quantity
    if (request.quantity < 1 || request.quantity > GE_CONFIG.maxQuantityPerOffer) {
      return { valid: false, error: 'Invalid quantity', errorCode: 'INVALID_QUANTITY' };
    }

    // Validate price
    if (request.priceEach < GE_CONFIG.minPricePerItem || request.priceEach > GE_CONFIG.maxPricePerItem) {
      return { valid: false, error: 'Invalid price', errorCode: 'INVALID_PRICE' };
    }

    // Check buy limit for buy offers
    if (request.type === 'buy' && item.buyLimit) {
      const currentBuyCount = this.getBuyCount(characterId, request.itemId);
      if (currentBuyCount + request.quantity > item.buyLimit) {
        return {
          valid: false,
          error: `Buy limit exceeded. Current: ${currentBuyCount}, Limit: ${item.buyLimit}`,
          errorCode: 'BUY_LIMIT_EXCEEDED',
        };
      }
    }

    // Check player has resources
    const inventory = this.getOrCreateInventory(characterId);

    if (request.type === 'buy') {
      const totalCost = request.quantity * request.priceEach;
      if (inventory.gold < totalCost) {
        return {
          valid: false,
          error: `Insufficient gold. Need: ${totalCost}, Have: ${inventory.gold}`,
          errorCode: 'INSUFFICIENT_GOLD',
        };
      }
    } else {
      const heldQuantity = inventory.items.get(request.itemId) ?? 0;
      if (heldQuantity < request.quantity) {
        return {
          valid: false,
          error: `Insufficient items. Need: ${request.quantity}, Have: ${heldQuantity}`,
          errorCode: 'INSUFFICIENT_ITEMS',
        };
      }
    }

    return { valid: true };
  }

  // ===========================================================================
  // Matching Engine
  // ===========================================================================

  private async matchOffers(newOffer: GEOffer): Promise<void> {
    // Find matching offers
    const oppositeType = newOffer.type === 'buy' ? 'sell' : 'buy';
    const matchingOffers: GEOffer[] = [];

    for (const offer of activeOffers.values()) {
      if (
        offer.status === 'active' &&
        offer.type === oppositeType &&
        offer.itemId === newOffer.itemId &&
        offer.characterId !== newOffer.characterId &&
        this.pricesMatch(newOffer, offer)
      ) {
        matchingOffers.push(offer);
      }
    }

    // Sort by best price for the new offer
    if (newOffer.type === 'buy') {
      // Buyer wants lowest sell prices first
      matchingOffers.sort((a, b) => a.priceEach - b.priceEach);
    } else {
      // Seller wants highest buy prices first
      matchingOffers.sort((a, b) => b.priceEach - a.priceEach);
    }

    // Process matches
    for (const matchingOffer of matchingOffers) {
      if (newOffer.quantityFilled >= newOffer.quantity) {
        break; // Fully filled
      }

      const remainingNew = newOffer.quantity - newOffer.quantityFilled;
      const remainingMatch = matchingOffer.quantity - matchingOffer.quantityFilled;
      const tradeQuantity = Math.min(remainingNew, remainingMatch);

      // Determine transaction price (existing offer's price takes precedence)
      const transactionPrice = matchingOffer.priceEach;

      // Execute transaction
      await this.executeTransaction(newOffer, matchingOffer, tradeQuantity, transactionPrice);
    }
  }

  private pricesMatch(newOffer: GEOffer, existingOffer: GEOffer): boolean {
    if (newOffer.type === 'buy') {
      // Buy offer price must be >= sell offer price
      return newOffer.priceEach >= existingOffer.priceEach;
    } else {
      // Sell offer price must be <= buy offer price
      return newOffer.priceEach <= existingOffer.priceEach;
    }
  }

  private async executeTransaction(
    offer1: GEOffer,
    offer2: GEOffer,
    quantity: number,
    priceEach: number
  ): Promise<void> {
    const buyOffer = offer1.type === 'buy' ? offer1 : offer2;
    const sellOffer = offer1.type === 'sell' ? offer1 : offer2;
    const totalValue = quantity * priceEach;

    // Record transaction
    const transaction: GETransaction = {
      id: uuidv4(),
      buyOfferId: buyOffer.id,
      sellOfferId: sellOffer.id,
      itemId: buyOffer.itemId,
      quantity,
      priceEach,
      totalValue,
      transactedAt: Date.now(),
    };

    transactions.push(transaction);

    // Update offers
    buyOffer.quantityFilled += quantity;
    sellOffer.quantityFilled += quantity;

    // Update buy limit tracking
    this.addToBuyLimit(buyOffer.characterId, buyOffer.itemId, quantity);

    // Transfer gold to seller (items are held in escrow until collection)
    await this.addGold(sellOffer.characterId, totalValue);

    // If buyer paid more than transaction price, refund difference
    const buyerPaidPerItem = buyOffer.priceEach;
    if (buyerPaidPerItem > priceEach) {
      const refund = (buyerPaidPerItem - priceEach) * quantity;
      await this.addGold(buyOffer.characterId, refund);
    }

    // Check if offers are complete
    if (buyOffer.quantityFilled >= buyOffer.quantity) {
      buyOffer.status = 'completed';
      buyOffer.completedAt = Date.now();
    }

    if (sellOffer.quantityFilled >= sellOffer.quantity) {
      sellOffer.status = 'completed';
      sellOffer.completedAt = Date.now();
    }

    console.log(`[GE] Transaction: ${quantity}x ${buyOffer.itemId} @ ${priceEach}gp each`);
  }

  // ===========================================================================
  // Inventory Management
  // ===========================================================================

  private getOrCreateInventory(characterId: string): PlayerInventory {
    let inventory = playerInventories.get(characterId);
    if (!inventory) {
      inventory = { gold: 1000000, items: new Map() }; // Start with 1M gold for testing
      playerInventories.set(characterId, inventory);
    }
    return inventory;
  }

  private async deductGold(characterId: string, amount: number): Promise<void> {
    const inventory = this.getOrCreateInventory(characterId);
    inventory.gold -= amount;
    // In production: UPDATE characters SET gold = gold - amount WHERE id = characterId
  }

  private async addGold(characterId: string, amount: number): Promise<void> {
    const inventory = this.getOrCreateInventory(characterId);
    inventory.gold += amount;
  }

  private async deductItems(characterId: string, itemId: string, quantity: number): Promise<void> {
    const inventory = this.getOrCreateInventory(characterId);
    const current = inventory.items.get(itemId) ?? 0;
    inventory.items.set(itemId, current - quantity);
  }

  private async addItems(characterId: string, itemId: string, quantity: number): Promise<void> {
    const inventory = this.getOrCreateInventory(characterId);
    const current = inventory.items.get(itemId) ?? 0;
    inventory.items.set(itemId, current + quantity);
  }

  // ===========================================================================
  // Buy Limit Tracking
  // ===========================================================================

  private getBuyCount(characterId: string, itemId: string): number {
    const playerLimits = buyLimits.get(characterId);
    if (!playerLimits) return 0;

    const itemLimit = playerLimits.get(itemId);
    if (!itemLimit) return 0;

    // Check if reset
    if (Date.now() > itemLimit.resetAt) {
      playerLimits.delete(itemId);
      return 0;
    }

    return itemLimit.count;
  }

  private addToBuyLimit(characterId: string, itemId: string, quantity: number): void {
    let playerLimits = buyLimits.get(characterId);
    if (!playerLimits) {
      playerLimits = new Map();
      buyLimits.set(characterId, playerLimits);
    }

    let itemLimit = playerLimits.get(itemId);
    const now = Date.now();

    if (!itemLimit || now > itemLimit.resetAt) {
      itemLimit = {
        count: 0,
        resetAt: now + GE_CONFIG.buyLimitWindow,
      };
    }

    itemLimit.count += quantity;
    playerLimits.set(itemId, itemLimit);
  }

  // ===========================================================================
  // Utility
  // ===========================================================================

  private findAvailableSlot(characterId: string): number {
    const usedSlots = new Set<number>();
    const offers = this.getPlayerOffers(characterId);

    for (const offer of offers) {
      if (offer.status === 'active') {
        usedSlots.add(offer.slot);
      }
    }

    for (let slot = 0; slot < GE_CONFIG.maxActiveOffers; slot++) {
      if (!usedSlots.has(slot)) {
        return slot;
      }
    }

    return -1;
  }

  /**
   * Get current price for an item (average of recent transactions)
   */
  getItemPrice(itemId: string): { current: number; average24h: number } | null {
    const itemTransactions = transactions.filter(t => t.itemId === itemId);
    if (itemTransactions.length === 0) {
      return null;
    }

    // Current = most recent transaction
    const current = itemTransactions[itemTransactions.length - 1].priceEach;

    // 24h average
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
    const recentTransactions = itemTransactions.filter(t => t.transactedAt > dayAgo);

    const average24h = recentTransactions.length > 0
      ? recentTransactions.reduce((sum, t) => sum + t.priceEach, 0) / recentTransactions.length
      : current;

    return { current, average24h: Math.round(average24h) };
  }

  /**
   * Get player's gold balance
   */
  getPlayerGold(characterId: string): number {
    return this.getOrCreateInventory(characterId).gold;
  }
}

// Export singleton instance
export const grandExchangeService = new GrandExchangeService();
