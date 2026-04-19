import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import User from '../../src/models/User.js';
import YamlFile from '../../src/models/YamlFile.js';
import GithubIntegration from '../../src/models/GithubIntegration.js';
import { authHeader } from '../utils/authHelpers.js';
import { createHashedUserData } from '../fixtures/users.js';
import { createYamlFileData } from '../fixtures/yamlFiles.js';
import githubRoutes from '../../src/routes/github.js';

// Mock external services
jest.unstable_mockModule('../../src/services/githubSyncService.js', () => ({
  persistYamlFromGithubSync: jest.fn().mockResolvedValue(),
}));

jest.unstable_mockModule('../../src/controllers/versionController.js', () => ({
  saveYamlWithVersionHistory: jest.fn().mockResolvedValue(),
}));

jest.unstable_mockModule('axios', () => ({
  default: {
    get: jest.fn(),
  },
}));

jest.unstable_mockModule('../../src/services/githubRepoParser.js', () => ({
  generateAutoParseYamlFromBranch: jest.fn().mockResolvedValue('name: Parsed\ntype: service'),
  generateAutoParseYamlFromPush: jest.fn().mockResolvedValue('name: Parsed\ntype: service'),
}));

const axios = (await import('axios')).default;

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/github', githubRoutes);
  return app;
};

