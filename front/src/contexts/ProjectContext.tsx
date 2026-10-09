import { createContext, useContext } from "react"
import { setCurrentProjectId } from "../utils/adminClient"
import type { Capabilities } from "../api/types"

/** A project as served by `GET /api/s3-configs` (secrets are never sent). */
export interface ProjectSummary {
    id: number
    name: string
    type?: "garage" | "s3" | string
    s3_url?: string
    admin_url?: string
    client_id?: string
    region?: string
    force_path_style?: boolean
}

export interface NavCounts {
    buckets: number | null
    keys: number | null
    blockErrors: number | null
}

export interface ProjectContextValue {
    /** Projects the current user can open. */
    projects: ProjectSummary[]
    /** Id of the active project, `null` when none is selected. */
    selectedProjectId: number | null
    /** Active project resolved from `projects`. */
    selectedProject: ProjectSummary | null
    /** Switches the active project; `null` clears the selection. */
    selectProject: (projectId: number | null) => void
    /** `true` while the project list is loading. */
    loading: boolean
    /** Reloads the project list (after a create, edit or delete). */
    reloadProjects: () => Promise<ProjectSummary[]>
    /** What the proxy can do for the active project, `null` while unknown. */
    capabilities: Capabilities | null
    /** `true` when the Garage admin API answers for the active project. */
    hasAdmin: boolean
    /** Counters shown in the navigation. */
    counts: NavCounts
    /** Re-reads the navigation counters after a mutation. */
    refreshCounts: () => void
}

const PROJECT_STORAGE_KEY = "kexamanager:selectedProject"

/** Reads the selection persisted by previous sessions. */
export function readStoredProjectId(): number | null {
    const saved = localStorage.getItem(PROJECT_STORAGE_KEY)
    if (!saved) return null
    const parsed = Number.parseInt(saved, 10)
    return Number.isNaN(parsed) ? null : parsed
}

/**
 * Persists the selection and mirrors it into the admin client, which prefixes
 * every project-scoped request with that id.
 */
export function persistSelectedProjectId(projectId: number | null): void {
    if (projectId === null) {
        localStorage.removeItem(PROJECT_STORAGE_KEY)
    } else {
        localStorage.setItem(PROJECT_STORAGE_KEY, String(projectId))
    }
    setCurrentProjectId(projectId)
}

export const ProjectContext = createContext<ProjectContextValue | null>(null)

/** Source of truth for the active project; fails loudly when used outside the provider. */
export function useProject(): ProjectContextValue {
    const context = useContext(ProjectContext)
    if (!context) {
        throw new Error("useProject must be used within ProjectContext.Provider")
    }
    return context
}

/** Active project, for screens only reachable with one selected. */
export function useActiveProject(): ProjectSummary {
    const { selectedProject } = useProject()
    if (!selectedProject) throw new Error("useActiveProject needs a selected project")
    return selectedProject
}
