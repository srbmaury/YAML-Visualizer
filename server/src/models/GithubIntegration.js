import mongoose from 'mongoose';

const githubIntegrationSchema = new mongoose.Schema({
  yamlFileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'YamlFile',
    required: true,
    unique: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  repoOwner: {
    type: String,
    required: true,
    trim: true
  },
  repoName: {
    type: String,
    required: true,
    trim: true
  },
  filePath: {
    type: String,
    required: false,  // Optional - null means auto-parse entire repo
    trim: true,
    default: null
  },
  branch: {
    type: String,
    default: 'main',
    trim: true
  },
  webhookSecret: {
    type: String,
    required: true
  },
  lastSyncedAt: {
    type: Date,
    default: Date.now
  },
  lastCommitSha: {
    type: String
  },
  autoSync: {
    type: Boolean,
    default: true
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Index for quick lookups
githubIntegrationSchema.index({ yamlFileId: 1, user: 1 });
githubIntegrationSchema.index({ repoOwner: 1, repoName: 1, filePath: 1 });

const GithubIntegration = mongoose.model('GithubIntegration', githubIntegrationSchema);

export default GithubIntegration;
