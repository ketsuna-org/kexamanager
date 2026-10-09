import { useEffect, useMemo, useState } from "react"
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
import { Plus } from "lucide-react"
import type { components } from "../types/openapi"
import { toErrorMessage } from "../api/storage"
import { useActiveProject } from "../contexts/ProjectContext"
import { useFeedback } from "../contexts/FeedbackContext"
import { useAsync } from "../hooks/useAsync"
import { ApplyClusterLayout, GetClusterLayout, GetClusterLayoutHistory, GetClusterStatus, PreviewClusterLayoutChanges, RevertClusterLayout, UpdateClusterLayout } from "../utils/apiWrapper"
import { Page } from "../shell/Page"
import { k, monoFamily } from "../theme"
import { Bar, Card, EmptyBlock, ErrorBlock, Field, KV, Mono, Muted, Pill, Segmented, SidePanel, Spinner, TableWrap, Tag, TextField, TextInput, WithPanel, type Tone } from "../ui/kit"
import { ConfirmDialog, FormDialog } from "../ui/dialogs"
import { byteUnits, formatBytes, formatSecondsAgo, shortId } from "../utils/format"

type Layout = components["schemas"]["GetClusterLayoutResponse"]
type NodeStatus = components["schemas"]["NodeResp"]
type Role = { zone: string; capacity?: number | null; tags: string[] }
type ZoneRedundancy = components["schemas"]["ZoneRedundancy"]

interface TopoNode {
    id: string
    status?: NodeStatus
    current?: Role
    staged?: Role | "remove"
    /** Effective zone once staged changes apply (the current one for a removal). */
    zone: string | null
}

type Change = "added" | "modified" | "removed" | null

function changeOf(node: TopoNode): Change {
    if (!node.staged) return null
    if (node.staged === "remove") return "removed"
    return node.current ? "modified" : "added"
}

function buildNodes(status: NodeStatus[], layout: Layout): TopoNode[] {
    const byId = new Map<string, TopoNode>()
    for (const s of status) byId.set(s.id, { id: s.id, status: s, zone: null })
    for (const role of layout.roles) {
        const node = byId.get(role.id) ?? { id: role.id, zone: null }
        node.current = { zone: role.zone, capacity: role.capacity, tags: role.tags }
        byId.set(role.id, node)
    }
    for (const change of layout.stagedRoleChanges) {
        const node = byId.get(change.id) ?? { id: change.id, zone: null }
        node.staged = "remove" in change ? "remove" : { zone: change.zone, capacity: change.capacity, tags: change.tags }
        byId.set(change.id, node)
    }
    for (const node of byId.values()) {
        node.zone = node.staged && node.staged !== "remove" ? node.staged.zone : node.current?.zone ?? null
    }
    return [...byId.values()]
}

function nodeName(node: TopoNode): string {
    return node.status?.hostname || shortId(node.id, 8, 4)
}

function capacityLabel(role: Role | undefined, t: (k: string) => string): string {
    if (!role) return "-"
    return role.capacity ? formatBytes(role.capacity) : t("topology.gateway")
}

function NodeState({ node }: { node: TopoNode }) {
    const { t } = useTranslation()
    const change = changeOf(node)
    const tones: Record<string, Tone> = { added: "accent", modified: "accent", removed: "err" }
    if (change) return <Pill tone={tones[change]}>{t(`topology.change.${change}`)}</Pill>
    if (!node.status) return <Pill>{t("topology.unknown")}</Pill>
    if (!node.status.isUp) return <Pill tone="err" dot>{t("topology.offline")}</Pill>
    if (node.status.draining) return <Pill tone="warn" dot>{t("topology.draining")}</Pill>
    return <Pill tone="ok" dot>{t("topology.online")}</Pill>
}

