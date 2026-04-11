# 🎯 YAML Data Visualizer

Convert YAML structures into interactive tree diagrams. Built with React, Node.js, D3.js, and MongoDB — with a YAML editor, diff comparison, AI assistance, versioning, and real-time collaboration.

![React](https://img.shields.io/badge/React-19.1.1-blue) ![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![MongoDB](https://img.shields.io/badge/MongoDB-8.0+-brightgreen) ![D3.js](https://img.shields.io/badge/D3.js-7.9.0-orange) ![Express](https://img.shields.io/badge/Express-4.18+-red) ![OpenAI](https://img.shields.io/badge/OpenAI-6.7.0-purple) ![Vite](https://img.shields.io/badge/Vite-7.1.7-646CFF)

**Live Demo**: [yaml-visualizer.netlify.app](https://yaml-visualizer.netlify.app) | **Project Structure**: [View as Diagram](https://yaml-visualizer.netlify.app/shared/VNfBZIq7lA)

---

## 🔥 What's New: GitHub Auto-Sync!

> **🐙 Keep your diagrams in perfect sync with your codebase**
> 
> Connect any GitHub repository and automatically update your YAML diagrams on every push. Perfect for living architecture documentation, config monitoring, and codebase exploration.
>
> ✨ **Two modes**: Auto-parse entire repo structure OR sync specific YAML files  
> 🔄 **Zero-config**: Set up webhook once, updates happen automatically  
> 🚀 **Real-time**: Diagram updates within seconds of pushing to GitHub

---

## ✨ Core Capabilities

### 🌗 Dark Mode
Toggle light/dark themes from any page. All components and diagrams are fully themed and your preference is remembered.

### 🔍 YAML Diff Comparison
- Side-by-side editors with `+`, `-`, `~`, `∅` change markers
- Unified diff view with `Original`/`Modified`/`Both` tags
- Compare manual input, saved graphs, specific versions, or current editor content
- Export unified diff output

### 📝 YAML Editor
- Auto-indentation, line numbers, search & replace, syntax highlighting
- Import `.yaml`/`.yml`/`.json` files (drag & drop supported; JSON auto-converts)
- Export as YAML or JSON
- Keyboard shortcuts for all major actions

### 🌳 Interactive Tree Visualization
- D3.js-powered tree with expand/collapse, zoom/pan, and path highlighting
- Fit-to-screen, fullscreen mode, and PNG/SVG export
- **Time Travel Visualization:** Instantly view and explore your YAML diagram at any point in its version history using a timeline/slider

### 🔄 Split-Panel Workspace
- Real-time diagram updates as you type
- Drag-to-resize panels (20%–80%), responsive on desktop and mobile

### 🐙 GitHub Integration & Auto-Sync ⭐ NEW!

**Two powerful modes:**

#### 🌳 Auto-Parse Repository Structure (Recommended)
- Automatically visualize your **entire repository structure** as a YAML tree
- **Real-time webhook sync**: Diagram auto-updates on every push to GitHub
- Perfect for **architecture documentation** and **codebase exploration**
- Intelligently skips `node_modules`, `.git`, `build`, `dist`, and other common generated directories
- Works with repositories of any size (GitHub API truncates very large repos with >100k files)

#### 📄 Sync Specific YAML File
- Sync a **specific YAML file** from your repository
- **Automatic updates**: Changes pushed to GitHub instantly update your diagram
- Perfect for **config files**, **CI/CD pipelines**, and **documentation**

**Setup Steps:**
1. Click the **🐙 GitHub icon** in your diagram
2. Choose your sync mode and enter repository details
3. Copy the webhook URL and secret
4. Add webhook to your GitHub repository settings (Settings → Webhooks → Add webhook)
5. **Done!** Your diagram now auto-updates on every push

**How updates reach you:**
- 🔌 **Socket.IO (Primary)**: Real-time updates if you're viewing the diagram
- 📊 **Polling (Fallback)**: Checks for updates every 12 seconds + on tab focus
- 💾 **Database**: Webhook always updates the file, even if no one is online

**Features:**
- ✅ Zero-config auto-sync via GitHub webhooks
- ✅ Real-time updates via Socket.IO
- ✅ Automatic versioning with delta tracking
- ✅ Manual sync with one-click refresh
- ✅ Branch-specific monitoring (main, dev, staging, etc.)
- ✅ Webhook security with HMAC-SHA256 signature verification
- ✅ Rate limit handling with optional GitHub token (5000/hour vs 60/hour)
- ✅ Works with public and private repositories

### 🤖 AI Assistant
- Generate YAML from plain English descriptions
- Structure analysis and optimization suggestions
- Maintains conversation history; works with graceful fallback without an API key

### 🔐 Authentication
- JWT-based auth with refresh tokens, profile management, and secure sessions
- Password hashing with bcryptjs
- HttpOnly cookies for secure token storage

### 💾 File Management & Collaboration
- Save, version, and share YAML diagrams with per-user view/edit permissions
- **Smart versioning**: Delta-based storage with periodic snapshots every 10 versions (efficient & fast)
- Non-owners can save a copy or replace (if permitted); view-only users are read-only
- Live presence bar with collaborator avatars and typing indicators
- Real-time collaboration with Socket.IO (see multiple users editing simultaneously)
- Export diagrams as PNG or SVG

### 📈 Analytics
- Node count, depth, and complexity metrics with YAML quality scoring
- Personal dashboard with usage statistics

---

## 🚀 Getting Started

### Prerequisites
- **Node.js 18+** with npm
- **MongoDB 8.0+** (local or [MongoDB Atlas](https://cloud.mongodb.com))
- **OpenAI API Key** (optional, for AI features)

### Installation

```bash
# Clone the repository
git clone https://github.com/srbmaury-team/Data-Visualizer.git
cd Data-Visualizer

# Install dependencies
cd server && npm install
cd ../client && npm install

# Configure environment
cd server && cp .env.example .env
# Edit .env with your MongoDB URI and JWT secret

# Run development servers
cd server && npm run dev     # Terminal 1
cd client && npm run dev     # Terminal 2
```

**Access Points:**
- **Web Interface**: `http://localhost:5173`
- **API Endpoint**: `http://localhost:5000`
- **Network Access**: Available on your local IP for mobile testing

---

## 🏗️ Architecture

### Frontend Stack
- **React 19.1.1**: Modern functional components with hooks
- **React Router 7.9**: Client-side routing and navigation
- **D3.js 7.9**: Advanced data visualization and animations
- **Vite 7.1**: Lightning-fast development and optimized builds

### Backend Infrastructure
- **Node.js 18+**: High-performance JavaScript runtime
- **Express 4.18**: Robust web application framework
- **Socket.IO**: Real-time collaboration with operational transformation
- **MongoDB 8.0**: Flexible document database with indexing
- **JWT Authentication**: Secure token-based user sessions with httpOnly cookies

---

## 📋 Environment Variables

### Server (`.env`)
```env
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/yaml-visualizer

# Auth
JWT_SECRET=your-secure-jwt-secret

# CORS (comma-separated list of allowed origins)
CORS_ORIGIN=http://localhost:5173
# Production: CORS_ORIGIN=https://your-app.netlify.app,http://localhost:5173

# GitHub Integration (Optional)
API_BASE_URL=http://localhost:5000  # For webhook callbacks
GITHUB_TOKEN=your-github-personal-access-token

# AI Features (Optional)
OPENAI_API_KEY=your-openai-api-key
```

**GitHub Token Setup:**
- Without token: 60 requests/hour
- With token: 5,000 requests/hour
- Get token at: https://github.com/settings/tokens
- Required scopes: `public_repo` (or `repo` for private repos)

### Client (`.env`)
```env
VITE_API_BASE_URL=http://localhost:5000/api
VITE_API_URL=http://localhost:5000
```

**Note:** Socket.IO automatically connects to the same server as your REST API.

---

## 🔗 API Reference

### System
- `GET /api/health` - Health check with CORS configuration details

### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### YAML Files
- `POST /api/yaml` - Save new YAML file
- `GET /api/yaml/my` - Get user's files (paginated)
- `GET /api/yaml/shared-with-me` - Get files shared with current user
- `GET /api/yaml/:id` - Get specific file
- `GET /api/yaml/shared/:shareId` - Get shared file (public)
- `PUT /api/yaml/:id` - Update file
- `DELETE /api/yaml/:id` - Delete file
- `GET /api/yaml/public/browse` - Browse public files
- `POST /api/yaml/:id/share` - Generate or toggle public share link
- `POST /api/yaml/:id/permissions` - Set per-user view/edit permissions
- `GET /api/yaml/:id/collaborators` - List existing collaborators

### Versioning
- `POST /api/files/:id/versions` - Create a new file version
- `GET /api/files/:id/versions` - Get version history
- `GET /api/files/:id/versions/:version` - Get specific version content
- `POST /api/files/:id/versions/:version/revert` - Revert file to a version

### GitHub Integration
- `POST /api/github/connect` - Connect specific YAML file from repository
- `POST /api/github/connect-repo` - Auto-parse entire repository structure
- `GET /api/github/integration/:yamlFileId` - Get integration details for a file
- `POST /api/github/sync/:integrationId` - Manually sync from GitHub
- `DELETE /api/github/disconnect/:integrationId` - Disconnect GitHub integration
- `GET /api/github/webhook/:integrationId` - Test webhook endpoint (verify reachable)
- `POST /api/github/webhook/:integrationId` - GitHub webhook endpoint (called by GitHub)

### User Management
- `GET /api/user/profile` - Get user profile with statistics
- `PUT /api/user/profile` - Update username and email
- `PUT /api/user/password` - Change password
- `DELETE /api/user/account` - Delete account
- `GET /api/user/dashboard` - Get dashboard data with analytics

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Tab` | Indent (2 spaces) |
| `Enter` | New line with auto-indent |
| `Ctrl/⌘ + S` | Save graph |
| `Ctrl/⌘ + O` | Import YAML file |
| `Ctrl/⌘ + Shift + K` | Import JSON file |
| `Ctrl/⌘ + Shift + E` | Export as YAML |
| `Ctrl/⌘ + Shift + X` | Export as JSON |
| `Ctrl/⌘ + F` | Search in editor |
| `Ctrl/⌘ + E` | Export diagram (PNG/SVG) |
| `Ctrl/⌘ + Shift + Y` | Toggle analysis panel |
| `Ctrl/⌘ + Shift + L` | Toggle combined view |
| `Ctrl/⌘ + Shift + P` | Toggle AI assistant |
| `Ctrl/⌘ + /` | Show all shortcuts |

---

## 🎯 Use Cases

- **🐙 Living Architecture Docs**: Auto-sync codebase structure with GitHub webhooks
- **🔄 Config File Monitoring**: Real-time visualization of Kubernetes configs, CI/CD pipelines, Docker Compose
- **⏳ Time Travel Diagrams**: Compare YAML structure at any point in version history
- **🏢 System Architecture**: Visualize microservices and dependencies with auto-updates
- **📋 Configuration Management**: Map complex config structures with automatic GitHub sync
- **🗂️ Data Hierarchies**: Explore nested data relationships
- **📁 Repository Structure**: Visualize GitHub repo hierarchies with real-time updates
- **🔌 API Documentation**: OpenAPI/Swagger files that stay in sync with your repo
- **🧩 Component Trees**: UI component hierarchies that update as codebase evolves
- **🚀 CI/CD Pipelines**: Live updates from `.github/workflows`
- **🗄️ Database Schemas**: Visualize table relationships from migration files
- **👥 Org Charts**: Team and role hierarchies
- **📚 Documentation**: Interactive technical docs that never go stale

---

## 🔒 Security Features

- **🔐 JWT Authentication**: Token-based auth with httpOnly cookies
- **🛡️ Password Hashing**: bcryptjs with salt rounds
- **🚦 Rate Limiting**: API abuse prevention (auto-excludes webhooks)
- **✅ Input Validation**: Comprehensive data validation
- **🌐 CORS Protection**: Production whitelist
- **🔒 Security Headers**: Helmet.js middleware
- **🔐 Webhook Signatures**: HMAC-SHA256 verification
- **🛡️ Trust Proxy**: Auto-enabled for Render/Heroku/AWS

---

## 📊 Performance & Limits

### Recommended Limits
- **YAML Files**: < 1MB for optimal performance
- **Node Count**: < 1000 nodes for smooth interaction
- **Browser Storage**: ~5-10MB localStorage limit
- **GitHub Imports**: GitHub API truncates at ~100,000 entries

### Versioning System
- **Delta-based storage** with operational transformation
- **Snapshots every 10 versions** for fast reconstruction
- Similar to Git's pack file approach

---

## 🐛 Known Issues & Limitations

- **Large YAML files** (>1000 nodes): May experience slower rendering
- **Search functionality**: Only searches visible (expanded) nodes
- **OpenAI API**: Requires internet and valid API key
- **Browser storage**: localStorage limits vary (~5-10MB typical)
- **Mobile interactions**: Some features work better on desktop
- **GitHub imports**: API truncates very large repos (>100k files)
- **Render Free Tier**: Backend sleeps after 15 minutes (~30s cold start)

> 💡 For large hierarchies, use collapse/expand to improve performance.

---

## 🤝 Contributing

We welcome contributions that enhance the YAML visualization experience:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines
- Follow React functional component patterns
- Ensure mobile responsiveness
- Add tests for new features

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙏 Acknowledgments

- **Inspiration**: [todiagram.com](https://todiagram.com)
- **Frontend**: [React](https://react.dev/) and [D3.js](https://d3js.org/)
- **Backend**: [Node.js](https://nodejs.org/) and [MongoDB](https://mongodb.com/)
- **AI**: [OpenAI API](https://openai.com/)
- **YAML Parsing**: [js-yaml](https://github.com/nodeca/js-yaml)

---

## 👨‍💻 Author

**Saurabh Maurya**
- GitHub: [@srbmaury-team](https://github.com/srbmaury-team)
- Project: [Data-Visualizer](https://github.com/srbmaury-team/Data-Visualizer)

---

**⭐ If you find this project useful, please consider giving it a star!**

---

*Made with ❤️ using React, Node.js, MongoDB, D3.js, and AI*
