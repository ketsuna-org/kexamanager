import { useCallback, useEffect, useState, type DependencyList } from "react"
import { toErrorMessage } from "../api/storage"

export interface AsyncState<T> {
    data: T | null
    loading: boolean
    error: string | null
    refresh: () => void
}

/**
 * Runs `load` whenever `deps` change (and on `refresh()`), and keeps the last
 * result while a refresh is in flight so lists do not flash empty. `load`
 * returning `undefined` (missing input) leaves the hook idle.
 */
export function useAsync<T>(load: () => Promise<T> | undefined, deps: DependencyList): AsyncState<T> & { setData: (value: T | null) => void } {
    const [data, setData] = useState<T | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [nonce, setNonce] = useState(0)

    useEffect(() => {
        const promise = load()
        if (!promise) {
            setData(null)
            setError(null)
            setLoading(false)
            return
        }
        let cancelled = false
        setLoading(true)
        setError(null)
        promise
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
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [...deps, nonce])

    const refresh = useCallback(() => setNonce((value) => value + 1), [])
    return { data, loading, error, refresh, setData }
}
