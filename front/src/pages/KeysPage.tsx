import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { Link as RouterLink, useNavigate } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import { Download, FolderOpen, KeyRound, Pencil, Plus, Search, Trash2 } from "lucide-react"
import type { components } from "../types/openapi"
import { toErrorMessage } from "../api/storage"
import { setS3Session } from "../api/s3session"
import { useActiveProject, useProject } from "../contexts/ProjectContext"
import { useFeedback } from "../contexts/FeedbackContext"
import { useAsync } from "../hooks/useAsync"
import { useKeys } from "../hooks/useKeys"
import { AllowBucketKey, CreateKey, DeleteKey, DenyBucketKey, GetKeyInfo, ImportKey, ListBuckets, UpdateKey } from "../utils/apiWrapper"
import { Page } from "../shell/Page"
import { k, monoFamily } from "../theme"
import { Card, CopyButton, CopyField, EmptyBlock, ErrorBlock, Field, KV, Mono, Muted, Pill, SidePanel, Spinner, TableWrap, TextField, TextInput, WithPanel } from "../ui/kit"
import { ConfirmDialog, FormDialog } from "../ui/dialogs"
import { formatDate, formatRelative, shortId, msFromNow } from "../utils/format"
import { GrantDialog } from "./buckets/GrantDialog"
import { bucketPath } from "./buckets/paths"

type KeyInfo = components["schemas"]["GetKeyInfoResponse"]
type KeyItem = components["schemas"]["ListKeysResponseItem"]

const DAY = 86_400_000

function ExpirationLabel({ expiration, expired }: { expiration?: string | null; expired: boolean }) {
    const { t } = useTranslation()
    if (expired) return <Pill tone="err">{t("keys.expired")}</Pill>
    if (!expiration) return <Muted>{t("keys.never")}</Muted>
    const soon = msFromNow(expiration) < 7 * DAY
    return soon ? <Pill tone="warn">{formatRelative(expiration)}</Pill> : <span>{formatRelative(expiration)}</span>
}

function bucketLabel(bucket: { globalAliases: string[]; localAliases: string[]; id: string }): string {
    return bucket.globalAliases[0] ?? bucket.localAliases[0] ?? shortId(bucket.id)
}

/** Name, expiration and bucket creation right: shared by create and edit. */
function KeyFormDialog({ open, onClose, initial, onSubmit, title, submitLabel }: { open: boolean; onClose: () => void; initial?: KeyInfo; onSubmit: (value: { name: string; expiration: string | null; createBucket: boolean }) => Promise<void>; title: string; submitLabel: string }) {
    const { t } = useTranslation()
    const [name, setName] = useState("")
    const [expires, setExpires] = useState(false)
    const [date, setDate] = useState("")
    const [createBucket, setCreateBucket] = useState(false)
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        if (!open) return
        setName(initial?.name ?? "")
        setExpires(Boolean(initial?.expiration))
        setDate(initial?.expiration ? initial.expiration.slice(0, 10) : new Date(Date.now() + 90 * DAY).toISOString().slice(0, 10))
        setCreateBucket(Boolean(initial?.permissions.createBucket))
    }, [open, initial])

    const submit = async () => {
        setBusy(true)
        try {
            await onSubmit({ name: name.trim(), expiration: expires && date ? new Date(`${date}T23:59:59`).toISOString() : null, createBucket })
            onClose()
        } finally {
            setBusy(false)
        }
    }

    return (
        <FormDialog open={open} onClose={onClose} title={title} submitLabel={submitLabel} onSubmit={submit} busy={busy} canSubmit={Boolean(name.trim()) && (!expires || Boolean(date))}>
            <TextField label={t("keys.name")} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="ci-deploy" help={t("keys.nameHelp")} />
            <Box>
                <FormControlLabel control={<Checkbox checked={expires} onChange={(e) => setExpires(e.target.checked)} />} label={t("keys.setExpiration")} />
                {expires && <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} inputProps={{ "aria-label": t("keys.expiration") }} sx={{ maxWidth: 220 }} />}
            </Box>
            <FormControlLabel control={<Checkbox checked={createBucket} onChange={(e) => setCreateBucket(e.target.checked)} />} label={t("keys.allowCreateBucket")} />
        </FormDialog>
    )
}

function ImportDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: string) => void }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const [name, setName] = useState("")
    const [id, setId] = useState("")
    const [secret, setSecret] = useState("")
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        if (open) {
            setName("")
            setId("")
            setSecret("")
        }
    }, [open])
    const submit = async () => {
        setBusy(true)
        try {
            const key = await ImportKey({ name: name || null, accessKeyId: id.trim(), secretAccessKey: secret.trim() })
            notify({ severity: "success", message: t("keys.imported", { name: key.name || key.accessKeyId }) })
            onDone(key.accessKeyId)
            onClose()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }
    return (
        <FormDialog open={open} onClose={onClose} title={t("keys.import")} description={t("keys.importHelp")} submitLabel={t("keys.importSubmit")} onSubmit={submit} busy={busy} canSubmit={Boolean(id.trim() && secret.trim())}>
            <TextField label={t("keys.name")} value={name} onChange={(e) => setName(e.target.value)} optional />
            <TextField label="Access key ID" value={id} onChange={(e) => setId(e.target.value)} mono autoComplete="off" />
            <TextField label="Secret access key" value={secret} onChange={(e) => setSecret(e.target.value)} type="password" mono autoComplete="off" />
        </FormDialog>
    )
}

function CreatedKeyDialog({ created, onClose, onGrant }: { created: KeyInfo | null; onClose: () => void; onGrant: () => void }) {
    const { t } = useTranslation()
    const project = useActiveProject()
    const [saved, setSaved] = useState(false)
    useEffect(() => setSaved(false), [created])
    if (!created) return null
    const env = [
        `AWS_ACCESS_KEY_ID=${created.accessKeyId}`,
        `AWS_SECRET_ACCESS_KEY=${created.secretAccessKey ?? ""}`,
        `AWS_ENDPOINT_URL=${project.s3_url ?? ""}`,
        `AWS_REGION=${project.region || "garage"}`,
    ].join("\n")
    return (
        <FormDialog
            open
            onClose={() => saved && onClose()}
            title={t("keys.createdTitle", { name: created.name })}
            description={t("keys.createdHelp")}
            submitLabel={t("keys.finish")}
            onSubmit={onClose}
            canSubmit={saved}
            secondary={
                <Button onClick={onGrant} disabled={!saved}>
                    {t("keys.grantBucket")}
                </Button>
            }
        >
            <Field label="Access key ID">
                <CopyField value={created.accessKeyId} what="Access key ID" />
            </Field>
            <Field label="Secret access key">
                <CopyField value={created.secretAccessKey ?? ""} what={t("keys.secret")} />
            </Field>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Box sx={{ fontSize: 13, fontWeight: 500 }}>{t("keys.envVars")}</Box>
                    <CopyButton value={env} label={t("keys.copyBlock")} what={t("keys.envVars")} />
                </Box>
                <Box component="pre" sx={{ m: 0, p: 1.5, borderRadius: "8px", bgcolor: k.input, border: `1px solid ${k.borderStrong}`, fontFamily: monoFamily, fontSize: 12.5, overflowX: "auto" }}>
                    {env}
                </Box>
            </Box>
            <FormControlLabel control={<Checkbox checked={saved} onChange={(e) => setSaved(e.target.checked)} />} label={t("keys.savedSecret")} />
        </FormDialog>
    )
}

