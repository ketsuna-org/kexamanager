import { useState } from "react"
import { useTranslation } from "react-i18next"
import { NavLink, useNavigate } from "react-router-dom"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Divider from "@mui/material/Divider"
import Tooltip from "@mui/material/Tooltip"
import { Check, ChevronsUpDown, Languages, LogOut, Moon, Plus, Search, Sun } from "lucide-react"
import { k, monoFamily } from "../theme"
import { useProject, type ProjectSummary } from "../contexts/ProjectContext"
import { useSettings } from "../contexts/useSettings"
import { getCurrentUser } from "../auth/tokenAuth"
import { Avatar, Pill } from "../ui/kit"
import { visibleGroups } from "./nav"

export function Logo({ size = 30 }: { size?: number }) {
    return (
        <Box
            aria-hidden
            sx={{
                width: size,
                height: size,
                borderRadius: "8px",
                bgcolor: k.accent,
                color: k.onAccent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 700,
                fontSize: size * 0.5,
                flex: "none",
            }}
        >
            K
        </Box>
    )
}

function projectSubtitle(project: ProjectSummary, t: (key: string, options?: Record<string, unknown>) => string): string {
    if (project.type === "s3") return t("projects.typeS3")
    return project.admin_url ? t("projects.typeGarage") : t("projects.typeGarageNoAdmin")
}

function ProjectSwitcher({ onNavigate }: { onNavigate: () => void }) {
    const { t } = useTranslation()
    const { projects, selectedProject, selectProject } = useProject()
    const navigate = useNavigate()
    const [anchor, setAnchor] = useState<HTMLElement | null>(null)

    const choose = (id: number) => {
        setAnchor(null)
        selectProject(id)
        navigate("/overview")
        onNavigate()
    }

    return (
        <>
            <Box
                component="button"
                type="button"
                onClick={(e) => setAnchor(e.currentTarget)}
                aria-haspopup="menu"
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1.25,
                    p: "10px",
                    border: `1px solid ${k.borderStrong}`,
                    borderRadius: "10px",
                    bgcolor: k.raised,
                    color: k.text,
                    minHeight: 52,
                    font: "inherit",
                    textAlign: "left",
                    cursor: "pointer",
                    width: "100%",
                    "&:hover": { borderColor: k.borderHover },
                }}
            >
                <Box sx={{ width: 10, height: 10, borderRadius: "3px", bgcolor: selectedProject ? k.accent : k.faint, flex: "none" }} />
                <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
                    <Box component="span" sx={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selectedProject?.name ?? t("nav.noProject")}
                    </Box>
                    <Box component="span" sx={{ color: k.text2, fontSize: 12 }}>
                        {selectedProject ? projectSubtitle(selectedProject, t) : t("nav.chooseProject")}
                    </Box>
                </Box>
                <ChevronsUpDown size={16} color={k.label} />
            </Box>
            <Menu
                anchorEl={anchor}
                open={Boolean(anchor)}
                onClose={() => setAnchor(null)}
                slotProps={{ paper: { sx: { width: 260 } } }}
            >
                {projects.map((project) => (
                    <MenuItem key={project.id} onClick={() => choose(project.id)} selected={project.id === selectedProject?.id}>
                        <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                            <span>{project.name}</span>
                            <Box component="span" sx={{ color: k.text2, fontSize: 12 }}>
                                {projectSubtitle(project, t)}
                            </Box>
                        </Box>
                        {project.id === selectedProject?.id && <Check size={16} />}
                    </MenuItem>
                ))}
                {projects.length > 0 && <Divider />}
                <MenuItem
                    onClick={() => {
                        setAnchor(null)
                        navigate("/projects")
                        onNavigate()
                    }}
                >
                    {t("nav.allProjects")}
                </MenuItem>
                <MenuItem
                    onClick={() => {
                        setAnchor(null)
                        navigate("/projects/new")
                        onNavigate()
                    }}
                >
                    <Plus size={16} style={{ marginRight: 8 }} />
                    {t("projects.new")}
                </MenuItem>
            </Menu>
        </>
    )
}

