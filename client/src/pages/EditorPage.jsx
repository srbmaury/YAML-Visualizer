import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import YamlEditor from "../components/YamlEditor";
import AiAssistant from "../components/AiAssistant";
import AnalysisPanel from "../components/AnalysisPanel";
import PresenceBar from "../components/PresenceBar";
import ShareModal from "../components/ShareModal";
import YamlAnalysisService from "../services/yamlAnalysisService";
import { fetchUsersByPrefix } from "../services/userService";
import { useYamlFile } from "../hooks/useYamlFile";
import { useDebounce } from "../hooks/useDebounce";
import { useCollaboration } from "../hooks/useCollaboration";
import yaml from "js-yaml";
import KeyboardShortcutsPanel from "../components/KeyboardShortcutsPanel";
import { useTheme } from "../hooks/useTheme";

const isValidMongoId = (value) => /^[0-9a-fA-F]{24}$/.test(value || "");
const getUserId = (u) => `${u?.id || u?._id || ""}`;

export default function EditorPage({
  yamlText,
  setYamlText,
  handleVisualize,
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
  const { id: currentFileId } = useParams(); // Get current file ID from URL
  const { darkMode, toggleDarkMode } = useTheme();
  const [showAiAssistant, setShowAiAssistant] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const previousAuthState = useRef(isAuthenticated);
  const yamlFileInputRef = useRef(null);
  const jsonFileInputRef = useRef(null);
  const [openMenu, setOpenMenu] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const [showShareModal, setShowShareModal] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareSuccess, setShareSuccess] = useState("");
  const [allUsers, setAllUsers] = useState([]);
  const [existingCollaborators, setExistingCollaborators] = useState([]);
  const [userSearch, setUserSearch] = useState("");
  const [isUserLoading, setIsUserLoading] = useState(false);
  const [permissions, setPermissions] = useState({});
  const debouncedUserSearch = useDebounce(userSearch, 350);

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

  // Debounce yamlText for analysis to prevent excessive computation
  const debouncedYamlText = useDebounce(yamlText, 500); // 500ms delay for analysis

  // Use the custom hook to load YAML file by ID if present in URL
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

  const [copyLabel, setCopyLabel] = useState('📋 Copy');
  const handleCopyText = useCallback(() => {
    navigator.clipboard.writeText(yamlText).then(() => {
      setCopyLabel('✅ Copied!');
      setTimeout(() => setCopyLabel('📋 Copy'), 2000);
    });
  }, [yamlText]);

  // Real-time collaboration
  const collabFileId = currentFileId && isAuthenticated ? currentFileId : null;
  const {
    remoteUsers,
    remoteCursors,
    isConnected: collabConnected,
    accessDenied: collabAccessDenied,
    typingUsers,
    handleLocalChange,
    handleCursorChange,
  } = useCollaboration(collabFileId, yamlText, setYamlText, !!collabFileId, user?.id || user?._id || null);

  const handleYamlChange = useCallback((newValue) => {
    setYamlText(newValue);
    if (collabFileId) {
      handleLocalChange(newValue);
    }
  }, [setYamlText, collabFileId, handleLocalChange]);

  const candidateUserIds = [`${user?.id || ''}`, `${user?._id || ''}`].filter(Boolean);
  const ownerId = `${fileData?.owner?._id || fileData?.owner || ''}`;
  const isOwner = !!(fileData && candidateUserIds.includes(ownerId));
  const canShare = fileData && fileData.owner && getUserId(user) === `${fileData.owner}`;
  const hasValidFileId = isValidMongoId(fileData?._id);
  const editorReadOnly = (() => {
    if (!currentFileId || !fileData) return false;
    const ownerId = `${fileData.owner?._id || fileData.owner || ''}`;
    const isOwner = candidateUserIds.includes(ownerId);
    if (isOwner) return false;

    const permission = candidateUserIds
      .map((id) => fileData.permissions?.[id] || fileData.permissions?.get?.(id))
      .find(Boolean) || 'no-access';

    return permission !== 'edit';
  })();
  const canSaveGraph = !editorReadOnly;

  // Determine if user has no access to this file
  const hasNoAccess = !!(fileError && fileError.includes('Access denied')) || collabAccessDenied;

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
      navigate('/', { replace: true });
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

  // Load existing collaborators when the share modal opens
  useEffect(() => {
    if (showShareModal && fileData && getUserId(user) === `${fileData.owner}`) {
      import("../services/apiService").then(({ default: apiService }) => {
        apiService.getFileCollaborators(fileData._id)
          .then((data) => {
            const collabs = data.collaborators || [];
            setExistingCollaborators(collabs);
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

  // Memoized analysis that updates when debounced YAML changes

  const analysis = useMemo(() => {
    if (!debouncedYamlText || debouncedYamlText.trim() === '') {
      return null;
    }

    try {
      const parsedYaml = yaml.load(debouncedYamlText);
      return YamlAnalysisService.analyzeYaml(parsedYaml, debouncedYamlText);
    } catch (error) {
      // Return error analysis for invalid YAML
      return {
        complexity: { score: 0, level: 'Invalid', details: [] },
        performance: { score: 0, recommendations: [] },
        bestPractices: { score: 0, suggestions: [] },
        issues: {
          critical: [{
            type: 'YAML Syntax Error',
            message: `Parse error: ${error.message}`,
            severity: 'critical'
          }],
          warnings: [],
          info: []
        },
        summary: {
          overall: 'error',
          message: 'Invalid YAML syntax prevents analysis',
          overallScore: 0,
          recommendations: []
        }
      };
    }
  }, [debouncedYamlText]);

  // Simulate loading for analysis updates (debounced)
  useEffect(() => {
    if (debouncedYamlText && debouncedYamlText.trim() !== '') {
      setAnalysisLoading(true);
      const timer = setTimeout(() => setAnalysisLoading(false), 300);
      return () => clearTimeout(timer);
    }
  }, [debouncedYamlText]);

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
        } else if (key === 'y') {
          e.preventDefault();
          setShowAnalysis(prev => !prev);
        } else if (key === 'l') {
          e.preventDefault();
          if (currentFileId) navigate(`/combined/${currentFileId}`);
          else navigate('/combined');
        } else if (key === 'p') {
          e.preventDefault();
          setShowAiAssistant(prev => !prev);
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

  return (
    <div
      className={`editor-container${mobileMenuOpen ? " editor-mobile-nav-open" : ""}`}
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
      <div className="header compact-header">
        <div className="header-top-bar">
          <div className="header-left">
            <button className="compact-icon-btn" onClick={() => navigate('/')} title="Home">🏠</button>
            <span className="header-title">YAML Visualizer</span>
            {fileData && <span className="header-file-tag hide-mobile">📁 {fileData.title}</span>}
            <button
              type="button"
              className="diagram-hamburger diagram-mobile-only"
              aria-expanded={mobileMenuOpen}
              aria-controls="editor-mobile-nav"
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
                      <button onClick={() => { handleNewFile("/"); setOpenMenu(null); }}>📄 New File</button>
                    )}
                    <button onClick={() => { yamlFileInputRef.current?.click(); setOpenMenu(null); }}>📥 Import YAML</button>
                    <button onClick={() => { jsonFileInputRef.current?.click(); setOpenMenu(null); }}>📥 Import JSON → YAML</button>
                    <button onClick={() => { onShowRepositoryImporter(); setOpenMenu(null); }}>📂 Import Repo</button>
                    <button onClick={() => { handleExportYaml(); setOpenMenu(null); }} disabled={!yamlText}>📤 Export YAML</button>
                    <button onClick={() => { handleExportJson(); setOpenMenu(null); }} disabled={!yamlText}>📤 Export as JSON</button>
                    {isAuthenticated && (
                      <>
                        <div className="dropdown-divider" />
                        <button onClick={() => { handleSaveGraph(); setOpenMenu(null); }} disabled={!canSaveGraph}>💾 Save Graph</button>
                        <button onClick={() => { setShowSavedGraphs(true); setOpenMenu(null); }}>📚 My Graphs ({savedGraphs.length + (sharedGraphs?.length || 0)})</button>
                        <button onClick={() => { onShowVersionHistory(); setOpenMenu(null); }}>📜 Version History</button>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="dropdown-wrapper">
                <button className="menu-btn" onClick={() => setOpenMenu(openMenu === 'view' ? null : 'view')}>
                  View ▾
                </button>
                {openMenu === 'view' && (
                  <div className="dropdown-menu" onMouseLeave={() => setOpenMenu(null)}>
                    <button onClick={() => {
                      if (currentFileId) navigate(`/combined/${currentFileId}`);
                      else navigate("/combined");
                      setOpenMenu(null);
                    }}>🔗 Combined View</button>
                    <button onClick={() => { setShowAnalysis(!showAnalysis); setOpenMenu(null); }} className={showAnalysis ? 'active' : ''}>🔍 Analysis</button>
                    <button onClick={() => {
                      navigate('/diff', { state: { yamlContent: yamlText, fileName: fileData?.title || 'Current Editor' } });
                      setOpenMenu(null);
                    }}>🔍 Diff Compare</button>
                    <button onClick={() => { navigate("/docs"); setOpenMenu(null); }}>📖 Docs</button>
                    <div className="dropdown-divider" />
                    <button onClick={() => { navigate("/explore"); setOpenMenu(null); }}>🌐 Explore Public Graphs</button>
                  </div>
                )}
              </div>

              <button className="menu-btn primary-btn" onClick={() => handleVisualize(currentFileId)} title="Visualize">
                🎨 Visualize
              </button>
              <button className="menu-btn" onClick={() => setShowAiAssistant(true)} title="AI Assistant">
                🤖 AI
              </button>
            </div>
          </div>

          <div className="header-right">
            <button className="compact-icon-btn" onClick={toggleDarkMode} title={darkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}>{darkMode ? '☀️' : '🌙'}</button>
            <button className="compact-icon-btn" onClick={() => setShowShortcuts(true)} title="Keyboard Shortcuts">⌨️</button>
            {isAuthenticated ? (
              <>
                <span className="user-name clickable-username" onClick={() => navigate('/profile')} title="Go to profile">
                  {user?.username || 'User'}
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
          <nav id="editor-mobile-nav" className="diagram-mobile-drawer" aria-label="Editor menu">
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
                    handleNewFile("/");
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
              {isAuthenticated && (
                <>
                  <button
                    type="button"
                    className="diagram-mobile-nav-btn"
                    onClick={() => {
                      handleSaveGraph();
                      setMobileMenuOpen(false);
                    }}
                    disabled={!canSaveGraph}
                  >
                    💾 Save Graph
                  </button>
                  <button
                    type="button"
                    className="diagram-mobile-nav-btn"
                    onClick={() => {
                      setShowSavedGraphs(true);
                      setMobileMenuOpen(false);
                    }}
                  >
                    📚 My Graphs ({savedGraphs.length + (sharedGraphs?.length || 0)})
                  </button>
                  <button
                    type="button"
                    className="diagram-mobile-nav-btn"
                    onClick={() => {
                      onShowVersionHistory();
                      setMobileMenuOpen(false);
                    }}
                  >
                    📜 Version History
                  </button>
                </>
              )}

              <p className="diagram-mobile-drawer-section-title">View</p>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  if (currentFileId) navigate(`/combined/${currentFileId}`);
                  else navigate("/combined");
                  setMobileMenuOpen(false);
                }}
              >
                🔗 Combined View
              </button>
              <button
                type="button"
                className={`diagram-mobile-nav-btn${showAnalysis ? " diagram-mobile-nav-btn--active" : ""}`}
                onClick={() => {
                  setShowAnalysis(!showAnalysis);
                  setMobileMenuOpen(false);
                }}
              >
                🔍 Analysis
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  navigate("/diff", { state: { yamlContent: yamlText, fileName: fileData?.title || "Current Editor" } });
                  setMobileMenuOpen(false);
                }}
              >
                🔍 Diff Compare
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  navigate("/docs");
                  setMobileMenuOpen(false);
                }}
              >
                📖 Docs
              </button>

              <p className="diagram-mobile-drawer-section-title">Actions</p>
              <button
                type="button"
                className="diagram-mobile-nav-btn diagram-mobile-nav-btn--primary"
                onClick={() => {
                  handleVisualize(currentFileId);
                  setMobileMenuOpen(false);
                }}
              >
                🎨 Visualize
              </button>
              <button
                type="button"
                className="diagram-mobile-nav-btn"
                onClick={() => {
                  setShowAiAssistant(true);
                  setMobileMenuOpen(false);
                }}
              >
                🤖 AI Assistant
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

      <div className="editor-layout">
        <div className="editor-main">
          {hasNoAccess ? (
            <div className="access-denied" style={{ padding: '40px', textAlign: 'center', color: '#d32f2f', backgroundColor: '#ffebee', border: '1px solid #ffcdd2', borderRadius: '8px', margin: '20px' }}>
              <h2 style={{ margin: '0 0 10px' }}>🚫 Access Denied</h2>
              <p>You do not have permission to view this file.</p>
              <button onClick={() => navigate('/')} style={{ marginTop: '15px', padding: '8px 20px', background: '#1976d2', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '14px' }}>
                ← Go Home
              </button>
            </div>
          ) : (
            <>
              {collabFileId && !collabAccessDenied && (
                <PresenceBar
                  users={remoteUsers}
                  typingUsers={typingUsers}
                  isConnected={collabConnected}
                  canShare={canShare && hasValidFileId}
                  onShare={() => setShowShareModal(true)}
                />
              )}
              <YamlEditor
                value={yamlText}
                onChange={handleYamlChange}
                readOnly={editorReadOnly}
                remoteCursors={collabFileId ? remoteCursors : {}}
                onCursorChange={collabFileId ? handleCursorChange : undefined}
                onCopy={handleCopyText}
                copyLabel={copyLabel}
              />
            </>
          )}
          <div className="controls">
            {error && <div className="error">{error}</div>}
            {validation && (
              <div className="validation-panel">
                {validation.issues.length > 0 && (
                  <div className="validation-section errors">
                    <h4>❌ Errors ({validation.issues.length})</h4>
                    {validation.issues.map((issue, idx) => (
                      <div key={idx} className="validation-item error-item">
                        <div className="issue-header">
                          <span className="line-number">Line {issue.line}</span>
                          <span className="issue-type">{issue.type}</span>
                        </div>
                        <div className="issue-message">{issue.message}</div>
                        {issue.suggestion && (
                          <div className="issue-suggestion">
                            💡 Suggestion: <code>{issue.suggestion}</code>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {validation.warnings.length > 0 && (
                  <div className="validation-section warnings">
                    <h4>⚠️ Warnings ({validation.warnings.length})</h4>
                    {validation.warnings.map((warning, idx) => (
                      <div key={idx} className="validation-item warning-item">
                        <div className="issue-header">
                          <span className="line-number">Line {warning.line}</span>
                          <span className="issue-type">{warning.type}</span>
                        </div>
                        <div className="issue-message">{warning.message}</div>
                        {warning.suggestion && (
                          <div className="issue-suggestion">
                            💡 {warning.suggestion}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {validation.valid && validation.warnings.length === 0 && (
                  <div className="validation-success">
                    ✅ YAML is valid! ({validation.stats.nonEmptyLines} lines)
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {showAnalysis && (
          <div className="analysis-sidebar">
            <AnalysisPanel
              analysis={analysis}
              isLoading={analysisLoading}
            />
          </div>
        )}
      </div>

      <AiAssistant
        isOpen={showAiAssistant}
        onClose={() => setShowAiAssistant(false)}
        onYamlGenerated={setYamlText}
        currentYaml={yamlText}
      />

      {showShortcuts && (
        <KeyboardShortcutsPanel mode="editor" onClose={() => setShowShortcuts(false)} />
      )}

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
    </div>
  );
}