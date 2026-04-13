import crypto from 'crypto';
import axios from 'axios';
import GithubIntegration from '../models/GithubIntegration.js';
import YamlFile from '../models/YamlFile.js';
import {
  generateAutoParseYamlFromBranch,
  generateAutoParseYamlFromPush,
} from '../services/githubRepoParser.js';
import { persistYamlFromGithubSync } from '../services/githubSyncService.js';
import { saveYamlWithVersionHistory } from './versionController.js';
import { GITHUB } from '../config/constants.js';

/**
 * Create GitHub file sync integration
 * POST /api/github/connect
 */
export const connectFileSync = async (req, res) => {
  try {
    const { yamlFileId, repoOwner, repoName, filePath, branch = GITHUB.DEFAULT_BRANCH } = req.body;

    // Verify user owns the YAML file
    const yamlFile = await YamlFile.findOne({ _id: yamlFileId, owner: req.user._id });
    if (!yamlFile) {
      return res.status(404).json({ error: 'YAML file not found or access denied' });
    }

    // Check if integration already exists
    const existing = await GithubIntegration.findOne({ yamlFileId });
    if (existing) {
      return res.status(400).json({ error: 'GitHub integration already exists for this file' });
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(GITHUB.WEBHOOK_SECRET_BYTES).toString('hex');

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

    // Persist YAML + VersionHistory
    await saveYamlWithVersionHistory(yamlFile._id.toString(), content, req.user.id, {
      message: 'GitHub file integration (initial)',
      saveType: 'initial',
    });

    // Create integration
    const integration = new GithubIntegration({
      yamlFileId,
      user: req.user._id,
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
    res.status(500).json({ error: 'Failed to create GitHub integration' });
  }
};

/**
 * Create GitHub repo auto-parser integration
 * POST /api/github/connect-repo
 */
export const connectRepoParser = async (req, res) => {
  try {
    const { yamlFileId, repoOwner, repoName, branch = 'main' } = req.body;

    // Verify user owns the YAML file
    const yamlFile = await YamlFile.findOne({ _id: yamlFileId, owner: req.user._id });
    if (!yamlFile) {
      return res.status(404).json({ error: 'YAML file not found or access denied' });
    }

    // Check if integration already exists
    const existing = await GithubIntegration.findOne({ yamlFileId });
    if (existing) {
      return res.status(400).json({ error: 'GitHub integration already exists for this file' });
    }

    // Generate webhook secret
    const webhookSecret = crypto.randomBytes(GITHUB.WEBHOOK_SECRET_BYTES).toString('hex');

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

    // Persist YAML + VersionHistory
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
    res.status(500).json({ error: 'Failed to create GitHub repo integration' });
  }
};

/**
 * Get integration for a YAML file
 * GET /api/github/integration/:yamlFileId
 */
export const getIntegration = async (req, res) => {
  try {
    const integration = await GithubIntegration.findOne({
      yamlFileId: req.params.yamlFileId,
      user: req.user._id
    });

    if (!integration) {
      return res.status(404).json({ error: 'No GitHub integration found' });
    }

    const webhookUrl = `${process.env.API_BASE_URL || 'http://localhost:5000'}/api/github/webhook/${integration._id}`;

    res.json({
      integration: {
        id: integration._id,
        yamlFileId: integration.yamlFileId.toString(),
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
    res.status(500).json({ error: 'Failed to get integration' });
  }
};

/**
 * Manually sync from GitHub
 * POST /api/github/sync/:integrationId
 */
export const manualSync = async (req, res) => {
  try {
    const integration = await GithubIntegration.findOne({
      _id: req.params.integrationId,
      user: req.user._id
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

      try {
        const response = await axios.get(githubUrl);
        content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
      } catch (fetchError) {
        if (fetchError.response?.status === 404) {
          return res.status(404).json({
            error: 'File not found on GitHub',
            filePath: integration.filePath,
            url: githubUrl
          });
        }
        throw fetchError;
      }
    }

    await persistYamlFromGithubSync({
      yamlFileId: integration.yamlFileId,
      content,
      integration,
      commitSha: null,
    });

    res.json({
      message: 'Synced successfully from GitHub',
      lastSyncedAt: integration.lastSyncedAt,
      contentLength: content.length,
      mode: integration.filePath ? 'file-sync' : 'auto-parse'
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to sync from GitHub',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};

/**
 * Disconnect GitHub integration
 * DELETE /api/github/disconnect/:integrationId
 */
export const disconnectIntegration = async (req, res) => {
  try {
    const integration = await GithubIntegration.findOneAndDelete({
      _id: req.params.integrationId,
      user: req.user._id
    });

    if (!integration) {
      return res.status(404).json({ error: 'Integration not found' });
    }

    res.json({ message: 'GitHub integration disconnected successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to disconnect integration' });
  }
};

/**
 * Test webhook endpoint
 * GET /api/github/webhook/:integrationId
 */
export const testWebhook = async (req, res) => {
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
    return res.status(500).json({ error: 'Internal server error' });
  }
};

/**
 * GitHub Webhook handler
 * POST /api/github/webhook/:integrationId
 */
export const handleWebhook = async (req, res) => {
  try {
    const integration = await GithubIntegration.findById(req.params.integrationId);

    if (!integration || !integration.active) {
      return res.status(404).json({ error: 'Integration not found or inactive' });
    }

    // Verify webhook signature using raw body
    const signature = req.headers['x-hub-signature-256'];
    if (signature) {
      if (!req.rawBody) {
        return res.status(400).json({ error: 'Unable to verify signature' });
      }

      const hmac = crypto.createHmac('sha256', integration.webhookSecret);
      const digest = 'sha256=' + hmac.update(req.rawBody).digest('hex');

      if (signature !== digest) {
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    // Use parsed body for processing
    const body = req.body;

    // Check if auto-sync is enabled
    if (!integration.autoSync) {
      return res.status(200).json({ message: 'Auto-sync disabled, ignoring webhook' });
    }

    // Check event type
    const event = req.headers['x-github-event'];

    // Handle ping event (sent when webhook is first created)
    if (event === 'ping') {
      return res.status(200).json({
        message: 'Webhook is configured correctly',
        pong: true
      });
    }

    // Only process push events
    if (event !== 'push') {
      return res.status(200).json({ message: 'Not a push event, ignoring' });
    }

    const { ref, commits } = body;
    const pushedBranch = ref?.split('/').pop();

    // Check if push is to the monitored branch
    if (String(pushedBranch || '').toLowerCase() !== String(integration.branch || '').toLowerCase()) {
      return res.status(200).json({ message: 'Push to different branch, ignoring' });
    }

    let content;

    // Determine mode: auto-parse entire repo or sync specific file
    if (!integration.filePath) {
      // AUTO-PARSE MODE: Generate YAML from entire repo structure
      try {
        content = await generateAutoParseYamlFromPush(
          integration.repoOwner,
          integration.repoName,
          integration.branch,
          body
        );
      } catch (githubError) {
        if (githubError.response?.status === 403) {
          return res.status(200).json({ message: 'GitHub API rate limit exceeded, will retry later' });
        }
        throw githubError;
      }
    } else {
      // FILE SYNC MODE: Sync specific file
      // Check if the monitored file was modified

      // Normalize paths for comparison (remove leading slashes, handle case differences)
      const normalizeFilePath = (path) => {
        if (!path) return '';
        return path.replace(/^\/+/, '').toLowerCase();
      };

      const targetPath = normalizeFilePath(integration.filePath);

      const fileModified = commits?.some(commit => {
        const allFiles = [
          ...(commit.added || []),
          ...(commit.modified || []),
          ...(commit.removed || [])
        ];

        return allFiles.some(file => {
          const normalizedFile = normalizeFilePath(file);
          return normalizedFile === targetPath;
        });
      });

      if (!fileModified) {
        const allFilesInPush = commits?.flatMap(c => [
          ...(c.added || []),
          ...(c.modified || []),
          ...(c.removed || [])
        ]) || [];

        return res.status(200).json({
          message: 'Monitored file not modified, ignoring',
          monitoredFile: integration.filePath,
          filesInPush: allFilesInPush
        });
      }

      // Fetch updated content from GitHub
      const githubUrl = `https://raw.githubusercontent.com/${integration.repoOwner}/${integration.repoName}/${integration.branch}/${integration.filePath}`;

      try {
        const response = await axios.get(githubUrl);
        content = typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2);
      } catch (githubError) {
        if (githubError.response?.status === 404) {
          return res.status(200).json({ message: 'File not found on GitHub, may have been deleted' });
        }
        if (githubError.response?.status === 403) {
          return res.status(200).json({ message: 'GitHub API rate limit exceeded, will retry later' });
        }
        throw githubError;
      }
    }

    await persistYamlFromGithubSync({
      yamlFileId: integration.yamlFileId,
      content,
      integration,
      commitSha: commits?.[0]?.id,
    });

    res.status(200).json({
      message: 'Webhook processed successfully',
      synced: true,
      lastSyncedAt: integration.lastSyncedAt
    });
  } catch (error) {
    res.status(500).json({
      error: 'Webhook processing failed',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
};
