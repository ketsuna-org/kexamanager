import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ListWorkers } from "../../utils/apiWrapper"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import Typography from "@mui/material/Typography"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import Paper from "@mui/material/Paper"
import RefreshIcon from "@mui/icons-material/Refresh"
import GroupsOutlinedIcon from "@mui/icons-material/GroupsOutlined"
import type { components } from "../../types/openapi"
import PageHeader from "../../components/PageHeader"
import DataTable, { type DataTableColumn } from "../../components/data/DataTable"
import { useProject } from "../../contexts/ProjectContext"
import { projectBadge } from "./projectBadge"

type MultiResp = components["schemas"]["MultiResponse_LocalListWorkersResponse"]

type WorkerEntry = {
    id: string
    workers?: components["schemas"]["WorkerInfoResp"][]
    error?: string
}

export default function Workers() {
    const { t } = useTranslation()
    const { selectedProject } = useProject()
    const [items, setItems] = useState<WorkerEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [detailNodeId, setDetailNodeId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await ListWorkers({}, {})
            const maybe = res as unknown
            const parsed = maybe && typeof maybe === "object" ? (maybe as MultiResp) : { success: {}, error: {} }

            const ids = new Set<string>()
            Object.keys(parsed.success || {}).forEach((k) => ids.add(k))
            Object.keys(parsed.error || {}).forEach((k) => ids.add(k))

            const combined: WorkerEntry[] = Array.from(ids).map((id) => ({
                id,
                workers: (parsed.success && (parsed.success as Record<string, components["schemas"]["WorkerInfoResp"][]>)[id]) ?? undefined,
                error: (parsed.error && parsed.error[id]) ?? undefined,
            }))

            setItems(combined)
        } catch (e) {
            setError((e as unknown as { message?: string })?.message || String(e))
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    /** Le detail est derive de `items` : apres rechargement il reflete l'etat courant. */
    const detailItem = detailNodeId === null ? null : items.find((it) => it.id === detailNodeId) ?? null

    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                title={t("dashboard.workers")}
                subtitle={t("dashboard.workers_desc")}
                badge={projectBadge(selectedProject)}
                action={
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
                        {t("common.refresh")}
                    </Button>
                }
            />

            <DataTable<WorkerEntry>
                rows={items}
                getRowId={(it) => it.id}
                loading={loading}
                error={error}
                errorTitle={t("workers.load_error") as string}
                retryLabel={t("common.retry") as string}
                onRetry={() => { void load() }}
                tableLabel={t("dashboard.workers") as string}
                columns={[
                    {
                        id: "name",
                        header: t("workers.col.name"),
                        cell: (it) => (
                            <Stack spacing={0.25}>
                                <Typography variant="code">{it.id}</Typography>
                                {it.error && (
                                    <Typography variant="caption" sx={{ color: "error.main" }}>
                                        {it.error}
                                    </Typography>
                                )}
                            </Stack>
                        ),
                        sortValue: (it) => it.id,
                        minWidth: 180,
                    },
                    {
                        id: "count",
                        header: t("workers.col.count"),
                        numeric: true,
                        cell: (it) => (it.workers ? it.workers.length : "-"),
                        sortValue: (it) => it.workers?.length ?? -1,
                        minWidth: 110,
                    },
                    {
                        id: "actions",
                        header: t("common.actions"),
                        align: "right" as const,
                        minWidth: 110,
                        cell: (it) => (
                            <Button size="small" onClick={() => setDetailNodeId(it.id)}>
                                {t("common.details")}
                            </Button>
                        ),
                    },
                ] satisfies DataTableColumn<WorkerEntry>[]}
                searchValue={(it) => [it.id, it.error ?? "", ...(it.workers ?? []).map((w) => w.name ?? "")].join(" ")}
                defaultSort={{ id: "name", dir: "asc" }}
                pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
                emptyState={{
                    icon: <GroupsOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
                    title: t("workers.empty") as string,
                    description: t("workers.empty_desc") as string,
                    primaryAction: { label: t("common.refresh") as string, onClick: () => { void load() } },
                }}
            />

            <Dialog open={detailItem !== null} onClose={() => setDetailNodeId(null)} fullWidth maxWidth="md">
                <DialogTitle>{t("common.details")}</DialogTitle>
                <DialogContent>
                    {detailItem && (
                        <Stack spacing={1}>
                            <Typography variant="subtitle2">{t("workers.details")}</Typography>
                            <Typography variant="body2">{detailItem.id}</Typography>
                            {detailItem.error ? (
                                <Typography sx={{ color: "error.main" }}>{detailItem.error}</Typography>
                            ) : detailItem.workers && detailItem.workers.length > 0 ? (
                                <Stack spacing={1}>
                                    {detailItem.workers.map((w) => (
                                        <Paper key={w.name} variant="outlined" sx={{ p: 1 }}>
                                            <Stack spacing={0.5}>
                                                <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: "bold" }}>
                                                    {w.name}
                                                </Typography>
                                                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                                                    {w.freeform && w.freeform.length ? w.freeform.join("\n") : "-"}
                                                </Typography>
                                            </Stack>
                                        </Paper>
                                    ))}
                                </Stack>
                            ) : (
                                <Typography variant="body2">-</Typography>
                            )}
                            <Paper variant="outlined" sx={{ p: 1 }}>
                                <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>{JSON.stringify(detailItem, null, 2)}</pre>
                            </Paper>
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDetailNodeId(null)}>{t("common.close")}</Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
