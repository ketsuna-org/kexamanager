import { useMemo, useState, type ChangeEvent, type KeyboardEvent, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import Box from "@mui/material/Box"
import Dialog from "@mui/material/Dialog"
import { CornerDownLeft, FolderOpen, Search } from "lucide-react"
import { k, monoFamily } from "../theme"
import { useProject } from "../contexts/ProjectContext"
import { getCurrentUser } from "../auth/tokenAuth"
import { visibleGroups } from "./nav"

interface Entry {
    id: string
    label: string
    hint: string
    icon: ReactNode
    run: () => void
}

/** ⌘K: jump to any screen of the active project, or switch project. */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { projects, selectedProject, selectProject, hasAdmin } = useProject()
    const [query, setQuery] = useState("")
    const [cursor, setCursor] = useState(0)

    const entries = useMemo<Entry[]>(() => {
        const isAdminUser = getCurrentUser()?.role === "admin"
        const pages: Entry[] = visibleGroups({ hasProject: selectedProject !== null, hasAdmin, isAdminUser }).flatMap((group) =>
            group.items.map((item) => {
                const Icon = item.icon
                return {
                    id: `page:${item.id}`,
                    label: t(item.labelKey),
                    hint: t(group.labelKey),
                    icon: <Icon size={16} />,
                    run: () => navigate(item.to),
                }
            }),
        )
        const projectEntries: Entry[] = projects
            .filter((project) => project.id !== selectedProject?.id)
            .map((project) => ({
                id: `project:${project.id}`,
                label: project.name,
                hint: t("palette.switchProject"),
                icon: <FolderOpen size={16} />,
                run: () => {
                    selectProject(project.id)
                    navigate("/overview")
                },
            }))
        return [...pages, ...projectEntries]
    }, [t, navigate, projects, selectedProject, selectProject, hasAdmin])

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return entries
        return entries.filter((entry) => entry.label.toLowerCase().includes(q) || entry.hint.toLowerCase().includes(q))
    }, [entries, query])

    const close = () => {
        setQuery("")
        setCursor(0)
        onClose()
    }

    const run = (entry: Entry | undefined) => {
        if (!entry) return
        close()
        entry.run()
    }

    const onKeyDown = (event: KeyboardEvent) => {
        if (event.key === "ArrowDown") {
            event.preventDefault()
            setCursor((c) => Math.min(c + 1, filtered.length - 1))
        } else if (event.key === "ArrowUp") {
            event.preventDefault()
            setCursor((c) => Math.max(c - 1, 0))
        } else if (event.key === "Enter") {
            event.preventDefault()
            run(filtered[cursor])
        }
    }

    return (
        <Dialog open={open} onClose={close} maxWidth="sm" fullWidth slotProps={{ paper: { sx: { alignSelf: "flex-start", mt: "12vh" } } }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, px: 2, borderBottom: `1px solid ${k.border}` }}>
                <Search size={18} color={k.label} />
                <Box
                    component="input"
                    autoFocus
                    value={query}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => {
                        setQuery(e.target.value)
                        setCursor(0)
                    }}
                    onKeyDown={onKeyDown}
                    placeholder={t("palette.placeholder")}
                    aria-label={t("palette.placeholder")}
                    sx={{ flex: 1, minHeight: 54, border: 0, outline: 0, bgcolor: "transparent", color: k.text, font: "inherit", fontSize: 15 }}
                />
            </Box>
            <Box role="listbox" sx={{ maxHeight: 380, overflowY: "auto", p: 1 }}>
                {filtered.length === 0 && <Box sx={{ p: 2, color: k.text2 }}>{t("palette.empty")}</Box>}
                {filtered.map((entry, index) => (
                    <Box
                        key={entry.id}
                        role="option"
                        aria-selected={index === cursor}
                        onMouseEnter={() => setCursor(index)}
                        onClick={() => run(entry)}
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1.25,
                            minHeight: 42,
                            px: 1.5,
                            borderRadius: "8px",
                            cursor: "pointer",
                            bgcolor: index === cursor ? k.active : "transparent",
                            color: index === cursor ? k.text : k.nav,
                        }}
                    >
                        {entry.icon}
                        <Box sx={{ flex: 1 }}>{entry.label}</Box>
                        <Box component="span" sx={{ fontSize: 12, color: k.label }}>
                            {entry.hint}
                        </Box>
                        {index === cursor && <CornerDownLeft size={14} color={k.label} />}
                    </Box>
                ))}
            </Box>
            <Box sx={{ px: 2, py: 1, borderTop: `1px solid ${k.border}`, fontSize: 12, color: k.label, fontFamily: monoFamily }}>{t("palette.help")}</Box>
        </Dialog>
    )
}
