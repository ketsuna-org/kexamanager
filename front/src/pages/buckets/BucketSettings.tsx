import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import IconButton from "@mui/material/IconButton"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import useMediaQuery from "@mui/material/useMediaQuery"
import { Plus, X } from "lucide-react"
import type { components } from "../../types/openapi"
import { toErrorMessage } from "../../api/storage"
import { useFeedback } from "../../contexts/FeedbackContext"
import { useProject } from "../../contexts/ProjectContext"
import { useKeys } from "../../hooks/useKeys"
import { AddBucketAlias, AllowBucketKey, DeleteBucket, DenyBucketKey, RemoveBucketAlias, UpdateBucket } from "../../utils/apiWrapper"
import { k } from "../../theme"
import { Bar, EmptyBlock, Field, Mono, Muted, Section, TableWrap, TextField, TextInput, Toggle } from "../../ui/kit"
import { ConfirmDialog } from "../../ui/dialogs"
import { byteUnits, formatBytes, formatCount, shortId } from "../../utils/format"
import { GrantDialog } from "./GrantDialog"

type BucketInfo = components["schemas"]["GetBucketInfoResponse"]
type Perm = "read" | "write" | "owner"

const SECTIONS = ["access", "aliases", "quotas", "website", "delete"] as const
const UNIT_POWERS = [2, 3, 4] // Mo, Go, To

function splitSize(bytes: number | null | undefined): { value: string; power: number } {
    if (!bytes) return { value: "", power: 3 }
    for (const power of [4, 3, 2]) {
        const value = bytes / 1000 ** power
        if (value >= 1 && Number.isInteger(Math.round(value * 100) / 100)) return { value: String(Math.round(value * 100) / 100), power }
    }
    return { value: String(Math.round((bytes / 1e9) * 100) / 100), power: 3 }
}

