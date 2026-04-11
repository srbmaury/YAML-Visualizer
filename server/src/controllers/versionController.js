import VersionHistory from '../models/VersionHistory.js';
import YamlFile from '../models/YamlFile.js';
import {
  calculateDelta,
  applyDelta,
  reconstructFromDeltas,
  calculateChangeStats,
  generateChangeSummary,
  shouldCreateSnapshot
} from '../services/deltaService.js';

const hasReadAccess = (yamlFile, userId) => {
  const userKey = userId.toString();
  if (yamlFile.owner.toString() === userKey) return true;
  const permission = yamlFile.permissions?.get?.(userKey) || yamlFile.permissions?.[userKey];
  return permission === 'view' || permission === 'edit';
};

const hasEditAccess = (yamlFile, userId) => {
  const userKey = userId.toString();
  if (yamlFile.owner.toString() === userKey) return true;
  const permission = yamlFile.permissions?.get?.(userKey) || yamlFile.permissions?.[userKey];
  return permission === 'edit';
};

/**
 * Create a new version of a YAML file
 */
export const createVersion = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { content, message, saveType = 'manual' } = req.body;
    const userId = req.user._id;

    const yamlFile = await YamlFile.findById(fileId);
    if (!yamlFile || !hasEditAccess(yamlFile, userId)) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Get the latest version
    const latestVersion = await VersionHistory.getLatestVersion(fileId);
    const newVersionNumber = latestVersion + 1;

    // Get the previous content
    let previousContent = '';
    if (latestVersion > 0) {
      previousContent = await reconstructContentAtVersion(fileId, latestVersion);
    }

    // Calculate delta
    const delta = calculateDelta(previousContent, content);
    const changeStats = calculateChangeStats(delta);
    const summary = generateChangeSummary(delta, previousContent, content);

    // Check if we should create a snapshot
    const shouldSnapshot = shouldCreateSnapshot(newVersionNumber, delta.length);

    // Create version record
    const versionData = {
      fileId,
      version: newVersionNumber,
      delta: shouldSnapshot ? [] : delta,
      isSnapshot: shouldSnapshot,
      snapshotContent: shouldSnapshot ? content : null,
      author: userId,
      message: message || '',
      changeMetadata: {
        summary,
        linesChanged: {
          added: changeStats.linesAdded,
          removed: changeStats.linesRemoved,
          modified: Math.max(changeStats.linesAdded, changeStats.linesRemoved)
        },
        characterDelta: changeStats.characterDelta,
        saveType
      },
      deltaSize: delta.length
    };

    const version = await VersionHistory.create(versionData);

    // Update the main file's content and version
    yamlFile.content = content;
    yamlFile.currentVersion = newVersionNumber;
    yamlFile.updatedAt = new Date();
    await yamlFile.save();

    // Populate author info
    await version.populate('author', 'username email');

    res.status(201).json({
      version: version.toObject(),
      changeStats: changeStats,
      isSnapshot: shouldSnapshot
    });

  } catch (error) {
    console.error('Create version error:', error);
    res.status(500).json({ error: 'Failed to create version' });
  }
};

/**
 * Get version history for a file
 */
export const getVersionHistory = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { limit = 20, offset = 0, includeDeltas = false } = req.query;
    const userId = req.user._id;

    const yamlFile = await YamlFile.findById(fileId);
    if (!yamlFile || !hasReadAccess(yamlFile, userId)) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Build query
    const selectFields = includeDeltas === 'true'
      ? '' // Include all fields
      : '-delta -snapshotContent'; // Exclude large fields for list view

    const versions = await VersionHistory.find({ fileId })
      .sort({ version: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset))
      .select(selectFields)
      .populate('author', 'username email')
      .lean();

    // Add change statistics for each version
    const versionsWithStats = versions.map(version => ({
      ...version,
      changeStats: version.delta ? calculateChangeStats(version.delta) : null
    }));

    // Get total count
    const totalVersions = await VersionHistory.countDocuments({ fileId });

    res.json({
      versions: versionsWithStats,
      totalVersions,
      currentVersion: yamlFile.currentVersion,
      hasMore: offset + versions.length < totalVersions
    });

  } catch (error) {
    console.error('Get version history error:', error);
    res.status(500).json({ error: 'Failed to retrieve version history' });
  }
};

/**
 * Emergency repair function for corrupted version history
 */
