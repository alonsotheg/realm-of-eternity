/**
 * Realm of Eternity - Backend Server
 *
 * Handles authentication, game saves, and multiplayer features.
 * Uses MongoDB for persistent storage.
 *
 * Production-ready for free hosting providers (Render, Railway, etc.)
 */

// Load environment variables from .env file (for local development)
try { require('dotenv').config(); } catch (e) { /* dotenv not installed, using system env vars */ }

const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion } = require('mongodb');
const http = require('http');
const { Server } = require('socket.io');
const worldChat = require('./worldChat');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
worldChat(io);
const PORT = process.env.PORT || 3000;

// ============================================
// ENVIRONMENT VARIABLES
// ============================================

const JWT_SECRET = process.env.JWT_SECRET;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/realmofeternity';

// Startup validation
if (!JWT_SECRET) {
  console.warn('⚠️  WARNING: JWT_SECRET environment variable is not set!');
  console.warn('   Authentication will fail. Set JWT_SECRET before deploying.');
}

if (!process.env.MONGODB_URI) {
  console.warn('⚠️  WARNING: MONGODB_URI not set, using local MongoDB');
}

// ============================================
// MONGODB CONNECTION
// ============================================

let db = null;
let usersCollection = null;
let savesCollection = null;
let locationsCollection = null;
let bossesCollection = null;
let tradesCollection = null;
let auctionsCollection = null;
let countersCollection = null;

const mongoClient = new MongoClient(MONGODB_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
});

async function connectToMongoDB() {
  try {
    await mongoClient.connect();
    await mongoClient.db("admin").command({ ping: 1 });

    db = mongoClient.db('realmofeternity');

    // Initialize collections
    usersCollection = db.collection('users');
    savesCollection = db.collection('saves');
    locationsCollection = db.collection('locations');
    bossesCollection = db.collection('bosses');
    tradesCollection = db.collection('trades');
    auctionsCollection = db.collection('auctions');
    countersCollection = db.collection('counters');

    // Create indexes for better performance
    await usersCollection.createIndex({ email: 1 }, { unique: true });
    await usersCollection.createIndex({ odId: 1 }, { unique: true });
    await savesCollection.createIndex({ oduserId: 1 }, { unique: true });
    await locationsCollection.createIndex({ oduserId: 1 }, { unique: true });
    await locationsCollection.createIndex({ currentLocation: 1, lastOnline: -1 });
    await bossesCollection.createIndex({ bossId: 1 });
    await tradesCollection.createIndex({ odinitiatorId: 1 });
    await tradesCollection.createIndex({ odpartnerId: 1 });
    await auctionsCollection.createIndex({ odsellerId: 1 });
    await auctionsCollection.createIndex({ status: 1, expiresAt: 1 });

    // Initialize counters if they don't exist
    await countersCollection.updateOne(
      { _id: 'userId' },
      { $setOnInsert: { seq: 0 } },
      { upsert: true }
    );
    await countersCollection.updateOne(
      { _id: 'tradeId' },
      { $setOnInsert: { seq: 0 } },
      { upsert: true }
    );
    await countersCollection.updateOne(
      { _id: 'auctionId' },
      { $setOnInsert: { seq: 0 } },
      { upsert: true }
    );

    console.log('✅ Connected to MongoDB successfully!');
    return true;
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB:', err.message);
    return false;
  }
}

// Helper: Get next sequence value for auto-incrementing IDs
async function getNextSequence(name) {
  const result = await countersCollection.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { returnDocument: 'after' }
  );
  return result.seq;
}

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

// Database connection check middleware
function requireDB(req, res, next) {
  if (!db) {
    return res.status(503).json({ message: 'Database not connected' });
  }
  next();
}

// ============================================
// AUTH MIDDLEWARE
// ============================================

