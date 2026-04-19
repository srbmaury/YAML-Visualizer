import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import User from '../../src/models/User.js';
import YamlFile from '../../src/models/YamlFile.js';
import { authHeader } from '../utils/authHelpers.js';
import { createHashedUserData } from '../fixtures/users.js';
import { createYamlFileData } from '../fixtures/yamlFiles.js';
import userRoutes from '../../src/routes/user.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  return app;
};

describe('User Additional API Endpoints', () => {
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

    testUser = await User.create(await createHashedUserData({
      username: 'testuser',
      email: 'test@test.com',
      password: 'Password123!'
    }));

    otherUser = await User.create(await createHashedUserData({
      username: 'otheruser',
      email: 'other@test.com'
    }));
  });

  describe('GET /api/users/dashboard', () => {
    beforeEach(async () => {
      // Create files owned by test user
      await YamlFile.create(createYamlFileData(testUser._id, {
        title: 'My File 1',
        isPublic: true
      }));
      await YamlFile.create(createYamlFileData(testUser._id, {
        title: 'My File 2',
        isPublic: false
      }));

      // Create file shared with test user
      await YamlFile.create(createYamlFileData(otherUser._id, {
        title: 'Shared with me',
        permissions: new Map([[testUser._id.toString(), 'edit']])
      }));

      // Create public file by other user
      await YamlFile.create(createYamlFileData(otherUser._id, {
        title: 'Other public',
        isPublic: true
      }));
    });

    it('should get user dashboard with recent files', async () => {
      const response = await request(app)
        .get('/api/users/dashboard')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.recentFiles).toBeDefined();
      expect(Array.isArray(response.body.recentFiles)).toBe(true);
      expect(response.body.recentFiles.length).toBeGreaterThan(0);
    });

    it('should include popular files in dashboard', async () => {
      const response = await request(app)
        .get('/api/users/dashboard')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.popularFiles).toBeDefined();
      expect(Array.isArray(response.body.popularFiles)).toBe(true);
    });

    it('should include filesByMonth in dashboard', async () => {
      const response = await request(app)
        .get('/api/users/dashboard')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.filesByMonth).toBeDefined();
      expect(Array.isArray(response.body.filesByMonth)).toBe(true);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/users/dashboard')
        .expect(401);
    });
  });

  describe('GET /api/users/all', () => {
    beforeEach(async () => {
      // Create more users
      await User.create(await createHashedUserData({
        username: 'user1',
        email: 'user1@test.com'
      }));
      await User.create(await createHashedUserData({
        username: 'user2',
        email: 'user2@test.com'
      }));
      await User.create(await createHashedUserData({
        username: 'user3',
        email: 'user3@test.com'
      }));
    });

    it('should list all users', async () => {
      const response = await request(app)
        .get('/api/users/all')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(5); // At least 5 users
      expect(response.body[0]).toHaveProperty('username');
      expect(response.body[0]).toHaveProperty('email');
      expect(response.body[0]).toHaveProperty('_id');
    });

    it('should not include passwords', async () => {
      const response = await request(app)
        .get('/api/users/all')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body[0]).not.toHaveProperty('password');
    });

    it('should sort users by username', async () => {
      const response = await request(app)
        .get('/api/users/all')
        .set(authHeader(testUser._id))
        .expect(200);

      const usernames = response.body.map(u => u.username);
      const sortedUsernames = [...usernames].sort();
      expect(usernames).toEqual(sortedUsernames);
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/users/all')
        .expect(401);
    });
  });
});
