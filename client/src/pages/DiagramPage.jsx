import React, { useEffect, useLayoutEffect, useState, useRef, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import DiagramViewer from "../components/DiagramViewer";
import DiagramTimeTravel from "../components/DiagramTimeTravel";
import GitHubIntegrationModal from "../components/GitHubIntegrationModal";
import { useYamlFile } from "../hooks/useYamlFile";
import { useTheme } from "../hooks/useTheme";
import { buildTreeFromYAML, convertToD3Hierarchy } from "../utils/treeBuilder";
import { getSocket, joinFileRoom, leaveFileRoom } from "../services/socket";
import apiService from "../services/apiService";
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
  const [showGitHubModal, setShowGitHubModal] = useState(false);
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
          // Do not call setLoading here — it triggers the full-page loading branch and
          // unmounts DiagramTimeTravel + DiagramViewer, which breaks time travel.
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
        }
      }
    };
  }, []);
  const previousAuthState = useRef(isAuthenticated);
  /** Last seen GitHub integration `lastSyncedAt` (ms). Drives refetch when modal “time” moves. */
  const lastGithubSyncMsRef = useRef(null);
  /** Bump so DiagramTimeTravel reloads version list after GitHub sync / remote YAML update. */
  const [versionHistoryRefreshKey, setVersionHistoryRefreshKey] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const diagramContainerRef = useRef(null);
  const diagramChromeRef = useRef(null);

  useLayoutEffect(() => {
    const chrome = diagramChromeRef.current;
    const container = diagramContainerRef.current;
    if (!chrome || !container) return;

    const syncChromeHeight = () => {
      const h = Math.ceil(chrome.getBoundingClientRect().height);
      container.style.setProperty("--diagram-chrome-height", `${h}px`);
    };

    syncChromeHeight();
    const ro = new ResizeObserver(syncChromeHeight);
    ro.observe(chrome);
    window.addEventListener("resize", syncChromeHeight);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncChromeHeight);
    };
  }, [treeInfo, currentFileId]);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setMobileNavOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

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

  // Poll GitHub integration `lastSyncedAt` (also covers Socket.IO misses: CORS, URL, reconnect).
  // When it advances, reload YAML from API so the graph matches DB.
  useEffect(() => {
    if (!currentFileId || !isAuthenticated) return;

    let cancelled = false;

    const pollIntegration = async () => {
      try {
        const data = await apiService.getGithubIntegration(currentFileId);
        if (cancelled) return;
        const iso = data?.integration?.lastSyncedAt;
        if (!iso) return;
        const ms = new Date(iso).getTime();
        if (lastGithubSyncMsRef.current != null && ms > lastGithubSyncMsRef.current) {
          const { yamlFile } = await apiService.getYamlFile(currentFileId);
          if (yamlFile?.content != null) {
            setYamlText(yamlFile.content);
            setVersionHistoryRefreshKey((k) => k + 1);
          }
        }
        lastGithubSyncMsRef.current = ms;
      } catch {
        lastGithubSyncMsRef.current = null;
      }
    };

    const interval = setInterval(pollIntegration, 4000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') pollIntegration();
    };
    document.addEventListener('visibilitychange', onVisible);
    pollIntegration();

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [currentFileId, isAuthenticated]);

  // WebSocket: re-join on every connect (rooms drop on disconnect); updates flow yamlText → graph.
  useEffect(() => {
    if (!currentFileId) return;

    const socket = getSocket();

    const handleGitHubSync = ({ content }) => {
      if (content != null && String(content).length) {
        setYamlText(content);
        setVersionHistoryRefreshKey((k) => k + 1);
      }
    };

    const onCollabError = (payload) => {
      console.warn('Socket room join failed (diagram will still poll for updates):', payload?.message || payload);
    };

    const rejoinRoom = () => {
      joinFileRoom(currentFileId);
    };

    socket.on('github-sync', handleGitHubSync);
    socket.on('collab-error', onCollabError);
    socket.on('connect', rejoinRoom);
    rejoinRoom();

    return () => {
      socket.off('github-sync', handleGitHubSync);
      socket.off('collab-error', onCollabError);
      socket.off('connect', rejoinRoom);
      leaveFileRoom(currentFileId);
    };
  }, [currentFileId]);

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

  const goEditor = () => {
    if (currentFileId) navigate(`/editor/${currentFileId}`);
    else navigate("/");
  };
  const goCombined = () => {
    if (currentFileId) navigate(`/combined/${currentFileId}`);
    else navigate("/combined");
  };

  return (
    <div
      className={`diagram-container diagram-page--minimal${mobileNavOpen ? " diagram-mobile-nav-open" : ""}`}
      ref={diagramContainerRef}
    >
      <div className="diagram-page-chrome" ref={diagramChromeRef}>
      <div className="diagram-header">
        <button
          type="button"
          className="diagram-hamburger diagram-mobile-only"
          aria-expanded={mobileNavOpen}
          aria-controls="diagram-mobile-nav"
          aria-label={mobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
          onClick={() => setMobileNavOpen((open) => !open)}
        >
          <span className="diagram-hamburger-icon" aria-hidden>☰</span>
        </button>

        <div className="diagram-header-toolbar">
          <div className="diagram-header-actions diagram-desktop-only">
            <button className="back-btn" onClick={goEditor}>
              ← Back to Editor
            </button>
            <button className="combined-btn" onClick={goCombined}>
              🔗 Combined View
            </button>
            <button
              className="back-btn"
              onClick={toggleDarkMode}
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? "☀️" : "🌙"}
            </button>
            {currentFileId && isAuthenticated && (
              <button
                className="back-btn"
                onClick={() => setShowGitHubModal(true)}
                title="GitHub Integration"
              >
                🐙 GitHub Sync
              </button>
            )}
          </div>
          {currentFileId && (
            <DiagramTimeTravel
              fileId={currentFileId}
              onVersionChange={handleTimeTravel}
              refreshKey={versionHistoryRefreshKey}
              variant="inline"
            />
          )}
        </div>
        <h2 className="diagram-page-title">Interactive Diagram View</h2>
        <div className="hint diagram-desktop-only diagram-page-hint">
          💡 Scroll to zoom • Drag to pan • Click nodes to expand/collapse
        </div>
        <div className="hint diagram-mobile-only diagram-page-hint diagram-page-hint-mobile">
          💡 Scroll to zoom • Drag to pan • Tap nodes to expand/collapse
        </div>
      </div>
      </div>

      <div className="diagram-main">
        <DiagramViewer data={parsedData} treeInfo={treeInfo} treeData={treeData} />
      </div>

      {/* After page chrome in DOM so overlay/drawer paint above diagram-main (z-order) */}
      {mobileNavOpen && (
        <>
          <div
            className="diagram-mobile-overlay"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden
          />
          <nav id="diagram-mobile-nav" className="diagram-mobile-drawer">
            <div className="diagram-mobile-drawer-header">
              <span>Menu</span>
              <button
                type="button"
                className="diagram-mobile-drawer-close"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="diagram-mobile-drawer-body">
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  goEditor();
                  setMobileNavOpen(false);
                }}
              >
                ← Back to Editor
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  goCombined();
                  setMobileNavOpen(false);
                }}
              >
                🔗 Combined View
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  toggleDarkMode();
                }}
              >
                {darkMode ? "☀️ Light mode" : "🌙 Dark mode"}
              </button>
              {currentFileId && isAuthenticated && (
                <button
                  type="button"
                  className="diagram-mobile-nav-btn"
                  onClick={() => {
                    setShowGitHubModal(true);
                    setMobileNavOpen(false);
                  }}
                >
                  🐙 GitHub Sync
                </button>
              )}
            </div>
          </nav>
        </>
      )}

      {/* GitHub Integration Modal */}
      {currentFileId && (
        <GitHubIntegrationModal
          isOpen={showGitHubModal}
          onClose={() => setShowGitHubModal(false)}
          fileId={currentFileId}
        />
      )}
    </div>
  );
}