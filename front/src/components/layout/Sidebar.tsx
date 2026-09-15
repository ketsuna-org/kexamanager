import { useState } from "react"
import {
    Avatar,
    Box,
    Collapse,
    Divider,
    Drawer,
    IconButton,
    List,
    ListItemButton,
    ListItemIcon,
    ListItemText,
    MenuItem,
    Select,
    Tooltip,
    Typography,
    useMediaQuery,
} from "@mui/material"
import { useTheme } from "@mui/material/styles"
import { Box as BoxIcon, LogOut, Shield, Activity, ChevronLeft, ChevronRight, Sun, Moon, Server, Layers, Settings, FileText, HardDrive, ChevronDown, ChevronUp, X } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { useTranslation } from "react-i18next"
import { useSettings } from "../../contexts/useSettings"
import { layout } from "../../theme"
import type { LucideIcon } from "lucide-react"

interface SidebarProps {
    onLogout: () => void
    hasProject: boolean
    projectType?: "garage" | "s3" | string
    /** Opens the `temporary` drawer below `md`; ignored on desktop. */
    mobileOpen?: boolean
    /** Closes the `temporary` drawer (backdrop, close button, navigation). */
    onMobileClose?: () => void
}

interface NavItem {
    /** i18n key resolved at render time, never a literal label. */
    labelKey: string
    icon: LucideIcon
    path: string
    alwaysShow?: boolean
    hideForS3Only?: boolean
    children?: NavItem[]
}

