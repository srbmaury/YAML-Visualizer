import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import DiffVisualization from '../components/DiffVisualization';
import DiffComputer from '../utils/diffComputer';
import apiService from '../services/apiService';
import './DiffComparePage.css';
import { useTheme } from '../hooks/useTheme';

const DiffComparePage = ({ isAuthenticated }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { darkMode, toggleDarkMode } = useTheme();
  const [leftYaml, setLeftYaml] = useState('');
  const [rightYaml, setRightYaml] = useState('');
  const [diffResult, setDiffResult] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [viewMode, setViewMode] = useState('side-by-side'); // 'side-by-side' or 'unified'
  const [showLineNumbers] = useState(true);
  const [availableGraphs, setAvailableGraphs] = useState([]);
  const [versionOptionsByFile, setVersionOptionsByFile] = useState({});
  const [loadingGraphs, setLoadingGraphs] = useState(false);
  const [loadingSource, setLoadingSource] = useState({ left: false, right: false });
  const [sourceError, setSourceError] = useState('');
  const [leftSource, setLeftSource] = useState({ mode: 'manual', graphId: '', versionNumber: '' });
  const [rightSource, setRightSource] = useState({ mode: 'manual', graphId: '', versionNumber: '' });
  const incomingEditorYaml = typeof location.state?.yamlContent === 'string' ? location.state.yamlContent : '';
  const incomingEditorName = location.state?.fileName || 'Current Editor';
  const hasIncomingEditorYaml = !!incomingEditorYaml;
  const leftEditorRef = useRef(null);
  const rightEditorRef = useRef(null);
  const syncSourceRef = useRef(null);
  const syncRafRef = useRef(null);

  // Handle logout redirect
  useEffect(() => {
    if (isAuthenticated === false) {
      navigate('/', { replace: true });
    }
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    const loadGraphs = async () => {
      if (!isAuthenticated) return;

      setLoadingGraphs(true);
      setSourceError('');
      try {
        const [ownedResponse, sharedResponse] = await Promise.all([
          apiService.getMyYamlFiles({ limit: 100 }),
          apiService.getSharedWithMeYamlFiles({ limit: 100 }),
        ]);

        const owned = (ownedResponse?.yamlFiles || []).map((file) => ({
          id: file._id,
          title: file.title,
          scope: 'owned',
          ownerName: null,
        }));

        const shared = (sharedResponse?.yamlFiles || []).map((file) => ({
          id: file._id,
          title: file.title,
          scope: 'shared',
          ownerName: file.owner?.username || file.owner?.email || null,
        }));

        setAvailableGraphs([...owned, ...shared]);
      } catch {
        setSourceError('Failed to load saved graphs for selection');
      } finally {
        setLoadingGraphs(false);
      }
    };

    loadGraphs();
  }, [isAuthenticated]);

  useEffect(() => {
    return () => {
      if (syncRafRef.current) {
        cancelAnimationFrame(syncRafRef.current);
        syncRafRef.current = null;
      }
    };
  }, []);

  const setPaneLoading = (side, loading) => {
    setLoadingSource((prev) => ({ ...prev, [side]: loading }));
  };

  const setPaneYaml = (side, content) => {
    if (side === 'left') {
      setLeftYaml(content);
    } else {
      setRightYaml(content);
    }
  };

  const applyIncomingEditorToPane = (side) => {
    if (!hasIncomingEditorYaml) return;
    setPaneYaml(side, incomingEditorYaml);
    if (side === 'left') {
      setLeftSource({ mode: 'manual', graphId: '', versionNumber: '' });
    } else {
      setRightSource({ mode: 'manual', graphId: '', versionNumber: '' });
    }
  };

  const handleEditorScroll = (side, event) => {
    const source = event.target;
    const target = side === 'left' ? rightEditorRef.current : leftEditorRef.current;

    if (!target) return;
    if (syncSourceRef.current && syncSourceRef.current !== side) return;

    syncSourceRef.current = side;

    if (syncRafRef.current) {
      cancelAnimationFrame(syncRafRef.current);
    }

    const nextTop = source.scrollTop;
    const nextLeft = source.scrollLeft;

    syncRafRef.current = requestAnimationFrame(() => {
      target.scrollTop = nextTop;
      target.scrollLeft = nextLeft;
      syncSourceRef.current = null;
      syncRafRef.current = null;
    });
  };

  const getVersionsForFile = async (fileId) => {
    if (!fileId) return [];
    if (versionOptionsByFile[fileId]) return versionOptionsByFile[fileId];

    const response = await apiService.getVersionHistory(fileId, {
      limit: 100,
      includeDeltas: false,
    });
    const versions = response?.versions || [];
    setVersionOptionsByFile((prev) => ({ ...prev, [fileId]: versions }));
    return versions;
  };

  const loadLatestGraphContent = async (side, fileId) => {
    if (!fileId) return;
    setPaneLoading(side, true);
    setSourceError('');
    try {
      const response = await apiService.getYamlFile(fileId);
      setPaneYaml(side, response?.yamlFile?.content || '');
    } catch {
      setSourceError('Failed to load selected graph content');
    } finally {
      setPaneLoading(side, false);
    }
  };

  const loadVersionContent = async (side, fileId, versionNumber) => {
    if (!fileId || !versionNumber) return;
    setPaneLoading(side, true);
    setSourceError('');
    try {
      const response = await apiService.getVersion(fileId, versionNumber);
      setPaneYaml(side, response?.content || '');
    } catch {
      setSourceError('Failed to load selected version content');
    } finally {
      setPaneLoading(side, false);
    }
  };

  const handleModeChange = async (side, mode) => {
    const source = side === 'left' ? leftSource : rightSource;
    const setSource = side === 'left' ? setLeftSource : setRightSource;
    const defaultGraphId = source.graphId || availableGraphs[0]?.id || '';

    if (mode === 'manual') {
      setSource((prev) => ({ ...prev, mode }));
      return;
    }

    setSource((prev) => ({ ...prev, mode, graphId: defaultGraphId, versionNumber: '' }));

    if (!defaultGraphId) return;

    if (mode === 'saved') {
      await loadLatestGraphContent(side, defaultGraphId);
      return;
    }

    const versions = await getVersionsForFile(defaultGraphId);
    const latestVersion = versions[0]?.version;
    if (!latestVersion) return;

    setSource((prev) => ({ ...prev, mode, graphId: defaultGraphId, versionNumber: String(latestVersion) }));
    await loadVersionContent(side, defaultGraphId, latestVersion);
  };

  const handleGraphChange = async (side, graphId) => {
    const source = side === 'left' ? leftSource : rightSource;
    const setSource = side === 'left' ? setLeftSource : setRightSource;

    setSource((prev) => ({ ...prev, graphId, versionNumber: '' }));
    if (!graphId || source.mode === 'manual') return;

    if (source.mode === 'saved') {
      await loadLatestGraphContent(side, graphId);
      return;
    }

    const versions = await getVersionsForFile(graphId);
    const latestVersion = versions[0]?.version;
    if (!latestVersion) return;

    setSource((prev) => ({ ...prev, versionNumber: String(latestVersion) }));
    await loadVersionContent(side, graphId, latestVersion);
  };

  const handleVersionChange = async (side, versionNumber) => {
    const source = side === 'left' ? leftSource : rightSource;
    const setSource = side === 'left' ? setLeftSource : setRightSource;

    setSource((prev) => ({ ...prev, versionNumber }));
    if (!source.graphId || !versionNumber) return;

    await loadVersionContent(side, source.graphId, parseInt(versionNumber, 10));
  };

  const getGraphLabel = (graph) => {
    if (graph.scope === 'owned') {
      return `${graph.title} (Owned)`;
    }
    return `${graph.title} (Shared${graph.ownerName ? ` by ${graph.ownerName}` : ''})`;
  };

  const handleCompare = () => {
    if (!leftYaml.trim() && !rightYaml.trim()) {
      return;
    }

    setIsComparing(true);

    // Use improved diff computation
    const leftLines = leftYaml.split('\n');
    const rightLines = rightYaml.split('\n');

    const diff = DiffComputer.computeLineDiff(leftLines, rightLines);
    setDiffResult(diff);
    setIsComparing(false);
  };

  const handleClear = () => {
    setLeftYaml('');
    setRightYaml('');
    setDiffResult(null);
  };

  const handleSwap = () => {
    const temp = leftYaml;
    setLeftYaml(rightYaml);
    setRightYaml(temp);
    if (diffResult) {
      handleCompare();
    }
  };

  const handlePasteLeft = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLeftYaml(text);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const handlePasteRight = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setRightYaml(text);
    } catch (err) {
      console.error('Failed to read clipboard:', err);
    }
  };

  const handleCopyDiff = async () => {
    if (!diffResult) return;

    try {
      const diffText = DiffComputer.generateUnifiedDiff(diffResult, 'Original YAML', 'Modified YAML');
      await navigator.clipboard.writeText(diffText);
    } catch (err) {
      console.error('Failed to copy diff:', err);
    }
  };

  return (
    <div className="yaml-diff-compare-page">
      <div className="yaml-diff-header-section">
        <div className="yaml-diff-title-container">
          <button
            className="yaml-diff-back-btn"
            onClick={() => navigate('/')}
            title="Back to Editor"
          >
            ← Back to Editor
          </button>
          <button className="yaml-diff-back-btn" onClick={toggleDarkMode} title="Toggle dark mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
          <h1 className="yaml-diff-main-title">🔍 YAML Diff Compare</h1>
          <p className="yaml-diff-subtitle">Compare two YAML files side by side to see differences</p>
        </div>

        <div className="yaml-diff-controls-container">
          <div className="yaml-diff-view-controls">
            <button
              className={`yaml-diff-view-toggle ${viewMode === 'side-by-side' ? 'yaml-diff-active' : ''}`}
              onClick={() => setViewMode('side-by-side')}
            >
              Side by Side
            </button>
            <button
              className={`yaml-diff-view-toggle ${viewMode === 'unified' ? 'yaml-diff-active' : ''}`}
              onClick={() => setViewMode('unified')}
            >
              Unified
            </button>
          </div>

          <div className="yaml-diff-action-controls">
            <button
              className="yaml-diff-btn yaml-diff-btn-secondary"
              onClick={handleSwap}
              title="Swap left and right content"
            >
              ⇄ Swap
            </button>
            <button
              className="yaml-diff-btn yaml-diff-btn-secondary"
              onClick={handleClear}
              title="Clear all content"
            >
              🗑️ Clear
            </button>
            <button
              className="yaml-diff-btn yaml-diff-btn-primary"
              onClick={handleCompare}
              disabled={isComparing || (!leftYaml.trim() && !rightYaml.trim())}
            >
              {isComparing ? '⏳ Comparing...' : '🔍 Compare'}
            </button>
          </div>
        </div>
        {hasIncomingEditorYaml && (
          <div className="yaml-diff-current-source-row">
            <span className="yaml-diff-current-source-label">Source: {incomingEditorName}</span>
            <button
              className="yaml-diff-btn yaml-diff-btn-secondary"
              onClick={() => applyIncomingEditorToPane('left')}
              title="Load current editor YAML into left pane"
            >
              ⬅ Use in Left
            </button>
            <button
              className="yaml-diff-btn yaml-diff-btn-secondary"
              onClick={() => applyIncomingEditorToPane('right')}
              title="Load current editor YAML into right pane"
            >
              Use in Right ➡
            </button>
          </div>
        )}
        {sourceError && <div className="yaml-diff-source-error">⚠️ {sourceError}</div>}
      </div>

      <div className="yaml-diff-content-area">
        {viewMode === 'side-by-side' ? (
          <div className="yaml-diff-side-by-side-workspace">
            <div className={`yaml-diff-editors-container ${diffResult ? 'yaml-diff-editors-container-with-result' : ''}`}>
              <div className="yaml-diff-editor-panel">
                <div className="yaml-diff-editor-header">
                  <div className="yaml-diff-editor-title-block">
                    <span className="yaml-diff-editor-label">Original YAML</span>
                    {loadingSource.left && <span className="yaml-diff-loading-chip">Loading…</span>}
                  </div>
                  <div className="yaml-diff-editor-source-controls">
                    <select
                      className="yaml-diff-source-select"
                      value={leftSource.mode}
                      onChange={(e) => handleModeChange('left', e.target.value)}
                    >
                      <option value="manual">Manual</option>
                      <option value="saved">Saved Graph (Latest)</option>
                      <option value="version">Graph Version</option>
                    </select>

                    <select
                      className="yaml-diff-source-select"
                      value={leftSource.graphId}
                      onChange={(e) => handleGraphChange('left', e.target.value)}
                      disabled={leftSource.mode === 'manual' || loadingGraphs}
                    >
                      <option value="">Select graph</option>
                      {availableGraphs.map((graph) => (
                        <option key={graph.id} value={graph.id}>
                          {getGraphLabel(graph)}
                        </option>
                      ))}
                    </select>

                    {leftSource.mode === 'version' && (
                      <select
                        className="yaml-diff-source-select"
                        value={leftSource.versionNumber}
                        onChange={(e) => handleVersionChange('left', e.target.value)}
                        disabled={!leftSource.graphId}
                      >
                        <option value="">Select version</option>
                        {(versionOptionsByFile[leftSource.graphId] || []).map((version) => (
                          <option key={version.version} value={version.version}>
                            v{version.version} · {version.changeMetadata?.summary || 'No description'}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      className="yaml-diff-paste-btn"
                      onClick={handlePasteLeft}
                      title="Paste from clipboard"
                    >
                      📋 Paste
                    </button>
                  </div>
                </div>
                <div className="yaml-diff-plain-editor-wrap">
                  <textarea
                    ref={leftEditorRef}
                    className="yaml-diff-plain-editor"
                    value={leftYaml}
                    onChange={(e) => setLeftYaml(e.target.value)}
                    onScroll={(e) => handleEditorScroll('left', e)}
                    wrap="off"
                    placeholder="Paste or load original YAML..."
                    spellCheck={false}
                  />
                  <div className="yaml-diff-plain-editor-stats">{leftYaml.split('\n').length} lines · {leftYaml.length} chars</div>
                </div>
              </div>

              <div className="yaml-diff-editor-panel">
                <div className="yaml-diff-editor-header">
                  <div className="yaml-diff-editor-title-block">
                    <span className="yaml-diff-editor-label">Modified YAML</span>
                    {loadingSource.right && <span className="yaml-diff-loading-chip">Loading…</span>}
                  </div>
                  <div className="yaml-diff-editor-source-controls">
                    <select
                      className="yaml-diff-source-select"
                      value={rightSource.mode}
                      onChange={(e) => handleModeChange('right', e.target.value)}
                    >
                      <option value="manual">Manual</option>
                      <option value="saved">Saved Graph (Latest)</option>
                      <option value="version">Graph Version</option>
                    </select>

                    <select
                      className="yaml-diff-source-select"
                      value={rightSource.graphId}
                      onChange={(e) => handleGraphChange('right', e.target.value)}
                      disabled={rightSource.mode === 'manual' || loadingGraphs}
                    >
                      <option value="">Select graph</option>
                      {availableGraphs.map((graph) => (
                        <option key={graph.id} value={graph.id}>
                          {getGraphLabel(graph)}
                        </option>
                      ))}
                    </select>

                    {rightSource.mode === 'version' && (
                      <select
                        className="yaml-diff-source-select"
                        value={rightSource.versionNumber}
                        onChange={(e) => handleVersionChange('right', e.target.value)}
                        disabled={!rightSource.graphId}
                      >
                        <option value="">Select version</option>
                        {(versionOptionsByFile[rightSource.graphId] || []).map((version) => (
                          <option key={version.version} value={version.version}>
                            v{version.version} · {version.changeMetadata?.summary || 'No description'}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      className="yaml-diff-paste-btn"
                      onClick={handlePasteRight}
                      title="Paste from clipboard"
                    >
                      📋 Paste
                    </button>
                  </div>
                </div>
                <div className="yaml-diff-plain-editor-wrap">
                  <textarea
                    ref={rightEditorRef}
                    className="yaml-diff-plain-editor"
                    value={rightYaml}
                    onChange={(e) => setRightYaml(e.target.value)}
                    onScroll={(e) => handleEditorScroll('right', e)}
                    wrap="off"
                    placeholder="Paste or load modified YAML..."
                    spellCheck={false}
                  />
                  <div className="yaml-diff-plain-editor-stats">{rightYaml.split('\n').length} lines · {rightYaml.length} chars</div>
                </div>
              </div>
            </div>

            <div className="yaml-diff-side-result-panel">
              <div className="yaml-diff-side-result-header">Diff Indicators (Side-by-Side)</div>
              <DiffVisualization
                diffResult={diffResult}
                viewMode="side-by-side"
                showLineNumbers={showLineNumbers}
              />
            </div>
          </div>
        ) : (
          <div className="yaml-diff-unified-view">
            <DiffVisualization
              diffResult={diffResult}
              viewMode={viewMode}
              showLineNumbers={showLineNumbers}
            />
          </div>
        )}

        {diffResult && (
          <div className="yaml-diff-summary-section">
            <div className="yaml-diff-summary-stats">
              <span className="yaml-diff-stat yaml-diff-stat-added">
                +{diffResult.filter(line => line.type === 'insert').length} additions
              </span>
              <span className="yaml-diff-stat yaml-diff-stat-deleted">
                -{diffResult.filter(line => line.type === 'delete').length} deletions
              </span>
              <span className="yaml-diff-stat yaml-diff-stat-modified">
                ~{diffResult.filter(line => line.type === 'modify').length} modifications
              </span>
            </div>
            <button
              className="yaml-diff-copy-btn"
              onClick={handleCopyDiff}
              title="Copy diff to clipboard"
            >
              📋 Copy Diff
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiffComparePage;