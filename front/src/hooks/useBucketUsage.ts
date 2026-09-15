import { useCallback, useEffect, useState } from "react"
import { getBucketUsage, toErrorMessage } from "../api/storage"
import type { BucketUsage } from "../api/storage"
import type { AsyncState } from "./useCapabilities"

/**
 * Per-bucket counters measured over S3 only (`POST /s3/bucket-usage`). This is
 * the source that works without the Garage admin API, so it feeds the
 * `Objets`/`Taille` columns of every project type. Counters can be lower bounds
 * (`complete: false`, rendered with `>=` by the caller) and a bucket that could
 * not be read comes back with `error` (the caller shows a dash).
 *
 * `buckets` restricts the scan; while it is empty the hook stays idle so no
 * scan is started before the bucket listing is known.
 */
export function useBucketUsage(projectId?: number | null, buckets?: string[] | null): AsyncState<BucketUsage> {
    const [data, setData] = useState<BucketUsage | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [nonce, setNonce] = useState(0)

    // Sorted JSON key: the request must not fire again just because the caller
    // rebuilt an equivalent array on every render.
    const bucketsKey = JSON.stringify(buckets && buckets.length > 0 ? [...buckets].sort() : [])

    useEffect(() => {
        const requested = JSON.parse(bucketsKey) as string[]
        if (!projectId || requested.length === 0) {
            setData(null)
            setError(null)
            setLoading(false)
            return
        }
        let cancelled = false
        setLoading(true)
        setError(null)
        getBucketUsage(projectId, requested)
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
    }, [projectId, bucketsKey, nonce])

    const refresh = useCallback(() => setNonce((value) => value + 1), [])
    return { data, loading, error, refresh }
}
