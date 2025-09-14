/**
 * Point d'entrée pour les utilitaires API Admin
 * Facilite les imports dans l'application
 */

// Exporter toutes les fonctions de l'API Admin
export {
  adminGet,
  adminPost,
  adminPut,
  adminPatch,
  adminDelete,
  setAuthToken,
  clearAuthToken,
  isAuthenticated,
} from './adminApi'

// Exporter les types
export type {
  ApiResponse,
  ApiError,
} from './adminApi'

// Exporter les services d'authentification
export {
  authenticateUser,
  logoutUser,
  refreshToken,
  setupTokenRefresh,
} from '../auth/authService'

// Exemple d'utilisation pour les imports :
// import { adminGet, adminPost, setAuthToken } from '@/utils'
// import type { ApiError } from '@/utils'
