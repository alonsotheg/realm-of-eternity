/**
 * Migration Script: JSON Files -> MongoDB
 *
 * Run this once to import your existing data from JSON files into MongoDB.
 *
 * Usage:
 *   Set MONGODB_URI environment variable, then run:
 *   node migrate-to-mongodb.js
 *
 * Example:
 *   MONGODB_URI="mongodb+srv://user:pass@cluster.mongodb.net/" node migrate-to-mongodb.js
 */

require('dotenv').config();

const { MongoClient, ServerApiVersion } = require('mongodb');
const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('❌ MONGODB_URI environment variable is required');
  console.log('   Set it in .env file or pass it directly:');
  console.log('   MONGODB_URI="your-connection-string" node migrate-to-mongodb.js');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'Data');

// Load JSON file safely
function loadJSON(filename) {
  const filepath = path.join(DATA_DIR, filename);
  try {
    if (fs.existsSync(filepath)) {
      const content = fs.readFileSync(filepath, 'utf8');
      if (content.trim()) {
        return JSON.parse(content);
      }
    }
  } catch (err) {
    console.warn(`⚠️  Could not load ${filename}:`, err.message);
  }
  return null;
}

async function migrate() {
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('       Realm of Eternity - Data Migration to MongoDB       ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('');

  const client = new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    }
  });

  try {
    console.log('📡 Connecting to MongoDB...');
    await client.connect();
    await client.db("admin").command({ ping: 1 });
    console.log('✅ Connected to MongoDB successfully!\n');

    const db = client.db('realmofeternity');

    // Load existing JSON data
    console.log('📂 Loading JSON files...');
    const usersData = loadJSON('users.json');
    const savesData = loadJSON('saves.json');
    const locationsData = loadJSON('locations.json');

    let usersImported = 0;
    let savesImported = 0;
    let locationsImported = 0;
    let maxUserId = 0;

    // Migrate users
    if (usersData && usersData.list) {
      console.log(`\n👤 Migrating users...`);
      const usersCollection = db.collection('users');

      for (const [email, user] of Object.entries(usersData.list)) {
        try {
          // Check if user already exists
          const existing = await usersCollection.findOne({ email: user.email });
          if (existing) {
            console.log(`   ⏭️  Skipping ${user.email} (already exists)`);
            continue;
          }

          await usersCollection.insertOne({
            odId: user.id,
            email: user.email,
            password: user.password,
            displayName: user.displayName,
            createdAt: new Date(user.createdAt)
          });

          usersImported++;
          maxUserId = Math.max(maxUserId, user.id);
          console.log(`   ✅ Imported user: ${user.displayName} (ID: ${user.id})`);
        } catch (err) {
          console.error(`   ❌ Failed to import ${email}:`, err.message);
        }
      }
    }

    // Migrate saves
    if (savesData) {
      console.log(`\n💾 Migrating saves...`);
      const savesCollection = db.collection('saves');

      for (const [oduserId, save] of Object.entries(savesData)) {
        try {
          const odId = parseInt(oduserId);

          // Check if save already exists
          const existing = await savesCollection.findOne({ oduserId: odId });
          if (existing) {
            console.log(`   ⏭️  Skipping save for user ${odId} (already exists)`);
            continue;
          }

          await savesCollection.insertOne({
            oduserId: odId,
            player: save.player,
            playerIdentity: save.playerIdentity,
            updatedAt: new Date(save.updatedAt)
          });

          savesImported++;
          console.log(`   ✅ Imported save for user ID: ${odId}`);
        } catch (err) {
          console.error(`   ❌ Failed to import save ${oduserId}:`, err.message);
        }
      }
    }

    // Migrate locations
    if (locationsData) {
      console.log(`\n📍 Migrating locations...`);
      const locationsCollection = db.collection('locations');

      for (const [oduserId, loc] of Object.entries(locationsData)) {
        try {
          const odId = parseInt(oduserId);

          // Check if location already exists
          const existing = await locationsCollection.findOne({ oduserId: odId });
          if (existing) {
            console.log(`   ⏭️  Skipping location for user ${odId} (already exists)`);
            continue;
          }

          await locationsCollection.insertOne({
            oduserId: odId,
            displayName: loc.displayName,
            totalLevel: loc.totalLevel,
            combatLevel: loc.combatLevel,
            currentLocation: loc.currentLocation,
            currentActivity: loc.currentActivity,
            lastOnline: new Date(loc.lastOnline)
          });

          locationsImported++;
          console.log(`   ✅ Imported location for user ID: ${odId}`);
        } catch (err) {
          console.error(`   ❌ Failed to import location ${oduserId}:`, err.message);
        }
      }
    }

    // Update counters to continue from max ID
    if (maxUserId > 0) {
      console.log(`\n🔢 Setting up counters...`);
      const countersCollection = db.collection('counters');

      await countersCollection.updateOne(
        { _id: 'userId' },
        { $set: { seq: maxUserId } },
        { upsert: true }
      );
      console.log(`   ✅ User ID counter set to ${maxUserId}`);
    }

    // Create indexes
    console.log(`\n📇 Creating indexes...`);
    await db.collection('users').createIndex({ email: 1 }, { unique: true });
    await db.collection('users').createIndex({ odId: 1 }, { unique: true });
    await db.collection('saves').createIndex({ oduserId: 1 }, { unique: true });
    await db.collection('locations').createIndex({ oduserId: 1 }, { unique: true });
    await db.collection('locations').createIndex({ currentLocation: 1, lastOnline: -1 });
    console.log('   ✅ Indexes created');

    // Summary
    console.log('');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('                    Migration Complete!                     ');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`   Users imported:     ${usersImported}`);
    console.log(`   Saves imported:     ${savesImported}`);
    console.log(`   Locations imported: ${locationsImported}`);
    console.log('');
    console.log('   Your data is now in MongoDB!');
    console.log('   You can safely deploy to Render.');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('');

  } catch (err) {
    console.error('❌ Migration failed:', err);
  } finally {
    await client.close();
  }
}

migrate();
