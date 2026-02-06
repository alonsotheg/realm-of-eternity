/**
 * Realm of Eternity - Backend Server
 *
 * Handles authentication, game saves, and multiplayer features.
 * Uses JSON files for simple storage (no build tools required).
 *
 * Production-ready for free hosting providers (Render, Railway, etc.)
 */

// Load environment variables from .env file (for local development)
try { require('dotenv').config(); } catch (e) { /* dotenv not installed, using system env vars */ }

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// ENVIRONMENT VARIABLES
// ============================================

const JWT_SECRET = process.env.JWT_SECRET;

// Startup validation
if (!JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET environment variable is not set!');
  console.warn('   Authentication will fail. Set JWT_SECRET before deploying.');
  console.warn('   For local development, create a .env file or set the variable.');
}

// ============================================
// DATA DIRECTORY & FILE SETUP
// ============================================

const DATA_DIR = path.join(__dirname, 'Data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SAVES_FILE = path.join(DATA_DIR, 'saves.json');
const LOCATIONS_FILE = path.join(DATA_DIR, 'locations.json');
const BOSSES_FILE = path.join(DATA_DIR, 'bosses.json');
const TRADES_FILE = path.join(DATA_DIR, 'trades.json');
const AUCTIONS_FILE = path.join(DATA_DIR, 'auctions.json');

// Ensure data directory exists
function ensureDataDirectory() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log('📁 Created data directory:', DATA_DIR);
    }
  } catch (err) {
    console.error('❌ Failed to create data directory:', err.message);
  }
}

// ============================================
// SAFE FILE OPERATIONS
// ============================================

// Write queues for atomic file operations (per-file)
const writeQueues = new Map();

/**
 * Load data from JSON file with error recovery
 */
function loadData(file, defaultValue = {}) {
  try {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      // Handle empty files
      if (!content || content.trim() === '') {
        console.warn(`⚠️  Empty file detected: ${path.basename(file)}, using defaults`);
        return defaultValue;
      }
      return JSON.parse(content);
    }
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error(`❌ Corrupted JSON in ${path.basename(file)}: ${err.message}`);
      console.warn(`   Backing up corrupted file and starting fresh`);
      // Backup corrupted file
      try {
        const backupPath = file + '.corrupted.' + Date.now();
        fs.copyFileSync(file, backupPath);
        console.log(`   Backup saved to: ${path.basename(backupPath)}`);
      } catch (backupErr) {
        console.error(`   Could not backup corrupted file: ${backupErr.message}`);
      }
    } else {
      console.error(`❌ Error loading ${path.basename(file)}:`, err.message);
    }
  }
  return defaultValue;
}

/**
 * Atomic save with write queue to prevent concurrent corruption
 */
function saveData(file, data) {
  return new Promise((resolve, reject) => {
    // Initialize queue for this file if needed
    if (!writeQueues.has(file)) {
      writeQueues.set(file, { writing: false, pending: null });
    }

    const queue = writeQueues.get(file);

    // Store the latest data to write
    queue.pending = data;

    // If already writing, the pending data will be written when current write finishes
    if (queue.writing) {
      resolve();
      return;
    }

    // Process the write queue
    processWriteQueue(file).then(resolve).catch(reject);
  });
}

/**
 * Process the write queue for a specific file
 */
async function processWriteQueue(file) {
  const queue = writeQueues.get(file);

  while (queue.pending !== null) {
    queue.writing = true;
    const dataToWrite = queue.pending;
    queue.pending = null;

    try {
      await atomicWrite(file, dataToWrite);
    } catch (err) {
      console.error(`❌ Failed to save ${path.basename(file)}:`, err.message);
      queue.writing = false;
      throw err;
    }
  }

  queue.writing = false;
}

/**
 * Atomic write: write to temp file, then rename
 */
function atomicWrite(file, data) {
  return new Promise((resolve, reject) => {
    const tempFile = file + '.tmp.' + process.pid + '.' + Date.now();
    const content = JSON.stringify(data, null, 2);

    fs.writeFile(tempFile, content, 'utf8', (writeErr) => {
      if (writeErr) {
        // Clean up temp file on error
        try { fs.unlinkSync(tempFile); } catch (e) {}
        reject(writeErr);
        return;
      }

      fs.rename(tempFile, file, (renameErr) => {
        if (renameErr) {
          // Fallback: try direct write if rename fails (cross-device)
          fs.writeFile(file, content, 'utf8', (fallbackErr) => {
            try { fs.unlinkSync(tempFile); } catch (e) {}
            if (fallbackErr) {
              reject(fallbackErr);
            } else {
              resolve();
            }
          });
        } else {
          resolve();
        }
      });
    });
  });
}

/**
 * Synchronous save for backward compatibility (queued internally)
 */
function saveDataSync(file, data) {
  saveData(file, data).catch(err => {
    console.error(`❌ Async save failed for ${path.basename(file)}:`, err.message);
  });
}

// ============================================
// INITIALIZATION
// ============================================

// Ensure data directory exists on startup
ensureDataDirectory();

// Load or initialize data
let users = loadData(USERS_FILE, { nextId: 1, list: {} });
let saves = loadData(SAVES_FILE, {});
let locations = loadData(LOCATIONS_FILE, {});
let bosses = loadData(BOSSES_FILE, {});
let trades = loadData(TRADES_FILE, { nextId: 1, list: {} });
let auctions = loadData(AUCTIONS_FILE, { nextId: 1, list: {} });

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files (the game and all assets)
app.use(express.static(__dirname, {
  index: 'realmofeternity.html',
  extensions: ['html']
}));

// ============================================
// AUTH MIDDLEWARE
// ============================================

