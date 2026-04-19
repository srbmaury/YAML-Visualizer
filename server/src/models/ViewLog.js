import mongoose from 'mongoose';

const viewLogSchema = new mongoose.Schema({
  fileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'YamlFile',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null  // null for anonymous users
  },
  sessionId: {
    type: String,   // For anonymous user deduplication
    default: null
  },
  ipHash: {
    type: String,   // Optional: hashed IP for extra deduplication layer
    default: null
  },
  viewedAt: {
    type: Date,
    default: Date.now,
    expires: 2592000  // TTL: auto-delete after 30 days (in seconds)
  }
});

// Compound indexes for efficient duplicate checks
viewLogSchema.index({ fileId: 1, userId: 1, viewedAt: -1 });
viewLogSchema.index({ fileId: 1, sessionId: 1, viewedAt: -1 });

// Static method to check if view should be counted (deduplication)
viewLogSchema.statics.shouldCountView = async function(fileId, userId, sessionId, timeWindowHours = 24) {
  const query = {
    fileId,
    viewedAt: { $gte: new Date(Date.now() - timeWindowHours * 60 * 60 * 1000) }
  };

  // Check by userId if authenticated, otherwise by sessionId
  if (userId) {
    query.userId = userId;
  } else if (sessionId) {
    query.sessionId = sessionId;
  } else {
    // No way to deduplicate, count it as a new view
    return true;
  }

  const existingView = await this.findOne(query);
  return !existingView;
};

// Static method to log a view
viewLogSchema.statics.logView = async function(fileId, userId = null, sessionId = null, ipHash = null) {
  return this.create({
    fileId,
    userId,
    sessionId,
    ipHash
  });
};

// Static method to get view statistics for a file
viewLogSchema.statics.getFileStats = async function(fileId, daysBack = 30) {
  const since = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  const [totalViews, uniqueUsers, uniqueSessions] = await Promise.all([
    this.countDocuments({ fileId, viewedAt: { $gte: since } }),
    this.distinct('userId', { fileId, userId: { $ne: null }, viewedAt: { $gte: since } }).then(arr => arr.length),
    this.distinct('sessionId', { fileId, sessionId: { $ne: null }, viewedAt: { $gte: since } }).then(arr => arr.length)
  ]);

  return {
    totalViews,
    uniqueUsers,
    uniqueSessions,
    period: `${daysBack} days`
  };
};

export default mongoose.model('ViewLog', viewLogSchema);