export const repairVersionHistory = async (req, res) => {
  try {
    const { fileId } = req.params;

    // Verify file ownership
    const yamlFile = await YamlFile.findOne({ _id: fileId, owner: req.user._id });
    if (!yamlFile) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Check if version 1 exists and is corrupted
    const version1 = await VersionHistory.findOne({ fileId, version: 1 });
    if (!version1 || !version1.isSnapshot) {
      // Delete existing version 1 if it exists
      if (version1) {
        await VersionHistory.deleteOne({ _id: version1._id });
      }

      // Create proper snapshot version 1
      await VersionHistory.create({
        fileId: yamlFile._id,
        version: 1,
        delta: [],
        isSnapshot: true,
        snapshotContent: yamlFile.content,
        author: req.user._id,
        message: 'Repaired initial version',
        changeMetadata: {
          summary: 'Emergency repair of initial version',
          linesChanged: {
            added: (yamlFile.content.match(/\n/g) || []).length + 1,
            removed: 0,
            modified: 0
          },
          characterDelta: yamlFile.content.length,
          saveType: 'initial'
        },
        deltaSize: 0
      });

      res.json({ message: 'Version history repaired successfully' });
    } else {
      res.json({ message: 'Version history is already correct' });
    }

  } catch (error) {
    console.error('Repair version history error:', error);
    res.status(500).json({ error: 'Failed to repair version history' });
  }
};

/**
 * Debug endpoint to show version history data
 */
export const debugVersionHistory = async (req, res) => {
  try {
    const { fileId } = req.params;

    const versions = await VersionHistory.find({ fileId })
      .populate('author', 'username')
      .sort({ version: 1 });

    const debugData = versions.map(v => ({
      version: v.version,
      isSnapshot: v.isSnapshot,
      hasSnapshotContent: !!v.snapshotContent,
      snapshotContentLength: v.snapshotContent?.length || 0,
      snapshotContentPreview: v.snapshotContent?.substring(0, 100) || '',
      deltaLength: v.delta?.length || 0,
      delta: v.delta,
      message: v.message,
      saveType: v.changeMetadata?.saveType
    }));

    res.json({ debugData });
  } catch (error) {
    console.error('Debug version history error:', error);
    res.status(500).json({ error: 'Failed to debug version history' });
  }
};

/**
 * Get a specific version of a file
 */
export const getVersion = async (req, res) => {
  try {
    const { fileId, versionNumber } = req.params;
    const userId = req.user._id;

    // Validate version number
    const parsedVersionNumber = parseInt(versionNumber);
    if (isNaN(parsedVersionNumber) || parsedVersionNumber < 1) {
      return res.status(400).json({ error: 'Invalid version number' });
    }

    const yamlFile = await YamlFile.findById(fileId);
    if (!yamlFile || !hasReadAccess(yamlFile, userId)) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Get the specific version
    const version = await VersionHistory.findOne({
      fileId,
      version: parsedVersionNumber
    }).populate('author', 'username email');

    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    let content = '';

    // If this is a snapshot, use the snapshot content directly
    if (version.isSnapshot && version.snapshotContent) {
      content = version.snapshotContent;
    } else {
      // Reconstruct content at this version
      content = await reconstructContentAtVersion(fileId, parsedVersionNumber);
    }

    res.json({
      version: version.toObject(),
      content,
      changeStats: calculateChangeStats(version.delta)
    });

  } catch (error) {
    console.error('Get version error:', error);
    res.status(500).json({ error: 'Failed to retrieve version' });
  }
};

/**
 * Revert to a specific version
 */
export const revertToVersion = async (req, res) => {
  try {
    const { fileId, versionNumber } = req.params;
    const { message } = req.body;
    const userId = req.user._id;

    // Validate parameters
    if (!fileId || !versionNumber) {
      return res.status(400).json({ error: 'Missing fileId or versionNumber' });
    }

    const yamlFile = await YamlFile.findById(fileId);
    if (!yamlFile || !hasEditAccess(yamlFile, userId)) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Check if the target version exists
    const targetVersion = await VersionHistory.findOne({
      fileId,
      version: parseInt(versionNumber)
    });

    if (!targetVersion) {
      return res.status(404).json({ error: `Version ${versionNumber} not found` });
    }

    // Get content at the target version
    const targetContent = await reconstructContentAtVersion(fileId, parseInt(versionNumber));

    if (targetContent === null || targetContent === undefined) {
      return res.status(500).json({ error: 'Failed to reconstruct content for target version' });
    }

    // Create a new version with the reverted content
    const revertMessage = message || `Reverted to version ${versionNumber}`;

    // Create new version
    const result = await createVersionInternal(
      fileId,
      targetContent,
      userId,
      revertMessage,
      'manual'
    );

    // Update the main file content and version
    yamlFile.content = targetContent;
    yamlFile.currentVersion = result.version.version; // Use the version number, not the version object
    yamlFile.updatedAt = new Date();
    await yamlFile.save();

    res.json({
      success: true,
      newVersion: result.version,
      revertedToVersion: parseInt(versionNumber),
      content: targetContent
    });

  } catch (error) {
    console.error('Revert version error:', error);
    res.status(500).json({
      error: 'Failed to revert to version'
    });
  }
};

