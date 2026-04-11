import React, { useEffect, useState, useRef } from "react";
import apiService from "../services/apiService";
import PropTypes from "prop-types";
import "./styles/DiagramTimeTravel.css";

/**
 * DiagramTimeTravel
 * Timeline/slider for visualizing YAML diagram at different versions
 * Props:
 *   fileId: string (YAML file ID)
 *   onVersionChange: function(versionNumber, yamlContent)
 *   refreshKey: bump when new versions may exist (e.g. after GitHub sync) so the list reloads
 */
export default function DiagramTimeTravel({ fileId, onVersionChange, refreshKey = 0 }) {
    const [versions, setVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [loading, setLoading] = useState(false);
    const lastContentRef = useRef("");
    const debounceTimeout = useRef(null);

    // Fetch version history on mount, fileId change, or after remote sync (refreshKey)
    useEffect(() => {
        if (!fileId) return;
        setLoading(true);
        apiService.getVersionHistory(fileId, { limit: 50 })
            .then((res) => {
                setVersions(res.versions || []);
                if (res.versions && res.versions.length > 0) {
                    const latest = res.versions[0].version;
                    setSelectedVersion(latest);
                }
            })
            .finally(() => setLoading(false));
    }, [fileId, refreshKey]);

    // Debounced fetch for version content
    useEffect(() => {
        if (!fileId || !selectedVersion) return;
        setLoading(true);
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(() => {
            apiService.getVersion(fileId, selectedVersion)
                .then((res) => {
                    if (
                        onVersionChange &&
                        (lastContentRef.current !== res.content || lastContentRef.current === "")
                    ) {
                        lastContentRef.current = res.content;
                        onVersionChange(selectedVersion, res.content);
                    }
                })
                .finally(() => setLoading(false));
        }, 200); // 200ms debounce
        return () => {
            if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        };
    }, [fileId, selectedVersion, onVersionChange]);

    if (!fileId) return null;
    return (
        <div className="diagram-time-travel">
            <label htmlFor="version-slider">Time Travel:</label>
            {loading && <span style={{ marginLeft: 8 }}>⏳</span>}
            <input
                id="version-slider"
                type="range"
                min={versions.length > 0 ? versions[versions.length - 1].version : 1}
                max={versions.length > 0 ? versions[0].version : 1}
                value={selectedVersion || 1}
                onChange={e => setSelectedVersion(Number(e.target.value))}
                disabled={loading || versions.length === 0}
                style={{ width: 200, margin: '0 12px' }}
            />
            <span style={{ marginLeft: 8 }}>
                v{selectedVersion || 1} / v{versions.length > 0 ? versions[0].version : 1}
            </span>
        </div>
    );
}

DiagramTimeTravel.propTypes = {
    fileId: PropTypes.string.isRequired,
    onVersionChange: PropTypes.func.isRequired,
    refreshKey: PropTypes.number,
};
