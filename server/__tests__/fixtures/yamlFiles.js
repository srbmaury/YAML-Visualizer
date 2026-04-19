import { nanoid } from 'nanoid';

export const createYamlFileData = (ownerId, overrides = {}) => ({
  title: `Test YAML ${nanoid(6)}`,
  content: `
name: Test Service
type: service
children:
  - name: API
    type: component
  - name: Database
    type: component
  `.trim(),
  description: 'Test YAML file',
  owner: ownerId,
  isPublic: false,
  tags: ['test', 'sample'],
  shareId: nanoid(10),
  currentVersion: 1,
  permissions: new Map(),
  ...overrides,
});

export const mockUsers = {
  owner: { _id: '507f1f77bcf86cd799439011' },
  viewer: { _id: '507f1f77bcf86cd799439012' },
  editor: { _id: '507f1f77bcf86cd799439013' },
  unauthorized: { _id: '507f1f77bcf86cd799439014' },
};

export const mockYamlFile = {
  _id: '507f1f77bcf86cd799439021',
  title: 'Mock YAML File',
  content: 'name: Test\ntype: service',
  description: 'Mock description',
  owner: mockUsers.owner._id, // owner user
  isPublic: false,
  shareId: 'abcd123456',
  currentVersion: 1,
  tags: ['test'],
  permissions: new Map([
    [mockUsers.viewer._id, 'view'], // viewer
    [mockUsers.editor._id, 'edit'], // editor
  ]),
  createdAt: new Date(),
  updatedAt: new Date(),
};
