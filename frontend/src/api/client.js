/**
 * api/client.js
 *
 * Configures and exports the project-wide Axios instance used for every HTTP
 * request to the backend REST API.
 *
 * Responsibilities:
 *   - Sets the base URL to "/api" so all relative endpoint paths (e.g.
 *     "/tickets") automatically resolve against the API prefix.
 *   - Attaches a 15-second request timeout to prevent the UI from hanging
 *     indefinitely on slow or unresponsive network conditions.
 *   - Installs a response interceptor that:
 *       • Extracts a human-readable error message from the server response.
 *       • On HTTP 401 (Unauthorized), clears the stored session and forces a
 *         full redirect to /auth, ensuring stale or revoked tokens are purged.
 */

import axios from 'axios';
import toast from 'react-hot-toast'; // imported for potential use in extended interceptors

/**
 * Shared Axios instance.  Import this instead of raw `axios` so that all
 * requests automatically carry the base URL, timeout, and the Authorization
 * header set by AuthContext after login.
 */
const api = axios.create({
  baseURL: '/api',                                    // proxied to the Express server by Vite in dev
  timeout: 15000,                                     // 15 s — abort requests that take too long
  headers: { 'Content-Type': 'application/json' },   // default content type for POST/PATCH bodies
});

/**
 * Global response error interceptor.
 *
 * Runs for every failed request (non-2xx status or network error) before the
 * error reaches the calling code.  Two things happen here:
 *
 *  1. A unified `message` field is extracted from the server payload (falling
 *     back to the Axios message or a generic string) and merged into the
 *     rejected error so callers always have `err.message` available.
 *
 *  2. A 401 response means the JWT is missing, expired, or revoked.  The
 *     interceptor wipes all session data from localStorage, removes the
 *     Authorization header from future requests, and hard-redirects to /auth —
 *     unless the user is already on that page (prevents an infinite loop).
 */
api.interceptors.response.use(
  // Pass successful responses through unchanged
  (response) => response,

  (error) => {
    // Prefer the server's own error message; fall back gracefully
    const message = error.response?.data?.error || error.message || 'Network error';

    if (error.response?.status === 401) {
      // Clear every piece of session data stored by AuthContext
      localStorage.removeItem('egov_token');
      localStorage.removeItem('egov_user');
      localStorage.removeItem('egov_servant');

      // Remove the bearer token from all subsequent Axios requests
      delete api.defaults.headers.common['Authorization'];

      // Redirect to the login page, but only if we are not already there
      // (avoids an infinite redirect loop if /auth itself returns a 401)
      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }

    // Re-reject with the enriched error object so individual catch blocks
    // can still inspect `err.message`, `err.response`, etc.
    return Promise.reject({ ...error, message });
  }
);

export default api;
