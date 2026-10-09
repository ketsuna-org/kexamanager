import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { useLocation, useNavigate } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Alert from "@mui/material/Alert"
import { MoreHorizontal, Plus } from "lucide-react"
import { useProject, type ProjectSummary } from "../../contexts/ProjectContext"
import { useFeedback } from "../../contexts/FeedbackContext"
import { toErrorMessage } from "../../api/storage"
import { Page } from "../../shell/Page"
import { k } from "../../theme"
import { Bar, Card, EmptyBlock, Muted, Pill, Spinner, Tag } from "../../ui/kit"
import { ConfirmDialog } from "../../ui/dialogs"
import { formatBytes } from "../../utils/format"
import { deleteProject, hostOf, probeProject, type ProjectProbe } from "./projectApi"

function Metric({ label, value }: { label: string; value: string }) {
    return (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, minWidth: 0 }}>
            <Muted small>{label}</Muted>
            <Box sx={{ fontWeight: 600, fontSize: 15 }}>{value}</Box>
        </Box>
    )
}

function ProjectCard({
    project,
    active,
    onOpen,
    onEdit,
    onDelete,
}: {
    project: ProjectSummary
    active: boolean
    onOpen: () => void
    onEdit: () => void
    onDelete: () => void
}) {
    const { t } = useTranslation()
    const [probe, setProbe] = useState<ProjectProbe | null>(null)
    const [menu, setMenu] = useState<HTMLElement | null>(null)

    useEffect(() => {
        let cancelled = false
        probeProject(project).then((result) => !cancelled && setProbe(result))
        return () => {
            cancelled = true
        }
    }, [project])

    const isGarage = project.type !== "s3"
    const status = !probe
        ? { tone: "neutral" as const, label: t("projects.checking") }
        : !probe.reachable
          ? { tone: "err" as const, label: t("projects.unreachable") }
          : probe.health === "healthy"
            ? { tone: "ok" as const, label: t("projects.reachable") }
            : { tone: "warn" as const, label: t("projects.degraded") }
    const usedPercent = probe?.usable && probe.used !== null ? (probe.used / probe.usable) * 100 : null

    let note: string
    if (!probe) note = t("projects.checkingNote")
    else if (!probe.reachable) note = probe.error ?? ""
    else if (usedPercent !== null) note = t("projects.usableNote", { percent: Math.round(usedPercent), size: formatBytes(probe.usable) })
    else if (!isGarage || !project.admin_url) note = t("projects.noCapacityNote")
    else if (probe.nodesUp !== null && probe.nodesKnown !== null && probe.nodesUp < probe.nodesKnown) note = t("projects.nodesDownNote", { count: probe.nodesKnown - probe.nodesUp })
    else note = ""

    return (
        <Card
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: 2,
                p: "20px",
                cursor: "pointer",
                borderColor: active ? k.accent : k.border,
                "&:hover": { borderColor: active ? k.accent : k.borderHover },
            }}
            onClick={onOpen}
            role="link"
            tabIndex={0}
            onKeyDown={(e) => {
                if (e.key === "Enter") onOpen()
            }}
            aria-label={t("projects.openProject", { name: project.name })}
        >
            <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.5 }}>
                <Box sx={{ width: 36, height: 36, borderRadius: "9px", bgcolor: k.accentSoft, color: k.accentText, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, flex: "none" }}>
                    {isGarage ? "G" : "S"}
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ fontWeight: 600, fontSize: 15, overflowWrap: "anywhere" }}>{project.name}</Box>
                    <Muted small sx={{ overflowWrap: "anywhere" }}>
                        {hostOf(project.s3_url) || hostOf(project.admin_url)}
                    </Muted>
                </Box>
                <Pill tone={status.tone} dot>
                    {status.label}
                </Pill>
                <IconButton
                    size="small"
                    aria-label={t("ui.moreActions")}
                    onClick={(e) => {
                        e.stopPropagation()
                        setMenu(e.currentTarget)
                    }}
                >
                    <MoreHorizontal />
                </IconButton>
                <Menu anchorEl={menu} open={Boolean(menu)} onClose={() => setMenu(null)} onClick={(e) => e.stopPropagation()}>
                    <MenuItem
                        onClick={() => {
                            setMenu(null)
                            onEdit()
                        }}
                    >
                        {t("ui.edit")}
                    </MenuItem>
                    <MenuItem
                        onClick={() => {
                            setMenu(null)
                            onDelete()
                        }}
                        sx={{ color: k.err }}
                    >
                        {t("ui.delete")}
                    </MenuItem>
                </Menu>
            </Box>
            <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                <Pill>{isGarage ? t("projects.garage") : t("projects.s3Compatible")}</Pill>
                {project.region && <Tag>{project.region}</Tag>}
                {isGarage && project.admin_url && <Tag>Admin API</Tag>}
                {project.force_path_style && <Tag>Path style</Tag>}
                {active && <Pill tone="accent">{t("projects.active")}</Pill>}
            </Box>
            <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1.5 }}>
                <Metric label={t("projects.buckets")} value={probe?.buckets !== null && probe?.buckets !== undefined ? String(probe.buckets) : "-"} />
                <Metric label={t("projects.nodes")} value={probe?.nodesKnown !== null && probe?.nodesKnown !== undefined ? `${probe.nodesUp} / ${probe.nodesKnown}` : "n/a"} />
                <Metric label={t("projects.used")} value={probe?.used !== null && probe?.used !== undefined ? `${probe.usedComplete ? "" : "≥ "}${formatBytes(probe.used)}` : "-"} />
            </Box>
            {usedPercent !== null && <Bar value={usedPercent} />}
            <Muted small sx={{ color: probe && !probe.reachable ? k.err : undefined, overflowWrap: "anywhere" }}>
                {note}
            </Muted>
        </Card>
    )
}

