/**
 * contexts/AuthContext.jsx
 *
 * Provides application-wide authentication state and actions via React
 * Context.  The context distinguishes between two principal types:
 *
 *   user    – a registered citizen who can submit and track service tickets.
 *   servant – a government employee who processes those tickets.
 *
 * Only one principal type is active at a time; logging in as one clears the
 * other.
 *
 * Session persistence:
 *   The JWT and principal data are stored in localStorage under the keys
 *   "egov_token", "egov_user", and "egov_servant".  On mount the provider
 *   rehydrates state from these keys so the user remains logged in across
 *   page refreshes.  The api/client.js interceptor mirrors the same keys when
 *   it detects a 401 response and needs to force a logout.
 *
 * Exports:
 *   AuthProvider  – context provider component; wrap the app root with this.
 *   useAuth       – hook that returns the context value; throws if used
 *                   outside <AuthProvider>.
 */

import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client.js'; // pre-configured Axios instance

/** @type {React.Context<AuthContextValue|null>} */
const AuthContext = createContext(null);

/**
 * Context provider that manages authentication state for the whole app.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {React.ReactElement}
 */
export const AuthProvider = ({ children }) => {
  /** Currently authenticated citizen, or null if not logged in as a citizen. */
  const [user, setUser] = useState(null);

  /** Currently authenticated servant, or null if not logged in as a servant. */
  const [servant, setServant] = useState(null);

  /**
   * True while the initial localStorage rehydration is in progress.
   * Route guards read this flag and show a spinner instead of redirecting
   * prematurely before the session is known.
   */
  const [loading, setLoading] = useState(true);

  /**
   * On first render, restore session from localStorage.
   * This runs once (empty dependency array) and sets loading to false when done
   * so the rest of the app knows it is safe to evaluate auth state.
   */
  useEffect(() => {
    const token       = localStorage.getItem('egov_token');
    const savedUser   = localStorage.getItem('egov_user');
    const savedServant = localStorage.getItem('egov_servant');

    if (token) {
      // Attach the stored JWT to every subsequent Axios request
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      if (savedUser)    setUser(JSON.parse(savedUser));
      if (savedServant) setServant(JSON.parse(savedServant));
    }

    setLoading(false); // rehydration complete — route guards can now proceed
  }, []);

  /**
   * Persists a citizen session after successful login/registration.
   * Clears any active servant session so only one principal type is set.
   *
   * @param {string} token    - JWT returned by the server.
   * @param {object} userData - Serialisable citizen profile object.
   */
  const loginUser = (token, userData) => {
    localStorage.setItem('egov_token', token);
    localStorage.setItem('egov_user', JSON.stringify(userData));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`; // attach to future requests
    setUser(userData);
    setServant(null); // ensure no leftover servant state
  };

  /**
   * Persists a servant session after successful login.
   * Clears any active citizen session so only one principal type is set.
   *
   * @param {string} token       - JWT returned by the server.
   * @param {object} servantData - Serialisable servant profile object.
   */
  const loginServant = (token, servantData) => {
    localStorage.setItem('egov_token', token);
    localStorage.setItem('egov_servant', JSON.stringify(servantData));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`; // attach to future requests
    setServant(servantData);
    setUser(null); // ensure no leftover citizen state
  };

  /**
   * Ends the current session.
   *
   * If a servant is logged in, their availability status is set to OFFLINE on
   * the server before local state is cleared so the system accurately reflects
   * that the servant is no longer accepting work.  The PATCH call is best-effort
   * — if it fails (e.g. the token has already expired) the logout continues.
   *
   * @returns {Promise<void>}
   */
  const logout = async () => {
    // If a servant is logged in, mark them OFFLINE before clearing the session
    if (servant) {
      try {
        await api.patch('/servants/status', { status: 'OFFLINE' });
      } catch { /* ignore — token may already be invalid */ }
    }

    // Wipe all session data from localStorage
    localStorage.removeItem('egov_token');
    localStorage.removeItem('egov_user');
    localStorage.removeItem('egov_servant');

    // Remove the bearer token so future requests are anonymous
    delete api.defaults.headers.common['Authorization'];

    // Clear React state — downstream consumers will react immediately
    setUser(null);
    setServant(null);
  };

  // Patch user object in both state and localStorage (e.g. after profile update)
  /**
   * Merges partial updates into the citizen state and persists the result to
   * localStorage.  Used after profile edits so the cached data stays in sync.
   *
   * @param {Partial<object>} updates - Fields to merge into the current user object.
   */
  const updateUser = (updates) => {
    setUser(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('egov_user', JSON.stringify(updated)); // keep cache in sync
      return updated;
    });
  };

  // Patch servant object in both state and localStorage (e.g. after status change)
  /**
   * Merges partial updates into the servant state and persists the result to
   * localStorage.  Used after availability / profile changes.
   *
   * @param {Partial<object>} updates - Fields to merge into the current servant object.
   */
  const updateServant = (updates) => {
    setServant(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('egov_servant', JSON.stringify(updated)); // keep cache in sync
      return updated;
    });
  };

  /** True when the logged-in citizen has the ADMIN role. */
  const isAdmin = user?.role === 'ADMIN';

  /** True when a servant (rather than a citizen) is currently logged in. */
  const isServant = !!servant;

  /** True when either a citizen or servant session is active. */
  const isAuthenticated = !!user || !!servant;

  return (
    <AuthContext.Provider value={{ user, servant, loading, loginUser, loginServant, logout, updateUser, updateServant, isAdmin, isServant, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

/**
 * Hook to consume the AuthContext.
 *
 * @returns {{ user: object|null, servant: object|null, loading: boolean,
 *             loginUser: Function, loginServant: Function, logout: Function,
 *             updateUser: Function, updateServant: Function,
 *             isAdmin: boolean, isServant: boolean, isAuthenticated: boolean }}
 * @throws {Error} If called outside of an <AuthProvider> tree.
 */
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
