import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import http from 'http';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './src/routes/auth.js';
import yamlRoutes from './src/routes/yaml.js';
import userRoutes from './src/routes/user.js';
import versionRoutes from './src/routes/versions.js';
import aiRoutes from './src/routes/ai.js';
import githubRoutes from './src/routes/github.js';

// Import middleware
import { errorHandler } from './src/middleware/errorHandler.js';

// Import collaboration service
import { initializeSocketServer } from './src/services/collaborationService.js';

const app = express();
const PORT = process.env.PORT || 5000;
const server = http.createServer(app);

// Trust proxy - required for rate limiting and security when behind reverse proxies (Render, Heroku, AWS, etc.)
// This allows Express to read X-Forwarded-* headers to get the real client IP
app.set('trust proxy', 1);

// Security middleware
app.use(helmet());
app.use(compression());

// Rate limiting (skip GitHub webhooks — high volume from GitHub IPs)
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

app.use((req, res, next) => {
  if (req.originalUrl.includes('/api/github/webhook')) {
    return next();
  }
  return limiter(req, res, next);
});

const cors_origin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()).filter(Boolean)
  : [];

// CORS configuration — empty list breaks browsers + Socket.IO; reflect Origin when unset (dev / single-host deploys).
const corsOptions = {
  origin: cors_origin.length > 0 ? cors_origin : true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-hub-signature-256', 'x-github-event'],
};

app.use(cors(corsOptions));

// JSON parser: capture raw body for GitHub webhooks (HMAC) in the same read as parse.
// Do NOT use a separate middleware that consumes req before express.json — that leaves req.body empty.
app.use(express.json({
  limit: '10mb',
  verify: (req, res, buf) => {
    if (req.originalUrl.includes('/webhook/')) {
      req.rawBody = buf;
    }
  },
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/yaml-visualizer')
  .then(() => {
    console.log('✅ Connected to MongoDB');
  })
  .catch((error) => {
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  });

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/yaml', yamlRoutes);
app.use('/api/user', userRoutes);
app.use('/api/files', versionRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/github', githubRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    corsOrigins: cors_origin.length > 0 ? cors_origin : ['*'],
    corsMode: cors_origin.length > 0 ? 'whitelist' : 'reflect-origin'
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Start server (HTTP)
server.listen(PORT, '0.0.0.0', () => {
  // Initialize Socket.IO for real-time collaboration
  initializeSocketServer(server, corsOptions);

  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
  if (cors_origin.length > 0) {
    console.log(`🔓 CORS: Whitelist mode - allowed origins:`);
    cors_origin.forEach(origin => console.log(`   ✅ ${origin}`));
  } else {
    console.log(`🔓 CORS: Reflect-origin mode (allow all with credentials)`);
  }
  console.log(`🔌 Socket.IO: Real-time collaboration enabled`);
});