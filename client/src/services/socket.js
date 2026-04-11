import { io } from 'socket.io-client';

/** Same API host as REST, without /api — avoids prod misconfig when only VITE_API_BASE_URL is set. */
function getSocketBaseUrl() {
  const explicit = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL;
  if (explicit) return String(explicit).replace(/\/$/, '');
  const apiBase = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';
  return apiBase.replace(/\/?api\/?$/i, '');
}

const SOCKET_URL = getSocketBaseUrl();

let socket = null;

function refreshSocketAuth(s) {
  const token = localStorage.getItem('auth_token');
  s.auth = { ...(typeof s.auth === 'object' && s.auth ? s.auth : {}), token };
}

/**
 * Get or create the singleton socket connection.
 * Automatically attaches the auth token if available.
 */
export function getSocket() {
  // Reuse existing socket if it exists (even if temporarily disconnected — it will auto-reconnect)
  if (socket) return socket;

  socket = io(SOCKET_URL, {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    auth: {
      token: localStorage.getItem('auth_token'),
    },
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
  });

  refreshSocketAuth(socket);
  socket.io.on('reconnect_attempt', () => refreshSocketAuth(socket));

  socket.on('connect', () => {
    console.log('🔌 Socket connected:', socket.id, '→', SOCKET_URL);
  });

  socket.on('connect_error', (err) => {
    console.warn('🔌 Socket connection error:', err.message);
  });

  socket.on('disconnect', (reason) => {
    console.log('🔌 Socket disconnected:', reason);
  });

  return socket;
}

/**
 * Disconnect and clean up the socket connection.
 */
export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/**
 * Join a file room for collaborative editing.
 */
export function joinFileRoom(fileId) {
  const s = getSocket();
  s.emit('join-file', { fileId });
}

/**
 * Leave a file room.
 */
export function leaveFileRoom(fileId) {
  const s = getSocket();
  s.emit('leave-file', { fileId });
}

/**
 * Send a text operation to the server.
 * @param {string} fileId
 * @param {{ type: 'insert'|'delete'|'replace', position?: number, text?: string, length?: number }} op
 * @param {number} baseVersion - the version this op is based on
 */
export function sendOperation(fileId, op, baseVersion) {
  const s = getSocket();
  s.emit('operation', { fileId, op, baseVersion });
}

/**
 * Send a full content sync (fallback for complex edits).
 */
export function sendContentSync(fileId, content) {
  const s = getSocket();
  s.emit('sync-content', { fileId, content });
}

/**
 * Update cursor position.
 * @param {string} fileId
 * @param {{ line: number, ch: number, selectionStart?: number, selectionEnd?: number }} cursor
 */
export function sendCursorUpdate(fileId, cursor) {
  const s = getSocket();
  s.emit('cursor-update', { fileId, cursor });
}

/**
 * Send typing indicator.
 */
export function sendTypingIndicator(fileId, isTyping) {
  const s = getSocket();
  s.emit('typing', { fileId, isTyping });
}

export default {
  getSocket,
  disconnectSocket,
  joinFileRoom,
  leaveFileRoom,
  sendOperation,
  sendContentSync,
  sendCursorUpdate,
  sendTypingIndicator,
};
