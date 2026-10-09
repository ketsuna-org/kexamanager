import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import IconButton from "@mui/material/IconButton"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Tooltip from "@mui/material/Tooltip"
import { Link as RouterLink } from "react-router-dom"
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react"
import type { components } from "../types/openapi"
import { toErrorMessage } from "../api/storage"
import { useActiveProject } from "../contexts/ProjectContext"
import { useFeedback } from "../contexts/FeedbackContext"
import { useAsync } from "../hooks/useAsync"
import { adminGet } from "../utils/adminClient"
import { CreateAdminToken, DeleteAdminToken, ListAdminTokens, UpdateAdminToken } from "../utils/apiWrapper"
import { Page } from "../shell/Page"
import { k } from "../theme"
import { Card, CopyField, EmptyBlock, ErrorBlock, Field, Muted, Pill, Segmented, Spinner, TableWrap, Tag, TextField, TextInput } from "../ui/kit"
import { ConfirmDialog, FormDialog } from "../ui/dialogs"
import { formatDate, formatRelative } from "../utils/format"

type Token = components["schemas"]["GetAdminTokenInfoResponse"]

/** Every endpoint of the Garage admin API v2, for the custom scope. */
const ADMIN_ENDPOINTS = [
    "AddBucketAlias", "AllowBucketKey", "ApplyClusterLayout", "CleanupIncompleteUploads", "ClusterLayoutSkipDeadNodes", "ConnectClusterNodes",
    "CreateAdminToken", "CreateBucket", "CreateKey", "CreateMetadataSnapshot", "DeleteAdminToken", "DeleteBucket", "DeleteKey", "DenyBucketKey",
    "GetAdminTokenInfo", "GetBlockInfo", "GetBucketInfo", "GetClusterHealth", "GetClusterLayout", "GetClusterLayoutHistory", "GetClusterStatistics",
    "GetClusterStatus", "GetCurrentAdminTokenInfo", "GetKeyInfo", "GetNodeInfo", "GetNodeStatistics", "GetWorkerInfo", "GetWorkerVariable", "ImportKey",
    "InspectObject", "LaunchRepairOperation", "ListAdminTokens", "ListBlockErrors", "ListBuckets", "ListKeys", "ListWorkers", "PreviewClusterLayoutChanges",
    "PurgeBlocks", "RemoveBucketAlias", "RetryBlockResync", "RevertClusterLayout", "SetWorkerVariable", "UpdateAdminToken", "UpdateBucket",
    "UpdateClusterLayout", "UpdateKey", "Metrics",
]

const READ_ONLY = ADMIN_ENDPOINTS.filter((e) => e.startsWith("Get") || e.startsWith("List"))
const PROVISIONING = ["CreateBucket", "CreateKey", "AllowBucketKey", "DenyBucketKey", "AddBucketAlias", "UpdateBucket", "GetBucketInfo", "GetKeyInfo", "ListBuckets", "ListKeys"]

type Preset = "full" | "readonly" | "provisioning" | "custom"

function presetOf(scope: string[]): Preset {
    const set = new Set(scope)
    const same = (list: string[]) => list.length === set.size && list.every((e) => set.has(e))
    if (set.has("*")) return "full"
    if (same(READ_ONLY)) return "readonly"
    if (same(PROVISIONING)) return "provisioning"
    return "custom"
}

function scopeFor(preset: Preset, custom: string[]): string[] {
    if (preset === "full") return ["*"]
    if (preset === "readonly") return READ_ONLY
    if (preset === "provisioning") return PROVISIONING
    return custom
}

function ScopeTags({ scope }: { scope: string[] }) {
    const { t } = useTranslation()
    if (scope.includes("*")) return <Tag>* {t("tokens.everything")}</Tag>
    const preset = presetOf(scope)
    if (preset === "readonly") return <Tag>{t("tokens.presetReadonly")}</Tag>
    return (
        <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap" }}>
            {scope.slice(0, 3).map((e) => (
                <Tag key={e}>{e}</Tag>
            ))}
            {scope.length > 3 && <Tag>+{scope.length - 3}</Tag>}
        </Box>
    )
}

