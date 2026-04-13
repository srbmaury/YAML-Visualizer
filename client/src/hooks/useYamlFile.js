import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import apiService from '../services/apiService';

/**
 * Custom hook to load a YAML file by ID from URL params
 * @param {function} setYamlText - Function to update the yamlText state
 * @param {boolean} isAuthenticated - Whether the user is authenticated
 * @param {boolean} authLoading - Whether auth is still initializing
 * @returns {object} - { loading, error, fileData, loadFile }
 */
export const useYamlFile = (setYamlText, isAuthenticated, authLoading = false) => {
  const { id } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fileData, setFileData] = useState(null);

  const loadFile = useCallback(async (fileId) => {
    if (!fileId || !isAuthenticated) return;

    setLoading(true);
    setError(null);

    try {
      // Validate ID format on frontend before making request
      if (!fileId.match(/^[0-9a-fA-F]{24}$/)) {
        setError('Invalid file ID format');
        setLoading(false);
        return;
      }

      const response = await apiService.getYamlFile(fileId);

      if (response.yamlFile) {
        const { yamlFile } = response;
        setFileData(yamlFile);
        // Only set YAML text if user has access
        let userId = null;
        try {
          userId = JSON.parse(localStorage.getItem('user_data'))?.id ?? null;
        } catch {
          // Ignore localStorage parse errors
        }
        const isOwner = userId && yamlFile.owner && (yamlFile.owner.toString() === userId.toString());
        const perm = yamlFile.permissions?.[userId] || yamlFile.permissions?.get?.(userId) || null;
        if (setYamlText && yamlFile.content && (isOwner || perm === 'edit' || perm === 'view')) {
          setYamlText(yamlFile.content);
        }
      }
    } catch (err) {
      console.error('Error loading YAML file:', err);

      // Handle specific error types
      let errorMessage = 'Failed to load file';

      if (err.message?.includes('Invalid ID format') || err.message?.includes('Invalid file ID')) {
        errorMessage = 'Invalid file ID format';
      } else if (err.message?.includes('Access denied') || err.message?.includes('permission')) {
        errorMessage = 'Access denied. You do not have permission to view this file.';
      } else if (err.message?.includes('not found')) {
        errorMessage = 'File not found or you do not have permission to access it';
      } else if (err.message?.includes('Network Error') || err.message?.includes('fetch')) {
        errorMessage = 'Unable to connect to server. Please check your connection.';
      } else if (err.message?.includes('Unauthorized')) {
        errorMessage = 'Authentication required. Please log in.';
      }

      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, setYamlText]);

  // Auto-load file when ID changes
  useEffect(() => {
    const loadFileById = async () => {
      // Clear fileData when there's no ID
      if (!id) {
        setFileData(null);
        setError(null);
        setLoading(false);
        return;
      }

      if (!isAuthenticated) {
        // If auth is still loading, keep loading state true so UI shows a loader
        if (authLoading) {
          setLoading(true);
        } else {
          setFileData(null);
          setError(null);
          setLoading(false);
        }
        return;
      }

      setLoading(true);
      setError(null);

      try {
        // Validate ID format on frontend before making request
        if (!id.match(/^[0-9a-fA-F]{24}$/)) {
          setError('Invalid file ID format');
          setLoading(false);
          return;
        }

        const response = await apiService.getYamlFile(id);

        if (response.yamlFile) {
          const { yamlFile } = response;
          setFileData(yamlFile);

          // Update the YAML text with the loaded content
          if (setYamlText && yamlFile.content) {
            setYamlText(yamlFile.content);
          }
        }
      } catch (err) {
        console.error('Error loading YAML file:', err);

        // Handle specific error types
        let errorMessage = 'Failed to load file';

        if (err.message?.includes('Invalid ID format') || err.message?.includes('Invalid file ID')) {
          errorMessage = 'Invalid file ID format';
        } else if (err.message?.includes('Access denied') || err.message?.includes('permission')) {
          errorMessage = 'Access denied. You do not have permission to view this file.';
        } else if (err.message?.includes('not found')) {
          errorMessage = 'File not found or you do not have permission to access it';
        } else if (err.message?.includes('Network Error') || err.message?.includes('fetch')) {
          errorMessage = 'Unable to connect to server. Please check your connection.';
        } else if (err.message?.includes('Unauthorized')) {
          errorMessage = 'Authentication required. Please log in.';
        }

        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadFileById();
  }, [id, isAuthenticated, authLoading, setYamlText]);

  // Listen for force reload events
  useEffect(() => {
    const handleForceReload = (event) => {
      const { fileId } = event.detail;
      // Only reload if the event is for the current file
      if (fileId === id && isAuthenticated) {
        loadFile(fileId);
      }
    };

    window.addEventListener('forceReloadYamlFile', handleForceReload);
    return () => {
      window.removeEventListener('forceReloadYamlFile', handleForceReload);
    };
  }, [id, isAuthenticated, loadFile]);

  return {
    loading,
    error,
    fileData,
    loadFile,
    reloadFile: () => loadFile(id), // Add a reload function that uses current ID
    fileId: id
  };
};

export default useYamlFile;