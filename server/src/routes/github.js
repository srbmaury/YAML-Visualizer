import express from 'express';
import crypto from 'crypto';
import axios from 'axios';
import { auth } from '../middleware/auth.js';
import GithubIntegration from '../models/GithubIntegration.js';
import YamlFile from '../models/YamlFile.js';
import {
  generateAutoParseYamlFromBranch,
  generateAutoParseYamlFromPush,
} from '../services/githubRepoParser.js';
import { persistYamlFromGithubSync } from '../services/githubSyncService.js';
import { saveYamlWithVersionHistory } from '../controllers/versionController.js';

const router = express.Router();


// Create GitHub integration
router.post('/connect', auth, async (req, res) => {
  try {
    const { yamlFileId, repoOwner, repoName, filePath, branch = 'main' } = req.body;

    // Verify user owns the YAML file
    const yamlFile = await YamlFile.findOne({ _id: yamlFileId, owner: req.user.id });
    if (!yamlFile) {
      return res.status(404).json({ error: 'YAML file not found or access denied' });
    }

    // Check if integration already exists
    const existing = await GithubIntegration.findOne({ yamlFileId });
    if (existing) {
      return res.status(400).json({ error: 'GitHub integration already exists for this file' });
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    // Fetch initial content from GitHub
    const githubUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/${branch}/${filePath}`;
    let initialContent;
    try {
      const response = await axios.get(githubUrl);
      initialContent = response.data;
    } catch (error) {
      return res.status(400).json({
        error: 'Failed to fetch file from GitHub. Please check repository, branch, and file path.',
        details: error.message
      });
    }

    const content =
      typeof initialContent === 'string' ? initialContent : JSON.stringify(initialContent, null, 2);

    // Persist YAML + VersionHistory (connect used to skip history entirely)
    await saveYamlWithVersionHistory(yamlFile._id.toString(), content, req.user.id, {
      message: 'GitHub file integration (initial)',
      saveType: 'initial',
    });

    // Create integration
    const integration = new GithubIntegration({
      yamlFileId,
      user: req.user.id,
      repoOwner,
      repoName,
      filePath,
      branch,
      webhookSecret
    });

    await integration.save();

    // Generate webhook URL
    const webhookUrl = `${process.env.API_BASE_URL || 'http://localhost:5000'}/api/github/webhook/${integration._id}`;

    res.status(201).json({
      message: 'GitHub integration created successfully',
      integration: {
        id: integration._id,
        repoOwner,
        repoName,
        filePath,
        branch,
        webhookUrl,
        webhookSecret,
        setupInstructions: `
1. Go to: https://github.com/${repoOwner}/${repoName}/settings/hooks
2. Click "Add webhook"
3. Paste Payload URL: ${webhookUrl}
4. Content type: application/json
5. Secret: ${webhookSecret}
6. Select "Just the push event"
7. Click "Add webhook"
        `.trim()
      }
    });
  } catch (error) {
    console.error('GitHub connect error:', error);
    res.status(500).json({ error: 'Failed to create GitHub integration' });
  }
});

// Create GitHub repo auto-parser integration
router.post('/connect-repo', auth, async (req, res) => {
  try {
    const { yamlFileId, repoOwner, repoName, branch = 'main' } = req.body;

    // Verify user owns the YAML file
    const yamlFile = await YamlFile.findOne({ _id: yamlFileId, owner: req.user.id });
    if (!yamlFile) {
      return res.status(404).json({ error: 'YAML file not found or access denied' });
    }

    // Check if integration already exists
    const existing = await GithubIntegration.findOne({ yamlFileId });
    if (existing) {
      return res.status(400).json({ error: 'GitHub integration already exists for this file' });
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(32).toString('hex');

    // Generate initial YAML from repo structure
    let initialContent;
    try {
      initialContent = await generateAutoParseYamlFromBranch(repoOwner, repoName, branch);
    } catch (error) {
      return res.status(400).json({
        error: 'Failed to fetch repository structure from GitHub.',
        details: error.message
      });
    }

    // Persist YAML + VersionHistory (connect-repo used to skip history entirely)
    await saveYamlWithVersionHistory(yamlFile._id.toString(), initialContent, req.user.id, {
      message: 'GitHub repo structure (initial)',
      saveType: 'initial',
    });
    const yamlAfter = await YamlFile.findById(yamlFileId);
    yamlAfter.title = `${repoOwner}/${repoName} Structure`;
    await yamlAfter.save();

    // Create integration (filePath = null indicates auto-parsing mode)
    const integration = new GithubIntegration({
      yamlFileId,
      user: req.user.id,
      repoOwner,
      repoName,
      filePath: null, // null means parse entire repo structure
      branch,
      webhookSecret
    });

    await integration.save();

    // Generate webhook URL
    const webhookUrl = `${process.env.API_BASE_URL || 'http://localhost:5000'}/api/github/webhook/${integration._id}`;

    res.status(201).json({
      message: 'GitHub repo auto-parser created successfully',
      integration: {
        id: integration._id,
        repoOwner,
        repoName,
        branch,
        mode: 'auto-parse',
        webhookUrl,
        webhookSecret,
        setupInstructions: `
1. Go to: https://github.com/${repoOwner}/${repoName}/settings/hooks
2. Click "Add webhook"
3. Paste Payload URL: ${webhookUrl}
4. Content type: application/json
5. Secret: ${webhookSecret}
6. Select "Just the push event"
7. Click "Add webhook"

Your repo structure will be automatically visualized on every push!
        `.trim()
      }
    });
  } catch (error) {
    console.error('GitHub connect-repo error:', error);
    res.status(500).json({ error: 'Failed to create GitHub repo integration' });
  }
});

// Get integration for a file
router.get('/integration/:yamlFileId', auth, async (req, res) => {
  try {
    const integration = await GithubIntegration.findOne({
      yamlFileId: req.params.yamlFileId,
      user: req.user.id
    });

    if (!integration) {
      return res.status(404).json({ error: 'No GitHub integration found' });
    }

    const webhookUrl = `${process.env.API_BASE_URL || 'http://localhost:5000'}/api/github/webhook/${integration._id}`;

    res.json({
      integration: {
        id: integration._id,
        yamlFileId: integration.yamlFileId.toString(), // Add this for debugging
        repoOwner: integration.repoOwner,
        repoName: integration.repoName,
        filePath: integration.filePath,
        branch: integration.branch,
        mode: integration.filePath ? 'file-sync' : 'auto-parse',
        lastSyncedAt: integration.lastSyncedAt,
        autoSync: integration.autoSync,
        active: integration.active,
        webhookUrl
      }
    });
  } catch (error) {
    console.error('Get integration error:', error);
    res.status(500).json({ error: 'Failed to get integration' });
  }
});

// Manually sync from GitHub
router.post('/sync/:integrationId', auth, async (req, res) => {
  try {
    const integration = await GithubIntegration.findOne({
      _id: req.params.integrationId,
      user: req.user.id
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    let content;

    // Determine mode: auto-parse entire repo or sync specific file
    if (!integration.filePath) {
      // AUTO-PARSE MODE: Generate YAML from entire repo structure
      content = await generateAutoParseYamlFromBranch(
        integration.repoOwner,
        integration.repoName,
        integration.branch
      );
    } else {
      // FILE SYNC MODE: Sync specific file
      const githubUrl = `https://raw.githubusercontent.com/${integration.repoOwner}/${integration.repoName}/${integration.branch}/${integration.filePath}`;

      const response = await axios.get(githubUrl);
      content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
    }

    await persistYamlFromGithubSync({
      yamlFileId: integration.yamlFileId,
      content,
      integration,
      commitSha: null,
    });

    res.json({
      message: 'Synced successfully from GitHub',
      lastSyncedAt: integration.lastSyncedAt
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: 'Failed to sync from GitHub' });
  }
});

