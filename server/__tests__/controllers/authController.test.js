import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import User from '../../src/models/User.js';
import { createHashedUserData } from '../fixtures/users.js';
import authRoutes from '../../src/routes/auth.js';

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRoutes);
  return app;
};

describe('Auth Controller', () => {
  let app;

  beforeAll(async () => {
    await setupDatabase();
    app = createTestApp();
  });

  afterAll(async () => {
    await teardownDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();
  });

  describe('POST /api/auth/register', () => {
    it('should create a new user account', async () => {
      const signupData = {
        username: 'newuser',
        email: 'newuser@example.com',
        password: 'Password123!',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(signupData)
        .expect(201);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user.username).toBe(signupData.username);
      expect(response.body.user.email).toBe(signupData.email);
      expect(response.body.user).not.toHaveProperty('password');

      // Verify user was saved to database
      const user = await User.findOne({ email: signupData.email });
      expect(user).toBeDefined();
      expect(user.username).toBe(signupData.username);
    });

    it('should reject duplicate username', async () => {
      const userData = await createHashedUserData({
        username: 'existinguser',
        email: 'existing@example.com'
      });
      await User.create(userData);

      const signupData = {
        username: 'existinguser',
        email: 'different@example.com',
        password: 'Password123!',
      };

      await request(app)
        .post('/api/auth/register')
        .send(signupData)
        .expect(400);
    });

    it('should reject duplicate email', async () => {
      const userData = await createHashedUserData({
        username: 'existinguser',
        email: 'existing@example.com'
      });
      await User.create(userData);

      const signupData = {
        username: 'differentuser',
        email: 'existing@example.com',
        password: 'Password123!',
      };

      await request(app)
        .post('/api/auth/register')
        .send(signupData)
        .expect(400);
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ username: 'test' })
        .expect(400);
    });

    it('should validate email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'invalid-email',
          password: 'Password123!',
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should validate password strength', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          username: 'testuser',
          email: 'test@example.com',
          password: '123',
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });

  describe('POST /api/auth/login', () => {
    let testUser;
    const password = 'Password123!';

    beforeEach(async () => {
      const userData = await createHashedUserData({
        username: 'testuser',
        email: 'test@example.com',
        password
      });
      testUser = await User.create(userData);
    });

    it('should login with valid credentials (email)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          login: 'test@example.com',
          password: password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user.email).toBe(testUser.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should login with valid credentials (username)', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          login: 'testuser',
          password: password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('token');
      expect(response.body.user.username).toBe(testUser.username);
    });

    it('should reject invalid password', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          login: 'test@example.com',
          password: 'WrongPassword123!',
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid');
    });

    it('should reject non-existent user', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          login: 'nonexistent@example.com',
          password: password,
        })
        .expect(400);

      expect(response.body.error).toContain('Invalid');
    });

    it('should validate required fields', async () => {
      await request(app)
        .post('/api/auth/login')
        .send({ login: 'test@example.com' })
        .expect(400);
    });
  });
});
