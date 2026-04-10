import React, { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DiagramViewer from "../components/DiagramViewer";
import DiagramTimeTravel from "../components/DiagramTimeTravel";
import { useYamlFile } from "../hooks/useYamlFile";
import { useTheme } from "../hooks/useTheme";
import { buildTreeFromYAML, convertToD3Hierarchy } from "../utils/treeBuilder";
import yaml from "js-yaml";

export default function DiagramPage({ parsedData: propParsedData, treeInfo: propTreeInfo, treeData: propTreeData, isAuthenticated }) {
  const navigate = useNavigate();
  const { id: currentFileId } = useParams(); // Get current file ID from URL
  const { darkMode, toggleDarkMode } = useTheme();
  const [parsedData, setParsedData] = useState(propParsedData);
  const [treeInfo, setTreeInfo] = useState(propTreeInfo);
  const [treeData, setTreeData] = useState(propTreeData);
  const [loading, setLoading] = useState(false);
  const [yamlText, setYamlText] = useState("");
  // For time travel (removed unused selectedVersion)
  // Handler for DiagramTimeTravel
  const handleTimeTravel = useMemo(() => {
    let lastVersion = null;
    let lastYaml = "";
    return (versionNumber, yamlContent) => {
      if (versionNumber === lastVersion && yamlContent === lastYaml) return;
      lastVersion = versionNumber;
      lastYaml = yamlContent;
      if (yamlContent && yamlContent.trim()) {
        try {
          setLoading(true);
          const yamlData = yaml.load(yamlContent);
          const tree = buildTreeFromYAML(yamlData);
          const hierarchical = convertToD3Hierarchy(tree);
          const info = {
            totalNodes: tree.nodes.length,
            totalEdges: tree.edges.length,
            maxDepth: Math.max(...tree.nodes.map(n => n.level)),
            nodesPerLevel: Array.from(tree.levels.entries()).map(([level, nodes]) => ({
              level,
              count: nodes.length,
              nodes: nodes.map(n => n.name),
            })),
          };
          setParsedData(hierarchical);
          setTreeInfo(info);
          setTreeData(tree);
        } catch (error) {
          console.error("Error processing time travel YAML:", error);
        } finally {
          setLoading(false);
        }
      }
    };
  }, []);
  const previousAuthState = useRef(isAuthenticated);

  // Use the custom hook to load YAML file by ID if present in URL
  const { loading: fileLoading, error: fileError, fileData } = useYamlFile(setYamlText, isAuthenticated);

  // Redirect to home if invalid ID error
  useEffect(() => {
    if (fileError && fileError.includes('Invalid file ID format')) {
      navigate('/', { replace: true });
    }
  }, [fileError, navigate]);

  // Redirect to remove file ID from URL when user logs out
  useEffect(() => {
    // Only redirect if user was previously authenticated and now is not
    if (previousAuthState.current && !isAuthenticated && currentFileId) {
      navigate('/diagram', { replace: true });
    }
    previousAuthState.current = isAuthenticated;
  }, [isAuthenticated, currentFileId, navigate]);

  useEffect(() => {
    // If data is not provided via props, try to load from localStorage
    if (!parsedData || !treeInfo || !treeData) {
      setLoading(true);
      try {
        const saved = localStorage.getItem('yaml-diagram-data');
        if (saved) {
          const data = JSON.parse(saved);
          const savedYaml = data.yamlText;
          if (savedYaml && savedYaml.trim()) {
            // Parse YAML and generate diagram data
            const yamlData = yaml.load(savedYaml);
            const tree = buildTreeFromYAML(yamlData);
            const hierarchical = convertToD3Hierarchy(tree);

            const info = {
              totalNodes: tree.nodes.length,
              totalEdges: tree.edges.length,
              maxDepth: Math.max(...tree.nodes.map(n => n.level)),
              nodesPerLevel: Array.from(tree.levels.entries()).map(([level, nodes]) => ({
                level,
                count: nodes.length,
                nodes: nodes.map(n => n.name),
              })),
            };

            setParsedData(hierarchical);
            setTreeInfo(info);
            setTreeData(tree); // Store the raw tree data
          }
        }
        // Don't redirect if no data - just show "No Data Available" state
      } catch (error) {
        console.error("Error loading data from localStorage:", error);
        // Don't redirect on error - just show "No Data Available" state
      } finally {
        setLoading(false);
      }
    }
  }, [parsedData, treeInfo, treeData]);

  // Process YAML text when loaded via ID
  useEffect(() => {
    if (yamlText && yamlText.trim()) {
      try {
        setLoading(true);
        const yamlData = yaml.load(yamlText);
        const tree = buildTreeFromYAML(yamlData);
        const hierarchical = convertToD3Hierarchy(tree);

        const info = {
          totalNodes: tree.nodes.length,
          totalEdges: tree.edges.length,
          maxDepth: Math.max(...tree.nodes.map(n => n.level)),
          nodesPerLevel: Array.from(tree.levels.entries()).map(([level, nodes]) => ({
            level,
            count: nodes.length,
            nodes: nodes.map(n => n.name),
          })),
        };

        setParsedData(hierarchical);
        setTreeInfo(info);
        setTreeData(tree);
      } catch (error) {
        console.error("Error processing loaded YAML:", error);
      } finally {
        setLoading(false);
      }
    }
  }, [yamlText]); // Removed navigate dependency

  if (loading || fileLoading) {
    return (
      <div className="diagram-container">
        <div className="diagram-header">
          <h2>Loading Diagram...</h2>
          {fileLoading && (
            <div style={{ color: '#666', fontSize: '14px' }}>
              📄 Loading file...
            </div>
          )}
          {fileError && (
            <div style={{ color: '#d32f2f', fontSize: '14px' }}>
              ❌ Error loading file: {fileError}
            </div>
          )}
          {fileData && (
            <div style={{ color: '#2e7d32', fontSize: '14px' }}>
              📁 Loaded: {fileData.title}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px' }}>
          <div>⏳ {fileLoading ? 'Loading file...' : 'Loading diagram from saved data...'}</div>
        </div>
      </div>
    );
  }

  if (!parsedData || !treeInfo) {
    return (
      <div className="diagram-container">
        <div className="diagram-header">
          <button className="back-btn" onClick={() => {
            if (currentFileId) {
              navigate(`/editor/${currentFileId}`);
            } else {
              navigate("/");
            }
          }}>
            ← Back to Editor
          </button>
          <h2>No Data Available</h2>
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '200px', flexDirection: 'column', gap: '10px' }}>
          <div>No diagram data found. Please create a diagram first.</div>
          <button className="visualize-btn" onClick={() => {
            if (currentFileId) {
              navigate(`/editor/${currentFileId}`);
            } else {
              navigate("/");
            }
          }}>
            Go to Editor
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="diagram-container">
      <div className="diagram-header">
        <button className="back-btn" onClick={() => {
          if (currentFileId) {
            navigate(`/editor/${currentFileId}`);
          } else {
            navigate("/");
          }
        }}>
          ← Back to Editor
        </button>
        <button className="combined-btn" onClick={() => {
          if (currentFileId) {
            navigate(`/combined/${currentFileId}`);
          } else {
            navigate("/combined");
          }
        }}>
          🔗 Combined View
        </button>
        <button
          className="back-btn"
          onClick={toggleDarkMode}
          title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
        <h2>Interactive Diagram View</h2>
        <div className="hint">
          💡 Scroll to zoom • Drag to pan • Click nodes to expand/collapse
        </div>
        {/* Time Travel Timeline */}
        {currentFileId && (
          <DiagramTimeTravel fileId={currentFileId} onVersionChange={handleTimeTravel} />
        )}
      </div>

      {/* Second row: Tree Info only */}
      {treeInfo && (
        <div className="diagram-subheader">
          <div className="tree-info-centered">
            📊 Nodes: {treeInfo.totalNodes} | Levels: {treeInfo.maxDepth + 1} | Edges: {treeInfo.totalEdges}
          </div>
        </div>
      )}

      <DiagramViewer data={parsedData} treeInfo={treeInfo} treeData={treeData} />
    </div>
  );
}