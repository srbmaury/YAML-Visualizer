import { useState, useCallback } from 'react';
import apiService from '../services/apiService';
import { useAuth } from './useAuth';

export const useYamlFiles = () => {
  const [savedGraphs, setSavedGraphs] = useState([]);
  const [sharedGraphs, setSharedGraphs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { isAuthenticated } = useAuth();

  // Load saved graphs from backend
  const loadSavedGraphs = useCallback(async () => {
    if (!isAuthenticated) {
      setSavedGraphs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiService.getMyYamlFiles();
      const graphs = response.yamlFiles.map(file => ({
        id: file._id,
        title: file.title,
        description: file.description,
        content: file.content,
        shareId: file.shareId,
        isPublic: file.isPublic,
        owner: file.owner,
        accessLevel: 'owner',
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        tags: file.tags || []
      }));
      setSavedGraphs(graphs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Load graphs shared with current user from backend
  const loadSharedWithMeGraphs = useCallback(async () => {
    if (!isAuthenticated) {
      setSharedGraphs([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiService.getSharedWithMeYamlFiles();
      const graphs = response.yamlFiles.map(file => ({
        id: file._id,
        title: file.title,
        description: file.description,
        content: file.content,
        shareId: file.shareId,
        isPublic: file.isPublic,
        owner: file.owner,
        accessLevel: file.accessLevel || 'view',
        createdAt: file.createdAt,
        updatedAt: file.updatedAt,
        tags: file.tags || []
      }));
      setSharedGraphs(graphs);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Save a new graph
  const saveGraph = useCallback(async (graphData) => {
    if (!isAuthenticated) {
      throw new Error('Authentication required to save graphs');
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiService.saveYamlFile({
        title: graphData.title,
        content: graphData.yamlContent,
        description: graphData.description || '',
        isPublic: graphData.isPublic || false,
        tags: graphData.tags || []
      });

      // After saving, reload all graphs from backend to ensure IDs are correct
      await loadSavedGraphs();

      const newGraph = {
        id: response.yamlFile._id,
        title: response.yamlFile.title,
        description: graphData.description || '',
        content: graphData.yamlContent, // Use the content we sent
        shareId: response.yamlFile.shareId,
        isPublic: response.yamlFile.isPublic || graphData.isPublic,
        createdAt: response.yamlFile.createdAt,
        updatedAt: response.yamlFile.createdAt, // Use createdAt for new files
        tags: graphData.tags || []
      };

      return newGraph;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, loadSavedGraphs]);

  // Update an existing graph
  const updateGraph = useCallback(async (id, graphData) => {
    if (!isAuthenticated) {
      throw new Error('Authentication required to update graphs');
    }

    setLoading(true);
    setError(null);

    try {
      const response = await apiService.updateYamlFile(id, {
        title: graphData.title,
        content: graphData.yamlContent,
        description: graphData.description || '',
        isPublic: graphData.isPublic || false,
        tags: graphData.tags || []
      });

      // After updating, reload all graphs from backend to ensure IDs are correct
      await loadSavedGraphs();

      const updatedGraph = {
        id: response.yamlFile._id || id, // Use _id from response or fallback to the one we sent
        title: response.yamlFile.title,
        description: graphData.description || '',
        content: graphData.yamlContent, // Use the content we sent, not from response
        shareId: response.yamlFile.shareId,
        isPublic: response.yamlFile.isPublic || graphData.isPublic,
        createdAt: response.yamlFile.createdAt || new Date().toISOString(),
        updatedAt: response.yamlFile.updatedAt,
        tags: graphData.tags || []
      };

      return updatedGraph;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated, loadSavedGraphs]);

  // Delete a graph
  const deleteGraph = useCallback(async (id) => {
    if (!isAuthenticated) {
      throw new Error('Authentication required to delete graphs');
    }

    setLoading(true);
    setError(null);

    try {
      await apiService.deleteYamlFile(id);
      setSavedGraphs(prev => prev.filter(graph => graph.id !== id));
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [isAuthenticated]);

  // Load a shared graph
  const loadSharedGraph = useCallback(async (shareId) => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiService.getSharedYamlFile(shareId);
      return {
        id: response.yamlFile._id,
        title: response.yamlFile.title,
        description: response.yamlFile.description,
        content: response.yamlFile.content,
        shareId: response.yamlFile.shareId,
        isPublic: response.yamlFile.isPublic,
        createdAt: response.yamlFile.createdAt,
        updatedAt: response.yamlFile.updatedAt,
        tags: response.yamlFile.tags || [],
        owner: response.yamlFile.owner
      };
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // Clear saved graphs (for logout)
  const clearSavedGraphs = useCallback(() => {
    setSavedGraphs([]);
    setSharedGraphs([]);
    setError(null);
  }, []);

  return {
    savedGraphs,
    sharedGraphs,
    loading,
    error,
    loadSavedGraphs,
    loadSharedWithMeGraphs,
    saveGraph,
    updateGraph,
    deleteGraph,
    loadSharedGraph,
    clearSavedGraphs,
  };
};