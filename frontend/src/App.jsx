/**
 * App.jsx
 *
 * Root application component. Responsible for:
 *   1. Wrapping the entire tree in the three global context providers
 *      (LanguageProvider → AuthProvider → SocketProvider) so every child
 *      component can access i18n strings, authentication state, and the
 *      live WebSocket connection.
 *   2. Declaring all client-side routes via React Router v6 <Routes>.
 *
 * Route access is controlled by two guard components:
 *   - ProtectedRoute – requires authentication; optional servant/admin elevation.
 *   - ClientRoute    – requires authentication AND rejects servant/admin users,
 *                      redirecting them to their own dashboards instead.
 */

import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import { LanguageProvider } from './contexts/LanguageContext.jsx';
import { SocketProvider } from './contexts/SocketContext.jsx';
import LandingPage from './pages/LandingPage.jsx';
import AuthPage from './pages/AuthPage.jsx';
import ClientDashboard from './pages/ClientDashboard.jsx';
import SubmitConcern from './pages/SubmitConcern.jsx';
import TrackTicket from './pages/TrackTicket.jsx';
import ServantDashboard from './pages/ServantDashboard.jsx';
import AdminDashboard from './pages/AdminDashboard.jsx';
import AnnouncementsPage from './pages/AnnouncementsPage.jsx';
import DirectoryPage from './pages/DirectoryPage.jsx';
import ReportsPage from './pages/ReportsPage.jsx';

/**
 * Full-screen centered loading indicator shown while the auth state is being
 * rehydrated from localStorage on first render.
 */
const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
  </div>
);

/**
 * Route guard for pages that require an authenticated session.
 * Optionally enforces servant-only or admin-only access levels.
 *
 * @param {{ children: React.ReactNode, requireServant?: boolean, requireAdmin?: boolean }} props
 * @returns {React.ReactElement} The protected page, a redirect, or a loading spinner.
 */
const ProtectedRoute = ({ children, requireServant = false, requireAdmin = false }) => {
  const { isAuthenticated, isServant, isAdmin, loading } = useAuth();

  if (loading) return <Spinner />;                                          // wait for auth rehydration
  if (!isAuthenticated) return <Navigate to="/auth" replace />;            // must be logged in
  if (requireServant && !isServant) return <Navigate to="/dashboard" replace />; // servant check
  if (requireAdmin  && !isAdmin)   return <Navigate to="/dashboard" replace />; // admin check

  return children;
};

/**
 * Route guard for citizen-only pages.
 * Authenticated servants and admins are redirected to their own dashboards
 * so they cannot accidentally land on citizen-facing screens.
 *
 * @param {{ children: React.ReactNode }} props
 * @returns {React.ReactElement} The citizen page or a redirect.
 */
// Client-only routes: redirect admins → /admin, servants → /servant
const ClientRoute = ({ children }) => {
  const { isAuthenticated, isAdmin, isServant, loading } = useAuth();
  if (loading) return <Spinner />;                                          // wait for auth rehydration
  if (!isAuthenticated) return <Navigate to="/auth" replace />;            // must be logged in
  if (isAdmin)   return <Navigate to="/admin"   replace />;                // admins go to admin dashboard
  if (isServant) return <Navigate to="/servant" replace />;                // servants go to servant dashboard
  return children;
};

/**
 * Declares the full route table.  Rendered inside all context providers so
 * useAuth() is available to both guard components.
 *
 * The /auth route performs an immediate redirect for already-authenticated
 * users so they never see the login form while signed in.
 */
const AppRoutes = () => {
  const { isAuthenticated, isServant, isAdmin } = useAuth();

  return (
    <Routes>
      {/* Public landing page — accessible to everyone */}
      <Route path="/" element={<LandingPage />} />

      {/*
       * Auth page: redirect already-logged-in users to their respective dashboard
       * rather than showing the login/register form again.
       */}
      <Route path="/auth" element={
        isAuthenticated
          ? <Navigate to={isServant ? '/servant' : isAdmin ? '/admin' : '/dashboard'} replace />
          : <AuthPage />
      } />

      {/* Client routes — citizens only */}
      <Route path="/dashboard"    element={<ClientRoute><ClientDashboard /></ClientRoute>} />
      <Route path="/submit"       element={<ClientRoute><SubmitConcern /></ClientRoute>} />
      <Route path="/tickets"      element={<ClientRoute><TrackTicket /></ClientRoute>} />
      <Route path="/tickets/:id"  element={<ClientRoute><TrackTicket /></ClientRoute>} /> {/* deep-link to a specific ticket */}

      {/* Shared routes (any authenticated user) */}
      <Route path="/announcements" element={<ProtectedRoute><AnnouncementsPage /></ProtectedRoute>} />
      <Route path="/directory"     element={<ProtectedRoute><DirectoryPage /></ProtectedRoute>} />

      {/* Servant routes */}
      <Route path="/servant" element={<ProtectedRoute requireServant><ServantDashboard /></ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/admin"   element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute requireAdmin><ReportsPage /></ProtectedRoute>} />

      {/* Catch-all: unknown paths fall back to the landing page */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

/**
 * Top-level component exported as the default export.
 * Composes the provider hierarchy and the router in one place so main.jsx
 * only needs to render <App />.
 *
 * Provider nesting order matters:
 *   LanguageProvider  — no dependencies, safe to be outermost
 *   AuthProvider      — depends on nothing; SocketProvider depends on it
 *   SocketProvider    — reads auth state to connect/disconnect the socket
 *
 * @returns {React.ReactElement}
 */
export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>   {/* i18n strings available everywhere */}
        <AuthProvider>     {/* authentication state and actions */}
          <SocketProvider> {/* live WebSocket connection tied to auth state */}
            <AppRoutes />
          </SocketProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
