import express from 'express';
import { body, param } from 'express-validator';
import { auth, optionalAuth } from '../middleware/auth.js';
import { requireFileAccess, requireOwnership } from '../middleware/authorization.js';

import {
  createYamlFile,
  getUserYamlFiles,
  getSharedWithMeYamlFiles,
  getYamlFileById,
  getSharedYamlFile,
  updateYamlFile,
  deleteYamlFile,
  getPublicYamlFiles,
  toggleYamlFileSharing,
  setYamlFilePermissions,
  getFileCollaborators
} from '../controllers/yamlController.js';

const router = express.Router();

// Create/Save YAML file
router.post('/', auth, [
  body('title')
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be 1-100 characters'),
  body('content')
    .isLength({ min: 1, max: 1000000 })
    .withMessage('YAML content is required and must be less than 1MB'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
], createYamlFile);

// Get user's YAML files
router.get('/my', auth, getUserYamlFiles);

// Get files shared with user (non-owned)
router.get('/shared-with-me', auth, getSharedWithMeYamlFiles);

// Get YAML file by ID (requires view permission)
router.get('/:id', auth, requireFileAccess('view'), [
  param('id').isMongoId().withMessage('Invalid file ID')
], getYamlFileById);

// Get shared YAML file by shareId (public access)
router.get('/shared/:shareId', optionalAuth, [
  param('shareId').isLength({ min: 10, max: 10 }).withMessage('Invalid share ID')
], getSharedYamlFile);

// Update YAML file (requires edit permission)
router.put('/:id', auth, requireFileAccess('edit'), [
  param('id').isMongoId().withMessage('Invalid file ID'),
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 100 })
    .withMessage('Title must be 1-100 characters'),
  body('content')
    .optional()
    .isLength({ min: 1, max: 1000000 })
    .withMessage('YAML content must be less than 1MB'),
], updateYamlFile);

// Toggle sharing/public status (owner only)
router.post('/:id/share', auth, requireOwnership(), [
  param('id').isMongoId().withMessage('Invalid file ID'),
  body('isPublic').isBoolean().withMessage('isPublic must be a boolean'),
], toggleYamlFileSharing);

// Delete YAML file (owner only)
router.delete('/:id', auth, requireOwnership(), [
  param('id').isMongoId().withMessage('Invalid file ID')
], deleteYamlFile);

// Get public YAML files (browse/discover)
router.get('/public/browse', getPublicYamlFiles);

// Set per-user permissions for a YAML file (owner only)
router.post('/:id/permissions', auth, requireOwnership(), [
  param('id').isMongoId().withMessage('Invalid file ID'),
  body('permissions').isObject().withMessage('Permissions must be an object'),
], setYamlFilePermissions);

// Get collaborators for a YAML file (owner only)
router.get('/:id/collaborators', auth, requireOwnership(), [
  param('id').isMongoId().withMessage('Invalid file ID'),
], getFileCollaborators);

export default router;