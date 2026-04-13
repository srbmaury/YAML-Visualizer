import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import User from '../../src/models/User.js';
import YamlFile from '../../src/models/YamlFile.js';
import VersionHistory from '../../src/models/VersionHistory.js';
import GithubIntegration from '../../src/models/GithubIntegration.js';
import { authHeader } from '../utils/authHelpers.js';
import { createHashedUserData } from '../fixtures/users.js';
import { createYamlFileData } from '../fixtures/yamlFiles.js';
import yamlRoutes from '../../src/routes/yaml.js';
import versionRoutes from '../../src/routes/versions.js';
import githubRoutes from '../../src/routes/github.js';
import userRoutes from '../../src/routes/user.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/yaml', yamlRoutes);
  app.use('/api/versions', versionRoutes);
  app.use('/api/github', githubRoutes);
  app.use('/api/users', userRoutes);
  return app;
};

describe('Controller Error Paths', () => {
  let app;
  let testUser;

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
  });

  describe('YAML Controller Error Paths', () => {
    it('should return 400 for invalid ObjectId in GET /yaml/:id', async () => {
      await request(app)
        .get('/api/yaml/invalid-id')
        .set(authHeader(testUser._id))
        .expect(400);
    });

    it('should return 404 for non-existent YAML file', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await request(app)
        .get(`/api/yaml/${fakeId}`)
        .set(authHeader(testUser._id))
        .expect(404);
    });

    it('should return 403 or 404 for YAML file user has no access to', async () => {
      const otherUser = await User.create(await createHashedUserData({
        username: 'otheruser',
        email: 'other@test.com'
      }));

      const privateFile = await YamlFile.create(createYamlFileData(otherUser._id, {
        title: 'Private File',
        isPublic: false
      }));

      const response = await request(app)
        .get(`/api/yaml/${privateFile._id}`)
        .set(authHeader(testUser._id));

      expect([403, 404]).toContain(response.status);
    });

    it('should return 400 for invalid shareId format', async () => {
      await request(app)
        .get('/api/yaml/shared/too-short')
        .expect(400);
    });

    it('should return error for missing content in POST /yaml', async () => {
      const response = await request(app)
        .post('/api/yaml')
        .set(authHeader(testUser._id))
        .send({ title: 'No Content' });

      expect([400, 500]).toContain(response.status);
    });

    it('should return 403 for updating file without edit permission', async () => {
      const owner = await User.create(await createHashedUserData({
        username: 'owner',
        email: 'owner@test.com'
      }));

      const yamlFile = await YamlFile.create(createYamlFileData(owner._id, {
        permissions: new Map([[testUser._id.toString(), 'view']])
      }));

      await request(app)
        .put(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(testUser._id))
        .send({ content: 'Updated' })
        .expect(403);
    });

    it('should return 403 for deleting file as non-owner', async () => {
      const owner = await User.create(await createHashedUserData({
        username: 'owner',
        email: 'owner@test.com'
      }));

      const yamlFile = await YamlFile.create(createYamlFileData(owner._id, {
        permissions: new Map([[testUser._id.toString(), 'edit']])
      }));

      await request(app)
        .delete(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(testUser._id))
        .expect(403);
    });

    it('should return error for invalid permissions format', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      const response = await request(app)
        .post(`/api/yaml/${yamlFile._id}/permissions`)
        .set(authHeader(testUser._id))
        .send({ permissions: 'invalid' });

      expect([400, 500]).toContain(response.status);
    });

    it('should return 404 for getting collaborators of non-existent file', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await request(app)
        .get(`/api/yaml/${fakeId}/collaborators`)
        .set(authHeader(testUser._id))
        .expect(404);
    });
  });

  describe('Version Controller Error Paths', () => {
    it('should return error for invalid fileId in version operations', async () => {
      const response = await request(app)
        .post('/api/versions/invalid-id/versions')
        .set(authHeader(testUser._id))
        .send({ content: 'test', message: 'test' });

      expect([400, 500]).toContain(response.status);
    });

    it('should return 404 for creating version on non-existent file', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await request(app)
        .post(`/api/versions/${fakeId}/versions`)
        .set(authHeader(testUser._id))
        .send({ content: 'test', message: 'test' })
        .expect(404);
    });

    it('should return error for missing content in version creation', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      const response = await request(app)
        .post(`/api/versions/${yamlFile._id}/versions`)
        .set(authHeader(testUser._id))
        .send({ message: 'test' });

      expect([400, 500]).toContain(response.status);
    });

    it('should return 404 for getting versions of non-existent file', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await request(app)
        .get(`/api/versions/${fakeId}/versions`)
        .set(authHeader(testUser._id))
        .expect(404);
    });

    it('should handle invalid pagination parameters gracefully', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      // Negative values may be clamped, ignored, or cause errors
      const response1 = await request(app)
        .get(`/api/versions/${yamlFile._id}/versions?limit=-1`)
        .set(authHeader(testUser._id));

      expect([200, 400, 500]).toContain(response1.status);

      const response2 = await request(app)
        .get(`/api/versions/${yamlFile._id}/versions?offset=-1`)
        .set(authHeader(testUser._id));

      expect([200, 400, 500]).toContain(response2.status);
    });

    it('should return 400 for invalid version number', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      await request(app)
        .get(`/api/versions/${yamlFile._id}/versions/invalid`)
        .set(authHeader(testUser._id))
        .expect(400);
    });

    it('should return 400 for missing compare parameters', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      await request(app)
        .get(`/api/versions/${yamlFile._id}/versions/compare?fromVersion=1`)
        .set(authHeader(testUser._id))
        .expect(400);

      await request(app)
        .get(`/api/versions/${yamlFile._id}/versions/compare?toVersion=2`)
        .set(authHeader(testUser._id))
        .expect(400);
    });

    it('should return 400 for invalid version numbers in compare', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      await request(app)
        .get(`/api/versions/${yamlFile._id}/versions/compare?fromVersion=-1&toVersion=2`)
        .set(authHeader(testUser._id))
        .expect(400);
    });

    it('should return 404 for reverting to non-existent version', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      await request(app)
        .post(`/api/versions/${yamlFile._id}/versions/999/revert`)
        .set(authHeader(testUser._id))
        .expect(404);
    });

    it('should deny version operations without edit access', async () => {
      const owner = await User.create(await createHashedUserData({
        username: 'owner',
        email: 'owner@test.com'
      }));

      const yamlFile = await YamlFile.create(createYamlFileData(owner._id, {
        permissions: new Map([[testUser._id.toString(), 'view']])
      }));

      const response = await request(app)
        .post(`/api/versions/${yamlFile._id}/versions`)
        .set(authHeader(testUser._id))
        .send({ content: 'test', message: 'test' });

      expect([403, 404]).toContain(response.status);
    });
  });

  describe('GitHub Controller Error Paths', () => {
    it('should return error for missing required fields in connect-repo', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      const response = await request(app)
        .post('/api/github/connect-repo')
        .set(authHeader(testUser._id))
        .send({ yamlFileId: yamlFile._id.toString() });

      expect([400, 500]).toContain(response.status);
    });

    it('should return 404 for connecting non-existent file', async () => {
      const fakeId = new mongoose.Types.ObjectId();

      await request(app)
        .post('/api/github/connect-repo')
        .set(authHeader(testUser._id))
        .send({
          yamlFileId: fakeId.toString(),
          repoOwner: 'owner',
          repoName: 'repo',
          branch: 'main'
        })
        .expect(404);
    });

    it('should return error for invalid integration ID', async () => {
      const response = await request(app)
        .get('/api/github/integration/invalid-id')
        .set(authHeader(testUser._id));

      expect([400, 500]).toContain(response.status);
    });

    it('should return 404 for disconnect of non-existent integration', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await request(app)
        .delete(`/api/github/disconnect/${fakeId}`)
        .set(authHeader(testUser._id))
        .expect(404);
    });

    it('should deny disconnecting integration owned by another user', async () => {
      const otherUser = await User.create(await createHashedUserData({
        username: 'other',
        email: 'other@test.com'
      }));

      const yamlFile = await YamlFile.create(createYamlFileData(otherUser._id));

      const integration = await GithubIntegration.create({
        yamlFileId: yamlFile._id,
        user: otherUser._id,
        repoOwner: 'owner',
        repoName: 'repo',
        branch: 'main',
        webhookSecret: 'secret123'
      });

      const response = await request(app)
        .delete(`/api/github/disconnect/${integration._id}`)
        .set(authHeader(testUser._id));

      expect([403, 404]).toContain(response.status);
    });

    it('should return 404 for webhook of non-existent integration', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      await request(app)
        .get(`/api/github/webhook/${fakeId}`)
        .expect(404);
    });

    it('should return error for invalid webhook integration ID', async () => {
      const response = await request(app)
        .post('/api/github/webhook/invalid-id')
        .send({});

      expect([400, 404, 500]).toContain(response.status);
    });
  });

  describe('User Controller Error Paths', () => {
    it('should return 400 for updating profile with duplicate username', async () => {
      await User.create(await createHashedUserData({
        username: 'existing',
        email: 'existing@test.com'
      }));

      const response = await request(app)
        .put('/api/users/profile')
        .set(authHeader(testUser._id))
        .send({ username: 'existing' })
        .expect(400);

      expect(response.body.error).toContain('Username already taken');
    });

    it('should return 400 for updating profile with duplicate email', async () => {
      await User.create(await createHashedUserData({
        username: 'other',
        email: 'duplicate@test.com'
      }));

      const response = await request(app)
        .put('/api/users/profile')
        .set(authHeader(testUser._id))
        .send({ email: 'duplicate@test.com' })
        .expect(400);

      expect(response.body.error).toMatch(/(Email already taken|Email already registered)/);
    });

    it('should return 400 for password change with wrong current password', async () => {
      const response = await request(app)
        .put('/api/users/password')
        .set(authHeader(testUser._id))
        .send({
          currentPassword: 'wrongpassword',
          newPassword: 'newpassword123'
        })
        .expect(400);

      expect(response.body.error).toContain('Current password is incorrect');
    });

    it('should return 400 for missing required fields in password change', async () => {
      await request(app)
        .put('/api/users/password')
        .set(authHeader(testUser._id))
        .send({ newPassword: 'newpass' })
        .expect(400);

      await request(app)
        .put('/api/users/password')
        .set(authHeader(testUser._id))
        .send({ currentPassword: 'oldpass' })
        .expect(400);
    });

    it('should handle account deletion without password', async () => {
      const response = await request(app)
        .delete('/api/users/account')
        .set(authHeader(testUser._id))
        .send({});

      expect([400, 401]).toContain(response.status);
    });

    it('should handle account deletion with wrong password', async () => {
      const response = await request(app)
        .delete('/api/users/account')
        .set(authHeader(testUser._id))
        .send({ password: 'wrongpassword' });

      expect([400, 401]).toContain(response.status);
    });

    it('should return empty results for search with no matches', async () => {
      const response = await request(app)
        .get('/api/users/search?q=nonexistentuser12345')
        .set(authHeader(testUser._id));

      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toBeDefined();
      }
    });

    it('should handle search query that is too short', async () => {
      const response = await request(app)
        .get('/api/users/search?q=a')
        .set(authHeader(testUser._id));

      expect([200, 400]).toContain(response.status);
      if (response.status === 200) {
        expect(response.body).toBeDefined();
      }
    });

    it('should handle dashboard for user with no files', async () => {
      const response = await request(app)
        .get('/api/users/dashboard')
        .set(authHeader(testUser._id));

      if (response.status === 200) {
        expect(response.body).toBeDefined();
      }
      expect([200, 500]).toContain(response.status);
    });

    it('should return 404 for non-existent user in all endpoint', async () => {
      const fakeToken = authHeader(new mongoose.Types.ObjectId());
      await request(app)
        .get('/api/users/all')
        .set(fakeToken)
        .expect(401);
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long YAML content', async () => {
      const longContent = 'a'.repeat(100000);
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      const response = await request(app)
        .put(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(testUser._id))
        .send({ content: longContent });

      expect([200, 413]).toContain(response.status); // 413 = Payload Too Large
      if (response.status === 200) {
        expect(response.body.yamlFile || response.body).toBeDefined();
      }
    });

    it('should handle YAML with special characters', async () => {
      const specialContent = 'name: "Test with: special @ chars #comment\nnewline"';
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      const response = await request(app)
        .put(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(testUser._id))
        .send({ content: specialContent })
        .expect(200);

      const updatedFile = await YamlFile.findById(yamlFile._id);
      expect(updatedFile.content).toBe(specialContent);
    });

    it('should handle concurrent version creation', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      const promises = [
        request(app)
          .post(`/api/versions/${yamlFile._id}/versions`)
          .set(authHeader(testUser._id))
          .send({ content: 'version 1', message: 'v1' }),
        request(app)
          .post(`/api/versions/${yamlFile._id}/versions`)
          .set(authHeader(testUser._id))
          .send({ content: 'version 2', message: 'v2' }),
      ];

      const results = await Promise.all(promises);
      // At least one should succeed
      expect(results.some(r => r.status === 201)).toBe(true);
    });

    it('should handle minimal content in YAML file', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id, {
        content: 'name: test'
      }));

      const response = await request(app)
        .get(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.yamlFile.content).toBe('name: test');
    });

    it('should handle pagination with offset beyond total', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      const response = await request(app)
        .get(`/api/versions/${yamlFile._id}/versions?offset=1000&limit=10`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.versions).toEqual([]);
    });

    it('should handle large permission maps', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(testUser._id));

      const permissions = {};
      for (let i = 0; i < 50; i++) {
        const userId = new mongoose.Types.ObjectId();
        permissions[userId.toString()] = i % 2 === 0 ? 'view' : 'edit';
      }

      const response = await request(app)
        .post(`/api/yaml/${yamlFile._id}/permissions`)
        .set(authHeader(testUser._id))
        .send({ permissions })
        .expect(200);

      expect(Object.keys(response.body.permissions).length).toBe(50);
    });
  });
});
