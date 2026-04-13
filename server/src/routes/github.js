import express from 'express';
import { auth } from '../middleware/auth.js';
import {
  connectFileSync,
  connectRepoParser,
  getIntegration,
  manualSync,
  disconnectIntegration,
  testWebhook,
  handleWebhook
} from '../controllers/githubController.js';

const router = express.Router();

/**
 * POST /api/github/connect
 * Create GitHub file sync integration
 */
router.post('/connect', auth, connectFileSync);

/**
 * POST /api/github/connect-repo
 * Create GitHub repo auto-parser integration
 */
router.post('/connect-repo', auth, connectRepoParser);

/**
 * GET /api/github/integration/:yamlFileId
 * Get integration for a YAML file
 */
router.get('/integration/:yamlFileId', auth, getIntegration);

/**
 * POST /api/github/sync/:integrationId
 * Manually sync from GitHub
 */
router.post('/sync/:integrationId', auth, manualSync);

/**
 * DELETE /api/github/disconnect/:integrationId
 * Disconnect GitHub integration
 */
router.delete('/disconnect/:integrationId', auth, disconnectIntegration);

/**
 * GET /api/github/webhook/:integrationId
 * Test webhook endpoint
 */
router.get('/webhook/:integrationId', testWebhook);

/**
 * POST /api/github/webhook/:integrationId
 * GitHub webhook handler (no auth, uses webhook secret)
 */
router.post('/webhook/:integrationId', handleWebhook);

export default router;
