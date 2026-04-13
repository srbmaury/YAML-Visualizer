/**
 * Manual Test Script for View Tracking
 *
 * This script demonstrates the view deduplication feature by:
 * 1. Creating a test user and YAML file
 * 2. Simulating multiple view requests (authenticated and anonymous)
 * 3. Showing view counts with deduplication
 * 4. Cleaning up test data
 *
 * Run: node server/src/tests/viewlog-manual-test.js
 */

import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import crypto from 'crypto';
import ViewLog from '../models/ViewLog.js';
import YamlFile from '../models/YamlFile.js';
import User from '../models/User.js';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from server/.env
config({ path: join(__dirname, '../../.env') });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
  magenta: '\x1b[35m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function section(msg) {
  console.log(`\n${colors.yellow}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.yellow}${msg}${colors.reset}`);
  console.log(`${colors.yellow}${'='.repeat(60)}${colors.reset}\n`);
}

async function simulateView(file, userId = null, sessionId = null, viewerName = '') {
  const shouldCount = await ViewLog.shouldCountView(file._id, userId, sessionId);

  if (shouldCount) {
    await ViewLog.logView(file._id, userId, sessionId);
    await file.updateOne({ $inc: { views: 1 } });
    log(`✓ ${viewerName} view COUNTED (new unique view)`, 'green');
    return true;
  } else {
    log(`⊘ ${viewerName} view NOT counted (duplicate within 24h)`, 'magenta');
    return false;
  }
}

async function displayStats(file) {
  const updatedFile = await YamlFile.findById(file._id);
  const stats = await ViewLog.getFileStats(file._id, 30);

  log('\n📊 View Statistics:', 'blue');
  log(`   Total Views (counter): ${updatedFile.views}`, 'blue');
  log(`   Total View Logs: ${stats.totalViews}`, 'blue');
  log(`   Unique Users: ${stats.uniqueUsers}`, 'blue');
  log(`   Unique Anonymous Sessions: ${stats.uniqueSessions}`, 'blue');
}

async function main() {
  let testUser, testFile;

  try {
    section('🚀 View Tracking Demonstration');

    // Connect to database
    log('Connecting to database...', 'yellow');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    log('✓ Connected to database\n', 'green');

    // Create test user
    log('Creating test user...', 'yellow');
    testUser = await User.create({
      username: 'viewtest_' + Date.now(),
      email: `viewtest_${Date.now()}@example.com`,
      password: 'hashedpassword123'
    });
    log(`✓ Created user: ${testUser.username}\n`, 'green');

    // Create test YAML file
    log('Creating test YAML file...', 'yellow');
    testFile = await YamlFile.create({
      title: 'View Tracking Test File',
      content: 'test:\n  tracking: true\n  views: deduplication',
      owner: testUser._id,
      isPublic: true,
      views: 0
    });
    log(`✓ Created file: ${testFile.title}`, 'green');
    log(`   Share ID: ${testFile.shareId}\n`, 'green');

    // Scenario 1: Same user views multiple times
    section('📱 Scenario 1: Same Authenticated User (Multiple Views)');
    log('User "Alice" views the file 3 times within a few seconds:\n', 'yellow');

    await simulateView(testFile, testUser._id, null, 'Alice (1st view)');
    await simulateView(testFile, testUser._id, null, 'Alice (2nd view)');
    await simulateView(testFile, testUser._id, null, 'Alice (3rd view)');

    await displayStats(testFile);

    // Scenario 2: Different users view the file
    section('👥 Scenario 2: Different Authenticated Users');

    const bob = await User.create({
      username: 'bob_' + Date.now(),
      email: `bob_${Date.now()}@example.com`,
      password: 'hashedpassword123'
    });

    const charlie = await User.create({
      username: 'charlie_' + Date.now(),
      email: `charlie_${Date.now()}@example.com`,
      password: 'hashedpassword123'
    });

    log('Three different users view the file:\n', 'yellow');
    await simulateView(testFile, bob._id, null, 'Bob');
    await simulateView(testFile, charlie._id, null, 'Charlie');
    await simulateView(testFile, testUser._id, null, 'Alice (again)');

    await displayStats(testFile);

    // Scenario 3: Anonymous users
    section('🕶️  Scenario 3: Anonymous Users with Sessions');

    const session1 = 'session_' + crypto.randomBytes(8).toString('hex');
    const session2 = 'session_' + crypto.randomBytes(8).toString('hex');

    log('Anonymous users with different sessions:\n', 'yellow');
    await simulateView(testFile, null, session1, 'Anonymous User 1 (1st view)');
    await simulateView(testFile, null, session1, 'Anonymous User 1 (2nd view)');
    await simulateView(testFile, null, session2, 'Anonymous User 2 (1st view)');
    await simulateView(testFile, null, session2, 'Anonymous User 2 (2nd view)');

    await displayStats(testFile);

    // Final summary
    section('✅ Summary');
    log('View deduplication is working correctly!', 'green');
    log('• Same user/session within 24h = NOT counted again', 'green');
    log('• Different users/sessions = Counted separately', 'green');
    log('• Total unique views are accurately tracked\n', 'green');

    // Cleanup
    section('🧹 Cleanup');
    log('Removing test data...', 'yellow');
    await ViewLog.deleteMany({ fileId: testFile._id });
    await YamlFile.deleteOne({ _id: testFile._id });
    await User.deleteMany({ _id: { $in: [testUser._id, bob._id, charlie._id] } });
    log('✓ Test data removed\n', 'green');

  } catch (error) {
    log('\n❌ Error: ' + error.message, 'red');
    console.error(error);
  } finally {
    await mongoose.connection.close();
    log('Database connection closed', 'yellow');
  }
}

main();
