import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import User from '../../src/models/User.js';
import YamlFile from '../../src/models/YamlFile.js';
import { authHeader } from '../utils/authHelpers.js';
import { createHashedUserData, createUserData } from '../fixtures/users.js';
import { createYamlFileData } from '../fixtures/yamlFiles.js';
import yamlRoutes from '../../src/routes/yaml.js';
import { auth } from '../../src/middleware/auth.js';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/yaml', yamlRoutes);
  return app;
};

describe('YAML API Endpoints', () => {
  let app;
  let testUser;
  let otherUser;

  beforeAll(async () => {
    await setupDatabase();
    app = createTestApp();
  });

  afterAll(async () => {
    await teardownDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();

    // Create test users
    const userData = await createHashedUserData({ username: 'testuser', email: 'test@example.com' });
    testUser = await User.create(userData);

    const otherUserData = await createHashedUserData({ username: 'otheruser', email: 'other@example.com' });
    otherUser = await User.create(otherUserData);
  });

  describe('POST /api/yaml', () => {
    it('should create a new YAML file', async () => {
      const yamlData = {
        title: 'Test YAML',
        content: 'name: Test\ntype: service',
        description: 'Test description',
        isPublic: false,
        tags: ['test'],
      };

      const response = await request(app)
        .post('/api/yaml')
        .set(authHeader(testUser._id))
        .send(yamlData)
        .expect(201);

      expect(response.body.yamlFile).toHaveProperty('_id');
      expect(response.body.yamlFile.title).toBe(yamlData.title);
      expect(response.body.yamlFile.shareId).toBeDefined();
    });

    it('should require authentication', async () => {
      const yamlData = {
        title: 'Test YAML',
        content: 'name: Test',
      };

      await request(app)
        .post('/api/yaml')
        .send(yamlData)
        .expect(401);
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/yaml')
        .set(authHeader(testUser._id))
        .send({ title: 'Missing content' })
        .expect(400);
    });

    it('should limit tags to maximum', async () => {
      const yamlData = {
        title: 'Test YAML',
        content: 'name: Test',
        tags: Array(15).fill('tag'), // More than max
      };

      const response = await request(app)
        .post('/api/yaml')
        .set(authHeader(testUser._id))
        .send(yamlData)
        .expect(201);

      const savedFile = await YamlFile.findById(response.body.yamlFile._id);
      expect(savedFile.tags.length).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /api/yaml/:id', () => {
    let yamlFile;

    beforeEach(async () => {
      const fileData = createYamlFileData(testUser._id);
      yamlFile = await YamlFile.create(fileData);
    });

    it('should get YAML file by ID (owner)', async () => {
      const response = await request(app)
        .get(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.yamlFile._id).toBe(yamlFile._id.toString());
      expect(response.body.yamlFile.title).toBe(yamlFile.title);
    });

    it('should allow user with view permission', async () => {
      yamlFile.permissions.set(otherUser._id.toString(), 'view');
      await yamlFile.save();

      const response = await request(app)
        .get(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(otherUser._id))
        .expect(200);

      expect(response.body.yamlFile._id).toBe(yamlFile._id.toString());
    });

    it('should deny unauthorized user', async () => {
      await request(app)
        .get(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(otherUser._id))
        .expect(403);
    });

    it('should return 404 for non-existent file', async () => {
      await request(app)
        .get('/api/yaml/507f1f77bcf86cd799439999')
        .set(authHeader(testUser._id))
        .expect(404);
    });
  });

  describe('PUT /api/yaml/:id', () => {
    let yamlFile;

    beforeEach(async () => {
      const fileData = createYamlFileData(testUser._id);
      yamlFile = await YamlFile.create(fileData);
    });

    it('should update YAML file (owner)', async () => {
      const updates = {
        title: 'Updated Title',
        content: 'name: Updated',
      };

      const response = await request(app)
        .put(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(testUser._id))
        .send(updates)
        .expect(200);

      expect(response.body.yamlFile.title).toBe(updates.title);

      const updated = await YamlFile.findById(yamlFile._id);
      expect(updated.title).toBe(updates.title);
    });

    it('should allow user with edit permission', async () => {
      yamlFile.permissions.set(otherUser._id.toString(), 'edit');
      await yamlFile.save();

      const updates = { title: 'Edited by editor' };

      await request(app)
        .put(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(otherUser._id))
        .send(updates)
        .expect(200);
    });

    it('should deny user with only view permission', async () => {
      yamlFile.permissions.set(otherUser._id.toString(), 'view');
      await yamlFile.save();

      const updates = { title: 'Should fail' };

      await request(app)
        .put(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(otherUser._id))
        .send(updates)
        .expect(403);
    });
  });

  describe('DELETE /api/yaml/:id', () => {
    let yamlFile;

    beforeEach(async () => {
      const fileData = createYamlFileData(testUser._id);
      yamlFile = await YamlFile.create(fileData);
    });

    it('should delete YAML file (owner)', async () => {
      await request(app)
        .delete(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(testUser._id))
        .expect(200);

      const deleted = await YamlFile.findById(yamlFile._id);
      expect(deleted).toBeNull();
    });

    it('should deny non-owner even with edit permission', async () => {
      yamlFile.permissions.set(otherUser._id.toString(), 'edit');
      await yamlFile.save();

      await request(app)
        .delete(`/api/yaml/${yamlFile._id}`)
        .set(authHeader(otherUser._id))
        .expect(403);

      const stillExists = await YamlFile.findById(yamlFile._id);
      expect(stillExists).not.toBeNull();
    });
  });

  describe('GET /api/yaml/my', () => {
    beforeEach(async () => {
      // Create files for testUser
      await YamlFile.create(createYamlFileData(testUser._id, { title: 'File 1' }));
      await YamlFile.create(createYamlFileData(testUser._id, { title: 'File 2' }));

      // Create file for otherUser
      await YamlFile.create(createYamlFileData(otherUser._id, { title: 'Other File' }));
    });

    it('should get user\'s YAML files', async () => {
      const response = await request(app)
        .get('/api/yaml/my')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.yamlFiles).toHaveLength(2);
      expect(response.body.yamlFiles[0].owner).toBe(testUser._id.toString());
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/yaml/my?page=1&limit=1')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.yamlFiles).toHaveLength(1);
      expect(response.body.pagination.total).toBe(2);
      expect(response.body.pagination.pages).toBe(2);
    });
  });
});
