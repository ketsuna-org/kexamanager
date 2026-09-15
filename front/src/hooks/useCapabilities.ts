import { useCallback, useEffect, useState } from "react"
import { getCapabilities, toErrorMessage } from "../api/storage"
import type { Capabilities } from "../api/storage"

/** Common shape of the thin data hooks of the storage feature. */
export interface AsyncState<T> {
    data: T | null
    loading: boolean
    error: string | null
    refresh: () => void
}

/**
 * Reads what the proxy can actually do for a project. Called once per project,
 * and once more on every `refresh()`.
 */
export function useCapabilities(projectId?: number | null): AsyncState<Capabilities> {
    const [data, setData] = useState<Capabilities | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [nonce, setNonce] = useState(0)

    useEffect(() => {
        if (!projectId) {
            setData(null)
            setError(null)
            setLoading(false)
            return
        }
        let cancelled = false
        setLoading(true)
        setError(null)
        getCapabilities(projectId)
            .then((result) => {
                if (!cancelled) setData(result)
            })
            .catch((cause: unknown) => {
                if (!cancelled) setError(toErrorMessage(cause))
            })
            .finally(() => {
                if (!cancelled) setLoading(false)
            })
        return () => {
            cancelled = true
        }
    }, [projectId, nonce])

    const refresh = useCallback(() => setNonce((value) => value + 1), [])
    return { data, loading, error, refresh }
}