// Disconnect GitHub integration
router.delete('/disconnect/:integrationId', auth, async (req, res) => {
  try {
    const integration = await GithubIntegration.findOneAndDelete({
      _id: req.params.integrationId,
      user: req.user.id
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.json({ message: 'GitHub integration disconnected successfully' });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: 'Failed to disconnect integration' });
  }
});

// Test webhook endpoint (helps verify webhook is reachable)
router.get('/webhook/:integrationId', async (req, res) => {
  try {
    const integration = await GithubIntegration.findById(req.params.integrationId);

    if (!integration) {
      return res.status(404).json({
        error: 'Integration not found',
        integrationId: req.params.integrationId
      });
    }

    return res.json({
      message: 'Webhook endpoint is reachable',
      integration: {
        id: integration._id,
        repo: `${integration.repoOwner}/${integration.repoName}`,
        branch: integration.branch,
        mode: integration.filePath ? 'file-sync' : 'auto-parse',
        active: integration.active,
        autoSync: integration.autoSync
      }
    });
  } catch (error) {
    console.error('Webhook test error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GitHub Webhook endpoint (no auth required, uses webhook secret)
router.post('/webhook/:integrationId', async (req, res) => {
  try {
    console.log(`🔔 Webhook received for integration: ${req.params.integrationId}`);
    console.log(`📋 Event type: ${req.headers['x-github-event']}`);

    const integration = await GithubIntegration.findById(req.params.integrationId);

    if (!integration || !integration.active) {
      console.error(`❌ Integration not found or inactive: ${req.params.integrationId}`);
      return res.status(404).json({ error: 'Integration not found or inactive' });
    }

    console.log(`✅ Integration found: ${integration.repoOwner}/${integration.repoName}`);
    console.log(`📂 Mode: ${integration.filePath ? 'file-sync' : 'auto-parse'}`);

    // Verify webhook signature using raw body
    const signature = req.headers['x-hub-signature-256'];
    if (signature) {
      if (!req.rawBody) {
        console.error('❌ Raw body not available for signature verification');
        return res.status(400).json({ error: 'Unable to verify signature' });
      }

      const hmac = crypto.createHmac('sha256', integration.webhookSecret);
      const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');

      if (signature !== digest) {
        console.error('❌ Webhook signature verification failed');
        console.error(`Expected: ${digest}`);
        console.error(`Received: ${signature}`);
        return res.status(401).json({ error: 'Invalid signature' });
      }
      console.log('✅ Webhook signature verified');
    } else {
      console.warn('⚠️ No signature provided - webhook not secured');
    }

    // Use parsed body for processing
    const body = req.body;

    // Check if auto-sync is enabled
    if (!integration.autoSync) {
      console.log('ℹ️ Auto-sync disabled, ignoring webhook');
      return res.status(200).json({ message: 'Auto-sync disabled, ignoring webhook' });
    }

    // Check event type
    const event = req.headers['x-github-event'];

    // Handle ping event (sent when webhook is first created)
    if (event === 'ping') {
      console.log('🏓 Received ping event from GitHub');
      return res.status(200).json({
        message: 'Webhook is configured correctly',
        pong: true
      });
    }

    // Only process push events
    if (event !== 'push') {
      console.log(`ℹ️ Not a push event (${event}), ignoring`);
      return res.status(200).json({ message: 'Not a push event, ignoring' });
    }

    const { ref, commits } = body;
    const pushedBranch = ref?.split('/').pop();
    console.log(`📌 Push to branch: ${pushedBranch}, monitoring: ${integration.branch}`);

    // Check if push is to the monitored branch
    if (String(pushedBranch || '').toLowerCase() !== String(integration.branch || '').toLowerCase()) {
      console.log(`ℹ️ Push to different branch (${pushedBranch}), ignoring`);
      return res.status(200).json({ message: 'Push to different branch, ignoring' });
    }

    console.log(`✅ Push event matches monitored branch (${integration.branch})`);
    console.log(`📦 Commits in push: ${commits?.length || 0}`);

    let content;

    // Determine mode: auto-parse entire repo or sync specific file
    if (!integration.filePath) {
      // AUTO-PARSE MODE: Generate YAML from entire repo structure
      console.log(`🔄 Auto-parsing repo structure for ${integration.repoOwner}/${integration.repoName}`);

      try {
        // Same pipeline as connect-repo / manual sync, with optional pin to push commit + fallback.
        content = await generateAutoParseYamlFromPush(
          integration.repoOwner,
          integration.repoName,
          integration.branch,
          body
        );
        console.log(`✅ GitHub webhook: Repo structure parsed successfully (${content.length} chars)`);
      } catch (githubError) {
        console.error('❌ Failed to fetch repo structure from GitHub:', githubError.message);
        if (githubError.response?.status === 403) {
          return res.status(200).json({ message: 'GitHub API rate limit exceeded, will retry later' });
        }
        throw githubError;
      }
    } else {
      // FILE SYNC MODE: Sync specific file
      // Check if the monitored file was modified
      const fileModified = commits?.some(commit =>
        commit.added?.includes(integration.filePath) ||
        commit.modified?.includes(integration.filePath)
      );

      if (!fileModified) {
        console.log(`ℹ️ Monitored file ${integration.filePath} not modified in this push`);
        return res.status(200).json({ message: 'Monitored file not modified, ignoring' });
      }

      // Fetch updated content from GitHub
      const githubUrl = `https://raw.githubusercontent.com/${integration.repoOwner}/${integration.repoName}/${integration.branch}/${integration.filePath}`;

      try {
        const response = await axios.get(githubUrl);
        content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
        console.log(`✅ GitHub webhook: File ${integration.filePath} synced successfully (${content.length} chars)`);
      } catch (githubError) {
        console.error('❌ Failed to fetch file from GitHub:', githubError.message);
        if (githubError.response?.status === 404) {
          console.error(`❌ File not found: ${githubUrl}`);
          return res.status(200).json({ message: 'File not found on GitHub, may have been deleted' });
        }
        if (githubError.response?.status === 403) {
          return res.status(200).json({ message: 'GitHub API rate limit exceeded, will retry later' });
        }
        throw githubError;
      }
    }

    console.log(`📝 Persisting YAML for file ID: ${integration.yamlFileId.toString()}`);
    console.log(`📊 Content length: ${content.length} characters`);

    try {
      const yamlFile = await persistYamlFromGithubSync({
        yamlFileId: integration.yamlFileId,
        content,
        integration,
        commitSha: commits?.[0]?.id,
      });
      console.log(`✅ File saved. UpdatedAt: ${yamlFile.updatedAt}`);
    } catch (saveError) {
      console.error(`❌ Failed to persist GitHub sync:`, saveError);
      throw saveError;
    }

    res.status(200).json({
      message: 'Webhook processed successfully',
      synced: true,
      lastSyncedAt: integration.lastSyncedAt
    });
  } catch (error) {
    console.error('❌ Webhook processing error:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

export default router;
