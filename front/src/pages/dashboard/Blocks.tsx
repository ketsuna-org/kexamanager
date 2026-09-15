import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ListBlockErrors, PurgeBlocks, RetryBlockResync } from "../../utils/apiWrapper"
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
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined"
import type { components } from "../../types/openapi"
import PageHeader from "../../components/PageHeader"
import DataTable, { type DataTableColumn } from "../../components/data/DataTable"
import { useProject } from "../../contexts/ProjectContext"
import { projectBadge } from "./projectBadge"

type MultiResp = components["schemas"]["MultiResponse_LocalListBlockErrorsResponse"]

type NodeErrors = {
    id: string
    errors?: components["schemas"]["BlockError"][]
    error?: string
}

export default function Blocks() {
    const { t } = useTranslation()
    const { selectedProject } = useProject()
    const [items, setItems] = useState<NodeErrors[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [detailNodeId, setDetailNodeId] = useState<string | null>(null)
    const [purgeConfirm, setPurgeConfirm] = useState<null | { nodeId: string; blockHash: string }>(null)
    const [retryConfirm, setRetryConfirm] = useState<null | { nodeId: string; blockHash: string }>(null)
    const [actionBusy, setActionBusy] = useState(false)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await ListBlockErrors({})
            const maybe = res as unknown
            const parsed = maybe && typeof maybe === "object" ? (maybe as MultiResp) : { success: {}, error: {} }

            const ids = new Set<string>()
            Object.keys(parsed.success || {}).forEach((k) => ids.add(k))
            Object.keys(parsed.error || {}).forEach((k) => ids.add(k))

            const combined: NodeErrors[] = Array.from(ids).map((id) => ({
                id,
                errors: parsed.success?.[id],
                error: parsed.error?.[id],
            }))

            setItems(combined)
        } catch (e) {
            const msg = (e as unknown) instanceof Error ? (e as Error).message : String(e)
            setError(msg)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    /** Le detail est derive de `items` : apres purge/resync il reflete le rechargement. */
    const detailItem = detailNodeId === null ? null : items.find((it) => it.id === detailNodeId) ?? null

    async function doPurge() {
        if (!purgeConfirm) return
        setActionBusy(true)
        try {
            await PurgeBlocks({ node: purgeConfirm.nodeId }, [purgeConfirm.blockHash])
            await load()
        } catch (e) {
            setError((e as unknown as { message?: string })?.message || String(e))
        } finally {
            setActionBusy(false)
            setPurgeConfirm(null)
        }
    }

    async function doRetry() {
        if (!retryConfirm) return
        setActionBusy(true)
        try {
            await RetryBlockResync({ node: retryConfirm.nodeId }, { blockHashes: [retryConfirm.blockHash] })
            await load()
        } catch (e) {
            setError((e as unknown as { message?: string })?.message || String(e))
        } finally {
            setActionBusy(false)
            setRetryConfirm(null)
        }
    }

    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                title={t("dashboard.blocks")}
                subtitle={t("dashboard.blocks_desc")}
                badge={projectBadge(selectedProject)}
                action={
                    <Button variant="outlined" startIcon={<RefreshIcon />} onClick={load} disabled={loading}>
                        {t("common.refresh")}
                    </Button>
                }
            />

            <DataTable<NodeErrors>
                rows={items}
                getRowId={(it) => it.id}
                loading={loading}
                error={error}
                errorTitle={t("blocks.load_error") as string}
                retryLabel={t("common.retry") as string}
                onRetry={() => { void load() }}
                tableLabel={t("dashboard.blocks") as string}
                columns={[
                    {
                        id: "node",
                        header: t("blocks.col.node"),
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
                        id: "error_count",
                        header: t("blocks.col.error_count"),
                        numeric: true,
                        cell: (it) => (it.errors ? it.errors.length : "-"),
                        sortValue: (it) => it.errors?.length ?? -1,
                        minWidth: 140,
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
                ] satisfies DataTableColumn<NodeErrors>[]}
                searchValue={(it) => [it.id, it.error ?? "", ...(it.errors ?? []).map((e) => e.blockHash)].join(" ")}
                defaultSort={{ id: "error_count", dir: "desc" }}
                pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
                emptyState={{
                    icon: <ReportProblemOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
                    title: t("blocks.empty") as string,
                    description: t("blocks.empty_desc") as string,
                    primaryAction: { label: t("common.refresh") as string, onClick: () => { void load() } },
                }}
            />

            <Dialog open={detailItem !== null} onClose={() => setDetailNodeId(null)} fullWidth maxWidth="md">
                <DialogTitle>{t("common.details")}</DialogTitle>
                <DialogContent>
                    {detailItem && (
                        <Stack spacing={1}>
                            <Typography variant="subtitle2">{t("blocks.details")}</Typography>
                            <Typography variant="body2">{detailItem.id}</Typography>
                            {detailItem.error ? (
                                <Typography sx={{ color: "error.main" }}>{detailItem.error}</Typography>
                            ) : detailItem.errors && detailItem.errors.length > 0 ? (
                                <Stack spacing={1}>
                                    {detailItem.errors.map((e) => (
                                        <Paper key={e.blockHash} variant="outlined" sx={{ p: 1 }}>
                                            <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap" }}>
                                                <Typography variant="body2" sx={{ fontFamily: "monospace", fontWeight: "bold", wordBreak: "break-all" }}>
                                                    {e.blockHash}
                                                </Typography>
                                                <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                                    {`errors: ${e.errorCount}, refcount: ${e.refcount}`}
                                                </Typography>
                                                <Stack direction="row" spacing={1} sx={{ ml: "auto" }}>
                                                    <Button size="small" color="error" onClick={() => setPurgeConfirm({ nodeId: detailItem.id, blockHash: e.blockHash })}>
                                                        {t("blocks.purge")}
                                                    </Button>
                                                    <Button size="small" onClick={() => setRetryConfirm({ nodeId: detailItem.id, blockHash: e.blockHash })}>
                                                        {t("blocks.retry_resync")}
                                                    </Button>
                                                </Stack>
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

            <Dialog open={!!purgeConfirm} onClose={() => setPurgeConfirm(null)}>
                <DialogTitle>{t("blocks.purge_confirm_title")}</DialogTitle>
                <DialogContent>
                    <Typography>
                        {purgeConfirm ? t("blocks.purge_confirm_desc", { hash: purgeConfirm.blockHash, node: purgeConfirm.nodeId }) : ""}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setPurgeConfirm(null)}>{t("common.cancel")}</Button>
                    <Button color="error" variant="contained" onClick={doPurge} disabled={actionBusy}>
                        {t("blocks.purge")}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={!!retryConfirm} onClose={() => setRetryConfirm(null)}>
                <DialogTitle>{t("blocks.retry_confirm_title")}</DialogTitle>
                <DialogContent>
                    <Typography>
                        {retryConfirm ? t("blocks.retry_confirm_desc", { hash: retryConfirm.blockHash, node: retryConfirm.nodeId }) : ""}
                    </Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRetryConfirm(null)}>{t("common.cancel")}</Button>
                    <Button variant="contained" onClick={doRetry} disabled={actionBusy}>
                        {t("blocks.retry_resync")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}
