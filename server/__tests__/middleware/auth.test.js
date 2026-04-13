import { jest } from '@jest/globals';
import { auth, optionalAuth } from '../../src/middleware/auth.js';
import User from '../../src/models/User.js';
import { generateTestToken } from '../utils/authHelpers.js';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import { createHashedUserData } from '../fixtures/users.js';

describe('Auth Middleware', () => {
  let req, res, next;
  let testUser;

  beforeAll(async () => {
    await setupDatabase();
  });

  afterAll(async () => {
    await teardownDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();

    const userData = await createHashedUserData({
      username: 'testuser',
      email: 'test@example.com'
    });
    testUser = await User.create(userData);

    req = {
      header: jest.fn(),
      cookies: {},
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  describe('auth middleware', () => {
    it('should authenticate valid token from Authorization header', async () => {
      const token = generateTestToken(testUser._id);
      req.header.mockReturnValue(`Bearer ${token}`);

      await auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(testUser._id.toString());
      expect(req.user.username).toBe(testUser.username);
      // Password should be excluded by mongoose select('-password')
      expect(req.user.password).toBeUndefined();
    });

    it('should authenticate valid token from cookie', async () => {
      const token = generateTestToken(testUser._id);
      req.cookies.auth_token = token;
      req.header.mockReturnValue(undefined);

      await auth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(testUser._id.toString());
    });

    it('should reject missing token', async () => {
      req.header.mockReturnValue(undefined);

      await auth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('No token'),
        })
      );
    });

    it('should reject invalid token', async () => {
      req.header.mockReturnValue('Bearer invalid-token');

      await auth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('not valid'),
        })
      );
    });

    it('should reject token for non-existent user', async () => {
      const fakeUserId = '507f1f77bcf86cd799439999';
      const token = generateTestToken(fakeUserId);
      req.header.mockReturnValue(`Bearer ${token}`);

      await auth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.stringContaining('not valid'),
        })
      );
    });

    it('should reject malformed Bearer token', async () => {
      req.header.mockReturnValue('InvalidFormat token123');

      await auth(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('optionalAuth middleware', () => {
    it('should authenticate valid token', async () => {
      const token = generateTestToken(testUser._id);
      req.header.mockReturnValue(`Bearer ${token}`);

      await optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
      expect(req.user._id.toString()).toBe(testUser._id.toString());
    });

    it('should continue without token', async () => {
      req.header.mockReturnValue(undefined);

      await optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should continue with invalid token', async () => {
      req.header.mockReturnValue('Bearer invalid-token');

      await optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeUndefined();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should authenticate from cookie', async () => {
      const token = generateTestToken(testUser._id);
      req.cookies.auth_token = token;
      req.header.mockReturnValue(undefined);

      await optionalAuth(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
    });
  });
});
