import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useToast } from "../hooks/useToast";
import { useTheme } from "../hooks/useTheme";
import apiService from "../services/apiService";
import CustomSelect from "../components/CustomSelect";
import FilterBar from "../components/FilterBar";
import "./PublicGraphsPage.css";

export default function PublicGraphsPage() {
  const navigate = useNavigate();
  const { showError } = useToast();
  const { darkMode } = useTheme();

  const [graphs, setGraphs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState("createdAt");
  const [currentPage, setCurrentPage] = useState(1);
  const [activeFilters, setActiveFilters] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    pages: 0,
  });

  const loadPublicGraphs = async (page = 1, search = "", sort = "createdAt", filters = []) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 12,
        ...(search && { search }),
        sortBy: sort,
      };

      // Add filter params
      const authorFilters = filters.filter(f => f.type === 'author').map(f => f.value);
      const tagFilters = filters.filter(f => f.type === 'tag').map(f => f.value);

      if (authorFilters.length > 0) {
        params.author = authorFilters.join(',');
      }
      if (tagFilters.length > 0) {
        params.tags = tagFilters.join(',');
      }

      const response = await apiService.getPublicYamlFiles(params);
      setGraphs(response.yamlFiles || []);
      setPagination(response.pagination || { page: 1, limit: 12, total: 0, pages: 0 });
    } catch (error) {
      console.error("Failed to load public graphs:", error);
      showError("Failed to load public graphs: " + error.message);
      setGraphs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPublicGraphs(currentPage, searchTerm, sortBy, activeFilters);
  }, [currentPage, sortBy, activeFilters]);

  const handleSearch = (e) => {
    e.preventDefault();
    setCurrentPage(1);
    loadPublicGraphs(1, searchTerm, sortBy, activeFilters);
  };

  const handleFilterChange = (action) => {
    let newFilters = activeFilters;

    if (action.type === 'clear') {
      newFilters = [];
    } else if (action.type === 'remove') {
      newFilters = activeFilters.filter(f =>
        !(f.type === action.filter.type && f.value === action.filter.value)
      );
    } else {
      // Add filter
      const newFilter = { type: action.type, value: action.value };
      // Check if filter already exists
      const exists = activeFilters.some(f =>
        f.type === newFilter.type && f.value === newFilter.value
      );
      if (!exists) {
        newFilters = [...activeFilters, newFilter];
      } else {
        newFilters = activeFilters;
      }
    }

    setActiveFilters(newFilters);
    setCurrentPage(1);
    // Manually trigger load with new filters
    loadPublicGraphs(1, searchTerm, sortBy, newFilters);
  };

  const handleViewGraph = (shareId) => {
    navigate(`/shared/${shareId}`);
  };

  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? "s" : ""} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? "s" : ""} ago`;
    if (diffDays < 30) return `${diffDays} day${diffDays !== 1 ? "s" : ""} ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={`public-graphs-page ${darkMode ? "dark-mode" : ""}`}>
      <div className="public-graphs-header">
        <div className="header-content">
          <button className="back-button" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h1>Explore Public Graphs</h1>
          <p className="subtitle">Discover and view graphs shared by the community</p>
        </div>

        <FilterBar
          onFilterChange={handleFilterChange}
          activeFilters={activeFilters}
        />

        <div className="controls-row">
          <form onSubmit={handleSearch} className="search-form">
            <input
              type="text"
              placeholder="Search by title, description, or tags..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            <button type="submit" className="search-button">
              Search
            </button>
            {searchTerm && (
              <button
                type="button"
                className="clear-button"
                onClick={() => {
                  setSearchTerm("");
                  setCurrentPage(1);
                  loadPublicGraphs(1, "", sortBy, activeFilters);
                }}
              >
                Clear
              </button>
            )}
          </form>

          <CustomSelect
            label="Sort by:"
            value={sortBy}
            onChange={(value) => {
              setSortBy(value);
              setCurrentPage(1);
            }}
            options={[
              { value: "createdAt", label: "Newest First" },
              { value: "views", label: "Most Viewed" },
              { value: "title", label: "Title (A-Z)" },
            ]}
          />
        </div>
      </div>

      <div className="public-graphs-content">
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading public graphs...</p>
          </div>
        ) : graphs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">📊</div>
            <h2>{searchTerm ? "No graphs found" : "No public graphs yet"}</h2>
            <p>
              {searchTerm
                ? "Try a different search term or clear your search"
                : "Be the first to share a graph with the community!"}
            </p>
          </div>
        ) : (
          <>
            <div className="graphs-grid">
              {graphs.map((graph) => (
                <div
                  key={graph._id}
                  className="graph-card"
                  onClick={() => handleViewGraph(graph.shareId)}
                >
                  <div className="graph-card-header">
                    <h3 className="graph-title">{graph.title}</h3>
                    <div className="graph-views">
                      <span className="view-icon">👁</span>
                      <span>{graph.views || 0}</span>
                    </div>
                  </div>

                  {graph.description && (
                    <p className="graph-description">{graph.description}</p>
                  )}

                  {graph.tags && graph.tags.length > 0 && (
                    <div className="graph-tags">
                      {graph.tags.slice(0, 3).map((tag, index) => (
                        <span key={index} className="tag">
                          {tag}
                        </span>
                      ))}
                      {graph.tags.length > 3 && (
                        <span className="tag more-tags">
                          +{graph.tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="graph-card-footer">
                    <div className="graph-owner">
                      <span className="owner-icon">👤</span>
                      <span className="owner-name">
                        {graph.owner?.username || "Unknown"}
                      </span>
                    </div>
                    <div className="graph-date">
                      {formatDate(graph.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {pagination.pages > 1 && (
              <div className="pagination">
                <button
                  className="page-button"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  ← Previous
                </button>

                <div className="page-numbers">
                  {Array.from({ length: Math.min(5, pagination.pages) }, (_, i) => {
                    let pageNum;
                    if (pagination.pages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= pagination.pages - 2) {
                      pageNum = pagination.pages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        className={`page-number ${
                          currentPage === pageNum ? "active" : ""
                        }`}
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  className="page-button"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === pagination.pages}
                >
                  Next →
                </button>
              </div>
            )}

            <div className="results-info">
              Showing {(currentPage - 1) * pagination.limit + 1}-
              {Math.min(currentPage * pagination.limit, pagination.total)} of{" "}
              {pagination.total} graph{pagination.total !== 1 ? "s" : ""}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
