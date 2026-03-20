import { createContext, useContext, useState, useEffect } from 'react';
import api from '../api/client.js';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [servant, setServant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('egov_token');
    const savedUser = localStorage.getItem('egov_user');
    const savedServant = localStorage.getItem('egov_servant');

    if (token) {
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      if (savedUser) setUser(JSON.parse(savedUser));
      if (savedServant) setServant(JSON.parse(savedServant));
    }
    setLoading(false);
  }, []);

  const loginUser = (token, userData) => {
    localStorage.setItem('egov_token', token);
    localStorage.setItem('egov_user', JSON.stringify(userData));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setUser(userData);
    setServant(null);
  };

  const loginServant = (token, servantData) => {
    localStorage.setItem('egov_token', token);
    localStorage.setItem('egov_servant', JSON.stringify(servantData));
    api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    setServant(servantData);
    setUser(null);
  };

  const logout = async () => {
    // If a servant is logged in, mark them OFFLINE before clearing the session
    if (servant) {
      try {
        await api.patch('/servants/status', { status: 'OFFLINE' });
      } catch { /* ignore — token may already be invalid */ }
    }
    localStorage.removeItem('egov_token');
    localStorage.removeItem('egov_user');
    localStorage.removeItem('egov_servant');
    delete api.defaults.headers.common['Authorization'];
    setUser(null);
    setServant(null);
  };

  // Patch user object in both state and localStorage (e.g. after profile update)
  const updateUser = (updates) => {
    setUser(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('egov_user', JSON.stringify(updated));
      return updated;
    });
  };

  // Patch servant object in both state and localStorage (e.g. after status change)
  const updateServant = (updates) => {
    setServant(prev => {
      const updated = { ...prev, ...updates };
      localStorage.setItem('egov_servant', JSON.stringify(updated));
      return updated;
    });
  };

  const isAdmin = user?.role === 'ADMIN';
  const isServant = !!servant;
  const isAuthenticated = !!user || !!servant;

  return (
    <AuthContext.Provider value={{ user, servant, loading, loginUser, loginServant, logout, updateUser, updateServant, isAdmin, isServant, isAuthenticated }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
