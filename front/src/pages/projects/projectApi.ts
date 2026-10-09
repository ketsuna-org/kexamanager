import { adminDelete, adminGet, adminPost, adminPut } from "../../utils/adminClient"
import { getBucketUsage, getClusterOverview, getStorageOverview, listS3Buckets, toErrorMessage } from "../../api/storage"
import type { components } from "../../types/openapi"
import type { ProjectSummary } from "../../contexts/ProjectContext"

export type ProjectType = "garage" | "s3"

/** Body of `/s3-configs/create|update|test`. Empty secrets keep the stored ones on update. */
export interface ProjectForm {
    name: string
    type: ProjectType
    s3_url: string
    region: string
    force_path_style: boolean
    admin_url: string
    admin_token: string
    client_id: string
    client_secret: string
}

export interface ConnectionCheck {
    tested: boolean
    ok: boolean
    error?: string
    buckets?: number
    status?: string
    nodes?: number
    nodesUp?: number
}

export interface ConnectionTest {
    s3: ConnectionCheck
    admin: ConnectionCheck
}

export function createProject(form: ProjectForm): Promise<ProjectSummary> {
    return adminPost<ProjectSummary>("/s3-configs/create", form)
}

export function updateProject(id: number, form: ProjectForm): Promise<ProjectSummary> {
    return adminPut<ProjectSummary>("/s3-configs/update", form, { query: { id } })
}

export function deleteProject(id: number): Promise<void> {
    return adminDelete<void>("/s3-configs/delete", { query: { id } })
}

export function testProject(form: ProjectForm, id?: number): Promise<ConnectionTest> {
    return adminPost<ConnectionTest>("/s3-configs/test", { ...form, id }, { timeoutMs: 20_000 })
}

/** What a project card shows; `reachable: false` carries the error. */
export interface ProjectProbe {
    reachable: boolean
    error?: string
    health?: string
    buckets: number | null
    nodesUp: number | null
    nodesKnown: number | null
    used: number | null
    usedComplete: boolean
    usable: number | null
}

/** Checks that a project answers and gathers the figures of its card. */
export async function probeProject(project: ProjectSummary): Promise<ProjectProbe> {
    try {
        if (project.type !== "s3" && project.admin_url) {
            const [cluster, storage, layout] = await Promise.all([
                getClusterOverview(project.id),
                getStorageOverview(project.id),
                adminGet<components["schemas"]["GetClusterLayoutResponse"]>("/v2/GetClusterLayout", { projectId: project.id }).catch(() => null),
            ])
            const usable = layout?.roles.reduce((sum, role) => sum + (role.usableCapacity ?? 0), 0) ?? null
            return {
                reachable: true,
                health: cluster.health.status,
                buckets: storage.totals.buckets,
                nodesUp: cluster.health.connectedNodes,
                nodesKnown: cluster.health.knownNodes,
                used: storage.totals.bytes,
                usedComplete: storage.totals.bytesComplete,
                usable: usable || null,
            }
        }
        const buckets = await listS3Buckets(project.id)
        const usage = buckets.length ? await getBucketUsage(project.id, buckets.map((b) => b.name)).catch(() => null) : null
        return {
            reachable: true,
            health: "healthy",
            buckets: buckets.length,
            nodesUp: null,
            nodesKnown: null,
            used: usage?.totals.bytes ?? (buckets.length ? null : 0),
            usedComplete: usage ? usage.totals.objectsComplete : true,
            usable: null,
        }
    } catch (error) {
        return {
            reachable: false,
            error: toErrorMessage(error),
            buckets: null,
            nodesUp: null,
            nodesKnown: null,
            used: null,
            usedComplete: true,
            usable: null,
        }
    }
}

/** Host part of an endpoint URL, for display. */
export function hostOf(url?: string): string {
    if (!url) return ""
    try {
        return new URL(url.includes("://") ? url : `http://${url}`).host
    } catch {
        return url
    }
}
