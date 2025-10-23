// Lightweight, typed Admin API client utility
// - Provides adminRequest wrapper and typed helpers: adminGet/adminPost/adminPut/adminPatch/adminDelete
// - Handles path params interpolation, query params, headers, timeout and unified error handling
// - Designed to be used with OpenAPI-generated types (pass generic response types)

export interface ApiError {
    message: string
    status: number
    code?: string
}

// Generic API response envelope (documented in README-adminApi.md)
export interface ApiResponse<T = unknown> {
    success: boolean
    data?: T
    message?: string
    error?: string
}

const BASE_URL = "/api"

// Global current project ID - updated by App component
let currentProjectId: number | null = null

export function setCurrentProjectId(projectId: number | null) {
    currentProjectId = projectId
}

export function getCurrentProjectId(): number | null {
    return currentProjectId
}

function getAuthToken(): string | null {
    return localStorage.getItem("kexamanager:token")
}

function getDefaultHeaders(): HeadersInit {
    const headers: HeadersInit = {
        "Content-Type": "application/json",
    }

    const token = getAuthToken()
    if (token) headers["Authorization"] = `Bearer ${token}`

    return headers
}

function interpolatePath(path: string, params?: Record<string, string | number>): string {
    if (!params) return path
    return Object.entries(params).reduce((p, [k, v]) => p.replace(new RegExp(`\\{${k}\\}`, "g"), encodeURIComponent(String(v))), path)
}

function buildQueryString(params?: Record<string, string | number | boolean | undefined | null>): string {
    if (!params) return ""
    const search = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) {
        if (v === undefined || v === null) continue
        search.append(k, String(v))
    }
    const s = search.toString()
    return s ? `?${s}` : ""
}

async function timeoutFetch(input: RequestInfo, init: RequestInit, ms: number): Promise<Response> {
    const controller = new AbortController()
    const id = setTimeout(() => controller.abort(), ms)
    try {
        const res = await fetch(input, { ...init, signal: controller.signal })
        return res
    } finally {
        clearTimeout(id)
    }
}

async function parseResponse<T>(response: Response): Promise<T> {
    if (!response.ok) {
        let errorMessage = `HTTP Error: ${response.status}`
        try {
            const body = await response.json()
            errorMessage = body.message || body.error || errorMessage
        } catch {
            // leave default
        }

        const err: ApiError = { message: errorMessage, status: response.status }
        throw err
    }

    try {
        return (await response.json()) as T
    } catch {
        // If not JSON, return null as T
        return null as unknown as T
    }
}

export type RequestOptions = {
    pathParams?: Record<string, string | number>
    query?: Record<string, string | number | boolean | undefined | null>
    headers?: HeadersInit
    timeoutMs?: number
    projectId?: number // Explicit project ID override
}

// Endpoints that don't require project ID
const NON_PROJECT_ENDPOINTS = [
    "/auth/login",
    "/auth/create-user",
    "/s3-configs",
    "/s3-configs/create",
    "/s3-configs/update",
    "/s3-configs/delete"
]

export async function adminRequest<T = unknown>(method: string, endpoint: string, body?: unknown, opts?: RequestOptions): Promise<T> {
    const path = interpolatePath(endpoint, opts?.pathParams)

    // Determine if this endpoint needs a project ID
    const needsProjectId = !NON_PROJECT_ENDPOINTS.some(prefix => path.startsWith(prefix))
    const projectId = opts?.projectId ?? (needsProjectId ? currentProjectId : null)

    let url: string
    if (projectId) {
        // Determine service based on endpoint
        let service: string
        if (path.startsWith("/v2")) {
            service = ""  // No service prefix for admin endpoints
        } else if (path.startsWith("/s3")) {
            service = "s3"
        } else {
            // Fallback, shouldn't happen
            service = "admin"
        }
        const servicePath = service ? `/${service}` : ""
        url = `${BASE_URL}/${projectId}${servicePath}${path}${buildQueryString(opts?.query)}`
    } else {
        url = BASE_URL + path + buildQueryString(opts?.query)
    }

    const headers = { ...getDefaultHeaders(), ...(opts?.headers || {}) }

    const init: RequestInit = {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
    }

    const timeoutMs = opts?.timeoutMs ?? 30_000

    const response = await timeoutFetch(url, init, timeoutMs)
    return parseResponse<T>(response)
}

export const adminGet = <T = unknown>(endpoint: string, opts?: RequestOptions) => adminRequest<T>("GET", endpoint, undefined, opts)
export const adminPost = <T = unknown>(endpoint: string, body?: unknown, opts?: RequestOptions) => adminRequest<T>("POST", endpoint, body, opts)
export const adminPut = <T = unknown>(endpoint: string, body?: unknown, opts?: RequestOptions) => adminRequest<T>("PUT", endpoint, body, opts)
export const adminPatch = <T = unknown>(endpoint: string, body?: unknown, opts?: RequestOptions) => adminRequest<T>("PATCH", endpoint, body, opts)
export const adminDelete = <T = unknown>(endpoint: string, opts?: RequestOptions) => adminRequest<T>("DELETE", endpoint, undefined, opts)

export function setAuthToken(token: string) {
    localStorage.setItem("kexamanager:token", token)
}

export function clearAuthToken() {
    localStorage.removeItem("kexamanager:token")
}

export function isAuthenticated(): boolean {
    return getAuthToken() !== null
}

export { getAuthToken }
