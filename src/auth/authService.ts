/**
 * Intégration de l'API Admin avec le système d'authentification existant
 * Ce fichier montre comment adapter le Login existant pour utiliser l'API Admin
 */

import { adminPost, setAuthToken, clearAuthToken } from '../utils/adminClient'
import type { ApiError } from '../utils/adminClient'

// Types pour l'authentification
interface LoginRequest {
  username: string
  password: string
  role: 'admin' | 'user'
}

interface LoginResponse {
  token: string
  user: {
    id: string
    username: string
    role: 'admin' | 'user'
  }
  expiresAt: string
}

/**
 * Fonction d'authentification utilisant l'API Admin
 */
export async function authenticateUser(credentials: LoginRequest): Promise<LoginResponse> {
  try {
    // Appel à l'API Admin pour l'authentification
    const response = await adminPost<LoginResponse>('/auth/login', credentials)

    // Stocker le token dans localStorage
    setAuthToken(response.token)

    // Stocker aussi les infos utilisateur pour compatibilité avec le code existant
    localStorage.setItem('kexamanager:auth', '1')
    localStorage.setItem('kexamanager:role', response.user.role)
    localStorage.setItem('kexamanager:username', response.user.username)

    return response
  } catch (error) {
    const apiError = error as ApiError

    // Nettoyer en cas d'erreur
    clearAuthToken()
    localStorage.removeItem('kexamanager:auth')
    localStorage.removeItem('kexamanager:role')
    localStorage.removeItem('kexamanager:username')

    throw apiError
  }
}

/**
 * Fonction de déconnexion
 */
export async function logoutUser(): Promise<void> {
  try {
    // Optionnel : informer le serveur de la déconnexion
    await adminPost('/auth/logout')
  } catch (error) {
    // Ignorer les erreurs de déconnexion côté serveur
    console.warn('Erreur lors de la déconnexion côté serveur:', error)
  } finally {
    // Nettoyer le localStorage dans tous les cas
    clearAuthToken()
    localStorage.removeItem('kexamanager:auth')
    localStorage.removeItem('kexamanager:role')
    localStorage.removeItem('kexamanager:username')
  }
}

/**
 * Fonction pour rafraîchir le token
 */
export async function refreshToken(): Promise<string> {
  try {
    const response = await adminPost<{ token: string }>('/auth/refresh')
    setAuthToken(response.token)
    return response.token
  } catch (error) {
    // En cas d'échec, déconnecter l'utilisateur
    await logoutUser()
    throw error
  }
}

/**
 * Middleware pour gérer l'expiration automatique des tokens
 */
export function setupTokenRefresh(): void {
  // Intercepter les erreurs 401 globalement
  const originalFetch = window.fetch

  window.fetch = async (...args) => {
    const response = await originalFetch(...args)

    if (response.status === 401 && response.url.includes('/api/admin')) {
      try {
        // Tenter de rafraîchir le token
        await refreshToken()

        // Refaire la requête originale avec le nouveau token
        return originalFetch(...args)
      } catch {
        // Si le rafraîchissement échoue, déconnecter
        await logoutUser()

        // Rediriger vers la page de connexion ou émettre un événement
        window.dispatchEvent(new CustomEvent('auth:logout'))
      }
    }

    return response
  }
}

// Exemple d'utilisation dans le composant Login :
//
// import { authenticateUser } from './auth/authService'
//
// function Login({ onAuth }) {
//   const [loading, setLoading] = useState(false)
//   const [error, setError] = useState('')
//
//   async function handleSubmit(e) {
//     e.preventDefault()
//     setLoading(true)
//     setError('')
//
//     try {
//       const response = await authenticateUser({
//         username,
//         password,
//         role
//       })
//
//       onAuth(response.user.role, response.user.username)
//     } catch (error) {
//       setError(error.message)
//     } finally {
//       setLoading(false)
//     }
//   }
//
//   // ... reste du composant
// }
//
// // Dans App.tsx, configurer le rafraîchissement automatique :
// useEffect(() => {
//   setupTokenRefresh()
//
//   // Écouter les événements de déconnexion
//   const handleLogout = () => {
//     setAuthed(false)
//     setRole(null)
//   }
//
//   window.addEventListener('auth:logout', handleLogout)
//   return () => window.removeEventListener('auth:logout', handleLogout)
// }, [])
