/**
 * Utility functions for making calls to the Admin API
 * Uses the proxy configuration defined in vite.config.ts (/api/admin)
 */

// Types pour les réponses API
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

export interface ApiError {
  message: string
  status: number
  code?: string
}

// Configuration de base
const BASE_URL = '/api/admin'

/**
 * Récupère le token d'authentification depuis le localStorage
 */
function getAuthToken(): string | null {
  return localStorage.getItem('kexamanager:token')
}

/**
 * Crée les headers par défaut pour les requêtes API
 */
function getDefaultHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  const token = getAuthToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  return headers
}

/**
 * Gère les erreurs de réponse HTTP
 */
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let errorMessage = `HTTP Error: ${response.status}`

    try {
      const errorData = await response.json()
      errorMessage = errorData.message || errorData.error || errorMessage
    } catch {
      // Si on ne peut pas parser le JSON, on garde le message par défaut
    }

    const error: ApiError = {
      message: errorMessage,
      status: response.status,
    }

    throw error
  }

  try {
    return await response.json()
  } catch {
    // Si la réponse n'est pas du JSON valide, retourner null
    return null as T
  }
}

/**
 * Effectue une requête GET vers l'API Admin
 */
export async function adminGet<T = unknown>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(BASE_URL + endpoint, window.location.origin)

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value)
    })
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: getDefaultHeaders(),
  })

  return handleResponse<T>(response)
}

/**
 * Effectue une requête POST vers l'API Admin
 */
export async function adminPost<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
  const response = await fetch(BASE_URL + endpoint, {
    method: 'POST',
    headers: getDefaultHeaders(),
    body: data ? JSON.stringify(data) : undefined,
  })

  return handleResponse<T>(response)
}

/**
 * Effectue une requête PUT vers l'API Admin
 */
export async function adminPut<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
  const response = await fetch(BASE_URL + endpoint, {
    method: 'PUT',
    headers: getDefaultHeaders(),
    body: data ? JSON.stringify(data) : undefined,
  })

  return handleResponse<T>(response)
}

/**
 * Effectue une requête PATCH vers l'API Admin
 */
export async function adminPatch<T = unknown>(endpoint: string, data?: unknown): Promise<T> {
  const response = await fetch(BASE_URL + endpoint, {
    method: 'PATCH',
    headers: getDefaultHeaders(),
    body: data ? JSON.stringify(data) : undefined,
  })

  return handleResponse<T>(response)
}

/**
 * Effectue une requête DELETE vers l'API Admin
 */
export async function adminDelete<T = unknown>(endpoint: string): Promise<T> {
  const response = await fetch(BASE_URL + endpoint, {
    method: 'DELETE',
    headers: getDefaultHeaders(),
  })

  return handleResponse<T>(response)
}

/**
 * Fonction utilitaire pour définir le token d'authentification
 */
export function setAuthToken(token: string): void {
  localStorage.setItem('kexamanager:token', token)
}

/**
 * Fonction utilitaire pour supprimer le token d'authentification
 */
export function clearAuthToken(): void {
  localStorage.removeItem('kexamanager:token')
}

/**
 * Vérifie si l'utilisateur est authentifié
 */
export function isAuthenticated(): boolean {
  return getAuthToken() !== null
}

// Exemples d'utilisation :
//
// // GET avec paramètres
// const users = await adminGet<User[]>('/users', { page: '1', limit: '10' })
//
// // POST avec données
// const newUser = await adminPost<User>('/users', { name: 'John', email: 'john@example.com' })
//
// // PUT pour mise à jour
// const updatedUser = await adminPut<User>('/users/123', { name: 'John Doe' })
//
// // DELETE
// await adminDelete('/users/123')
//
// // Gestion des erreurs
// try {
//   const data = await adminGet('/protected-endpoint')
// } catch (error) {
//   if (error.status === 401) {
//     // Rediriger vers la page de connexion
//   }
//   console.error('Erreur API:', error.message)
// }
