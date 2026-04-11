import React, { useState, useEffect } from 'react';
import { useToast } from '../hooks/useToast';
import './styles/GitHubIntegrationModal.css';

export default function GitHubIntegrationModal({ isOpen, onClose, fileId, onIntegrationCreated }) {
  const { showSuccess, showError } = useToast();
  const [step, setStep] = useState('connect'); // 'connect', 'webhook-setup', 'connected'
  const [loading, setLoading] = useState(false);
  const [integration, setIntegration] = useState(null);

  const [mode, setMode] = useState('auto-parse'); // 'auto-parse' or 'file-sync'
  const [formData, setFormData] = useState({
    repoOwner: '',
    repoName: '',
    filePath: '',
    branch: 'main'
  });

  // Check if integration already exists
  useEffect(() => {
    if (isOpen && fileId) {
      checkExistingIntegration();
    }
  }, [isOpen, fileId]);

  const checkExistingIntegration = async () => {
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

      // Get auth token for Authorization header
      const headers = {};
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/github/integration/${fileId}`, {
        headers,
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setIntegration(data.integration);
        setStep('connected');
      }
    } catch (error) {
      // No integration exists, that's fine
    }
  };

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleConnect = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
      const endpoint = mode === 'auto-parse' ? '/github/connect-repo' : '/github/connect';
      const payload = mode === 'auto-parse'
        ? {
            yamlFileId: fileId,
            repoOwner: formData.repoOwner,
            repoName: formData.repoName,
            branch: formData.branch
          }
        : {
            yamlFileId: fileId,
            ...formData
          };

      console.log('Connecting to GitHub:', { endpoint, mode, payload });

      // Get auth token from localStorage for Authorization header
      const headers = { 'Content-Type': 'application/json' };
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify(payload)
      });

      console.log('Response status:', response.status);

      // Get response text first to see what we're actually getting
      const responseText = await response.text();
      console.log('Response text:', responseText);

      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        throw new Error(`Server returned invalid response: ${responseText.substring(0, 100)}`);
      }

      if (!response.ok) {
        throw new Error(data.error || 'Failed to connect to GitHub');
      }

      setIntegration(data.integration);
      setStep('webhook-setup');
      const modeText = mode === 'auto-parse' ? 'Repo auto-parser' : 'File sync';
      showSuccess(`GitHub ${modeText} created! Now set up the webhook.`);

      if (onIntegrationCreated) {
        onIntegrationCreated(data.integration);
      }
    } catch (error) {
      console.error('GitHub connection error:', error);
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManualSync = async () => {
    if (!integration) return;

    setLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

      // Get auth token for Authorization header
      const headers = {};
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/github/sync/${integration.id}`, {
        method: 'POST',
        headers,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to sync from GitHub');
      }

      showSuccess('Synced successfully from GitHub!');

      // Reload page to show updated content
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!integration) return;

    if (!window.confirm('Are you sure you want to disconnect GitHub integration? This cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

      // Get auth token for Authorization header
      const headers = {};
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/github/disconnect/${integration.id}`, {
        method: 'DELETE',
        headers,
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error('Failed to disconnect');
      }

      showSuccess('GitHub integration disconnected');
      setIntegration(null);
      setStep('connect');
    } catch (error) {
      showError(error.message);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    showSuccess(`${label} copied to clipboard!`);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="github-modal" onClick={(e) => e.stopPropagation()}>
        <div className="github-modal-header">
          <h2>🐙 GitHub Integration</h2>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>

        <div className="github-modal-body">
          {step === 'connect' && (
            <form onSubmit={handleConnect} className="github-form">
              <div className="info-banner">
                <span className="info-icon">ℹ️</span>
                <p>Connect this YAML file to a GitHub repository for automatic visualization!</p>
              </div>

              <div className="form-group">
                <label>Mode *</label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value)}
                  className="mode-select"
                >
                  <option value="auto-parse">🌳 Auto-Parse Repo Structure (Recommended)</option>
                  <option value="file-sync">📄 Sync Specific YAML File</option>
                </select>
                <small>
                  {mode === 'auto-parse'
                    ? '🌳 Automatically visualize your entire repository structure on every push'
                    : '📄 Sync a specific YAML file from your repository'}
                </small>
              </div>

              <div className="form-group">
                <label>Repository Owner *</label>
                <input
                  type="text"
                  name="repoOwner"
                  value={formData.repoOwner}
                  onChange={handleInputChange}
                  placeholder="e.g., octocat"
                  required
                />
                <small>GitHub username or organization</small>
              </div>

              <div className="form-group">
                <label>Repository Name *</label>
                <input
                  type="text"
                  name="repoName"
                  value={formData.repoName}
                  onChange={handleInputChange}
                  placeholder="e.g., my-repo"
                  required
                />
              </div>

              {mode === 'file-sync' && (
                <div className="form-group">
                  <label>File Path *</label>
                  <input
                    type="text"
                    name="filePath"
                    value={formData.filePath}
                    onChange={handleInputChange}
                    placeholder="e.g., config/app.yaml"
                    required
                  />
                  <small>Path to YAML file in repository</small>
                </div>
              )}

              <div className="form-group">
                <label>Branch</label>
                <input
                  type="text"
                  name="branch"
                  value={formData.branch}
                  onChange={handleInputChange}
                  placeholder="main"
                />
              </div>

              <button type="submit" className="connect-btn" disabled={loading}>
                {loading ? '🔄 Connecting...' : '🔗 Connect to GitHub'}
              </button>
            </form>
          )}

          {step === 'webhook-setup' && integration && (
            <div className="webhook-setup">
              <div className="success-banner">
                <span className="success-icon">✅</span>
                <p>GitHub integration created! Now set up the webhook to enable real-time sync.</p>
              </div>

              <div className="setup-instructions">
                <h3>📝 Webhook Setup Instructions</h3>
                <ol>
                  <li>
                    Go to your repository settings:
                    <a
                      href={`https://github.com/${integration.repoOwner}/${integration.repoName}/settings/hooks`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="github-link"
                    >
                      https://github.com/{integration.repoOwner}/{integration.repoName}/settings/hooks
                    </a>
                  </li>
                  <li>Click <strong>"Add webhook"</strong></li>
                  <li>
                    Paste the Payload URL:
                    <div className="copy-field">
                      <input type="text" value={integration.webhookUrl} readOnly />
                      <button onClick={() => copyToClipboard(integration.webhookUrl, 'Webhook URL')}>
                        📋 Copy
                      </button>
                    </div>
                  </li>
                  <li>Set Content type to: <strong>application/json</strong></li>
                  <li>
                    Paste the Secret:
                    <div className="copy-field">
                      <input type="password" value={integration.webhookSecret} readOnly />
                      <button onClick={() => copyToClipboard(integration.webhookSecret, 'Secret')}>
                        📋 Copy
                      </button>
                    </div>
                  </li>
                  <li>Select <strong>"Just the push event"</strong></li>
                  <li>Click <strong>"Add webhook"</strong></li>
                </ol>
              </div>

              <button onClick={() => setStep('connected')} className="done-btn">
                ✅ I've set up the webhook
              </button>
            </div>
          )}

          {step === 'connected' && integration && (
            <div className="connected-view">
              <div className="success-banner">
                <span className="success-icon">✅</span>
                <p>
                  {integration.mode === 'auto-parse'
                    ? 'Connected to GitHub! Your diagram will auto-update with the repository structure on every push.'
                    : 'Connected to GitHub! Your diagram will auto-update when the file changes.'}
                </p>
              </div>

              <div className="integration-info">
                <div className="info-row">
                  <strong>Mode:</strong>
                  <span>{integration.mode === 'auto-parse' ? '🌳 Auto-Parse Repo' : '📄 File Sync'}</span>
                </div>
                <div className="info-row">
                  <strong>Repository:</strong>
                  <span>{integration.repoOwner}/{integration.repoName}</span>
                </div>
                {integration.filePath && (
                  <div className="info-row">
                    <strong>File:</strong>
                    <span>{integration.filePath}</span>
                  </div>
                )}
                <div className="info-row">
                  <strong>Branch:</strong>
                  <span>{integration.branch}</span>
                </div>
                <div className="info-row">
                  <strong>Last Synced:</strong>
                  <span>{integration.lastSyncedAt ? new Date(integration.lastSyncedAt).toLocaleString() : 'Never'}</span>
                </div>
                <div className="info-row">
                  <strong>Auto-Sync:</strong>
                  <span className={integration.autoSync ? 'status-active' : 'status-inactive'}>
                    {integration.autoSync ? '✅ Enabled' : '❌ Disabled'}
                  </span>
                </div>
              </div>

              <div className="action-buttons">
                <button onClick={handleManualSync} className="sync-btn" disabled={loading}>
                  {loading ? '🔄 Syncing...' : '🔄 Sync Now'}
                </button>
                <button onClick={handleDisconnect} className="disconnect-btn" disabled={loading}>
                  🔌 Disconnect
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
