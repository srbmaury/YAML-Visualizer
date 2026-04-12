#!/usr/bin/env node

/**
 * Get GitHub integration IDs for testing
 * Usage: node get-integration-id.js [mongodb_uri]
 */

const mongoose = require('mongoose');

const MONGO_URI = process.argv[2];
console.log(`🔌 Connecting to: ${MONGO_URI}\n`);

mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log('✅ Connected to MongoDB\n');

    const GithubIntegration = mongoose.model('GithubIntegration', new mongoose.Schema({}, { strict: false }), 'githubintegrations');

    const integrations = await GithubIntegration.find({}).lean();

    if (integrations.length === 0) {
      console.log('❌ No integrations found. Create one first through the UI.');
      console.log('\nUsage: node get-integration-id.js [mongodb_uri]');
      process.exit(0);
    }

    console.log(`📋 Found ${integrations.length} integration(s):\n`);

    integrations.forEach((int, index) => {
      console.log(`${index + 1}. Integration ID: ${int._id}`);
      console.log(`   Repository: ${int.repoOwner}/${int.repoName}`);
      console.log(`   Branch: ${int.branch}`);
      console.log(`   Mode: ${int.filePath ? 'file-sync' : 'auto-parse'}`);
      console.log(`   Active: ${int.active ? '✅' : '❌'}`);
      console.log(`   Auto-sync: ${int.autoSync ? '✅' : '❌'}`);
      console.log(`\n   Test command:`);
      console.log(`   node test-webhook.js ${int._id} ${int.branch}\n`);
    });

    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error:', err.message);
    process.exit(1);
  });
