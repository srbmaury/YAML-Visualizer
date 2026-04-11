# 🎯 YAML Data Visualizer

Convert YAML structures into interactive tree diagrams. Built with React, Node.js, D3.js, and MongoDB — with a YAML editor, diff comparison, AI assistance, versioning, and real-time collaboration.

![React](https://img.shields.io/badge/React-19.1.1-blue) ![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![MongoDB](https://img.shields.io/badge/MongoDB-8.0+-brightgreen) ![D3.js](https://img.shields.io/badge/D3.js-7.9.0-orange) ![Express](https://img.shields.io/badge/Express-4.18+-red) ![OpenAI](https://img.shields.io/badge/OpenAI-6.7.0-purple) ![Vite](https://img.shields.io/badge/Vite-7.1.7-646CFF)

---

## 🔥 **What's New: GitHub Auto-Sync!**

> **🐙 Keep your diagrams in perfect sync with your codebase**
> 
> Connect any GitHub repository and automatically update your YAML diagrams on every push. Perfect for living architecture documentation, config monitoring, and codebase exploration.
>
> ✨ **Two modes**: Auto-parse entire repo structure OR sync specific YAML files  
> 🔄 **Zero-config**: Set up webhook once, updates happen automatically  
> 🚀 **Real-time**: Diagram updates within seconds of pushing to GitHub

---

## ✨ **Core Capabilities**

**🌗 Dark mode:** Toggle light/dark themes from any page. All components and diagrams are fully themed and your preference is remembered.

### 🔍 **YAML Diff Comparison**
- Side-by-side editors with `+`, `-`, `~`, `∅` change markers
- Unified diff view with `Original`/`Modified`/`Both` tags
- Compare manual input, saved graphs, specific versions, or current editor content
- Export unified diff output

### 📝 **YAML Editor**
- Auto-indentation, line numbers, search & replace, syntax highlighting
- Import `.yaml`/`.yml`/`.json` files (drag & drop supported; JSON auto-converts)
- Export as YAML or JSON
- Keyboard shortcuts for all major actions


### 🌳 **Interactive Tree Visualization**
- D3.js-powered tree with expand/collapse, zoom/pan, and path highlighting
- Fit-to-screen, fullscreen mode, and PNG/SVG export
- **Time Travel Visualization:** Instantly view and explore your YAML diagram at any point in its version history using a timeline/slider. Effortlessly switch between versions and see how your data evolved over time.

### 🔄 **Split-Panel Workspace**
- Real-time diagram updates as you type
- Drag-to-resize panels (20%–80%), responsive on desktop and mobile

### 🐙 **GitHub Integration & Auto-Sync** ⭐ NEW!
**Two powerful modes to keep your diagrams in sync with GitHub:**

#### 🌳 Auto-Parse Repository Structure (Recommended)
- Automatically visualize your **entire repository structure** as a YAML tree
- **Real-time webhook sync**: Diagram auto-updates on every push to GitHub
- Perfect for **architecture documentation** and **codebase exploration**
- Auto-limited to 500 nodes; intelligently skips `node_modules`, `.git`, `build`, `dist`

#### 📄 Sync Specific YAML File
- Sync a **specific YAML file** from your repository
- **Automatic updates**: Changes pushed to GitHub instantly update your diagram
- Perfect for **config files**, **CI/CD pipelines**, and **documentation**

#### 🔄 How It Works
1. Click the **🐙 GitHub icon** in your diagram
2. Choose your sync mode and enter repository details
3. Copy the webhook URL and secret
4. Add webhook to your GitHub repository settings
5. **Done!** Your diagram now auto-updates on every push

#### ✨ Features
- ✅ **Zero-config auto-sync** via GitHub webhooks
- ✅ **Manual sync** with one-click refresh
- ✅ **Branch-specific** monitoring (main, dev, staging, etc.)
- ✅ **Webhook security** with HMAC-SHA256 signatures
- ✅ **Rate limit handling** with optional GitHub token
- ✅ Works with **public and private** repositories (with token)

### 🤖 **AI Assistant**
- Generate YAML from plain English descriptions
- Structure analysis and optimization suggestions
- Maintains conversation history; works with graceful fallback without an API key

### 🔐 **Authentication**
- JWT-based auth with refresh tokens, profile management, and secure sessions

### 💾 **File Management & Collaboration**
- Save, version, and share YAML diagrams with per-user view/edit permissions
- Non-owners can save a copy or replace (if permitted); view-only users are read-only
- Live presence bar with collaborator avatars and typing indicators
- Export diagrams as PNG or SVG

### 📈 **Analytics**
- Node count, depth, and complexity metrics with YAML quality scoring
- Personal dashboard with usage statistics

---

## 🚀 **Getting Started**

### Prerequisites
- **Node.js 18+** with npm package manager
- **MongoDB 8.0+** (local installation or MongoDB Atlas)
- **OpenAI API Key** (optional, for AI features)

### Quick Installation

```bash
# Clone the repository
git clone https://github.com/srbmaury-team/Data-Visualizer.git
cd Data-Visualizer

# Install server dependencies
cd server && npm install

# Install client dependencies  
cd ../client && npm install
```

### Environment Configuration

1. **Server Configuration**:
   ```bash
   cd server
   cp .env.example .env
   # Configure your MongoDB URI and JWT secret
   ```

2. **Database Setup**:
   - Start MongoDB locally or configure Atlas connection
   - Database collections are created automatically

3. **Launch Application**:
   ```bash
   # Terminal 1: Backend server
   cd server && npm run dev

   # Terminal 2: Frontend development server
   cd client && npm run dev -- --host
   ```

4. **Access Points**:
   - **Web Interface**: `http://localhost:5173`
   - **API Endpoint**: `http://localhost:5000`
   - **Network Access**: Available on your local IP for mobile testing

### AI Assistant Setup

1. Get an API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Open "🤖 AI Assistant" in the app, click "🔑", and enter your key

---

## 🏗️ **Architecture**

### Frontend Stack
- **React 19.1.1**: Modern functional components with hooks
- **React Router 7.9**: Client-side routing and navigation
- **D3.js 7.9**: Advanced data visualization and animations
- **Vite 7.1**: Lightning-fast development and optimized builds

### Backend Infrastructure
- **Node.js 18+**: High-performance JavaScript runtime
- **Express 4.18**: Robust web application framework
- **MongoDB 8.0**: Flexible document database with indexing
- **JWT Authentication**: Secure token-based user sessions

---

##  **Documentation**

See the interactive project structure:
> [Visualize the project structure](https://yaml-visualizer.netlify.app/shared/ZjrtD8_Jv_)

---

### Environment Variables
***server (`.env`):***
```env
NODE_ENV=development
PORT=5000

# Database
MONGODB_URI=mongodb://localhost:27017/yaml-visualizer

# Auth
JWT_SECRET=your-secure-jwt-secret

# CORS
CORS_ORIGIN=http://localhost:5173

# GitHub Integration (Optional)
API_BASE_URL=http://localhost:5000
GITHUB_TOKEN=your-github-personal-access-token

# AI Features (Optional)
OPENAI_API_KEY=your-openai-api-key
```

**GitHub Token Setup (Optional but Recommended):**
- Without token: 60 GitHub API requests/hour
- With token: 5,000 requests/hour
- Get your token at: https://github.com/settings/tokens
- Required scopes: `public_repo` (or `repo` for private repos)

***client (`.env`):***
```env
# API Configuration
VITE_API_BASE_URL=http://localhost:5000/api

# Optional: OpenAI API Key (client-side, not recommended for production)
# VITE_OPENAI_API_KEY=your-openai-api-key
```

---

## 🤝 **Contributing**

We welcome contributions that enhance the YAML visualization experience:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines
- Follow React functional component patterns
- Ensure mobile responsiveness

### YAML Format
- `name`: Required node identifier
- `children` or `nodes`: Array of child nodes
- Custom properties displayed in node boxes; unlimited nesting depth

Example:
```yaml
name: app
children:
   - name: src
      children:
         - name: components
         - name: pages
   - name: package.json
```

### GitHub Integration Setup

#### Quick Import (One-Time)
Use **File ▾ → Import Repo**, enter a public GitHub URL (`https://github.com/owner/repo`), and the structure is converted to YAML. Auto-limited to 500 nodes; skips `node_modules`, `.git`, `build`, `dist`.

#### Auto-Sync Setup (Continuous Updates)
1. **Connect to GitHub**:
   - Click the **🐙** icon in any saved diagram
   - Choose your mode:
     - **🌳 Auto-Parse Repo Structure**: Visualize entire codebase
     - **📄 Sync Specific YAML File**: Sync individual config file
   - Enter repository details (owner, repo, branch)
   - Click **"Connect to GitHub"**

2. **Set Up Webhook**:
   - Copy the provided webhook URL and secret
   - Go to your GitHub repo → **Settings** → **Webhooks** → **Add webhook**
   - Paste the webhook URL and secret
   - Content type: `application/json`
   - Events: **Just the push event**
   - Click **Add webhook**

3. **Done!** Your diagram now auto-updates on every push

#### Manual Sync
If you prefer not to set up webhooks, use the **"🔄 Sync Now"** button to manually fetch the latest changes from GitHub.

---

## 🔗 API Reference

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
- `GET /api/yaml/:id/collaborators` - List existing collaborators on a file

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
- `POST /api/github/webhook/:integrationId` - GitHub webhook endpoint (called by GitHub)

### User Management & Profile
- `GET /api/user/profile` - Get detailed user profile with statistics
- `PUT /api/user/profile` - Update username and email
- `PUT /api/user/password` - Change user password (requires current password)
- `DELETE /api/user/account` - Delete user account (requires password confirmation)
- `GET /api/user/dashboard` - Get comprehensive dashboard data with analytics

---

## 🎮 Controls & Shortcuts

### ⌨️ Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Tab` | Indent (2 spaces) |
| `Enter` | New line with auto-indent |
| `Ctrl/⌘ + S` | Save graph |
| `Ctrl/⌘ + O` | Import YAML file |
| `Ctrl/⌘ + Shift + K` | Import JSON file (auto-converts to YAML) |
| `Ctrl/⌘ + Shift + E` | Export as YAML |
| `Ctrl/⌘ + Shift + X` | Export as JSON |
| `Ctrl/⌘ + F` | Search in editor |
| `Ctrl/⌘ + E` | Open diagram export dialog (PNG/SVG) |
| `Ctrl/⌘ + Shift + Y` | Toggle analysis panel |
| `Ctrl/⌘ + Shift + L` | Toggle combined/editor view |
| `Ctrl/⌘ + Shift + P` | Toggle AI assistant |
| `Ctrl/⌘ + /` | Show keyboard shortcuts panel |

### 🖱️ Mouse Controls
| Action | Result |
|--------|--------|
| Mouse Wheel | Zoom diagram |
| Click & Drag | Pan diagram |
| Click Node | Highlight path to root |
| Click `+`/`−` | Expand/collapse node |
| Click `📋` | Copy property value |
| Drag Divider | Adjust panel widths |
| **Click Username** | Navigate to profile page |

### 🎛️ Interface Buttons

#### Header Menu — File ▾
| Button | Function |
|--------|----------|
| `📄 New File` | Reset editor and start fresh |
| `📥 Import YAML` | Import `.yaml`/`.yml` files from disk |
| `📥 Import JSON → YAML` | Import `.json` files with automatic conversion to YAML |
| `📂 Import Repo` | Import any public GitHub repository structure as YAML |
| `📤 Export YAML` | Download current content as `.yaml` file |
| `📤 Export as JSON` | Convert YAML to JSON and download as `.json` file |
| `💾 Save Graph` | Permission-aware save (replace or copy workflow based on ownership/access) |
| `📚 My Graphs` | Manage owned and shared files in separate tabs |
| `📜 Version History` | View, load, and revert file versions (shared-access aware with author attribution) |

#### Header Menu — View ▾ (Editor Page)
| Button | Function |
|--------|----------|
| `🔗 Combined View` | Switch to split-panel editor + visualizer |
| `🔍 Analysis` | Toggle analysis sidebar |
| `🔍 Diff Compare` | Open diff comparison page with current YAML |
| `📖 Docs` | View documentation |

#### Header — Standalone
| Button | Function |
|--------|----------|
| `🎨 Visualize` | Parse YAML and open full-page diagram view |
| `🐙 GitHub` | Open GitHub integration modal (sync repo or file) |
| `🤖 AI` | Open AI assistant panel |
| `⌨️` | Show keyboard shortcuts panel |
| `🏠` | Navigate to home page |
| Username | Click to access profile and settings |

#### Diagram Controls
| Button | Function |
|--------|----------|
| `🔽 Collapse All` / `🔼 Expand All` | Toggle all nodes collapsed/expanded |
| `🔍+` / `🔍−` | Zoom in/out |
| `📐` | Fit diagram to screen |
| `📏` | Reset to actual size (1:1) |
| `🏠` | Reset view position |
| `⬇️` | Export diagram as PNG or SVG |
| `⛶` | Toggle fullscreen mode |

#### Collaboration
| Button | Function |
|--------|----------|
| `🔗 Share` | Open share modal (visible to file owner in PresenceBar) |
| User avatars | Click to view collaborator details (name, role, status) |

---


## 🌟 Use Cases

- **🐙 Living Architecture Docs**: Auto-sync your codebase structure and keep architecture diagrams always up-to-date with GitHub webhooks
- **🔄 Config File Monitoring**: Real-time visualization of Kubernetes configs, CI/CD pipelines, or Docker Compose files as they change
- **⏳ Time Travel Diagrams**: Instantly visualize and compare your YAML structure at any point in its version history
- **🏢 System Architecture**: Visualize microservices and dependencies with auto-updates from your repo
- **📋 Configuration Docs**: Map complex config file structures with automatic sync from GitHub
- **🗂️ Data Hierarchies**: Explore nested data relationships
- **📁 Code Repository Structure**: Import and visualize GitHub repository hierarchies with real-time updates
- **🔌 API Documentation**: Show endpoint relationships and structure that stay in sync with your OpenAPI/Swagger files
- **🧩 Component Trees**: Display UI component hierarchies that update as your codebase evolves
- **🚀 CI/CD Pipelines**: Map deployment and build processes with live updates from `.github/workflows`
- **🗄️ Database Schemas**: Visualize table relationships from migration files
- **👥 Org Charts**: Display team and role hierarchies
- **📚 Documentation**: Create interactive technical documentation that never goes stale

---

## ️ Development

### Available Scripts

**Frontend:**
```bash
cd client
npm run dev          # Development server with HMR
npm run build        # Production build
npm run preview      # Preview production build
npm run lint         # Lint code
```

**Backend:**
```bash
cd server
npm start            # Production server
npm run dev          # Development with nodemon
```

---

## 🔒 Security Features

- **🔐 JWT Authentication**: Secure token-based auth
- **🛡️ Password Hashing**: bcryptjs with salt rounds
- **🚦 Rate Limiting**: API abuse prevention
- **✅ Input Validation**: Comprehensive data validation
- **🌐 CORS Protection**: Configurable cross-origin requests
- **🔒 Security Headers**: Helmet.js security middleware

---

## � Performance

### Recommended Limits
- **YAML Files**: < 1MB for optimal performance
- **Node Count**: < 500 nodes for optimal interaction (GitHub imports auto-limited to 500 nodes)
- **Browser Storage**: ~5-10MB localStorage limit

---

## 🐛 Known Issues & Limitations

- **Large YAML files** (>500 nodes): May experience performance degradation during rendering
- **Search functionality**: Only searches visible (expanded) nodes in the diagram
- **OpenAI API**: Requires active internet connection and valid API key for AI features
- **Browser storage**: localStorage size limits vary by browser (~5-10MB typical limit)
- **Mobile interactions**: Some advanced features work better on desktop/tablet devices
- **GitHub imports**: Auto-limited to representative structures (default ~500 nodes; reduced for larger repositories)

> 💡 For large hierarchies, use collapse/expand to improve performance and navigation.

---

## 🤝 Support

- [GitHub Issues](https://github.com/srbmaury-team/Data-Visualizer/issues) — bug reports and feature requests

---

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

## 🙏 Acknowledgments

- **Inspiration**: [todiagram.com](https://todiagram.com)
- **Frontend**: Built with [React](https://react.dev/) and [D3.js](https://d3js.org/)
- **Backend**: Powered by [Node.js](https://nodejs.org/) and [MongoDB](https://mongodb.com/)
- **AI**: Enhanced with [OpenAI API](https://openai.com/)
- **YAML**: Parsing by [js-yaml](https://github.com/nodeca/js-yaml)

---

## 👨‍💻 Author

**Saurabh Maurya**
- GitHub: [@srbmaury-team](https://github.com/srbmaury-team)
- Project: [Data-Visualizer](https://github.com/srbmaury-team/Data-Visualizer)

---

**⭐ If you find this project useful, please consider giving it a star!**

---

*Made with ❤️ using React, Node.js, MongoDB, D3.js, and AI*