export function Sidebar({ onLogout, onSearch, onNavigate }: { onLogout: () => void; onSearch: () => void; onNavigate: () => void }) {
    const { t } = useTranslation()
    const { selectedProject, hasAdmin, counts } = useProject()
    const { themeMode, toggleTheme, lang, setLang } = useSettings()
    const user = getCurrentUser()
    const isAdminUser = user?.role === "admin"
    const groups = visibleGroups({ hasProject: selectedProject !== null, hasAdmin, isAdminUser })
    const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

    return (
        <Box
            component="nav"
            aria-label={t("nav.label")}
            sx={{ height: "100%", display: "flex", flexDirection: "column", gap: 2, p: "16px 12px", bgcolor: k.side, overflowY: "auto" }}
        >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: "6px", py: "4px" }}>
                <Logo />
                <Box sx={{ fontWeight: 600, fontSize: 15 }}>KexaManager</Box>
            </Box>
            <ProjectSwitcher onNavigate={onNavigate} />
            <Box
                component="button"
                type="button"
                onClick={onSearch}
                sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    minHeight: 40,
                    px: "12px",
                    border: `1px solid ${k.borderStrong}`,
                    borderRadius: "8px",
                    bgcolor: k.input,
                    color: k.label,
                    font: "inherit",
                    cursor: "pointer",
                    width: "100%",
                }}
            >
                <Search size={16} />
                {t("nav.search")}
                <Box component="span" sx={{ ml: "auto", fontFamily: monoFamily, fontSize: 11, px: "6px", py: "2px", border: `1px solid ${k.borderStrong}`, borderRadius: "4px", color: k.text2 }}>
                    {isMac ? "⌘K" : "Ctrl K"}
                </Box>
            </Box>

            {groups.map((group) => (
                <Box key={group.id}>
                    <Box sx={{ fontSize: 11, fontWeight: 600, letterSpacing: ".08em", textTransform: "uppercase", color: k.label, px: "10px", pb: "6px" }}>
                        {t(group.labelKey)}
                    </Box>
                    {group.items.map((item) => {
                        const Icon = item.icon
                        const count = item.count ? counts[item.count] : null
                        return (
                            <Box
                                key={item.id}
                                component={NavLink}
                                to={item.to}
                                onClick={onNavigate}
                                sx={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 1.25,
                                    minHeight: 38,
                                    px: "10px",
                                    borderRadius: "7px",
                                    color: k.nav,
                                    textDecoration: "none",
                                    fontSize: 13.5,
                                    "& svg": { width: 17, height: 17, flex: "none" },
                                    "&:hover": { bgcolor: k.hover, color: k.text },
                                    "&.active": { bgcolor: k.active, color: k.text, "& svg": { color: k.accent } },
                                }}
                            >
                                <Icon />
                                {t(item.labelKey)}
                                {count !== null && count !== undefined && (item.alert ? count > 0 : true) && (
                                    item.alert ? (
                                        <Pill tone="err" sx={{ ml: "auto", height: 20 }}>
                                            {count}
                                        </Pill>
                                    ) : (
                                        <Box component="span" sx={{ ml: "auto", fontSize: 12, color: k.label }}>
                                            {count}
                                        </Box>
                                    )
                                )}
                            </Box>
                        )
                    })}
                </Box>
            ))}

            <Box sx={{ mt: "auto", display: "flex", alignItems: "center", gap: 1, p: "10px", borderTop: `1px solid ${k.border}` }}>
                <Avatar name={user?.username ?? "?"} />
                <Box sx={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                    <Box component="span" sx={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>
                        {user?.username}
                    </Box>
                    <Box component="span" sx={{ color: k.text2, fontSize: 12 }}>
                        {isAdminUser ? t("users.roleAdmin") : t("users.roleUser")}
                    </Box>
                </Box>
                <Tooltip title={t("nav.language")}>
                    <IconButton size="small" onClick={() => setLang(lang === "fr" ? "en" : "fr")} aria-label={t("nav.language")}>
                        <Languages />
                    </IconButton>
                </Tooltip>
                <Tooltip title={themeMode === "dark" ? t("nav.lightMode") : t("nav.darkMode")}>
                    <IconButton size="small" onClick={toggleTheme} aria-label={themeMode === "dark" ? t("nav.lightMode") : t("nav.darkMode")}>
                        {themeMode === "dark" ? <Sun /> : <Moon />}
                    </IconButton>
                </Tooltip>
                <Tooltip title={t("nav.logout")}>
                    <IconButton size="small" onClick={onLogout} aria-label={t("nav.logout")}>
                        <LogOut />
                    </IconButton>
                </Tooltip>
            </Box>
        </Box>
    )
}
