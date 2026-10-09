import { adminGet, getAuthToken } from "../../utils/adminClient"

/** One entry of `GET /api/{project}/logs`. */
export interface LogEntry {
    ID: number
    CreatedAt: string
    project_id: number
    user_id: number
    /** Empty for system actions. */
    username: string
    action: string
    details: string
    status: "success" | "error" | string
}

export interface LogPage {
    logs: LogEntry[]
    total: number
    page: number
    limit: number
}

export interface LogFilters {
    category?: LogCategory | ""
    user?: string
    status?: string
    since?: string
    q?: string
}

export type LogCategory = "buckets" | "objects" | "keys" | "cluster"

/** Actions behind each filter of the Activity screen. */
export const LOG_CATEGORIES: Record<LogCategory, string[]> = {
    buckets: ["create_bucket", "delete_bucket", "update_bucket", "add_bucket_alias", "remove_bucket_alias", "allow_bucket_key", "deny_bucket_key", "cleanup_incomplete_uploads"],
    objects: ["upload_file", "delete_object", "delete_objects", "copy_object", "share_link"],
    keys: ["create_key", "update_key", "delete_key", "import_key", "create_admin_token", "update_admin_token", "delete_admin_token"],
    cluster: [
        "update_cluster_layout",
        "apply_cluster_layout",
        "revert_cluster_layout",
        "cluster_layout_skip_dead_nodes",
        "retry_block_resync",
        "purge_blocks",
        "launch_repair_operation",
        "connect_cluster_nodes",
        "set_worker_variable",
        "create_metadata_snapshot",
    ],
}

function filterQuery(filters: LogFilters): Record<string, string | undefined> {
    return {
        action: filters.category ? LOG_CATEGORIES[filters.category].join(",") : undefined,
        user: filters.user || undefined,
        status: filters.status || undefined,
        since: filters.since || undefined,
        q: filters.q?.trim() || undefined,
    }
}

export function fetchLogs(projectId: number, filters: LogFilters, page: number, limit = 50): Promise<LogPage> {
    return adminGet<LogPage>("/logs", { projectId, query: { ...filterQuery(filters), page, limit } })
}

/** Downloads the filtered journal as CSV (built server side). */
export async function downloadLogsCsv(projectId: number, filters: LogFilters): Promise<void> {
    const params = new URLSearchParams({ format: "csv" })
    for (const [key, value] of Object.entries(filterQuery(filters))) if (value) params.set(key, value)
    const response = await fetch(`/api/${projectId}/logs?${params}`, { headers: { Authorization: `Bearer ${getAuthToken() ?? ""}` } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `activity-${projectId}.csv`
    link.click()
    URL.revokeObjectURL(url)
}

/** `create_bucket` → `CreateBucket`, the Garage endpoint name shown as a tag. */
export function actionTag(action: string): string {
    return action
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join("")
}

/** `key=value, key=value` details written by the proxy for admin actions. */
export function parseDetails(details: string): Record<string, string> | null {
    if (!details || !/^\w+=/.test(details)) return null
    const out: Record<string, string> = {}
    for (const part of details.split(", ")) {
        const index = part.indexOf("=")
        if (index <= 0) return null
        out[part.slice(0, index)] = part.slice(index + 1)
    }
    return out
}

/** The object of the action, for the one-line summary. */
export function logTarget(entry: LogEntry): string | null {
    const fields = parseDetails(entry.details)
    if (!fields) return null
    if (fields.key) return fields.bucket ? `${fields.bucket}/${fields.key}` : fields.key
    return fields.name ?? fields.bucket ?? fields.globalAlias ?? fields.localAlias ?? fields.accessKeyId ?? fields.id ?? fields.bucketId ?? fields.node ?? null
}
