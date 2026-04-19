import { jest } from '@jest/globals';
import mongoose from 'mongoose';

// Mock dependencies before importing
jest.unstable_mockModule('../../src/controllers/versionController.js', () => ({
  saveYamlWithVersionHistory: jest.fn(),
}));

jest.unstable_mockModule('../../src/services/collaborationService.js', () => ({
  notifyFileUpdate: jest.fn(),
}));

const { persistYamlFromGithubSync } = await import('../../src/services/githubSyncService.js');
const { saveYamlWithVersionHistory } = await import('../../src/controllers/versionController.js');
const { notifyFileUpdate } = await import('../../src/services/collaborationService.js');

describe('GitHub Sync Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('persistYamlFromGithubSync', () => {
    it('should persist GitHub content with commit SHA', async () => {
      const yamlFileId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const content = 'name: Service\ntype: microservice';
      const commitSha = 'abc123def456';

      const mockIntegration = {
        user: userId,
        lastSyncedAt: null,
        lastCommitSha: null,
        save: jest.fn().mockResolvedValue(),
      };

      const mockYamlFile = {
        _id: yamlFileId,
        content,
        currentVersion: 2,
      };

      saveYamlWithVersionHistory.mockResolvedValue(mockYamlFile);

      const result = await persistYamlFromGithubSync({
        yamlFileId,
        content,
        integration: mockIntegration,
        commitSha,
      });

      // Verify saveYamlWithVersionHistory called correctly
      expect(saveYamlWithVersionHistory).toHaveBeenCalledWith(
        yamlFileId.toString(),
        content,
        userId,
        {
          message: expect.stringContaining('GitHub sync (abc123d)'),
          saveType: 'auto',
        }
      );

      // Verify integration updated
      expect(mockIntegration.lastSyncedAt).toBeInstanceOf(Date);
      expect(mockIntegration.lastCommitSha).toBe(commitSha);
      expect(mockIntegration.save).toHaveBeenCalled();

      // Verify collaboration notification
      expect(notifyFileUpdate).toHaveBeenCalledWith(
        yamlFileId.toString(),
        content
      );

      // Verify result
      expect(result).toEqual(mockYamlFile);
    });

    it('should persist GitHub content without commit SHA (manual sync)', async () => {
      const yamlFileId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const content = 'name: Service\ntype: app';

      const mockIntegration = {
        user: userId,
        lastSyncedAt: null,
        lastCommitSha: 'old-sha',
        save: jest.fn().mockResolvedValue(),
      };

      const mockYamlFile = {
        _id: yamlFileId,
        content,
      };

      saveYamlWithVersionHistory.mockResolvedValue(mockYamlFile);

      const result = await persistYamlFromGithubSync({
        yamlFileId,
        content,
        integration: mockIntegration,
        commitSha: null,
      });

      // Verify message for manual sync
      expect(saveYamlWithVersionHistory).toHaveBeenCalledWith(
        yamlFileId.toString(),
        content,
        userId,
        {
          message: 'GitHub sync (manual)',
          saveType: 'auto',
        }
      );

      // Verify integration updated but lastCommitSha unchanged
      expect(mockIntegration.lastSyncedAt).toBeInstanceOf(Date);
      expect(mockIntegration.lastCommitSha).toBe('old-sha'); // Not updated
      expect(mockIntegration.save).toHaveBeenCalled();

      expect(result).toEqual(mockYamlFile);
    });

    it('should handle empty commit SHA', async () => {
      const yamlFileId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const content = 'name: Test';

      const mockIntegration = {
        user: userId,
        lastSyncedAt: null,
        save: jest.fn().mockResolvedValue(),
      };

      saveYamlWithVersionHistory.mockResolvedValue({ _id: yamlFileId, content });

      await persistYamlFromGithubSync({
        yamlFileId,
        content,
        integration: mockIntegration,
        commitSha: '',
      });

      // Empty string is falsy, should use manual sync message
      expect(saveYamlWithVersionHistory).toHaveBeenCalledWith(
        expect.any(String),
        content,
        userId,
        expect.objectContaining({
          message: 'GitHub sync (manual)',
        })
      );
    });

    it('should truncate long commit SHA in message', async () => {
      const yamlFileId = new mongoose.Types.ObjectId();
      const userId = new mongoose.Types.ObjectId();
      const longCommitSha = 'abcdef1234567890abcdef1234567890abcdef12';

      const mockIntegration = {
        user: userId,
        save: jest.fn().mockResolvedValue(),
      };

      saveYamlWithVersionHistory.mockResolvedValue({});

      await persistYamlFromGithubSync({
        yamlFileId,
        content: 'test',
        integration: mockIntegration,
        commitSha: longCommitSha,
      });

      expect(saveYamlWithVersionHistory).toHaveBeenCalledWith(
        expect.any(String),
        'test',
        userId,
        expect.objectContaining({
          message: 'GitHub sync (abcdef1)', // Only first 7 chars
        })
      );
    });
  });
});