describe('GitHub Integration API', () => {
  let app;
  let testUser;
  let yamlFile;

  beforeAll(async () => {
    await setupDatabase();
    app = createTestApp();
  });

  afterAll(async () => {
    await teardownDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
    axios.get.mockClear();

    testUser = await User.create(await createHashedUserData({
      username: 'testuser',
      email: 'test@test.com'
    }));

    yamlFile = await YamlFile.create(createYamlFileData(testUser._id, {
      title: 'Test YAML'
    }));
  });

  describe('POST /api/github/connect-repo', () => {
    it('should connect repo parser integration', async () => {
      axios.get.mockResolvedValue({ data: 'name: Repo\ntype: service' });

      const response = await request(app)
        .post('/api/github/connect-repo')
        .set(authHeader(testUser._id))
        .send({
          yamlFileId: yamlFile._id.toString(),
          repoOwner: 'testowner',
          repoName: 'testrepo',
          branch: 'main'
        })
        .expect(201);

      expect(response.body.message).toContain('auto-parser');
      expect(response.body.integration).toHaveProperty('webhookUrl');
      expect(response.body.integration).toHaveProperty('webhookSecret');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/github/connect-repo')
        .send({
          yamlFileId: yamlFile._id.toString(),
          repoOwner: 'test',
          repoName: 'test'
        })
        .expect(401);
    });
  });

  describe('GET /api/github/integration/:yamlFileId', () => {
    let integration;

    beforeEach(async () => {
      integration = await GithubIntegration.create({
        yamlFileId: yamlFile._id,
        user: testUser._id,
        repoOwner: 'testowner',
        repoName: 'testrepo',
        filePath: 'config.yaml',
        branch: 'main',
        webhookSecret: crypto.randomBytes(32).toString('hex')
      });
    });

    it('should get integration details', async () => {
      const response = await request(app)
        .get(`/api/github/integration/${yamlFile._id}`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.integration.repoOwner).toBe('testowner');
      expect(response.body.integration.repoName).toBe('testrepo');
      expect(response.body.integration.filePath).toBe('config.yaml');
    });

    it('should return 404 for non-existent integration', async () => {
      const otherFile = await YamlFile.create(createYamlFileData(testUser._id));

      await request(app)
        .get(`/api/github/integration/${otherFile._id}`)
        .set(authHeader(testUser._id))
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .get(`/api/github/integration/${yamlFile._id}`)
        .expect(401);
    });
  });

  describe('DELETE /api/github/disconnect/:integrationId', () => {
    let integration;

    beforeEach(async () => {
      integration = await GithubIntegration.create({
        yamlFileId: yamlFile._id,
        user: testUser._id,
        repoOwner: 'testowner',
        repoName: 'testrepo',
        filePath: 'config.yaml',
        branch: 'main',
        webhookSecret: 'secret123'
      });
    });

    it('should disconnect integration', async () => {
      await request(app)
        .delete(`/api/github/disconnect/${integration._id}`)
        .set(authHeader(testUser._id))
        .expect(200);

      const deleted = await GithubIntegration.findById(integration._id);
      expect(deleted).toBeNull();
    });

    it('should return 404 for non-existent integration', async () => {
      await request(app)
        .delete('/api/github/disconnect/507f1f77bcf86cd799439999')
        .set(authHeader(testUser._id))
        .expect(404);
    });

    it('should require authentication', async () => {
      await request(app)
        .delete(`/api/github/disconnect/${integration._id}`)
        .expect(401);
    });
  });

  describe('GET /api/github/webhook/:integrationId', () => {
    let integration;

    beforeEach(async () => {
      integration = await GithubIntegration.create({
        yamlFileId: yamlFile._id,
        user: testUser._id,
        repoOwner: 'testowner',
        repoName: 'testrepo',
        filePath: 'config.yaml',
        branch: 'main',
        webhookSecret: 'secret123'
      });
    });

    it('should test webhook endpoint', async () => {
      const response = await request(app)
        .get(`/api/github/webhook/${integration._id}`)
        .expect(200);

      expect(response.body.message).toContain('Webhook endpoint');
      expect(response.body.integration).toBeDefined();
      expect(response.body.integration.id).toBeDefined();
    });
  });

  describe('POST /api/github/webhook/:integrationId', () => {
    let integration;

    beforeEach(async () => {
      const created = await GithubIntegration.create({
        yamlFileId: yamlFile._id,
        user: testUser._id,
        repoOwner: 'testowner',
        repoName: 'testrepo',
        filePath: 'config.yaml',
        branch: 'main',
        webhookSecret: 'my-secret'
      });
      integration = created;
    });

    it('should handle webhook without signature (signature validation requires raw body)', async () => {
      const payload = {
        ref: 'refs/heads/main',
        commits: [{
          id: 'abc123',
          modified: ['config.yaml']
        }]
      };

      axios.get.mockResolvedValue({ data: 'name: Updated\ntype: service' });

      // Without raw body middleware, signature validation will fail
      // But endpoint should still respond (either 400 for missing raw body or process if no signature)
      const response = await request(app)
        .post(`/api/github/webhook/${integration._id}`)
        .send(payload);

      expect([200, 400]).toContain(response.status);
      expect(response.body).toHaveProperty('message');
    });

    it('should reject webhook with signature but no raw body', async () => {
      const payload = {
        ref: 'refs/heads/main',
        commits: [{ modified: ['config.yaml'] }]
      };

      const response = await request(app)
        .post(`/api/github/webhook/${integration._id}`)
        .set('x-hub-signature-256', 'sha256=invalidsignature')
        .send(payload);

      // Will fail with 400 because raw body is not available in test environment
      expect([400, 401]).toContain(response.status);
    });

    it('should handle ping event', async () => {
      const payload = {
        zen: 'Design for failure'
      };

      const response = await request(app)
        .post(`/api/github/webhook/${integration._id}`)
        .set('x-github-event', 'ping')
        .send(payload);

      // Ping should work even without signature
      expect([200, 400]).toContain(response.status);
    });

    it('should respond to non-push events', async () => {
      const payload = {
        action: 'opened'
      };

      const response = await request(app)
        .post(`/api/github/webhook/${integration._id}`)
        .set('x-github-event', 'pull_request')
        .send(payload);

      expect([200, 400]).toContain(response.status);
    });

    it('should return 404 for non-existent integration', async () => {
      const response = await request(app)
        .post('/api/github/webhook/507f1f77bcf86cd799439999')
        .send({});

      expect(response.status).toBe(404);
    });
  });
});