function authMiddleware(req, res, next) {
  // Check if JWT_SECRET is configured
  if (!JWT_SECRET) {
    return res.status(500).json({ message: 'Server authentication not configured' });
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}

// ============================================
// AUTH ENDPOINTS
// ============================================

// POST /api/register
app.post('/api/register', async (req, res) => {
  try {
    // Check if JWT_SECRET is configured
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'Server authentication not configured' });
    }

    const { email, password, displayName } = req.body;

    if (!email || !password || !displayName) {
      return res.status(400).json({ message: 'Email, password, and display name are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
    }

    const emailLower = email.toLowerCase();

    // Check if email already exists
    if (users.list[emailLower]) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const userId = users.nextId++;
    users.list[emailLower] = {
      id: userId,
      email: emailLower,
      password: hashedPassword,
      displayName: displayName,
      createdAt: new Date().toISOString()
    };
    saveDataSync(USERS_FILE, users);

    // Initialize player location
    locations[userId] = {
      displayName: displayName,
      totalLevel: 1,
      combatLevel: 4,
      currentLocation: 'Starter Village',
      currentActivity: 'idle',
      lastOnline: new Date().toISOString()
    };
    saveDataSync(LOCATIONS_FILE, locations);

    // Generate token
    const token = jwt.sign({ id: userId, email: emailLower }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: { id: userId, email: emailLower, displayName }
    });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/login
app.post('/api/login', async (req, res) => {
  try {
    // Check if JWT_SECRET is configured
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'Server authentication not configured' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const emailLower = email.toLowerCase();

    // Find user
    const user = users.list[emailLower];
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: { id: user.id, email: user.email, displayName: user.displayName }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/verify
app.get('/api/verify', authMiddleware, (req, res) => {
  try {
    // Find user by ID
    const user = Object.values(users.list).find(u => u.id === req.user.id);
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    res.json({ id: user.id, email: user.email, displayName: user.displayName });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// SAVE/LOAD ENDPOINTS
// ============================================

// POST /api/save
app.post('/api/save', authMiddleware, (req, res) => {
  try {
    const { player, playerIdentity, timestamp, reason } = req.body;
    const userId = req.user.id;

    if (!player) {
      return res.status(400).json({ message: 'Player data required' });
    }

    // Save game data
    saves[userId] = {
      player: player,
      playerIdentity: playerIdentity,
      updatedAt: new Date().toISOString()
    };
    saveDataSync(SAVES_FILE, saves);

    // Update player location for multiplayer
    if (playerIdentity) {
      locations[userId] = {
        displayName: playerIdentity.displayName || 'Adventurer',
        totalLevel: playerIdentity.totalLevel || 1,
        combatLevel: playerIdentity.combatLevel || 4,
        currentLocation: playerIdentity.currentLocation || 'Starter Village',
        currentActivity: playerIdentity.currentActivity || 'idle',
        lastOnline: new Date().toISOString()
      };
      saveDataSync(LOCATIONS_FILE, locations);
    }

    res.json({ success: true, reason });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ message: 'Save failed' });
  }
});

// GET /api/load
app.get('/api/load', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;
    const save = saves[userId];

    if (!save) {
      return res.json({ player: null });
    }

    res.json({ player: save.player, lastSaved: save.updatedAt });
  } catch (err) {
    console.error('Load error:', err);
    res.status(500).json({ message: 'Load failed' });
  }
});

// ============================================
// MULTIPLAYER ENDPOINTS
// ============================================

// GET /api/location/players
app.get('/api/location/players', authMiddleware, (req, res) => {
  try {
    const { location } = req.query;

    if (!location) {
      return res.status(400).json({ message: 'Location required' });
    }

    const now = Date.now();
    const fiveMinutesAgo = now - 5 * 60 * 1000;
    const thirtyMinutesAgo = now - 30 * 60 * 1000;

    // Get players at this location who were online in the last 30 minutes
    const players = Object.entries(locations)
      .filter(([userId, loc]) => {
        const lastOnline = new Date(loc.lastOnline).getTime();
        return loc.currentLocation === location && lastOnline > thirtyMinutesAgo;
      })
      .map(([userId, loc]) => {
        const lastOnline = new Date(loc.lastOnline).getTime();
        return {
          playerId: parseInt(userId),
          displayName: loc.displayName,
          totalLevel: loc.totalLevel,
          combatLevel: loc.combatLevel,
          activity: loc.currentActivity,
          online: lastOnline > fiveMinutesAgo
        };
      })
      .slice(0, 50);

    res.json({ players });
  } catch (err) {
    console.error('Players error:', err);
    res.status(500).json({ message: 'Failed to fetch players' });
  }
});

// GET /api/leaderboard
app.get('/api/leaderboard', (req, res) => {
  try {
    const players = Object.values(locations)
      .sort((a, b) => b.totalLevel - a.totalLevel)
      .slice(0, 20)
      .map(loc => ({
        displayName: loc.displayName,
        totalLevel: loc.totalLevel,
        combatLevel: loc.combatLevel,
        location: loc.currentLocation
      }));

    res.json({ players });
  } catch (err) {
    console.error('Leaderboard error:', err);
    res.status(500).json({ message: 'Failed to fetch leaderboard' });
  }
});

// ============================================
// BOSS FIGHT ENDPOINTS (Multiplayer Group Fights)
// ============================================

// Boss fight timeout - reset inactive fights after 10 minutes
const BOSS_TIMEOUT_MS = 10 * 60 * 1000;

// Helper to clean up stale boss fights
function cleanupStaleBosses() {
  const now = Date.now();
  let changed = false;

  Object.keys(bosses).forEach(bossId => {
    const boss = bosses[bossId];
    if (boss.isActive && (now - boss.lastActivity > BOSS_TIMEOUT_MS)) {
      console.log(`Cleaning up stale boss fight: ${bossId}`);
      delete bosses[bossId];
      changed = true;
    }
  });

  if (changed) {
    saveDataSync(BOSSES_FILE, bosses);
  }
}

// Run cleanup every minute
setInterval(cleanupStaleBosses, 60000);

// ============================================
// TRADE & AUCTION CLEANUP
// ============================================

const TRADE_CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

function cleanupExpiredTradesAndAuctions() {
  const now = Date.now();
  let tradesChanged = false;
  let auctionsChanged = false;
  let savesChanged = false;

  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  // Clean expired trades (real-time trading system)
  Object.keys(trades.list).forEach(tradeId => {
    const trade = trades.list[tradeId];

    // Expire pending trade requests after 5 minutes
    if (trade.phase === 'pending_accept' && new Date(trade.expiresAt).getTime() < now) {
      trade.phase = 'cancelled';
      trade.cancelReason = 'expired';
      trade.lastActivityAt = new Date().toISOString();
      tradesChanged = true;
      console.log(`Trade ${tradeId} request expired`);
    }

    // Expire active trades after 10 minutes of inactivity
    if (['trading', 'review'].includes(trade.phase)) {
      const lastActivity = new Date(trade.lastActivityAt).getTime();
      if (now - lastActivity > 10 * 60 * 1000) {
        trade.phase = 'cancelled';
        trade.cancelReason = 'timeout';
        trade.lastActivityAt = new Date().toISOString();
        tradesChanged = true;
        console.log(`Trade ${tradeId} timed out due to inactivity`);
      }

      // Cancel if either player left the location
      const initiatorLoc = locations[trade.initiatorId]?.currentLocation;
      const partnerLoc = locations[trade.partnerId]?.currentLocation;
      if (initiatorLoc !== trade.location || partnerLoc !== trade.location) {
        trade.phase = 'cancelled';
        trade.cancelReason = 'location_changed';
        trade.lastActivityAt = new Date().toISOString();
        tradesChanged = true;
        console.log(`Trade ${tradeId} cancelled - player left location`);
      }

      // Cancel if either player went offline (5+ min)
      const initiatorOnline = locations[trade.initiatorId]?.lastOnline;
      const partnerOnline = locations[trade.partnerId]?.lastOnline;
      if ((initiatorOnline && new Date(initiatorOnline).getTime() < fiveMinutesAgo) ||
          (partnerOnline && new Date(partnerOnline).getTime() < fiveMinutesAgo)) {
        trade.phase = 'cancelled';
        trade.cancelReason = 'player_offline';
        trade.lastActivityAt = new Date().toISOString();
        tradesChanged = true;
        console.log(`Trade ${tradeId} cancelled - player went offline`);
      }
    }

    // Remove old completed/cancelled trades
    if (['completed', 'cancelled'].includes(trade.phase)) {
      const lastActivity = new Date(trade.lastActivityAt).getTime();
      if (lastActivity < sevenDaysAgo) {
        delete trades.list[tradeId];
        tradesChanged = true;
      }
    }
  });

  // Clean expired auctions
  Object.keys(auctions.list).forEach(auctionId => {
    const auction = auctions.list[auctionId];

    if (auction.status === 'active' && new Date(auction.expiresAt).getTime() < now) {
      auction.status = 'expired';
      // Return items to seller
      const sellerSave = saves[String(auction.sellerId)];
      if (sellerSave?.player) {
        sellerSave.player.inventory[auction.itemId] =
          (sellerSave.player.inventory[auction.itemId] || 0) + auction.quantity;
        sellerSave.updatedAt = new Date().toISOString();
        savesChanged = true;
        console.log(`Auction ${auctionId} expired, returned ${auction.quantity}x ${auction.itemId} to seller ${auction.sellerId}`);
      }
      auctionsChanged = true;
    }

    // Remove old sold/expired/cancelled auctions
    if (['sold', 'expired', 'cancelled'].includes(auction.status)) {
      const updatedTime = auction.soldAt
        ? new Date(auction.soldAt).getTime()
        : new Date(auction.expiresAt).getTime();
      if (updatedTime < sevenDaysAgo) {
        delete auctions.list[auctionId];
        auctionsChanged = true;
      }
    }
  });

  if (tradesChanged) saveDataSync(TRADES_FILE, trades);
  if (auctionsChanged) saveDataSync(AUCTIONS_FILE, auctions);
  if (savesChanged) saveDataSync(SAVES_FILE, saves);
}

// Run trade/auction cleanup every 5 minutes
setInterval(cleanupExpiredTradesAndAuctions, TRADE_CLEANUP_INTERVAL);

// GET /api/boss/state - Get current state of a boss fight
app.get('/api/boss/state', authMiddleware, (req, res) => {
  try {
    const { bossId } = req.query;

    if (!bossId) {
      return res.status(400).json({ message: 'bossId required' });
    }

    const boss = bosses[bossId];

    if (!boss || !boss.isActive) {
      return res.json({ active: false, boss: null });
    }

    // Return boss state with fighter info
    res.json({
      active: true,
      boss: {
        bossId: boss.bossId,
        maxHp: boss.maxHp,
        currentHp: boss.currentHp,
        fighterCount: Object.keys(boss.fighters).length,
        fighters: Object.values(boss.fighters).map(f => ({
          odplayerId: f.odplayerId,
          displayName: f.displayName,
          totalDamageDealt: f.totalDamageDealt
        })),
        startedAt: boss.startedAt
      }
    });
  } catch (err) {
    console.error('Boss state error:', err);
    res.status(500).json({ message: 'Failed to get boss state' });
  }
});

// POST /api/boss/join - Join or start a boss fight
app.post('/api/boss/join', authMiddleware, (req, res) => {
  try {
    const { bossId, bossData } = req.body;
    const userId = req.user.id;

    if (!bossId || !bossData) {
      return res.status(400).json({ message: 'bossId and bossData required' });
    }

    // Get player display name from locations
    const playerLocation = locations[userId];
    const displayName = playerLocation?.displayName || 'Adventurer';

    const now = Date.now();

    if (!bosses[bossId] || !bosses[bossId].isActive) {
      // Start new boss fight
      bosses[bossId] = {
        bossId: bossId,
        maxHp: bossData.hp,
        currentHp: bossData.hp,
        isActive: true,
        fighters: {
          [userId]: {
            odplayerId: userId,
            displayName: displayName,
            totalDamageDealt: 0,
            firstHitTimestamp: now,
            lastHitTimestamp: now
          }
        },
        startedAt: now,
        lastActivity: now
      };
    } else {
      // Join existing fight
      if (!bosses[bossId].fighters[userId]) {
        bosses[bossId].fighters[userId] = {
          odplayerId: userId,
          displayName: displayName,
          totalDamageDealt: 0,
          firstHitTimestamp: now,
          lastHitTimestamp: now
        };
      }
      bosses[bossId].lastActivity = now;
    }

    saveDataSync(BOSSES_FILE, bosses);

    res.json({
      success: true,
      boss: {
        bossId: bosses[bossId].bossId,
        maxHp: bosses[bossId].maxHp,
        currentHp: bosses[bossId].currentHp,
        fighterCount: Object.keys(bosses[bossId].fighters).length
      }
    });
  } catch (err) {
    console.error('Boss join error:', err);
    res.status(500).json({ message: 'Failed to join boss fight' });
  }
});

// POST /api/boss/damage - Record damage dealt to boss
app.post('/api/boss/damage', authMiddleware, (req, res) => {
  try {
    const { bossId, damage } = req.body;
    const userId = req.user.id;

    if (!bossId || typeof damage !== 'number') {
      return res.status(400).json({ message: 'bossId and damage required' });
    }

    const boss = bosses[bossId];

    if (!boss || !boss.isActive) {
      return res.status(400).json({ message: 'Boss fight not active' });
    }

    const now = Date.now();

    // Update boss HP
    const newHp = Math.max(0, boss.currentHp - damage);
    boss.currentHp = newHp;
    boss.lastActivity = now;

    // Update fighter's damage
    if (boss.fighters[userId]) {
      boss.fighters[userId].totalDamageDealt += damage;
      boss.fighters[userId].lastHitTimestamp = now;
    } else {
      // Player joined mid-fight
      const playerLocation = locations[userId];
      boss.fighters[userId] = {
        odplayerId: userId,
        displayName: playerLocation?.displayName || 'Adventurer',
        totalDamageDealt: damage,
        firstHitTimestamp: now,
        lastHitTimestamp: now
      };
    }

    // Check if boss is defeated
    let defeated = false;
    let lootInfo = null;

    if (newHp <= 0) {
      defeated = true;
      boss.isActive = false;

      // Calculate contributions for all fighters
      const totalDamage = Object.values(boss.fighters)
        .reduce((sum, f) => sum + f.totalDamageDealt, 0);

      lootInfo = {
        totalDamage,
        fighters: Object.values(boss.fighters).map(f => ({
          odplayerId: f.odplayerId,
          displayName: f.displayName,
          damageDealt: f.totalDamageDealt,
          contribution: totalDamage > 0 ? f.totalDamageDealt / totalDamage : 0
        }))
      };

      // Keep defeated boss in state briefly for other clients to see result
      setTimeout(() => {
        if (bosses[bossId] && !bosses[bossId].isActive) {
          delete bosses[bossId];
          saveDataSync(BOSSES_FILE, bosses);
        }
      }, 5000);
    }

    saveDataSync(BOSSES_FILE, bosses);

    res.json({
      success: true,
      currentHp: newHp,
      defeated,
      lootInfo,
      yourDamage: boss.fighters[userId]?.totalDamageDealt || 0,
      fighterCount: Object.keys(boss.fighters).length
    });
  } catch (err) {
    console.error('Boss damage error:', err);
    res.status(500).json({ message: 'Failed to record damage' });
  }
});

// POST /api/boss/leave - Leave a boss fight (flee)
app.post('/api/boss/leave', authMiddleware, (req, res) => {
  try {
    const { bossId } = req.body;
    const userId = req.user.id;

    if (!bossId) {
      return res.status(400).json({ message: 'bossId required' });
    }

    const boss = bosses[bossId];

    if (boss && boss.fighters[userId]) {
      delete boss.fighters[userId];

      // If no fighters left, end the fight
      if (Object.keys(boss.fighters).length === 0) {
        delete bosses[bossId];
      }

      saveDataSync(BOSSES_FILE, bosses);
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Boss leave error:', err);
    res.status(500).json({ message: 'Failed to leave boss fight' });
  }
});

// ============================================
// RUNESCAPE-STYLE REAL-TIME TRADING ENDPOINTS
// ============================================

// Helper: Check if player is in an active trade
function getActiveTradeForPlayer(playerId) {
  return Object.values(trades.list).find(trade =>
    (trade.initiatorId === playerId || trade.partnerId === playerId) &&
    ['pending_accept', 'trading', 'review'].includes(trade.phase)
  );
}

// POST /api/trade/request - Send trade request to player at same location
app.post('/api/trade/request', authMiddleware, (req, res) => {
  try {
    const { partnerId } = req.body;
    const initiatorId = req.user.id;

    // Validation
    if (!partnerId || initiatorId === parseInt(partnerId)) {
      return res.status(400).json({ message: 'Invalid trade partner' });
    }

    // Check both players exist
    const initiatorLoc = locations[initiatorId];
    const partnerLoc = locations[partnerId];
    if (!initiatorLoc || !partnerLoc) {
      return res.status(400).json({ message: 'Player not found' });
    }

    // Check both players at same location
    if (initiatorLoc.currentLocation !== partnerLoc.currentLocation) {
      return res.status(400).json({ message: 'Players must be at the same location' });
    }

    // Check neither player is in an active trade
    if (getActiveTradeForPlayer(initiatorId)) {
      return res.status(400).json({ message: 'You are already in a trade' });
    }
    if (getActiveTradeForPlayer(parseInt(partnerId))) {
      return res.status(400).json({ message: 'That player is already in a trade' });
    }

    // Create trade request
    const tradeId = trades.nextId++;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    trades.list[tradeId] = {
      tradeId,
      initiatorId,
      initiatorName: initiatorLoc.displayName || 'Unknown',
      partnerId: parseInt(partnerId),
      partnerName: partnerLoc.displayName || 'Unknown',
      location: initiatorLoc.currentLocation,
      phase: 'pending_accept',
      initiatorOffer: { items: {}, gold: 0 },
      partnerOffer: { items: {}, gold: 0 },
      initiatorReady: false,
      partnerReady: false,
      initiatorConfirmed: false,
      partnerConfirmed: false,
      offerVersion: 1,
      createdAt: now.toISOString(),
      lastActivityAt: now.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    saveDataSync(TRADES_FILE, trades);
    console.log(`Trade ${tradeId} request: ${initiatorId} -> ${partnerId}`);

    res.json({ success: true, tradeId, trade: trades.list[tradeId] });
  } catch (err) {
    console.error('Trade request error:', err);
    res.status(500).json({ message: 'Failed to send trade request' });
  }
});

// POST /api/trade/accept-request - Accept a trade invite
app.post('/api/trade/accept-request', authMiddleware, (req, res) => {
  try {
    const { tradeId } = req.body;
    const userId = req.user.id;

    const trade = trades.list[tradeId];
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.partnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade request' });
    }
    if (trade.phase !== 'pending_accept') {
      return res.status(400).json({ message: 'Trade request no longer pending' });
    }
    if (new Date(trade.expiresAt).getTime() < Date.now()) {
      trade.phase = 'cancelled';
      trade.cancelReason = 'expired';
      saveDataSync(TRADES_FILE, trades);
      return res.status(400).json({ message: 'Trade request expired' });
    }

    // Verify both still at same location
    const initiatorLoc = locations[trade.initiatorId]?.currentLocation;
    const partnerLoc = locations[trade.partnerId]?.currentLocation;
    if (initiatorLoc !== trade.location || partnerLoc !== trade.location) {
      trade.phase = 'cancelled';
      trade.cancelReason = 'location_changed';
      saveDataSync(TRADES_FILE, trades);
      return res.status(400).json({ message: 'Player left the location' });
    }

    // Accept and start trading phase
    const now = new Date();
    trade.phase = 'trading';
    trade.acceptedAt = now.toISOString();
    trade.lastActivityAt = now.toISOString();
    trade.expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString(); // 10 min

    saveDataSync(TRADES_FILE, trades);
    console.log(`Trade ${tradeId} accepted by ${userId}`);

    res.json({ success: true, trade });
  } catch (err) {
    console.error('Trade accept-request error:', err);
    res.status(500).json({ message: 'Failed to accept trade request' });
  }
});

// POST /api/trade/decline - Decline a trade invite
app.post('/api/trade/decline', authMiddleware, (req, res) => {
  try {
    const { tradeId } = req.body;
    const userId = req.user.id;

    const trade = trades.list[tradeId];
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.partnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade request' });
    }
    if (trade.phase !== 'pending_accept') {
      return res.status(400).json({ message: 'Trade request no longer pending' });
    }

    trade.phase = 'cancelled';
    trade.cancelReason = 'declined';
    trade.lastActivityAt = new Date().toISOString();
    saveDataSync(TRADES_FILE, trades);

    console.log(`Trade ${tradeId} declined by ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Trade decline error:', err);
    res.status(500).json({ message: 'Failed to decline trade' });
  }
});

// GET /api/trade/active - Get current active trade session
app.get('/api/trade/active', authMiddleware, (req, res) => {
  try {
    const userId = req.user.id;

    const trade = getActiveTradeForPlayer(userId);
    if (!trade) {
      return res.json({ trade: null, role: null });
    }

    const role = trade.initiatorId === userId ? 'initiator' : 'partner';
    res.json({ trade, role, offerVersion: trade.offerVersion });
  } catch (err) {
    console.error('Trade active error:', err);
    res.status(500).json({ message: 'Failed to get active trade' });
  }
});

// GET /api/trade/state - Poll for trade state updates
app.get('/api/trade/state', authMiddleware, (req, res) => {
  try {
    const { tradeId, version } = req.query;
    const userId = req.user.id;

    const trade = trades.list[tradeId];
    if (!trade) {
      return res.json({ changed: true, trade: null, phase: 'cancelled' });
    }
    if (trade.initiatorId !== userId && trade.partnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }

    const currentVersion = trade.offerVersion;
    if (parseInt(version) === currentVersion && trade.phase !== 'completed' && trade.phase !== 'cancelled') {
      return res.json({ changed: false });
    }

    const role = trade.initiatorId === userId ? 'initiator' : 'partner';
    res.json({ changed: true, trade, role, offerVersion: currentVersion });
  } catch (err) {
    console.error('Trade state error:', err);
    res.status(500).json({ message: 'Failed to get trade state' });
  }
});

// POST /api/trade/update-offer - Update player's offered items/gold
app.post('/api/trade/update-offer', authMiddleware, (req, res) => {
  try {
    const { tradeId, items, gold } = req.body;
    const userId = req.user.id;

    const trade = trades.list[tradeId];
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.initiatorId !== userId && trade.partnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (trade.phase !== 'trading') {
      return res.status(400).json({ message: 'Cannot modify offer in this phase' });
    }

    // Validate player has the offered items/gold
    const playerSave = saves[String(userId)];
    if (!playerSave?.player) {
      return res.status(400).json({ message: 'Player save not found' });
    }

    // Validate items
    if (items) {
      for (const [itemId, qty] of Object.entries(items)) {
        if (qty < 0) {
          return res.status(400).json({ message: 'Invalid quantity' });
        }
        if (qty > 0 && (playerSave.player.inventory[itemId] || 0) < qty) {
          return res.status(400).json({ message: `Insufficient ${itemId}` });
        }
      }
    }

    // Validate gold
    const offerGold = gold || 0;
    if (offerGold < 0) {
      return res.status(400).json({ message: 'Invalid gold amount' });
    }
    if (offerGold > (playerSave.player.gold || 0)) {
      return res.status(400).json({ message: 'Insufficient gold' });
    }

    // Update the appropriate offer
    const isInitiator = trade.initiatorId === userId;
    if (isInitiator) {
      trade.initiatorOffer = { items: items || {}, gold: offerGold };
    } else {
      trade.partnerOffer = { items: items || {}, gold: offerGold };
    }

    // Reset ready flags when offer changes
    trade.initiatorReady = false;
    trade.partnerReady = false;
    trade.offerVersion++;
    trade.lastActivityAt = new Date().toISOString();
    trade.lastModifiedBy = userId;

    saveDataSync(TRADES_FILE, trades);

    res.json({ success: true, offerVersion: trade.offerVersion });
  } catch (err) {
    console.error('Trade update-offer error:', err);
    res.status(500).json({ message: 'Failed to update offer' });
  }
});

// POST /api/trade/toggle-ready - Toggle ready status
app.post('/api/trade/toggle-ready', authMiddleware, (req, res) => {
  try {
    const { tradeId, ready } = req.body;
    const userId = req.user.id;

    const trade = trades.list[tradeId];
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.initiatorId !== userId && trade.partnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (trade.phase !== 'trading') {
      return res.status(400).json({ message: 'Cannot change ready status in this phase' });
    }

    // Update ready status
    const isInitiator = trade.initiatorId === userId;
    if (isInitiator) {
      trade.initiatorReady = ready;
    } else {
      trade.partnerReady = ready;
    }

    trade.offerVersion++;
    trade.lastActivityAt = new Date().toISOString();

    // Check if both are ready -> transition to review
    if (trade.initiatorReady && trade.partnerReady) {
      trade.phase = 'review';
      trade.initiatorConfirmed = false;
      trade.partnerConfirmed = false;
    }

    saveDataSync(TRADES_FILE, trades);

    res.json({
      success: true,
      phase: trade.phase,
      bothReady: trade.initiatorReady && trade.partnerReady,
      offerVersion: trade.offerVersion
    });
  } catch (err) {
    console.error('Trade toggle-ready error:', err);
    res.status(500).json({ message: 'Failed to toggle ready status' });
  }
});

// POST /api/trade/confirm - Confirm trade during review phase
app.post('/api/trade/confirm', authMiddleware, (req, res) => {
  try {
    const { tradeId } = req.body;
    const userId = req.user.id;

    const trade = trades.list[tradeId];
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.initiatorId !== userId && trade.partnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (trade.phase !== 'review') {
      return res.status(400).json({ message: 'Trade is not in review phase' });
    }

    // Set confirm flag
    const isInitiator = trade.initiatorId === userId;
    if (isInitiator) {
      trade.initiatorConfirmed = true;
    } else {
      trade.partnerConfirmed = true;
    }

    trade.offerVersion++;
    trade.lastActivityAt = new Date().toISOString();

    // Check if both confirmed -> execute trade
    if (trade.initiatorConfirmed && trade.partnerConfirmed) {
      // Load both player saves
      const initiatorSave = saves[String(trade.initiatorId)];
      const partnerSave = saves[String(trade.partnerId)];

      if (!initiatorSave?.player || !partnerSave?.player) {
        return res.status(400).json({ message: 'Player data not found' });
      }

      // Final validation - initiator has offered items/gold
      for (const [itemId, qty] of Object.entries(trade.initiatorOffer.items)) {
        if (qty <= 0) continue;
        if ((initiatorSave.player.inventory[itemId] || 0) < qty) {
          trade.phase = 'cancelled';
          trade.cancelReason = 'insufficient_items';
          saveDataSync(TRADES_FILE, trades);
          return res.status(400).json({ message: 'Initiator no longer has offered items' });
        }
      }
      if (trade.initiatorOffer.gold > 0 && (initiatorSave.player.gold || 0) < trade.initiatorOffer.gold) {
        trade.phase = 'cancelled';
        trade.cancelReason = 'insufficient_gold';
        saveDataSync(TRADES_FILE, trades);
        return res.status(400).json({ message: 'Initiator no longer has offered gold' });
      }

      // Final validation - partner has offered items/gold
      for (const [itemId, qty] of Object.entries(trade.partnerOffer.items)) {
        if (qty <= 0) continue;
        if ((partnerSave.player.inventory[itemId] || 0) < qty) {
          trade.phase = 'cancelled';
          trade.cancelReason = 'insufficient_items';
          saveDataSync(TRADES_FILE, trades);
          return res.status(400).json({ message: 'Partner no longer has offered items' });
        }
      }
      if (trade.partnerOffer.gold > 0 && (partnerSave.player.gold || 0) < trade.partnerOffer.gold) {
        trade.phase = 'cancelled';
        trade.cancelReason = 'insufficient_gold';
        saveDataSync(TRADES_FILE, trades);
        return res.status(400).json({ message: 'Partner no longer has offered gold' });
      }

      // Execute trade atomically
      // Initiator gives items/gold to partner
      for (const [itemId, qty] of Object.entries(trade.initiatorOffer.items)) {
        if (qty <= 0) continue;
        initiatorSave.player.inventory[itemId] = (initiatorSave.player.inventory[itemId] || 0) - qty;
        partnerSave.player.inventory[itemId] = (partnerSave.player.inventory[itemId] || 0) + qty;
      }
      if (trade.initiatorOffer.gold > 0) {
        initiatorSave.player.gold = (initiatorSave.player.gold || 0) - trade.initiatorOffer.gold;
        partnerSave.player.gold = (partnerSave.player.gold || 0) + trade.initiatorOffer.gold;
      }

      // Partner gives items/gold to initiator
      for (const [itemId, qty] of Object.entries(trade.partnerOffer.items)) {
        if (qty <= 0) continue;
        partnerSave.player.inventory[itemId] = (partnerSave.player.inventory[itemId] || 0) - qty;
        initiatorSave.player.inventory[itemId] = (initiatorSave.player.inventory[itemId] || 0) + qty;
      }
      if (trade.partnerOffer.gold > 0) {
        partnerSave.player.gold = (partnerSave.player.gold || 0) - trade.partnerOffer.gold;
        initiatorSave.player.gold = (initiatorSave.player.gold || 0) + trade.partnerOffer.gold;
      }

      // Update saves
      initiatorSave.updatedAt = new Date().toISOString();
      partnerSave.updatedAt = new Date().toISOString();

      // Mark trade as completed
      trade.phase = 'completed';
      trade.completedAt = new Date().toISOString();

      saveDataSync(SAVES_FILE, saves);
      saveDataSync(TRADES_FILE, trades);

      console.log(`Trade ${tradeId} completed between ${trade.initiatorId} and ${trade.partnerId}`);
      res.json({ success: true, phase: 'completed', message: 'Trade completed!' });
    } else {
      saveDataSync(TRADES_FILE, trades);
      res.json({
        success: true,
        phase: 'review',
        bothConfirmed: false,
        message: 'Waiting for partner to confirm'
      });
    }
  } catch (err) {
    console.error('Trade confirm error:', err);
    res.status(500).json({ message: 'Failed to confirm trade' });
  }
});

// POST /api/trade/modify - Modify offer during review (returns to trading)
app.post('/api/trade/modify', authMiddleware, (req, res) => {
  try {
    const { tradeId, items, gold } = req.body;
    const userId = req.user.id;

    const trade = trades.list[tradeId];
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.initiatorId !== userId && trade.partnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (trade.phase !== 'review') {
      return res.status(400).json({ message: 'Trade is not in review phase' });
    }

    // Validate player has the offered items/gold
    const playerSave = saves[String(userId)];
    if (!playerSave?.player) {
      return res.status(400).json({ message: 'Player save not found' });
    }

    if (items) {
      for (const [itemId, qty] of Object.entries(items)) {
        if (qty < 0) {
          return res.status(400).json({ message: 'Invalid quantity' });
        }
        if (qty > 0 && (playerSave.player.inventory[itemId] || 0) < qty) {
          return res.status(400).json({ message: `Insufficient ${itemId}` });
        }
      }
    }

    const offerGold = gold || 0;
    if (offerGold < 0 || offerGold > (playerSave.player.gold || 0)) {
      return res.status(400).json({ message: 'Invalid gold amount' });
    }

    // Update offer
    const isInitiator = trade.initiatorId === userId;
    if (isInitiator) {
      trade.initiatorOffer = { items: items || {}, gold: offerGold };
    } else {
      trade.partnerOffer = { items: items || {}, gold: offerGold };
    }

    // Return to trading phase, reset all flags
    trade.phase = 'trading';
    trade.initiatorReady = false;
    trade.partnerReady = false;
    trade.initiatorConfirmed = false;
    trade.partnerConfirmed = false;
    trade.offerVersion++;
    trade.lastActivityAt = new Date().toISOString();
    trade.lastModifiedBy = userId;

    saveDataSync(TRADES_FILE, trades);

    res.json({
      success: true,
      phase: 'trading',
      message: 'Offer modified - returned to trading phase',
      offerVersion: trade.offerVersion
    });
  } catch (err) {
    console.error('Trade modify error:', err);
    res.status(500).json({ message: 'Failed to modify trade' });
  }
});

// POST /api/trade/cancel - Cancel trade at any phase
app.post('/api/trade/cancel', authMiddleware, (req, res) => {
  try {
    const { tradeId } = req.body;
    const userId = req.user.id;

    const trade = trades.list[tradeId];
    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.initiatorId !== userId && trade.partnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (['completed', 'cancelled'].includes(trade.phase)) {
      return res.status(400).json({ message: 'Trade already ended' });
    }

    trade.phase = 'cancelled';
    trade.cancelReason = 'user_cancelled';
    trade.cancelledBy = userId;
    trade.lastActivityAt = new Date().toISOString();
    trade.offerVersion++;

    saveDataSync(TRADES_FILE, trades);

    console.log(`Trade ${tradeId} cancelled by ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Trade cancel error:', err);
    res.status(500).json({ message: 'Failed to cancel trade' });
  }
});

// ============================================
// AUCTION HOUSE ENDPOINTS
// ============================================

// POST /api/auction/create - Create a new auction listing
app.post('/api/auction/create', authMiddleware, (req, res) => {
  try {
    const { itemId, quantity, priceGold, priceItems, durationDays = 3 } = req.body;
    const sellerId = req.user.id;

    // Validation
    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Item and quantity required' });
    }
    if ((!priceGold || priceGold <= 0) && (!priceItems || Object.keys(priceItems).length === 0)) {
      return res.status(400).json({ message: 'Must set a gold price or item price' });
    }
    if (durationDays < 1 || durationDays > 7) {
      return res.status(400).json({ message: 'Duration must be 1-7 days' });
    }

    // Verify seller has items
    const sellerSave = saves[String(sellerId)];
    if (!sellerSave?.player) {
      return res.status(400).json({ message: 'Player save not found' });
    }
    if ((sellerSave.player.inventory[itemId] || 0) < quantity) {
      return res.status(400).json({ message: 'Insufficient items' });
    }

    // Remove items from seller inventory (escrow)
    sellerSave.player.inventory[itemId] = (sellerSave.player.inventory[itemId] || 0) - quantity;
    sellerSave.updatedAt = new Date().toISOString();

    // Create auction
    const auctionId = auctions.nextId++;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    auctions.list[auctionId] = {
      auctionId,
      sellerId,
      sellerName: locations[sellerId]?.displayName || 'Unknown',
      itemId,
      quantity,
      priceGold: priceGold || 0,
      priceItems: priceItems || null,
      status: 'active',
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      buyerId: null,
      soldAt: null
    };

    saveDataSync(SAVES_FILE, saves);
    saveDataSync(AUCTIONS_FILE, auctions);

    console.log(`Auction ${auctionId} created by ${sellerId}: ${quantity}x ${itemId} for ${priceGold}g`);
    res.json({ success: true, auctionId });
  } catch (err) {
    console.error('Auction create error:', err);
    res.status(500).json({ message: 'Failed to create auction' });
  }
});

// GET /api/auction/list - Get auction listings
app.get('/api/auction/list', authMiddleware, (req, res) => {
  try {
    const { itemFilter, myListings } = req.query;
    const userId = req.user.id;
    const now = Date.now();

    const listings = [];
    const myActive = [];

    Object.values(auctions.list).forEach(auction => {
      // Check expiration
      if (auction.status === 'active' && new Date(auction.expiresAt).getTime() < now) {
        auction.status = 'expired';
        // Return items to seller
        const sellerSave = saves[String(auction.sellerId)];
        if (sellerSave?.player) {
          sellerSave.player.inventory[auction.itemId] =
            (sellerSave.player.inventory[auction.itemId] || 0) + auction.quantity;
          sellerSave.updatedAt = new Date().toISOString();
        }
      }

      // Active listings
      if (auction.status === 'active') {
        if (!itemFilter || auction.itemId.toLowerCase().includes(itemFilter.toLowerCase())) {
          listings.push(auction);
        }
      }

      // User's listings (all statuses)
      if (auction.sellerId === userId) {
        myActive.push(auction);
      }
    });

    // Sort by creation date (newest first)
    listings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    myActive.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    saveDataSync(AUCTIONS_FILE, auctions);
    saveDataSync(SAVES_FILE, saves);

    res.json({
      listings: listings.slice(0, 100),
      myListings: myActive
    });
  } catch (err) {
    console.error('Auction list error:', err);
    res.status(500).json({ message: 'Failed to fetch auctions' });
  }
});

// POST /api/auction/buy - Purchase an auction listing
app.post('/api/auction/buy', authMiddleware, (req, res) => {
  try {
    const { auctionId } = req.body;
    const buyerId = req.user.id;

    const auction = auctions.list[auctionId];
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }
    if (auction.status !== 'active') {
      return res.status(400).json({ message: 'Auction is no longer active' });
    }
    if (auction.sellerId === buyerId) {
      return res.status(400).json({ message: 'Cannot buy your own listing' });
    }
    if (new Date(auction.expiresAt).getTime() < Date.now()) {
      auction.status = 'expired';
      saveDataSync(AUCTIONS_FILE, auctions);
      return res.status(400).json({ message: 'Auction has expired' });
    }

    const buyerSave = saves[String(buyerId)];
    const sellerSave = saves[String(auction.sellerId)];

    if (!buyerSave?.player) {
      return res.status(400).json({ message: 'Buyer save not found' });
    }
    if (!sellerSave?.player) {
      return res.status(400).json({ message: 'Seller account not found - cannot complete purchase' });
    }

    // Validate buyer has payment
    if (auction.priceGold > 0) {
      if ((buyerSave.player.gold || 0) < auction.priceGold) {
        return res.status(400).json({ message: 'Insufficient gold' });
      }
    }
    if (auction.priceItems) {
      for (const [itemId, qty] of Object.entries(auction.priceItems)) {
        if ((buyerSave.player.inventory[itemId] || 0) < qty) {
          return res.status(400).json({ message: `Insufficient ${itemId}` });
        }
      }
    }

    // Execute purchase
    // Buyer pays gold
    if (auction.priceGold > 0) {
      buyerSave.player.gold = (buyerSave.player.gold || 0) - auction.priceGold;
      sellerSave.player.gold = (sellerSave.player.gold || 0) + auction.priceGold;
    }
    // Buyer pays items
    if (auction.priceItems) {
      for (const [itemId, qty] of Object.entries(auction.priceItems)) {
        buyerSave.player.inventory[itemId] = (buyerSave.player.inventory[itemId] || 0) - qty;
        sellerSave.player.inventory[itemId] = (sellerSave.player.inventory[itemId] || 0) + qty;
      }
    }

    // Buyer receives items
    buyerSave.player.inventory[auction.itemId] =
      (buyerSave.player.inventory[auction.itemId] || 0) + auction.quantity;

    // Update records
    auction.status = 'sold';
    auction.buyerId = buyerId;
    auction.soldAt = new Date().toISOString();

    buyerSave.updatedAt = new Date().toISOString();
    if (sellerSave) {
      sellerSave.updatedAt = new Date().toISOString();
    }

    saveDataSync(SAVES_FILE, saves);
    saveDataSync(AUCTIONS_FILE, auctions);

    console.log(`Auction ${auctionId} purchased by ${buyerId} for ${auction.priceGold}g`);
    res.json({ success: true, message: 'Purchase successful' });
  } catch (err) {
    console.error('Auction buy error:', err);
    res.status(500).json({ message: 'Failed to complete purchase' });
  }
});

// POST /api/auction/cancel - Cancel an auction listing
app.post('/api/auction/cancel', authMiddleware, (req, res) => {
  try {
    const { auctionId } = req.body;
    const userId = req.user.id;

    const auction = auctions.list[auctionId];
    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }
    if (auction.sellerId !== userId) {
      return res.status(403).json({ message: 'Not your auction' });
    }
    if (auction.status !== 'active') {
      return res.status(400).json({ message: 'Auction is no longer active' });
    }

    // Return items to seller
    const sellerSave = saves[String(userId)];
    if (sellerSave?.player) {
      sellerSave.player.inventory[auction.itemId] =
        (sellerSave.player.inventory[auction.itemId] || 0) + auction.quantity;
      sellerSave.updatedAt = new Date().toISOString();
    }

    auction.status = 'cancelled';

    saveDataSync(SAVES_FILE, saves);
    saveDataSync(AUCTIONS_FILE, auctions);

    console.log(`Auction ${auctionId} cancelled by ${userId}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Auction cancel error:', err);
    res.status(500).json({ message: 'Failed to cancel auction' });
  }
});

// ============================================
// HEALTH CHECK (for hosting providers)
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    authConfigured: !!JWT_SECRET
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

  // Wait for pending writes to complete
  const pendingWrites = [...writeQueues.keys()].map(file => {
    const queue = writeQueues.get(file);
    if (queue.pending !== null) {
      return processWriteQueue(file);
    }
    return Promise.resolve();
  });

  Promise.all(pendingWrites)
    .then(() => {
      console.log('✅ All saves completed. Goodbye!');
      process.exit(0);
    })
    .catch((err) => {
      console.error('❌ Error during shutdown:', err.message);
      process.exit(1);
    });

  // Force exit after 10 seconds if writes don't complete
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('           Realm of Eternity - Server Running              ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`  Status:     ${JWT_SECRET ? '✅ Ready' : '⚠️  JWT_SECRET not set'}`);
  console.log(`  Port:       ${PORT}`);
  console.log(`  Data:       ./data/`);
  console.log('───────────────────────────────────────────────────────────');
  console.log('  Endpoints:');
  console.log('  POST /api/register        Create new account');
  console.log('  POST /api/login           Login to account');
  console.log('  GET  /api/verify          Verify auth token');
  console.log('  POST /api/save            Save game progress');
  console.log('  GET  /api/load            Load game progress');
  console.log('  GET  /api/location/players Get players at location');
  console.log('  GET  /api/leaderboard     View top players');
  console.log('  GET  /api/boss/state      Get boss fight state');
  console.log('  POST /api/boss/join       Join boss fight');
  console.log('  POST /api/boss/damage     Record boss damage');
  console.log('  POST /api/boss/leave      Leave boss fight');
  console.log('  POST /api/trade/request   Send trade request');
  console.log('  POST /api/trade/accept-request  Accept trade invite');
  console.log('  POST /api/trade/decline   Decline trade invite');
  console.log('  GET  /api/trade/active    Get active trade session');
  console.log('  GET  /api/trade/state     Poll trade state');
  console.log('  POST /api/trade/update-offer  Update offered items');
  console.log('  POST /api/trade/toggle-ready  Toggle ready status');
  console.log('  POST /api/trade/confirm   Confirm trade');
  console.log('  POST /api/trade/modify    Modify during review');
  console.log('  POST /api/trade/cancel    Cancel trade');
  console.log('  POST /api/auction/create  Create auction listing');
  console.log('  GET  /api/auction/list    Browse auctions');
  console.log('  POST /api/auction/buy     Purchase auction');
  console.log('  POST /api/auction/cancel  Cancel auction listing');
  console.log('  GET  /api/health          Health check');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});
