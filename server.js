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
  console.log('  GET  /api/health          Health check');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');
});