function authMiddleware(req, res, next) {
  if (!JWT_SECRET) {
    return res.status(500).json({ message: 'Server authentication not configured' });
  }
  if (!db) {
    return res.status(503).json({ message: 'Database not connected' });
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
app.post('/api/register', requireDB, async (req, res) => {
  try {
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
    const existingUser = await usersCollection.findOne({ email: emailLower });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already registered' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Get next user ID
    const userId = await getNextSequence('userId');

    // Create user
    await usersCollection.insertOne({
      odId: userId,
      email: emailLower,
      password: hashedPassword,
      displayName: displayName,
      createdAt: new Date()
    });

    // Initialize player location
    await locationsCollection.insertOne({
      oduserId: userId,
      displayName: displayName,
      totalLevel: 1,
      combatLevel: 4,
      currentLocation: 'Starter Village',
      currentActivity: 'idle',
      lastOnline: new Date()
    });

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
app.post('/api/login', requireDB, async (req, res) => {
  try {
    if (!JWT_SECRET) {
      return res.status(500).json({ message: 'Server authentication not configured' });
    }

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }

    const emailLower = email.toLowerCase();

    // Find user
    const user = await usersCollection.findOne({ email: emailLower });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate token
    const token = jwt.sign({ id: user.odId, email: user.email }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      token,
      user: { id: user.odId, email: user.email, displayName: user.displayName }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/verify
app.get('/api/verify', authMiddleware, async (req, res) => {
  try {
    const user = await usersCollection.findOne({ odId: req.user.id });
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }
    res.json({ id: user.odId, email: user.email, displayName: user.displayName });
  } catch (err) {
    console.error('Verify error:', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// ============================================
// SAVE/LOAD ENDPOINTS
// ============================================

// POST /api/save
app.post('/api/save', authMiddleware, async (req, res) => {
  try {
    const { player, playerIdentity, timestamp, reason } = req.body;
    const userId = req.user.id;

    if (!player) {
      return res.status(400).json({ message: 'Player data required' });
    }

    // Save game data (upsert)
    await savesCollection.updateOne(
      { oduserId: userId },
      {
        $set: {
          oduserId: userId,
          player: player,
          playerIdentity: playerIdentity,
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    // Update player location for multiplayer
    if (playerIdentity) {
      await locationsCollection.updateOne(
        { oduserId: userId },
        {
          $set: {
            oduserId: userId,
            displayName: playerIdentity.displayName || 'Adventurer',
            totalLevel: playerIdentity.totalLevel || 1,
            combatLevel: playerIdentity.combatLevel || 4,
            currentLocation: playerIdentity.currentLocation || 'Starter Village',
            currentActivity: playerIdentity.currentActivity || 'idle',
            lastOnline: new Date()
          }
        },
        { upsert: true }
      );
    }

    res.json({ success: true, reason });
  } catch (err) {
    console.error('Save error:', err);
    res.status(500).json({ message: 'Save failed' });
  }
});

// GET /api/load
app.get('/api/load', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const save = await savesCollection.findOne({ oduserId: userId });

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
app.get('/api/location/players', authMiddleware, async (req, res) => {
  try {
    const { location } = req.query;

    if (!location) {
      return res.status(400).json({ message: 'Location required' });
    }

    const now = new Date();
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // Get players at this location who were online in the last 30 minutes
    const playerDocs = await locationsCollection.find({
      currentLocation: location,
      lastOnline: { $gt: thirtyMinutesAgo }
    }).limit(50).toArray();

    const players = playerDocs.map(loc => ({
      playerId: loc.oduserId,
      displayName: loc.displayName,
      totalLevel: loc.totalLevel,
      combatLevel: loc.combatLevel,
      activity: loc.currentActivity,
      online: loc.lastOnline > fiveMinutesAgo
    }));

    res.json({ players });
  } catch (err) {
    console.error('Players error:', err);
    res.status(500).json({ message: 'Failed to fetch players' });
  }
});

// GET /api/leaderboard
app.get('/api/leaderboard', requireDB, async (req, res) => {
  try {
    const playerDocs = await locationsCollection.find({})
      .sort({ totalLevel: -1 })
      .limit(20)
      .toArray();

    const players = playerDocs.map(loc => ({
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

const BOSS_TIMEOUT_MS = 10 * 60 * 1000;

// Helper to clean up stale boss fights
async function cleanupStaleBosses() {
  if (!db) return;

  try {
    const cutoff = new Date(Date.now() - BOSS_TIMEOUT_MS);
    await bossesCollection.deleteMany({
      isActive: true,
      lastActivity: { $lt: cutoff }
    });
  } catch (err) {
    console.error('Boss cleanup error:', err);
  }
}

// Run cleanup every minute
setInterval(cleanupStaleBosses, 60000);

// GET /api/boss/state
app.get('/api/boss/state', authMiddleware, async (req, res) => {
  try {
    const { bossId } = req.query;

    if (!bossId) {
      return res.status(400).json({ message: 'bossId required' });
    }

    const boss = await bossesCollection.findOne({ bossId, isActive: true });

    if (!boss) {
      return res.json({ active: false, boss: null });
    }

    res.json({
      active: true,
      boss: {
        bossId: boss.bossId,
        maxHp: boss.maxHp,
        currentHp: boss.currentHp,
        fighterCount: Object.keys(boss.fighters || {}).length,
        fighters: Object.values(boss.fighters || {}).map(f => ({
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

// POST /api/boss/join
app.post('/api/boss/join', authMiddleware, async (req, res) => {
  try {
    const { bossId, bossData } = req.body;
    const userId = req.user.id;

    if (!bossId || !bossData) {
      return res.status(400).json({ message: 'bossId and bossData required' });
    }

    const playerLocation = await locationsCollection.findOne({ oduserId: userId });
    const displayName = playerLocation?.displayName || 'Adventurer';

    const now = new Date();

    // Try to find existing boss fight
    let boss = await bossesCollection.findOne({ bossId, isActive: true });

    if (!boss) {
      // Start new boss fight
      boss = {
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
      await bossesCollection.insertOne(boss);
    } else {
      // Join existing fight
      await bossesCollection.updateOne(
        { bossId, isActive: true },
        {
          $set: {
            [`fighters.${userId}`]: {
              odplayerId: userId,
              displayName: displayName,
              totalDamageDealt: 0,
              firstHitTimestamp: now,
              lastHitTimestamp: now
            },
            lastActivity: now
          }
        }
      );
      boss = await bossesCollection.findOne({ bossId, isActive: true });
    }

    res.json({
      success: true,
      boss: {
        bossId: boss.bossId,
        maxHp: boss.maxHp,
        currentHp: boss.currentHp,
        fighterCount: Object.keys(boss.fighters || {}).length
      }
    });
  } catch (err) {
    console.error('Boss join error:', err);
    res.status(500).json({ message: 'Failed to join boss fight' });
  }
});

// POST /api/boss/damage
app.post('/api/boss/damage', authMiddleware, async (req, res) => {
  try {
    const { bossId, damage } = req.body;
    const userId = req.user.id;

    if (!bossId || typeof damage !== 'number') {
      return res.status(400).json({ message: 'bossId and damage required' });
    }

    const boss = await bossesCollection.findOne({ bossId, isActive: true });

    if (!boss) {
      return res.status(400).json({ message: 'Boss fight not active' });
    }

    const now = new Date();
    const newHp = Math.max(0, boss.currentHp - damage);

    // Update boss HP and fighter damage
    const updateObj = {
      $set: {
        currentHp: newHp,
        lastActivity: now,
        [`fighters.${userId}.lastHitTimestamp`]: now
      },
      $inc: {
        [`fighters.${userId}.totalDamageDealt`]: damage
      }
    };

    // If player not in fighters, add them
    if (!boss.fighters[userId]) {
      const playerLocation = await locationsCollection.findOne({ oduserId: userId });
      updateObj.$set[`fighters.${userId}`] = {
        odplayerId: userId,
        displayName: playerLocation?.displayName || 'Adventurer',
        totalDamageDealt: damage,
        firstHitTimestamp: now,
        lastHitTimestamp: now
      };
      delete updateObj.$inc[`fighters.${userId}.totalDamageDealt`];
    }

    let defeated = false;
    let lootInfo = null;

    if (newHp <= 0) {
      defeated = true;
      updateObj.$set.isActive = false;

      const totalDamage = Object.values(boss.fighters)
        .reduce((sum, f) => sum + f.totalDamageDealt, 0) + damage;

      lootInfo = {
        totalDamage,
        fighters: Object.values(boss.fighters).map(f => ({
          odplayerId: f.odplayerId,
          displayName: f.displayName,
          damageDealt: f.totalDamageDealt + (f.odplayerId === userId ? damage : 0),
          contribution: totalDamage > 0 ? (f.totalDamageDealt + (f.odplayerId === userId ? damage : 0)) / totalDamage : 0
        }))
      };
    }

    await bossesCollection.updateOne({ bossId, isActive: true }, updateObj);

    const updatedBoss = await bossesCollection.findOne({ bossId });

    res.json({
      success: true,
      currentHp: newHp,
      defeated,
      lootInfo,
      yourDamage: updatedBoss?.fighters?.[userId]?.totalDamageDealt || damage,
      fighterCount: Object.keys(updatedBoss?.fighters || {}).length
    });
  } catch (err) {
    console.error('Boss damage error:', err);
    res.status(500).json({ message: 'Failed to record damage' });
  }
});

// POST /api/boss/leave
app.post('/api/boss/leave', authMiddleware, async (req, res) => {
  try {
    const { bossId } = req.body;
    const userId = req.user.id;

    if (!bossId) {
      return res.status(400).json({ message: 'bossId required' });
    }

    const boss = await bossesCollection.findOne({ bossId, isActive: true });

    if (boss && boss.fighters[userId]) {
      const remainingFighters = Object.keys(boss.fighters).filter(id => id !== String(userId));

      if (remainingFighters.length === 0) {
        await bossesCollection.deleteOne({ bossId, isActive: true });
      } else {
        await bossesCollection.updateOne(
          { bossId, isActive: true },
          { $unset: { [`fighters.${userId}`]: 1 } }
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Boss leave error:', err);
    res.status(500).json({ message: 'Failed to leave boss fight' });
  }
});

// ============================================
// TRADE & AUCTION CLEANUP
// ============================================

const TRADE_CLEANUP_INTERVAL = 5 * 60 * 1000;

async function cleanupExpiredTradesAndAuctions() {
  if (!db) return;

  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);

    // Expire pending trade requests
    await tradesCollection.updateMany(
      { phase: 'pending_accept', expiresAt: { $lt: now } },
      { $set: { phase: 'cancelled', cancelReason: 'expired', lastActivityAt: now } }
    );

    // Expire inactive trades
    await tradesCollection.updateMany(
      { phase: { $in: ['trading', 'review'] }, lastActivityAt: { $lt: tenMinutesAgo } },
      { $set: { phase: 'cancelled', cancelReason: 'timeout', lastActivityAt: now } }
    );

    // Remove old completed/cancelled trades
    await tradesCollection.deleteMany({
      phase: { $in: ['completed', 'cancelled'] },
      lastActivityAt: { $lt: sevenDaysAgo }
    });

    // Handle expired auctions
    const expiredAuctions = await auctionsCollection.find({
      status: 'active',
      expiresAt: { $lt: now }
    }).toArray();

    for (const auction of expiredAuctions) {
      // Return items to seller
      await savesCollection.updateOne(
        { oduserId: auction.odsellerId },
        { $inc: { [`player.inventory.${auction.itemId}`]: auction.quantity } }
      );

      await auctionsCollection.updateOne(
        { _id: auction._id },
        { $set: { status: 'expired' } }
      );
    }

    // Remove old auctions
    await auctionsCollection.deleteMany({
      status: { $in: ['sold', 'expired', 'cancelled'] },
      expiresAt: { $lt: sevenDaysAgo }
    });

  } catch (err) {
    console.error('Cleanup error:', err);
  }
}

setInterval(cleanupExpiredTradesAndAuctions, TRADE_CLEANUP_INTERVAL);

// ============================================
// TRADE ENDPOINTS
// ============================================

async function getActiveTradeForPlayer(playerId) {
  return await tradesCollection.findOne({
    $or: [{ odinitiatorId: playerId }, { odpartnerId: playerId }],
    phase: { $in: ['pending_accept', 'trading', 'review'] }
  });
}

// POST /api/trade/request
app.post('/api/trade/request', authMiddleware, async (req, res) => {
  try {
    const { partnerId } = req.body;
    const initiatorId = req.user.id;

    if (!partnerId || initiatorId === parseInt(partnerId)) {
      return res.status(400).json({ message: 'Invalid trade partner' });
    }

    const initiatorLoc = await locationsCollection.findOne({ oduserId: initiatorId });
    const partnerLoc = await locationsCollection.findOne({ oduserId: parseInt(partnerId) });

    if (!initiatorLoc || !partnerLoc) {
      return res.status(400).json({ message: 'Player not found' });
    }

    if (initiatorLoc.currentLocation !== partnerLoc.currentLocation) {
      return res.status(400).json({ message: 'Players must be at the same location' });
    }

    if (await getActiveTradeForPlayer(initiatorId)) {
      return res.status(400).json({ message: 'You are already in a trade' });
    }
    if (await getActiveTradeForPlayer(parseInt(partnerId))) {
      return res.status(400).json({ message: 'That player is already in a trade' });
    }

    const tradeId = await getNextSequence('tradeId');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000);

    const trade = {
      odtradeId: tradeId,
      odinitiatorId: initiatorId,
      initiatorName: initiatorLoc.displayName || 'Unknown',
      odpartnerId: parseInt(partnerId),
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
      createdAt: now,
      lastActivityAt: now,
      expiresAt: expiresAt
    };

    await tradesCollection.insertOne(trade);

    res.json({ success: true, tradeId, trade });
  } catch (err) {
    console.error('Trade request error:', err);
    res.status(500).json({ message: 'Failed to send trade request' });
  }
});

// POST /api/trade/accept-request
app.post('/api/trade/accept-request', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const userId = req.user.id;

    const trade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });

    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.odpartnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade request' });
    }
    if (trade.phase !== 'pending_accept') {
      return res.status(400).json({ message: 'Trade request no longer pending' });
    }
    if (new Date(trade.expiresAt).getTime() < Date.now()) {
      await tradesCollection.updateOne(
        { odtradeId: parseInt(tradeId) },
        { $set: { phase: 'cancelled', cancelReason: 'expired' } }
      );
      return res.status(400).json({ message: 'Trade request expired' });
    }

    const now = new Date();
    await tradesCollection.updateOne(
      { odtradeId: parseInt(tradeId) },
      {
        $set: {
          phase: 'trading',
          acceptedAt: now,
          lastActivityAt: now,
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000)
        }
      }
    );

    const updatedTrade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });
    res.json({ success: true, trade: updatedTrade });
  } catch (err) {
    console.error('Trade accept-request error:', err);
    res.status(500).json({ message: 'Failed to accept trade request' });
  }
});

// POST /api/trade/decline
app.post('/api/trade/decline', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const userId = req.user.id;

    const trade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });

    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.odpartnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade request' });
    }
    if (trade.phase !== 'pending_accept') {
      return res.status(400).json({ message: 'Trade request no longer pending' });
    }

    await tradesCollection.updateOne(
      { odtradeId: parseInt(tradeId) },
      { $set: { phase: 'cancelled', cancelReason: 'declined', lastActivityAt: new Date() } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Trade decline error:', err);
    res.status(500).json({ message: 'Failed to decline trade' });
  }
});

// GET /api/trade/active
app.get('/api/trade/active', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const trade = await getActiveTradeForPlayer(userId);

    if (!trade) {
      return res.json({ trade: null, role: null });
    }

    const role = trade.odinitiatorId === userId ? 'initiator' : 'partner';
    res.json({ trade, role, offerVersion: trade.offerVersion });
  } catch (err) {
    console.error('Trade active error:', err);
    res.status(500).json({ message: 'Failed to get active trade' });
  }
});

// GET /api/trade/state
app.get('/api/trade/state', authMiddleware, async (req, res) => {
  try {
    const { tradeId, version } = req.query;
    const userId = req.user.id;

    const trade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });

    if (!trade) {
      return res.json({ changed: true, trade: null, phase: 'cancelled' });
    }
    if (trade.odinitiatorId !== userId && trade.odpartnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }

    if (parseInt(version) === trade.offerVersion && trade.phase !== 'completed' && trade.phase !== 'cancelled') {
      return res.json({ changed: false });
    }

    const role = trade.odinitiatorId === userId ? 'initiator' : 'partner';
    res.json({ changed: true, trade, role, offerVersion: trade.offerVersion });
  } catch (err) {
    console.error('Trade state error:', err);
    res.status(500).json({ message: 'Failed to get trade state' });
  }
});

// POST /api/trade/update-offer
app.post('/api/trade/update-offer', authMiddleware, async (req, res) => {
  try {
    const { tradeId, items, gold } = req.body;
    const userId = req.user.id;

    const trade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });

    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.odinitiatorId !== userId && trade.odpartnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (trade.phase !== 'trading') {
      return res.status(400).json({ message: 'Cannot modify offer in this phase' });
    }

    const playerSave = await savesCollection.findOne({ oduserId: userId });
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

    const isInitiator = trade.odinitiatorId === userId;
    const offerField = isInitiator ? 'initiatorOffer' : 'partnerOffer';

    await tradesCollection.updateOne(
      { odtradeId: parseInt(tradeId) },
      {
        $set: {
          [offerField]: { items: items || {}, gold: offerGold },
          initiatorReady: false,
          partnerReady: false,
          lastActivityAt: new Date(),
          lastModifiedBy: userId
        },
        $inc: { offerVersion: 1 }
      }
    );

    const updatedTrade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });
    res.json({ success: true, offerVersion: updatedTrade.offerVersion });
  } catch (err) {
    console.error('Trade update-offer error:', err);
    res.status(500).json({ message: 'Failed to update offer' });
  }
});

// POST /api/trade/toggle-ready
app.post('/api/trade/toggle-ready', authMiddleware, async (req, res) => {
  try {
    const { tradeId, ready } = req.body;
    const userId = req.user.id;

    const trade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });

    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.odinitiatorId !== userId && trade.odpartnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (trade.phase !== 'trading') {
      return res.status(400).json({ message: 'Cannot change ready status in this phase' });
    }

    const isInitiator = trade.odinitiatorId === userId;
    const readyField = isInitiator ? 'initiatorReady' : 'partnerReady';

    const updateObj = {
      $set: { [readyField]: ready, lastActivityAt: new Date() },
      $inc: { offerVersion: 1 }
    };

    // Check if both will be ready
    const otherReady = isInitiator ? trade.partnerReady : trade.initiatorReady;
    if (ready && otherReady) {
      updateObj.$set.phase = 'review';
      updateObj.$set.initiatorConfirmed = false;
      updateObj.$set.partnerConfirmed = false;
    }

    await tradesCollection.updateOne({ odtradeId: parseInt(tradeId) }, updateObj);

    const updatedTrade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });
    res.json({
      success: true,
      phase: updatedTrade.phase,
      bothReady: updatedTrade.initiatorReady && updatedTrade.partnerReady,
      offerVersion: updatedTrade.offerVersion
    });
  } catch (err) {
    console.error('Trade toggle-ready error:', err);
    res.status(500).json({ message: 'Failed to toggle ready status' });
  }
});

// POST /api/trade/confirm
app.post('/api/trade/confirm', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const userId = req.user.id;

    const trade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });

    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.odinitiatorId !== userId && trade.odpartnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (trade.phase !== 'review') {
      return res.status(400).json({ message: 'Trade is not in review phase' });
    }

    const isInitiator = trade.odinitiatorId === userId;
    const confirmField = isInitiator ? 'initiatorConfirmed' : 'partnerConfirmed';
    const otherConfirmed = isInitiator ? trade.partnerConfirmed : trade.initiatorConfirmed;

    if (!otherConfirmed) {
      await tradesCollection.updateOne(
        { odtradeId: parseInt(tradeId) },
        {
          $set: { [confirmField]: true, lastActivityAt: new Date() },
          $inc: { offerVersion: 1 }
        }
      );
      return res.json({ success: true, phase: 'review', bothConfirmed: false, message: 'Waiting for partner to confirm' });
    }

    // Both confirmed - execute trade
    const initiatorSave = await savesCollection.findOne({ oduserId: trade.odinitiatorId });
    const partnerSave = await savesCollection.findOne({ oduserId: trade.odpartnerId });

    if (!initiatorSave?.player || !partnerSave?.player) {
      return res.status(400).json({ message: 'Player data not found' });
    }

    // Validate initiator has items
    for (const [itemId, qty] of Object.entries(trade.initiatorOffer.items)) {
      if (qty > 0 && (initiatorSave.player.inventory[itemId] || 0) < qty) {
        await tradesCollection.updateOne(
          { odtradeId: parseInt(tradeId) },
          { $set: { phase: 'cancelled', cancelReason: 'insufficient_items' } }
        );
        return res.status(400).json({ message: 'Initiator no longer has offered items' });
      }
    }
    if (trade.initiatorOffer.gold > 0 && (initiatorSave.player.gold || 0) < trade.initiatorOffer.gold) {
      await tradesCollection.updateOne(
        { odtradeId: parseInt(tradeId) },
        { $set: { phase: 'cancelled', cancelReason: 'insufficient_gold' } }
      );
      return res.status(400).json({ message: 'Initiator no longer has offered gold' });
    }

    // Validate partner has items
    for (const [itemId, qty] of Object.entries(trade.partnerOffer.items)) {
      if (qty > 0 && (partnerSave.player.inventory[itemId] || 0) < qty) {
        await tradesCollection.updateOne(
          { odtradeId: parseInt(tradeId) },
          { $set: { phase: 'cancelled', cancelReason: 'insufficient_items' } }
        );
        return res.status(400).json({ message: 'Partner no longer has offered items' });
      }
    }
    if (trade.partnerOffer.gold > 0 && (partnerSave.player.gold || 0) < trade.partnerOffer.gold) {
      await tradesCollection.updateOne(
        { odtradeId: parseInt(tradeId) },
        { $set: { phase: 'cancelled', cancelReason: 'insufficient_gold' } }
      );
      return res.status(400).json({ message: 'Partner no longer has offered gold' });
    }

    // Execute trade - update initiator
    const initiatorUpdate = { $set: { updatedAt: new Date() }, $inc: {} };
    for (const [itemId, qty] of Object.entries(trade.initiatorOffer.items)) {
      if (qty > 0) initiatorUpdate.$inc[`player.inventory.${itemId}`] = -qty;
    }
    for (const [itemId, qty] of Object.entries(trade.partnerOffer.items)) {
      if (qty > 0) initiatorUpdate.$inc[`player.inventory.${itemId}`] = (initiatorUpdate.$inc[`player.inventory.${itemId}`] || 0) + qty;
    }
    if (trade.initiatorOffer.gold > 0) initiatorUpdate.$inc['player.gold'] = -trade.initiatorOffer.gold;
    if (trade.partnerOffer.gold > 0) initiatorUpdate.$inc['player.gold'] = (initiatorUpdate.$inc['player.gold'] || 0) + trade.partnerOffer.gold;

    // Execute trade - update partner
    const partnerUpdate = { $set: { updatedAt: new Date() }, $inc: {} };
    for (const [itemId, qty] of Object.entries(trade.partnerOffer.items)) {
      if (qty > 0) partnerUpdate.$inc[`player.inventory.${itemId}`] = -qty;
    }
    for (const [itemId, qty] of Object.entries(trade.initiatorOffer.items)) {
      if (qty > 0) partnerUpdate.$inc[`player.inventory.${itemId}`] = (partnerUpdate.$inc[`player.inventory.${itemId}`] || 0) + qty;
    }
    if (trade.partnerOffer.gold > 0) partnerUpdate.$inc['player.gold'] = -trade.partnerOffer.gold;
    if (trade.initiatorOffer.gold > 0) partnerUpdate.$inc['player.gold'] = (partnerUpdate.$inc['player.gold'] || 0) + trade.initiatorOffer.gold;

    if (Object.keys(initiatorUpdate.$inc).length > 0) {
      await savesCollection.updateOne({ oduserId: trade.odinitiatorId }, initiatorUpdate);
    }
    if (Object.keys(partnerUpdate.$inc).length > 0) {
      await savesCollection.updateOne({ oduserId: trade.odpartnerId }, partnerUpdate);
    }

    await tradesCollection.updateOne(
      { odtradeId: parseInt(tradeId) },
      { $set: { phase: 'completed', completedAt: new Date() }, $inc: { offerVersion: 1 } }
    );

    res.json({ success: true, phase: 'completed', message: 'Trade completed!' });
  } catch (err) {
    console.error('Trade confirm error:', err);
    res.status(500).json({ message: 'Failed to confirm trade' });
  }
});

// POST /api/trade/modify
app.post('/api/trade/modify', authMiddleware, async (req, res) => {
  try {
    const { tradeId, items, gold } = req.body;
    const userId = req.user.id;

    const trade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });

    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.odinitiatorId !== userId && trade.odpartnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (trade.phase !== 'review') {
      return res.status(400).json({ message: 'Trade is not in review phase' });
    }

    const playerSave = await savesCollection.findOne({ oduserId: userId });
    if (!playerSave?.player) {
      return res.status(400).json({ message: 'Player save not found' });
    }

    if (items) {
      for (const [itemId, qty] of Object.entries(items)) {
        if (qty < 0 || (qty > 0 && (playerSave.player.inventory[itemId] || 0) < qty)) {
          return res.status(400).json({ message: `Invalid quantity for ${itemId}` });
        }
      }
    }

    const offerGold = gold || 0;
    if (offerGold < 0 || offerGold > (playerSave.player.gold || 0)) {
      return res.status(400).json({ message: 'Invalid gold amount' });
    }

    const isInitiator = trade.odinitiatorId === userId;
    const offerField = isInitiator ? 'initiatorOffer' : 'partnerOffer';

    await tradesCollection.updateOne(
      { odtradeId: parseInt(tradeId) },
      {
        $set: {
          phase: 'trading',
          [offerField]: { items: items || {}, gold: offerGold },
          initiatorReady: false,
          partnerReady: false,
          initiatorConfirmed: false,
          partnerConfirmed: false,
          lastActivityAt: new Date(),
          lastModifiedBy: userId
        },
        $inc: { offerVersion: 1 }
      }
    );

    const updatedTrade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });
    res.json({ success: true, phase: 'trading', message: 'Offer modified', offerVersion: updatedTrade.offerVersion });
  } catch (err) {
    console.error('Trade modify error:', err);
    res.status(500).json({ message: 'Failed to modify trade' });
  }
});

