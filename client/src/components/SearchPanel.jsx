import React, { useState, useEffect } from "react";
import "./styles/SearchPanel.css";

export default function SearchPanel({ onSearch, searchResults, currentIndex, onNavigate, onExpandedChange, searchMode, onSearchModeChange }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);
  const [localSearchMode, setLocalSearchMode] = useState(searchMode || "visible");

  useEffect(() => {
    // Debounce search
    const timer = setTimeout(() => {
      if (searchTerm.trim()) {
        onSearch(searchTerm, localSearchMode);
      } else {
        onSearch("", localSearchMode);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm, localSearchMode, onSearch]);

  // Handle search mode changes from parent
  useEffect(() => {
    if (searchMode && searchMode !== localSearchMode) {
      setLocalSearchMode(searchMode);
    }
  }, [searchMode]);

  useEffect(() => {
    // Notify parent of expanded state changes
    if (onExpandedChange) {
      onExpandedChange(isExpanded);
    }
  }, [isExpanded, onExpandedChange]);

  const handleClear = () => {
    setSearchTerm("");
    onSearch("", localSearchMode);
  };

  const handleSearchModeChange = (mode) => {
    setLocalSearchMode(mode);
    if (onSearchModeChange) {
      onSearchModeChange(mode);
    }
    // Re-trigger search with new mode
    if (searchTerm.trim()) {
      onSearch(searchTerm, mode);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      if (e.shiftKey) {
        onNavigate("prev");
      } else {
        onNavigate("next");
      }
    } else if (e.key === "Escape") {
      handleClear();
    }
  };

  const handleToggleExpanded = () => {
    const newExpandedState = !isExpanded;
    setIsExpanded(newExpandedState);
    
    // Clear search when closing the panel
    if (!newExpandedState) {
      handleClear();
    }
  };

  return (
    <div className={`search-panel ${isExpanded ? "expanded" : "collapsed"}`}>
      <button
        className="search-toggle"
        onClick={handleToggleExpanded}
        title={isExpanded ? "Hide search" : "Show search"}
      >
        🔍 {isExpanded ? "Hide" : "Search"}
      </button>

      {isExpanded && (
        <div className="search-content">
          <div className="search-input-wrapper">
            <input
              type="text"
              className="search-input"
              placeholder="Search nodes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
            />
            {searchTerm && (
              <button className="clear-btn" onClick={handleClear} title="Clear (Esc)">
                ✕
              </button>
            )}
          </div>

          {/* Search Mode Toggle */}
          <div className="search-mode-toggle">
            <button
              className={`mode-btn ${localSearchMode === "visible" ? "active" : ""}`}
              onClick={() => handleSearchModeChange("visible")}
              title="Search only visible (expanded) nodes"
            >
              👁️ Visible Only
            </button>
            <button
              className={`mode-btn ${localSearchMode === "all" ? "active" : ""}`}
              onClick={() => handleSearchModeChange("all")}
              title="Search all nodes (including hidden/collapsed)"
            >
              🌐 All Nodes
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="search-results">
              <div className="result-info">
                <div className="result-count">
                  {searchResults.length} result{searchResults.length !== 1 ? "s" : ""}
                  {searchResults.length > 1 && ` (${currentIndex + 1}/${searchResults.length})`}
                </div>

                {/* Search Stats: Show visible vs hidden breakdown */}
                {localSearchMode === "all" && searchResults.length > 0 && (
                  <div className="search-stats">
                    {(() => {
                      const visibleCount = searchResults.filter(r => r.wasVisible).length;
                      const hiddenCount = searchResults.length - visibleCount;
                      return (
                        <span className="stats-text">
                          {visibleCount > 0 && <span className="stat-visible">👁️ {visibleCount} visible</span>}
                          {hiddenCount > 0 && <span className="stat-hidden">🔒 {hiddenCount} hidden</span>}
                        </span>
                      );
                    })()}
                  </div>
                )}

                {searchResults[currentIndex]?.matchText && (
                  <div className="current-match-info">
                    <span className="match-label">
                      📍 Current:
                      {!searchResults[currentIndex].wasVisible && (
                        <span className="was-hidden-badge" title="This node was hidden and auto-expanded">
                          🔓 was hidden
                        </span>
                      )}
                    </span>
                    <span className="match-text" title={searchResults[currentIndex].matchText}>
                      {searchResults[currentIndex].matchText.length > 30
                        ? searchResults[currentIndex].matchText.substring(0, 30) + "..."
                        : searchResults[currentIndex].matchText}
                    </span>
                  </div>
                )}
              </div>

              {searchResults.length > 1 && (
                <div className="navigation-buttons">
                  <button
                    className="nav-btn"
                    onClick={() => onNavigate("prev")}
                    title="Previous (Shift+Enter)"
                  >
                    ↑ Prev
                  </button>
                  <button
                    className="nav-btn"
                    onClick={() => onNavigate("next")}
                    title="Next (Enter)"
                  >
                    Next ↓
                  </button>
                </div>
              )}
            </div>
          )}

          {searchTerm && searchResults.length === 0 && (
            <div className="no-results">No matches found</div>
          )}

          <div className="search-hints">
            <div className="hint-item">
              <kbd>Enter</kbd> <span>Next result</span>
            </div>
            <div className="hint-item">
              <kbd>Shift+Enter</kbd> <span>Previous</span>
            </div>
            <div className="hint-item">
              <kbd>F3</kbd> <span>Next (global)</span>
            </div>
            <div className="hint-item">
              <kbd>Esc</kbd> <span>Clear search</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

