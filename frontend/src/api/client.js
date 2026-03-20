import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.error || error.message || 'Network error';
    if (error.response?.status === 401) {
      localStorage.removeItem('egov_token');
      localStorage.removeItem('egov_user');
      localStorage.removeItem('egov_servant');
      delete api.defaults.headers.common['Authorization'];
      if (window.location.pathname !== '/auth') {
        window.location.href = '/auth';
      }
    }
    return Promise.reject({ ...error, message });
  }
);

export default api;