function NodeCard({ node, onClick }: { node: TopoNode; onClick: () => void }) {
    const { t } = useTranslation()
    const change = changeOf(node)
    const part = node.status?.dataPartition
    const staged = node.staged && node.staged !== "remove" ? node.staged : undefined
    const role = staged ?? node.current
    return (
        <Box
            component="button"
            type="button"
            onClick={onClick}
            sx={{
                display: "flex",
                flexDirection: "column",
                gap: 1.25,
                p: "14px",
                border: `1px ${change === "added" ? "dashed" : "solid"} ${change ? k.accent : k.borderStrong}`,
                borderRadius: "10px",
                bgcolor: change === "added" ? k.rowSelected : k.raised,
                textAlign: "left",
                color: k.text,
                font: "inherit",
                cursor: "pointer",
                width: "100%",
                opacity: change === "removed" ? 0.7 : 1,
                "&:hover": { borderColor: change ? k.accent : k.borderHover },
            }}
        >
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1 }}>
                <Box sx={{ fontWeight: 600, overflowWrap: "anywhere" }}>{nodeName(node)}</Box>
                <NodeState node={node} />
            </Box>
            <Mono sx={{ color: k.label, fontSize: 11.5 }}>
                {shortId(node.id, 4, 4)}
                {node.status?.addr ? ` · ${node.status.addr}` : ""}
            </Mono>
            {change === "modified" && node.current && staged ? (
                <Box sx={{ fontSize: 13 }}>
                    {t("topology.capacity")} {capacityLabel(node.current, t)} → <b>{capacityLabel(staged, t)}</b>
                    {node.current.zone !== staged.zone && (
                        <Box>
                            {t("topology.zone")} {node.current.zone} → <b>{staged.zone}</b>
                        </Box>
                    )}
                </Box>
            ) : change === "added" ? (
                <Box sx={{ fontSize: 13 }}>
                    {t("topology.capacity")} {capacityLabel(staged, t)}
                </Box>
            ) : part && part.total > 0 ? (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                    <Box sx={{ fontSize: 12.5, color: k.text2 }}>
                        {t("topology.data")} {formatBytes(part.total - part.available)} / {formatBytes(part.total)}
                    </Box>
                    <Bar value={((part.total - part.available) / part.total) * 100} />
                </Box>
            ) : (
                <Box sx={{ fontSize: 13, color: k.text2 }}>
                    {t("topology.capacity")} {capacityLabel(role, t)}
                </Box>
            )}
            {role && role.tags.length > 0 && (
                <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
                    {role.tags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                    ))}
                </Box>
            )}
        </Box>
    )
}

const UNIT_POWERS = [3, 4] // Go, To

