import jwt from 'jsonwebtoken';

/**
 * Generate JWT token for testing
 */
export const generateTestToken = (userId) => {
  const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing';
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '1d' });
};

/**
 * Create auth header for supertest
 */
export const authHeader = (userId) => {
  const token = generateTestToken(userId);
  return { Authorization: `Bearer ${token}` };
};

/**
 * Create cookie auth for supertest
 */
export const authCookie = (userId) => {
  const token = generateTestToken(userId);
  return `token=${token}`;
};
