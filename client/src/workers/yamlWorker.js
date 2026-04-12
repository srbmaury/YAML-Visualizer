// Web Worker for parsing YAML in background thread
import yaml from 'js-yaml';
import { buildTreeFromYAML, convertToD3Hierarchy } from '../utils/treeBuilder';
import { validateYAML } from '../utils/yamlValidator';

self.onmessage = function(e) {
  const { type, payload } = e.data;

  try {
    switch (type) {
      case 'PARSE_YAML': {
        const { yamlText, progressCallback } = payload;

        // Validate YAML
        const validationResult = validateYAML(yamlText);
        if (!validationResult.valid) {
          self.postMessage({
            type: 'PARSE_ERROR',
            error: validationResult.issues ? validationResult.issues.map(i => i.message).join(', ') : 'Invalid YAML'
          });
          return;
        }

        // Parse YAML
        const parsedData = yaml.load(yamlText);

        // Build tree structure
        const treeData = buildTreeFromYAML(parsedData);

        // Convert to D3 hierarchy
        const d3Data = convertToD3Hierarchy(treeData);

        // Send result back to main thread
        self.postMessage({
          type: 'PARSE_SUCCESS',
          data: {
            parsedData: d3Data,
            treeInfo: treeData.treeInfo
          }
        });
        break;
      }

      case 'ANALYZE_STRUCTURE': {
        // Analyze YAML structure for optimization hints
        const { parsedData } = payload;

        let nodeCount = 0;
        let maxDepth = 0;
        let avgBranchingFactor = 0;

        const analyze = (node, depth = 0) => {
          nodeCount++;
          maxDepth = Math.max(maxDepth, depth);

          if (node.children) {
            node.children.forEach(child => analyze(child, depth + 1));
          }
        };

        analyze(parsedData);

        self.postMessage({
          type: 'ANALYSIS_COMPLETE',
          data: {
            nodeCount,
            maxDepth,
            shouldUseVirtualRendering: nodeCount > 500,
            shouldUseProgressiveLoading: nodeCount > 1000
          }
        });
        break;
      }

      default:
        self.postMessage({
          type: 'ERROR',
          error: `Unknown message type: ${type}`
        });
    }
  } catch (error) {
    self.postMessage({
      type: 'PARSE_ERROR',
      error: error.message
    });
  }
};