/**
 * Compare two versions
 */
export const compareVersions = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { fromVersion, toVersion } = req.query;
    const userId = req.user._id;

    // Validate version numbers
    const parsedFromVersion = parseInt(fromVersion);
    const parsedToVersion = parseInt(toVersion);

    if (isNaN(parsedFromVersion) || parsedFromVersion < 1) {
      return res.status(400).json({ error: 'Invalid fromVersion number' });
    }

    if (isNaN(parsedToVersion) || parsedToVersion < 1) {
      return res.status(400).json({ error: 'Invalid toVersion number' });
    }

    const yamlFile = await YamlFile.findById(fileId);
    if (!yamlFile || !hasReadAccess(yamlFile, userId)) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Get content for both versions
    const fromContent = await reconstructContentAtVersion(fileId, parsedFromVersion);
    const toContent = await reconstructContentAtVersion(fileId, parsedToVersion);

    // Calculate delta between versions
    const delta = calculateDelta(fromContent, toContent);
    const changeStats = calculateChangeStats(delta);
    const summary = generateChangeSummary(delta, fromContent, toContent);

    // Get version metadata
    const fromVersionData = await VersionHistory.findOne({
      fileId,
      version: parsedFromVersion
    }).populate('author', 'username email');

    const toVersionData = await VersionHistory.findOne({
      fileId,
      version: parsedToVersion
    }).populate('author', 'username email');

    // Check if both versions exist
    if (!fromVersionData) {
      return res.status(404).json({ error: `Version ${parsedFromVersion} not found` });
    }

    if (!toVersionData) {
      return res.status(404).json({ error: `Version ${parsedToVersion} not found` });
    }

    res.json({
      comparison: {
        fromVersion: fromVersionData,
        toVersion: toVersionData,
        delta,
        changeStats,
        summary,
        fromContent,
        toContent
      }
    });

  } catch (error) {
    console.error('Compare versions error:', error);
    res.status(500).json({ error: 'Failed to compare versions' });
  }
};

/**
 * Delete version history (admin only or for cleanup)
 */
export const cleanupVersionHistory = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { keepVersions = 50 } = req.body;
    const userId = req.user._id;

    // Verify file ownership
    const yamlFile = await YamlFile.findOne({ _id: fileId, owner: userId });
    if (!yamlFile) {
      return res.status(404).json({ error: 'File not found or access denied' });
    }

    // Keep the latest N versions and all snapshots
    const versionsToDelete = await VersionHistory.find({ fileId })
      .sort({ version: -1 })
      .skip(parseInt(keepVersions))
      .select('_id version isSnapshot')
      .lean();

    // Filter out snapshots (we want to keep them)
    const deletableVersions = versionsToDelete
      .filter(v => !v.isSnapshot)
      .map(v => v._id);

    if (deletableVersions.length > 0) {
      await VersionHistory.deleteMany({ _id: { $in: deletableVersions } });
    }

    res.json({
      success: true,
      deletedVersions: deletableVersions.length,
      keptVersions: parseInt(keepVersions)
    });

  } catch (error) {
    console.error('Cleanup version history error:', error);
    res.status(500).json({ error: 'Failed to cleanup version history' });
  }
};

/**
 * Helper function to reconstruct content at a specific version
 */
async function reconstructContentAtVersion(fileId, targetVersion) {
  try {
    // Find the most recent snapshot at or before the target version
    const snapshot = await VersionHistory.findOne({
      fileId,
      version: { $lte: targetVersion },
      isSnapshot: true
    }).sort({ version: -1 });

    // CRITICAL FIX: If version 1 is not a snapshot, we have a data integrity issue
    const allVersions = await VersionHistory.find({ fileId }).select('version isSnapshot snapshotContent delta').sort({ version: 1 });

    if (allVersions.length > 0 && !allVersions[0].isSnapshot) {
      // Try to get the current content from the main file as emergency fallback
      const yamlFile = await YamlFile.findById(fileId);
      if (yamlFile && yamlFile.content && targetVersion === 1) {
        return yamlFile.content;
      }

      return '';
    }

    let baseContent = '';
    let startVersion = 1;

    if (snapshot) {
      baseContent = snapshot.snapshotContent || '';
      startVersion = snapshot.version + 1;
    }

    // Get all deltas from the snapshot (or beginning) to the target version
    const deltas = await VersionHistory.find({
      fileId,
      version: { $gte: startVersion, $lte: targetVersion },
      isSnapshot: false
    }).sort({ version: 1 }).select('delta version');

    // Apply deltas in sequence
    let content = baseContent;
    for (const versionData of deltas) {
      if (versionData.delta && versionData.delta.length > 0) {
        content = applyDelta(content, versionData.delta);
      }
    }

    return content;
  } catch (error) {
    console.error('Error in reconstructContentAtVersion:', error);
    throw error;
  }
}

