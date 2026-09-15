import Box from "@mui/material/Box"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { Outlet, useLocation } from "react-router-dom"
import Header from "../components/layout/Header"
import Sidebar from "../components/layout/Sidebar"

interface DashboardLayoutProps {
    onLogout: () => void
    hasProject: boolean
    projectType?: "garage" | "s3" | string | null
}

/** AppBar title per route, reusing labels already shipped in both locales. */
const routeTitleKeys = {
    "/projects": "projects.title",
    "/buckets": "dashboard.buckets",
    "/apps": "dashboard.apps",
    "/manager": "userManager.title",
    "/s3": "s3browser.title",
    "/adminTokens": "dashboard.adminTokens",
    "/nodes": "dashboard.nodes",
    "/blocks": "dashboard.blocks",
    "/workers": "dashboard.workers",
    "/cluster": "dashboard.cluster",
    "/preview": "s3browser.preview_title",
} as const

/** `/cluster` keeps its active tab in the query string, the AppBar follows it. */
const clusterTabTitleKeys: Record<string, string> = {
    Overview: "dashboard.cluster_tab_overview",
    Nodes: "dashboard.cluster_tab_nodes",
    Partitions: "dashboard.cluster_tab_partitions",
    Config: "dashboard.cluster_tab_config",
    Logs: "dashboard.cluster_tab_logs",
}

const DashboardLayout = ({ onLogout, hasProject, projectType }: DashboardLayoutProps) => {
    const { t } = useTranslation()
    const location = useLocation()
    const [mobileNavOpen, setMobileNavOpen] = useState(false)

    useEffect(() => {
        setMobileNavOpen(false)
    }, [location.pathname])

    const activeTab = location.pathname === "/cluster"
        ? new URLSearchParams(location.search).get("tab")
        : null
    const tabTitleKey = activeTab ? clusterTabTitleKeys[activeTab] : undefined
    const titleKey = tabTitleKey ?? (location.pathname in routeTitleKeys
        ? routeTitleKeys[location.pathname as keyof typeof routeTitleKeys]
        : undefined)

    return (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100dvh", overflow: "hidden", bgcolor: "background.default" }}>
            <Header
                title={titleKey ? t(titleKey) : undefined}
                onMenuClick={() => setMobileNavOpen(true)}
            />
            <Box sx={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
                <Sidebar
                    onLogout={onLogout}
                    hasProject={hasProject}
                    projectType={projectType ?? undefined}
                    mobileOpen={mobileNavOpen}
                    onMobileClose={() => setMobileNavOpen(false)}
                />
                <Box component="main" sx={{ flex: 1, minWidth: 0, overflow: "auto" }}>
                    <Outlet />
                </Box>
            </Box>
        </Box>
    )
}

export default DashboardLayout
