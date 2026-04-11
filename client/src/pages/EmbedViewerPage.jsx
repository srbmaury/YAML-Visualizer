import React, { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import DiagramViewer from "../components/DiagramViewer";
import apiService from "../services/apiService";
import yaml from "js-yaml";
import { buildTreeFromYAML, convertToD3Hierarchy } from "../utils/treeBuilder";
import { validateYAML } from "../utils/yamlValidator";
import { useTheme } from "../hooks/useTheme";
import "./EmbedViewer.css";

export default function EmbedViewerPage() {
  const { shareId } = useParams();
  const { darkMode } = useTheme();
  const [yamlText, setYamlText] = useState("");
  const [parsedData, setParsedData] = useState(null);
  const [treeInfo, setTreeInfo] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fileTitle, setFileTitle] = useState("");

  useEffect(() => {
    const fetchSharedYaml = async () => {
      try {
        setLoading(true);
        setError("");

        const response = await apiService.getSharedYamlFile(shareId);

        if (response.yamlFile) {
          const content = response.yamlFile.content || "";
          const title = response.yamlFile.title || "Untitled";
          setYamlText(content);
          setFileTitle(title);

          // Auto-visualize the YAML
          try {
            const result = validateYAML(content);
            if (result.valid) {
              const parsedData = yaml.load(content);
              const treeData = buildTreeFromYAML(parsedData);
              const d3Data = convertToD3Hierarchy(treeData);
              setParsedData(d3Data);
              setTreeInfo(treeData.treeInfo);
              setError("");
            } else {
              const errorMessages = result.issues ? result.issues.map(issue => issue.message) : ["YAML validation failed"];
              setError(errorMessages.join(", "));
            }
          } catch (vizError) {
            setError("Failed to visualize: " + vizError.message);
          }
        } else {
          setError("Shared file not found");
        }
      } catch (err) {
        console.error("Error fetching shared YAML:", err);
        if (err.response?.status === 404) {
          setError("Shared file not found");
        } else if (err.response?.status === 403) {
          setError("Access denied - this file is private");
        } else {
          setError("Failed to load shared file");
        }
      } finally {
        setLoading(false);
      }
    };

    if (shareId) {
      fetchSharedYaml();
    } else {
      setError("Invalid share ID");
      setLoading(false);
    }
  }, [shareId]);

  if (loading) {
    return (
      <div className={`embed-viewer ${darkMode ? 'dark' : 'light'}`}>
        <div className="embed-loading">
          <div className="embed-spinner"></div>
          <p>Loading visualization...</p>
        </div>
      </div>
    );
  }

  if (error && !parsedData) {
    return (
      <div className={`embed-viewer ${darkMode ? 'dark' : 'light'}`}>
        <div className="embed-error">
          <div className="embed-error-icon">⚠️</div>
          <p>{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`embed-viewer ${darkMode ? 'dark' : 'light'}`}>
      {/* Full diagram view with all controls */}
      <div className="embed-diagram">
        {parsedData ? (
          <DiagramViewer
            data={parsedData}
            treeInfo={treeInfo}
            hideSearch={false}
            embedMode={false}
          />
        ) : (
          <div className="embed-placeholder">
            <div className="embed-placeholder-icon">📊</div>
            <p>No visualization available</p>
          </div>
        )}
      </div>
    </div>
  );
}