/**
 * Persist YAML content and append VersionHistory (same contract as editor saves).
 * GitHub sync must use this so time-travel / delta reconstruction matches YamlFile.content.
 */
export async function saveYamlWithVersionHistory(fileId, content, authorId, options = {}) {
  const message = options.message ?? 'GitHub sync';
  const saveType = options.saveType ?? 'auto';

  const yamlFile = await YamlFile.findById(fileId);
  if (!yamlFile) {
    throw new Error('YAML file not found');
  }

  const latestVersion = await VersionHistory.getLatestVersion(fileId);
  let previousContent = '';
  if (latestVersion > 0) {
    previousContent = await reconstructContentAtVersion(fileId, latestVersion);
  }

  const newVersionNumber = latestVersion + 1;
  const delta = calculateDelta(previousContent, content);
  const changeStats = calculateChangeStats(delta);
  const summary = generateChangeSummary(delta, previousContent, content);
  const shouldSnapshot = shouldCreateSnapshot(newVersionNumber, delta.length);

  await VersionHistory.create({
    fileId,
    version: newVersionNumber,
    delta: shouldSnapshot ? [] : delta,
    isSnapshot: shouldSnapshot,
    snapshotContent: shouldSnapshot ? content : null,
    author: authorId,
    message,
    changeMetadata: {
      summary,
      linesChanged: {
        added: changeStats.linesAdded,
        removed: changeStats.linesRemoved,
        modified: Math.max(changeStats.linesAdded, changeStats.linesRemoved)
      },
      characterDelta: changeStats.characterDelta,
      saveType
    },
    deltaSize: delta.length
  });

  yamlFile.content = content;
  yamlFile.currentVersion = newVersionNumber;
  yamlFile.markModified('content');
  yamlFile.updatedAt = new Date();
  await yamlFile.save();

  return yamlFile;
}

/**
 * Canonical "head" YAML for a file: reconstruct at latest VersionHistory row when any exist,
 * otherwise the Yaml document's content field (legacy / pre-version files).
 */
export async function getCanonicalYamlContentForFile(fileId) {
  const yamlFile = await YamlFile.findById(fileId).select('content');
  if (!yamlFile) {
    return null;
  }
  const latest = await VersionHistory.getLatestVersion(fileId);
  if (latest < 1) {
    return yamlFile.content ?? '';
  }
  try {
    return await reconstructContentAtVersion(fileId, latest);
  } catch (err) {
    console.warn('getCanonicalYamlContentForFile: reconstruct failed, using document content:', err.message);
    return yamlFile.content ?? '';
  }
}

/**
 * Internal helper for creating versions
 */
async function createVersionInternal(fileId, content, userId, message, saveType) {
  try {
    const latestVersion = await VersionHistory.getLatestVersion(fileId);
    const newVersionNumber = latestVersion + 1;

    let previousContent = '';
    if (latestVersion > 0) {
      previousContent = await reconstructContentAtVersion(fileId, latestVersion);
    }

    const delta = calculateDelta(previousContent, content);
    const changeStats = calculateChangeStats(delta);
    const summary = generateChangeSummary(delta, previousContent, content);

    const shouldSnapshot = shouldCreateSnapshot(newVersionNumber, delta.length);

    const versionData = {
      fileId,
      version: newVersionNumber,
      delta: shouldSnapshot ? [] : delta,
      isSnapshot: shouldSnapshot,
      snapshotContent: shouldSnapshot ? content : null,
      author: userId,
      message: message || '',
      changeMetadata: {
        summary,
        linesChanged: {
          added: changeStats.linesAdded,
          removed: changeStats.linesRemoved,
          modified: Math.max(changeStats.linesAdded, changeStats.linesRemoved)
        },
        characterDelta: changeStats.characterDelta,
        saveType
      },
      deltaSize: delta.length
    };

    const version = await VersionHistory.create(versionData);
    await version.populate('author', 'username email');

    return { version, changeStats, isSnapshot: shouldSnapshot };
  } catch (error) {
    console.error('createVersionInternal error:', error);
    throw error;
  }
}