// POST /api/trade/cancel
app.post('/api/trade/cancel', authMiddleware, async (req, res) => {
  try {
    const { tradeId } = req.body;
    const userId = req.user.id;

    const trade = await tradesCollection.findOne({ odtradeId: parseInt(tradeId) });

    if (!trade) {
      return res.status(404).json({ message: 'Trade not found' });
    }
    if (trade.odinitiatorId !== userId && trade.odpartnerId !== userId) {
      return res.status(403).json({ message: 'Not your trade' });
    }
    if (['completed', 'cancelled'].includes(trade.phase)) {
      return res.status(400).json({ message: 'Trade already ended' });
    }

    await tradesCollection.updateOne(
      { odtradeId: parseInt(tradeId) },
      {
        $set: { phase: 'cancelled', cancelReason: 'user_cancelled', cancelledBy: userId, lastActivityAt: new Date() },
        $inc: { offerVersion: 1 }
      }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Trade cancel error:', err);
    res.status(500).json({ message: 'Failed to cancel trade' });
  }
});

// ============================================
// AUCTION ENDPOINTS
// ============================================

// POST /api/auction/create
app.post('/api/auction/create', authMiddleware, async (req, res) => {
  try {
    const { itemId, quantity, priceGold, priceItems, durationDays = 3 } = req.body;
    const sellerId = req.user.id;

    if (!itemId || !quantity || quantity <= 0) {
      return res.status(400).json({ message: 'Item and quantity required' });
    }
    if ((!priceGold || priceGold <= 0) && (!priceItems || Object.keys(priceItems).length === 0)) {
      return res.status(400).json({ message: 'Must set a gold price or item price' });
    }
    if (durationDays < 1 || durationDays > 7) {
      return res.status(400).json({ message: 'Duration must be 1-7 days' });
    }

    const sellerSave = await savesCollection.findOne({ oduserId: sellerId });
    if (!sellerSave?.player || (sellerSave.player.inventory[itemId] || 0) < quantity) {
      return res.status(400).json({ message: 'Insufficient items' });
    }

    // Remove items from seller
    await savesCollection.updateOne(
      { oduserId: sellerId },
      { $inc: { [`player.inventory.${itemId}`]: -quantity }, $set: { updatedAt: new Date() } }
    );

    const sellerLoc = await locationsCollection.findOne({ oduserId: sellerId });
    const auctionId = await getNextSequence('auctionId');
    const now = new Date();

    await auctionsCollection.insertOne({
      odauctionId: auctionId,
      odsellerId: sellerId,
      sellerName: sellerLoc?.displayName || 'Unknown',
      itemId,
      quantity,
      priceGold: priceGold || 0,
      priceItems: priceItems || null,
      status: 'active',
      createdAt: now,
      expiresAt: new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000),
      odbuyerId: null,
      soldAt: null
    });

    res.json({ success: true, auctionId });
  } catch (err) {
    console.error('Auction create error:', err);
    res.status(500).json({ message: 'Failed to create auction' });
  }
});

