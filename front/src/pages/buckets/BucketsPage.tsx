import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link as RouterLink, useNavigate, useSearchParams } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import IconButton from "@mui/material/IconButton"
import Menu from "@mui/material/Menu"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import { Database, MoreHorizontal, Plus, Search } from "lucide-react"
import { useActiveProject, useProject } from "../../contexts/ProjectContext"
import { useFeedback } from "../../contexts/FeedbackContext"
import { toErrorMessage } from "../../api/storage"
import { useAsync } from "../../hooks/useAsync"
import { useKeys } from "../../hooks/useKeys"
import { AllowBucketKey } from "../../utils/apiWrapper"
import { Page } from "../../shell/Page"
import { k } from "../../theme"
import { Bar, Card, EmptyBlock, ErrorBlock, Field, Mono, Muted, Pill, Segmented, Spinner, TableWrap, TextField, TextInput } from "../../ui/kit"
import { ConfirmDialog, FormDialog } from "../../ui/dialogs"
import { Pager } from "../../ui/Pager"
import { srOnly } from "../../ui/styles"
import { formatBytes, formatCount, formatDate, shortId } from "../../utils/format"
import { createBucket, deleteBucket, isValidBucketName, loadBuckets, type BucketRow } from "./bucketApi"
import { GrantDialog } from "./GrantDialog"
import { bucketPath } from "./paths"

type Filter = "all" | "quota" | "website" | "nokey"
const PAGE_SIZE = 25

function CreateBucketDialog({ open, onClose, hasAdmin, onCreated }: { open: boolean; onClose: () => void; hasAdmin: boolean; onCreated: (id: string) => void }) {
    const { t } = useTranslation()
    const project = useActiveProject()
    const { notify } = useFeedback()
    const keys = useKeys(project.id, hasAdmin && open)
    const [name, setName] = useState("")
    const [keyId, setKeyId] = useState("")
    const [write, setWrite] = useState(true)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (open) {
            setName("")
            setKeyId("")
            setWrite(true)
        }
    }, [open])

    const valid = isValidBucketName(name)
    const submit = async () => {
        setBusy(true)
        try {
            const id = await createBucket(project.id, hasAdmin, { name, keyId: keyId || undefined, read: true, write })
            notify({ severity: "success", message: t("buckets.created", { name }) })
            onCreated(id)
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    return (
        <FormDialog open={open} onClose={onClose} title={t("buckets.create")} submitLabel={t("buckets.createSubmit")} onSubmit={submit} busy={busy} canSubmit={valid}>
            <TextField
                label={t("buckets.name")}
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase())}
                autoFocus
                mono
                placeholder="media-assets"
                help={hasAdmin ? t("buckets.nameHelpGarage") : t("buckets.nameHelp")}
                error={name && !valid ? t("buckets.nameInvalid") : undefined}
            />
            {hasAdmin && (
                <Field label={t("buckets.initialKey")} optional help={t("buckets.initialKeyHelp")}>
                    <Select value={keyId} onChange={(e) => setKeyId(e.target.value)} displayEmpty fullWidth>
                        <MenuItem value="">{t("buckets.noKey")}</MenuItem>
                        {(keys.data ?? []).map((key) => (
                            <MenuItem key={key.id} value={key.id}>
                                {key.name || key.id}
                            </MenuItem>
                        ))}
                    </Select>
                    {keyId && <FormControlLabel control={<Checkbox checked={write} onChange={(e) => setWrite(e.target.checked)} />} label={t("buckets.allowWrite")} />}
                </Field>
            )}
        </FormDialog>
    )
}

