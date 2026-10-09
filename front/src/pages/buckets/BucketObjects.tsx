import { useEffect, useMemo, useRef, useState, type DragEvent } from "react"
import { useTranslation } from "react-i18next"
import { useSearchParams } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import LinearProgress from "@mui/material/LinearProgress"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import { Copy, Download, File, FileImage, FileText, FileVideo, Folder, FolderPlus, Link2, Search, Trash2, Upload } from "lucide-react"
import { buildBreadcrumb, copyObject, joinPrefix, listObjects, presignObject, statObject, toErrorMessage, type ObjectListing } from "../../api/storage"
import { useFeedback } from "../../contexts/FeedbackContext"
import { useAsync } from "../../hooks/useAsync"
import { k } from "../../theme"
import { Card, EmptyBlock, ErrorBlock, Field, KV, Mono, Muted, SidePanel, Spinner, TableWrap, TextField, TextInput, WithPanel } from "../../ui/kit"
import { useCopy } from "../../ui/useCopy"
import { ConfirmDialog, FormDialog } from "../../ui/dialogs"
import { formatBytes, formatDateTime } from "../../utils/format"
import { createFolder, deleteEntries, downloadObject, filesFromDrop, guessMime, listAllKeys, previewKind, uploadObject } from "./objectOps"

interface Entry {
    key: string
    name: string
    isFolder: boolean
    size: number | null
    lastModified: string | null
    contentType?: string
}

interface UploadItem {
    path: string
    progress: number
    error?: string
}

function iconFor(entry: Entry) {
    if (entry.isFolder) return <Folder color={k.accentText} />
    const kind = previewKind(guessMime(entry.key, entry.contentType))
    if (kind === "image") return <FileImage />
    if (kind === "video") return <FileVideo />
    if (kind === "text" || kind === "pdf") return <FileText />
    return <File />
}

function toEntries(listings: ObjectListing[], prefix: string): Entry[] {
    const folders = new Map<string, Entry>()
    const files: Entry[] = []
    for (const listing of listings) {
        for (const p of listing.commonPrefixes ?? []) {
            const name = p.slice(prefix.length).replace(/\/$/, "")
            folders.set(p, { key: p, name, isFolder: true, size: null, lastModified: null })
        }
        for (const o of listing.objects ?? []) {
            if (o.key === prefix) continue // the folder's own marker
            const name = o.key.slice(prefix.length)
            if (name === ".dir") continue // marker of the previous interface
            files.push({ key: o.key, name, isFolder: false, size: o.size, lastModified: o.lastModified, contentType: o.contentType })
        }
    }
    const sortByName = (a: Entry, b: Entry) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    return [...[...folders.values()].sort(sortByName), ...files.sort(sortByName)]
}

const VALIDITY = [
    { seconds: 3600, key: "objects.validity1h" },
    { seconds: 86400, key: "objects.validity24h" },
    { seconds: 604800, key: "objects.validity7d" },
]

