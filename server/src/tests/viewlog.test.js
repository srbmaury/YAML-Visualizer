/**
 * ViewLog Model and View Tracking Tests
 *
 * Tests view deduplication logic to ensure:
 * - Same user doesn't get counted twice within 24 hours
 * - Different users are counted separately
 * - Anonymous sessions are tracked properly
 * - Statistics are calculated correctly
 *
 * Run with: node server/src/tests/viewlog.test.js
 */

import mongoose from 'mongoose';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import ViewLog from '../models/ViewLog.js';
import YamlFile from '../models/YamlFile.js';
import User from '../models/User.js';

// Get the directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from server/.env
config({ path: join(__dirname, '../../.env') });

// Test utilities
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  section: (msg) => console.log(`\n${colors.yellow}${msg}${colors.reset}`)
};

// Track created records for cleanup
const createdRecords = {
  users: [],
  files: [],
  viewLogs: []
};

// Test runner
async function runTests() {
  try {
    log.section('=== ViewLog Deduplication Tests ===');

    // Connect to database
    log.info('Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    log.success('Connected to database');

    // Run all tests
    await testViewDeduplicationForAuthenticatedUser();
    await testViewDeduplicationForAnonymousUser();
    await testMultipleUserViews();
    await testViewStatistics();
    await testTimeWindowExpiry();

    log.section('=== All Tests Passed! ===');

  } catch (error) {
    log.error(`Test failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    await cleanup();
    await mongoose.connection.close();
    log.info('Database connection closed');
  }
}

/**
 * Test 1: Same authenticated user should not be counted twice within 24 hours
 */
async function testViewDeduplicationForAuthenticatedUser() {
  log.section('Test 1: Authenticated User View Deduplication');

  // Create test user and file
  const user = await User.create({
    username: 'testuser_' + Date.now(),
    email: `test_${Date.now()}@example.com`,
    password: 'hashedpassword123'
  });
  createdRecords.users.push(user._id);

  const file = await YamlFile.create({
    title: 'Test File',
    content: 'test: content',
    owner: user._id
  });
  createdRecords.files.push(file._id);

  // First view - should be counted
  const shouldCount1 = await ViewLog.shouldCountView(file._id, user._id, null);
  if (!shouldCount1) {
    throw new Error('First view should be counted');
  }
  log.success('First view should be counted: PASS');

  await ViewLog.logView(file._id, user._id, null);
  createdRecords.viewLogs.push(file._id);

  // Second view (same user, within 24h) - should NOT be counted
  const shouldCount2 = await ViewLog.shouldCountView(file._id, user._id, null);
  if (shouldCount2) {
    throw new Error('Second view within 24h should NOT be counted');
  }
  log.success('Second view within 24h should NOT be counted: PASS');

  // Verify only one view log exists
  const viewCount = await ViewLog.countDocuments({ fileId: file._id, userId: user._id });
  if (viewCount !== 1) {
    throw new Error(`Expected 1 view log, got ${viewCount}`);
  }
  log.success(`Only 1 view logged for same user: PASS`);
}

/**
 * Test 2: Anonymous users with different session IDs should be counted separately
 */
async function testViewDeduplicationForAnonymousUser() {
  log.section('Test 2: Anonymous User View Deduplication');

  const user = createdRecords.users[0];
  const file = await YamlFile.create({
    title: 'Test File Anonymous',
    content: 'test: content',
    owner: user
  });
  createdRecords.files.push(file._id);

  const sessionId1 = 'session_' + Date.now();
  const sessionId2 = 'session_' + (Date.now() + 1);

  // First anonymous view
  const shouldCount1 = await ViewLog.shouldCountView(file._id, null, sessionId1);
  if (!shouldCount1) {
    throw new Error('First anonymous view should be counted');
  }
  await ViewLog.logView(file._id, null, sessionId1);
  log.success('First anonymous view counted: PASS');

  // Same session - should NOT be counted
  const shouldCount2 = await ViewLog.shouldCountView(file._id, null, sessionId1);
  if (shouldCount2) {
    throw new Error('Same session should NOT be counted twice');
  }
  log.success('Same session not counted twice: PASS');

  // Different session - should be counted
  const shouldCount3 = await ViewLog.shouldCountView(file._id, null, sessionId2);
  if (!shouldCount3) {
    throw new Error('Different session should be counted');
  }
  await ViewLog.logView(file._id, null, sessionId2);
  log.success('Different session counted separately: PASS');

  // Verify two view logs exist
  const viewCount = await ViewLog.countDocuments({ fileId: file._id });
  if (viewCount !== 2) {
    throw new Error(`Expected 2 view logs, got ${viewCount}`);
  }
  log.success(`2 view logs for different sessions: PASS`);
}

/**
 * Test 3: Multiple different users should all be counted
 */
async function testMultipleUserViews() {
  log.section('Test 3: Multiple User Views');

  const owner = createdRecords.users[0];
  const file = await YamlFile.create({
    title: 'Test File Multi User',
    content: 'test: content',
    owner: owner
  });
  createdRecords.files.push(file._id);

  // Create 3 different users and log views
  const users = [];
  for (let i = 0; i < 3; i++) {
    const user = await User.create({
      username: `multiuser_${Date.now()}_${i}`,
      email: `multi_${Date.now()}_${i}@example.com`,
      password: 'hashedpassword123'
    });
    createdRecords.users.push(user._id);
    users.push(user);

    const shouldCount = await ViewLog.shouldCountView(file._id, user._id, null);
    if (!shouldCount) {
      throw new Error(`User ${i + 1} should be counted`);
    }
    await ViewLog.logView(file._id, user._id, null);
  }

  log.success(`All 3 different users counted: PASS`);

  // Verify 3 view logs exist
  const viewCount = await ViewLog.countDocuments({ fileId: file._id });
  if (viewCount !== 3) {
    throw new Error(`Expected 3 view logs, got ${viewCount}`);
  }
  log.success(`3 view logs for 3 different users: PASS`);
}

/**
 * Test 4: View statistics calculation
 */
async function testViewStatistics() {
  log.section('Test 4: View Statistics');

  const owner = createdRecords.users[0];
  const file = await YamlFile.create({
    title: 'Test File Stats',
    content: 'test: content',
    owner: owner
  });
  createdRecords.files.push(file._id);

  // Log multiple views: 2 authenticated users, 2 anonymous sessions
  const user1 = createdRecords.users[0];
  const user2 = createdRecords.users[1] || await User.create({
    username: `statsuser_${Date.now()}`,
    email: `stats_${Date.now()}@example.com`,
    password: 'hashedpassword123'
  });
  if (!createdRecords.users.includes(user2._id)) {
    createdRecords.users.push(user2._id);
  }

  await ViewLog.logView(file._id, user1, null);
  await ViewLog.logView(file._id, user2, null);
  await ViewLog.logView(file._id, null, 'session_stats_1');
  await ViewLog.logView(file._id, null, 'session_stats_2');

  // Get statistics
  const stats = await ViewLog.getFileStats(file._id, 30);

  if (stats.totalViews !== 4) {
    throw new Error(`Expected 4 total views, got ${stats.totalViews}`);
  }
  log.success(`Total views: ${stats.totalViews} PASS`);

  if (stats.uniqueUsers !== 2) {
    throw new Error(`Expected 2 unique users, got ${stats.uniqueUsers}`);
  }
  log.success(`Unique users: ${stats.uniqueUsers} PASS`);

  if (stats.uniqueSessions !== 2) {
    throw new Error(`Expected 2 unique sessions, got ${stats.uniqueSessions}`);
  }
  log.success(`Unique sessions: ${stats.uniqueSessions} PASS`);
}

/**
 * Test 5: Views outside time window should be counted again
 */
async function testTimeWindowExpiry() {
  log.section('Test 5: Time Window Expiry');

  const owner = createdRecords.users[0];
  const file = await YamlFile.create({
    title: 'Test File Time Window',
    content: 'test: content',
    owner: owner
  });
  createdRecords.files.push(file._id);

  const sessionId = 'session_timewindow';

  // Log a view with timestamp older than 24 hours
  const oldView = await ViewLog.create({
    fileId: file._id,
    sessionId: sessionId,
    viewedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) // 25 hours ago
  });

  // Check if new view should be counted (with 24 hour window)
  const shouldCount = await ViewLog.shouldCountView(file._id, null, sessionId, 24);
  if (!shouldCount) {
    throw new Error('View after 24h window should be counted');
  }
  log.success('View after 24h window can be counted again: PASS');

  // With 26 hour window, it should NOT be counted
  const shouldNotCount = await ViewLog.shouldCountView(file._id, null, sessionId, 26);
  if (shouldNotCount) {
    throw new Error('View within 26h window should NOT be counted');
  }
  log.success('View within 26h window is still deduplicated: PASS');

  // Clean up
  await ViewLog.deleteOne({ _id: oldView._id });
}

/**
 * Cleanup function - removes all test data
 */
async function cleanup() {
  log.section('Cleaning up test data...');

  let deletedCount = 0;

  // Delete view logs
  if (createdRecords.viewLogs.length > 0) {
    const viewResult = await ViewLog.deleteMany({
      fileId: { $in: createdRecords.files }
    });
    deletedCount += viewResult.deletedCount;
    log.info(`Deleted ${viewResult.deletedCount} view logs`);
  }

  // Delete files
  if (createdRecords.files.length > 0) {
    const fileResult = await YamlFile.deleteMany({
      _id: { $in: createdRecords.files }
    });
    deletedCount += fileResult.deletedCount;
    log.info(`Deleted ${fileResult.deletedCount} files`);
  }

  // Delete users
  if (createdRecords.users.length > 0) {
    const userResult = await User.deleteMany({
      _id: { $in: createdRecords.users }
    });
    deletedCount += userResult.deletedCount;
    log.info(`Deleted ${userResult.deletedCount} users`);
  }

  log.success(`Cleanup complete! Removed ${deletedCount} test records`);
}

// Run tests
runTests().catch((error) => {
  log.error('Test suite failed');
  console.error(error);
  process.exit(1);
});
