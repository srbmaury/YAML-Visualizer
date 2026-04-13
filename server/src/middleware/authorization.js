import YamlFile from '../models/YamlFile.js';
import { ERRORS } from '../config/constants.js';

/**
 * Permission levels (in order of access)
 */
const PERMISSION_LEVELS = {
  'no-access': 0,
  'view': 1,
  'edit': 2,
  'owner': 3,
};

/**
 * Check if user has required access level to a YAML file
 *
 * @param {string} requiredLevel - 'view', 'edit', or 'owner'
 * @param {string} fileIdParam - Name of the route parameter containing file ID (default: 'id')
 * @returns {Function} Express middleware
 *
 * @example
 * router.get('/yaml/:id', auth, requireFileAccess('view'), getYamlFileById);
 * router.put('/yaml/:id', auth, requireFileAccess('edit'), updateYamlFile);
 * router.delete('/yaml/:id', auth, requireFileAccess('owner'), deleteYamlFile);
 */
export const requireFileAccess = (requiredLevel = 'view', fileIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const fileId = req.params[fileIdParam];
      const userId = req.user._id.toString();

      // Validate file ID format
      if (!fileId || !fileId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ error: ERRORS.INVALID_OBJECT_ID });
      }

      // Fetch the file
      const yamlFile = await YamlFile.findById(fileId);
      if (!yamlFile) {
        return res.status(404).json({ error: ERRORS.FILE_NOT_FOUND });
      }

      // Check if user is owner (owner has full access)
      const isOwner = yamlFile.owner.toString() === userId;
      if (isOwner) {
        req.yamlFile = yamlFile; // Attach file to request for use in controller
        req.userAccessLevel = 'owner';
        return next();
      }

      // Check permissions map for non-owners
      const userPermission = yamlFile.permissions?.get(userId);

      // If no permission set or explicitly 'no-access', deny
      if (!userPermission || userPermission === 'no-access') {
        return res.status(403).json({ error: ERRORS.ACCESS_DENIED });
      }

      // Check if user's permission level is sufficient
      const userLevel = PERMISSION_LEVELS[userPermission] || 0;
      const requiredLevelValue = PERMISSION_LEVELS[requiredLevel] || 1;

      if (userLevel < requiredLevelValue) {
        return res.status(403).json({
          error: ERRORS.ACCESS_DENIED,
          message: `This action requires '${requiredLevel}' permission, but you only have '${userPermission}'`
        });
      }

      // Access granted
      req.yamlFile = yamlFile; // Attach file to request
      req.userAccessLevel = userPermission;
      next();
    } catch (error) {
      console.error('Authorization middleware error:', error);
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
};

/**
 * Check if user is the owner of a YAML file
 * Stricter version of requireFileAccess('owner')
 *
 * @param {string} fileIdParam - Name of the route parameter containing file ID
 * @returns {Function} Express middleware
 *
 * @example
 * router.delete('/yaml/:id', auth, requireOwnership(), deleteYamlFile);
 */
export const requireOwnership = (fileIdParam = 'id') => {
  return async (req, res, next) => {
    try {
      const fileId = req.params[fileIdParam];
      const userId = req.user._id.toString();

      if (!fileId || !fileId.match(/^[0-9a-fA-F]{24}$/)) {
        return res.status(400).json({ error: ERRORS.INVALID_OBJECT_ID });
      }

      const yamlFile = await YamlFile.findById(fileId);
      if (!yamlFile) {
        return res.status(404).json({ error: ERRORS.FILE_NOT_FOUND });
      }

      // Only owner allowed
      if (yamlFile.owner.toString() !== userId) {
        return res.status(403).json({
          error: ERRORS.ACCESS_DENIED,
          message: 'Only the file owner can perform this action'
        });
      }

      req.yamlFile = yamlFile;
      req.userAccessLevel = 'owner';
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      return res.status(500).json({ error: 'Ownership check failed' });
    }
  };
};

/**
 * Helper function to check permissions programmatically (non-middleware)
 * Useful for internal checks within controllers
 *
 * @param {Object} yamlFile - The YAML file document
 * @param {string} userId - User ID to check
 * @param {string} requiredLevel - Required permission level
 * @returns {boolean} Whether user has required access
 */
export const hasFileAccess = (yamlFile, userId, requiredLevel = 'view') => {
  const userIdStr = userId.toString();

  // Owner has full access
  if (yamlFile.owner.toString() === userIdStr) {
    return true;
  }

  // Check permissions map
  const userPermission = yamlFile.permissions?.get(userIdStr);
  if (!userPermission || userPermission === 'no-access') {
    return false;
  }

  const userLevel = PERMISSION_LEVELS[userPermission] || 0;
  const requiredLevelValue = PERMISSION_LEVELS[requiredLevel] || 1;

  return userLevel >= requiredLevelValue;
};

/**
 * Get user's access level for a file
 *
 * @param {Object} yamlFile - The YAML file document
 * @param {string} userId - User ID to check
 * @returns {string} Access level: 'owner', 'edit', 'view', or 'no-access'
 */
export const getUserAccessLevel = (yamlFile, userId) => {
  const userIdStr = userId.toString();

  if (yamlFile.owner.toString() === userIdStr) {
    return 'owner';
  }

  return yamlFile.permissions?.get(userIdStr) || 'no-access';
};
