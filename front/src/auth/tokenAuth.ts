/**
 * Service d'authentification pour Kexamanager
 * Utilise l'endpoint /v2/GetClusterHealth pour valider les tokens
 */

import { adminGet, setAuthToken, clearAuthToken } from '../utils/adminClient'
import type { ApiError } from '../utils/adminClient'
import { GetClusterHealth } from '../utils/apiWrapper'
import type { components } from '../types/openapi'

// Type pour la réponse de l'endpoint de santé du cluster
// Utiliser le type généré par OpenAPI pour la réponse de santé du cluster
export type ClusterHealthResponse = components['schemas']['GetClusterHealthResponse']

/**
 * Valide un token d'authentification en appelant l'endpoint GetClusterHealth
 * @param token Le token à valider
 * @returns Promise qui résout si le token est valide, rejette sinon
 */
export async function validateToken(token: string): Promise<ClusterHealthResponse> {
  if (!token || token.trim().length === 0) {
    throw new Error('Token vide ou invalide')
  }

  try {
    // Stocker temporairement le token pour l'appel de validation
    setAuthToken(token)

    // Tester le token en appelant l'endpoint de santé du cluster
    const response = await GetClusterHealth()

    // Si on arrive ici, le token est valide
    return response
  } catch (error) {
    // Nettoyer le token en cas d'erreur
    clearAuthToken()

    const apiError = error as ApiError

    // Enrichir le message d'erreur selon le statut
    if (apiError.status === 401) {
      throw new Error('Token invalide ou expiré')
    } else if (apiError.status === 403) {
      throw new Error('Token valide mais permissions insuffisantes')
    } else if (apiError.status >= 500) {
      throw new Error('Erreur serveur - veuillez réessayer plus tard')
    } else {
      throw new Error(`Erreur de connexion: ${apiError.message}`)
    }
  }
}

/**
 * Authentifie un utilisateur avec un token
 * @param token Le token d'authentification
 * @returns Promise qui résout avec les informations de santé du cluster
 */
export async function authenticateWithToken(token: string): Promise<ClusterHealthResponse> {
  const clusterHealth = await validateToken(token)

  // Si la validation réussit, marquer l'utilisateur comme authentifié
  localStorage.setItem('kexamanager:auth', '1')

  return clusterHealth
}

/**
 * Déconnecte l'utilisateur en nettoyant toutes les données d'authentification
 */
export function logout(): void {
  clearAuthToken()
  localStorage.removeItem('kexamanager:auth')
}

/**
 * Vérifie si l'utilisateur est actuellement authentifié
 * @returns true si l'utilisateur est authentifié, false sinon
 */
export function isLoggedIn(): boolean {
  return localStorage.getItem('kexamanager:auth') === '1' &&
         localStorage.getItem('kexamanager:token') !== null
}

/**
 * Récupère les informations de santé du cluster (nécessite d'être authentifié)
 * @returns Promise avec les informations de santé du cluster
 */
export async function getClusterHealth(): Promise<ClusterHealthResponse> {
  if (!isLoggedIn()) {
    throw new Error('Utilisateur non authentifié')
  }

  try {
    return await adminGet<ClusterHealthResponse>('/v2/GetClusterHealth')
  } catch (error) {
    const apiError = error as ApiError

    // Si le token a expiré, déconnecter automatiquement
    if (apiError.status === 401) {
      logout()
      throw new Error('Session expirée - veuillez vous reconnecter')
    }

    throw error
  }
}

// Exemple d'utilisation :
//
// import { authenticateWithToken, logout, getClusterHealth } from '@/auth/tokenAuth'
//
// // Dans le composant Login
// try {
//   const clusterHealth = await authenticateWithToken(userToken)
//   console.log('Authentification réussie:', clusterHealth)
//   onAuth() // Passer à l'interface principale
// } catch (error) {
//   setError(error.message)
// }
//
// // Vérifier périodiquement la santé du cluster
// useEffect(() => {
//   const interval = setInterval(async () => {
//     try {
//       await getClusterHealth()
//     } catch (error) {
//       console.warn('Problème de connexion au cluster:', error.message)
//     }
//   }, 30000) // Toutes les 30 secondes
//
//   return () => clearInterval(interval)
// }, [])
