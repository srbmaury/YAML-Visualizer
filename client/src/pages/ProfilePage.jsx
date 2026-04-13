import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { useToast } from "../hooks/useToast";
import apiService from "../services/apiService";
import { useTheme } from "../hooks/useTheme";
import "./ProfilePage.css";

export default function ProfilePage() {
  const PAGE_SIZE = 8;
  const navigate = useNavigate();
  const { logout, isAuthenticated: contextIsAuthenticated, updateUser } = useAuth();
  const { showSuccess, showError } = useToast();
  const { darkMode, toggleDarkMode } = useTheme();

  const [profileData, setProfileData] = useState(null);
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');
  const [profileFilesPage, setProfileFilesPage] = useState(1);
  const [recentFilesPage, setRecentFilesPage] = useState(1);
  const [popularFilesPage, setPopularFilesPage] = useState(1);

  // If user is not authenticated via context, redirect immediately
  useEffect(() => {
    if (!contextIsAuthenticated) {
      // Only show error if this wasn't triggered by a logout action
      const isLogoutAction = sessionStorage.getItem('logout_action');
      if (!isLogoutAction) {
        showError('You must be logged in to view your profile.');
      } else {
        sessionStorage.removeItem('logout_action');
      }
      navigate('/');
      return;
    }
  }, [contextIsAuthenticated, navigate, showError]);

  // Profile editing state
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({
    username: '',
    email: ''
  });

  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  // Delete account state
  const [deletePassword, setDeletePassword] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const loadProfileData = async () => {
    try {
      const response = await apiService.getUserProfile();
      setProfileData(response);
      setEditData({
        username: response.user.username,
        email: response.user.email
      });
    } catch (error) {
      console.error('Profile load error:', error);
      if (error.message.includes('401') || error.message.includes('No token') || error.message.includes('authorization denied')) {
        showError('Session expired. Please login again.');
        logout();
        navigate('/');
      } else {
        showError('Failed to load profile data: ' + error.message);
      }
    }
  };

  const loadDashboardData = async () => {
    try {
      const response = await apiService.getDashboard();
      setDashboardData(response);
    } catch (error) {
      console.error('Dashboard load error:', error);
      if (error.message.includes('401') || error.message.includes('No token') || error.message.includes('authorization denied')) {
        showError('Session expired. Please login again.');
        logout();
        navigate('/');
      } else {
        showError('Failed to load dashboard data: ' + error.message);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Only load data if user is authenticated
    if (contextIsAuthenticated) {
      loadProfileData();
      loadDashboardData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextIsAuthenticated]);

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    try {
      const response = await apiService.updateUserProfile(editData);
      setProfileData(prev => ({ ...prev, user: response.user }));
      // Update the user in AuthContext so it reflects in the header immediately
      updateUser(response.user);
      setEditMode(false);
      showSuccess('Profile updated successfully');
    } catch (error) {
      showError(error.message || 'Failed to update profile');
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      showError('New passwords do not match');
      return;
    }

    try {
      await apiService.changePassword({
        currentPassword: passwordData.currentPassword,
        newPassword: passwordData.newPassword
      });
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      showSuccess('Password changed successfully');
    } catch (error) {
      showError(error.message || 'Failed to change password');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      await apiService.deleteAccount({ password: deletePassword });
      showSuccess('Account deleted successfully');
      logout();
      navigate('/');
    } catch (error) {
      showError(error.message || 'Failed to delete account');
    }
  };

  const handleLoadFile = async (file) => {
    try {
      // Fetch the full file content
      const response = await apiService.getYamlFile(file._id);
      const fileData = response.yamlFile;

      // Navigate to the editor with the file ID in the URL
      // The success toast will be shown by App.jsx's useEffect
      navigate(`/editor/${file._id}`, {
        state: {
          yamlContent: fileData.content,
          fileName: fileData.title,
          fileId: file._id,
          loadFile: true
        }
      });
    } catch (error) {
      showError(error.message || 'Failed to load file');
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatCompactNumber = (value) => {
    return new Intl.NumberFormat('en-US', {
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value || 0);
  };

  const getInitials = (value) => {
    if (!value) return 'DV';

    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }

    return parts
      .slice(0, 2)
      .map((part) => part[0])
      .join('')
      .toUpperCase();
  };

  const getMonthLabel = (year, month) => {
    return new Date(year, month - 1, 1).toLocaleDateString('en-US', {
      month: 'short',
    });
  };

  const memberDays = profileData?.user?.createdAt
    ? Math.max(1, Math.floor((Date.now() - new Date(profileData.user.createdAt).getTime()) / (1000 * 60 * 60 * 24)))
    : 0;
  const publicShareRate = profileData?.stats?.totalFiles
    ? Math.round((profileData.stats.publicFiles / profileData.stats.totalFiles) * 100)
    : 0;
  const latestFile = dashboardData?.recentFiles?.[0] || profileData?.user?.yamlFiles?.[0] || null;
  const topFile = dashboardData?.popularFiles?.[0] || null;
  const recentViews = dashboardData?.recentFiles?.reduce((total, file) => total + (file.views || 0), 0) || 0;
  const peakMonthCount = Math.max(...((dashboardData?.filesByMonth || []).map((item) => item.count)), 1);
  const recentActivity = (dashboardData?.filesByMonth || []).length
    ? dashboardData.filesByMonth.map((item) => ({
      label: getMonthLabel(item._id.year, item._id.month),
      count: item.count,
      height: `${Math.max(20, Math.round((item.count / peakMonthCount) * 100))}%`,
    }))
    : [];
  const insightItems = [
    {
      label: 'Membership',
      value: memberDays > 0 ? `${memberDays} days active` : 'New member',
      tone: 'neutral',
    },
    {
      label: 'Visibility mix',
      value: `${publicShareRate}% public`,
      tone: 'accent',
    },
    {
      label: 'Recent momentum',
      value: `${formatCompactNumber(recentViews)} views across recent files`,
      tone: 'neutral',
    },
  ];

  const profileFiles = profileData?.user?.yamlFiles || [];
  const recentFiles = dashboardData?.recentFiles || [];
  const popularFiles = dashboardData?.popularFiles || [];

  const profileFilesTotalPages = Math.max(1, Math.ceil(profileFiles.length / PAGE_SIZE));
  const recentFilesTotalPages = Math.max(1, Math.ceil(recentFiles.length / PAGE_SIZE));
  const popularFilesTotalPages = Math.max(1, Math.ceil(popularFiles.length / PAGE_SIZE));

  const paginatedProfileFiles = profileFiles.slice((profileFilesPage - 1) * PAGE_SIZE, profileFilesPage * PAGE_SIZE);
  const paginatedRecentFiles = recentFiles.slice((recentFilesPage - 1) * PAGE_SIZE, recentFilesPage * PAGE_SIZE);
  const paginatedPopularFiles = popularFiles.slice((popularFilesPage - 1) * PAGE_SIZE, popularFilesPage * PAGE_SIZE);

  useEffect(() => {
    setProfileFilesPage(1);
  }, [profileFiles.length]);

  useEffect(() => {
    setRecentFilesPage(1);
  }, [recentFiles.length]);

  useEffect(() => {
    setPopularFilesPage(1);
  }, [popularFiles.length]);

  const renderPagination = (currentPage, totalPages, onPageChange) => {
    if (totalPages <= 1) return null;

    return (
      <div className="pagination-controls">
        <button
          className="pagination-btn"
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
        >
          Previous
        </button>
        <span className="pagination-status">Page {currentPage} of {totalPages}</span>
        <button
          className="pagination-btn"
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
        >
          Next
        </button>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="profile-container">
        <div className="profile-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h2>Loading Profile...</h2>
        </div>
        <div className="loading-state">
          <div className="profile-spinner">⟳</div>
          <p>Loading your profile data...</p>
        </div>
      </div>
    );
  }

  if (!profileData) {
    return (
      <div className="profile-container">
        <div className="profile-header">
          <button className="back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <h2>Profile Error</h2>
        </div>
        <div className="error-state">
          <p>Failed to load profile data. Please try again.</p>
          <button onClick={loadProfileData} className="retry-btn">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <button className="back-btn" onClick={() => navigate(-1)}>
          ← Back
        </button>
        <h2>User Profile</h2>
        <div className="profile-actions">
          <button className="back-btn" onClick={toggleDarkMode} title="Toggle dark mode">
            {darkMode ? '☀️' : '🌙'}
          </button>
          <button
            className="logout-btn"
            onClick={() => {
              // Set flag to indicate this is a logout action
              sessionStorage.setItem('logout_action', 'true');
              logout();
              navigate('/');
              // Show success message after navigation
              setTimeout(() => {
                showSuccess('You have been logged out successfully!');
              }, 100);
            }}
          >
            🚪 Logout
          </button>
        </div>
      </div>

      <div className="profile-content">
        <section className="profile-hero-card">
          <div className="profile-hero-main">
            <div className="profile-avatar-badge">{getInitials(profileData.user.username)}</div>
            <div className="profile-hero-copy">
              <span className="profile-eyebrow">Workspace profile</span>
              <h1>{profileData.user.username}</h1>
              <p>
                Managing {profileData.stats.totalFiles} diagram{profileData.stats.totalFiles === 1 ? '' : 's'} with{' '}
                {formatCompactNumber(profileData.stats.totalViews)} total view{profileData.stats.totalViews === 1 ? '' : 's'}.
              </p>
              <div className="profile-hero-meta">
                <span>{profileData.user.email}</span>
                <span>Joined {formatDate(profileData.user.createdAt)}</span>
                <span>{profileData.user.isVerified ? 'Verified account' : 'Account active'}</span>
              </div>
            </div>
          </div>

          <div className="profile-hero-side">
            <div className="hero-highlight-card">
              <span className="hero-highlight-label">Top file</span>
              <strong>{topFile?.title || 'No file activity yet'}</strong>
              <p>
                {topFile
                  ? `${formatCompactNumber(topFile.views)} views on your most visited diagram.`
                  : 'Create and share a diagram to start tracking engagement.'}
              </p>
            </div>
            <div className="hero-quick-actions">
              <button className="hero-action-btn" onClick={() => navigate('/')}>Open Editor</button>
              <button className="hero-action-btn secondary" onClick={() => setActiveTab('dashboard')}>View Activity</button>
            </div>
          </div>
        </section>

        <section className="profile-overview-strip">
          <div className="overview-stat-card">
            <span className="overview-stat-label">Files owned</span>
            <strong>{formatCompactNumber(profileData.stats.totalFiles)}</strong>
            <p>{profileData.stats.privateFiles} private, {profileData.stats.publicFiles} public</p>
          </div>
          <div className="overview-stat-card">
            <span className="overview-stat-label">Audience reach</span>
            <strong>{formatCompactNumber(profileData.stats.totalViews)}</strong>
            <p>Total views across all published work</p>
          </div>
          <div className="overview-stat-card">
            <span className="overview-stat-label">Latest update</span>
            <strong>{latestFile ? formatDate(latestFile.updatedAt || latestFile.createdAt) : 'No files yet'}</strong>
            <p>{latestFile ? latestFile.title : 'Your recent activity will appear here'}</p>
          </div>
        </section>

        <div className="profile-tabs">
          <button
            className={`tab ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            👤 Profile
          </button>
          <button
            className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            📊 Dashboard
          </button>
          <button
            className={`tab ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            🔒 Security
          </button>
        </div>

        <div className="tab-content">
          {activeTab === 'profile' && (
            <div className="profile-tab">
              <div className="profile-overview-grid">
                <div className="profile-summary-card">
                  <div className="card-header">
                    <h3>Profile Snapshot</h3>
                  </div>
                  <div className="profile-summary-list">
                    {insightItems.map((item) => (
                      <div key={item.label} className={`summary-pill ${item.tone}`}>
                        <span>{item.label}</span>
                        <strong>{item.value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="profile-summary-note">
                    {latestFile
                      ? `Last active on ${latestFile.title}.`
                      : 'Your first saved YAML diagram will unlock richer activity insights here.'}
                  </div>
                </div>

                <div className="profile-summary-card emphasis-card">
                  <div className="card-header">
                    <h3>Publishing Posture</h3>
                  </div>
                  <div className="sharing-meter">
                    <div className="sharing-meter-track">
                      <div className="sharing-meter-fill" style={{ width: `${publicShareRate}%` }}></div>
                    </div>
                    <div className="sharing-meter-labels">
                      <span>Private</span>
                      <strong>{publicShareRate}% public</strong>
                      <span>Public</span>
                    </div>
                  </div>
                  <p className="profile-summary-note">
                    {profileData.stats.totalFiles
                      ? `You currently expose ${profileData.stats.publicFiles} of ${profileData.stats.totalFiles} files for sharing.`
                      : 'You have not created any diagrams yet.'}
                  </p>
                </div>
              </div>

              <div className="profile-info-card">
                <div className="card-header">
                  <h3>Profile Information</h3>
                  <button
                    className={`edit-btn ${editMode ? 'cancel' : 'edit'}`}
                    onClick={() => setEditMode(!editMode)}
                  >
                    {editMode ? '✕ Cancel' : '✏️ Edit'}
                  </button>
                </div>

                {!editMode ? (
                  <div className="profile-display">
                    <div className="profile-field">
                      <label>Username</label>
                      <div className="field-value">{profileData.user.username}</div>
                    </div>
                    <div className="profile-field">
                      <label>Email</label>
                      <div className="field-value">{profileData.user.email}</div>
                    </div>
                    <div className="profile-field">
                      <label>Member Since</label>
                      <div className="field-value">{formatDate(profileData.user.createdAt)}</div>
                    </div>
                  </div>
                ) : (
                  <form onSubmit={handleProfileUpdate} className="profile-edit">
                    <div className="form-group">
                      <label>Username</label>
                      <input
                        type="text"
                        value={editData.username}
                        onChange={(e) => setEditData({ ...editData, username: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label>Email</label>
                      <input
                        type="email"
                        value={editData.email}
                        onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-actions">
                      <button type="submit" className="save-btn">
                        💾 Save Changes
                      </button>
                    </div>
                  </form>
                )}
              </div>

              <div className="stats-card">
                <div className="card-header">
                  <h3>Account Statistics</h3>
                </div>
                <div className="stats-grid">
                  <div className="stat-item">
                    <div className="stat-value">{profileData.stats.totalFiles}</div>
                    <div className="stat-label">Total Files</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{profileData.stats.publicFiles}</div>
                    <div className="stat-label">Public Files</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{profileData.stats.privateFiles}</div>
                    <div className="stat-label">Private Files</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{profileData.stats.totalViews}</div>
                    <div className="stat-label">Total Views</div>
                  </div>
                </div>
              </div>

              <div className="recent-files-card">
                <div className="card-header">
                  <h3>Recent Creations</h3>
                </div>
                {profileFiles.length > 0 ? (
                  <div className="files-list compact-files-list">
                    {paginatedProfileFiles.map((file) => (
                      <div
                        key={file._id}
                        className="file-item clickable"
                      >
                        <div
                          className="file-info"
                          onClick={() => handleLoadFile(file)}
                          title="Click to open in editor"
                        >
                          <div className="file-title">{file.title}</div>
                          {file.description && (
                            <div className="file-description">{file.description}</div>
                          )}
                          {file.tags && file.tags.length > 0 && (
                            <div className="file-tags">
                              {file.tags.map((tag, index) => (
                                <span key={index} className="file-tag">{tag}</span>
                              ))}
                            </div>
                          )}
                          <div className="file-meta">
                            <div className="file-meta-left">
                              <span className="file-date">Created {formatDate(file.createdAt)}</span>
                            </div>
                            <div className="file-meta-right">
                              <span className={`file-visibility ${file.isPublic ? 'public' : 'private'}`}>
                                {file.isPublic ? '🌐 Public' : '🔒 Private'}
                              </span>
                              <span className="file-views">👁️ {formatCompactNumber(file.views)} views</span>
                            </div>
                          </div>
                        </div>
                        <button
                          className="file-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${file.title}"? This cannot be undone.`)) {
                              apiService.deleteYamlFile(file._id)
                                .then(() => {
                                  showSuccess('File deleted successfully');
                                  loadProfileData();
                                  loadDashboardData();
                                })
                                .catch(err => showError('Failed to delete file: ' + err.message));
                            }
                          }}
                          title="Delete file"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                    {renderPagination(profileFilesPage, profileFilesTotalPages, setProfileFilesPage)}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>No saved diagrams yet. Use the editor to create your first one.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'dashboard' && dashboardData && (
            <div className="dashboard-tab">
              <div className="analytics-overview-grid">
                <div className="analytics-card wide-card">
                  <div className="card-header">
                    <h3>Creation Activity</h3>
                  </div>
                  {recentActivity.length > 0 ? (
                    <div className="activity-chart">
                      {recentActivity.map((item) => (
                        <div key={item.label} className="activity-bar-group">
                          <div className="activity-bar-track">
                            <div className="activity-bar" style={{ height: item.height }}></div>
                          </div>
                          <strong>{item.count}</strong>
                          <span>{item.label}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="empty-state left-align">
                      <p>No monthly creation activity yet. Save a few diagrams to see your momentum.</p>
                    </div>
                  )}
                </div>

                <div className="analytics-card">
                  <div className="card-header">
                    <h3>Dashboard Highlights</h3>
                  </div>
                  <div className="highlight-stack">
                    <div className="highlight-row">
                      <span>Most viewed file</span>
                      <strong>{topFile?.title || 'No data yet'}</strong>
                    </div>
                    <div className="highlight-row">
                      <span>Recent file count</span>
                      <strong>{dashboardData.recentFiles.length}</strong>
                    </div>
                    <div className="highlight-row">
                      <span>Popular file count</span>
                      <strong>{dashboardData.popularFiles.length}</strong>
                    </div>
                    <div className="highlight-row">
                      <span>Recent view total</span>
                      <strong>{formatCompactNumber(recentViews)}</strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="recent-files-card">
                <div className="card-header">
                  <h3>Recent Files</h3>
                </div>
                {recentFiles.length > 0 ? (
                  <div className="files-list">
                    {paginatedRecentFiles.map((file) => (
                      <div
                        key={file._id}
                        className="file-item clickable"
                      >
                        <div
                          className="file-info"
                          onClick={() => handleLoadFile(file)}
                          title="Click to open in editor"
                        >
                          <div className="file-title">{file.title}</div>
                          {file.description && (
                            <div className="file-description">{file.description}</div>
                          )}
                          {file.tags && file.tags.length > 0 && (
                            <div className="file-tags">
                              {file.tags.map((tag, index) => (
                                <span key={index} className="file-tag">{tag}</span>
                              ))}
                            </div>
                          )}
                          <div className="file-meta">
                            <div className="file-meta-left">
                              <span className="file-date">Updated {formatDate(file.updatedAt)}</span>
                            </div>
                            <div className="file-meta-right">
                              <span className={`file-visibility ${file.isPublic ? 'public' : 'private'}`}>
                                {file.isPublic ? '🌐 Public' : '🔒 Private'}
                              </span>
                              <span className="file-views">👁️ {file.views} views</span>
                            </div>
                          </div>
                        </div>
                        <button
                          className="file-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${file.title}"? This cannot be undone.`)) {
                              apiService.deleteYamlFile(file._id)
                                .then(() => {
                                  showSuccess('File deleted successfully');
                                  loadProfileData();
                                  loadDashboardData();
                                })
                                .catch(err => showError('Failed to delete file: ' + err.message));
                            }
                          }}
                          title="Delete file"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                    {renderPagination(recentFilesPage, recentFilesTotalPages, setRecentFilesPage)}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>No files created yet. Start building your first YAML diagram!</p>
                  </div>
                )}
              </div>

              <div className="popular-files-card">
                <div className="card-header">
                  <h3>Most Popular Files</h3>
                </div>
                {popularFiles.length > 0 ? (
                  <div className="files-list">
                    {paginatedPopularFiles.map((file) => (
                      <div
                        key={file._id}
                        className="file-item clickable"
                      >
                        <div
                          className="file-info"
                          onClick={() => handleLoadFile(file)}
                          title="Click to open in editor"
                        >
                          <div className="file-title">{file.title}</div>
                          {file.description && (
                            <div className="file-description">{file.description}</div>
                          )}
                          {file.tags && file.tags.length > 0 && (
                            <div className="file-tags">
                              {file.tags.map((tag, index) => (
                                <span key={index} className="file-tag">{tag}</span>
                              ))}
                            </div>
                          )}
                          <div className="file-meta">
                            <div className="file-meta-left">
                              <span className="file-date">Created {formatDate(file.createdAt)}</span>
                            </div>
                            <div className="file-meta-right">
                              <span className={`file-visibility ${file.isPublic ? 'public' : 'private'}`}>
                                {file.isPublic ? '🌐 Public' : '🔒 Private'}
                              </span>
                              <span className="file-views">👁️ {file.views} views</span>
                            </div>
                          </div>
                        </div>
                        <button
                          className="file-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Delete "${file.title}"? This cannot be undone.`)) {
                              apiService.deleteYamlFile(file._id)
                                .then(() => {
                                  showSuccess('File deleted successfully');
                                  loadProfileData();
                                  loadDashboardData();
                                })
                                .catch(err => showError('Failed to delete file: ' + err.message));
                            }
                          }}
                          title="Delete file"
                        >
                          🗑️
                        </button>
                      </div>
                    ))}
                    {renderPagination(popularFilesPage, popularFilesTotalPages, setPopularFilesPage)}
                  </div>
                ) : (
                  <div className="empty-state">
                    <p>No files to show yet.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'security' && (
            <div className="security-tab">
              <div className="security-status-card">
                <div className="card-header">
                  <h3>Security Overview</h3>
                </div>
                <div className="security-status-grid">
                  <div className="security-status-item">
                    <span>Account state</span>
                    <strong>{profileData.user.isVerified ? 'Verified' : 'Protected by password'}</strong>
                  </div>
                  <div className="security-status-item">
                    <span>Profile updated</span>
                    <strong>{formatDate(profileData.user.updatedAt || profileData.user.createdAt)}</strong>
                  </div>
                  <div className="security-status-item">
                    <span>Password policy</span>
                    <strong>Minimum 6 characters</strong>
                  </div>
                </div>
              </div>

              <div className="password-card">
                <div className="card-header">
                  <h3>Change Password</h3>
                </div>
                <form onSubmit={handlePasswordChange} className="password-form">
                  <div className="form-group">
                    <label>Current Password</label>
                    <input
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>New Password</label>
                    <input
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      minLength="6"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label>Confirm New Password</label>
                    <input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      minLength="6"
                      required
                    />
                  </div>
                  <button type="submit" className="change-password-btn">
                    🔒 Change Password
                  </button>
                </form>
              </div>

              <div className="danger-zone-card">
                <div className="card-header">
                  <h3>Danger Zone</h3>
                </div>
                <div className="danger-content">
                  <p>⚠️ Once you delete your account, there is no going back. This will permanently delete your account and all your YAML files.</p>

                  {!showDeleteConfirm ? (
                    <button
                      className="delete-account-btn"
                      onClick={() => setShowDeleteConfirm(true)}
                    >
                      🗑️ Delete Account
                    </button>
                  ) : (
                    <div className="delete-confirm">
                      <div className="form-group">
                        <label>Enter your password to confirm deletion:</label>
                        <input
                          type="password"
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          placeholder="Enter your password"
                          required
                        />
                      </div>
                      <div className="delete-actions">
                        <button
                          className="confirm-delete-btn"
                          onClick={handleDeleteAccount}
                          disabled={!deletePassword}
                        >
                          ⚠️ Confirm Delete Account
                        </button>
                        <button
                          className="cancel-delete-btn"
                          onClick={() => {
                            setShowDeleteConfirm(false);
                            setDeletePassword('');
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}