/**
 * Tree Builder Utility
 * Converts YAML/JSON to hierarchical tree structure with proper level calculations
 */

/** Prevents stack overflow from pathological depth (deep node_modules chains) or YAML anchor cycles. */
const MAX_TREE_DEPTH = 400;

export function buildTreeFromYAML(yamlData) {
  const tree = {
    nodes: [],
    edges: [],
    levels: new Map(), // Track nodes at each level
  };

  let nodeIdCounter = 0;

  function createNode(data, name, level = 0, parentId = null, ancestors = new Set()) {
    // Handle null or undefined data
    let payload = data;
    if (payload === null || payload === undefined) {
      payload = { value: String(payload) };
    }

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      if (ancestors.has(payload)) {
        payload = { _error: "Circular reference in YAML (anchor / duplicate object)" };
      } else if (level > MAX_TREE_DEPTH) {
        payload = {
          _truncated: `Branch truncated: maximum tree depth is ${MAX_TREE_DEPTH}`,
        };
      }
    }

    const nextAncestors =
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? new Set(ancestors).add(payload)
        : ancestors;

    const nodeId = `node-${nodeIdCounter++}`;
    
    // Extract properties (non-object, non-array values)
    const properties = {};
    const children = [];
    
    if (typeof payload === "object" && payload !== null) {
      Object.entries(payload).forEach(([key, value]) => {
        // Handle 'children' or 'nodes' array specially
        if ((key === "children" || key === "nodes") && Array.isArray(value)) {
          value.forEach((child, idx) => {
            if (typeof child === "object" && child !== null) {
              const childNode = createNode(
                child,
                child.name || `Child-${idx + 1}`,
                level + 1,
                nodeId,
                nextAncestors
              );
              children.push(childNode);
            } else {
              // Primitive value in children array
              const childNode = createNode(
                { value: child },
                `Item-${idx + 1}`,
                level + 1,
                nodeId,
                nextAncestors
              );
              children.push(childNode);
            }
          });
        }
        // Handle nested objects as child nodes
        else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
          const childNode = createNode(value, key, level + 1, nodeId, nextAncestors);
          children.push(childNode);
        }
        // Handle arrays (convert to string)
        else if (Array.isArray(value)) {
          properties[key] = value.map(v => {
            if (typeof v === "object" && v !== null) {
              try {
                return JSON.stringify(v);
              } catch {
                return "[Object]";
              }
            }
            return String(v);
          }).join(", ");
        }
        // Legacy GitHub auto-parse: files were flattened to strings like "file .cpp (4b, abc1234)"
        // Treat as a child node so one node per file (same as object-valued files).
        // Do NOT run this for structured file nodes (`type: file`) or for the `summary` field:
        // auto-parse YAML sets summary: "file .json (71KB)" which matches the regex and would
        // otherwise recurse forever as child nodes named "summary".
        else if (
          typeof value === "string" &&
          /^file(\s+\.[\w.]+)?\s+\([\d?]+b/i.test(value.trim()) &&
          payload.type !== "file" &&
          key !== "summary"
        ) {
          const childNode = createNode(
            { summary: value, type: "file" },
            key,
            level + 1,
            nodeId,
            nextAncestors
          );
          children.push(childNode);
        }
        // Regular properties
        else {
          properties[key] = String(value);
        }
      });
    } else {
      // Primitive data
      properties.value = String(payload);
    }

    const node = {
      id: nodeId,
      name,
      properties,
      level,
      parentId,
      children: children.map(c => c.id),
      childNodes: children,
    };

    // Add to tree
    tree.nodes.push(node);
    
    // Track level
    if (!tree.levels.has(level)) {
      tree.levels.set(level, []);
    }
    tree.levels.get(level).push(node);

    // Add edge from parent
    if (parentId !== null) {
      tree.edges.push({
        id: `edge-${parentId}-${nodeId}`,
        source: parentId,
        target: nodeId,
      });
    }

    return node;
  }

  // Start building from root
  // Check if the root has a 'name' property (flat structure) or is wrapped (nested structure)
  if (yamlData.name && (yamlData.children || yamlData.nodes || yamlData.properties || Object.keys(yamlData).length > 1)) {
    // Flat structure: properties and children/nodes at root level
    // e.g., { name: "...", utam: "...", children: [...] } or { name: "...", nodes: [...] }
    createNode(yamlData, yamlData.name, 0, null);
  } else if (typeof yamlData === 'object' && !Array.isArray(yamlData)) {
    // Wrapped structure: { SomeKey: { properties... } }
    const rootName = Object.keys(yamlData)[0] || "Root";
    const rootData = yamlData[rootName];
    
    if (typeof rootData === 'object' && rootData !== null) {
      createNode(rootData, rootName, 0, null);
    } else {
      // Simple key-value at root
      createNode(yamlData, rootName, 0, null);
    }
  } else {
    // Fallback: treat as simple data
    createNode(yamlData, "Root", 0, null);
  }

  return tree;
}