const Sidebar = ({ onLogout, hasProject, projectType, mobileOpen = false, onMobileClose }: SidebarProps) => {
    const location = useLocation()
    const navigate = useNavigate()
    const theme = useTheme()
    const { t } = useTranslation()
    const { sidebarCollapsed, toggleSidebar, lang, setLang, themeMode, toggleTheme } = useSettings()
    const [openCluster, setOpenCluster] = useState(true)

    // The rail (collapsed) state only exists on desktop; the mobile drawer is always full width.
    const isDesktop = useMediaQuery(theme.breakpoints.up("md"))
    const collapsed = isDesktop && sidebarCollapsed
    const drawerWidth = collapsed ? layout.sidebarRail : layout.sidebar
    const themeLabel = themeMode === "dark" ? t("shell.light_mode") : t("shell.dark_mode")

    const isS3Only = projectType === "s3"

    const navItems: NavItem[] = [
        { labelKey: "nav.projects", icon: BoxIcon, path: "/projects", alwaysShow: true },
        { labelKey: "nav.s3_browser", icon: HardDrive, path: "/s3" },
        { labelKey: "nav.logs", icon: FileText, path: "/cluster?tab=Logs", hideForS3Only: true },
        // D12 : `/buckets` est aussi accessible aux projets `s3` (stats S3 pures).
        { labelKey: "nav.buckets", icon: BoxIcon, path: "/buckets" },
        { labelKey: "nav.applications", icon: Activity, path: "/apps", hideForS3Only: true },
    ]

    const systemItems: NavItem[] = [
        {
            labelKey: "nav.cluster",
            icon: Activity,
            path: "/cluster",
            hideForS3Only: true,
            children: [
                { labelKey: "nav.cluster_overview", icon: Activity, path: "/cluster?tab=Overview" },
                { labelKey: "nav.cluster_nodes", icon: Server, path: "/cluster?tab=Nodes" },
                { labelKey: "nav.cluster_partitions", icon: Layers, path: "/cluster?tab=Partitions" },
                { labelKey: "nav.cluster_config", icon: Settings, path: "/cluster?tab=Config" },
            ]
        },
        { labelKey: "nav.workers", icon: Activity, path: "/workers", hideForS3Only: true },
        { labelKey: "nav.blocks", icon: BoxIcon, path: "/blocks", hideForS3Only: true },
        { labelKey: "nav.admin_tokens", icon: Shield, path: "/adminTokens", hideForS3Only: true },
        { labelKey: "nav.users", icon: Shield, path: "/manager", alwaysShow: true },
    ]

    const filteredNavItems = navItems.filter(item => (hasProject || item.alwaysShow) && !(isS3Only && item.hideForS3Only))
    const filteredSystemItems = systemItems.filter(item => (hasProject || item.alwaysShow) && !(isS3Only && item.hideForS3Only))

    const isSelected = (path: string) => {
        if (path.includes("?")) {
            return location.pathname + location.search === path
        }
        return location.pathname === path
    }

    const handleItemClick = (item: NavItem) => {
        if (item.children) {
            setOpenCluster(!openCluster)
            if (collapsed) toggleSidebar()
        } else {
            navigate(item.path)
        }
    }

    return (
        <Drawer
            variant={isDesktop ? "permanent" : "temporary"}
            open={isDesktop || mobileOpen}
            onClose={onMobileClose}
            ModalProps={{ keepMounted: true }}
            sx={{
                flexShrink: 0,
                width: isDesktop ? drawerWidth : 0,
                "& .MuiDrawer-paper": {
                    width: isDesktop ? drawerWidth : layout.sidebar,
                    boxSizing: "border-box",
                    height: "100dvh",
                    overflowX: "hidden",
                    transition: theme.transitions.create("width", { duration: theme.transitions.duration.standard }),
                },
            }}
        >
            <Box sx={{ display: "flex", flexDirection: "column", height: "100%", bgcolor: "background.paper" }}>
                {/* Logo Area */}
                <Box sx={{ p: 3, display: "flex", alignItems: "center", gap: 1, justifyContent: collapsed ? "center" : "space-between" }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                        <Box sx={{
                            width: 32, height: 32, borderRadius: 1, bgcolor: "primary.main",
                            display: "flex", alignItems: "center", justifyContent: "center",
                            color: "white", fontWeight: "bold",
                            flexShrink: 0
                        }}>
                            K
                        </Box>
                        {!collapsed && (
                            <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: -0.5, whiteSpace: "nowrap" }}>
                                KexaManager
                            </Typography>
                        )}
                    </Box>
                    {!isDesktop && (
                        <IconButton onClick={onMobileClose} size="small" aria-label={t("shell.close_nav")}>
                            <X size={20} />
                        </IconButton>
                    )}
                </Box>

                {/* Navigation */}
                <Box sx={{ px: 2, flex: 1, overflowY: "auto" }}>
                    <List>
                        {filteredNavItems.map((item) => (
                            <Tooltip key={item.path} title={collapsed ? t(item.labelKey) : ""} placement="right">
                                <ListItemButton
                                    onClick={() => navigate(item.path)}
                                    selected={isSelected(item.path)}
                                    sx={{
                                        mb: 0.5,
                                        borderRadius: 1,
                                        justifyContent: collapsed ? "center" : "flex-start",
                                        color: isSelected(item.path) ? "primary.main" : "text.secondary",
                                    }}
                                >
                                    <ListItemIcon sx={{ minWidth: 40, color: "inherit", justifyContent: "center" }}>
                                        <item.icon size={20} />
                                    </ListItemIcon>
                                    {!collapsed && <ListItemText primary={t(item.labelKey)} slotProps={{
                                        primary: { sx: { fontSize: "0.9rem", fontWeight: 500 } }
                                    }} />}
                                </ListItemButton>
                            </Tooltip>
                        ))}
                    </List>

                    {filteredSystemItems.length > 0 && (
                        !collapsed ? (
                            <Typography variant="caption" sx={{ px: 2, mt: 3, mb: 1, display: "block", color: "text.secondary", fontWeight: 600 }}>
                                {t("shell.system")}
                            </Typography>
                        ) : (
                            <Divider sx={{ my: 2 }} />
                        )
                    )}

                    {filteredSystemItems.length > 0 && (
                        <List>
                            {filteredSystemItems.map((item) => (
                                <Box key={item.path}>
                                    <Tooltip title={collapsed ? t(item.labelKey) : ""} placement="right">
                                        <ListItemButton
                                            onClick={() => handleItemClick(item)}
                                            selected={!item.children && isSelected(item.path)}
                                            sx={{
                                                mb: 0.5,
                                                borderRadius: 1,
                                                justifyContent: collapsed ? "center" : "flex-start",
                                                color: (!item.children && isSelected(item.path)) ? "primary.main" : "text.secondary",
                                            }}
                                        >
                                            <ListItemIcon sx={{ minWidth: 40, color: "inherit", justifyContent: "center" }}>
                                                <item.icon size={20} />
                                            </ListItemIcon>
                                            {!collapsed && <ListItemText primary={t(item.labelKey)} slotProps={{
                                                primary: { sx: { fontSize: "0.9rem", fontWeight: 500 } }
                                            }} />}
                                            {!collapsed && item.children && (
                                                openCluster ? <ChevronUp size={16} /> : <ChevronDown size={16} />
                                            )}
                                        </ListItemButton>
                                    </Tooltip>
                                    {item.children && !collapsed && (
                                        <Collapse in={openCluster} timeout="auto" unmountOnExit>
                                            <List component="div" disablePadding>
                                                {item.children.map((child) => (
                                                    <ListItemButton
                                                        key={child.path}
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
                                                        <ListItemText primary={t(child.labelKey)} slotProps={{
                                                            primary: { sx: { fontSize: "0.85rem" } }
                                                        }} />
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
                <Box sx={{ p: 1, display: "flex", flexDirection: collapsed ? "column" : "row", alignItems: "center", justifyContent: collapsed ? "center" : "flex-end", gap: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexDirection: collapsed ? "column" : "row", mr: collapsed ? 0 : 2 }}>
                        {!collapsed && isDesktop && (
                            <Select
                                value={lang}
                                onChange={(e) => setLang(e.target.value)}
                                size="small"
                                sx={{ height: 32, minWidth: 60 }}
                                variant="outlined"
                                slotProps={{ input: { "aria-label": t("shell.language") } }}
                            >
                                <MenuItem value="en">EN</MenuItem>
                                <MenuItem value="fr">FR</MenuItem>
                            </Select>
                        )}
                        <Tooltip title={themeLabel} placement="right">
                            <IconButton onClick={toggleTheme} size="small" aria-label={themeLabel}>
                                {themeMode === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                            </IconButton>
                        </Tooltip>
                    </Box>
                    {isDesktop && (
                        <IconButton
                            onClick={toggleSidebar}
                            size="small"
                            aria-label={sidebarCollapsed ? t("shell.expand_nav") : t("shell.collapse_nav")}
                        >
                            {sidebarCollapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
                        </IconButton>
                    )}
                </Box>

                {/* User Profile */}
                <Box sx={{ p: 2 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, p: 1, borderRadius: 1, "&:hover": { bgcolor: "action.hover" }, justifyContent: collapsed ? "center" : "flex-start" }}>
                        <Avatar sx={{ width: 32, height: 32, bgcolor: "secondary.main", fontSize: "0.875rem" }}>JD</Avatar>
                        {!collapsed && (
                            <Box sx={{ flex: 1, overflow: "hidden" }}>
                                <Typography variant="body2" noWrap sx={{
                                    fontWeight: 600
                                }}>{t("shell.default_user")}</Typography>
                                <Typography variant="caption" noWrap sx={{
                                    color: "text.secondary"
                                }}>admin@kexa.io</Typography>
                            </Box>
                        )}
                        {!collapsed && (
                            <Tooltip title={t("shell.logout")}>
                                <IconButton size="small" onClick={onLogout} aria-label={t("shell.logout")}>
                                    <LogOut size={16} />
                                </IconButton>
                            </Tooltip>
                        )}
                    </Box>
                </Box>
            </Box>
        </Drawer>
    );
}

export default Sidebar
