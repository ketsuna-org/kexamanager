import type { ProjectSummary } from "../../contexts/ProjectContext"

/** Shape accepted by the `badge` prop of `components/PageHeader`. */
export interface ProjectBadge {
    label: string
    color?: "primary" | "secondary" | "success" | "warning" | "error" | "info"
    variant?: "filled" | "outlined"
}

/**
 * Read-only badge describing the active project, meant for `PageHeader` on
 * every project-scoped screen. Returns `undefined` when no project is active so
 * headers never render an empty badge (the shell's ProjectSwitcher owns the
 * interactive switching).
 */
export function projectBadge(project: ProjectSummary | null): ProjectBadge | undefined {
    if (!project) return undefined
    return {
        label: project.type ? `${project.name} · ${project.type}` : project.name,
        color: "primary",
        variant: "outlined",
    }
}
