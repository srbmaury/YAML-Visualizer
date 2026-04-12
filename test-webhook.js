#!/usr/bin/env node

/**
 * Test GitHub webhook locally
 * Usage: node test-webhook.js <integration_id> [branch]
 */

const axios = require('axios');

const integrationId = process.argv[2];
const branch = process.argv[3] || 'main';

if (!integrationId) {
  console.error('❌ Error: Integration ID is required');
  console.log('Usage: node test-webhook.js <integration_id> [branch]');
  console.log('Example: node test-webhook.js 507f1f77bcf86cd799439011 main');
  process.exit(1);
}

const API_URL = `http://localhost:5000/api/github/webhook/${integrationId}`;

// Realistic GitHub push webhook payload
const payload = {
  ref: `refs/heads/${branch}`,
  before: 'abc123def456',
  after: 'def456abc789',
  commits: [
    {
      id: 'def456abc789',
      message: 'Add new components and update existing ones',
      timestamp: new Date().toISOString(),
      added: [
        'src/components/NewComponent.jsx',
        'src/components/AnotherComponent.jsx'
      ],
      modified: [
        'src/components/ExistingComponent.jsx',
        'package.json'
      ],
      removed: []
    }
  ],
  head_commit: {
    id: 'def456abc789',
    message: 'Add new components and update existing ones',
    timestamp: new Date().toISOString()
  },
  repository: {
    id: 123456,
    name: 'test-repo',
    full_name: 'owner/test-repo',
    html_url: 'https://github.com/owner/test-repo'
  },
  pusher: {
    name: 'testuser',
    email: 'testuser@example.com'
  },
  sender: {
    login: 'testuser'
  }
};

console.log(`🔔 Testing webhook for integration: ${integrationId}`);
console.log(`📌 Branch: ${branch}`);
console.log(`🌐 URL: ${API_URL}`);
console.log(`📦 Payload:`, JSON.stringify(payload, null, 2));
console.log('\n⏳ Sending request...\n');

axios.post(API_URL, payload, {
  headers: {
    'Content-Type': 'application/json',
    'X-GitHub-Event': 'push',
    'User-Agent': 'GitHub-Hookshot/test'
  }
})
.then(response => {
  console.log('✅ Success!');
  console.log('Status:', response.status);
  console.log('Response:', JSON.stringify(response.data, null, 2));
})
.catch(error => {
  console.error('❌ Error!');
  if (error.response) {
    console.error('Status:', error.response.status);
    console.error('Response:', JSON.stringify(error.response.data, null, 2));
  } else {
    console.error('Message:', error.message);
  }
  process.exit(1);
});
