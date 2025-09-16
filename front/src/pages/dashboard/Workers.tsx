import { useEffect, useState, Fragment } from "react"
import { useTranslation } from "react-i18next"
import { ListWorkers } from "../../utils/apiWrapper"
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
import IconButton from "@mui/material/IconButton"
import Collapse from "@mui/material/Collapse"
import KeyboardArrowDownIcon from "@mui/icons-material/KeyboardArrowDown"
import KeyboardArrowUpIcon from "@mui/icons-material/KeyboardArrowUp"
import type { components } from "../../types/openapi"

type MultiResp = components["schemas"]["MultiResponse_LocalListWorkersResponse"]

type WorkerEntry = {
    id: string
    workers?: components["schemas"]["WorkerInfoResp"][]
    error?: string
}

export default function Workers() {
    const { t } = useTranslation()
    const [items, setItems] = useState<WorkerEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailItem, setDetailItem] = useState<unknown | null>(null)
    const [expanded, setExpanded] = useState<Record<string, boolean>>({})

    async function load() {
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
    }

    useEffect(() => {
        load()
    }, [])
    function openDetails(i: unknown) {
        setDetailItem(i)
        setDetailOpen(true)
    }
    function closeDetails() {
        setDetailOpen(false)
        setDetailItem(null)
    }

    return (
        <div>
            <Typography variant="h5">{t("dashboard.workers")}</Typography>
            <Typography variant="body2" gutterBottom>
                {t("dashboard.workers_desc")}
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
                        <Alert severity="info">{t("workers.empty")}</Alert>
                    ) : (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell />
                                        <TableCell>{t("workers.col.name")}</TableCell>
                                        <TableCell>{t("workers.col.count")}</TableCell>
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
                                                <TableCell>{it.workers ? it.workers.length : "-"}</TableCell>
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
                                                            <Typography variant="subtitle2">{t("workers.details")}</Typography>
                                                            <Paper variant="outlined" sx={{ mt: 1, p: 1 }}>
                                                                {it.error ? (
                                                                    <Typography color="error">{it.error}</Typography>
                                                                ) : it.workers && it.workers.length > 0 ? (
                                                                    <Table size="small">
                                                                        <TableBody>
                                                                            {it.workers.map((w, i) => (
                                                                                <TableRow key={i}>
                                                                                    <TableCell sx={{ py: 0.3, pr: 1, fontWeight: "bold" }}>{w.name}</TableCell>
                                                                                    <TableCell sx={{ py: 0.3 }}>{w.freeform && w.freeform.length ? w.freeform.join("\n") : "-"}</TableCell>
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
        </div>
    )
}
