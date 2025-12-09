import { Box, Typography, List, ListItemButton, ListItemIcon, ListItemText, Divider, Avatar, IconButton, Tooltip, Select, MenuItem, Collapse } from "@mui/material"
import { Box as BoxIcon, LogOut, Shield, Activity, ChevronLeft, ChevronRight, Sun, Moon, Server, Layers, Settings, FileText, HardDrive, ChevronDown, ChevronUp } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { useSettings } from "../../contexts/SettingsContext"
import { useState } from "react"

interface SidebarProps {
    onLogout: () => void
    hasProject: boolean
    projectType?: "garage" | "s3" | string
}

const Sidebar = ({ onLogout, hasProject, projectType }: SidebarProps) => {
    const location = useLocation()
    const navigate = useNavigate()
    const { sidebarCollapsed, toggleSidebar } = useSettings()
    const [openCluster, setOpenCluster] = useState(true)

    const isS3Only = projectType === "s3"

    const navItems = [
        { label: "Projects", icon: BoxIcon, path: "/projects", alwaysShow: true },
        { label: "S3 Browser", icon: HardDrive, path: "/s3" },
        { label: "Logs", icon: FileText, path: "/cluster?tab=Logs", hideForS3Only: true },
        { label: "Buckets", icon: BoxIcon, path: "/buckets", hideForS3Only: true },
        { label: "Applications", icon: Activity, path: "/apps", hideForS3Only: true },
    ]

    const systemItems = [
        {
            label: "Cluster",
            icon: Activity,
            path: "/cluster",
            hideForS3Only: true,
            children: [
                { label: "Overview", icon: Activity, path: "/cluster?tab=Overview" },
                { label: "Nodes", icon: Server, path: "/cluster?tab=Nodes" },
                { label: "Partitions", icon: Layers, path: "/cluster?tab=Partitions" },
                { label: "Config", icon: Settings, path: "/cluster?tab=Config" },
            ]
        },
        { label: "Workers", icon: Activity, path: "/workers", hideForS3Only: true },
        { label: "Blocks", icon: BoxIcon, path: "/blocks", hideForS3Only: true },
        { label: "Admin Tokens", icon: Shield, path: "/adminTokens", hideForS3Only: true },
        { label: "Users", icon: Shield, path: "/manager", alwaysShow: true },
    ]

    const filteredNavItems = navItems.filter(item => (hasProject || item.alwaysShow) && !(isS3Only && item.hideForS3Only))
    const filteredSystemItems = systemItems.filter(item => (hasProject || item.alwaysShow) && !(isS3Only && item.hideForS3Only))

    const isSelected = (path: string) => {
        if (path.includes("?")) {
            return location.pathname + location.search === path
        }
        return location.pathname === path
    }

    const handleItemClick = (item: any) => {
        if (item.children) {
            setOpenCluster(!openCluster)
            if (sidebarCollapsed) toggleSidebar()
        } else {
            navigate(item.path)
        }
    }

    return (
        <Box sx={{
            width: sidebarCollapsed ? 80 : 260,
            height: "100vh",
            borderRight: "1px solid",
            borderColor: "divider",
            display: "flex",
            flexDirection: "column",
            bgcolor: "background.paper",
            flexShrink: 0,
            transition: "width 0.3s ease",
            overflowX: "hidden"
        }}>
            {/* Logo Area */}
            <Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 1, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
                <Box sx={{
                    width: 32, height: 32, borderRadius: 1, bgcolor: "primary.main",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "white", fontWeight: "bold",
                    flexShrink: 0
                }}>
                    K
                </Box>
                {!sidebarCollapsed && (
                    <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.5, whiteSpace: "nowrap" }}>
                        KexaManager
                    </Typography>
                )}
            </Box>

            {/* Navigation */}
            <Box sx={{ px: 2, flex: 1, overflowY: "auto" }}>
                <List>
                    {filteredNavItems.map((item) => (
                        <Tooltip key={item.path} title={sidebarCollapsed ? item.label : ""} placement="right">
                            <ListItemButton
                                onClick={() => navigate(item.path)}
                                selected={isSelected(item.path)}
                                sx={{
                                    mb: 0.5,
                                    borderRadius: 1,
                                    justifyContent: sidebarCollapsed ? "center" : "flex-start",
                                    color: isSelected(item.path) ? "primary.main" : "text.secondary",
                                }}
                            >
                                <ListItemIcon sx={{ minWidth: 40, color: "inherit", justifyContent: "center" }}>
                                    <item.icon size={20} />
                                </ListItemIcon>
                                {!sidebarCollapsed && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: "0.9rem", fontWeight: 500 }} />}
                            </ListItemButton>
                        </Tooltip>
                    ))}
                </List>

                {filteredSystemItems.length > 0 && (
                    !sidebarCollapsed ? (
                        <Typography variant="caption" sx={{ px: 2, mt: 3, mb: 1, display: "block", color: "text.secondary", fontWeight: 600 }}>
                            SYSTEM
                        </Typography>
                    ) : (
                        <Divider sx={{ my: 2 }} />
                    )
                )}

                {filteredSystemItems.length > 0 && (
                    <List>
                        {filteredSystemItems.map((item) => (
                            <Box key={item.label}>
                                <Tooltip title={sidebarCollapsed ? item.label : ""} placement="right">
                                    <ListItemButton
                                        onClick={() => handleItemClick(item)}
                                        selected={!item.children && isSelected(item.path)}
                                        sx={{
                                            mb: 0.5,
                                            borderRadius: 1,
                                            justifyContent: sidebarCollapsed ? "center" : "flex-start",
                                            color: (!item.children && isSelected(item.path)) ? "primary.main" : "text.secondary",
                                        }}
                                    >
                                        <ListItemIcon sx={{ minWidth: 40, color: "inherit", justifyContent: "center" }}>
                                            <item.icon size={20} />
                                        </ListItemIcon>
                                        {!sidebarCollapsed && <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: "0.9rem", fontWeight: 500 }} />}
                                        {!sidebarCollapsed && item.children && (
                                            openCluster ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                                        )}
                                    </ListItemButton>
                                </Tooltip>
                                {item.children && !sidebarCollapsed && (
                                    <Collapse in={openCluster} timeout="auto" unmountOnExit>
                                        <List component="div" disablePadding>
                                            {item.children.map((child) => (
                                                <ListItemButton
                                                    key={child.label}
                                                    onClick={() => navigate(child.path)}
                                                    selected={isSelected(child.path)}
                                                    sx={{
                                                        pl: 4,
                                                        mb: 0.5,
                                                        borderRadius: 1,
                                                        color: isSelected(child.path) ? "primary.main" : "text.secondary",
                                                    }}
                                                >
                                                    <ListItemIcon sx={{ minWidth: 40, color: "inherit", justifyContent: "center" }}>
                                                        <child.icon size={18} />
                                                    </ListItemIcon>
                                                    <ListItemText primary={child.label} primaryTypographyProps={{ fontSize: "0.85rem" }} />
                                                </ListItemButton>
                                            ))}
                                        </List>
                                    </Collapse>
                                )}
                            </Box>
                        ))}
                    </List>
                )}
            </Box>

            <Divider sx={{ mx: 2 }} />

            {/* Sidebar Toggle */}
            <Box sx={{ p: 1, display: "flex", flexDirection: sidebarCollapsed ? "column" : "row", alignItems: "center", justifyContent: sidebarCollapsed ? "center" : "flex-end", gap: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexDirection: sidebarCollapsed ? "column" : "row", mr: sidebarCollapsed ? 0 : 2 }}>
                    {!sidebarCollapsed && (
                        <Select
                            value={useSettings().lang}
                            onChange={(e) => useSettings().setLang(e.target.value)}
                            size="small"
                            sx={{ height: 32, minWidth: 60 }}
                            variant="outlined"
                        >
                            <MenuItem value="en">EN</MenuItem>
                            <MenuItem value="fr">FR</MenuItem>
                        </Select>
                    )}
                    <Tooltip title={useSettings().themeMode === "dark" ? "Light Mode" : "Dark Mode"} placement="right">
                        <IconButton onClick={useSettings().toggleTheme} size="small">
                            {useSettings().themeMode === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                        </IconButton>
                    </Tooltip>
                </Box>
                <IconButton onClick={toggleSidebar} size="small">
                    {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                </IconButton>
            </Box>

            {/* User Profile */}
            <Box sx={{ p: 2 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 1, borderRadius: 1, "&:hover": { bgcolor: "action.hover" }, justifyContent: sidebarCollapsed ? "center" : "flex-start" }}>
                    <Avatar sx={{ width: 32, height: 32, bgcolor: "secondary.main", fontSize: "0.875rem" }}>JD</Avatar>
                    {!sidebarCollapsed && (
                        <Box sx={{ flex: 1, overflow: "hidden" }}>
                            <Typography variant="body2" fontWeight={600} noWrap>Admin User</Typography>
                            <Typography variant="caption" color="text.secondary" noWrap>admin@kexa.io</Typography>
                        </Box>
                    )}
                    {!sidebarCollapsed && (
                        <IconButton size="small" onClick={onLogout}>
                            <LogOut size={16} />
                        </IconButton>
                    )}
                </Box>
            </Box>
        </Box>
    )
}

export default Sidebar
