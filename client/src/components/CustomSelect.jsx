import React, { useState, useRef, useEffect } from 'react';
import './CustomSelect.css';

export default function CustomSelect({ value, onChange, options, label }) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (optionValue) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const selectedOption = options.find(opt => opt.value === value);

  return (
    <div className="custom-select-wrapper" ref={dropdownRef}>
      {label && <label className="custom-select-label">{label}</label>}
      <div
        className={`custom-select ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="custom-select-trigger">
          <span>{selectedOption?.label || 'Select...'}</span>
          <span className={`custom-select-arrow ${isOpen ? 'up' : 'down'}`}>
            {isOpen ? '▲' : '▼'}
          </span>
        </div>
        {isOpen && (
          <div className="custom-select-options">
            {options.map((option) => (
              <div
                key={option.value}
                className={`custom-select-option ${value === option.value ? 'selected' : ''}`}
                onClick={() => handleSelect(option.value)}
              >
                <span className="option-label">{option.label}</span>
                {value === option.value && <span className="option-check">✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
