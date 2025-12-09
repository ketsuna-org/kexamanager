import { Box } from "@mui/material"
import { Outlet } from "react-router-dom"
import Sidebar from "../components/layout/Sidebar"

interface DashboardLayoutProps {
    onLogout: () => void
    hasProject: boolean
    projectType?: "garage" | "s3" | string | null
}

const DashboardLayout = ({ onLogout, hasProject, projectType }: DashboardLayoutProps) => {
    return (
        <Box sx={{ display: "flex", height: "100vh", overflow: "hidden", bgcolor: "background.default" }}>
            <Sidebar onLogout={onLogout} hasProject={hasProject} projectType={projectType ?? undefined} />
            <Box component="main" sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <Box sx={{ flex: 1, overflow: "auto" }}>
                    <Outlet />
                </Box>
            </Box>
        </Box>
    )
}

export default DashboardLayout
