import axios from 'axios';
import { useAdminAuthStore } from '../store/adminAuthStore';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  timeout: 15_000,
});

// Injecter le token admin sur chaque requête
api.interceptors.request.use((config) => {
  const token = useAdminAuthStore.getState().accessToken;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  // Header supplémentaire pour identifier les requêtes admin
  config.headers['X-Admin-Request'] = '1';
  return config;
});

// Gérer l'expiration du token
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    if (error.response?.status === 401) {
      useAdminAuthStore.getState().logout();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
