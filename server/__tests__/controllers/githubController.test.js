import { jest } from '@jest/globals';
import mongoose from 'mongoose';

// Mock the service modules before importing the controller
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

// Now import everything else
const { connectFileSync, manualSync } = await import('../../src/controllers/githubController.js');
const YamlFile = (await import('../../src/models/YamlFile.js')).default;
const GithubIntegration = (await import('../../src/models/GithubIntegration.js')).default;
const axios = (await import('axios')).default;

describe('GitHub Controller', () => {
  let req, res;

  beforeEach(() => {
    req = {
      user: { _id: new mongoose.Types.ObjectId('507f1f77bcf86cd799439011') },
      body: {},
      params: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('connectFileSync', () => {
    it('should create GitHub file sync integration', async () => {
      const yamlFileId = new mongoose.Types.ObjectId();
      const mockYamlFile = {
        _id: yamlFileId,
        owner: req.user._id,
      };

      req.body = {
        yamlFileId: yamlFileId.toString(),
        repoOwner: 'testowner',
        repoName: 'testrepo',
        filePath: 'config.yaml',
        branch: 'main',
      };

      jest.spyOn(YamlFile, 'findOne').mockResolvedValue(mockYamlFile);
      jest.spyOn(GithubIntegration, 'findOne').mockResolvedValue(null);
      axios.get.mockResolvedValue({ data: 'name: Test\ntype: service' });

      const integrationId = new mongoose.Types.ObjectId();
      const mockSave = jest.fn().mockResolvedValue({
        _id: integrationId,
        webhookSecret: 'secret123',
      });

      jest.spyOn(GithubIntegration.prototype, 'save').mockImplementation(mockSave);

      await connectFileSync(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'GitHub integration created successfully',
          integration: expect.objectContaining({
            repoOwner: 'testowner',
            repoName: 'testrepo',
            branch: 'main',
            filePath: 'config.yaml',
          }),
        })
      );

      // Check that the response has all required fields
      const response = res.json.mock.calls[0][0];
      expect(response.integration).toHaveProperty('id');
      expect(response.integration).toHaveProperty('webhookUrl');
      expect(response.integration).toHaveProperty('webhookSecret');
    });

    it('should return 404 if YAML file not found', async () => {
      const yamlFileId = new mongoose.Types.ObjectId();
      req.body = {
        yamlFileId: yamlFileId.toString(),
        repoOwner: 'test',
        repoName: 'test',
        filePath: 'test.yaml',
      };

      jest.spyOn(YamlFile, 'findOne').mockResolvedValue(null);

      await connectFileSync(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({
        error: 'YAML file not found or access denied',
      });
    });

    it('should return 400 if integration already exists', async () => {
      const yamlFileId = new mongoose.Types.ObjectId();
      const mockYamlFile = { _id: yamlFileId, owner: req.user._id };
      const mockIntegration = { _id: new mongoose.Types.ObjectId() };

      req.body = {
        yamlFileId: yamlFileId.toString(),
        repoOwner: 'test',
        repoName: 'test',
        filePath: 'test.yaml',
      };

      jest.spyOn(YamlFile, 'findOne').mockResolvedValue(mockYamlFile);
      jest.spyOn(GithubIntegration, 'findOne').mockResolvedValue(mockIntegration);

      await connectFileSync(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'GitHub integration already exists for this file',
      });
    });

    it('should return 400 if GitHub file fetch fails', async () => {
      const yamlFileId = new mongoose.Types.ObjectId();
      const mockYamlFile = { _id: yamlFileId, owner: req.user._id };

      req.body = {
        yamlFileId: yamlFileId.toString(),
        repoOwner: 'test',
        repoName: 'test',
        filePath: 'nonexistent.yaml',
      };

      jest.spyOn(YamlFile, 'findOne').mockResolvedValue(mockYamlFile);
      jest.spyOn(GithubIntegration, 'findOne').mockResolvedValue(null);
      axios.get.mockRejectedValue(new Error('File not found'));

      await connectFileSync(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Failed to fetch file from GitHub. Please check repository, branch, and file path.',
        })
      );
    });
  });

  describe('manualSync', () => {
    it('should manually sync from GitHub', async () => {
      const integrationId = new mongoose.Types.ObjectId();
      const yamlFileId = new mongoose.Types.ObjectId();

      const mockIntegration = {
        _id: integrationId,
        yamlFileId: yamlFileId,
        repoOwner: 'test',
        repoName: 'repo',
        filePath: 'config.yaml',
        branch: 'main',
        lastSyncedAt: new Date(),
        save: jest.fn().mockResolvedValue(true),
      };

      req.params.integrationId = integrationId.toString();

      jest.spyOn(GithubIntegration, 'findOne').mockResolvedValue(mockIntegration);
      axios.get.mockResolvedValue({ data: 'name: Updated\ntype: service' });

      await manualSync(req, res);

      expect(axios.get).toHaveBeenCalledWith(
        expect.stringContaining('raw.githubusercontent.com')
      );
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Synced successfully from GitHub',
        })
      );
    });

    it('should return 404 for non-existent integration', async () => {
      const integrationId = new mongoose.Types.ObjectId();
      req.params.integrationId = integrationId.toString();

      jest.spyOn(GithubIntegration, 'findOne').mockResolvedValue(null);

      await manualSync(req, res);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: 'Integration not found' });
    });
  });
});