function KeyPanel({ keyId, onClose, onChanged, onEdit, onDelete }: { keyId: string; onClose: () => void; onChanged: () => void; onEdit: (info: KeyInfo) => void; onDelete: (info: KeyInfo) => void }) {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { notify } = useFeedback()
    const project = useActiveProject()
    const info = useAsync(() => GetKeyInfo({ id: keyId }), [keyId])
    const [secret, setSecret] = useState<string | null>(null)
    const [granting, setGranting] = useState(false)
    const buckets = useAsync(() => (granting ? ListBuckets(project.id) : undefined), [granting, project.id])
    useEffect(() => setSecret(null), [keyId])

    const reveal = async () => {
        try {
            const full = await GetKeyInfo({ id: keyId, showSecretKey: true })
            setSecret(full.secretAccessKey ?? "")
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        }
    }

    const browse = async () => {
        try {
            const full = await GetKeyInfo({ id: keyId, showSecretKey: true })
            setS3Session(project.id, { keyId: full.accessKeyId, secret: full.secretAccessKey ?? "", name: full.name, pinned: true })
            const first = full.buckets[0]
            navigate(first ? bucketPath(first.id) : "/buckets")
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        }
    }

    const revoke = async (bucketId: string) => {
        try {
            await DenyBucketKey({ bucketId, accessKeyId: keyId, permissions: { read: true, write: true, owner: true } })
            info.refresh()
            onChanged()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        }
    }

    const data = info.data
    const present = new Set(data?.buckets.map((b) => b.id) ?? [])
    return (
        <SidePanel
            open
            onClose={onClose}
            title={data ? t("keys.panelTitle", { name: data.name || t("keys.unnamed") }) : t("ui.loading")}
            footer={
                data && (
                    <>
                        <Button startIcon={<Pencil />} onClick={() => onEdit(data)}>
                            {t("ui.edit")}
                        </Button>
                        <Button color="error" startIcon={<Trash2 />} onClick={() => onDelete(data)}>
                            {t("ui.delete")}
                        </Button>
                    </>
                )
            }
        >
            {info.error && <ErrorBlock message={info.error} onRetry={info.refresh} />}
            {!data && !info.error && <Spinner />}
            {data && (
                <>
                    <Field label="Access key ID">
                        <CopyField value={data.accessKeyId} what="Access key ID" />
                    </Field>
                    <Field label={t("keys.secret")}>
                        {secret === null ? (
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 44, px: "12px", border: `1px solid ${k.borderStrong}`, borderRadius: "8px", bgcolor: k.input }}>
                                <Mono sx={{ flex: 1 }}>{"•".repeat(20)}</Mono>
                                <Button size="small" onClick={reveal}>
                                    {t("ui.show")}
                                </Button>
                            </Box>
                        ) : (
                            <CopyField value={secret} secret what={t("keys.secret")} />
                        )}
                    </Field>
                    <Box>
                        <KV label={t("keys.created")}>{formatDate(data.created)}</KV>
                        <KV label={t("keys.expiration")}>
                            <ExpirationLabel expiration={data.expiration} expired={data.expired} />
                        </KV>
                        <KV label={t("keys.canCreateBucket")}>{data.permissions.createBucket ? t("ui.yes") : t("ui.no")}</KV>
                    </Box>
                    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <Box sx={{ fontWeight: 600 }}>{t("keys.allowedBuckets")}</Box>
                            <Button size="small" startIcon={<Plus />} onClick={() => setGranting(true)}>
                                {t("ui.add")}
                            </Button>
                        </Box>
                        {data.buckets.length === 0 && <Muted>{t("keys.noBuckets")}</Muted>}
                        {data.buckets.map((bucket) => (
                            <Box key={bucket.id} sx={{ display: "flex", alignItems: "center", gap: 1, py: 1, borderBottom: `1px solid ${k.rowBorder}`, flexWrap: "wrap" }}>
                                <Box component={RouterLink} to={bucketPath(bucket.id)} sx={{ color: k.text, fontWeight: 500, textDecoration: "none", mr: "auto", "&:hover": { color: k.accentText } }}>
                                    {bucketLabel(bucket)}
                                </Box>
                                {bucket.permissions.read && <Pill>{t("access.read")}</Pill>}
                                {bucket.permissions.write && <Pill>{t("access.write")}</Pill>}
                                {bucket.permissions.owner && <Pill tone="accent">{t("access.owner")}</Pill>}
                                <Button size="small" variant="text" onClick={() => revoke(bucket.id)}>
                                    {t("bucketSettings.revoke")}
                                </Button>
                            </Box>
                        ))}
                    </Box>
                    <Button startIcon={<FolderOpen />} onClick={browse} disabled={data.buckets.length === 0}>
                        {t("keys.browseWithKey")}
                    </Button>
                </>
            )}
            <GrantDialog
                open={granting}
                onClose={() => setGranting(false)}
                title={t("keys.grantBucket")}
                pickLabel={t("access.bucket")}
                options={(buckets.data ?? []).filter((b) => !present.has(b.id)).map((b) => ({ id: b.id, label: b.globalAliases[0] ?? shortId(b.id) }))}
                onSubmit={async (grant) => {
                    try {
                        await AllowBucketKey({ bucketId: grant.targetId, accessKeyId: keyId, permissions: { read: grant.read, write: grant.write, owner: grant.owner } })
                        info.refresh()
                        onChanged()
                    } catch (error) {
                        notify({ severity: "error", message: toErrorMessage(error) })
                        throw error
                    }
                }}
            />
        </SidePanel>
    )
}

