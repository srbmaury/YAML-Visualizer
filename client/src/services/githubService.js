/**
 * GitHub Repository Analysis Service
 * Fetches repository structure and metadata for visualization
 */

class GitHubService {
  constructor() {
    this.baseURL = 'https://api.github.com';
    this.cache = new Map();
  }

  /**
   * Parse GitHub URL and extract owner/repo
   */
  parseGitHubURL(url) {
    const patterns = [
      /github\.com\/([^/]+)\/([^/]+)(?:\.git)?(?:\/.*)?$/,
      /^([^/]+)\/([^/]+)$/
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) {
        return {
          owner: match[1],
          repo: match[2].replace(/\.git$/, '')
        };
      }
    }
    
    throw new Error('Invalid GitHub URL format');
  }

  /**
   * Get repository metadata
   */
  async getRepositoryInfo(owner, repo) {
    const cacheKey = `repo-${owner}-${repo}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const response = await fetch(`${this.baseURL}/repos/${owner}/${repo}`, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'YAML-Visualizer/1.0'
      }
    });
    
    if (!response.ok) {
      if (response.status === 403) {
        const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
        const rateLimitReset = response.headers.get('X-RateLimit-Reset');
        
        if (rateLimitRemaining === '0') {
          const resetTime = new Date(parseInt(rateLimitReset) * 1000);
          throw new Error(`GitHub API rate limit exceeded. Resets at ${resetTime.toLocaleTimeString()}`);
        }
        
        throw new Error('Access forbidden. Repository may be private or requires authentication.');
      }
      if (response.status === 404) {
        throw new Error('Repository not found or is private');
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    const repoInfo = await response.json();
    this.cache.set(cacheKey, repoInfo);
    
    return repoInfo;
  }

  /**
   * Fetch repository tree structure recursively with enhanced large repo protection
   */
  async getRepositoryTree(owner, repo, path = '', maxDepth = 4, currentDepth = 0, options = {}) {
    const {
      maxTotalNodes = 500,        // Maximum total nodes to prevent memory issues
      maxApiCalls = 50,           // Maximum API calls to prevent rate limiting
      timeoutMs = 30000,          // 30 second timeout
      currentStats = { nodes: 0, apiCalls: 0, startTime: Date.now() }
    } = options;

    // Safety checks for large repositories
    if (currentDepth >= maxDepth) {
      return { type: 'directory', name: '...', truncated: true, reason: 'max_depth' };
    }

    if (currentStats.nodes >= maxTotalNodes) {
      return { type: 'directory', name: '...', truncated: true, reason: 'max_nodes' };
    }

    if (currentStats.apiCalls >= maxApiCalls) {
      return { type: 'directory', name: '...', truncated: true, reason: 'max_api_calls' };
    }

    if (Date.now() - currentStats.startTime > timeoutMs) {
      return { type: 'directory', name: '...', truncated: true, reason: 'timeout' };
    }

    const cacheKey = `tree-${owner}-${repo}-${path}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    try {
      const url = `${this.baseURL}/repos/${owner}/${repo}/contents/${path}`;

      // Increment API call counter
      currentStats.apiCalls++;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'YAML-Visualizer/1.0'
        }
      });

      if (!response.ok) {
        if (response.status === 403) {
          const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining');
          if (rateLimitRemaining === '0') {
            throw new Error('GitHub API rate limit exceeded. Please try again later.');
          }
          throw new Error('Access forbidden. Repository may be private.');
        }
        throw new Error(`Failed to fetch ${path}: ${response.status} ${response.statusText}`);
      }

      const contents = await response.json();

      // Handle single file
      if (!Array.isArray(contents)) {
        currentStats.nodes++;
        return this.processFile(contents);
      }

      // Early detection of very large directories
      if (contents.length > 100) {
        console.warn(`Large directory detected: ${path || 'root'} has ${contents.length} items`);
        
        // For very large directories, be more aggressive with filtering
        const filteredContents = this.filterLargeDirectory(contents, currentDepth);

        // Use filtered contents
        contents.splice(0, contents.length, ...filteredContents);
      }

      // Process directory contents
      const tree = {
        type: 'directory',
        name: path || repo,
        size: contents.length,
        children: [],
        ...(contents.length > 50 && { isLarge: true })
      };

      // Sort: directories first, then files
      const sorted = contents.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'dir' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      // Dynamic limit based on depth, repository size, and current stats
      const getItemLimit = (depth, totalItems, stats) => {
        // More aggressive limits as we process more nodes
        const progressiveFactor = Math.max(0.5, 1 - (stats.nodes / maxTotalNodes));
        
        let baseLimit;
        if (depth === 0) baseLimit = 25;
        else if (depth === 1) baseLimit = 20;
        else if (depth === 2) baseLimit = 15;
        else baseLimit = 10;
        
        // Apply progressive factor and ensure minimum of 5 items
        const adjustedLimit = Math.max(5, Math.floor(baseLimit * progressiveFactor));
        return Math.min(totalItems, adjustedLimit);
      };

      const itemsToProcess = sorted.slice(0, getItemLimit(currentDepth, sorted.length, currentStats));
      
      // Show truncation info if we're limiting items
      if (itemsToProcess.length < sorted.length) {
        tree.truncated = true;
        tree.truncatedCount = sorted.length - itemsToProcess.length;
      }

      for (const item of itemsToProcess) {
        // Safety check on each iteration
        if (currentStats.nodes >= maxTotalNodes || currentStats.apiCalls >= maxApiCalls) {
          break;
        }

        if (item.type === 'dir') {
          // Enhanced directory skipping for large repos
          const skipDirs = [
            'node_modules', '.git', 'dist', 'build', '__pycache__', '.next', '.nuxt', 'vendor',
            '.vscode', '.idea', 'logs', 'tmp', 'temp', 'cache', '.cache', 'coverage',
            'test_data', 'tests/__snapshots__', 'e2e', 'cypress/videos', 'cypress/screenshots'
          ];
          
          if (this.shouldSkipDirectory(item.name, currentDepth, skipDirs)) {
            tree.children.push({
              type: 'directory',
              name: item.name,
              size: '(skipped)',
              skipped: true,
              children: []
            });
            continue;
          }

          // Recursively fetch subdirectories with shared stats
          const subTree = await this.getRepositoryTree(
            owner, 
            repo, 
            item.path, 
            maxDepth, 
            currentDepth + 1,
            { maxTotalNodes, maxApiCalls, timeoutMs, currentStats }
          );
          tree.children.push(subTree);
          currentStats.nodes++;
        } else {
          tree.children.push(this.processFile(item));
          currentStats.nodes++;
        }
        
        // Progressive delay based on depth and load
        const delay = this.calculateDelay(currentDepth, currentStats);
        if (delay > 0) {
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }

      this.cache.set(cacheKey, tree);
      return tree;

    } catch (error) {
      console.warn(`Error fetching ${path}:`, error.message);
      return {
        type: 'directory',
        name: path || repo,
        error: error.message,
        failed: true,
        children: []
      };
    }
  }

  /**
   * Filter large directories to focus on important content
   */
  filterLargeDirectory(contents, depth) {
    // Prioritize important files and directories
    const priorityPatterns = [
      // Important files
      /^(readme|license|changelog|contributing|package\.json|tsconfig|webpack|vite|next|nuxt)(\.|$)/i,
      // Source directories
      /^(src|lib|app|pages|components|utils|hooks|api|server|client)$/i,
      // Config directories
      /^(config|configs|public|static|assets)$/i,
      // Documentation
      /^(docs|documentation)$/i
    ];

    const lowPriorityPatterns = [
      // Test files (keep some but not all)
      /^(test|tests|spec|__tests__|__mocks__|cypress|jest)$/i,
      // Build outputs (skip most)
      /^(dist|build|out|target|bin)$/i,
      // Logs and temp
      /^(logs|tmp|temp|cache|\.cache)$/i
    ];

    const highPriority = [];
    const normalPriority = [];
    const lowPriority = [];

    contents.forEach(item => {
      const name = item.name.toLowerCase();
      
      if (priorityPatterns.some(pattern => pattern.test(name))) {
        highPriority.push(item);
      } else if (lowPriorityPatterns.some(pattern => pattern.test(name))) {
        lowPriority.push(item);
      } else {
        normalPriority.push(item);
      }
    });

    // Return a balanced selection based on depth
    const maxItems = depth === 0 ? 30 : depth === 1 ? 25 : 20;
    
    return [
      ...highPriority,
      ...normalPriority.slice(0, Math.max(0, maxItems - highPriority.length - 3)),
      ...lowPriority.slice(0, 3) // Keep just a few low priority items
    ].slice(0, maxItems);
  }

  /**
   * Enhanced directory skipping logic
   */
  shouldSkipDirectory(dirName, depth, skipDirs) {
    const name = dirName.toLowerCase();
    
    // Always skip certain directories
    if (skipDirs.includes(name)) {
      return true;
    }
    
    // Skip at any depth for these patterns
    const alwaysSkipPatterns = [
      /^\.git$/,
      /^node_modules$/,
      /^\.vscode$/,
      /^\.idea$/
    ];
    
    if (alwaysSkipPatterns.some(pattern => pattern.test(name))) {
      return true;
    }
    
    // Skip at deeper levels for these patterns
    if (depth >= 2) {
      const deepSkipPatterns = [
        /^(dist|build|out|target)$/,
        /^(logs|log|tmp|temp)$/,
        /^(cache|\.cache|\.next|\.nuxt)$/,
        /^(coverage|\.nyc_output)$/,
        /^__pycache__$/,
        /^\.(pytest_cache|tox|coverage)$/
      ];
      
      return deepSkipPatterns.some(pattern => pattern.test(name));
    }
    
    return false;
  }

  /**
   * Calculate progressive delay based on current load
   */
  calculateDelay(depth, stats) {
    const baseDelay = depth === 0 ? 30 : depth === 1 ? 50 : 80;
    
    // Increase delay as we approach limits
    const loadFactor = stats.nodes / 500; // Assuming maxTotalNodes = 500
    const progressiveDelay = baseDelay * (1 + loadFactor);
    
    return Math.min(progressiveDelay, 200); // Cap at 200ms
  }

  /**
   * Process individual file metadata
   */
  processFile(file) {
    const extension = this.getFileExtension(file.name);
    const category = this.categorizeFile(file.name, extension);
    
    return {
      type: 'file',
      name: file.name,
      size: file.size || 0,
      extension,
      category,
      language: this.detectLanguage(extension),
      url: file.html_url,
      lastModified: file.last_modified || null
    };
  }

  /**
   * Format name for YAML (handle spaces but preserve structure)
   */
  formatYamlName(name, isFile = false) {
    if (isFile) {
      // For files, keep the full name with extension
      return name.replace(/\s+/g, '-');
    } else {
      // For directories, get just the last part of the path
      const lastPart = name.split('/').pop() || name;
      return lastPart.replace(/\s+/g, '-');
    }
  }

  /**
   * Get file extension
   */
  getFileExtension(filename) {
    const match = filename.match(/\.([^.]+)$/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * Categorize files by type
   */
  categorizeFile(filename, extension) {
    const categories = {
      code: ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'cpp', 'c', 'h', 'cs', 'php', 'rb', 'go', 'rs', 'kt', 'swift'],
      config: ['json', 'yaml', 'yml', 'toml', 'ini', 'env', 'config'],
      docs: ['md', 'txt', 'rst', 'pdf', 'doc', 'docx'],
      styles: ['css', 'scss', 'sass', 'less', 'styl'],
      assets: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp'],
      data: ['csv', 'xml', 'sql', 'db', 'sqlite'],
      build: ['dockerfile', 'makefile', 'gradle', 'maven']
    };

    // Check by filename first
    const lowerName = filename.toLowerCase();
    if (lowerName.includes('readme')) return 'docs';
    if (lowerName.includes('package.json')) return 'config';
    if (lowerName.includes('dockerfile')) return 'build';
    if (lowerName.includes('makefile')) return 'build';

    // Check by extension
    for (const [category, extensions] of Object.entries(categories)) {
      if (extensions.includes(extension)) {
        return category;
      }
    }

    return 'other';
  }

  /**
   * Detect programming language
   */
  detectLanguage(extension) {
    const languages = {
      js: 'JavaScript',
      jsx: 'React',
      ts: 'TypeScript',
      tsx: 'React TypeScript',
      py: 'Python',
      java: 'Java',
      cpp: 'C++',
      c: 'C',
      h: 'C/C++',
      cs: 'C#',
      php: 'PHP',
      rb: 'Ruby',
      go: 'Go',
      rs: 'Rust',
      kt: 'Kotlin',
      swift: 'Swift',
      css: 'CSS',
      scss: 'SCSS',
      html: 'HTML',
      md: 'Markdown'
    };

    return languages[extension] || null;
  }

  /**
   * Convert repository tree to YAML format
   */
  convertToYAML(tree, repoInfo) {
    const yamlTree = {
      name: this.formatYamlName(repoInfo.name || 'Unknown-Repository', false),
      description: repoInfo.description || 'No description available',
      language: repoInfo.language || 'Multiple',
      type: 'repository',
      stars: repoInfo.stargazers_count || 0,
      forks: repoInfo.forks_count || 0,
      size: `${Math.round((repoInfo.size || 0) / 1024)}MB`,
      updated: new Date(repoInfo.updated_at).toLocaleDateString(),
      url: repoInfo.html_url,
      children: this.convertTreeToYAML(tree.children || [])
    };

    return yamlTree;
  }

  /**
   * Recursively convert tree structure to YAML
   */
  convertTreeToYAML(items) {
    return items.map(item => {
      if (item.type === 'directory') {
        const node = {
          name: this.formatYamlName(item.name, false),
          type: 'directory'
        };

        // Add directory size if available (count of children)
        if (item.children && item.children.length > 0) {
          node.size = `${item.children.length} items`;
          node.children = this.convertTreeToYAML(item.children);
        } else {
          node.size = '0 items';
        }

        return node;
      } else {
        const node = {
          name: this.formatYamlName(item.name, true), // Keep full filename with extension
          type: 'file'
        };

        if (item.category && item.category !== 'other') {
          node.category = item.category;
        }

        if (item.language) {
          node.language = item.language;
        }

        if (item.size && item.size > 0) {
          node.size = this.formatFileSize(item.size);
        }

        if (item.extension) {
          node.extension = item.extension;
        }

        return node;
      }
    });
  }

  /**
   * Format file size for display
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0B';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + sizes[i];
  }

  /**
   * Analyze repository structure
   */
  analyzeRepository(tree, repoInfo) {
    const analysis = {
      totalFiles: 0,
      totalDirectories: 0,
      languages: new Set(),
      categories: {},
      largestFiles: [],
      depth: 0
    };

    this.analyzeNode(tree, analysis, 0);

    return {
      ...analysis,
      languages: Array.from(analysis.languages),
      mainLanguage: repoInfo.language,
      projectType: this.detectProjectType(analysis),
      recommendations: this.generateRecommendations(analysis)
    };
  }

  /**
   * Recursively analyze tree nodes
   */
  analyzeNode(node, analysis, depth) {
    analysis.depth = Math.max(analysis.depth, depth);

    if (node.type === 'directory') {
      analysis.totalDirectories++;
      if (node.children) {
        node.children.forEach(child => 
          this.analyzeNode(child, analysis, depth + 1)
        );
      }
    } else {
      analysis.totalFiles++;
      
      if (node.language) {
        analysis.languages.add(node.language);
      }

      if (node.category) {
        analysis.categories[node.category] = 
          (analysis.categories[node.category] || 0) + 1;
      }

      if (node.size > 0) {
        analysis.largestFiles.push({
          name: node.name,
          size: node.size,
          category: node.category
        });
      }
    }
  }

  /**
   * Detect project type based on structure
   */
  detectProjectType(analysis) {
    const { categories, languages } = analysis;

    if (categories.code && languages.has('React')) {
      return 'React Application';
    }
    if (categories.code && languages.has('JavaScript')) {
      return 'Node.js Project';
    }
    if (categories.code && languages.has('Python')) {
      return 'Python Project';
    }
    if (categories.code && languages.has('Java')) {
      return 'Java Application';
    }
    
    return 'General Project';
  }

  /**
   * Generate recommendations for repository structure
   */
  generateRecommendations(analysis) {
    const recommendations = [];

    if (!analysis.categories.docs) {
      recommendations.push('Consider adding documentation (README, docs folder)');
    }

    if (analysis.depth > 8) {
      recommendations.push('Deep directory structure - consider flattening');
    }

    if (analysis.totalFiles > 500) {
      recommendations.push('Large repository - consider modularization');
    }

    if (!analysis.categories.config) {
      recommendations.push('Add configuration files for better project setup');
    }

    return recommendations;
  }

  /**
   * Main method to process GitHub repository with enhanced large repo protection
   */
  async processRepository(url, options = {}) {
    try {
      // Parse URL
      const { owner, repo } = this.parseGitHubURL(url);
      
      // Get repository info first to check size
      const repoInfo = await this.getRepositoryInfo(owner, repo);
      
      // Adjust limits based on repository size
      const repoSizeKB = repoInfo.size || 0;
      let enhancedOptions = {
        maxTotalNodes: 500,
        maxApiCalls: 50,
        timeoutMs: 30000,
        ...options
      };

      // For very large repositories, be more conservative
      if (repoSizeKB > 50000) { // > 50MB
        console.warn(`Large repository detected (${repoSizeKB}KB). Using conservative limits.`);
        enhancedOptions = {
          ...enhancedOptions,
          maxTotalNodes: 300,
          maxApiCalls: 30,
          maxDepth: 3
        };
      } else if (repoSizeKB > 20000) { // > 20MB
        enhancedOptions = {
          ...enhancedOptions,
          maxTotalNodes: 400,
          maxApiCalls: 40
        };
      }

      // Get repository tree with enhanced protection
      const tree = await this.getRepositoryTree(
        owner, 
        repo, 
        '', 
        enhancedOptions.maxDepth || 4, 
        0, 
        enhancedOptions
      );
      
      // Convert to YAML
      const yamlStructure = this.convertToYAML(tree, repoInfo);
      
      // Analyze structure
      const analysis = this.analyzeRepository(tree, repoInfo);
      
      // Add protection info to analysis
      if (enhancedOptions.currentStats) {
        analysis.processingStats = {
          totalNodes: enhancedOptions.currentStats.nodes,
          totalApiCalls: enhancedOptions.currentStats.apiCalls,
          processingTime: Date.now() - enhancedOptions.currentStats.startTime,
          truncated: tree.truncated || false
        };
      }
      
      return {
        yaml: yamlStructure,
        analysis,
        repoInfo,
        success: true
      };
      
    } catch (error) {
      return {
        error: error.message,
        success: false
      };
    }
  }
}

// Export singleton instance
export default new GitHubService();