function TokenDialog({ open, onClose, initial, onSaved }: { open: boolean; onClose: () => void; initial?: Token; onSaved: (secret?: string) => void }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const [name, setName] = useState("")
    const [preset, setPreset] = useState<Preset>("readonly")
    const [custom, setCustom] = useState<string[]>([])
    const [expires, setExpires] = useState(false)
    const [date, setDate] = useState("")
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (!open) return
        setName(initial?.name ?? "")
        const p = initial ? presetOf(initial.scope) : "readonly"
        setPreset(p)
        setCustom(initial && p === "custom" ? initial.scope : READ_ONLY)
        setExpires(Boolean(initial?.expiration))
        setDate(initial?.expiration ? initial.expiration.slice(0, 10) : new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10))
    }, [open, initial])

    const scope = scopeFor(preset, custom)
    const submit = async () => {
        setBusy(true)
        const body = { name: name.trim(), scope, expiration: expires && date ? new Date(`${date}T23:59:59`).toISOString() : null, neverExpires: !expires }
        try {
            if (initial?.id) {
                await UpdateAdminToken({ id: initial.id }, body)
                onSaved()
            } else {
                const created = await CreateAdminToken(body)
                onSaved(created.secretToken)
            }
            onClose()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    const hints: Record<Preset, string> = {
        full: t("tokens.hintFull"),
        readonly: t("tokens.hintReadonly"),
        provisioning: t("tokens.hintProvisioning"),
        custom: t("tokens.hintCustom"),
    }

    return (
        <FormDialog
            open={open}
            onClose={onClose}
            title={initial ? t("tokens.editTitle") : t("tokens.create")}
            submitLabel={initial ? t("ui.save") : t("tokens.createSubmit")}
            onSubmit={submit}
            busy={busy}
            canSubmit={Boolean(name.trim()) && scope.length > 0}
            width="md"
        >
            <TextField label={t("tokens.name")} value={name} onChange={(e) => setName(e.target.value)} autoFocus placeholder="monitoring" />
            <Field label={t("tokens.scope")} help={hints[preset]}>
                <Segmented
                    value={preset}
                    onChange={setPreset}
                    label={t("tokens.scope")}
                    options={[
                        { value: "full", label: t("tokens.presetFull") },
                        { value: "readonly", label: t("tokens.presetReadonly") },
                        { value: "provisioning", label: t("tokens.presetProvisioning") },
                        { value: "custom", label: t("tokens.presetCustom") },
                    ]}
                />
            </Field>
            {preset === "custom" && (
                <Box sx={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", maxHeight: 260, overflowY: "auto", border: `1px solid ${k.border}`, borderRadius: "8px", p: 1 }}>
                    {ADMIN_ENDPOINTS.map((endpoint) => (
                        <FormControlLabel
                            key={endpoint}
                            control={<Checkbox checked={custom.includes(endpoint)} onChange={(e) => setCustom((c) => (e.target.checked ? [...c, endpoint] : c.filter((x) => x !== endpoint)))} />}
                            label={<Box component="span" sx={{ fontFamily: "IBM Plex Mono, monospace", fontSize: 12.5 }}>{endpoint}</Box>}
                        />
                    ))}
                </Box>
            )}
            <Box>
                <FormControlLabel control={<Checkbox checked={expires} onChange={(e) => setExpires(e.target.checked)} />} label={t("keys.setExpiration")} />
                {expires && <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} inputProps={{ "aria-label": t("keys.expiration") }} sx={{ maxWidth: 220 }} />}
            </Box>
        </FormDialog>
    )
}

export default function AdminTokensPage() {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const project = useActiveProject()
    const tokens = useAsync(() => ListAdminTokens(), [project.id])
    const current = useAsync(() => adminGet<Token>("/v2/GetCurrentAdminTokenInfo").catch(() => null), [project.id])
    const [editing, setEditing] = useState<Token | null>(null)
    const [creating, setCreating] = useState(false)
    const [secret, setSecret] = useState<string | null>(null)
    const [deleting, setDeleting] = useState<Token | null>(null)
    const [busy, setBusy] = useState(false)

    const rows = useMemo(() => [...(tokens.data ?? [])].sort((a, b) => Number(!a.id) - Number(!b.id) || a.name.localeCompare(b.name)), [tokens.data])

    return (
        <Page
            crumbs={[{ label: project.name }, { label: t("nav.adminTokens") }]}
            title={t("nav.adminTokens")}
            description={
                <>
                    {t("tokens.description")}{" "}
                    <Box component={RouterLink} to="/keys" sx={{ color: k.link }}>
                        {t("tokens.useKey")}
                    </Box>
                    .
                </>
            }
            actions={
                <Button variant="contained" startIcon={<Plus />} onClick={() => setCreating(true)}>
                    {t("tokens.create")}
                </Button>
            }
        >
            {tokens.error && <ErrorBlock message={tokens.error} onRetry={tokens.refresh} />}
            <Card>
                {tokens.loading && !tokens.data ? (
                    <Spinner />
                ) : rows.length === 0 ? (
                    <EmptyBlock icon={<ShieldCheck />} title={t("tokens.emptyTitle")} />
                ) : (
                    <TableWrap minWidth={720}>
                        <Table>
                            <TableHead>
                                <TableRow>
                                    <TableCell>{t("tokens.name")}</TableCell>
                                    <TableCell>{t("tokens.scope")}</TableCell>
                                    <TableCell>{t("keys.expiration")}</TableCell>
                                    <TableCell>{t("keys.created")}</TableCell>
                                    <TableCell align="right">{t("ui.actions")}</TableCell>
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {rows.map((token) => {
                                    const isCurrent = Boolean(current.data && token.id && current.data.id === token.id)
                                    return (
                                        <TableRow key={token.id ?? `config:${token.name}`} hover>
                                            <TableCell>
                                                <Box sx={{ fontWeight: 500 }}>{token.name}</Box>
                                                {!token.id && <Muted small>{t("tokens.fromConfig")}</Muted>}
                                                {isCurrent && <Muted small>{t("tokens.usedByConsole")}</Muted>}
                                            </TableCell>
                                            <TableCell>
                                                <ScopeTags scope={token.scope} />
                                            </TableCell>
                                            <TableCell>
                                                {token.expired ? <Pill tone="err">{t("keys.expired")}</Pill> : token.expiration ? formatRelative(token.expiration) : token.id ? <Muted>{t("keys.never")}</Muted> : "—"}
                                            </TableCell>
                                            <TableCell>{token.created ? formatDate(token.created) : "—"}</TableCell>
                                            <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                                                {token.id ? (
                                                    <>
                                                        <Tooltip title={t("ui.edit")}>
                                                            <IconButton size="small" onClick={() => setEditing(token)} aria-label={t("ui.edit")}>
                                                                <Pencil />
                                                            </IconButton>
                                                        </Tooltip>
                                                        <Tooltip title={isCurrent ? t("tokens.cannotDeleteCurrent") : t("ui.delete")}>
                                                            <span>
                                                                <IconButton size="small" onClick={() => setDeleting(token)} aria-label={t("ui.delete")} disabled={isCurrent}>
                                                                    <Trash2 />
                                                                </IconButton>
                                                            </span>
                                                        </Tooltip>
                                                    </>
                                                ) : (
                                                    <Muted small>{t("tokens.readOnly")}</Muted>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </TableWrap>
                )}
            </Card>

            <TokenDialog
                open={creating || Boolean(editing)}
                initial={editing ?? undefined}
                onClose={() => {
                    setCreating(false)
                    setEditing(null)
                }}
                onSaved={(created) => {
                    tokens.refresh()
                    if (created) setSecret(created)
                    else notify({ severity: "success", message: t("tokens.updated") })
                }}
            />
            <FormDialog open={Boolean(secret)} onClose={() => setSecret(null)} title={t("tokens.createdTitle")} description={t("tokens.createdHelp")} submitLabel={t("keys.finish")} onSubmit={() => setSecret(null)}>
                <CopyField value={secret ?? ""} what={t("tokens.secret")} />
            </FormDialog>
            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title={t("tokens.deleteTitle", { name: deleting?.name })}
                message={t("tokens.deleteMessage")}
                confirmLabel={t("ui.delete")}
                busy={busy}
                onConfirm={async () => {
                    if (!deleting?.id) return
                    setBusy(true)
                    try {
                        await DeleteAdminToken({ id: deleting.id })
                        tokens.refresh()
                        setDeleting(null)
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
