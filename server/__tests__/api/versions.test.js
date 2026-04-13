import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import User from '../../src/models/User.js';
import YamlFile from '../../src/models/YamlFile.js';
import VersionHistory from '../../src/models/VersionHistory.js';
import { authHeader } from '../utils/authHelpers.js';
import { createHashedUserData } from '../fixtures/users.js';
import { createYamlFileData } from '../fixtures/yamlFiles.js';
import versionRoutes from '../../src/routes/versions.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/versions', versionRoutes);
  return app;
};

describe('Version History API', () => {
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

    testUser = await User.create(await createHashedUserData({
      username: 'testuser',
      email: 'test@test.com'
    }));

    yamlFile = await YamlFile.create(createYamlFileData(testUser._id, {
      content: 'name: Initial\ntype: service',
      currentVersion: 1
    }));
  });

  describe('POST /api/versions/:fileId/versions', () => {
    it('should create a new version', async () => {
      const response = await request(app)
        .post(`/api/versions/${yamlFile._id}/versions`)
        .set(authHeader(testUser._id))
        .send({
          content: 'name: Updated\ntype: service',
          message: 'Updated content'
        })
        .expect(201);

      expect(response.body.version).toHaveProperty('version'); // Field is called 'version'
      expect(response.body.version.message).toBe('Updated content');
      expect(response.body.version.author).toBeDefined();

      const versions = await VersionHistory.find({ fileId: yamlFile._id });
      expect(versions.length).toBeGreaterThanOrEqual(1);
    });

    it('should require authentication', async () => {
      await request(app)
        .post(`/api/versions/${yamlFile._id}/versions`)
        .send({ content: 'test', message: 'test' })
        .expect(401);
    });
  });

  describe('GET /api/versions/:fileId/versions', () => {
    beforeEach(async () => {
      // Create some versions with proper schema
      await VersionHistory.create({
        fileId: yamlFile._id,
        version: 1,
        delta: [{ op: 'insert', data: 'name: V1', position: 0 }],
        author: testUser._id,
        message: 'Version 1',
        changeMetadata: {
          summary: 'Initial version',
          saveType: 'manual'
        }
      });

      await VersionHistory.create({
        fileId: yamlFile._id,
        version: 2,
        delta: [{ op: 'insert', data: 'name: V2', position: 0 }],
        author: testUser._id,
        message: 'Version 2',
        changeMetadata: {
          summary: 'Updated',
          saveType: 'manual'
        }
      });
    });

    it('should list all versions', async () => {
      const response = await request(app)
        .get(`/api/versions/${yamlFile._id}/versions`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.versions).toHaveLength(2);
      expect(response.body.versions[0].version).toBe(2); // Newest first
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get(`/api/versions/${yamlFile._id}/versions?limit=1&offset=0`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.versions).toHaveLength(1);
      expect(response.body.totalVersions).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GET /api/versions/:fileId/versions/:versionNumber', () => {
    beforeEach(async () => {
      await VersionHistory.create({
        fileId: yamlFile._id,
        version: 1,
        delta: [{ op: 'insert', data: 'name: Version 1\ntype: service', position: 0 }],
        author: testUser._id,
        message: 'First version',
        changeMetadata: {
          summary: 'First version',
          saveType: 'manual'
        }
      });
    });

    it('should get specific version by number', async () => {
      const response = await request(app)
        .get(`/api/versions/${yamlFile._id}/versions/1`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.version.version).toBe(1);
      expect(response.body.version.message).toBe('First version');
      expect(response.body).toHaveProperty('content'); // Returns 'content' not 'reconstructedContent'
    });

    it('should return 404 for non-existent version', async () => {
      await request(app)
        .get(`/api/versions/${yamlFile._id}/versions/999`)
        .set(authHeader(testUser._id))
        .expect(404);
    });
  });

  describe('GET /api/versions/:fileId/versions/compare', () => {
    beforeEach(async () => {
      await VersionHistory.create({
        fileId: yamlFile._id,
        version: 1,
        delta: [{ op: 'insert', data: 'name: V1\ntype: service', position: 0 }],
        author: testUser._id,
        changeMetadata: { summary: 'V1', saveType: 'manual' }
      });

      await VersionHistory.create({
        fileId: yamlFile._id,
        version: 2,
        delta: [{ op: 'insert', data: 'name: V2\ntype: application', position: 0 }],
        author: testUser._id,
        changeMetadata: { summary: 'V2', saveType: 'manual' }
      });
    });

    it('should compare two versions', async () => {
      const response = await request(app)
        .get(`/api/versions/${yamlFile._id}/versions/compare?fromVersion=1&toVersion=2`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body).toHaveProperty('comparison');
      expect(response.body.comparison).toHaveProperty('fromVersion');
      expect(response.body.comparison).toHaveProperty('toVersion');
      expect(response.body.comparison).toHaveProperty('delta');
    });

    it('should require fromVersion and toVersion parameters', async () => {
      await request(app)
        .get(`/api/versions/${yamlFile._id}/versions/compare`)
        .set(authHeader(testUser._id))
        .expect(400);
    });
  });

  describe('POST /api/versions/:fileId/versions/:versionNumber/revert', () => {
    beforeEach(async () => {
      await VersionHistory.create({
        fileId: yamlFile._id,
        version: 1,
        delta: [{ op: 'insert', data: 'name: Old Version\ntype: service', position: 0 }],
        isSnapshot: true,
        snapshotContent: 'name: Old Version\ntype: service',
        author: testUser._id,
        changeMetadata: { summary: 'Old', saveType: 'manual' }
      });

      yamlFile.content = 'name: Current\ntype: service';
      yamlFile.currentVersion = 2;
      await yamlFile.save();
    });

    it('should revert to previous version', async () => {
      const response = await request(app)
        .post(`/api/versions/${yamlFile._id}/versions/1/revert`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.revertedToVersion).toBe(1);

      const updated = await YamlFile.findById(yamlFile._id);
      expect(updated.content).toBe('name: Old Version\ntype: service');
    });

    it('should create a new version after revert', async () => {
      await request(app)
        .post(`/api/versions/${yamlFile._id}/versions/1/revert`)
        .set(authHeader(testUser._id))
        .expect(200);

      const versions = await VersionHistory.find({ fileId: yamlFile._id });
      expect(versions.length).toBeGreaterThan(1);
    });
  });

  describe('POST /api/versions/:fileId/versions/repair', () => {
    it('should repair version history', async () => {
      const response = await request(app)
        .post(`/api/versions/${yamlFile._id}/versions/repair`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.message).toContain('repaired');
    });
  });

  describe('GET /api/versions/:fileId/versions/debug', () => {
    it('should return debug information', async () => {
      const response = await request(app)
        .get(`/api/versions/${yamlFile._id}/versions/debug`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body).toHaveProperty('debugData');
      expect(Array.isArray(response.body.debugData)).toBe(true);
    });
  });

  describe('DELETE /api/versions/:fileId/versions/cleanup', () => {
    beforeEach(async () => {
      // Create many old versions with proper schema
      for (let i = 1; i <= 60; i++) {
        await VersionHistory.create({
          fileId: yamlFile._id,
          version: i,
          delta: [{ op: 'insert', data: `name: V${i}`, position: 0 }],
          author: testUser._id,
          changeMetadata: { summary: `V${i}`, saveType: 'auto' },
          createdAt: new Date(Date.now() - (60 - i) * 24 * 60 * 60 * 1000) // Stagger dates
        });
      }
    });

    it('should cleanup old versions', async () => {
      const response = await request(app)
        .delete(`/api/versions/${yamlFile._id}/versions/cleanup`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body).toHaveProperty('deletedVersions'); // Field is 'deletedVersions' not 'deletedCount'
      expect(response.body.success).toBe(true);

      const remaining = await VersionHistory.find({ fileId: yamlFile._id });
      expect(remaining.length).toBeLessThan(60);
    });
  });
});