// GET /api/auction/list
app.get('/api/auction/list', authMiddleware, async (req, res) => {
  try {
    const { itemFilter } = req.query;
    const userId = req.user.id;

    const query = { status: 'active' };
    if (itemFilter) {
      query.itemId = { $regex: itemFilter, $options: 'i' };
    }

    const listings = await auctionsCollection.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    const myListings = await auctionsCollection.find({ odsellerId: userId })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({ listings, myListings });
  } catch (err) {
    console.error('Auction list error:', err);
    res.status(500).json({ message: 'Failed to fetch auctions' });
  }
});

// POST /api/auction/buy
app.post('/api/auction/buy', authMiddleware, async (req, res) => {
  try {
    const { auctionId } = req.body;
    const buyerId = req.user.id;

    const auction = await auctionsCollection.findOne({ odauctionId: parseInt(auctionId) });

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }
    if (auction.status !== 'active') {
      return res.status(400).json({ message: 'Auction is no longer active' });
    }
    if (auction.odsellerId === buyerId) {
      return res.status(400).json({ message: 'Cannot buy your own listing' });
    }
    if (new Date(auction.expiresAt).getTime() < Date.now()) {
      await auctionsCollection.updateOne({ odauctionId: parseInt(auctionId) }, { $set: { status: 'expired' } });
      return res.status(400).json({ message: 'Auction has expired' });
    }

    const buyerSave = await savesCollection.findOne({ oduserId: buyerId });
    if (!buyerSave?.player) {
      return res.status(400).json({ message: 'Buyer save not found' });
    }

    // Validate buyer has payment
    if (auction.priceGold > 0 && (buyerSave.player.gold || 0) < auction.priceGold) {
      return res.status(400).json({ message: 'Insufficient gold' });
    }
    if (auction.priceItems) {
      for (const [itemId, qty] of Object.entries(auction.priceItems)) {
        if ((buyerSave.player.inventory[itemId] || 0) < qty) {
          return res.status(400).json({ message: `Insufficient ${itemId}` });
        }
      }
    }

    // Execute purchase
    const buyerUpdate = { $set: { updatedAt: new Date() }, $inc: {} };
    const sellerUpdate = { $set: { updatedAt: new Date() }, $inc: {} };

    if (auction.priceGold > 0) {
      buyerUpdate.$inc['player.gold'] = -auction.priceGold;
      sellerUpdate.$inc['player.gold'] = auction.priceGold;
    }
    if (auction.priceItems) {
      for (const [itemId, qty] of Object.entries(auction.priceItems)) {
        buyerUpdate.$inc[`player.inventory.${itemId}`] = -qty;
        sellerUpdate.$inc[`player.inventory.${itemId}`] = qty;
      }
    }
    buyerUpdate.$inc[`player.inventory.${auction.itemId}`] = auction.quantity;

    await savesCollection.updateOne({ oduserId: buyerId }, buyerUpdate);
    await savesCollection.updateOne({ oduserId: auction.odsellerId }, sellerUpdate);

    await auctionsCollection.updateOne(
      { odauctionId: parseInt(auctionId) },
      { $set: { status: 'sold', odbuyerId: buyerId, soldAt: new Date() } }
    );

    res.json({ success: true, message: 'Purchase successful' });
  } catch (err) {
    console.error('Auction buy error:', err);
    res.status(500).json({ message: 'Failed to complete purchase' });
  }
});

