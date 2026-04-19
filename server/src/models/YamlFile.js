import mongoose from 'mongoose';
import { nanoid } from 'nanoid';

const yamlFileSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [100, 'Title cannot exceed 100 characters']
  },
  content: {
    type: String,
    required: [true, 'YAML content is required'],
    maxlength: [1000000, 'YAML content is too large'] // 1MB limit
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  shareId: {
    type: String,
    unique: true,
    default: () => nanoid(10) // Generate unique share ID
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isPublic: {
    type: Boolean,
    default: false
  },
  // Per-user permissions: { userId: 'view' | 'edit' | 'no-access' }
  permissions: {
    type: Map,
    of: {
      type: String,
      enum: ['no-access', 'view', 'edit'],
      default: 'no-access'
    },
    default: {}
  },
  views: {
    type: Number,
    default: 0
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [20, 'Tag cannot exceed 20 characters']
  }],
  metadata: {
    nodeCount: Number,
    maxDepth: Number,
    fileSize: Number,
    lastValidated: Date
  },
  // Current version number
  currentVersion: {
    type: Number,
    default: 1
  },
  // Legacy version system (deprecated - keeping for backward compatibility)
  versions: [{
    content: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    description: String
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient queries
yamlFileSchema.index({ owner: 1, createdAt: -1 });
yamlFileSchema.index({ isPublic: 1, createdAt: -1 });
yamlFileSchema.index({ tags: 1, isPublic: 1 });
// shareId already has unique: true which creates index

// Pre-save middleware to update metadata
yamlFileSchema.pre('save', function (next) {
  if (this.isModified('content')) {
    try {
      // Calculate basic metadata
      this.metadata.fileSize = Buffer.byteLength(this.content, 'utf8');
      this.metadata.lastValidated = new Date();

      // You can add YAML parsing logic here to calculate nodeCount and maxDepth
      // For now, we'll let the frontend handle this and send it via API
    } catch (error) {
      console.warn('Error calculating metadata:', error);
    }
  }
  next();
});

// Method to increment view count
yamlFileSchema.methods.incrementViews = function () {
  this.views += 1;
  return this.save();
};

// Method to add version
yamlFileSchema.methods.addVersion = function (content, description = '') {
  this.versions.push({
    content: this.content, // Save current content as version
    description,
    createdAt: new Date()
  });

  // Keep only last 10 versions
  if (this.versions.length > 10) {
    this.versions = this.versions.slice(-10);
  }

  this.content = content; // Update current content
  return this.save();
};

export default mongoose.model('YamlFile', yamlFileSchema);