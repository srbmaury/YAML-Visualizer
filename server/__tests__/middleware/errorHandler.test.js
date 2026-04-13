import { jest } from '@jest/globals';
import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middleware/errorHandler.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Test routes that trigger different error types
  app.get('/validation-error', (req, res, next) => {
    const err = new Error('Validation failed');
    err.name = 'ValidationError';
    err.errors = {
      field1: { message: 'Field 1 is required' },
      field2: { message: 'Field 2 must be a number' }
    };
    next(err);
  });

  app.get('/cast-error-objectid', (req, res, next) => {
    const err = new Error('Cast to ObjectId failed');
    err.name = 'CastError';
    err.kind = 'ObjectId';
    next(err);
  });

  app.get('/cast-error-other', (req, res, next) => {
    const err = new Error('Cast failed');
    err.name = 'CastError';
    err.path = 'age';
    err.value = 'invalid';
    next(err);
  });

  app.get('/duplicate-error', (req, res, next) => {
    const err = new Error('Duplicate key error');
    err.code = 11000;
    err.keyPattern = { email: 1 };
    next(err);
  });

  app.get('/jwt-error', (req, res, next) => {
    const err = new Error('Invalid token');
    err.name = 'JsonWebTokenError';
    next(err);
  });

  app.get('/token-expired', (req, res, next) => {
    const err = new Error('Token expired');
    err.name = 'TokenExpiredError';
    next(err);
  });

  app.get('/mongo-error', (req, res, next) => {
    const err = new Error('MongoDB connection failed');
    err.name = 'MongoServerError';
    next(err);
  });

  app.get('/generic-error', (req, res, next) => {
    const err = new Error('Something went wrong');
    err.status = 400;
    next(err);
  });

  app.get('/server-error', (req, res, next) => {
    const err = new Error('Internal server error');
    next(err);
  });

  app.get('/error-with-stack', (req, res, next) => {
    process.env.NODE_ENV = 'development';
    const err = new Error('Dev error');
    next(err);
  });

  // Apply error handler
  app.use(errorHandler);

  return app;
};

describe('Error Handler Middleware', () => {
  let app;
  let originalEnv;

  beforeAll(() => {
    app = createTestApp();
    originalEnv = process.env.NODE_ENV;
  });

  afterAll(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Mongoose Errors', () => {
    it('should handle ValidationError', async () => {
      const response = await request(app)
        .get('/validation-error')
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.details).toEqual([
        'Field 1 is required',
        'Field 2 must be a number'
      ]);
    });

    it('should handle CastError for ObjectId', async () => {
      const response = await request(app)
        .get('/cast-error-objectid')
        .expect(400);

      expect(response.body.error).toBe('Invalid ID format');
      expect(response.body.message).toContain('valid MongoDB ObjectId');
    });

    it('should handle CastError for other types', async () => {
      const response = await request(app)
        .get('/cast-error-other')
        .expect(400);

      expect(response.body.error).toBe('Cast Error');
      expect(response.body.message).toContain('Invalid age: invalid');
    });

    it('should handle duplicate key error', async () => {
      const response = await request(app)
        .get('/duplicate-error')
        .expect(400);

      expect(response.body.error).toBe('Duplicate Error');
      expect(response.body.message).toBe('email already exists');
    });
  });

  describe('JWT Errors', () => {
    it('should handle JsonWebTokenError', async () => {
      const response = await request(app)
        .get('/jwt-error')
        .expect(401);

      expect(response.body.error).toBe('Invalid token');
    });

    it('should handle TokenExpiredError', async () => {
      const response = await request(app)
        .get('/token-expired')
        .expect(401);

      expect(response.body.error).toBe('Token expired');
    });
  });

  describe('MongoDB Errors', () => {
    it('should handle MongoServerError', async () => {
      const response = await request(app)
        .get('/mongo-error')
        .expect(503);

      expect(response.body.error).toBe('Database connection error');
      expect(response.body.message).toBeDefined();
    });
  });

  describe('Generic Errors', () => {
    it('should handle error with status code', async () => {
      const response = await request(app)
        .get('/generic-error')
        .expect(400);

      expect(response.body.error).toBe('Something went wrong');
    });

    it('should handle error without status code', async () => {
      const response = await request(app)
        .get('/server-error')
        .expect(500);

      expect(response.body.error).toBe('Internal server error');
    });

    it('should include stack trace in development mode', async () => {
      process.env.NODE_ENV = 'development';

      const response = await request(app)
        .get('/error-with-stack')
        .expect(500);

      expect(response.body.error).toBe('Dev error');
      expect(response.body.stack).toBeDefined();
    });
  });
});
