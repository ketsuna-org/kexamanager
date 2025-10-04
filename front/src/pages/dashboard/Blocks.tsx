import { useEffect, useState, Fragment, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ListBlockErrors, PurgeBlocks, RetryBlockResync } from "../../utils/apiWrapper"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Paper from "@mui/material/Paper"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import Typography from "@mui/material/Typography"
import Alert from "@mui/material/Alert"
import CircularProgress from "@mui/material/CircularProgress"
import Box from "@mui/material/Box"
import Stack from "@mui/material/Stack"
import IconButton from "@mui/material/IconButton"
import Collapse from "@mui/material/Collapse"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp"
import type { components } from "../../types/openapi"

type MultiResp = components["schemas"]["MultiResponse_LocalListBlockErrorsResponse"]

type NodeErrors = {
    id: string
    errors?: components["schemas"]["BlockError"][]
    error?: string
}

export default function Blocks() {
    const { t } = useTranslation()
    const [items, setItems] = useState<NodeErrors[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailItem, setDetailItem] = useState<unknown | null>(null)
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})
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

    function openDetails(i: unknown) {
        setDetailItem(i)
        setDetailOpen(true)
    }
    function closeDetails() {
        setDetailOpen(false)
        setDetailItem(null)
    }

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
        <div>
            <Typography variant="h5">{t("dashboard.blocks")}</Typography>
            <Typography variant="body2" gutterBottom>
                {t("dashboard.blocks_desc")}
            </Typography>

            {loading && (
                <Box display="flex" alignItems="center" gap={2}>
                    <CircularProgress size={20} />
                    <Typography>{t("common.loading")}</Typography>
                </Box>
            )}

            {error && <Alert severity="error">{error}</Alert>}

            {!loading && !error && (
                <Box>
                    {items.length === 0 ? (
                        <Alert severity="info">{t("blocks.empty")}</Alert>
                    ) : (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell />
                                        <TableCell>{t("blocks.col.node")}</TableCell>
                                        <TableCell>{t("blocks.col.error_count")}</TableCell>
                                        <TableCell>{t("common.actions")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {items.map((it) => (
                                        <Fragment key={it.id}>
                                            <TableRow hover>
                                                <TableCell sx={{ width: 48 }}>
                                                    <IconButton size="small" onClick={() => setExpanded((prev) => ({ ...prev, [it.id]: !prev[it.id] }))}>
                                                        {expanded[it.id] ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                                                    </IconButton>
                                                </TableCell>
                                                <TableCell component="th" scope="row">
                                                    {it.id}
                                                </TableCell>
                                                <TableCell>{it.errors ? it.errors.length : "-"}</TableCell>
                                                <TableCell>
                                                    <Button size="small" onClick={() => openDetails(it)}>
                                                        {t("common.details")}
                                                    </Button>
                                                    <Button size="small" onClick={() => load()}>
                                                        {t("common.refresh")}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                            <TableRow>
                                                <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={4}>
                                                    <Collapse in={!!expanded[it.id]} timeout="auto" unmountOnExit>
                                                        <Box margin={1}>
                                                            <Typography variant="subtitle2">{t("blocks.details")}</Typography>
                                                            <Paper variant="outlined" sx={{ mt: 1, p: 1 }}>
                                                                {it.error ? (
                                                                    <Typography color="error">{it.error}</Typography>
                                                                ) : it.errors && it.errors.length > 0 ? (
                                                                    <Table size="small">
                                                                        <TableBody>
                                                                            {it.errors.map((e, i) => (
                                                                                <TableRow key={i}>
                                                                                    <TableCell sx={{ py: 0.3, pr: 1, fontWeight: "bold" }}>{e.blockHash}</TableCell>
                                                                                    <TableCell sx={{ py: 0.3 }}>{`errors: ${e.errorCount}, refcount: ${e.refcount}`}</TableCell>
                                                                                    <TableCell sx={{ py: 0.3, width: 1, whiteSpace: "nowrap" }}>
                                                                                        <Stack direction="row" spacing={1}>
                                                                                            <Button size="small" color="error" onClick={() => setPurgeConfirm({ nodeId: it.id, blockHash: e.blockHash })}>
                                                                                                {t("blocks.purge")}
                                                                                            </Button>
                                                                                            <Button size="small" onClick={() => setRetryConfirm({ nodeId: it.id, blockHash: e.blockHash })}>
                                                                                                {t("blocks.retry_resync")}
                                                                                            </Button>
                                                                                        </Stack>
                                                                                    </TableCell>
                                                                                </TableRow>
                                                                            ))}
                                                                        </TableBody>
                                                                    </Table>
                                                                ) : (
                                                                    <Typography variant="body2">-</Typography>
                                                                )}
                                                            </Paper>
                                                        </Box>
                                                    </Collapse>
                                                </TableCell>
                                            </TableRow>
                                        </Fragment>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            )}

            <Dialog open={detailOpen} onClose={closeDetails} fullWidth maxWidth="md">
                <DialogTitle>{t("common.details")}</DialogTitle>
                <DialogContent>
                    <pre style={{ whiteSpace: "pre-wrap" }}>{JSON.stringify(detailItem, null, 2)}</pre>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeDetails}>{t("common.close")}</Button>
                </DialogActions>
            </Dialog>

            {/* Confirm purge */}
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

            {/* Confirm retry resync */}
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
        </div>
    )
}
