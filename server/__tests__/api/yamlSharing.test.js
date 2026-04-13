import { jest } from '@jest/globals';
import request from 'supertest';
import express from 'express';
import { setupDatabase, teardownDatabase, clearDatabase } from '../setup.js';
import User from '../../src/models/User.js';
import YamlFile from '../../src/models/YamlFile.js';
import { authHeader } from '../utils/authHelpers.js';
import { createHashedUserData } from '../fixtures/users.js';
import { createYamlFileData } from '../fixtures/yamlFiles.js';
import yamlRoutes from '../../src/routes/yaml.js';

const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/yaml', yamlRoutes);
  return app;
};

describe('YAML Sharing & Permissions API', () => {
  let app;
  let owner;
  let collaborator;
  let publicUser;

  beforeAll(async () => {
    await setupDatabase();
    app = createTestApp();
  });

  afterAll(async () => {
    await teardownDatabase();
  });

  beforeEach(async () => {
    await clearDatabase();

    owner = await User.create(await createHashedUserData({
      username: 'owner',
      email: 'owner@test.com'
    }));
    collaborator = await User.create(await createHashedUserData({
      username: 'collab',
      email: 'collab@test.com'
    }));
    publicUser = await User.create(await createHashedUserData({
      username: 'public',
      email: 'public@test.com'
    }));
  });

  describe('GET /api/yaml/shared-with-me', () => {
    it('should get files shared with current user', async () => {
      // Create files owned by others but shared with collaborator
      const file1 = await YamlFile.create(createYamlFileData(owner._id, {
        title: 'Shared File 1',
        permissions: new Map([[collaborator._id.toString(), 'view']])
      }));

      const file2 = await YamlFile.create(createYamlFileData(owner._id, {
        title: 'Shared File 2',
        permissions: new Map([[collaborator._id.toString(), 'edit']])
      }));

      // File not shared with collaborator
      await YamlFile.create(createYamlFileData(owner._id, {
        title: 'Not Shared'
      }));

      const response = await request(app)
        .get('/api/yaml/shared-with-me')
        .set(authHeader(collaborator._id))
        .expect(200);

      expect(response.body.yamlFiles).toHaveLength(2);
      expect(response.body.yamlFiles.map(f => f.title)).toContain('Shared File 1');
      expect(response.body.yamlFiles.map(f => f.title)).toContain('Shared File 2');
    });

    it('should require authentication', async () => {
      await request(app)
        .get('/api/yaml/shared-with-me')
        .expect(401);
    });
  });

  describe('GET /api/yaml/shared/:shareId', () => {
    it('should get public file by shareId', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(owner._id, {
        title: 'Public File',
        isPublic: true
      }));

      const response = await request(app)
        .get(`/api/yaml/shared/${yamlFile.shareId}`)
        .expect(200);

      expect(response.body.yamlFile.title).toBe('Public File');
      expect(response.body.yamlFile.shareId).toBe(yamlFile.shareId);
    });

    it('should reject private file access via shareId', async () => {
      const yamlFile = await YamlFile.create(createYamlFileData(owner._id, {
        title: 'Private File',
        isPublic: false
      }));

      const response = await request(app)
        .get(`/api/yaml/shared/${yamlFile.shareId}`);

      expect([403, 404]).toContain(response.status); // Either forbidden or not found
    });

    it('should return error for invalid shareId', async () => {
      const response = await request(app)
        .get('/api/yaml/shared/invalidshare');

      expect([400, 404]).toContain(response.status); // Validation or not found
    });
  });

  describe('POST /api/yaml/:id/share', () => {
    let yamlFile;

    beforeEach(async () => {
      yamlFile = await YamlFile.create(createYamlFileData(owner._id, {
        isPublic: false
      }));
    });

    it('should toggle file to public', async () => {
      const response = await request(app)
        .post(`/api/yaml/${yamlFile._id}/share`)
        .set(authHeader(owner._id))
        .send({ isPublic: true })
        .expect(200);

      expect(response.body.yamlFile.isPublic).toBe(true);

      const updated = await YamlFile.findById(yamlFile._id);
      expect(updated.isPublic).toBe(true);
    });

    it('should toggle file to private', async () => {
      yamlFile.isPublic = true;
      await yamlFile.save();

      const response = await request(app)
        .post(`/api/yaml/${yamlFile._id}/share`)
        .set(authHeader(owner._id))
        .send({ isPublic: false })
        .expect(200);

      expect(response.body.yamlFile.isPublic).toBe(false);
    });

    it('should require owner permission', async () => {
      await request(app)
        .post(`/api/yaml/${yamlFile._id}/share`)
        .set(authHeader(collaborator._id))
        .send({ isPublic: true })
        .expect(403);
    });
  });

  describe('GET /api/yaml/public/browse', () => {
    beforeEach(async () => {
      // Create public files
      await YamlFile.create(createYamlFileData(owner._id, {
        title: 'Public 1',
        isPublic: true
      }));
      await YamlFile.create(createYamlFileData(owner._id, {
        title: 'Public 2',
        isPublic: true
      }));

      // Create private files
      await YamlFile.create(createYamlFileData(owner._id, {
        title: 'Private 1',
        isPublic: false
      }));
    });

    it('should list public files', async () => {
      const response = await request(app)
        .get('/api/yaml/public/browse')
        .expect(200);

      expect(response.body.yamlFiles).toHaveLength(2);
      expect(response.body.yamlFiles.every(f => f.isPublic)).toBe(true);
    });

    it('should support pagination', async () => {
      const response = await request(app)
        .get('/api/yaml/public/browse?page=1&limit=1')
        .expect(200);

      expect(response.body.yamlFiles).toHaveLength(1);
      expect(response.body.pagination.total).toBe(2);
    });

    it('should not require authentication', async () => {
      const response = await request(app)
        .get('/api/yaml/public/browse')
        .expect(200);

      expect(response.body.yamlFiles).toBeDefined();
    });
  });

  describe('POST /api/yaml/:id/permissions', () => {
    let yamlFile;

    beforeEach(async () => {
      yamlFile = await YamlFile.create(createYamlFileData(owner._id));
    });

    it('should set user permissions', async () => {
      const permissions = {
        [collaborator._id.toString()]: 'edit',
        [publicUser._id.toString()]: 'view'
      };

      const response = await request(app)
        .post(`/api/yaml/${yamlFile._id}/permissions`)
        .set(authHeader(owner._id))
        .send({ permissions })
        .expect(200);

      expect(response.body.permissions[collaborator._id.toString()]).toBe('edit');
      expect(response.body.permissions[publicUser._id.toString()]).toBe('view');

      const updated = await YamlFile.findById(yamlFile._id);
      expect(updated.permissions.get(collaborator._id.toString())).toBe('edit');
    });

    it('should remove user permissions when set to no-access', async () => {
      yamlFile.permissions.set(collaborator._id.toString(), 'view');
      await yamlFile.save();

      const permissions = {
        [collaborator._id.toString()]: 'no-access'
      };

      await request(app)
        .post(`/api/yaml/${yamlFile._id}/permissions`)
        .set(authHeader(owner._id))
        .send({ permissions })
        .expect(200);

      const updated = await YamlFile.findById(yamlFile._id);
      const perm = updated.permissions.get(collaborator._id.toString());
      expect(perm).toBe('no-access');
    });

    it('should require owner permission', async () => {
      await request(app)
        .post(`/api/yaml/${yamlFile._id}/permissions`)
        .set(authHeader(collaborator._id))
        .send({ permissions: {} })
        .expect(403);
    });
  });

  describe('GET /api/yaml/:id/collaborators', () => {
    let yamlFile;

    beforeEach(async () => {
      yamlFile = await YamlFile.create(createYamlFileData(owner._id, {
        permissions: new Map([
          [collaborator._id.toString(), 'edit'],
          [publicUser._id.toString(), 'view']
        ])
      }));
    });

    it('should get list of collaborators with permissions', async () => {
      const response = await request(app)
        .get(`/api/yaml/${yamlFile._id}/collaborators`)
        .set(authHeader(owner._id))
        .expect(200);

      expect(response.body.collaborators).toHaveLength(2);

      const collabUser = response.body.collaborators.find(
        c => c._id === collaborator._id.toString()
      );
      expect(collabUser.permission).toBe('edit');
      expect(collabUser.username).toBe('collab');
    });

    it('should require owner permission', async () => {
      await request(app)
        .get(`/api/yaml/${yamlFile._id}/collaborators`)
        .set(authHeader(collaborator._id))
        .expect(403);
    });
  });
});
