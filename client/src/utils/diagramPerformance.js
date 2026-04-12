/**
 * Performance optimization utilities for large diagrams
 */

/**
 * Viewport-based node visibility detector
 * Returns only nodes that are within or near the viewport
 */
export function getVisibleNodes(allNodes, transform, viewportWidth, viewportHeight, buffer = 500) {
  if (!transform || allNodes.length < 100) {
    // Don't bother with culling for small diagrams
    return allNodes;
  }

  const scale = transform.k || 1;
  const translateX = transform.x || 0;
  const translateY = transform.y || 0;

  // Calculate viewport bounds in diagram coordinate space
  const viewportMinX = (-translateX / scale) - buffer;
  const viewportMaxX = ((viewportWidth - translateX) / scale) + buffer;
  const viewportMinY = (-translateY / scale) - buffer;
  const viewportMaxY = ((viewportHeight - translateY) / scale) + buffer;

  return allNodes.filter(node => {
    const nodeX = node.y || 0;  // In horizontal tree, y is the horizontal position
    const nodeY = node.x || 0;  // x is the vertical position
    const nodeWidth = node.boxWidth || 220;
    const nodeHeight = node.boxHeight || 70;

    // Check if node intersects with viewport (with buffer)
    return (
      nodeX + nodeWidth / 2 >= viewportMinX &&
      nodeX - nodeWidth / 2 <= viewportMaxX &&
      nodeY + nodeHeight >= viewportMinY &&
      nodeY - nodeHeight <= viewportMaxY
    );
  });
}

/**
 * Progressive level loader
 * Returns nodes up to a certain depth level
 */
export function getNodesUpToLevel(root, maxLevel) {
  const nodes = [];

  const traverse = (node, level = 0) => {
    if (level > maxLevel) return;

    nodes.push(node);

    if (node.children) {
      node.children.forEach(child => traverse(child, level + 1));
    }
  };

  traverse(root);
  return nodes;
}

/**
 * Memoized node dimension calculator
 */
export class NodeDimensionCache {
  constructor() {
    this.cache = new Map();
  }

  getKey(nodeName, properties) {
    const propCount = properties ? Object.keys(properties).length : 0;
    const maxPropLength = this.calculateMaxPropLength(nodeName, properties);
    return `${nodeName.substring(0, 20)}-${propCount}-${maxPropLength}`;
  }

  calculateMaxPropLength(nodeName, properties) {
    const propEntries = properties ? Object.entries(properties) : [];
    return Math.max(
      nodeName.length * 1.2,
      ...propEntries.map(([k, v]) => {
        let displayValue;
        if (typeof v === "object" && v !== null) {
          displayValue = JSON.stringify(v);
        } else if (v === null || v === undefined) {
          displayValue = "null";
        } else {
          displayValue = String(v);
        }
        return `${k}: ${displayValue}`.length;
      })
    );
  }

