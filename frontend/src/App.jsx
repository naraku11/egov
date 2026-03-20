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

const Spinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent" />
  </div>
);

const ProtectedRoute = ({ children, requireServant = false, requireAdmin = false }) => {
  const { isAuthenticated, isServant, isAdmin, loading } = useAuth();

  if (loading) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (requireServant && !isServant) return <Navigate to="/dashboard" replace />;
  if (requireAdmin && !isAdmin) return <Navigate to="/dashboard" replace />;

  return children;
};

// Client-only routes: redirect admins → /admin, servants → /servant
const ClientRoute = ({ children }) => {
  const { isAuthenticated, isAdmin, isServant, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!isAuthenticated) return <Navigate to="/auth" replace />;
  if (isAdmin) return <Navigate to="/admin" replace />;
  if (isServant) return <Navigate to="/servant" replace />;
  return children;
};

const AppRoutes = () => {
  const { isAuthenticated, isServant, isAdmin } = useAuth();

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/auth" element={
        isAuthenticated
          ? <Navigate to={isServant ? '/servant' : isAdmin ? '/admin' : '/dashboard'} replace />
          : <AuthPage />
      } />

      {/* Client routes */}
      <Route path="/dashboard" element={<ClientRoute><ClientDashboard /></ClientRoute>} />
      <Route path="/submit" element={<ClientRoute><SubmitConcern /></ClientRoute>} />
      <Route path="/tickets" element={<ClientRoute><TrackTicket /></ClientRoute>} />
      <Route path="/tickets/:id" element={<ClientRoute><TrackTicket /></ClientRoute>} />

      {/* Shared routes (any authenticated user) */}
      <Route path="/announcements" element={<ProtectedRoute><AnnouncementsPage /></ProtectedRoute>} />
      <Route path="/directory" element={<ProtectedRoute><DirectoryPage /></ProtectedRoute>} />

      {/* Servant routes */}
      <Route path="/servant" element={<ProtectedRoute requireServant><ServantDashboard /></ProtectedRoute>} />

      {/* Admin routes */}
      <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute requireAdmin><ReportsPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default function App() {
  return (
    <BrowserRouter>
      <LanguageProvider>
        <AuthProvider>
          <SocketProvider>
            <AppRoutes />
          </SocketProvider>
        </AuthProvider>
      </LanguageProvider>
    </BrowserRouter>
  );
}