// POST /api/auction/cancel
app.post('/api/auction/cancel', authMiddleware, async (req, res) => {
  try {
    const { auctionId } = req.body;
    const userId = req.user.id;

    const auction = await auctionsCollection.findOne({ odauctionId: parseInt(auctionId) });

    if (!auction) {
      return res.status(404).json({ message: 'Auction not found' });
    }
    if (auction.odsellerId !== userId) {
      return res.status(403).json({ message: 'Not your auction' });
    }
    if (auction.status !== 'active') {
      return res.status(400).json({ message: 'Auction is no longer active' });
    }

    // Return items to seller
    await savesCollection.updateOne(
      { oduserId: userId },
      { $inc: { [`player.inventory.${auction.itemId}`]: auction.quantity }, $set: { updatedAt: new Date() } }
    );

    await auctionsCollection.updateOne(
      { odauctionId: parseInt(auctionId) },
      { $set: { status: 'cancelled' } }
    );

    res.json({ success: true });
  } catch (err) {
    console.error('Auction cancel error:', err);
    res.status(500).json({ message: 'Failed to cancel auction' });
  }
});

// ============================================
// HEALTH CHECK
// ============================================

app.get('/api/health', (req, res) => {
  res.json({
    status: db ? 'ok' : 'degraded',
    timestamp: new Date().toISOString(),
    authConfigured: !!JWT_SECRET,
    databaseConnected: !!db
  });
});

// ============================================
// GRACEFUL SHUTDOWN
// ============================================

async function gracefulShutdown(signal) {
  console.log(`\n🛑 Received ${signal}. Shutting down gracefully...`);

  try {
    await mongoClient.close();
    console.log('✅ MongoDB connection closed. Goodbye!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error during shutdown:', err.message);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ============================================
// START SERVER
// ============================================

async function startServer() {
  const dbConnected = await connectToMongoDB();

  server.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('           Realm of Eternity - Server Running              ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  Database:   ${dbConnected ? '✅ MongoDB Connected' : '❌ MongoDB Failed'}`);
    console.log(`  Auth:       ${JWT_SECRET ? '✅ Ready' : '⚠️  JWT_SECRET not set'}`);
    console.log(`  Port:       ${PORT}`);
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');
  });
}

startServer();
