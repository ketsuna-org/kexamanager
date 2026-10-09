import { Activity, Database, FolderOpen, KeyRound, LayoutDashboard, Server, ShieldCheck, Users, Wrench, type LucideIcon } from "lucide-react"
import type { NavCounts } from "../contexts/ProjectContext"

export interface NavItem {
    id: string
    to: string
    labelKey: string
    icon: LucideIcon
    /** Navigation counter shown on the right. */
    count?: keyof NavCounts
    /** The counter is an alert (red pill) rather than a plain number. */
    alert?: boolean
}

export interface NavGroup {
    id: "storage" | "access" | "cluster" | "instance"
    labelKey: string
    items: NavItem[]
}

/** The console's navigation, grouped as in the design. */
export const NAV_GROUPS: NavGroup[] = [
    {
        id: "storage",
        labelKey: "nav.groups.storage",
        items: [
            { id: "overview", to: "/overview", labelKey: "nav.overview", icon: LayoutDashboard },
            { id: "buckets", to: "/buckets", labelKey: "nav.buckets", icon: Database, count: "buckets" },
            { id: "activity", to: "/activity", labelKey: "nav.activity", icon: Activity },
        ],
    },
    {
        id: "access",
        labelKey: "nav.groups.access",
        items: [
            { id: "keys", to: "/keys", labelKey: "nav.keys", icon: KeyRound, count: "keys" },
            { id: "adminTokens", to: "/admin-tokens", labelKey: "nav.adminTokens", icon: ShieldCheck },
        ],
    },
    {
        id: "cluster",
        labelKey: "nav.groups.cluster",
        items: [
            { id: "topology", to: "/topology", labelKey: "nav.topology", icon: Server },
            { id: "maintenance", to: "/maintenance", labelKey: "nav.maintenance", icon: Wrench, count: "blockErrors", alert: true },
        ],
    },
    {
        id: "instance",
        labelKey: "nav.groups.instance",
        items: [
            { id: "projects", to: "/projects", labelKey: "nav.projects", icon: FolderOpen },
            { id: "users", to: "/users", labelKey: "nav.users", icon: Users },
        ],
    },
]

/** Which groups the sidebar shows for the current context. */
export function visibleGroups({ hasProject, hasAdmin, isAdminUser }: { hasProject: boolean; hasAdmin: boolean; isAdminUser: boolean }): NavGroup[] {
    return NAV_GROUPS.filter((group) => {
        if (group.id === "storage") return hasProject
        if (group.id === "access" || group.id === "cluster") return hasProject && hasAdmin
        return true
    }).map((group) => (group.id === "instance" && !isAdminUser ? { ...group, items: group.items.filter((item) => item.id !== "users") } : group))
}
