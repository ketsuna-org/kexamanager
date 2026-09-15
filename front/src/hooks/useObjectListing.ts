import { useCallback, useEffect, useState } from "react"
import { listObjects, toErrorMessage } from "../api/storage"
import type { ObjectListing } from "../api/storage"
import type { AsyncState } from "./useCapabilities"

export interface UseObjectListingParams {
    projectId?: number | null
    /** Bucket name. An empty bucket means "nothing to list": no request is sent. */
    bucket?: string | null
    prefix?: string
    /** Continuation token of the next page. */
    token?: string
    /** `"/"` lists one level with folders, `""` lists recursively. */
    delimiter?: string
    maxKeys?: number
}

/**
 * Lists one level of a bucket. Every input is a primitive, so the effect can
 * depend on them directly and only re-runs when one of them really changed.
 */
export function useObjectListing(params: UseObjectListingParams): AsyncState<ObjectListing> {
    const { projectId, bucket, prefix, token, delimiter, maxKeys } = params
    const [data, setData] = useState<ObjectListing | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [nonce, setNonce] = useState(0)

    useEffect(() => {
        if (!projectId || !bucket) {
            setData(null)
            setError(null)
            setLoading(false)
            return
        }
        let cancelled = false
        setLoading(true)
        setError(null)
        listObjects(projectId, { bucket, prefix, delimiter, continuationToken: token, maxKeys })
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
    }, [projectId, bucket, prefix, token, delimiter, maxKeys, nonce])

    const refresh = useCallback(() => setNonce((value) => value + 1), [])
    return { data, loading, error, refresh }
}