export default function ProjectsPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const location = useLocation()
    const { notify } = useFeedback()
    const { projects, loading, selectedProjectId, selectProject, reloadProjects } = useProject()
    const [deleting, setDeleting] = useState<ProjectSummary | null>(null)
    const [busy, setBusy] = useState(false)
    const projectRequired = Boolean((location.state as { projectRequired?: boolean } | null)?.projectRequired)

    const open = (project: ProjectSummary) => {
        selectProject(project.id)
        navigate("/overview")
    }

    const confirmDelete = async () => {
        if (!deleting) return
        setBusy(true)
        try {
            await deleteProject(deleting.id)
            if (deleting.id === selectedProjectId) selectProject(null)
            await reloadProjects()
            notify({ severity: "success", message: t("projects.deleted", { name: deleting.name }) })
            setDeleting(null)
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    return (
        <Page
            crumbs={[{ label: t("nav.groups.instance") }, { label: t("nav.projects") }]}
            title={t("nav.projects")}
            description={t("projects.description")}
            actions={
                <Button variant="contained" startIcon={<Plus />} onClick={() => navigate("/projects/new")}>
                    {t("projects.new")}
                </Button>
            }
        >
            {projectRequired && <Alert severity="info">{t("projects.required")}</Alert>}
            {loading && projects.length === 0 ? (
                <Spinner />
            ) : projects.length === 0 ? (
                <Card>
                    <EmptyBlock
                        title={t("projects.emptyTitle")}
                        description={t("projects.emptyDescription")}
                        action={
                            <Button variant="contained" startIcon={<Plus />} onClick={() => navigate("/projects/new")}>
                                {t("projects.new")}
                            </Button>
                        }
                    />
                </Card>
            ) : (
                <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))" }}>
                    {projects.map((project) => (
                        <ProjectCard
                            key={project.id}
                            project={project}
                            active={project.id === selectedProjectId}
                            onOpen={() => open(project)}
                            onEdit={() => navigate(`/projects/${project.id}/edit`)}
                            onDelete={() => setDeleting(project)}
                        />
                    ))}
                    <Box
                        component="button"
                        type="button"
                        onClick={() => navigate("/projects/new")}
                        sx={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 1,
                            minHeight: 200,
                            p: 3,
                            border: `1px dashed ${k.borderStrong}`,
                            borderRadius: "12px",
                            bgcolor: "transparent",
                            color: k.text2,
                            font: "inherit",
                            cursor: "pointer",
                            "&:hover": { borderColor: k.accent, color: k.text },
                        }}
                    >
                        <Plus size={22} />
                        <Box sx={{ fontWeight: 600, color: k.text }}>{t("projects.add")}</Box>
                        <Box sx={{ fontSize: 13 }}>{t("projects.addHint")}</Box>
                    </Box>
                </Box>
            )}
            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title={t("projects.deleteTitle", { name: deleting?.name })}
                message={t("projects.deleteMessage")}
                confirmLabel={t("projects.deleteConfirm")}
                confirmText={deleting?.name}
                onConfirm={confirmDelete}
                busy={busy}
            />
        </Page>
    )
}