/**
 * Calculate node positions using improved algorithm
 */
export function calculateNodePositions(tree) {
  const HORIZONTAL_SPACING = 400; // Space between levels
  const VERTICAL_BASE_SPACING = 120; // Base vertical spacing
  
  const positionedNodes = [];
  const nodeMap = new Map();
  
  // Create node lookup map
  tree.nodes.forEach(node => {
    nodeMap.set(node.id, node);
  });

  // Calculate vertical positions for each level
  const levelHeights = new Map();
  tree.levels.forEach((nodes, level) => {
    let totalHeight = 0;
    nodes.forEach(node => {
      const propCount = Object.keys(node.properties || {}).length;
      const nodeHeight = 40 + propCount * 22;
      totalHeight += nodeHeight + VERTICAL_BASE_SPACING;
    });
    levelHeights.set(level, totalHeight);
  });

  // Position nodes level by level
  tree.levels.forEach((nodes, level) => {
    const levelHeight = levelHeights.get(level);
    let currentY = -levelHeight / 2;

    nodes.forEach((node) => {
      const propCount = Object.keys(node.properties || {}).length;
      const nodeHeight = 40 + propCount * 22;
      
      // Calculate position
      const x = level * HORIZONTAL_SPACING + 100; // Add initial offset
      
      // For child nodes, try to center them around their parent
      if (node.parentId) {
        const parent = nodeMap.get(node.parentId);
        const siblings = nodes.filter(n => n.parentId === node.parentId);
        const siblingIndex = siblings.indexOf(node);
        
        if (parent && parent.y !== undefined) {
          // Center children around parent
          const totalSiblings = siblings.length;
          const siblingOffset = (siblingIndex - (totalSiblings - 1) / 2) * (nodeHeight + VERTICAL_BASE_SPACING);
          currentY = parent.y + siblingOffset - nodeHeight / 2;
        }
      }

      positionedNodes.push({
        ...node,
        x,
        y: currentY + nodeHeight / 2,
        width: Math.max(200, Math.min(
          Object.entries(node.properties || {}).reduce((max, [k, v]) => 
            Math.max(max, `${k}: ${v}`.length * 8), 0
          ) + 40,
          450
        )),
        height: nodeHeight,
      });

      currentY += nodeHeight + VERTICAL_BASE_SPACING;
    });
  });

  return positionedNodes;
}

/**
 * Convert tree to D3 hierarchy format
 */
export function convertToD3Hierarchy(tree) {
  const nodeMap = new Map();
  
  // Create nodes map
  tree.nodes.forEach(node => {
    nodeMap.set(node.id, {
      name: node.name,
      properties: node.properties,
      children: [],
      _metadata: {
        id: node.id,
        level: node.level,
      }
    });
  });

  // Build hierarchy
  tree.nodes.forEach(node => {
    if (node.parentId) {
      const parent = nodeMap.get(node.parentId);
      const child = nodeMap.get(node.id);
      if (parent && child) {
        parent.children.push(child);
      }
    }
  });

  // Return root node
  const rootNode = tree.nodes.find(n => n.parentId === null);
  return rootNode ? nodeMap.get(rootNode.id) : null;
}

