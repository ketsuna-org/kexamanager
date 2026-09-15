import { useCallback, useEffect, useState } from "react"
import { getStorageOverview, toErrorMessage } from "../api/storage"
import type { StorageOverview } from "../api/storage"
import type { AsyncState } from "./useCapabilities"

/**
 * Cluster-wide storage counters (buckets, objects, bytes, quotas) read from the
 * Garage admin aggregate `/stats/buckets`. Only mounted when
 * `capabilities.admin.available` and `capabilities.admin.bucketUsage` are true:
 * the S3-only path is `useBucketUsage`, and no `/stats/*` route may be called
 * without the admin API.
 */
export function useStorageOverview(projectId?: number | null): AsyncState<StorageOverview> {
    const [data, setData] = useState<StorageOverview | null>(null)
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
        getStorageOverview(projectId)
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
