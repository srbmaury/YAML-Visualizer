import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import User from '../../src/models/User.js';
import { authHeader } from '../utils/authHelpers.js';
import { createHashedUserData } from '../fixtures/users.js';
import userRoutes from '../../src/routes/user.js';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  return app;
};

describe('User Controller', () => {
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

    const userData = await createHashedUserData({
      username: 'testuser',
      email: 'test@example.com',
      password: 'Password123!'
    });
    testUser = await User.create(userData);
  });

  describe('GET /api/users/profile', () => {
    it('should get current user profile', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.user._id).toBe(testUser._id.toString());
      expect(response.body.user.username).toBe(testUser.username);
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/users/profile')
        .expect(401);
    });
  });

  describe('PUT /api/users/profile', () => {
    it('should update user profile', async () => {
      const updates = {
        username: 'updateduser',
        email: 'updated@example.com',
      };

      const response = await request(app)
        .put('/api/users/profile')
        .set(authHeader(testUser._id))
        .send(updates)
        .expect(200);

      expect(response.body.user.username).toBe(updates.username);
      expect(response.body.user.email).toBe(updates.email);

      const updatedUser = await User.findById(testUser._id);
      expect(updatedUser.username).toBe(updates.username);
      expect(updatedUser.email).toBe(updates.email);
    });

    it('should prevent duplicate username', async () => {
      const otherUserData = await createHashedUserData({
        username: 'otheruser',
        email: 'other@example.com'
      });
      await User.create(otherUserData);

      const response = await request(app)
        .put('/api/users/profile')
        .set(authHeader(testUser._id))
        .send({ username: 'otheruser' })
        .expect(400);

      expect(response.body.error).toContain('already taken');
    });

    it('should prevent duplicate email', async () => {
      const otherUserData = await createHashedUserData({
        username: 'otheruser',
        email: 'other@example.com'
      });
      await User.create(otherUserData);

      const response = await request(app)
        .put('/api/users/profile')
        .set(authHeader(testUser._id))
        .send({ email: 'other@example.com' })
        .expect(400);

      expect(response.body.error).toMatch(/already|registered/i);
    });

    it('should require authentication', async () => {
      await request(app)
        .put('/api/users/profile')
        .send({ username: 'newname' })
        .expect(401);
    });
  });

  describe('PUT /api/users/password', () => {
    it('should update password', async () => {
      const updates = {
        currentPassword: 'Password123!',
        newPassword: 'NewPassword456!',
      };

      await request(app)
        .put('/api/users/password')
        .set(authHeader(testUser._id))
        .send(updates)
        .expect(200);

      const updatedUser = await User.findById(testUser._id);
      const isMatch = await updatedUser.comparePassword(updates.newPassword);
      expect(isMatch).toBe(true);
    });

    it('should reject password change with wrong current password', async () => {
      const updates = {
        currentPassword: 'WrongPassword123!',
        newPassword: 'NewPassword456!',
      };

      const response = await request(app)
        .put('/api/users/password')
        .set(authHeader(testUser._id))
        .send(updates)
        .expect(400);

      expect(response.body.error).toContain('password');
    });

    it('should require authentication', async () => {
      await request(app)
        .put('/api/users/password')
        .send({ currentPassword: 'old', newPassword: 'new' })
        .expect(401);
    });
  });

  describe('GET /api/users/search', () => {
    beforeEach(async () => {
      // Create additional users for search
      await User.create(await createHashedUserData({
        username: 'alice',
        email: 'alice@example.com'
      }));
      await User.create(await createHashedUserData({
        username: 'bob',
        email: 'bob@example.com'
      }));
      await User.create(await createHashedUserData({
        username: 'charlie',
        email: 'charlie@example.com'
      }));
    });

    it('should search users by username', async () => {
      const response = await request(app)
        .get('/api/users/search?q=ali')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].username).toBe('alice');
    });

    it('should search users by email', async () => {
      const response = await request(app)
        .get('/api/users/search?q=bob@')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body).toHaveLength(1);
      expect(response.body[0].username).toBe('bob');
    });

    it('should return multiple matches', async () => {
      const response = await request(app)
        .get('/api/users/search?q=example.com')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.length).toBeGreaterThan(1);
    });

    it('should limit results to 20', async () => {
      const response = await request(app)
        .get('/api/users/search?q=example.com')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body.length).toBeLessThanOrEqual(20);
    });

    it('should not include password in results', async () => {
      const response = await request(app)
        .get('/api/users/search?q=alice')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body[0]).not.toHaveProperty('password');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/users/search?q=alice')
        .expect(401);
    });

    it('should return empty array for short query', async () => {
      const response = await request(app)
        .get('/api/users/search?q=a')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body).toEqual([]);
    });

    it('should return empty array for missing query', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .set(authHeader(testUser._id))
        .expect(200);

      expect(response.body).toEqual([]);
    });
  });

  describe('DELETE /api/users/account', () => {
    it('should delete user account', async () => {
      await request(app)
        .delete('/api/users/account')
        .set(authHeader(testUser._id))
        .send({ password: 'Password123!' })
        .expect(200);

      const deletedUser = await User.findById(testUser._id);
      expect(deletedUser).toBeNull();
    });

    it('should require password confirmation', async () => {
      const response = await request(app)
        .delete('/api/users/account')
        .set(authHeader(testUser._id))
        .send({})
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should require authentication', async () => {
      await request(app)
        .delete('/api/users/account')
        .send({ password: 'Password123!' })
        .expect(401);
    });
  });
});