function RowMenu({ row, onDelete, hasAdmin }: { row: BucketRow; onDelete: () => void; hasAdmin: boolean }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [anchor, setAnchor] = useState<HTMLElement | null>(null)
    return (
        <>
            <IconButton size="small" aria-label={t("ui.moreActions")} onClick={(e) => setAnchor(e.currentTarget)}>
                <MoreHorizontal />
            </IconButton>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
                <MenuItem onClick={() => navigate(bucketPath(row.id))}>{t("buckets.browse")}</MenuItem>
                {hasAdmin && <MenuItem onClick={() => navigate(`${bucketPath(row.id)}/settings`)}>{t("buckets.settings")}</MenuItem>}
                <MenuItem
                    onClick={() => {
                        setAnchor(null)
                        onDelete()
                    }}
                    sx={{ color: k.err }}
                >
                    {t("ui.delete")}
                </MenuItem>
            </Menu>
        </>
    )
}

export default function BucketsPage() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const [params, setParams] = useSearchParams()
    const project = useActiveProject()
    const { hasAdmin, refreshCounts } = useProject()
    const { notify } = useFeedback()
    const buckets = useAsync(() => loadBuckets(project.id, hasAdmin), [project.id, hasAdmin])
    const keys = useKeys(project.id, hasAdmin)

    const [filter, setFilter] = useState<Filter>("all")
    const [query, setQuery] = useState("")
    const [page, setPage] = useState(0)
    const [selected, setSelected] = useState<string[]>([])
    const [creating, setCreating] = useState(params.get("create") === "1")
    const [granting, setGranting] = useState(false)
    const [deleting, setDeleting] = useState<BucketRow[] | null>(null)
    const [busy, setBusy] = useState(false)

    const rows = useMemo(() => buckets.data ?? [], [buckets.data])
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase()
        return rows.filter((row) => {
            if (q && !row.name.toLowerCase().includes(q) && !row.id.toLowerCase().includes(q) && !row.globalAliases.some((a) => a.includes(q))) return false
            if (filter === "quota") return (row.quotaPercent ?? 0) > 80
            if (filter === "website") return row.website === true
            if (filter === "nokey") return row.keyCount === 0
            return true
        })
    }, [rows, query, filter])
    const pageRows = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

    const totals = rows.reduce(
        (acc, row) => ({ bytes: acc.bytes + (row.bytes ?? 0), objects: acc.objects + (row.objects ?? 0), complete: acc.complete && row.complete }),
        { bytes: 0, objects: 0, complete: true },
    )

    const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
    const allOnPage = pageRows.length > 0 && pageRows.every((row) => selected.includes(row.id))

    const afterChange = () => {
        buckets.refresh()
        refreshCounts()
    }

    const confirmDelete = async () => {
        if (!deleting) return
        setBusy(true)
        const failures: string[] = []
        for (const row of deleting) {
            try {
                await deleteBucket(project.id, hasAdmin, row)
            } catch (error) {
                failures.push(`${row.name} : ${toErrorMessage(error)}`)
            }
        }
        setBusy(false)
        setDeleting(null)
        setSelected([])
        afterChange()
        if (failures.length) notify({ severity: "error", message: t("buckets.deleteFailed", { details: failures.join(" · ") }) })
        else notify({ severity: "success", message: t("buckets.deleted", { count: deleting.length }) })
    }

    const filters: { value: Filter; label: string }[] = [
        { value: "all", label: t("buckets.filterAll") },
        ...(hasAdmin
            ? [
                  { value: "quota" as const, label: t("buckets.filterQuota") },
                  { value: "website" as const, label: t("buckets.filterWebsite") },
                  { value: "nokey" as const, label: t("buckets.filterNoKey") },
              ]
            : []),
    ]

    return (
        <Page
            crumbs={[{ label: project.name }, { label: t("nav.buckets") }]}
            title={t("nav.buckets")}
            description={
                buckets.data &&
                t("buckets.summary", {
                    count: rows.length,
                    size: (totals.complete ? "" : "≥ ") + formatBytes(totals.bytes),
                    objects: formatCount(totals.objects),
                })
            }
            actions={
                <Button variant="contained" startIcon={<Plus />} onClick={() => setCreating(true)}>
                    {t("buckets.create")}
                </Button>
            }
        >
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                <Box sx={{ flex: "1 1 260px", maxWidth: 420 }}>
                    <TextInput
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value)
                            setPage(0)
                        }}
                        placeholder={t("buckets.search")}
                        startAdornment={<Search size={16} color={k.label} style={{ marginLeft: 12 }} />}
                        inputProps={{ "aria-label": t("buckets.search") }}
                    />
                </Box>
                {filters.length > 1 && (
                    <Segmented
                        options={filters}
                        value={filter}
                        onChange={(value) => {
                            setFilter(value)
                            setPage(0)
                        }}
                        label={t("buckets.filters")}
                    />
                )}
            </Box>

            {selected.length > 0 && (
                <Card sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "10px 16px", bgcolor: k.rowSelected, borderColor: k.accentSoft, flexWrap: "wrap" }}>
                    <Box sx={{ fontWeight: 500, mr: "auto" }}>{t("ui.selected", { count: selected.length })}</Box>
                    {hasAdmin && <Button onClick={() => setGranting(true)}>{t("buckets.assignKey")}</Button>}
                    <Button color="error" onClick={() => setDeleting(rows.filter((r) => selected.includes(r.id)))}>
                        {t("ui.delete")}
                    </Button>
                    <Button variant="text" onClick={() => setSelected([])}>
                        {t("ui.clearSelection")}
                    </Button>
                </Card>
            )}

            {buckets.error && <ErrorBlock message={buckets.error} onRetry={buckets.refresh} />}

            <Card>
                {buckets.loading && !buckets.data ? (
                    <Spinner />
                ) : rows.length === 0 && !buckets.error ? (
                    <EmptyBlock
                        icon={<Database />}
                        title={t("buckets.emptyTitle")}
                        description={t("buckets.emptyDescription")}
                        action={
                            <Button variant="contained" startIcon={<Plus />} onClick={() => setCreating(true)}>
                                {t("buckets.create")}
                            </Button>
                        }
                    />
                ) : filtered.length === 0 ? (
                    <EmptyBlock title={t("ui.noResults")} description={t("ui.noResultsHint")} />
                ) : (
                    <>
                        <TableWrap minWidth={820}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell padding="checkbox" sx={{ pl: 2 }}>
                                            <Checkbox
                                                checked={allOnPage}
                                                indeterminate={!allOnPage && pageRows.some((r) => selected.includes(r.id))}
                                                onChange={() =>
                                                    setSelected((s) => (allOnPage ? s.filter((id) => !pageRows.some((r) => r.id === id)) : [...new Set([...s, ...pageRows.map((r) => r.id)])]))
                                                }
                                                slotProps={{ input: { "aria-label": t("ui.selectAll") } }}
                                            />
                                        </TableCell>
                                        <TableCell>{t("buckets.colName")}</TableCell>
                                        <TableCell align="right">{t("buckets.colObjects")}</TableCell>
                                        <TableCell align="right">{t("buckets.colSize")}</TableCell>
                                        {hasAdmin && <TableCell>{t("buckets.colQuota")}</TableCell>}
                                        {hasAdmin && <TableCell>{t("buckets.colAccess")}</TableCell>}
                                        {hasAdmin && <TableCell>{t("buckets.colWebsite")}</TableCell>}
                                        <TableCell>{t("buckets.colCreated")}</TableCell>
                                        <TableCell align="right">
                                            <Box component="span" sx={srOnly}>{t("ui.actions")}</Box>
                                        </TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {pageRows.map((row) => {
                                        const isSelected = selected.includes(row.id)
                                        return (
                                            <TableRow key={row.id} hover selected={isSelected}>
                                                <TableCell padding="checkbox" sx={{ pl: 2 }}>
                                                    <Checkbox checked={isSelected} onChange={() => toggle(row.id)} slotProps={{ input: { "aria-label": t("ui.selectRow", { name: row.name }) } }} />
                                                </TableCell>
                                                <TableCell>
                                                    <Box
                                                        component={RouterLink}
                                                        to={bucketPath(row.id)}
                                                        sx={{ color: k.text, textDecoration: "none", fontWeight: 500, "&:hover": { color: k.accentText } }}
                                                    >
                                                        {row.name}
                                                    </Box>
                                                    {hasAdmin && (
                                                        <Mono sx={{ display: "block", color: k.label, fontSize: 11.5 }} title={row.id}>
                                                            {shortId(row.id)}
                                                        </Mono>
                                                    )}
                                                </TableCell>
                                                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                                                    {row.objects === null ? "-" : `${row.complete ? "" : "≥ "}${formatCount(row.objects)}`}
                                                </TableCell>
                                                <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                                    {row.bytes === null ? "-" : `${row.complete ? "" : "≥ "}${formatBytes(row.bytes)}`}
                                                </TableCell>
                                                {hasAdmin && (
                                                    <TableCell sx={{ minWidth: 150 }}>
                                                        {row.quotaPercent === null ? (
                                                            <Muted>{t("buckets.noQuota")}</Muted>
                                                        ) : (
                                                            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
                                                                <Bar value={row.quotaPercent} />
                                                                <Muted small>{t("buckets.quotaOf", { percent: Math.round(row.quotaPercent), size: formatBytes(row.quotaMaxSize) })}</Muted>
                                                            </Box>
                                                        )}
                                                    </TableCell>
                                                )}
                                                {hasAdmin && (
                                                    <TableCell>
                                                        {row.keyCount === null ? "-" : row.keyCount === 0 ? <Pill tone="warn">{t("buckets.noKeyAccess")}</Pill> : t("buckets.keyCount", { count: row.keyCount })}
                                                    </TableCell>
                                                )}
                                                {hasAdmin && <TableCell>{row.website ? <Pill tone="ok">{t("buckets.websiteOn")}</Pill> : <Muted>—</Muted>}</TableCell>}
                                                <TableCell sx={{ whiteSpace: "nowrap" }}>{formatDate(row.created)}</TableCell>
                                                <TableCell align="right">
                                                    <RowMenu row={row} hasAdmin={hasAdmin} onDelete={() => setDeleting([row])} />
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </TableWrap>
                        <Pager page={page} pageSize={PAGE_SIZE} total={filtered.length} onPage={setPage} />
                    </>
                )}
            </Card>

            <CreateBucketDialog
                open={creating}
                hasAdmin={hasAdmin}
                onClose={() => {
                    setCreating(false)
                    if (params.has("create")) setParams({}, { replace: true })
                }}
                onCreated={(id) => {
                    setCreating(false)
                    afterChange()
                    navigate(bucketPath(id))
                }}
            />
            <GrantDialog
                open={granting}
                onClose={() => setGranting(false)}
                title={t("buckets.assignKeyTitle", { count: selected.length })}
                pickLabel={t("access.key")}
                options={(keys.data ?? []).map((key) => ({ id: key.id, label: key.name || key.id }))}
                onSubmit={async (grant) => {
                    try {
                        for (const bucketId of selected) {
                            await AllowBucketKey({ bucketId, accessKeyId: grant.targetId, permissions: { read: grant.read, write: grant.write, owner: grant.owner } })
                        }
                        notify({ severity: "success", message: t("buckets.assigned", { count: selected.length }) })
                        setSelected([])
                        afterChange()
                    } catch (error) {
                        notify({ severity: "error", message: toErrorMessage(error) })
                        throw error
                    }
                }}
            />
            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title={deleting?.length === 1 ? t("buckets.deleteOne", { name: deleting[0].name }) : t("buckets.deleteMany", { count: deleting?.length ?? 0 })}
                message={t("buckets.deleteMessage")}
                confirmLabel={t("ui.delete")}
                confirmText={deleting?.length === 1 ? deleting[0].name : undefined}
                onConfirm={confirmDelete}
                busy={busy}
            />
        </Page>
    )
}
