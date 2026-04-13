import { validationResult } from 'express-validator';
import { nanoid } from 'nanoid';
import YamlFile from '../models/YamlFile.js';
import VersionHistory from '../models/VersionHistory.js';
import GithubIntegration from '../models/GithubIntegration.js';
import User from '../models/User.js';
import { calculateChangeStats, generateChangeSummary, calculateDelta, shouldCreateSnapshot } from '../services/deltaService.js';
import { getCanonicalYamlContentForFile } from './versionController.js';
import { YAML_LIMITS, SHARE, PAGINATION, ERRORS } from '../config/constants.js';

export const createYamlFile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, description, isPublic = false, tags = [], metadata = {} } = req.body;

    const yamlFile = new YamlFile({
      title,
      content,
      description,
      owner: req.user._id,
      isPublic,
      tags: tags.slice(0, YAML_LIMITS.MAX_TAGS),
      metadata,
      currentVersion: 1
    });

    await yamlFile.save();

    // Create initial version history entry as a snapshot
    await VersionHistory.create({
      fileId: yamlFile._id,
      version: 1,
      delta: [],
      isSnapshot: true,
      snapshotContent: content,
      author: req.user._id,
      message: 'Initial version',
      changeMetadata: {
        summary: 'Initial file creation',
        linesChanged: {
          added: (content.match(/\n/g) || []).length + 1,
          removed: 0,
          modified: 0
        },
        characterDelta: content.length,
        saveType: 'initial'
      },
      deltaSize: 0
    });

    // Add to user's yamlFiles array
    await User.findByIdAndUpdate(
      req.user._id,
      { $push: { yamlFiles: yamlFile._id } }
    );

    res.status(201).json({
      message: 'YAML file saved successfully',
      yamlFile: {
        _id: yamlFile._id.toString(),
        title: yamlFile.title,
        shareId: yamlFile.shareId,
        isPublic: yamlFile.isPublic,
        createdAt: yamlFile.createdAt,
        currentVersion: yamlFile.currentVersion
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while saving YAML file' });
  }
};

export const getSharedWithMeYamlFiles = async (req, res) => {
  try {
    const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT, search } = req.query;
    const skip = (page - 1) * limit;
    const userId = req.user._id.toString();
    const permissionKey = `permissions.${userId}`;

    const query = {
      owner: { $ne: req.user._id },
      [permissionKey]: { $in: ['view', 'edit'] }
    };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const yamlFiles = await YamlFile.find(query)
      .populate('owner', 'username email')
      .select('-versions')
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const filesWithPreview = yamlFiles.map((file) => {
      const fileObj = file.toObject();
      fileObj.accessLevel = file.permissions?.get(userId) || file.permissions?.[userId] || 'view';
      if (fileObj.content) {
        fileObj.contentPreview = fileObj.content.substring(0, YAML_LIMITS.CONTENT_PREVIEW_LENGTH);
      }
      return fileObj;
    });

    const total = await YamlFile.countDocuments(query);

    res.json({
      yamlFiles: filesWithPreview,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching shared YAML files' });
  }
};

export const getUserYamlFiles = async (req, res) => {
  try {
    const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT, search } = req.query;
    const skip = (page - 1) * limit;

    let query = { owner: req.user._id };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const yamlFiles = await YamlFile.find(query)
      .select('-versions') // Exclude versions but include content for preview
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Add content preview to each file
    const filesWithPreview = yamlFiles.map(file => {
      const fileObj = file.toObject();
      if (fileObj.content) {
        fileObj.contentPreview = fileObj.content.substring(0, YAML_LIMITS.CONTENT_PREVIEW_LENGTH);
        // Keep full content for now, frontend can handle truncation
        // delete fileObj.content; // Remove full content to reduce payload
      }
      return fileObj;
    });

    const total = await YamlFile.countDocuments(query);

    res.json({
      yamlFiles: filesWithPreview,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching YAML files' });
  }
};

export const getYamlFileById = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: errors.array()
      });
    }

    // Additional check for valid ObjectId format
    const { id } = req.params;
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        error: ERRORS.INVALID_OBJECT_ID
      });
    }

    const yamlFile = await YamlFile.findById(id);
    if (!yamlFile) {
      return res.status(404).json({
        error: ERRORS.FILE_NOT_FOUND
      });
    }
    // Only owner or users with view/edit permission can access
    if (
      yamlFile.owner.toString() !== req.user._id.toString() &&
      (!yamlFile.permissions?.get(req.user._id.toString()) || yamlFile.permissions.get(req.user._id.toString()) === 'no-access')
    ) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to view this file.' });
    }
    const yamlOut = yamlFile.toObject();
    const canonical = await getCanonicalYamlContentForFile(id);
    if (canonical != null) {
      yamlOut.content = canonical;
    }
    res.json({ yamlFile: yamlOut });
  } catch (error) {

    // Handle specific MongoDB errors
    if (error.name === 'CastError' && error.kind === 'ObjectId') {
      return res.status(400).json({
        error: 'Invalid file ID format. Must be a valid MongoDB ObjectId.'
      });
    }

    res.status(500).json({
      error: 'Server error while fetching YAML file',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getSharedYamlFile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Invalid request parameters',
        details: errors.array()
      });
    }

    const { shareId } = req.params;

    // Validate shareId format
    if (!shareId || shareId.length !== SHARE.ID_LENGTH) {
      return res.status(400).json({
        error: ERRORS.INVALID_SHARE_ID
      });
    }

    const yamlFile = await YamlFile.findOne({ shareId })
      .populate('owner', 'username')
      .select('-versions'); // Exclude versions for public access

    if (!yamlFile) {
      return res.status(404).json({
        error: 'Shared file not found or has been removed.'
      });
    }

    // Check if file is public, owner, or user with view/edit permission
    const userId = req.user?._id?.toString();
    const hasPermission = userId && yamlFile.permissions?.get(userId) && yamlFile.permissions.get(userId) !== 'no-access';
    if (!yamlFile.isPublic && (!userId || (yamlFile.owner._id.toString() !== userId && !hasPermission))) {
      return res.status(403).json({
        error: 'Access denied. This file is private and you do not have permission to access it.'
      });
    }
    yamlFile.incrementViews().catch(console.error);
    const yamlOut = yamlFile.toObject();
    const canonical = await getCanonicalYamlContentForFile(yamlFile._id);
    if (canonical != null) {
      yamlOut.content = canonical;
    }
    res.json({ yamlFile: yamlOut });
  } catch (error) {
    res.status(500).json({
      error: 'Server error while fetching shared file',
      message: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const updateYamlFile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, description, isPublic, tags, metadata, versionDescription } = req.body;

    const yamlFile = await YamlFile.findById(req.params.id);
    if (!yamlFile) {
      return res.status(404).json({ error: 'YAML file not found' });
    }
    // Only owner or users with edit permission can update
    if (
      yamlFile.owner.toString() !== req.user._id.toString() &&
      (!yamlFile.permissions?.get(req.user._id.toString()) || yamlFile.permissions.get(req.user._id.toString()) !== 'edit')
    ) {
      return res.status(403).json({ error: 'Access denied. You do not have permission to edit this file.' });
    }
    // If content is being updated, create a new version using the new version history system
    const head = await getCanonicalYamlContentForFile(yamlFile._id);
    const headStr = head ?? '';
    if (content && content !== headStr) {
      const latestVersion = await VersionHistory.getLatestVersion(yamlFile._id);
      const newVersionNumber = latestVersion + 1;
      const previousContent = headStr;
      const delta = calculateDelta(previousContent, content);
      const changeStats = calculateChangeStats(delta);
      const summary = generateChangeSummary(delta, previousContent, content);
      const shouldSnapshot = shouldCreateSnapshot(newVersionNumber, delta.length);
      const versionData = {
        fileId: yamlFile._id,
        version: newVersionNumber,
        delta: shouldSnapshot ? [] : delta,
        isSnapshot: shouldSnapshot,
        snapshotContent: shouldSnapshot ? content : null,
        author: req.user._id,
        message: versionDescription || '',
        changeMetadata: {
          summary,
          linesChanged: {
            added: changeStats.linesAdded,
            removed: changeStats.linesRemoved,
            modified: Math.max(changeStats.linesAdded, changeStats.linesRemoved)
          },
          characterDelta: changeStats.characterDelta,
          saveType: 'manual'
        },
        deltaSize: delta.length
      };
      await VersionHistory.create(versionData);
      yamlFile.content = content;
      yamlFile.currentVersion = newVersionNumber;
      yamlFile.updatedAt = new Date();
    }
    if (title) yamlFile.title = title;
    if (description !== undefined) yamlFile.description = description;
    if (isPublic !== undefined) yamlFile.isPublic = isPublic;
    if (tags) yamlFile.tags = tags.slice(0, YAML_LIMITS.MAX_TAGS);
    if (metadata) yamlFile.metadata = { ...yamlFile.metadata, ...metadata };
    await yamlFile.save();
    res.json({
      message: 'YAML file updated successfully',
      yamlFile: {
        id: yamlFile._id,
        title: yamlFile.title,
        shareId: yamlFile.shareId,
        isPublic: yamlFile.isPublic,
        createdAt: yamlFile.createdAt,
        updatedAt: yamlFile.updatedAt,
        currentVersion: yamlFile.currentVersion
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while updating YAML file' });
  }
};

export const deleteYamlFile = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const yamlFile = await YamlFile.findOne({
      _id: req.params.id,
      owner: req.user._id
    });

    if (!yamlFile) {
      return res.status(404).json({ error: 'YAML file not found' });
    }

    const fileId = req.params.id;

    // Cascade delete: Remove all related data
    const [versionsDeleted, integrationsDeleted] = await Promise.all([
      // Delete all version history entries
      VersionHistory.deleteMany({ fileId }),

      // Delete all GitHub integrations
      GithubIntegration.deleteMany({ yamlFileId: fileId }),

      // Remove from user's yamlFiles array
      User.findByIdAndUpdate(
        req.user._id,
        { $pull: { yamlFiles: fileId } }
      )
    ]);

    // Delete the YAML file itself
    await YamlFile.findByIdAndDelete(fileId);

    res.json({
      message: 'YAML file deleted successfully',
      deleted: {
        file: true,
        versions: versionsDeleted.deletedCount,
        integrations: integrationsDeleted.deletedCount
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while deleting YAML file' });
  }
};

export const getPublicYamlFiles = async (req, res) => {
  try {
    const { page = PAGINATION.DEFAULT_PAGE, limit = PAGINATION.DEFAULT_LIMIT_LARGE, search, sortBy = 'createdAt' } = req.query;
    const skip = (page - 1) * limit;

    let query = { isPublic: true };

    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { tags: { $in: [new RegExp(search, 'i')] } }
      ];
    }

    const sortOptions = {
      createdAt: { createdAt: -1 },
      views: { views: -1 },
      title: { title: 1 }
    };

    const yamlFiles = await YamlFile.find(query)
      .populate('owner', 'username')
      .select('-content -versions') // Exclude heavy fields
      .sort(sortOptions[sortBy] || { createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await YamlFile.countDocuments(query);

    res.json({
      yamlFiles,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while browsing public files' });
  }
};

// Set per-user permissions for a YAML file (owner only)
export const setYamlFilePermissions = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { id } = req.params;
    const { permissions } = req.body;
    const yamlFile = await YamlFile.findOne({ _id: id, owner: req.user._id });
    if (!yamlFile) {
      return res.status(404).json({ error: 'YAML file not found or you do not have permission.' });
    }
    // Validate permissions object
    for (const [userId, perm] of Object.entries(permissions)) {
      if (!['no-access', 'view', 'edit'].includes(perm)) {
        return res.status(400).json({ error: `Invalid permission for user ${userId}` });
      }
    }
    yamlFile.permissions = permissions;
    await yamlFile.save();
    res.json({ message: 'Permissions updated', permissions: yamlFile.permissions });
  } catch (error) {
    res.status(500).json({ error: 'Server error while setting permissions' });
  }
};

// Get collaborators for a YAML file (users with permissions)
export const getFileCollaborators = async (req, res) => {
  try {
    const { id } = req.params;
    const yamlFile = await YamlFile.findOne({ _id: id, owner: req.user._id });
    if (!yamlFile) {
      return res.status(404).json({ error: 'YAML file not found or you do not have permission.' });
    }
    const permissionsMap = yamlFile.permissions || new Map();
    const userIds = [];
    const permEntries = {};
    for (const [userId, perm] of permissionsMap.entries()) {
      if (perm === 'view' || perm === 'edit') {
        userIds.push(userId);
        permEntries[userId] = perm;
      }
    }
    const users = await User.find({ _id: { $in: userIds } }).select('_id username email');
    const collaborators = users.map((u) => ({
      _id: u._id,
      username: u.username,
      email: u.email,
      permission: permEntries[u._id.toString()]
    }));
    res.json({ collaborators });
  } catch (error) {
    res.status(500).json({ error: 'Server error while fetching collaborators' });
  }
};

export const toggleYamlFileSharing = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id } = req.params;
    const { isPublic } = req.body;

    const yamlFile = await YamlFile.findOne({ _id: id, owner: req.user._id });
    if (!yamlFile) {
      return res.status(404).json({ error: 'YAML file not found or you do not have permission.' });
    }

    yamlFile.isPublic = isPublic;
    if (isPublic) {
      // Ensure shareId exists
      if (!yamlFile.shareId || yamlFile.shareId.length !== SHARE.ID_LENGTH) {
        yamlFile.shareId = nanoid(SHARE.ID_LENGTH);
      }
    }
    await yamlFile.save();

    res.json({
      message: `YAML file is now ${isPublic ? 'publicly shareable' : 'private'}`,
      yamlFile: {
        id: yamlFile._id,
        title: yamlFile.title,
        shareId: yamlFile.shareId,
        isPublic: yamlFile.isPublic,
        createdAt: yamlFile.createdAt,
        updatedAt: yamlFile.updatedAt,
        currentVersion: yamlFile.currentVersion
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error while toggling sharing status' });
  }
};