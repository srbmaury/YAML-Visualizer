import express from 'express';
import { body } from 'express-validator';
import { auth } from '../middleware/auth.js';
import { generateYaml } from '../controllers/aiController.js';

const router = express.Router();

/**
 * POST /api/ai/generate
 * Generate YAML using OpenAI
 */
router.post(
  '/generate',
  auth,
  [
    body('userInput')
      .isString()
      .trim()
      .notEmpty()
      .withMessage('userInput is required')
      .isLength({ max: 2000 })
      .withMessage('userInput must be at most 2000 characters'),
    body('currentYaml')
      .optional()
      .isString()
      .isLength({ max: 50000 })
      .withMessage('currentYaml must be at most 50000 characters'),
  ],
  generateYaml
);

export default router;