function AccessSection({ info, onChange }: { info: BucketInfo; onChange: () => Promise<void> }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const { selectedProjectId, refreshCounts } = useProject()
    const keys = useKeys(selectedProjectId ?? 0, true)
    const [adding, setAdding] = useState(false)
    const [pending, setPending] = useState<string | null>(null)

    const toggle = async (accessKeyId: string, perm: Perm, value: boolean) => {
        setPending(`${accessKeyId}:${perm}`)
        try {
            const body = { bucketId: info.id, accessKeyId, permissions: { [perm]: true } }
            if (value) await AllowBucketKey(body)
            else await DenyBucketKey(body)
            await onChange()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setPending(null)
        }
    }

    const revokeAll = async (accessKeyId: string) => {
        setPending(`${accessKeyId}:all`)
        try {
            await DenyBucketKey({ bucketId: info.id, accessKeyId, permissions: { read: true, write: true, owner: true } })
            await onChange()
            refreshCounts()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setPending(null)
        }
    }

    const present = new Set(info.keys.map((key) => key.accessKeyId))
    return (
        <Section
            id="access"
            title={t("bucketSettings.access")}
            description={t("bucketSettings.accessHelp")}
            actions={
                <Button startIcon={<Plus />} onClick={() => setAdding(true)}>
                    {t("bucketSettings.addKey")}
                </Button>
            }
        >
            {info.keys.length === 0 ? (
                <EmptyBlock title={t("bucketSettings.noKeys")} description={t("bucketSettings.noKeysHint")} sx={{ py: 3 }} />
            ) : (
                <TableWrap minWidth={520}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{t("access.key")}</TableCell>
                                <TableCell align="center">{t("access.read")}</TableCell>
                                <TableCell align="center">{t("access.write")}</TableCell>
                                <TableCell align="center">{t("access.owner")}</TableCell>
                                <TableCell />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {info.keys.map((key) => (
                                <TableRow key={key.accessKeyId}>
                                    <TableCell>
                                        <Box sx={{ fontWeight: 500 }}>{key.name || t("keys.unnamed")}</Box>
                                        <Mono sx={{ color: k.label, fontSize: 11.5 }}>{shortId(key.accessKeyId, 12, 0)}</Mono>
                                    </TableCell>
                                    {(["read", "write", "owner"] as Perm[]).map((perm) => (
                                        <TableCell key={perm} align="center">
                                            <Checkbox
                                                checked={Boolean(key.permissions[perm])}
                                                disabled={pending !== null}
                                                onChange={(e) => toggle(key.accessKeyId, perm, e.target.checked)}
                                                slotProps={{ input: { "aria-label": `${t(`access.${perm}`)} · ${key.name || key.accessKeyId}` } }}
                                            />
                                        </TableCell>
                                    ))}
                                    <TableCell align="right">
                                        <IconButton size="small" aria-label={t("bucketSettings.revoke")} onClick={() => revokeAll(key.accessKeyId)} disabled={pending !== null}>
                                            <X />
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableWrap>
            )}
            <GrantDialog
                open={adding}
                onClose={() => setAdding(false)}
                title={t("bucketSettings.addKey")}
                pickLabel={t("access.key")}
                options={(keys.data ?? []).filter((key) => !present.has(key.id)).map((key) => ({ id: key.id, label: key.name || key.id }))}
                onSubmit={async (grant) => {
                    try {
                        await AllowBucketKey({ bucketId: info.id, accessKeyId: grant.targetId, permissions: { read: grant.read, write: grant.write, owner: grant.owner } })
                        await onChange()
                        refreshCounts()
                    } catch (error) {
                        notify({ severity: "error", message: toErrorMessage(error) })
                        throw error
                    }
                }}
            />
        </Section>
    )
}

function Chip({ label, onRemove, removeLabel }: { label: ReactNode; onRemove?: () => void; removeLabel: string }) {
    return (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.75, minHeight: 32, pl: "10px", pr: onRemove ? "4px" : "10px", borderRadius: "8px", bgcolor: k.active, fontFamily: "inherit" }}>
            {label}
            {onRemove && (
                <IconButton size="small" onClick={onRemove} aria-label={removeLabel} sx={{ width: 28, height: 28, "& svg": { width: 14, height: 14 } }}>
                    <X />
                </IconButton>
            )}
        </Box>
    )
}

function AliasSection({ info, onChange }: { info: BucketInfo; onChange: () => Promise<void> }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const [globalAlias, setGlobalAlias] = useState("")
    const [localKey, setLocalKey] = useState("")
    const [localAlias, setLocalAlias] = useState("")
    const [busy, setBusy] = useState(false)

    const run = async (action: () => Promise<unknown>, done?: () => void) => {
        setBusy(true)
        try {
            await action()
            await onChange()
            done?.()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    const locals = info.keys.flatMap((key) => key.bucketLocalAliases.map((alias) => ({ alias, key })))
    const canRemoveGlobal = info.globalAliases.length + locals.length > 1

    return (
        <Section id="aliases" title={t("bucketSettings.aliases")} description={t("bucketSettings.aliasesHelp")}>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Muted small>{t("bucketSettings.global")}</Muted>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    {info.globalAliases.length === 0 && <Muted>{t("bucketSettings.noGlobal")}</Muted>}
                    {info.globalAliases.map((alias) => (
                        <Chip
                            key={alias}
                            label={<Mono>{alias}</Mono>}
                            removeLabel={t("bucketSettings.removeAlias", { alias })}
                            onRemove={canRemoveGlobal && !busy ? () => run(() => RemoveBucketAlias({ bucketId: info.id, globalAlias: alias })) : undefined}
                        />
                    ))}
                </Box>
                <Box
                    component="form"
                    onSubmit={(e) => {
                        e.preventDefault()
                        if (globalAlias.trim()) void run(() => AddBucketAlias({ bucketId: info.id, globalAlias: globalAlias.trim() }), () => setGlobalAlias(""))
                    }}
                    sx={{ display: "flex", gap: 1, maxWidth: 480 }}
                >
                    <TextInput value={globalAlias} onChange={(e) => setGlobalAlias(e.target.value.toLowerCase())} placeholder={t("bucketSettings.newGlobal")} mono inputProps={{ "aria-label": t("bucketSettings.newGlobal") }} />
                    <Button type="submit" disabled={busy || !globalAlias.trim()}>
                        {t("ui.add")}
                    </Button>
                </Box>
            </Box>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Muted small>{t("bucketSettings.local")}</Muted>
                <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    {locals.length === 0 && <Muted>{t("bucketSettings.noLocal")}</Muted>}
                    {locals.map(({ alias, key }) => (
                        <Chip
                            key={`${key.accessKeyId}:${alias}`}
                            label={
                                <span>
                                    <Mono>{alias}</Mono> <Muted small>{t("bucketSettings.via", { key: key.name || shortId(key.accessKeyId) })}</Muted>
                                </span>
                            }
                            removeLabel={t("bucketSettings.removeAlias", { alias })}
                            onRemove={!busy && (info.globalAliases.length > 0 || locals.length > 1) ? () => run(() => RemoveBucketAlias({ bucketId: info.id, localAlias: alias, accessKeyId: key.accessKeyId })) : undefined}
                        />
                    ))}
                </Box>
                {info.keys.length > 0 && (
                    <Box
                        component="form"
                        onSubmit={(e) => {
                            e.preventDefault()
                            if (localAlias.trim() && localKey)
                                void run(
                                    () => AddBucketAlias({ bucketId: info.id, localAlias: localAlias.trim(), accessKeyId: localKey }),
                                    () => setLocalAlias(""),
                                )
                        }}
                        sx={{ display: "flex", gap: 1, flexWrap: "wrap", maxWidth: 640 }}
                    >
                        <Select value={localKey} onChange={(e) => setLocalKey(e.target.value)} displayEmpty sx={{ minWidth: 180 }} inputProps={{ "aria-label": t("access.key") }}>
                            <MenuItem value="" disabled>
                                {t("access.key")}
                            </MenuItem>
                            {info.keys.map((key) => (
                                <MenuItem key={key.accessKeyId} value={key.accessKeyId}>
                                    {key.name || key.accessKeyId}
                                </MenuItem>
                            ))}
                        </Select>
                        <Box sx={{ flex: "1 1 180px" }}>
                            <TextInput value={localAlias} onChange={(e) => setLocalAlias(e.target.value.toLowerCase())} placeholder={t("bucketSettings.newLocal")} mono inputProps={{ "aria-label": t("bucketSettings.newLocal") }} />
                        </Box>
                        <Button type="submit" disabled={busy || !localAlias.trim() || !localKey}>
                            {t("ui.add")}
                        </Button>
                    </Box>
                )}
            </Box>
        </Section>
    )
}

function QuotaSection({ info, onChange }: { info: BucketInfo; onChange: () => Promise<void> }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const units = byteUnits()
    const initial = splitSize(info.quotas.maxSize)
    const [size, setSize] = useState(initial.value)
    const [power, setPower] = useState(initial.power)
    const [objects, setObjects] = useState(info.quotas.maxObjects ? String(info.quotas.maxObjects) : "")
    const [busy, setBusy] = useState(false)

    const reset = () => {
        const s = splitSize(info.quotas.maxSize)
        setSize(s.value)
        setPower(s.power)
        setObjects(info.quotas.maxObjects ? String(info.quotas.maxObjects) : "")
    }
    useEffect(reset, [info.quotas.maxSize, info.quotas.maxObjects])

    const maxSize = size.trim() ? Math.round(Number(size.replace(",", ".")) * 1000 ** power) : null
    const maxObjects = objects.trim() ? Number(objects) : null
    const invalid = (maxSize !== null && (!Number.isFinite(maxSize) || maxSize <= 0)) || (maxObjects !== null && (!Number.isInteger(maxObjects) || maxObjects <= 0))
    const dirty = maxSize !== (info.quotas.maxSize ?? null) || maxObjects !== (info.quotas.maxObjects ?? null)
    const percent = info.quotas.maxSize ? (info.bytes / info.quotas.maxSize) * 100 : null

    const save = async () => {
        setBusy(true)
        try {
            await UpdateBucket({ id: info.id }, { quotas: { maxSize, maxObjects } })
            await onChange()
            notify({ severity: "success", message: t("bucketSettings.quotasSaved") })
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    return (
        <Section id="quotas" title={t("bucketSettings.quotas")} description={t("bucketSettings.quotasHelp")}>
            {percent !== null && (
                <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
                    <Box sx={{ fontWeight: 500 }}>{t("bucketSettings.percentUsed", { percent: Math.round(percent) })}</Box>
                    <Bar value={percent} height={8} />
                </Box>
            )}
            <Muted small>
                {t("bucketSettings.quotaUsage", {
                    used: formatBytes(info.bytes),
                    max: info.quotas.maxSize ? formatBytes(info.quotas.maxSize) : t("bucketSettings.unlimited"),
                    objects: formatCount(info.objects),
                    maxObjects: info.quotas.maxObjects ? formatCount(info.quotas.maxObjects) : t("bucketSettings.unlimited"),
                })}
            </Muted>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", "& > *": { flex: "1 1 220px" } }}>
                <Field label={t("bucketSettings.maxSize")} htmlFor="quota-size">
                    <Box sx={{ display: "flex", gap: 1 }}>
                        <TextInput id="quota-size" value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" placeholder={t("bucketSettings.unlimited")} />
                        <Select value={power} onChange={(e) => setPower(Number(e.target.value))} sx={{ minWidth: 80 }} inputProps={{ "aria-label": t("bucketSettings.unit") }}>
                            {UNIT_POWERS.map((p) => (
                                <MenuItem key={p} value={p}>
                                    {units[p]}
                                </MenuItem>
                            ))}
                        </Select>
                    </Box>
                </Field>
                <TextField label={t("bucketSettings.maxObjects")} value={objects} onChange={(e) => setObjects(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder={t("bucketSettings.unlimited")} />
            </Box>
            <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
                <Button onClick={reset} disabled={!dirty || busy}>
                    {t("ui.cancel")}
                </Button>
                <Button variant="contained" onClick={save} disabled={!dirty || invalid || busy}>
                    {t("bucketSettings.saveQuotas")}
                </Button>
            </Box>
        </Section>
    )
}

function WebsiteSection({ info, onChange }: { info: BucketInfo; onChange: () => Promise<void> }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const [enabled, setEnabled] = useState(info.websiteAccess)
    const [index, setIndex] = useState(info.websiteConfig?.indexDocument ?? "index.html")
    const [error, setError] = useState(info.websiteConfig?.errorDocument ?? "")
    const [busy, setBusy] = useState(false)
    useEffect(() => {
        setEnabled(info.websiteAccess)
        setIndex(info.websiteConfig?.indexDocument ?? "index.html")
        setError(info.websiteConfig?.errorDocument ?? "")
    }, [info.websiteAccess, info.websiteConfig])

    const dirty = enabled !== info.websiteAccess || (enabled && (index !== (info.websiteConfig?.indexDocument ?? "index.html") || error !== (info.websiteConfig?.errorDocument ?? "")))
    const save = async () => {
        setBusy(true)
        try {
            await UpdateBucket({ id: info.id }, { websiteAccess: enabled ? { enabled: true, indexDocument: index || "index.html", errorDocument: error || null } : { enabled: false } })
            await onChange()
            notify({ severity: "success", message: enabled ? t("bucketSettings.websiteEnabled") : t("bucketSettings.websiteDisabled") })
        } catch (e) {
            notify({ severity: "error", message: toErrorMessage(e) })
        } finally {
            setBusy(false)
        }
    }

    return (
        <Section id="website" title={t("bucketSettings.website")} description={t("bucketSettings.websiteHelp")}>
            <Toggle checked={enabled} onChange={setEnabled} label={enabled ? t("bucketSettings.websiteOn") : t("bucketSettings.websiteOff")} />
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", "& > *": { flex: "1 1 220px" } }}>
                <TextField label={t("bucketSettings.indexDocument")} value={index} onChange={(e) => setIndex(e.target.value)} disabled={!enabled} mono />
                <TextField label={t("bucketSettings.errorDocument")} value={error} onChange={(e) => setError(e.target.value)} disabled={!enabled} mono optional placeholder="404.html" />
            </Box>
            <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                <Button variant="contained" onClick={save} disabled={!dirty || busy}>
                    {t("ui.save")}
                </Button>
            </Box>
        </Section>
    )
}

function DeleteSection({ info, name }: { info: BucketInfo; name: string }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const { refreshCounts } = useProject()
    const navigate = useNavigate()
    const [open, setOpen] = useState(false)
    const [busy, setBusy] = useState(false)
    const notEmpty = info.objects > 0

    const remove = async () => {
        setBusy(true)
        try {
            await DeleteBucket({ id: info.id })
            refreshCounts()
            notify({ severity: "success", message: t("buckets.deleted", { count: 1 }) })
            navigate("/buckets")
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
            setBusy(false)
        }
    }

    return (
        <Section id="delete" danger title={t("bucketSettings.deleteTitle")} description={notEmpty ? t("bucketSettings.deleteNotEmpty", { count: info.objects }) : t("bucketSettings.deleteHelp")}>
            <Box>
                <Button color="error" disabled={notEmpty} onClick={() => setOpen(true)}>
                    {t("bucketSettings.deleteButton")}
                </Button>
            </Box>
            <ConfirmDialog
                open={open}
                onClose={() => setOpen(false)}
                title={t("buckets.deleteOne", { name })}
                message={t("buckets.deleteMessage")}
                confirmLabel={t("bucketSettings.deleteButton")}
                confirmText={name}
                onConfirm={remove}
                busy={busy}
            />
        </Section>
    )
}

export default function BucketSettings({ info, name, onChange }: { info: BucketInfo; name: string; onChange: () => Promise<void> }) {
    const { t } = useTranslation()
    const wide = useMediaQuery("(min-width:1100px)")
    return (
        <Box sx={{ display: "flex", gap: 3, alignItems: "flex-start" }}>
            {wide && (
                <Box component="nav" aria-label={t("bucketSettings.sections")} sx={{ width: 180, flex: "none", position: "sticky", top: 16, display: "flex", flexDirection: "column", gap: 0.25 }}>
                    {SECTIONS.map((id) => (
                        <Box
                            key={id}
                            component="a"
                            href={`#${id}`}
                            sx={{ display: "flex", alignItems: "center", minHeight: 36, px: "12px", borderRadius: "7px", color: id === "delete" ? k.err : k.nav, textDecoration: "none", "&:hover": { bgcolor: k.hover, color: id === "delete" ? k.err : k.text } }}
                        >
                            {t(`bucketSettings.nav.${id}`)}
                        </Box>
                    ))}
                </Box>
            )}
            <Box sx={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 2.5 }}>
                <AccessSection info={info} onChange={onChange} />
                <AliasSection info={info} onChange={onChange} />
                <QuotaSection info={info} onChange={onChange} />
                <WebsiteSection info={info} onChange={onChange} />
                <DeleteSection info={info} name={name} />
            </Box>
        </Box>
    )
}