function RoleDialog({ node, candidates, zones, onClose, onSaved }: { node: TopoNode | "new" | null; candidates: TopoNode[]; zones: string[]; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const units = byteUnits()
    const [nodeId, setNodeId] = useState("")
    const [zone, setZone] = useState("")
    const [gateway, setGateway] = useState(false)
    const [size, setSize] = useState("")
    const [power, setPower] = useState(4)
    const [tags, setTags] = useState("")
    const [busy, setBusy] = useState(false)
    const [removing, setRemoving] = useState(false)

    useEffect(() => {
        if (!node) return
        const target = node === "new" ? candidates[0] : node
        const role = target ? (target.staged && target.staged !== "remove" ? target.staged : target.current) : undefined
        setNodeId(target?.id ?? "")
        setZone(role?.zone ?? zones[0] ?? "")
        setGateway(Boolean(role && !role.capacity))
        const capacity = role?.capacity ?? 0
        const p = capacity >= 1e12 ? 4 : 3
        setPower(p)
        setSize(capacity ? String(Math.round((capacity / 1000 ** p) * 100) / 100) : "")
        setTags(role?.tags.join(", ") ?? "")
    }, [node, candidates, zones])

    if (!node) return null
    const existing = node !== "new" ? node : null
    const capacity = gateway ? null : Math.round(Number(size.replace(",", ".")) * 1000 ** power)
    const valid = Boolean(nodeId && zone.trim()) && (gateway || (Number.isFinite(capacity) && (capacity ?? 0) > 0))

    const save = async () => {
        setBusy(true)
        try {
            await UpdateClusterLayout({ roles: [{ id: nodeId, zone: zone.trim(), capacity, tags: tags.split(",").map((s) => s.trim()).filter(Boolean) }] })
            onSaved()
            onClose()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    const remove = async () => {
        setBusy(true)
        try {
            await UpdateClusterLayout({ roles: [{ id: nodeId, remove: true }] })
            onSaved()
            setRemoving(false)
            onClose()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    return (
        <>
            <FormDialog
                open
                onClose={onClose}
                title={existing ? t("topology.editNode", { name: nodeName(existing) }) : t("topology.assign")}
                description={t("topology.stagedHelp")}
                submitLabel={t("topology.stageChange")}
                onSubmit={save}
                busy={busy}
                canSubmit={valid}
                secondary={
                    existing?.current && existing.staged !== "remove" ? (
                        <Button color="error" onClick={() => setRemoving(true)}>
                            {t("topology.removeNode")}
                        </Button>
                    ) : undefined
                }
            >
                {node === "new" && (
                    <Field label={t("topology.node")}>
                        {candidates.length > 0 ? (
                            <Select value={nodeId} onChange={(e) => setNodeId(e.target.value)} fullWidth>
                                {candidates.map((c) => (
                                    <MenuItem key={c.id} value={c.id}>
                                        {nodeName(c)} · <Mono sx={{ ml: 0.5 }}>{shortId(c.id, 8, 4)}</Mono>
                                    </MenuItem>
                                ))}
                            </Select>
                        ) : (
                            <TextInput value={nodeId} onChange={(e) => setNodeId(e.target.value.trim())} mono placeholder={t("topology.nodeIdPlaceholder")} />
                        )}
                    </Field>
                )}
                <TextField label={t("topology.zone")} value={zone} onChange={(e) => setZone(e.target.value)} mono placeholder="dc1" help={zones.length ? t("topology.existingZones", { zones: zones.join(", ") }) : undefined} />
                <Segmented
                    value={gateway ? "gateway" : "storage"}
                    onChange={(v) => setGateway(v === "gateway")}
                    options={[
                        { value: "storage", label: t("topology.storageNode") },
                        { value: "gateway", label: t("topology.gatewayNode") },
                    ]}
                />
                {!gateway && (
                    <Field label={t("topology.capacity")} htmlFor="node-capacity">
                        <Box sx={{ display: "flex", gap: 1 }}>
                            <TextInput id="node-capacity" value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" />
                            <Select value={power} onChange={(e) => setPower(Number(e.target.value))} sx={{ minWidth: 80 }}>
                                {UNIT_POWERS.map((p) => (
                                    <MenuItem key={p} value={p}>
                                        {units[p]}
                                    </MenuItem>
                                ))}
                            </Select>
                        </Box>
                    </Field>
                )}
                <TextField label={t("topology.tags")} value={tags} onChange={(e) => setTags(e.target.value)} mono optional help={t("topology.tagsHelp")} />
            </FormDialog>
            <ConfirmDialog
                open={removing}
                onClose={() => setRemoving(false)}
                title={t("topology.removeTitle", { name: existing ? nodeName(existing) : "" })}
                message={t("topology.removeMessage")}
                confirmLabel={t("topology.removeNode")}
                onConfirm={remove}
                busy={busy}
            />
        </>
    )
}

function StagedPanel({ layout, nodes, onClose, onChanged }: { layout: Layout; nodes: TopoNode[]; onClose: () => void; onChanged: () => void }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const preview = useAsync(() => PreviewClusterLayoutChanges(), [layout])
    const [busy, setBusy] = useState<"apply" | "revert" | "redundancy" | null>(null)
    const changed = nodes.filter((n) => changeOf(n))
    const staged = layout.stagedParameters?.zoneRedundancy ?? layout.parameters.zoneRedundancy
    const zoneCount = new Set(nodes.filter((n) => n.zone && changeOf(n) !== "removed").map((n) => n.zone)).size
    const usableNow = layout.roles.reduce((s, r) => s + (r.usableCapacity ?? 0), 0)
    const previewData = preview.data && "newLayout" in preview.data ? preview.data : null
    const previewError = preview.data && "error" in preview.data ? preview.data.error : preview.error
    const usableNext = previewData?.newLayout.roles.reduce((s, r) => s + (r.usableCapacity ?? 0), 0)

    const run = async (kind: "apply" | "revert", action: () => Promise<unknown>, message: string) => {
        setBusy(kind)
        try {
            await action()
            notify({ severity: "success", message })
            onChanged()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(null)
        }
    }

    const setRedundancy = async (value: ZoneRedundancy) => {
        setBusy("redundancy")
        try {
            await UpdateClusterLayout({ parameters: { zoneRedundancy: value } })
            onChanged()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(null)
        }
    }

    const symbol = { added: "+", modified: "~", removed: "−" } as const
    return (
        <SidePanel
            open
            onClose={onClose}
            title={
                <>
                    v{layout.version} → v{layout.version + 1}
                </>
            }
            subtitle={t("topology.pending")}
            footer={
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1, width: "100%" }}>
                    <Button variant="contained" disabled={busy !== null || Boolean(previewError)} onClick={() => run("apply", () => ApplyClusterLayout({ version: layout.version + 1 }), t("topology.applied", { version: layout.version + 1 }))} startIcon={busy === "apply" ? <CircularProgress size={14} /> : undefined}>
                        {t("topology.apply", { version: layout.version + 1 })}
                    </Button>
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <Button sx={{ flex: 1 }} onClick={preview.refresh} disabled={busy !== null}>
                            {t("topology.preview")}
                        </Button>
                        <Button sx={{ flex: 1 }} color="error" disabled={busy !== null} onClick={() => run("revert", () => RevertClusterLayout(), t("topology.reverted"))}>
                            {t("topology.revertAll")}
                        </Button>
                    </Box>
                </Box>
            }
        >
            <Box>
                {changed.length === 0 && <Muted>{t("topology.onlyParameters")}</Muted>}
                {changed.map((node) => {
                    const change = changeOf(node)!
                    const staged = node.staged !== "remove" ? node.staged : undefined
                    return (
                        <Box key={node.id} sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", py: 1.5, borderBottom: `1px solid ${k.rowBorder}` }}>
                            <Box
                                sx={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: "6px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontFamily: monoFamily,
                                    fontWeight: 600,
                                    flex: "none",
                                    bgcolor: change === "removed" ? k.errBg : k.accentSoft,
                                    color: change === "removed" ? k.err : k.accentText,
                                }}
                            >
                                {symbol[change]}
                            </Box>
                            <Box sx={{ minWidth: 0 }}>
                                <Box>
                                    <b>{nodeName(node)}</b> {change === "added" ? t("topology.joins", { zone: staged?.zone }) : change === "removed" ? t("topology.leaves") : t("topology.changes")}
                                </Box>
                                {staged && (
                                    <Muted small>
                                        {change === "modified" && node.current ? `${capacityLabel(node.current, t)} → ${capacityLabel(staged, t)}` : t("topology.capacityValue", { value: capacityLabel(staged, t) })}
                                        {staged.tags.length > 0 && ` · ${staged.tags.join(", ")}`}
                                    </Muted>
                                )}
                            </Box>
                        </Box>
                    )
                })}
            </Box>
            <Box>
                <Box sx={{ fontWeight: 600, mb: 0.5 }}>{t("topology.effect")}</Box>
                {preview.loading && <Spinner sx={{ py: 2 }} />}
                {previewError && <ErrorBlock title={t("topology.previewFailed")} message={previewError} />}
                {previewData && (
                    <>
                        <KV label={t("topology.usable")}>
                            {formatBytes(usableNow)} → <b>{formatBytes(usableNext)}</b>
                        </KV>
                        {previewData.message.length > 0 && (
                            <Box component="pre" sx={{ m: 0, mt: 1, p: 1.25, borderRadius: "8px", bgcolor: k.input, border: `1px solid ${k.border}`, fontFamily: monoFamily, fontSize: 11.5, whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto" }}>
                                {previewData.message.join("\n")}
                            </Box>
                        )}
                        <Muted small>{t("topology.computedByGarage")}</Muted>
                    </>
                )}
            </Box>
            <Field label={t("topology.zoneRedundancy")}>
                <Segmented
                    value={staged === "maximum" ? "maximum" : String(staged.atLeast)}
                    onChange={(v) => setRedundancy(v === "maximum" ? "maximum" : { atLeast: Number(v) })}
                    options={[
                        { value: "maximum", label: t("topology.maximum") },
                        ...Array.from({ length: Math.max(zoneCount - 1, 0) }, (_, i) => ({ value: String(i + 1), label: t("topology.atLeast", { count: i + 1 }) })),
                    ]}
                />
            </Field>
        </SidePanel>
    )
}

export default function TopologyPage() {
    const { t } = useTranslation()
    const project = useActiveProject()
    const status = useAsync(() => GetClusterStatus(), [project.id])
    const layout = useAsync(() => GetClusterLayout(), [project.id])
    const [view, setView] = useState<"zones" | "list" | "history">("zones")
    const history = useAsync(() => (view === "history" ? GetClusterLayoutHistory() : undefined), [project.id, view])
    const [editing, setEditing] = useState<TopoNode | "new" | null>(null)
    const [panelOpen, setPanelOpen] = useState(true)

    const nodes = useMemo(() => (status.data && layout.data ? buildNodes(status.data.nodes, layout.data) : []), [status.data, layout.data])
    const zones = useMemo(() => {
        const map = new Map<string, TopoNode[]>()
        for (const node of nodes) if (node.zone) map.set(node.zone, [...(map.get(node.zone) ?? []), node])
        return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
    }, [nodes])
    const unassigned = nodes.filter((n) => !n.zone && n.status)
    const data = layout.data
    const hasStaged = Boolean(data && (data.stagedRoleChanges.length > 0 || data.stagedParameters))
    const usable = data?.roles.reduce((s, r) => s + (r.usableCapacity ?? 0), 0) ?? 0

    const refresh = () => {
        layout.refresh()
        status.refresh()
        setPanelOpen(true)
    }

    const banner = hasStaged && data && (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: { xs: 2, md: 4 }, py: 1.25, bgcolor: k.rowSelected, borderBottom: `1px solid ${k.accentSoft}`, flexWrap: "wrap" }}>
            <Pill tone="accent">{t("topology.pendingCount", { count: data.stagedRoleChanges.length || 1 })}</Pill>
            <Box sx={{ flex: "1 1 300px", color: k.text2, fontSize: 13.5 }}>{t("topology.pendingHelp", { current: data.version, next: data.version + 1 })}</Box>
            <Button size="small" onClick={() => setPanelOpen(true)}>
                {t("topology.review")}
            </Button>
        </Box>
    )

    return (
        <Page
            crumbs={[{ label: project.name }, { label: t("nav.topology") }]}
            topActions={
                <Segmented
                    value={view}
                    onChange={setView}
                    label={t("topology.view")}
                    options={[
                        { value: "zones", label: t("topology.viewZones") },
                        { value: "list", label: t("topology.viewList") },
                        { value: "history", label: t("topology.viewHistory") },
                    ]}
                />
            }
            banner={banner}
            title={t("topology.title")}
            description={
                data &&
                t("topology.summary", {
                    zones: zones.length,
                    usable: formatBytes(usable),
                    partition: formatBytes(data.partitionSize),
                    redundancy: data.parameters.zoneRedundancy === "maximum" ? t("topology.maximum") : t("topology.atLeast", { count: data.parameters.zoneRedundancy.atLeast }),
                })
            }
            actions={
                <Button variant="contained" startIcon={<Plus />} onClick={() => setEditing("new")}>
                    {t("topology.assign")}
                </Button>
            }
        >
            {(status.error || layout.error) && <ErrorBlock message={status.error || layout.error} onRetry={refresh} />}
            {!data && !layout.error && <Spinner />}
            {data && (
                <WithPanel panel={hasStaged && panelOpen && <StagedPanel layout={data} nodes={nodes} onClose={() => setPanelOpen(false)} onChanged={refresh} />}>
                    {view === "zones" && (
                        <>
                            {zones.length === 0 && (
                                <Card>
                                    <EmptyBlock title={t("topology.emptyTitle")} description={t("topology.emptyText")} />
                                </Card>
                            )}
                            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
                                {zones.map(([zone, members]) => {
                                    const total = members.reduce((s, n) => s + ((n.staged && n.staged !== "remove" ? n.staged : n.current)?.capacity ?? 0), 0)
                                    const before = members.reduce((s, n) => s + (n.current?.zone === zone ? n.current.capacity ?? 0 : 0), 0)
                                    return (
                                        <Box key={zone} sx={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 1.5, p: 2, border: `1px solid ${k.border}`, borderRadius: "12px", bgcolor: k.side }}>
                                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 1 }}>
                                                <Mono sx={{ fontSize: 14, fontWeight: 600 }}>{zone}</Mono>
                                                <Muted small>
                                                    {t("topology.zoneSummary", { count: members.length })} · {before !== total ? `${formatBytes(before)} → ${formatBytes(total)}` : formatBytes(total)}
                                                </Muted>
                                            </Box>
                                            {members.map((node) => (
                                                <NodeCard key={node.id} node={node} onClick={() => setEditing(node)} />
                                            ))}
                                        </Box>
                                    )
                                })}
                            </Box>
                            {unassigned.length > 0 && (
                                <Card>
                                    <Box sx={{ px: "20px", pt: "16px", pb: 1 }}>
                                        <Box sx={{ fontWeight: 600 }}>{t("topology.unassigned")}</Box>
                                        <Muted small>{t("topology.unassignedHelp")}</Muted>
                                    </Box>
                                    {unassigned.map((node) => (
                                        <Box key={node.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, px: "20px", py: "12px", borderTop: `1px solid ${k.rowBorder}`, flexWrap: "wrap" }}>
                                            <NodeState node={node} />
                                            <Box sx={{ flex: 1 }}>
                                                {nodeName(node)}
                                                {node.status?.addr && <Mono sx={{ color: k.label }}> · {node.status.addr}</Mono>}
                                            </Box>
                                            <Button size="small" onClick={() => setEditing(node)}>
                                                {t("topology.assignShort")}
                                            </Button>
                                        </Box>
                                    ))}
                                </Card>
                            )}
                        </>
                    )}

                    {view === "list" && (
                        <Card>
                            <TableWrap minWidth={760}>
                                <Table>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell>{t("topology.node")}</TableCell>
                                            <TableCell>{t("topology.state")}</TableCell>
                                            <TableCell>{t("topology.zone")}</TableCell>
                                            <TableCell>{t("topology.capacity")}</TableCell>
                                            <TableCell>{t("topology.data")}</TableCell>
                                            <TableCell>{t("topology.lastSeen")}</TableCell>
                                            <TableCell>{t("topology.version")}</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {nodes.map((node) => {
                                            const role = node.staged && node.staged !== "remove" ? node.staged : node.current
                                            const part = node.status?.dataPartition
                                            return (
                                                <TableRow key={node.id} hover onClick={() => setEditing(node)} sx={{ cursor: "pointer" }}>
                                                    <TableCell>
                                                        <Box sx={{ fontWeight: 500 }}>{nodeName(node)}</Box>
                                                        <Mono sx={{ color: k.label, fontSize: 11.5 }}>
                                                            {shortId(node.id, 8, 4)}
                                                            {node.status?.addr ? ` · ${node.status.addr}` : ""}
                                                        </Mono>
                                                    </TableCell>
                                                    <TableCell>
                                                        <NodeState node={node} />
                                                    </TableCell>
                                                    <TableCell>{node.zone ? <Mono>{node.zone}</Mono> : <Muted>{t("topology.noRole")}</Muted>}</TableCell>
                                                    <TableCell>{capacityLabel(role, t)}</TableCell>
                                                    <TableCell>{part && part.total ? `${formatBytes(part.total - part.available)} / ${formatBytes(part.total)}` : "-"}</TableCell>
                                                    <TableCell>{node.status?.isUp ? t("topology.now") : formatSecondsAgo(node.status?.lastSeenSecsAgo)}</TableCell>
                                                    <TableCell>
                                                        <Mono>{node.status?.garageVersion ?? "-"}</Mono>
                                                    </TableCell>
                                                </TableRow>
                                            )
                                        })}
                                    </TableBody>
                                </Table>
                            </TableWrap>
                        </Card>
                    )}

                    {view === "history" && (
                        <Card>
                            {history.loading && !history.data && <Spinner />}
                            {history.error && <ErrorBlock message={history.error} sx={{ m: 2 }} />}
                            {history.data && (
                                <TableWrap minWidth={480}>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell>{t("topology.version")}</TableCell>
                                                <TableCell>{t("topology.state")}</TableCell>
                                                <TableCell align="right">{t("topology.storageNodes")}</TableCell>
                                                <TableCell align="right">{t("topology.gatewayNodes")}</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {[...history.data.versions].sort((a, b) => b.version - a.version).map((v) => (
                                                <TableRow key={v.version}>
                                                    <TableCell>
                                                        <Mono>v{v.version}</Mono>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Pill tone={v.status === "Current" ? "ok" : v.status === "Draining" ? "warn" : "neutral"}>{t(`topology.versionStatus.${v.status}`)}</Pill>
                                                    </TableCell>
                                                    <TableCell align="right">{v.storageNodes}</TableCell>
                                                    <TableCell align="right">{v.gatewayNodes}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableWrap>
                            )}
                        </Card>
                    )}
                </WithPanel>
            )}
            <RoleDialog node={editing} candidates={unassigned} zones={zones.map(([z]) => z)} onClose={() => setEditing(null)} onSaved={refresh} />
        </Page>
    )
}
