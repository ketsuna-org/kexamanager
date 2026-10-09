import { useMemo, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import { CheckCircle2, RefreshCw, Wrench } from "lucide-react"
import type { components } from "../types/openapi"
import { toErrorMessage } from "../api/storage"
import { useActiveProject, useProject } from "../contexts/ProjectContext"
import { useFeedback } from "../contexts/FeedbackContext"
import { useAsync } from "../hooks/useAsync"
import { GetBlockInfo, GetClusterStatus, GetWorkerVariable, LaunchRepairOperation, ListBlockErrors, ListWorkers, PurgeBlocks, RetryBlockResync } from "../utils/apiWrapper"
import { Page } from "../shell/Page"
import { k } from "../theme"
import { Bar, Card, CardHeader, EmptyBlock, ErrorBlock, Field, Mono, Muted, Pill, Segmented, Spinner, TableWrap, type Tone } from "../ui/kit"
import { FormDialog } from "../ui/dialogs"
import { formatCount, formatRelative, formatSecondsAgo, shortId } from "../utils/format"

type BlockError = components["schemas"]["BlockError"]
type Worker = components["schemas"]["WorkerInfoResp"]
type BlockInfo = components["schemas"]["LocalGetBlockInfoResponse"]
type RepairType = components["schemas"]["RepairType"]

interface NodeBlockError extends BlockError {
    node: string
}

interface NodeWorker extends Worker {
    node: string
}

type WorkerFilter = "busy" | "errors" | "all"

const ALL = "*"

/** The simple repairs offered from the console (scrub needs its own sub-command). */
const REPAIRS = ["tables", "blocks", "versions", "multipartUploads", "blockRefs", "blockRc", "rebalance", "aliases", "scrub", "clearResyncQueue"] as const
type RepairChoice = (typeof REPAIRS)[number]

function workerState(worker: Worker): { tone: Tone; key: string } {
    if (worker.state === "busy") return { tone: "info", key: "busy" }
    if (worker.state === "idle") return { tone: "neutral", key: "idle" }
    if (worker.state === "done") return { tone: "neutral", key: "done" }
    return { tone: "warn", key: "throttled" }
}

/** "38.2%" or "38 %" in the freeform progress, as a 0-100 number. */
function progressPercent(progress?: string | null): number | null {
    const match = progress?.match(/(\d+(?:[.,]\d+)?)\s*%/)
    return match ? Math.min(100, Number(match[1].replace(",", "."))) : null
}

function Stat({ label, value, note, tone }: { label: ReactNode; value: ReactNode; note?: ReactNode; tone?: "err" | "warn" }) {
    return (
        <Card sx={{ p: "18px 20px", display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Muted small>{label}</Muted>
            <Box sx={{ fontSize: 24, fontWeight: 600, letterSpacing: "-0.02em", color: tone === "err" ? k.err : tone === "warn" ? k.warn : k.text }}>{value}</Box>
            {note && <Muted small>{note}</Muted>}
        </Card>
    )
}

function backlinkLabel(version: BlockInfo["versions"][number]): string | null {
    const link = version.backlink
    if (!link) return null
    if ("object" in link) return `${shortId(link.object.bucketId)}/${link.object.key}`
    return `${shortId(link.upload.bucketId ?? "")}/${link.upload.key ?? link.upload.uploadId} (upload)`
}

function PurgeDialog({ block, nodeLabel, onClose, onDone }: { block: NodeBlockError | null; nodeLabel: (id: string) => string; onClose: () => void; onDone: () => void }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const [busy, setBusy] = useState(false)
    const info = useAsync(
        () =>
            block
                ? GetBlockInfo({ node: block.node }, { blockHash: block.blockHash }).then((res) => {
                      const error = res.error[block.node]
                      if (error) throw new Error(error)
                      return res.success[block.node] ?? null
                  })
                : undefined,
        [block?.node, block?.blockHash],
    )
    const refs = (info.data?.versions ?? []).filter((v) => !v.versionDeleted && !v.refDeleted)

    return (
        <FormDialog
            open={Boolean(block)}
            onClose={onClose}
            danger
            width="sm"
            title={t("maintenance.purgeTitle")}
            description={t("maintenance.purgeText", { node: block ? nodeLabel(block.node) : "" })}
            submitLabel={t("maintenance.purgeSubmit", { count: refs.length })}
            busy={busy}
            canSubmit={!info.loading && !info.error}
            onSubmit={async () => {
                if (!block) return
                setBusy(true)
                try {
                    const res = await PurgeBlocks({ node: block.node }, [block.blockHash])
                    const error = res.error[block.node]
                    if (error) throw new Error(error)
                    const out = res.success[block.node]
                    notify({ severity: "success", message: t("maintenance.purged", { count: out?.objectsDeleted ?? 0 }) })
                    onDone()
                } catch (error) {
                    notify({ severity: "error", message: toErrorMessage(error) })
                } finally {
                    setBusy(false)
                }
            }}
        >
            <Field label={t("maintenance.blockHash")}>
                <Mono sx={{ overflowWrap: "anywhere" }}>{block?.blockHash}</Mono>
            </Field>
            {info.loading && <Spinner />}
            {info.error && <ErrorBlock message={info.error} onRetry={info.refresh} />}
            {info.data && (
                <Field label={t("maintenance.affected", { count: refs.length })}>
                    {refs.length === 0 ? (
                        <Muted small>{t("maintenance.noRefs")}</Muted>
                    ) : (
                        <Box component="ul" sx={{ m: 0, pl: 2.5, maxHeight: 220, overflow: "auto" }}>
                            {refs.map((version) => (
                                <li key={version.versionId}>
                                    <Mono sx={{ overflowWrap: "anywhere" }}>{backlinkLabel(version) ?? shortId(version.versionId)}</Mono>
                                </li>
                            ))}
                        </Box>
                    )}
                </Field>
            )}
        </FormDialog>
    )
}

function RepairDialog({ open, node, nodeLabel, onClose, onDone }: { open: boolean; node: string; nodeLabel: (id: string) => string; onClose: () => void; onDone: () => void }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const [choice, setChoice] = useState<RepairChoice>("blocks")
    const [busy, setBusy] = useState(false)
    return (
        <FormDialog
            open={open}
            onClose={onClose}
            width="sm"
            title={t("maintenance.repairTitle")}
            description={node === ALL ? t("maintenance.repairAllNodes") : t("maintenance.repairOneNode", { node: nodeLabel(node) })}
            submitLabel={t("maintenance.repairSubmit")}
            busy={busy}
            danger={choice === "clearResyncQueue"}
            onSubmit={async () => {
                setBusy(true)
                try {
                    const repairType: RepairType = choice === "scrub" ? { scrub: "start" } : choice
                    const res = await LaunchRepairOperation({ node }, { repairType })
                    const errors = Object.values(res.error)
                    if (errors.length) throw new Error(errors[0])
                    notify({ severity: "success", message: t("maintenance.repairLaunched") })
                    onDone()
                } catch (error) {
                    notify({ severity: "error", message: toErrorMessage(error) })
                } finally {
                    setBusy(false)
                }
            }}
        >
            <Field label={t("maintenance.repairType")} help={t(`maintenance.repairs.${choice}.text`)}>
                <Select value={choice} onChange={(e) => setChoice(e.target.value as RepairChoice)} fullWidth>
                    {REPAIRS.map((repair) => (
                        <MenuItem key={repair} value={repair}>
                            {t(`maintenance.repairs.${repair}.label`)}
                        </MenuItem>
                    ))}
                </Select>
            </Field>
        </FormDialog>
    )
}

export default function MaintenancePage() {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const project = useActiveProject()
    const { refreshCounts } = useProject()
    const [node, setNode] = useState(ALL)
    const [filter, setFilter] = useState<WorkerFilter>("busy")
    const [purging, setPurging] = useState<NodeBlockError | null>(null)
    const [repairOpen, setRepairOpen] = useState(false)
    const [retrying, setRetrying] = useState<string | null>(null)

    const status = useAsync(() => GetClusterStatus(), [project.id])
    const errors = useAsync(
        () =>
            ListBlockErrors({ node }).then((res) =>
                Object.entries(res.success)
                    .flatMap(([nodeId, list]) => list.map((block) => ({ ...block, node: nodeId })))
                    .sort((a, b) => b.errorCount - a.errorCount),
            ),
        [project.id, node],
    )
    const workers = useAsync(
        () =>
            ListWorkers({ node }, { busyOnly: false, errorOnly: false }).then((res) => ({
                list: Object.entries(res.success).flatMap(([nodeId, list]) => list.map((worker) => ({ ...worker, node: nodeId }) as NodeWorker)),
                failed: Object.keys(res.error),
            })),
        [project.id, node],
    )
    const variables = useAsync(() => GetWorkerVariable({ node }, { variable: null }), [project.id, node])

    const nodes = status.data?.nodes ?? []
    const nodeLabel = (id: string) => nodes.find((n) => n.id === id)?.hostname || shortId(id, 8, 4)

    const allWorkers = workers.data?.list ?? []
    const busyCount = allWorkers.filter((w) => w.state === "busy").length
    const resyncQueue = allWorkers.filter((w) => /resync/i.test(w.name)).reduce((sum, w) => sum + (w.queueLength ?? 0), 0)
    const lastScrub = useMemo(() => {
        const dates = Object.values(variables.data?.success ?? {})
            .map((vars) => vars["scrub-last-completed"])
            .filter(Boolean)
            .map((value) => new Date(value))
            .filter((date) => !Number.isNaN(date.getTime()))
        // The oldest node is the one that matters for "when was the cluster last checked".
        return dates.length ? new Date(Math.min(...dates.map((d) => d.getTime()))) : null
    }, [variables.data])

    const shownWorkers = allWorkers
        .filter((w) => (filter === "busy" ? w.state === "busy" || (w.state !== "idle" && w.state !== "done") : filter === "errors" ? w.errors > 0 || w.consecutiveErrors > 0 : true))
        .sort((a, b) => a.name.localeCompare(b.name) || a.node.localeCompare(b.node))
    const blockErrors = errors.data ?? []

    const refreshAll = () => {
        errors.refresh()
        workers.refresh()
        variables.refresh()
        refreshCounts()
    }

    const retry = async (target: NodeBlockError | "all") => {
        setRetrying(target === "all" ? "all" : target.blockHash)
        try {
            const res = target === "all" ? await RetryBlockResync({ node }, { all: true }) : await RetryBlockResync({ node: target.node }, { blockHashes: [target.blockHash] })
            const failures = Object.values(res.error)
            if (failures.length) throw new Error(failures[0])
            const count = Object.values(res.success).reduce((sum, r) => sum + (r?.count ?? 0), 0)
            notify({ severity: "success", message: t("maintenance.retried", { count }) })
            refreshAll()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setRetrying(null)
        }
    }

    return (
        <Page
            crumbs={[{ label: project.name }, { label: t("nav.maintenance") }]}
            topActions={
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    <Muted small sx={{ display: { xs: "none", sm: "block" } }}>
                        {t("maintenance.node")}
                    </Muted>
                    <Select size="small" value={node} onChange={(e) => setNode(e.target.value)} inputProps={{ "aria-label": t("maintenance.node") }} sx={{ minWidth: 150 }}>
                        <MenuItem value={ALL}>{t("maintenance.allNodes")}</MenuItem>
                        {nodes.map((n) => (
                            <MenuItem key={n.id} value={n.id}>
                                {n.hostname || shortId(n.id, 8, 4)}
                            </MenuItem>
                        ))}
                    </Select>
                </Box>
            }
            title={t("nav.maintenance")}
            description={t("maintenance.description")}
            actions={
                <>
                    <Button startIcon={<RefreshCw />} onClick={refreshAll}>
                        {t("ui.refresh")}
                    </Button>
                    <Button startIcon={<Wrench />} onClick={() => setRepairOpen(true)}>
                        {t("maintenance.repair")}
                    </Button>
                </>
            }
        >
            <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr 1fr", lg: "repeat(4, 1fr)" }, gap: 2 }}>
                <Stat label={t("maintenance.activeWorkers")} value={workers.data ? formatCount(busyCount) : "…"} note={workers.data ? t("maintenance.ofTotal", { total: formatCount(allWorkers.length) }) : undefined} />
                <Stat label={t("maintenance.resyncQueue")} value={workers.data ? formatCount(resyncQueue) : "…"} note={t("maintenance.blocks", { count: resyncQueue })} tone={resyncQueue > 0 ? "warn" : undefined} />
                <Stat label={t("maintenance.blockErrors")} value={errors.data ? formatCount(blockErrors.length) : "…"} tone={blockErrors.length > 0 ? "err" : undefined} />
                <Stat label={t("maintenance.lastScrub")} value={lastScrub ? formatRelative(lastScrub) : variables.data ? t("maintenance.never") : "…"} />
            </Box>

            <Card>
                <CardHeader
                    title={
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            {t("maintenance.blockErrors")}
                            {blockErrors.length > 0 && <Pill tone="err">{blockErrors.length}</Pill>}
                        </Box>
                    }
                    extra={
                        blockErrors.length > 0 && (
                            <Button size="small" onClick={() => retry("all")} disabled={retrying !== null} startIcon={retrying === "all" ? <CircularProgress size={14} /> : <RefreshCw />}>
                                {t("maintenance.retryAll")}
                            </Button>
                        )
                    }
                />
                {errors.error && <ErrorBlock message={errors.error} onRetry={errors.refresh} sx={{ m: 2 }} />}
                {errors.loading && !errors.data ? (
                    <Spinner />
                ) : blockErrors.length === 0 ? (
                    !errors.error && <EmptyBlock icon={<CheckCircle2 />} title={t("maintenance.noBlockErrors")} description={t("maintenance.noBlockErrorsText")} />
                ) : (
                    <>
                        <TableWrap minWidth={820}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("maintenance.blockHash")}</TableCell>
                                        <TableCell>{t("maintenance.nodeColumn")}</TableCell>
                                        <TableCell align="right">{t("maintenance.failures")}</TableCell>
                                        <TableCell>{t("maintenance.lastTry")}</TableCell>
                                        <TableCell>{t("maintenance.nextTry")}</TableCell>
                                        <TableCell>{t("maintenance.references")}</TableCell>
                                        <TableCell align="right">{t("ui.actions")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {blockErrors.map((block) => (
                                        <TableRow key={`${block.node}:${block.blockHash}`} hover>
                                            <TableCell>
                                                <Mono title={block.blockHash}>{shortId(block.blockHash, 10, 4)}</Mono>
                                            </TableCell>
                                            <TableCell>{nodeLabel(block.node)}</TableCell>
                                            <TableCell align="right" sx={{ color: k.err, fontWeight: 500 }}>
                                                {formatCount(block.errorCount)}
                                            </TableCell>
                                            <TableCell>{formatSecondsAgo(block.lastTrySecsAgo)}</TableCell>
                                            <TableCell>{formatSecondsAgo(-block.nextTryInSecs)}</TableCell>
                                            <TableCell>{t("maintenance.refs", { count: block.refcount })}</TableCell>
                                            <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                                                <Button size="small" onClick={() => retry(block)} disabled={retrying !== null}>
                                                    {retrying === block.blockHash ? <CircularProgress size={14} /> : t("maintenance.retry")}
                                                </Button>{" "}
                                                <Button size="small" variant="outlined" color="error" onClick={() => setPurging(block)}>
                                                    {t("maintenance.purge")}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableWrap>
                        <Box sx={{ px: "20px", py: "12px", borderTop: `1px solid ${k.rowBorder}` }}>
                            <Muted small>{t("maintenance.purgeHint")}</Muted>
                        </Box>
                    </>
                )}
            </Card>

            <Card>
                <CardHeader
                    title={t("maintenance.workers")}
                    extra={
                        <Segmented
                            label={t("maintenance.workers")}
                            value={filter}
                            onChange={setFilter}
                            options={[
                                { value: "busy", label: t("maintenance.filterBusy") },
                                { value: "errors", label: t("maintenance.filterErrors") },
                                { value: "all", label: t("maintenance.filterAll") },
                            ]}
                        />
                    }
                />
                {workers.error && <ErrorBlock message={workers.error} onRetry={workers.refresh} sx={{ m: 2 }} />}
                {workers.data && workers.data.failed.length > 0 && (
                    <Box sx={{ px: "20px", pb: 1 }}>
                        <Muted small>{t("maintenance.nodesUnreachable", { nodes: workers.data.failed.map(nodeLabel).join(", ") })}</Muted>
                    </Box>
                )}
                {workers.loading && !workers.data ? (
                    <Spinner />
                ) : shownWorkers.length === 0 ? (
                    !workers.error && <EmptyBlock title={t(`maintenance.noWorkers.${filter}`)} />
                ) : (
                    <TableWrap minWidth={760}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t("maintenance.worker")}</TableCell>
                                    <TableCell>{t("maintenance.nodeColumn")}</TableCell>
                                    <TableCell>{t("maintenance.state")}</TableCell>
                                    <TableCell sx={{ width: 180 }}>{t("maintenance.progress")}</TableCell>
                                    <TableCell align="right">{t("maintenance.queue")}</TableCell>
                                    <TableCell align="right">{t("maintenance.errors")}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {shownWorkers.map((worker) => {
                                    const state = workerState(worker)
                                    const percent = progressPercent(worker.progress)
                                    return (
                                        <TableRow key={`${worker.node}:${worker.id}`} hover>
                                            <TableCell>
                                                <Box sx={{ fontWeight: 500 }}>{worker.name}</Box>
                                                {worker.lastError && (
                                                    <Muted small sx={{ color: k.err }}>
                                                        {worker.lastError.message}
                                                    </Muted>
                                                )}
                                            </TableCell>
                                            <TableCell>{nodeLabel(worker.node)}</TableCell>
                                            <TableCell>
                                                <Pill tone={state.tone} dot>
                                                    {t(`maintenance.states.${state.key}`)}
                                                </Pill>
                                            </TableCell>
                                            <TableCell>
                                                {percent !== null ? (
                                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                                        <Box sx={{ flex: 1 }}>
                                                            <Bar value={percent} tone="accent" label={worker.progress ?? undefined} />
                                                        </Box>
                                                        <Mono sx={{ fontSize: 12 }}>{Math.round(percent)} %</Mono>
                                                    </Box>
                                                ) : (
                                                    <Muted small>{worker.progress || "—"}</Muted>
                                                )}
                                            </TableCell>
                                            <TableCell align="right">{worker.queueLength != null ? formatCount(worker.queueLength) : "—"}</TableCell>
                                            <TableCell align="right" sx={{ color: worker.errors > 0 ? k.err : undefined }}>
                                                {formatCount(worker.errors)}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </TableWrap>
                )}
            </Card>

            <PurgeDialog
                block={purging}
                nodeLabel={nodeLabel}
                onClose={() => setPurging(null)}
                onDone={() => {
                    setPurging(null)
                    refreshAll()
                }}
            />
            <RepairDialog
                open={repairOpen}
                node={node}
                nodeLabel={nodeLabel}
                onClose={() => setRepairOpen(false)}
                onDone={() => {
                    setRepairOpen(false)
                    refreshAll()
                }}
            />
        </Page>
    )
}