function ObjectPreview({
    projectId,
    bucket,
    entry,
    canWrite,
    onClose,
    onCopy,
    onDelete,
}: {
    projectId: number
    bucket: string
    entry: Entry
    canWrite: boolean
    onClose: () => void
    onCopy: () => void
    onDelete: () => void
}) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const copy = useCopy()
    const [validity, setValidity] = useState(3600)
    const stat = useAsync(() => statObject(projectId, { bucket, key: entry.key }), [projectId, bucket, entry.key])
    const mime = guessMime(entry.key, stat.data?.contentType ?? entry.contentType)
    const kind = previewKind(mime)
    const preview = useAsync(() => (kind === "none" ? undefined : presignObject(projectId, { bucket, key: entry.key })), [projectId, bucket, entry.key, kind])

    const share = async () => {
        try {
            const { presignedUrl } = await presignObject(projectId, { bucket, key: entry.key, expiresIn: validity })
            await copy(presignedUrl, t("objects.signedLink"))
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        }
    }

    const url = preview.data?.presignedUrl
    return (
        <SidePanel
            open
            onClose={onClose}
            title={entry.name}
            width={400}
            footer={
                <>
                    <Button startIcon={<Copy />} onClick={onCopy}>
                        {t("objects.copyTo")}
                    </Button>
                    {canWrite && (
                        <Button color="error" startIcon={<Trash2 />} onClick={onDelete}>
                            {t("ui.delete")}
                        </Button>
                    )}
                </>
            }
        >
            {kind !== "none" && (
                <Box sx={{ borderRadius: "10px", overflow: "hidden", bgcolor: k.input, border: `1px solid ${k.border}`, minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {!url ? (
                        <Spinner sx={{ py: 4 }} />
                    ) : kind === "image" ? (
                        <Box component="img" src={url} alt={entry.name} sx={{ maxWidth: "100%", maxHeight: 280, display: "block" }} />
                    ) : kind === "video" ? (
                        <Box component="video" src={url} controls sx={{ width: "100%", maxHeight: 280 }} />
                    ) : kind === "audio" ? (
                        <Box component="audio" src={url} controls sx={{ width: "100%", m: 2 }} />
                    ) : (
                        <Box component="iframe" src={url} title={entry.name} sx={{ width: "100%", height: 280, border: 0, bgcolor: "#fff" }} />
                    )}
                </Box>
            )}
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button startIcon={<Download />} onClick={() => downloadObject(projectId, bucket, entry.key).catch((e) => notify({ severity: "error", message: toErrorMessage(e) }))}>
                    {t("objects.download")}
                </Button>
                <Button startIcon={<Link2 />} onClick={share}>
                    {t("objects.signedLink")}
                </Button>
            </Box>
            <Field label={t("objects.validity")}>
                <Select value={validity} onChange={(e) => setValidity(Number(e.target.value))} fullWidth>
                    {VALIDITY.map((v) => (
                        <MenuItem key={v.seconds} value={v.seconds}>
                            {t(v.key)}
                        </MenuItem>
                    ))}
                </Select>
            </Field>
            {stat.error && <ErrorBlock message={stat.error} />}
            <Box>
                <KV label={t("objects.type")}>
                    <Mono>{mime}</Mono>
                </KV>
                <KV label={t("objects.size")}>{formatBytes(stat.data?.size ?? entry.size)}</KV>
                <KV label={t("objects.modified")}>{formatDateTime(stat.data?.lastModified ?? entry.lastModified)}</KV>
                {stat.data?.etag && (
                    <KV label="ETag">
                        <Mono>{stat.data.etag}</Mono>
                    </KV>
                )}
                {stat.data?.storageClass && <KV label={t("objects.storageClass")}>{stat.data.storageClass}</KV>}
                <KV label={t("objects.fullKey")}>
                    <Mono>{entry.key}</Mono>
                </KV>
                {Object.entries({ ...(stat.data?.headers ?? {}), ...(stat.data?.metadata ?? {}) }).map(([name, value]) => (
                    <KV key={name} label={name}>
                        <Mono>{value}</Mono>
                    </KV>
                ))}
            </Box>
        </SidePanel>
    )
}

function CopyDialog({
    open,
    onClose,
    projectId,
    bucket,
    entries,
    buckets,
    onDone,
}: {
    open: boolean
    onClose: () => void
    projectId: number
    bucket: string
    entries: Entry[]
    buckets: string[]
    onDone: () => void
}) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const [destination, setDestination] = useState(bucket)
    const [prefix, setPrefix] = useState("")
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        if (open) {
            setDestination(bucket)
            setPrefix("")
        }
    }, [open, bucket])

    const submit = async () => {
        setBusy(true)
        let copied = 0
        const errors: string[] = []
        try {
            for (const entry of entries) {
                const base = entry.key.slice(0, entry.key.length - entry.name.length - (entry.isFolder ? 1 : 0))
                const keys = entry.isFolder ? await listAllKeys(projectId, bucket, entry.key) : [entry.key]
                for (const key of keys) {
                    const destinationKey = joinPrefix(prefix, key.slice(base.length))
                    try {
                        await copyObject(projectId, { sourceBucket: bucket, sourceKey: key, destinationBucket: destination, destinationKey })
                        copied += 1
                    } catch (error) {
                        errors.push(`${key}: ${toErrorMessage(error)}`)
                    }
                }
            }
            if (errors.length) notify({ severity: "error", message: t("objects.copyPartial", { count: copied, details: errors.slice(0, 3).join(" · ") }) })
            else notify({ severity: "success", message: t("objects.copied", { count: copied, bucket: destination }) })
            onDone()
            onClose()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    return (
        <FormDialog open={open} onClose={onClose} title={t("objects.copyTitle", { count: entries.length })} submitLabel={t("objects.copySubmit")} onSubmit={submit} busy={busy}>
            <Field label={t("objects.destinationBucket")}>
                <Select value={destination} onChange={(e) => setDestination(e.target.value)} fullWidth>
                    {buckets.map((name) => (
                        <MenuItem key={name} value={name}>
                            {name}
                        </MenuItem>
                    ))}
                </Select>
            </Field>
            <TextField label={t("objects.destinationPrefix")} value={prefix} onChange={(e) => setPrefix(e.target.value)} placeholder="archives/2026/" mono optional help={t("objects.destinationPrefixHelp")} />
        </FormDialog>
    )
}

export default function BucketObjects({ projectId, bucket, canWrite, buckets }: { projectId: number; bucket: string; canWrite: boolean; buckets: string[] }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const [params, setParams] = useSearchParams()
    const prefix = params.get("path") ?? ""
    const [filter, setFilter] = useState("")
    const [selected, setSelected] = useState<string[]>([])
    const [focused, setFocused] = useState<Entry | null>(null)
    const [more, setMore] = useState<ObjectListing[]>([])
    const [loadingMore, setLoadingMore] = useState(false)
    const [uploads, setUploads] = useState<UploadItem[]>([])
    const [dragging, setDragging] = useState(false)
    const [folderOpen, setFolderOpen] = useState(false)
    const [folderName, setFolderName] = useState("")
    const [busy, setBusy] = useState(false)
    const [deleting, setDeleting] = useState<Entry[] | null>(null)
    const [copying, setCopying] = useState<Entry[] | null>(null)
    const fileInput = useRef<HTMLInputElement>(null)

    const first = useAsync(() => listObjects(projectId, { bucket, prefix, delimiter: "/", maxKeys: 500 }), [projectId, bucket, prefix])
    useEffect(() => {
        setMore([])
        setSelected([])
        setFocused(null)
        setFilter("")
    }, [projectId, bucket, prefix])

    const listings = useMemo(() => (first.data ? [first.data, ...more] : []), [first.data, more])
    const entries = useMemo(() => toEntries(listings, prefix), [listings, prefix])
    const visible = filter ? entries.filter((e) => e.name.toLowerCase().includes(filter.toLowerCase())) : entries
    const last = listings[listings.length - 1]
    const selectedEntries = entries.filter((e) => selected.includes(e.key))

    const refresh = () => {
        setMore([])
        first.refresh()
    }

    const loadMore = async () => {
        if (!last?.nextContinuationToken) return
        setLoadingMore(true)
        try {
            const page = await listObjects(projectId, { bucket, prefix, delimiter: "/", maxKeys: 500, continuationToken: last.nextContinuationToken })
            setMore((m) => [...m, page])
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setLoadingMore(false)
        }
    }

    const goTo = (path: string) => {
        const next = new URLSearchParams(params)
        if (path) next.set("path", path)
        else next.delete("path")
        setParams(next)
    }

    const upload = async (files: { file: File; path: string }[]) => {
        if (!files.length) return
        setUploads(files.map((f) => ({ path: f.path, progress: 0 })))
        let failed = 0
        for (const [index, item] of files.entries()) {
            try {
                await uploadObject(projectId, bucket, joinPrefix(prefix, item.path), item.file, (ratio) =>
                    setUploads((list) => list.map((u, i) => (i === index ? { ...u, progress: ratio } : u))),
                )
                setUploads((list) => list.map((u, i) => (i === index ? { ...u, progress: 1 } : u)))
            } catch (error) {
                failed += 1
                setUploads((list) => list.map((u, i) => (i === index ? { ...u, error: toErrorMessage(error) } : u)))
            }
        }
        refresh()
        if (failed) notify({ severity: "error", message: t("objects.uploadFailed", { count: failed }) })
        else {
            notify({ severity: "success", message: t("objects.uploaded", { count: files.length }) })
            setUploads([])
        }
    }

    const onDrop = async (event: DragEvent) => {
        event.preventDefault()
        setDragging(false)
        if (!canWrite) return
        const files = await filesFromDrop(event.dataTransfer.items)
        await upload(files)
    }

    const confirmDelete = async () => {
        if (!deleting) return
        setBusy(true)
        try {
            const result = await deleteEntries(projectId, bucket, deleting)
            if (result.errors.length) notify({ severity: "error", message: t("objects.deletePartial", { count: result.deleted, details: result.errors.slice(0, 3).join(" · ") }) })
            else notify({ severity: "success", message: t("objects.deleted", { count: result.deleted }) })
            setDeleting(null)
            setSelected([])
            setFocused(null)
            refresh()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    const makeFolder = async () => {
        setBusy(true)
        try {
            await createFolder(projectId, bucket, prefix, folderName.trim())
            setFolderOpen(false)
            goTo(joinPrefix(prefix, `${folderName.trim().replace(/\/+$/, "")}/`))
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    const downloadSelected = async () => {
        for (const entry of selectedEntries.filter((e) => !e.isFolder)) {
            try {
                await downloadObject(projectId, bucket, entry.key)
            } catch (error) {
                notify({ severity: "error", message: toErrorMessage(error) })
            }
        }
    }

    const selectedSize = selectedEntries.reduce((sum, e) => sum + (e.size ?? 0), 0)
    const allSelected = visible.length > 0 && visible.every((e) => selected.includes(e.key))

    return (
        <WithPanel
            panel={
                focused && (
                    <ObjectPreview
                        projectId={projectId}
                        bucket={bucket}
                        entry={focused}
                        canWrite={canWrite}
                        onClose={() => setFocused(null)}
                        onCopy={() => setCopying([focused])}
                        onDelete={() => setDeleting([focused])}
                    />
                )
            }
        >
            <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center" }}>
                <Box component="nav" aria-label={t("objects.path")} sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", fontFamily: "inherit", mr: "auto" }}>
                    <Box component="button" type="button" onClick={() => goTo("")} sx={{ border: 0, bgcolor: "transparent", color: prefix ? k.text2 : k.text, font: "inherit", fontWeight: 500, cursor: "pointer", p: 0, "&:hover": { color: k.text } }}>
                        {bucket}
                    </Box>
                    {buildBreadcrumb(prefix).map((segment) => (
                        <Box key={segment.prefix} component="span" sx={{ display: "inline-flex", gap: 0.75 }}>
                            <Box component="span" sx={{ color: k.faint }}>
                                /
                            </Box>
                            <Box
                                component="button"
                                type="button"
                                onClick={() => goTo(segment.prefix)}
                                sx={{ border: 0, bgcolor: "transparent", color: segment.prefix === prefix ? k.text : k.text2, font: "inherit", cursor: "pointer", p: 0, "&:hover": { color: k.text } }}
                            >
                                {segment.label}
                            </Box>
                        </Box>
                    ))}
                    <Box component="span" sx={{ color: k.faint }}>
                        /
                    </Box>
                </Box>
                <Box sx={{ width: { xs: "100%", sm: 220 } }}>
                    <TextInput
                        value={filter}
                        onChange={(e) => setFilter(e.target.value)}
                        placeholder={t("objects.filter")}
                        startAdornment={<Search size={16} color={k.label} style={{ marginLeft: 12 }} />}
                        inputProps={{ "aria-label": t("objects.filter") }}
                    />
                </Box>
                {canWrite && (
                    <>
                        <Button
                            startIcon={<FolderPlus />}
                            onClick={() => {
                                setFolderName("")
                                setFolderOpen(true)
                            }}
                        >
                            {t("objects.folder")}
                        </Button>
                        <Button variant="contained" startIcon={<Upload />} onClick={() => fileInput.current?.click()}>
                            {t("objects.upload")}
                        </Button>
                        <input
                            ref={fileInput}
                            type="file"
                            multiple
                            hidden
                            onChange={(e) => {
                                const files = [...(e.target.files ?? [])].map((file) => ({ file, path: file.name }))
                                e.target.value = ""
                                void upload(files)
                            }}
                        />
                    </>
                )}
            </Box>

            {selected.length > 0 && (
                <Card sx={{ display: "flex", alignItems: "center", gap: 1.5, p: "10px 16px", bgcolor: k.rowSelected, borderColor: k.accentSoft, flexWrap: "wrap" }}>
                    <Box sx={{ fontWeight: 500, mr: "auto" }}>
                        {t("objects.selectedSummary", { count: selected.length, size: formatBytes(selectedSize) })}
                    </Box>
                    <Button startIcon={<Download />} onClick={downloadSelected} disabled={selectedEntries.every((e) => e.isFolder)}>
                        {t("objects.download")}
                    </Button>
                    <Button startIcon={<Copy />} onClick={() => setCopying(selectedEntries)}>
                        {t("objects.copyTo")}
                    </Button>
                    {canWrite && (
                        <Button color="error" startIcon={<Trash2 />} onClick={() => setDeleting(selectedEntries)}>
                            {t("ui.delete")}
                        </Button>
                    )}
                </Card>
            )}

            {uploads.length > 0 && (
                <Card sx={{ p: "14px 16px", display: "flex", flexDirection: "column", gap: 1 }}>
                    {uploads.map((u) => (
                        <Box key={u.path} sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                            <Mono sx={{ flex: "0 1 40%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.path}</Mono>
                            {u.error ? <Box sx={{ color: k.err, fontSize: 13, flex: 1 }}>{u.error}</Box> : <LinearProgress variant="determinate" value={u.progress * 100} sx={{ flex: 1 }} />}
                        </Box>
                    ))}
                    {uploads.some((u) => u.error) && (
                        <Button size="small" sx={{ alignSelf: "flex-start" }} onClick={() => setUploads([])}>
                            {t("ui.close")}
                        </Button>
                    )}
                </Card>
            )}

            {first.error && <ErrorBlock message={first.error} onRetry={refresh} />}

            <Card
                onDragOver={(e) => {
                    if (!canWrite) return
                    e.preventDefault()
                    setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                sx={{ borderColor: dragging ? k.accent : k.border, position: "relative" }}
            >
                {first.loading && !first.data ? (
                    <Spinner />
                ) : visible.length === 0 && !first.error ? (
                    <EmptyBlock title={filter ? t("ui.noResults") : t("objects.emptyTitle")} description={canWrite ? t("objects.emptyHint") : undefined} />
                ) : (
                    <TableWrap minWidth={560}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell padding="checkbox" sx={{ pl: 2 }}>
                                        <Checkbox
                                            checked={allSelected}
                                            indeterminate={!allSelected && visible.some((e) => selected.includes(e.key))}
                                            onChange={() => setSelected(allSelected ? [] : visible.map((e) => e.key))}
                                            slotProps={{ input: { "aria-label": t("ui.selectAll") } }}
                                        />
                                    </TableCell>
                                    <TableCell>{t("objects.name")}</TableCell>
                                    <TableCell align="right">{t("objects.size")}</TableCell>
                                    <TableCell>{t("objects.modified")}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {visible.map((entry) => (
                                    <TableRow key={entry.key} hover selected={selected.includes(entry.key) || focused?.key === entry.key}>
                                        <TableCell padding="checkbox" sx={{ pl: 2 }}>
                                            <Checkbox
                                                checked={selected.includes(entry.key)}
                                                onChange={() => setSelected((s) => (s.includes(entry.key) ? s.filter((x) => x !== entry.key) : [...s, entry.key]))}
                                                slotProps={{ input: { "aria-label": t("ui.selectRow", { name: entry.name }) } }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Box
                                                component="button"
                                                type="button"
                                                onClick={() => (entry.isFolder ? goTo(entry.key) : setFocused(entry))}
                                                sx={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: 1.25,
                                                    border: 0,
                                                    bgcolor: "transparent",
                                                    color: k.text,
                                                    font: "inherit",
                                                    cursor: "pointer",
                                                    p: 0,
                                                    textAlign: "left",
                                                    "& svg": { width: 18, height: 18, flex: "none" },
                                                    "&:hover": { color: k.accentText },
                                                }}
                                            >
                                                {iconFor(entry)}
                                                <span style={{ overflowWrap: "anywhere" }}>{entry.isFolder ? `${entry.name}/` : entry.name}</span>
                                            </Box>
                                        </TableCell>
                                        <TableCell align="right" sx={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                                            {entry.isFolder ? "—" : formatBytes(entry.size)}
                                        </TableCell>
                                        <TableCell sx={{ whiteSpace: "nowrap" }}>{entry.isFolder ? "—" : formatDateTime(entry.lastModified)}</TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableWrap>
                )}
                {last?.isTruncated && (
                    <Box sx={{ p: 1.5, borderTop: `1px solid ${k.border}`, display: "flex", justifyContent: "center" }}>
                        <Button onClick={loadMore} disabled={loadingMore}>
                            {t("ui.loadMore")}
                        </Button>
                    </Box>
                )}
                {canWrite && (
                    <Box sx={{ m: 2, p: 2.5, border: `1px dashed ${dragging ? k.accent : k.borderStrong}`, borderRadius: "10px", textAlign: "center", color: k.text2, fontSize: 13 }}>
                        {t("objects.dropHint", { path: prefix || "/" })}
                    </Box>
                )}
            </Card>

            {!canWrite && <Muted small>{t("objects.readOnly")}</Muted>}

            <FormDialog
                open={folderOpen}
                onClose={() => setFolderOpen(false)}
                title={t("objects.newFolder")}
                submitLabel={t("objects.createFolder")}
                onSubmit={makeFolder}
                busy={busy}
                canSubmit={Boolean(folderName.trim()) && !folderName.includes("/")}
            >
                <TextField label={t("objects.folderName")} value={folderName} onChange={(e) => setFolderName(e.target.value)} autoFocus mono help={t("objects.folderHelp", { path: prefix || "/" })} />
            </FormDialog>
            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title={t("objects.deleteTitle", { count: deleting?.length ?? 0 })}
                message={deleting?.some((e) => e.isFolder) ? t("objects.deleteFolderMessage") : t("objects.deleteMessage")}
                confirmLabel={t("ui.delete")}
                onConfirm={confirmDelete}
                busy={busy}
            />
            <CopyDialog
                open={Boolean(copying)}
                onClose={() => setCopying(null)}
                projectId={projectId}
                bucket={bucket}
                entries={copying ?? []}
                buckets={buckets.length ? buckets : [bucket]}
                onDone={refresh}
            />
        </WithPanel>
    )
}

