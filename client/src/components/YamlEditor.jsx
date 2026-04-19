import React, { useRef, useState, useEffect, useCallback } from "react";
import "./styles/YamlEditor.css";

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export default function YamlEditor({ value, onChange, readOnly = false, remoteCursors = {}, onCursorChange, onCopy, copyLabel }) {
  const textareaRef = useRef(null);
  const highlighterRef = useRef(null);
  const lineNumbersRef = useRef(null);
  const guidesRef = useRef(null);
  const previousValueRef = useRef(value);
  const [lineCount, setLineCount] = useState(1);
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [replaceTerm, setReplaceTerm] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);
  const [matches, setMatches] = useState([]);
  const scrollTimeoutRef = useRef(null);

  // Function to close search and clear terms
  const closeSearchReplace = () => {
    setShowSearchReplace(false);
    setSearchTerm("");
    setReplaceTerm("");
    setCurrentMatchIndex(0);
    setMatches([]);
  };

  useEffect(() => {
    const safeValue = value || '';
    const previousValue = previousValueRef.current || '';

    setLineCount(safeValue.split('\n').length);

    // Clear search terms when content changes significantly (like when loading a different file)
    if (searchTerm && previousValue !== safeValue) {
      const valueLength = safeValue.length;
      const previousLength = previousValue.length;

      // If the content length changed by more than 50% or content is completely different, clear search
      const significantChange = Math.abs(valueLength - previousLength) > Math.max(valueLength, previousLength) * 0.5;
      const completelyDifferent = valueLength > 100 && previousLength > 100 && !safeValue.includes(previousValue.substring(0, 50));

      if (significantChange || completelyDifferent) {
        setSearchTerm("");
        setReplaceTerm("");
        setCurrentMatchIndex(0);
        setMatches([]);
        setShowSearchReplace(false);
      }
    }

    // Update the ref for next comparison
    previousValueRef.current = safeValue;
  }, [value, searchTerm]);

  // Cleanup effect for scroll timeout
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        cancelAnimationFrame(scrollTimeoutRef.current);
      }
    };
  }, []);

  // Update syntax highlighting when value changes
  useEffect(() => {
    if (!highlighterRef.current) return;

    const safeValue = value || '';
    const lines = safeValue.split('\n');
    const highlightedLines = lines.map((line) => {
      // YAML syntax highlighting patterns
      let highlightedLine = escapeHtml(line);

      // First, highlight keys that don't have a colon yet (incomplete lines)
      if (!line.includes(':') && !line.trim().startsWith('#') && !line.trim().startsWith('-') && line.trim().length > 0) {
        highlightedLine = highlightedLine.replace(
          /^(\s*)([^\s#].*)$/,
          (match, indent, key) => {
            return `${indent}<span class="yaml-key">${key}</span>`;
          }
        );
      }

      // Highlight complete YAML keys (text before colon)
      highlightedLine = highlightedLine.replace(
        /^(\s*)([^:\s#][^:#]*?)(\s*:)(\s*)(.*)$/,
        (match, indent, key, colon, space, val) => {
          const highlightedKey = `<span class="yaml-key">${key}</span>`;
          const highlightedColon = `<span class="yaml-colon">${colon}</span>`;

          // Highlight different value types
          let highlightedValue = val;
          if (val.trim()) {
            // String values in quotes
            if (val.match(/^['"].*['"]$/)) {
              highlightedValue = `<span class="yaml-string">${val}</span>`;
            }
            // Numbers
            else if (val.match(/^\s*-?\d+(\.\d+)?\s*$/)) {
              highlightedValue = `<span class="yaml-number">${val}</span>`;
            }
            // Booleans
            else if (val.match(/^\s*(true|false|yes|no|on|off)\s*$/i)) {
              highlightedValue = `<span class="yaml-boolean">${val}</span>`;
            }
            // Arrays/Lists
            else if (val.trim().startsWith('[') && val.trim().endsWith(']')) {
              highlightedValue = `<span class="yaml-array">${val}</span>`;
            }
            // Regular values
            else {
              highlightedValue = `<span class="yaml-value">${val}</span>`;
            }
          }

          return `${indent}${highlightedKey}${highlightedColon}${space}${highlightedValue}`;
        }
      );

      // Highlight comments
      highlightedLine = highlightedLine.replace(
        /(#.*)$/,
        '<span class="yaml-comment">$1</span>'
      );

      // Highlight list items
      highlightedLine = highlightedLine.replace(
        /^(\s*)(- )(.*)$/,
        (match, indent, dash, content) => {
          return `${indent}<span class="yaml-list-dash">${dash}</span>${content}`;
        }
      );

      return highlightedLine;
    });

    // Add search highlighting
    let finalContent = highlightedLines.join('\n');
    if (searchTerm && matches.length > 0) {
      const flags = matchCase ? 'g' : 'gi';
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      let matchIndex = 0;
      finalContent = finalContent.replace(regex, (match) => {
        const isCurrentMatch = matchIndex === currentMatchIndex;
        matchIndex++;
        return `<span class="search-highlight ${isCurrentMatch ? 'current-match' : ''}">${match}</span>`;
      });
    }

    highlighterRef.current.innerHTML = finalContent;
  }, [value, searchTerm, matches, currentMatchIndex, matchCase]);

  // Find matches for search
  useEffect(() => {
    const safeValue = value || '';
    if (searchTerm) {
      const flags = matchCase ? 'g' : 'gi';
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      const foundMatches = [];
      let match;
      while ((match = regex.exec(safeValue)) !== null) {
        foundMatches.push({
          index: match.index,
          length: match[0].length,
          text: match[0]
        });
      }
      setMatches(foundMatches);
      setCurrentMatchIndex(0);
    } else {
      setMatches([]);
      setCurrentMatchIndex(0);
    }
  }, [searchTerm, value, matchCase]);

  const handleScroll = (e) => {
    // Cancel any pending scroll sync to prevent accumulation
    if (scrollTimeoutRef.current) {
      cancelAnimationFrame(scrollTimeoutRef.current);
    }

    // Use requestAnimationFrame for smooth synchronization
    scrollTimeoutRef.current = requestAnimationFrame(() => {
      const scrollTop = e.target.scrollTop;
      const scrollLeft = e.target.scrollLeft;

      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = scrollTop;
      }
      if (highlighterRef.current) {
        // Use scrollTop/scrollLeft to respect overflow boundaries
        highlighterRef.current.scrollTop = scrollTop;
        highlighterRef.current.scrollLeft = scrollLeft;
      }
      if (guidesRef.current) {
        guidesRef.current.style.transform = `translate(-${scrollLeft}px, -${scrollTop}px)`;
      }

      scrollTimeoutRef.current = null;
    });
  };

  const handleKeyDown = (e) => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Ctrl+F for search
    if (e.ctrlKey && e.key === 'f') {
      e.preventDefault();
      setShowSearchReplace(true);
      return;
    }

    // Ctrl+H for search and replace
    if (e.ctrlKey && e.key === 'h') {
      e.preventDefault();
      setShowSearchReplace(true);
      return;
    }

    // Escape to close search
    if (e.key === 'Escape' && showSearchReplace) {
      closeSearchReplace();
      return;
    }

    // Auto-indent on Enter
    if (e.key === 'Enter') {
      e.preventDefault();
      const { selectionStart } = textarea;
      const safeValue = value || '';
      const lines = safeValue.substring(0, selectionStart).split('\n');
      const currentLine = lines[lines.length - 1];
      const leadingSpaces = currentLine.match(/^\s*/)?.[0] || '';

      let extraIndent = '';
      if (currentLine.trim().endsWith(':')) {
        extraIndent = '  ';
      }

      const newValue = safeValue.substring(0, selectionStart) + '\n' + leadingSpaces + extraIndent + safeValue.substring(selectionStart);
      onChange(newValue);

      setTimeout(() => {
        const newPos = selectionStart + 1 + leadingSpaces.length + extraIndent.length;
        textarea.selectionStart = textarea.selectionEnd = newPos;
      }, 0);
    }

    // Tab for indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const { selectionStart, selectionEnd } = textarea;
      const safeValue = value || '';

      if (selectionStart === selectionEnd) {
        // Insert 2 spaces
        const newValue = safeValue.substring(0, selectionStart) + '  ' + safeValue.substring(selectionStart);
        onChange(newValue);
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = selectionStart + 2;
        }, 0);
      }
    }
  };

  const findNext = () => {
    if (matches.length > 0) {
      setCurrentMatchIndex((prev) => (prev + 1) % matches.length);
    }
  };

  const findPrevious = () => {
    if (matches.length > 0) {
      setCurrentMatchIndex((prev) => (prev - 1 + matches.length) % matches.length);
    }
  };

  const replaceOne = () => {
    if (matches.length > 0 && currentMatchIndex < matches.length) {
      const match = matches[currentMatchIndex];
      const safeValue = value || '';
      const newValue = safeValue.substring(0, match.index) + replaceTerm + safeValue.substring(match.index + match.length);
      onChange(newValue);
    }
  };

  const replaceAll = () => {
    if (searchTerm) {
      const flags = matchCase ? 'g' : 'gi';
      const regex = new RegExp(searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
      const safeValue = value || '';
      const newValue = safeValue.replace(regex, replaceTerm);
      onChange(newValue);
      setSearchTerm('');
    }
  };

  // Generate indent guides
  const renderIndentGuides = () => {
    const safeValue = value || '';
    const lines = safeValue.split('\n');
    const guides = [];
    const charWidth = 8.4;
    const lineHeight = 21;

    // Calculate dimensions
    const svgHeight = lines.length * lineHeight;
    const maxIndent = Math.max(0, ...lines.map(line => {
      const spaces = line.match(/^\s*/)?.[0].length || 0;
      return Math.floor(spaces / 2);
    }));
    const svgWidth = maxIndent * 2 * charWidth + 500;

    lines.forEach((line, index) => {
      const spaces = line.match(/^\s*/)?.[0].length || 0;
      const indentLevel = Math.floor(spaces / 2);

      for (let level = 1; level <= indentLevel; level++) {
        const x = level * 2 * charWidth;
        const y = index * lineHeight;

        guides.push(
          <line
            key={`${index}-${level}`}
            x1={x}
            y1={y}
            x2={x}
            y2={y + lineHeight}
            stroke="#e1e5e9"
            strokeWidth="1"
            opacity="0.6"
          />
        );
      }
    });

    return { guides, svgWidth, svgHeight };
  };

  // Emit cursor position on click and keyup
  const emitCursorPosition = useCallback(() => {
    if (!onCursorChange || !textareaRef.current) return;
    const textarea = textareaRef.current;
    const text = textarea.value || '';
    const { selectionStart, selectionEnd } = textarea;

    // Convert character offset to line/ch
    const beforeCursor = text.slice(0, selectionStart);
    const line = beforeCursor.split('\n').length - 1;
    const ch = selectionStart - beforeCursor.lastIndexOf('\n') - 1;

    onCursorChange({ line, ch, selectionStart, selectionEnd });
  }, [onCursorChange]);

  // Render remote cursors
  const renderRemoteCursors = () => {
    const entries = Object.entries(remoteCursors || {});
    if (entries.length === 0) return null;

    const charWidth = 8.4;
    const lineHeight = 21;
    const padding = 20; // must match .yaml-textarea padding

    return (
      <div className="remote-cursors-container">
        {entries.map(([socketId, { username, color, cursor }]) => {
          if (!cursor) return null;
          const { line, ch, selectionStart, selectionEnd } = cursor;
          const top = line * lineHeight + padding;
          const left = ch * charWidth + padding;

          return (
            <React.Fragment key={socketId}>
              {/* Cursor line */}
              <div
                className="remote-cursor"
                style={{ top, left }}
              >
                <div
                  className="remote-cursor-line"
                  style={{ backgroundColor: color }}
                />
                <div
                  className="remote-cursor-label"
                  style={{ backgroundColor: color }}
                >
                  {username}
                </div>
              </div>
              {/* Selection highlight */}
              {selectionStart !== selectionEnd && (
                <div
                  className="remote-selection"
                  style={{
                    backgroundColor: color,
                    top,
                    left,
                    width: Math.abs(selectionEnd - selectionStart) * charWidth,
                    height: lineHeight,
                  }}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  return (
    <div className="yaml-editor-wrapper">
      <div className="editor-toolbar">
        <div className="toolbar-left">
          <span className="toolbar-label">📝 YAML Editor</span>
          {readOnly ? <span>Read-only</span> : <span className="toolbar-hint">Auto saved to Local Storage</span>}
        </div>
        <div className="toolbar-right">
          {onCopy && (
            <button
              className="search-toggle-btn"
              onClick={onCopy}
              title="Copy editor content to clipboard"
              disabled={!value}
            >
              {copyLabel || '📋 Copy'}
            </button>
          )}
          <button
            className="search-toggle-btn"
            onClick={() => {
              if (showSearchReplace) {
                closeSearchReplace();
              } else {
                setShowSearchReplace(true);
              }
            }}
            title="Search & Replace (Ctrl+F)"
          >
            🔍 Search
          </button>
        </div>
      </div>

      {showSearchReplace && (
        <div className="search-replace-panel">
          <div className="search-row">
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button onClick={findPrevious} disabled={matches.length === 0} title="Previous">↑</button>
            <button onClick={findNext} disabled={matches.length === 0} title="Next">↓</button>
            <span className="match-count">
              {matches.length > 0 ? `${currentMatchIndex + 1}/${matches.length}` : '0/0'}
            </span>
            <label className="match-case-label">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={(e) => setMatchCase(e.target.checked)}
              />
              Match case
            </label>
          </div>
          <div className="replace-row">
            <input
              type="text"
              placeholder="Replace with..."
              value={replaceTerm}
              onChange={(e) => setReplaceTerm(e.target.value)}
              className="replace-input"
            />
            <button onClick={replaceOne} disabled={matches.length === 0}>Replace</button>
            <button onClick={replaceAll} disabled={matches.length === 0}>Replace All</button>
            <button onClick={closeSearchReplace} className="close-search">✕</button>
          </div>
        </div>
      )}

      <div className="editor-with-lines">
        <div ref={lineNumbersRef} className="line-numbers">
          {Array.from({ length: lineCount }, (_, i) => (
            <div key={i + 1}>{i + 1}</div>
          ))}
        </div>
        <div className="editor-text-container">
          {(() => {
            const { guides, svgWidth, svgHeight } = renderIndentGuides();
            return (
              <svg
                ref={guidesRef}
                className="indent-guides-svg"
                width={svgWidth}
                height={svgHeight}
              >
                {guides}
              </svg>
            );
          })()}
          <div
            ref={highlighterRef}
            className="syntax-highlighter"
          />
          {renderRemoteCursors()}
          <textarea
            ref={textareaRef}
            className="yaml-textarea"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onScroll={handleScroll}
            onClick={emitCursorPosition}
            onKeyUp={emitCursorPosition}
            onSelect={emitCursorPosition}
            spellCheck={false}
            placeholder="# Enter your YAML here..."
            readOnly={readOnly}
          />
        </div>
      </div>
    </div>
  );
}