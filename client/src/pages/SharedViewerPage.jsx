import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import YamlEditor from "../components/YamlEditor";
import DiagramViewer from "../components/DiagramViewer";
import SearchPanel from "../components/SearchPanel";
import yaml from "js-yaml";
import { buildTreeFromYAML, convertToD3Hierarchy } from "../utils/treeBuilder";
import { validateYAML } from "../utils/yamlValidator";
import { useTheme } from "../hooks/useTheme";
import "./CombinedEditor.css";

export default function SharedViewerPage({
  yamlText,
  error
}) {
  const navigate = useNavigate();
  const { darkMode, toggleDarkMode } = useTheme();
  const [parsedData, setParsedData] = useState(null);
  const [treeInfo, setTreeInfo] = useState(null);
  const [localError, setLocalError] = useState("");
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  // Listen for search results from DiagramViewer via custom events
  useEffect(() => {
    const handleSearchComplete = (event) => {
      const { results, currentIndex } = event.detail;
      setSearchResults(results);
      setCurrentSearchIndex(currentIndex);
    };

    const handleNavigationComplete = (event) => {
      const { currentIndex } = event.detail;
      setCurrentSearchIndex(currentIndex);
    };

    window.addEventListener('diagramSearchComplete', handleSearchComplete);
    window.addEventListener('diagramNavigationComplete', handleNavigationComplete);

    return () => {
      window.removeEventListener('diagramSearchComplete', handleSearchComplete);
      window.removeEventListener('diagramNavigationComplete', handleNavigationComplete);
    };
  }, []);

  // Note: Mobile redirect is now handled in SharedViewerWrapper
  // This component will only render for desktop users

  // Search handler - calls DiagramViewer's global search function
  const handleSearch = useCallback((term) => {
    if (!term || !term.trim()) {
      // Clear results immediately for empty search
      setSearchResults([]);
      setCurrentSearchIndex(0);
    }

    // Call DiagramViewer's search function (will dispatch event with results)
    if (window.combinedEditorDiagramSearch) {
      window.combinedEditorDiagramSearch(term);
    }
  }, []);

  // Navigation handler - calls DiagramViewer's global navigate function
  const handleSearchNavigation = useCallback((direction) => {
    // Call DiagramViewer's navigate function (will dispatch event with new index)
    if (window.combinedEditorDiagramNavigate) {
      window.combinedEditorDiagramNavigate(direction);
    }
  }, []);

  // Auto-visualize when YAML changes
  useEffect(() => {
    if (yamlText) {
      try {
        const result = validateYAML(yamlText);
        if (result.valid) {
          const parsedData = yaml.load(yamlText);
          const treeData = buildTreeFromYAML(parsedData);
          const d3Data = convertToD3Hierarchy(treeData);
          setParsedData(d3Data);
          setTreeInfo(treeData.treeInfo);
          setLocalError("");
        } else {
          const errorMessages = result.issues ? result.issues.map(issue => issue.message) : ["YAML validation failed"];
          setLocalError(errorMessages.join(", "));
          setParsedData(null);
          setTreeInfo(null);
        }
      } catch (error) {
        setLocalError(error.message);
        setParsedData(null);
        setTreeInfo(null);
      }
    }
  }, [yamlText]);

  // Handle resizer drag
  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    document.body.classList.add('dragging');
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;

    const containerWidth = window.innerWidth;
    const newLeftWidth = (e.clientX / containerWidth) * 100;

    // Constrain between 20% and 80%
    if (newLeftWidth >= 20 && newLeftWidth <= 80) {
      setLeftWidth(newLeftWidth);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    document.body.classList.remove('dragging');
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  return (
    <div className="simple-combined-editor">
      {/* Minimal Header for Shared View */}
      <div className="simple-header">
        <div className="header-left">
          <button className="back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <button className="back-btn" onClick={toggleDarkMode} title="Toggle dark mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
          <h1>Shared YAML Viewer</h1>
          {treeInfo && (
            <span className="tree-info">
              {treeInfo.totalNodes} nodes • {treeInfo.maxDepth + 1} levels
            </span>
          )}
        </div>

        <div className="header-actions">
          <div className="right-controls">
            <span className="shared-badge">📤 Shared Content</span>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {(error || localError) && (
        <div className="error-banner">
          ⚠️ {error || localError}
        </div>
      )}

      {/* Main Split View */}
      <div className="split-container">
        {/* Left Panel - Read-only Editor */}
        <div
          className="left-panel"
          style={{ width: `${leftWidth}%` }}
        >
          <YamlEditor
            value={yamlText}
            onChange={() => { }} // Read-only for shared view
            error={error || localError}
            readOnly={true}
          />
        </div>

        {/* Resizer */}
        <div
          className="resizer"
          onMouseDown={handleMouseDown}
        />

        {/* Right Panel - Visualization */}
        <div
          className="right-panel"
          style={{ width: `${100 - leftWidth}%` }}
        >
          <div className="right-panel-container">
            {/* Diagram Area */}
            <div className="diagram-area">
              {/* Search Panel positioned within diagram area */}
              <div className="search-panel-container">
                <SearchPanel
                  onSearch={handleSearch}
                  searchResults={searchResults}
                  currentIndex={currentSearchIndex}
                  onNavigate={handleSearchNavigation}
                />
              </div>
              <div className="diagram-content">
                {parsedData ? (
                  <DiagramViewer
                    data={parsedData}
                    treeInfo={treeInfo}
                    hideSearch={true}
                  />
                ) : (
                  <div className="diagram-placeholder">
                    <div className="placeholder-content">
                      <div className="placeholder-icon">📊</div>
                      <h3>No Visualization Available</h3>
                      <p>
                        {yamlText ?
                          "YAML content has errors - cannot display visualization" :
                          "No YAML content to display"
                        }
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}