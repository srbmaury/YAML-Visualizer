import React, { useEffect, useState, useRef, useId, useCallback } from "react";
import apiService from "../services/apiService";
import PropTypes from "prop-types";
import "./styles/DiagramTimeTravel.css";

const storageKeyForFile = (fileId) => `yaml-viz-tt-version-${fileId}`;

function formatOptionLabel(v) {
  const num = `v${v.version}`;
  if (!v.createdAt) return num;
  try {
    const d = new Date(v.createdAt);
    if (Number.isNaN(d.getTime())) return num;
    return `${num} — ${d.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" })}`;
  } catch {
    return num;
  }
}

/**
 * DiagramTimeTravel — pick a YAML version (custom dropdown, opens downward) and load its content.
 */
export default function DiagramTimeTravel({ fileId, onVersionChange, refreshKey = 0, variant = "default", className = "" }) {
  const labelId = useId();
  const listboxId = useId();
  const dropdownRef = useRef(null);

  const [versions, setVersions] = useState([]);
  const [selectedVersion, setSelectedVersion] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [fetchingContent, setFetchingContent] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const lastContentRef = useRef("");
  const debounceTimeout = useRef(null);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocPointerDown = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        closeMenu();
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") closeMenu();
    };
    document.addEventListener("mousedown", onDocPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen, closeMenu]);

  useEffect(() => {
    if (!fileId) return;
    setHistoryLoading(true);
    apiService
      .getVersionHistory(fileId, { limit: 50 })
      .then((res) => {
        const list = res.versions || [];
        setVersions(list);
        if (list.length > 0) {
          let next = list[0].version;
          try {
            const raw = sessionStorage.getItem(storageKeyForFile(fileId));
            if (raw != null) {
              const saved = Number(raw);
              if (!Number.isNaN(saved) && list.some((x) => x.version === saved)) {
                next = saved;
              }
            }
          } catch {
            /* ignore */
          }
          setSelectedVersion(next);
        } else {
          setSelectedVersion(null);
        }
      })
      .finally(() => setHistoryLoading(false));
  }, [fileId, refreshKey]);

  useEffect(() => {
    if (!fileId || selectedVersion == null) return;
    try {
      sessionStorage.setItem(storageKeyForFile(fileId), String(selectedVersion));
    } catch {
      /* ignore */
    }
  }, [fileId, selectedVersion]);

  useEffect(() => {
    if (!fileId || selectedVersion == null) return;
    let cancelled = false;
    setFetchingContent(true);
    if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
    debounceTimeout.current = setTimeout(() => {
      apiService
        .getVersion(fileId, selectedVersion)
        .then((res) => {
          if (cancelled) return;
          if (
            onVersionChange &&
            (lastContentRef.current !== res.content || lastContentRef.current === "")
          ) {
            lastContentRef.current = res.content;
            onVersionChange(selectedVersion, res.content);
          }
        })
        .finally(() => {
          if (!cancelled) setFetchingContent(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
        debounceTimeout.current = null;
      }
      setFetchingContent(false);
    };
  }, [fileId, selectedVersion, onVersionChange]);

  if (!fileId) return null;
  const rootClass = [
    "diagram-time-travel",
    variant !== "default" ? `diagram-time-travel--${variant}` : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  const disabled = historyLoading || versions.length === 0;
  const selectedEntry = versions.find((x) => x.version === selectedVersion);
  const triggerLabel = disabled
    ? historyLoading && versions.length === 0
      ? "Loading versions…"
      : "No version history"
    : selectedEntry
      ? formatOptionLabel(selectedEntry)
      : "Select version";

  const pickVersion = (versionNum) => {
    setSelectedVersion(versionNum);
    closeMenu();
  };

  return (
    <div className={rootClass}>
      <span className="diagram-time-travel-label" id={labelId}>
        Version
      </span>
      {(historyLoading || fetchingContent) && (
        <span className="diagram-time-travel-loading" aria-hidden title={fetchingContent ? "Loading YAML…" : ""}>
          ⏳
        </span>
      )}
      <div
        className="diagram-time-travel-dropdown"
        ref={dropdownRef}
      >
        <button
          type="button"
          className={`diagram-time-travel-trigger${menuOpen ? " diagram-time-travel-trigger--open" : ""}`}
          id={`${listboxId}-trigger`}
          aria-labelledby={labelId}
          aria-haspopup="listbox"
          aria-expanded={menuOpen}
          aria-controls={listboxId}
          disabled={disabled}
          onClick={() => {
            if (!disabled) setMenuOpen((o) => !o);
          }}
        >
          <span className="diagram-time-travel-trigger-text">{triggerLabel}</span>
          <span className="diagram-time-travel-chevron" aria-hidden>
            ▼
          </span>
        </button>
        {menuOpen && versions.length > 0 && (
          <ul
            id={listboxId}
            className="diagram-time-travel-menu"
            role="listbox"
            aria-labelledby={labelId}
          >
            {versions.map((v) => (
              <li key={v.version} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={v.version === selectedVersion}
                  className={`diagram-time-travel-option${v.version === selectedVersion ? " diagram-time-travel-option--selected" : ""}`}
                  onClick={() => pickVersion(v.version)}
                >
                  {formatOptionLabel(v)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

DiagramTimeTravel.propTypes = {
  fileId: PropTypes.string.isRequired,
  onVersionChange: PropTypes.func.isRequired,
  refreshKey: PropTypes.number,
  variant: PropTypes.oneOf(["default", "inline", "drawer"]),
  className: PropTypes.string,
};
