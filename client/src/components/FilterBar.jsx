import React, { useState } from 'react';
import './FilterBar.css';

export default function FilterBar({ onFilterChange, activeFilters }) {
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const [authorInput, setAuthorInput] = useState('');
  const [tagInput, setTagInput] = useState('');

  const handleAddAuthorFilter = () => {
    if (authorInput.trim()) {
      onFilterChange({ type: 'author', value: authorInput.trim() });
      setAuthorInput('');
      setShowFilterMenu(false);
    }
  };

  const handleAddTagFilter = () => {
    if (tagInput.trim()) {
      onFilterChange({ type: 'tag', value: tagInput.trim() });
      setTagInput('');
      setShowFilterMenu(false);
    }
  };

  const handleRemoveFilter = (filter) => {
    onFilterChange({ type: 'remove', filter });
  };

  const handleClearAll = () => {
    onFilterChange({ type: 'clear' });
  };

  return (
    <div className="filter-bar">
      <div className="filter-chips">
        {activeFilters.length === 0 && (
          <span className="no-filters-text">No filters applied</span>
        )}
        {activeFilters.map((filter, index) => (
          <div key={index} className={`filter-chip filter-chip-${filter.type}`}>
            <span className="filter-chip-label">
              {filter.type === 'author' ? '👤' : '🏷️'} {filter.type}: {filter.value}
            </span>
            <button
              className="filter-chip-remove"
              onClick={() => handleRemoveFilter(filter)}
              aria-label="Remove filter"
            >
              ×
            </button>
          </div>
        ))}
        {activeFilters.length > 0 && (
          <button className="clear-all-filters" onClick={handleClearAll}>
            Clear all
          </button>
        )}
      </div>

      <div className="filter-menu-wrapper">
        <button
          className="add-filter-btn"
          onClick={() => setShowFilterMenu(!showFilterMenu)}
        >
          + Add Filter
        </button>

        {showFilterMenu && (
          <div className="filter-menu">
            <div className="filter-menu-header">
              <h4>Add Filter</h4>
              <button
                className="filter-menu-close"
                onClick={() => setShowFilterMenu(false)}
              >
                ×
              </button>
            </div>

            <div className="filter-menu-section">
              <label>👤 Filter by Author</label>
              <div className="filter-input-group">
                <input
                  type="text"
                  placeholder="e.g., srbmaury"
                  value={authorInput}
                  onChange={(e) => setAuthorInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddAuthorFilter()}
                />
                <button onClick={handleAddAuthorFilter} disabled={!authorInput.trim()}>
                  Add
                </button>
              </div>
            </div>

            <div className="filter-menu-section">
              <label>🏷️ Filter by Tag</label>
              <div className="filter-input-group">
                <input
                  type="text"
                  placeholder="e.g., architecture"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddTagFilter()}
                />
                <button onClick={handleAddTagFilter} disabled={!tagInput.trim()}>
                  Add
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