export default function KeysPage() {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const project = useActiveProject()
    const { refreshCounts } = useProject()
    const keys = useKeys(project.id, true)
    const [bucketCounts, setBucketCounts] = useState<Record<string, number>>({})
    const [query, setQuery] = useState("")
    const [selected, setSelected] = useState<string | null>(null)
    const [creating, setCreating] = useState(false)
    const [importing, setImporting] = useState(false)
    const [editing, setEditing] = useState<KeyInfo | null>(null)
    const [deleting, setDeleting] = useState<{ id: string; name: string } | null>(null)
    const [created, setCreated] = useState<KeyInfo | null>(null)
    const [grantAfterCreate, setGrantAfterCreate] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)
    const [panelNonce, setPanelNonce] = useState(0)
    const grantBuckets = useAsync(() => (grantAfterCreate ? ListBuckets(project.id) : undefined), [grantAfterCreate, project.id])

    // Bucket counts need one GetKeyInfo per key, fetched a few at a time.
    useEffect(() => {
        const list = keys.data
        if (!list) return
        let cancelled = false
        const queue = [...list]
        const worker = async () => {
            while (queue.length && !cancelled) {
                const item = queue.shift()!
                try {
                    const info = await GetKeyInfo({ id: item.id })
                    if (!cancelled) setBucketCounts((c) => ({ ...c, [item.id]: info.buckets.length }))
                } catch {
                    // the column shows a dash
                }
            }
        }
        void Promise.all(Array.from({ length: 6 }, worker))
        return () => {
            cancelled = true
        }
    }, [keys.data])

    const rows = useMemo(() => {
        const q = query.trim().toLowerCase()
        const list = [...(keys.data ?? [])].sort((a, b) => (a.name || a.id).localeCompare(b.name || b.id))
        return q ? list.filter((key) => key.name.toLowerCase().includes(q) || key.id.toLowerCase().includes(q)) : list
    }, [keys.data, query])

    const changed = () => {
        keys.refresh()
        refreshCounts()
    }

    const isNew = (key: KeyItem) => Boolean(key.created && -msFromNow(key.created) < DAY)

    return (
        <Page
            crumbs={[{ label: project.name }, { label: t("nav.keys") }]}
            title={t("nav.keys")}
            description={t("keys.description")}
            actions={
                <>
                    <Button startIcon={<Download />} onClick={() => setImporting(true)}>
                        {t("keys.import")}
                    </Button>
                    <Button variant="contained" startIcon={<Plus />} onClick={() => setCreating(true)}>
                        {t("keys.create")}
                    </Button>
                </>
            }
        >
            <WithPanel
                panel={
                    selected && (
                        <KeyPanel
                            key={`${selected}:${panelNonce}`}
                            keyId={selected}
                            onClose={() => setSelected(null)}
                            onChanged={changed}
                            onEdit={setEditing}
                            onDelete={(info) => setDeleting({ id: info.accessKeyId, name: info.name || info.accessKeyId })}
                        />
                    )
                }
            >
                <Box sx={{ maxWidth: 420 }}>
                    <TextInput value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("keys.search")} startAdornment={<Search size={16} color={k.label} style={{ marginLeft: 12 }} />} inputProps={{ "aria-label": t("keys.search") }} />
                </Box>
                {keys.error && <ErrorBlock message={keys.error} onRetry={keys.refresh} />}
                <Card>
                    {keys.loading && !keys.data ? (
                        <Spinner />
                    ) : rows.length === 0 ? (
                        <EmptyBlock
                            icon={<KeyRound />}
                            title={query ? t("ui.noResults") : t("keys.emptyTitle")}
                            description={query ? undefined : t("keys.emptyText")}
                            action={
                                !query && (
                                    <Button variant="contained" startIcon={<Plus />} onClick={() => setCreating(true)}>
                                        {t("keys.create")}
                                    </Button>
                                )
                            }
                        />
                    ) : (
                        <TableWrap minWidth={560}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("keys.name")}</TableCell>
                                        <TableCell>Access key ID</TableCell>
                                        <TableCell align="right">{t("keys.buckets")}</TableCell>
                                        <TableCell>{t("keys.expiration")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.map((key) => (
                                        <TableRow key={key.id} hover selected={key.id === selected} onClick={() => setSelected(key.id)} sx={{ cursor: "pointer" }}>
                                            <TableCell>
                                                <Box
                                                    component="button"
                                                    type="button"
                                                    onClick={() => setSelected(key.id)}
                                                    sx={{ border: 0, bgcolor: "transparent", color: k.text, font: "inherit", fontWeight: 500, cursor: "pointer", p: 0, mr: 1 }}
                                                >
                                                    {key.name || t("keys.unnamed")}
                                                </Box>
                                                {isNew(key) && <Pill tone="accent">{t("keys.new")}</Pill>}
                                            </TableCell>
                                            <TableCell>
                                                <Mono title={key.id}>{shortId(key.id, 12, 0)}</Mono>
                                            </TableCell>
                                            <TableCell align="right">{bucketCounts[key.id] ?? "-"}</TableCell>
                                            <TableCell>
                                                <ExpirationLabel expiration={key.expiration} expired={key.expired} />
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableWrap>
                    )}
                </Card>
            </WithPanel>

            <KeyFormDialog
                open={creating}
                onClose={() => setCreating(false)}
                title={t("keys.create")}
                submitLabel={t("keys.createSubmit")}
                onSubmit={async ({ name, expiration, createBucket }) => {
                    try {
                        const key = await CreateKey({ name, expiration, neverExpires: !expiration, allow: createBucket ? { createBucket: true } : null })
                        setCreated(key)
                        changed()
                    } catch (error) {
                        notify({ severity: "error", message: toErrorMessage(error) })
                        throw error
                    }
                }}
            />
            <KeyFormDialog
                open={Boolean(editing)}
                onClose={() => setEditing(null)}
                initial={editing ?? undefined}
                title={t("keys.editTitle")}
                submitLabel={t("ui.save")}
                onSubmit={async ({ name, expiration, createBucket }) => {
                    if (!editing) return
                    try {
                        await UpdateKey(
                            { id: editing.accessKeyId },
                            {
                                name,
                                expiration,
                                neverExpires: !expiration,
                                allow: createBucket ? { createBucket: true } : null,
                                deny: createBucket ? null : { createBucket: true },
                            },
                        )
                        notify({ severity: "success", message: t("keys.updated") })
                        changed()
                        setPanelNonce((n) => n + 1)
                    } catch (error) {
                        notify({ severity: "error", message: toErrorMessage(error) })
                        throw error
                    }
                }}
            />
            <ImportDialog
                open={importing}
                onClose={() => setImporting(false)}
                onDone={(id) => {
                    changed()
                    setSelected(id)
                }}
            />
            <CreatedKeyDialog
                created={created}
                onClose={() => {
                    setSelected(created?.accessKeyId ?? null)
                    setCreated(null)
                }}
                onGrant={() => {
                    setGrantAfterCreate(created?.accessKeyId ?? null)
                    setSelected(created?.accessKeyId ?? null)
                    setCreated(null)
                }}
            />
            <GrantDialog
                open={Boolean(grantAfterCreate)}
                onClose={() => setGrantAfterCreate(null)}
                title={t("keys.grantBucket")}
                pickLabel={t("access.bucket")}
                options={(grantBuckets.data ?? []).map((b) => ({ id: b.id, label: b.globalAliases[0] ?? shortId(b.id) }))}
                onSubmit={async (grant) => {
                    try {
                        await AllowBucketKey({ bucketId: grant.targetId, accessKeyId: grantAfterCreate!, permissions: { read: grant.read, write: grant.write, owner: grant.owner } })
                        setPanelNonce((n) => n + 1)
                        changed()
                    } catch (error) {
                        notify({ severity: "error", message: toErrorMessage(error) })
                        throw error
                    }
                }}
            />
            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title={t("keys.deleteTitle", { name: deleting?.name })}
                message={t("keys.deleteMessage")}
                confirmLabel={t("ui.delete")}
                confirmText={deleting?.name}
                busy={busy}
                onConfirm={async () => {
                    if (!deleting) return
                    setBusy(true)
                    try {
                        await DeleteKey({ id: deleting.id })
                        notify({ severity: "success", message: t("keys.deleted", { name: deleting.name }) })
                        setSelected(null)
                        setDeleting(null)
                        changed()
                    } catch (error) {
                        notify({ severity: "error", message: toErrorMessage(error) })
                    } finally {
                        setBusy(false)
                    }
                }}
            />
        </Page>
    )
}
