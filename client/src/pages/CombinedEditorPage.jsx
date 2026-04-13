import React, { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";

import YamlEditor from "../components/YamlEditor";
import UserPermissionManager from "../components/UserPermissionManager";
import PresenceBar from "../components/PresenceBar";
import ShareModal from "../components/ShareModal";
import { fetchUsersByPrefix } from "../services/userService";
import DiagramViewer from "../components/DiagramViewer";
import SearchPanel from "../components/SearchPanel";
import { useYamlFile } from "../hooks/useYamlFile";
import { useDebounce } from "../hooks/useDebounce";
import { useCollaboration } from "../hooks/useCollaboration";
import yaml from "js-yaml";
import KeyboardShortcutsPanel from "../components/KeyboardShortcutsPanel";
import { useTheme } from "../hooks/useTheme";
import { buildTreeFromYAML, convertToD3Hierarchy } from "../utils/treeBuilder";
import { validateYAML } from "../utils/yamlValidator";
import "./CombinedEditor.css";

const isValidMongoId = (value) => /^[0-9a-fA-F]{24}$/.test(value || "");
const getUserId = (u) => `${u?.id || u?._id || ""}`;

export default function CombinedEditorPage({
  yamlText,
  setYamlText,
  error,
  validation,
  handleSaveGraph,
  savedGraphs,
  sharedGraphs,
  setShowSavedGraphs,
  handleNewFile,
  isAuthenticated,
  authLoading,
  user,
  onShowAuth,
  onShowRepositoryImporter,
  onShowVersionHistory,
  onLogout,
}) {
  const navigate = useNavigate();
  const { id: currentFileId } = useParams();
  const { darkMode, toggleDarkMode } = useTheme();
  const previousAuthState = useRef(isAuthenticated);
  const yamlFileInputRef = useRef(null);
  const jsonFileInputRef = useRef(null);
  const splitContainerRef = useRef(null);
  const leftPanelRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMobileScrollTopFab, setShowMobileScrollTopFab] = useState(false);
  const [viewportIsMobile, setViewportIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia("(max-width: 768px)").matches : false
  );
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleImportYamlFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content === 'string') {
        setYamlText(content);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [setYamlText]);

  const handleImportJsonFile = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content === 'string') {
        try {
          const parsed = JSON.parse(content);
          setYamlText(yaml.dump(parsed, { indent: 2, lineWidth: -1 }));
        } catch {
          alert('Invalid JSON file');
        }
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }, [setYamlText]);

  const [copyLabel, setCopyLabel] = useState('📋 Copy');
  const handleCopyText = useCallback(() => {
    navigator.clipboard.writeText(yamlText).then(() => {
      setCopyLabel('✅ Copied!');
      setTimeout(() => setCopyLabel('📋 Copy'), 2000);
    });
  }, [yamlText]);

  const [parsedData, setParsedData] = useState(null);
  const [treeInfo, setTreeInfo] = useState(null);
  const [localError, setLocalError] = useState("");
  const [leftWidth, setLeftWidth] = useState(50);
  const [isDragging, setIsDragging] = useState(false);
  const [searchResults, setSearchResults] = useState([]);
  const [currentSearchIndex, setCurrentSearchIndex] = useState(0);

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareSuccess, setShareSuccess] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [existingCollaborators, setExistingCollaborators] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [isUserLoading, setIsUserLoading] = useState(false);
  const [permissions, setPermissions] = useState({});

  const debouncedYamlText = useDebounce(yamlText, 300);
  const debouncedUserSearch = useDebounce(userSearch, 350);
  const { loading: fileLoading, error: fileError, fileData } = useYamlFile(setYamlText, isAuthenticated, authLoading);

  const handleExportYaml = useCallback(() => {
    const blob = new Blob([yamlText], { type: 'application/x-yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (fileData?.title || 'export') + '.yaml';
    a.click();
    URL.revokeObjectURL(url);
  }, [yamlText, fileData]);

  const handleExportJson = useCallback(() => {
    try {
      const parsed = yaml.load(yamlText);
      const json = JSON.stringify(parsed, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (fileData?.title || 'export') + '.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Cannot export: YAML content is invalid');
    }
  }, [yamlText, fileData]);

  // Real-time collaboration — only active when viewing a saved file and authenticated
  const collabFileId = currentFileId && isAuthenticated ? currentFileId : null;
  const {
    remoteUsers,
    remoteCursors,
    isConnected: collabConnected,
    accessDenied: collabAccessDenied,
    typingUsers,
    handleLocalChange,
    handleCursorChange,
  } = useCollaboration(collabFileId, yamlText, setYamlText, !!collabFileId, getUserId(user) || null);

  // Wrap setYamlText to also notify the collaboration hook
  const handleYamlChange = useCallback((newValue) => {
    setYamlText(newValue);
    if (collabFileId) {
      handleLocalChange(newValue);
    }
  }, [setYamlText, collabFileId, handleLocalChange]);

  // Load existing collaborators when the share modal opens
  useEffect(() => {
    if (showShareModal && fileData && getUserId(user) === `${fileData.owner}`) {
      import("../services/apiService").then(({ default: apiService }) => {
        apiService.getFileCollaborators(fileData._id)
          .then((data) => {
            const collabs = data.collaborators || [];
            setExistingCollaborators(collabs);
            // Build initial permissions from collaborators
            const permMap = { ...(fileData.permissions || {}) };
            collabs.forEach((c) => {
              const uid = c._id || c.id;
              if (!permMap[uid]) permMap[uid] = c.permission;
            });
            setPermissions(permMap);
          })
          .catch(() => setExistingCollaborators([]));
      });
    }
  }, [showShareModal, fileData, user]);

  useEffect(() => {
    if (showShareModal && fileData && getUserId(user) === `${fileData.owner}`) {
      if (!debouncedUserSearch) {
        setAllUsers([]);
        return;
      }
      setIsUserLoading(true);
      fetchUsersByPrefix(debouncedUserSearch)
        .then((users) => setAllUsers(users))
        .catch(() => setAllUsers([]))
        .finally(() => setIsUserLoading(false));
    }
  }, [showShareModal, fileData, user, debouncedUserSearch]);

  const handleChangePermission = async (targetUserId, newPermission) => {
    const updated = { ...permissions, [targetUserId]: newPermission };
    setPermissions(updated);
    setShareLoading(true);
    setShareError("");
    setShareSuccess("");
    try {
      const apiService = (await import("../services/apiService")).default;
      await apiService.setYamlFilePermissions(fileData._id, updated);
      setShareSuccess("Permissions updated!");
    } catch (err) {
      setShareError(err.message || "Failed to update permissions");
    } finally {
      setShareLoading(false);
    }
  };

  useEffect(() => {
    if (fileError && fileError.includes("Invalid file ID format")) {
      navigate("/", { replace: true });
    }
  }, [fileError, navigate]);

  useEffect(() => {
    if (previousAuthState.current && !isAuthenticated && currentFileId) {
      navigate("/combined", { replace: true });
    }
    previousAuthState.current = isAuthenticated;
  }, [isAuthenticated, currentFileId, navigate]);

  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setViewportIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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
    window.addEventListener("diagramSearchComplete", handleSearchComplete);
    window.addEventListener("diagramNavigationComplete", handleNavigationComplete);
    return () => {
      window.removeEventListener("diagramSearchComplete", handleSearchComplete);
      window.removeEventListener("diagramNavigationComplete", handleNavigationComplete);
    };
  }, []);

  const handleSearch = useCallback((term) => {
    if (!term || !term.trim()) {
      setSearchResults([]);
      setCurrentSearchIndex(0);
    }
    if (window.combinedEditorDiagramSearch) {
      window.combinedEditorDiagramSearch(term);
    }
  }, []);

  const handleSearchNavigation = useCallback((direction) => {
    if (window.combinedEditorDiagramNavigate) {
      window.combinedEditorDiagramNavigate(direction);
    }
  }, []);

  useEffect(() => {
    if (!debouncedYamlText) {
      setParsedData(null);
      setTreeInfo(null);
      setLocalError("");
      return;
    }
    try {
      const result = validateYAML(debouncedYamlText);
      if (result.valid) {
        const parsed = yaml.load(debouncedYamlText);
        const treeData = buildTreeFromYAML(parsed);
        setParsedData(convertToD3Hierarchy(treeData));
        setTreeInfo(treeData.treeInfo);
        setLocalError("");
      } else {
        const errorMessages = result.issues ? result.issues.map((issue) => issue.message) : ["YAML validation failed"];
        setLocalError(errorMessages.join(", "));
        setParsedData(null);
        setTreeInfo(null);
      }
    } catch (err) {
      setLocalError(err.message);
      setParsedData(null);
      setTreeInfo(null);
    }
  }, [debouncedYamlText]);

  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    document.body.classList.add("dragging");
    e.preventDefault();
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    const newLeftWidth = (e.clientX / window.innerWidth) * 100;
    if (newLeftWidth >= 20 && newLeftWidth <= 80) {
      setLeftWidth(newLeftWidth);
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
    document.body.classList.remove("dragging");
  }, []);

  useEffect(() => {
    if (!isDragging) return;
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, handleMouseMove, handleMouseUp]);

  const canShare = fileData && fileData.owner && getUserId(user) === `${fileData.owner}`;
  const hasValidFileId = isValidMongoId(fileData?._id);
  const candidateUserIds = [`${user?.id || ""}`, `${user?._id || ""}`].filter(Boolean);
  const ownerId = `${fileData?.owner?._id || fileData?.owner || ""}`;
  const isOwner = !!(fileData && candidateUserIds.includes(ownerId));
  const currentPermission = fileData
    ? (candidateUserIds
      .map((id) => fileData.permissions?.[id] || fileData.permissions?.get?.(id))
      .find(Boolean) || "no-access")
    : "no-access";
  const canEditCurrentFile = !!(fileData ? (isOwner || currentPermission === "edit") : !currentFileId);
  const canSaveGraph = !currentFileId || canEditCurrentFile;

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (!e.shiftKey) {
        if (e.key === 's') {
          e.preventDefault();
          if (isAuthenticated && canSaveGraph) handleSaveGraph();
        } else if (e.key === 'o') {
          e.preventDefault();
          yamlFileInputRef.current?.click();
        }
      }

      if (!e.shiftKey && e.key === '/') {
        e.preventDefault();
        setShowShortcuts(prev => !prev);
      }

      if (e.shiftKey) {
        const key = e.key.toLowerCase();
        if (key === 'k') {
          e.preventDefault();
          jsonFileInputRef.current?.click();
        } else if (key === 'e') {
          e.preventDefault();
          if (yamlText) handleExportYaml();
        } else if (key === 'x') {
          e.preventDefault();
          if (yamlText) handleExportJson();
        } else if (key === 'l') {
          e.preventDefault();
          if (currentFileId) navigate(`/editor/${currentFileId}`);
          else navigate('/');
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isAuthenticated, canSaveGraph, handleSaveGraph, yamlText, handleExportYaml, handleExportJson, currentFileId, navigate]);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop().toLowerCase();
    if (!['yaml', 'yml', 'json'].includes(ext)) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const content = evt.target?.result;
      if (typeof content !== 'string') return;
      if (ext === 'json') {
        try {
          const parsed = JSON.parse(content);
          setYamlText(yaml.dump(parsed, { indent: 2, lineWidth: -1 }));
        } catch { /* ignore invalid */ }
      } else {
        setYamlText(content);
      }
    };
    reader.readAsText(file);
  }, [setYamlText]);

  // Determine if user has no access to this file
  const hasNoAccess = !!(fileError && fileError.includes('Access denied')) || collabAccessDenied;

  const updateMobileScrollTopFab = useCallback(() => {
    const split = splitContainerRef.current;
    const left = leftPanelRef.current;
    if (!split || !left) {
      setShowMobileScrollTopFab(false);
      return;
    }
    if (!viewportIsMobile) {
      setShowMobileScrollTopFab(false);
      return;
    }
    const h = left.offsetHeight;
    if (h <= 0) {
      setShowMobileScrollTopFab(false);
      return;
    }
    const threshold = Math.max(24, h - 12);
    setShowMobileScrollTopFab(split.scrollTop >= threshold);
  }, [viewportIsMobile]);

  useEffect(() => {
    if (hasNoAccess) {
      setShowMobileScrollTopFab(false);
      return;
    }
    const split = splitContainerRef.current;
    if (!split) return;
    updateMobileScrollTopFab();
    split.addEventListener("scroll", updateMobileScrollTopFab, { passive: true });
    window.addEventListener("resize", updateMobileScrollTopFab);
    const ro = new ResizeObserver(() => updateMobileScrollTopFab());
    ro.observe(split);
    if (leftPanelRef.current) ro.observe(leftPanelRef.current);
    return () => {
      split.removeEventListener("scroll", updateMobileScrollTopFab);
      window.removeEventListener("resize", updateMobileScrollTopFab);
      ro.disconnect();
    };
  }, [hasNoAccess, updateMobileScrollTopFab, viewportIsMobile, parsedData, yamlText, leftWidth, treeInfo, error, localError]);

  const hideMobileGraphChrome = viewportIsMobile && !showMobileScrollTopFab;

  return (
    <div
      className={`simple-combined-editor${mobileMenuOpen ? " editor-mobile-nav-open" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setIsDragOver(false); }}
      onDrop={handleDrop}
    >
      {isDragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-content">
            <span className="drop-icon">📄</span>
            <span>Drop YAML or JSON file here</span>
          </div>
        </div>
      )}
      <div className="simple-header compact-header">
        <div className="header-top-bar">
          <div className="header-left">
            <button className="compact-icon-btn" onClick={() => navigate('/')} title="Home">🏠</button>
            <button className="compact-icon-btn" onClick={() => navigate(currentFileId ? `/editor/${currentFileId}` : "/")} title="Back to Editor">←</button>
            <span className="header-title">Editor & Visualizer</span>
            {fileData && !fileError && <span className="header-file-tag hide-mobile">📁 {fileData.title}</span>}
            {treeInfo && <span className="header-file-tag hide-mobile">{treeInfo.totalNodes} nodes • {treeInfo.maxDepth + 1} levels</span>}
            <button
              type="button"
              className="diagram-hamburger diagram-mobile-only"
              aria-expanded={mobileMenuOpen}
              aria-controls="combined-mobile-nav"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
              onClick={() => setMobileMenuOpen((o) => !o)}
            >
              <span className="diagram-hamburger-icon" aria-hidden>☰</span>
            </button>
          </div>

          <div className="header-center">
            <div className="menu-group">
              <div className="dropdown-wrapper">
                <button className="menu-btn" onClick={() => setOpenMenu(openMenu === 'file' ? null : 'file')}>
                  File ▾
                </button>
                {openMenu === 'file' && (
                  <div className="dropdown-menu" onMouseLeave={() => setOpenMenu(null)}>
                    {currentFileId && (
                      <button onClick={() => { handleNewFile("/combined"); setOpenMenu(null); }}>📄 New File</button>
                    )}
                    <button onClick={() => { yamlFileInputRef.current?.click(); setOpenMenu(null); }}>📥 Import YAML</button>
                    <button onClick={() => { jsonFileInputRef.current?.click(); setOpenMenu(null); }}>📥 Import JSON → YAML</button>
                    <button onClick={() => { onShowRepositoryImporter(); setOpenMenu(null); }}>📂 Import Repo</button>
                    <button onClick={() => { handleExportYaml(); setOpenMenu(null); }} disabled={!yamlText}>📤 Export YAML</button>
                    <button onClick={() => { handleExportJson(); setOpenMenu(null); }} disabled={!yamlText}>📤 Export as JSON</button>
                    <div className="dropdown-divider" />
                    <button onClick={() => { handleSaveGraph(); setOpenMenu(null); }} disabled={!parsedData || !canSaveGraph}>💾 Save</button>
                    <button onClick={() => { setShowSavedGraphs(true); setOpenMenu(null); }}>📚 Saved ({savedGraphs.length + (sharedGraphs?.length || 0)})</button>
                    <button onClick={() => { onShowVersionHistory(); setOpenMenu(null); }} disabled={!isAuthenticated}>📜 History</button>
                    <div className="dropdown-divider" />
                    <button onClick={() => { navigate("/explore"); setOpenMenu(null); }}>🌐 Explore Public Graphs</button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="header-right">
            <button className="compact-icon-btn" onClick={toggleDarkMode} title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>{darkMode ? '☀️' : '🌙'}</button>
            <button className="compact-icon-btn" onClick={() => setShowShortcuts(true)} title="Keyboard Shortcuts">⌨️</button>
            {isAuthenticated ? (
              <>
                <span className="user-name clickable-username" onClick={() => navigate("/profile")} title="View Profile">
                  {user?.username || "User"}
                </span>
                <button className="compact-icon-btn logout-icon" onClick={onLogout} title="Logout">🚪</button>
              </>
            ) : (
              <button className="menu-btn login-menu-btn" onClick={onShowAuth}>🔐 Login</button>
            )}
          </div>
        </div>

        <input ref={yamlFileInputRef} type="file" accept=".yaml,.yml" style={{ display: 'none' }} onChange={handleImportYamlFile} />
        <input ref={jsonFileInputRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportJsonFile} />

        {fileLoading && <div className="header-status">📄 Loading file...</div>}
        {fileError && <div className="header-status header-status-error">❌ {fileError}</div>}
      </div>

      {mobileMenuOpen && (
        <>
          <div
            className="diagram-mobile-overlay"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden
          />
          <nav id="combined-mobile-nav" className="diagram-mobile-drawer" aria-label="Combined editor menu">
            <div className="diagram-mobile-drawer-header">
              <span>Menu</span>
              <button
                type="button"
                className="diagram-mobile-drawer-close"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>
            <div className="diagram-mobile-drawer-body">
              <p className="diagram-mobile-drawer-section-title">File</p>
              {currentFileId && (
                <button
                  type="button"
                  className="diagram-mobile-nav-btn"
                  onClick={() => {
                    handleNewFile("/combined");
                    setMobileMenuOpen(false);
                  }}
                >
                  📄 New File
                </button>
              )}
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  yamlFileInputRef.current?.click();
                  setMobileMenuOpen(false);
                }}
              >
                📥 Import YAML
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  jsonFileInputRef.current?.click();
                  setMobileMenuOpen(false);
                }}
              >
                📥 Import JSON → YAML
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  onShowRepositoryImporter();
                  setMobileMenuOpen(false);
                }}
              >
                📂 Import Repo
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  handleExportYaml();
                  setMobileMenuOpen(false);
                }}
                disabled={!yamlText}
              >
                📤 Export YAML
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  handleExportJson();
                  setMobileMenuOpen(false);
                }}
                disabled={!yamlText}
              >
                📤 Export as JSON
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  handleSaveGraph();
                  setMobileMenuOpen(false);
                }}
                disabled={!parsedData || !canSaveGraph}
              >
                💾 Save
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  setShowSavedGraphs(true);
                  setMobileMenuOpen(false);
                }}
              >
                📚 Saved ({savedGraphs.length + (sharedGraphs?.length || 0)})
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  onShowVersionHistory();
                  setMobileMenuOpen(false);
                }}
                disabled={!isAuthenticated}
              >
                📜 History
              </button>

              <p className="diagram-mobile-drawer-section-title">Account</p>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  toggleDarkMode();
                }}
              >
                {darkMode ? "☀️ Light mode" : "🌙 Dark mode"}
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  setShowShortcuts(true);
                  setMobileMenuOpen(false);
                }}
              >
                ⌨️ Keyboard shortcuts
              </button>
              {isAuthenticated ? (
                <>
                  <button
                    type="button"
                    className="diagram-mobile-nav-btn"
                    onClick={() => {
                      navigate("/profile");
                      setMobileMenuOpen(false);
                    }}
                  >
                    👤 {user?.username || "Profile"}
                  </button>
                  <button
                    type="button"
                    className="diagram-mobile-nav-btn"
                    onClick={() => {
                      onLogout();
                      setMobileMenuOpen(false);
                    }}
                  >
                    🚪 Logout
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="diagram-mobile-nav-btn"
                  onClick={() => {
                    onShowAuth();
                    setMobileMenuOpen(false);
                  }}
                >
                  🔐 Login
                </button>
              )}
            </div>
          </nav>
        </>
      )}

      {(error || localError) && !hasNoAccess && <div className="error-banner">⚠️ {error || localError}</div>}

      {collabFileId && !collabAccessDenied && !hasNoAccess && (
        <PresenceBar
          users={remoteUsers}
          typingUsers={typingUsers}
          isConnected={collabConnected}
          canShare={canShare && hasValidFileId}
          onShare={() => setShowShareModal(true)}
        />
      )}

      {hasNoAccess ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#d32f2f', backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', margin: '20px', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <h2 style={{ margin: '0 0 10px' }}>🚫 Access Denied</h2>
          <p>You do not have permission to view this file.</p>
          <button onClick={() => navigate('/')} style={{ marginTop: '15px', padding: '8px 20px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
            ← Go Home
          </button>
        </div>
      ) : (
        <>

          {showShareModal && hasValidFileId && (
            <ShareModal
              fileData={fileData}
              setShowShareModal={setShowShareModal}
              shareLoading={shareLoading}
              setShareLoading={setShareLoading}
              shareError={shareError}
              setShareError={setShareError}
              shareSuccess={shareSuccess}
              setShareSuccess={setShareSuccess}
              user={user}
              userSearch={userSearch}
              setUserSearch={setUserSearch}
              isUserLoading={isUserLoading}
              allUsers={allUsers}
              existingCollaborators={existingCollaborators}
              permissions={permissions}
              handleChangePermission={handleChangePermission}
            />
          )}

          <div ref={splitContainerRef} className="split-container">
            <div ref={leftPanelRef} className="left-panel" style={{ width: `${leftWidth}%` }}>
              <YamlEditor
                value={yamlText}
                onChange={handleYamlChange}
                readOnly={!canEditCurrentFile}
                error={error || localError}
                validation={validation}
                remoteCursors={collabFileId ? remoteCursors : {}}
                onCursorChange={collabFileId ? handleCursorChange : undefined}
                onCopy={handleCopyText}
                copyLabel={copyLabel}
              />
            </div>

            <div className="resizer" onMouseDown={handleMouseDown} />

            <div className="right-panel" style={{ width: `${100 - leftWidth}%` }}>
              <div className="right-panel-container">
                <div className="diagram-area">
                  {parsedData && !hideMobileGraphChrome && (
                    <div className="search-panel-container">
                      <SearchPanel
                        onSearch={handleSearch}
                        searchResults={searchResults}
                        currentIndex={currentSearchIndex}
                        onNavigate={handleSearchNavigation}
                      />
                    </div>
                  )}
                  <div className="diagram-content">
                    {parsedData ? (
                      <DiagramViewer data={parsedData} treeInfo={treeInfo} hideSearch hideUiChrome={hideMobileGraphChrome} />
                    ) : (
                      <div className="diagram-placeholder">
                        <div className="placeholder-content">
                          <div className="placeholder-icon">📊</div>
                          <h3>No Visualization Yet</h3>
                          <p>{yamlText ? "Fix YAML errors to see visualization" : "Enter YAML content to see the tree diagram"}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {!hasNoAccess && showMobileScrollTopFab && (
        <button
          type="button"
          className="combined-scroll-top-fab"
          onClick={() => {
            splitContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          }}
          aria-label="Scroll to top"
        >
          ↑
        </button>
      )}

      {showShortcuts && (
        <KeyboardShortcutsPanel mode="combined" onClose={() => setShowShortcuts(false)} />
      )}
    </div>
  );
}