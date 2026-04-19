import bcrypt from 'bcryptjs';
import { nanoid } from 'nanoid';

export const createUserData = (overrides = {}) => ({
  username: `testuser_${nanoid(6)}`,
  email: `test_${nanoid(6)}@example.com`,
  password: 'Test123!@#',
  ...overrides,
});

// Don't hash here - let the User model's pre-save hook handle it
export const createHashedUserData = async (overrides = {}) => {
  return createUserData(overrides);
};

export const mockUsers = {
  owner: {
    _id: '507f1f77bcf86cd799439011',
    username: 'owner',
    email: 'owner@example.com',
    password: '$2a$10$abcdefghijklmnopqrstuv', // Hashed "password123"
  },
  viewer: {
    _id: '507f1f77bcf86cd799439012',
    username: 'viewer',
    email: 'viewer@example.com',
    password: '$2a$10$abcdefghijklmnopqrstuv',
  },
  editor: {
    _id: '507f1f77bcf86cd799439013',
    username: 'editor',
    email: 'editor@example.com',
    password: '$2a$10$abcdefghijklmnopqrstuv',
  },
  unauthorized: {
    _id: '507f1f77bcf86cd799439014',
    username: 'unauthorized',
    email: 'unauthorized@example.com',
    password: '$2a$10$abcdefghijklmnopqrstuv',
  },
};
