/**
 * Application-wide constants
 * Centralizes magic numbers and strings for maintainability
 */

// YAML File Limits
export const YAML_LIMITS = {
  MAX_TAGS: 10,
  MAX_SIZE_BYTES: 1000000, // 1MB
  CONTENT_PREVIEW_LENGTH: 200,
};

// Share Configuration
export const SHARE = {
  ID_LENGTH: 10,
};

// Pagination Defaults
export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 10,
  DEFAULT_LIMIT_LARGE: 20,
  MAX_LIMIT: 100,
};

// Dashboard Limits
export const DASHBOARD = {
  RECENT_FILES_LIMIT: 5,
  RECENT_VERSIONS_LIMIT: 10,
};

// GitHub Integration
export const GITHUB = {
  DEFAULT_BRANCH: 'main',
  WEBHOOK_SECRET_BYTES: 32,
};

// AI Service
export const AI = {
  MAX_INPUT_LENGTH: 2000,
  MAX_YAML_LENGTH: 50000,
  MAX_TOKENS: 2000,
  TEMPERATURE: 0.7,
  MODEL: 'gpt-4',
};

// Error Messages
export const ERRORS = {
  YAML_TOO_LARGE: `YAML content exceeds maximum size of ${YAML_LIMITS.MAX_SIZE_BYTES / 1000000}MB`,
  TOO_MANY_TAGS: `Maximum ${YAML_LIMITS.MAX_TAGS} tags allowed`,
  INVALID_SHARE_ID: `Invalid share ID format. Must be ${SHARE.ID_LENGTH} characters.`,
  INVALID_OBJECT_ID: 'Invalid file ID format. Must be a valid MongoDB ObjectId.',
  FILE_NOT_FOUND: 'YAML file not found or you do not have permission to access it.',
  ACCESS_DENIED: 'Access denied. You do not have permission to perform this action.',
};
