import { jest } from '@jest/globals';
import { requireFileAccess, requireOwnership, hasFileAccess, getUserAccessLevel } from '../../src/middleware/authorization.js';
import YamlFile from '../../src/models/YamlFile.js';
import { ERRORS } from '../../src/config/constants.js';
import { mockUsers, mockYamlFile } from '../fixtures/yamlFiles.js';

describe('Authorization Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {
      params: { id: mockYamlFile._id },
      user: { _id: mockUsers.owner._id },
    };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('requireFileAccess', () => {
    it('should allow owner to access file', async () => {
      jest.spyOn(YamlFile, 'findById').mockResolvedValue(mockYamlFile);

      const middleware = requireFileAccess('view');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.yamlFile).toEqual(mockYamlFile);
      expect(req.userAccessLevel).toBe('owner');
    });

    it('should allow user with view permission', async () => {
      req.user._id = mockUsers.viewer._id;
      jest.spyOn(YamlFile, 'findById').mockResolvedValue(mockYamlFile);

      const middleware = requireFileAccess('view');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.userAccessLevel).toBe('view');
    });

    it('should allow user with edit permission to view', async () => {
      req.user._id = mockUsers.editor._id;
      jest.spyOn(YamlFile, 'findById').mockResolvedValue(mockYamlFile);

      const middleware = requireFileAccess('view');
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.userAccessLevel).toBe('edit');
    });

    it('should deny user with view permission from editing', async () => {
      req.user._id = mockUsers.viewer._id;
      jest.spyOn(YamlFile, 'findById').mockResolvedValue(mockYamlFile);

      const middleware = requireFileAccess('edit');
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: ERRORS.ACCESS_DENIED,
        })
      );
    });

    it('should deny unauthorized user', async () => {
      req.user._id = mockUsers.unauthorized._id;
      jest.spyOn(YamlFile, 'findById').mockResolvedValue(mockYamlFile);

      const middleware = requireFileAccess('view');
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('should return 404 for non-existent file', async () => {
      jest.spyOn(YamlFile, 'findById').mockResolvedValue(null);

      const middleware = requireFileAccess('view');
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: ERRORS.FILE_NOT_FOUND });
    });

    it('should return 400 for invalid ObjectId', async () => {
      req.params.id = 'invalid-id';

      const middleware = requireFileAccess('view');
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({ error: ERRORS.INVALID_OBJECT_ID });
    });
  });

  describe('requireOwnership', () => {
    it('should allow owner', async () => {
      jest.spyOn(YamlFile, 'findById').mockResolvedValue(mockYamlFile);

      const middleware = requireOwnership();
      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.userAccessLevel).toBe('owner');
    });

    it('should deny non-owner even with edit permission', async () => {
      req.user._id = mockUsers.editor._id;
      jest.spyOn(YamlFile, 'findById').mockResolvedValue(mockYamlFile);

      const middleware = requireOwnership();
      await middleware(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Only the file owner can perform this action',
        })
      );
    });
  });

  describe('hasFileAccess helper', () => {
    it('should return true for owner', () => {
      const result = hasFileAccess(mockYamlFile, mockUsers.owner._id, 'view');
      expect(result).toBe(true);
    });

    it('should return true for user with sufficient permission', () => {
      const result = hasFileAccess(mockYamlFile, mockUsers.editor._id, 'edit');
      expect(result).toBe(true);
    });

    it('should return false for user with insufficient permission', () => {
      const result = hasFileAccess(mockYamlFile, mockUsers.viewer._id, 'edit');
      expect(result).toBe(false);
    });

    it('should return false for unauthorized user', () => {
      const result = hasFileAccess(mockYamlFile, mockUsers.unauthorized._id, 'view');
      expect(result).toBe(false);
    });
  });

  describe('getUserAccessLevel helper', () => {
    it('should return owner for owner', () => {
      const level = getUserAccessLevel(mockYamlFile, mockUsers.owner._id);
      expect(level).toBe('owner');
    });

    it('should return correct permission level', () => {
      const viewerLevel = getUserAccessLevel(mockYamlFile, mockUsers.viewer._id);
      expect(viewerLevel).toBe('view');

      const editorLevel = getUserAccessLevel(mockYamlFile, mockUsers.editor._id);
      expect(editorLevel).toBe('edit');
    });

    it('should return no-access for unauthorized user', () => {
      const level = getUserAccessLevel(mockYamlFile, mockUsers.unauthorized._id);
      expect(level).toBe('no-access');
    });
  });
});