  getDimensions(nodeName, properties) {
    const key = this.getKey(nodeName, properties);

    if (this.cache.has(key)) {
      return this.cache.get(key);
    }

    const propCount = properties ? Object.keys(properties).length : 0;
    const maxPropLength = this.calculateMaxPropLength(nodeName, properties);

    const dimensions = {
      width: Math.max(220, Math.min(maxPropLength * 8 + 40, 500)),
      height: Math.max(70, 50 + propCount * 24)
    };

    this.cache.set(key, dimensions);
    return dimensions;
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * RequestAnimationFrame-based batch renderer
 * Splits large rendering operations across multiple frames
 */
export class BatchRenderer {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.frameTime = 16; // Target 60fps (16ms per frame)
  }

  /**
   * Add items to render queue
   * @param {Array} items - Items to render
   * @param {Function} renderFn - Function to call for each item
   * @param {Number} batchSize - Items per frame (default: auto-calculate)
   */
  addBatch(items, renderFn, batchSize = null) {
    return new Promise((resolve) => {
      this.queue.push({
        items: [...items],
        renderFn,
        batchSize: batchSize || Math.max(10, Math.floor(items.length / 20)),
        resolve
      });

      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false;
      return;
    }

    this.isProcessing = true;
    const batch = this.queue[0];

    requestAnimationFrame((timestamp) => {
      const startTime = performance.now();

      // Process items until we exceed frame budget
      let processedCount = 0;
      while (batch.items.length > 0 && processedCount < batch.batchSize) {
        const item = batch.items.shift();
        batch.renderFn(item, processedCount);
        processedCount++;

        // Check if we're exceeding frame budget
        if (performance.now() - startTime > this.frameTime * 0.8) {
          break;
        }
      }

      // If batch complete, resolve and remove from queue
      if (batch.items.length === 0) {
        batch.resolve();
        this.queue.shift();
      }

      // Continue processing
      this.processQueue();
    });
  }

  clear() {
    this.queue = [];
    this.isProcessing = false;
  }
}

/**
 * Smart layout calculator with progressive rendering
 */
export class ProgressiveLayoutManager {
  constructor(root, updateCallback) {
    this.root = root;
    this.updateCallback = updateCallback;
    this.currentLevel = 0;
    this.maxLevel = 0;
    this.isLoading = false;

    // Calculate max depth
    this.calculateMaxDepth();
  }

  calculateMaxDepth() {
    let maxDepth = 0;

    const traverse = (node, depth = 0) => {
      maxDepth = Math.max(maxDepth, depth);
      if (node.children) {
        node.children.forEach(child => traverse(child, depth + 1));
      } else if (node._children) {
        node._children.forEach(child => traverse(child, depth + 1));
      }
    };

    traverse(this.root);
    this.maxLevel = maxDepth;
    return maxDepth;
  }

  async loadProgressively(startLevel = 0, endLevel = null) {
    if (this.isLoading) return;

    this.isLoading = true;
    const targetLevel = endLevel !== null ? endLevel : this.maxLevel;

    // Load level by level
    for (let level = startLevel; level <= targetLevel && level <= this.maxLevel; level++) {
      this.currentLevel = level;

      // Expand nodes at this level
      this.expandNodesAtLevel(level);

      // Update visualization
      if (this.updateCallback) {
        await new Promise(resolve => {
          requestAnimationFrame(() => {
            this.updateCallback(this.root, level, this.maxLevel);
            resolve();
          });
        });
      }

      // Small delay between levels for smooth animation
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.isLoading = false;
  }

  expandNodesAtLevel(targetLevel) {
    const traverse = (node, depth = 0) => {
      if (depth === targetLevel && node._children && !node.children) {
        node.children = node._children;
      }

      if (node.children && depth < targetLevel) {
        node.children.forEach(child => traverse(child, depth + 1));
      }
    };

    traverse(this.root);
  }

  reset() {
    this.currentLevel = 0;
    this.isLoading = false;
  }
}

/**
 * Performance monitor to detect when optimizations should kick in
 */
export class PerformanceMonitor {
  constructor() {
    this.renderTimes = [];
    this.maxSamples = 10;
    this.slowThreshold = 50; // ms
  }

  recordRenderTime(duration) {
    this.renderTimes.push(duration);
    if (this.renderTimes.length > this.maxSamples) {
      this.renderTimes.shift();
    }
  }

  getAverageRenderTime() {
    if (this.renderTimes.length === 0) return 0;
    const sum = this.renderTimes.reduce((a, b) => a + b, 0);
    return sum / this.renderTimes.length;
  }

  isSlow() {
    return this.getAverageRenderTime() > this.slowThreshold;
  }

  shouldEnableVirtualRendering(nodeCount) {
    return nodeCount > 500 || this.isSlow();
  }

  shouldEnableProgressiveLoading(nodeCount) {
    return nodeCount > 1000 || (nodeCount > 500 && this.isSlow());
  }

  reset() {
    this.renderTimes = [];
  }
}

/**
 * Lazy expansion tracker
 * Ensures collapsed nodes' children aren't rendered at all
 */
export function getOnlyExpandedNodes(root) {
  const expandedNodes = [];

  const traverse = (node) => {
    expandedNodes.push(node);

    // Only traverse visible children
    if (node.children) {
      node.children.forEach(child => traverse(child));
    }
    // Skip _children (collapsed nodes)
  };

  traverse(root);
  return expandedNodes;
}
