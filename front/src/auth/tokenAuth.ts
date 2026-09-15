/**
 * Service d'authentification pour Kexamanager
 * Utilise les credentials username/password
 */

import { adminPost, setAuthToken, clearAuthToken } from "../utils/adminClient"
import type { ApiError } from "../utils/adminClient"

export interface LoginResponse {
    token: string
    user: {
        id: number
        username: string
        role: string
    }
}

export interface User {
    id: number
    username: string
    role: string
}

/**
 * Authentifie un utilisateur avec username/password
 */
export async function authenticateWithCredentials(username: string, password: string): Promise<LoginResponse> {
    if (!username || !password) {
        throw new Error("Username and password are required")
    }

    try {
        const response = await adminPost<LoginResponse>("/auth/login", {
            username,
            password,
        })

        // Stocker le token et l'utilisateur
        setAuthToken(response.token)
        localStorage.setItem("kexamanager:user", JSON.stringify(response.user))

        return response
    } catch (error) {
        clearAuthToken()
        localStorage.removeItem("kexamanager:user")
        const apiError = error as ApiError
        throw new Error(apiError.message || "Authentication failed", { cause: error })
    }
}

/**
 * Vérifie si l'utilisateur est connecté
 */
export function isLoggedIn(): boolean {
    const token = localStorage.getItem("kexamanager:token")
    const user = localStorage.getItem("kexamanager:user")
    return !!token && !!user
}

/**
 * Récupère l'utilisateur actuel depuis le localStorage
 */
export function getCurrentUser(): User | null {
    const userStr = localStorage.getItem("kexamanager:user")
    if (!userStr) return null

    try {
        return JSON.parse(userStr)
    } catch {
        return null
    }
}

/**
 * Déconnexion
 */
export function logout(): void {
    clearAuthToken()
    localStorage.removeItem("kexamanager:user")
}
