import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import User from '../../src/models/User.js';
import { authHeader } from '../utils/authHelpers.js';
import { createHashedUserData } from '../fixtures/users.js';
import aiRoutes from '../../src/routes/ai.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/ai', aiRoutes);
  return app;
};

describe('AI Generation API', () => {
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

  describe('POST /api/ai/generate', () => {
    it('should return 503 when OpenAI API key is not configured', async () => {
      const response = await request(app)
        .post('/api/ai/generate')
        .set(authHeader(testUser._id))
        .send({
          userInput: 'Create a microservice with an API component'
        })
        .expect(503);

      expect(response.body.error).toContain('not configured');
    });

    it('should require authentication', async () => {
      await request(app)
        .post('/api/ai/generate')
        .send({ userInput: 'test' })
        .expect(401);
    });

    it('should validate userInput is required', async () => {
      await request(app)
        .post('/api/ai/generate')
        .set(authHeader(testUser._id))
        .send({})
        .expect(400);
    });

    it('should validate userInput max length', async () => {
      const response = await request(app)
        .post('/api/ai/generate')
        .set(authHeader(testUser._id))
        .send({
          userInput: 'a'.repeat(2001) // Over 2000 char limit
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });

    it('should validate currentYaml max length', async () => {
      const response = await request(app)
        .post('/api/ai/generate')
        .set(authHeader(testUser._id))
        .send({
          userInput: 'test',
          currentYaml: 'a'.repeat(50001) // Over 50000 char limit
        })
        .expect(400);

      expect(response.body.errors).toBeDefined();
    });
  });
});
