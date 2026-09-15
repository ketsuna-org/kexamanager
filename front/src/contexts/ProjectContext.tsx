import { createContext, useContext } from "react"
import { setCurrentProjectId } from "../utils/adminClient"

/**
 * Minimal project shape shared by every project-backed screen. The
 * `/api/s3-configs` payload carries more fields (`admin_url`, …) but these
 * three are what a screen needs to identify and label a project.
 */
export interface ProjectSummary {
    id: number
    name: string
    type?: string
}

export interface ProjectContextValue {
    /** Projects the current user can open. Loaded once by App.tsx. */
    projects: ProjectSummary[]
    /** Id of the active project, `null` when none is selected. */
    selectedProjectId: number | null
    /** Active project resolved from `projects`, so screens can display its name. */
    selectedProject: ProjectSummary | null
    /** Switches the active project; `null` clears the selection. */
    selectProject: (projectId: number | null) => void
    /** `true` while App.tsx is fetching the project list. */
    loading: boolean
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
