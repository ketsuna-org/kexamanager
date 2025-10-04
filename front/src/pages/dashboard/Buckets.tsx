import { useState, useEffect, useCallback } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Tooltip from "@mui/material/Tooltip"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import TextField from "@mui/material/TextField"
import Switch from "@mui/material/Switch"
import Divider from "@mui/material/Divider"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import CircularProgress from "@mui/material/CircularProgress"
import Autocomplete from "@mui/material/Autocomplete"
import Chip from "@mui/material/Chip"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import { useTheme } from "@mui/material/styles"
import useMediaQuery from "@mui/material/useMediaQuery"
import { ListBuckets, CreateBucket, DeleteBucket, GetBucketInfo, AddBucketAlias, RemoveBucketAlias, UpdateBucket, ListKeys, AllowBucketKey, DenyBucketKey } from "../../utils/apiWrapper"
import type { components } from "../../types/openapi"

type Bucket = components["schemas"]["ListBucketsResponseItem"]

const sizeUnits = [
  { label: 'Octet', value: 'B', multiplier: 1 },
  { label: 'Ko', value: 'KB', multiplier: 1024 },
  { label: 'Mo', value: 'MB', multiplier: 1024 ** 2 },
  { label: 'Go', value: 'GB', multiplier: 1024 ** 3 },
]

interface BucketsProps {
    selectedProject: { id: number; name: string } | null
}

export default function Buckets({ selectedProject }: BucketsProps) {
    const { t } = useTranslation()
    const [selectedConfigId, setSelectedConfigId] = useState<number | null>(selectedProject?.id || null)

    // Update selectedConfigId when selectedProject changes
    useEffect(() => {
        setSelectedConfigId(selectedProject?.id || null)
    }, [selectedProject])
    const [buckets, setBuckets] = useState<Bucket[]>([])
    const [open, setOpen] = useState(false)
    const [loading, setLoading] = useState(true)
    const [submitting, setSubmitting] = useState(false)
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [toDeleteId, setToDeleteId] = useState<string | null>(null)
    // detailsOpen not needed: we use selectedBucket to control details dialog
    const [selectedBucket, setSelectedBucket] = useState<components["schemas"]["GetBucketInfoResponse"] | null>(null)
    const [editing, setEditing] = useState(false)
    const [savingDetails, setSavingDetails] = useState(false)
    const [detailsForm, setDetailsForm] = useState<{
        quotasMaxSize: string
        quotasMaxObjects: string
        websiteEnabled: boolean
        websiteIndex: string
        websiteError: string
        quotasMaxSizeUnit: string
    }>({ quotasMaxSize: "", quotasMaxObjects: "", websiteEnabled: false, websiteIndex: "", websiteError: "", quotasMaxSizeUnit: "MB" })
    const [allKeys, setAllKeys] = useState<components["schemas"]["ListKeysResponseItem"][]>([])
    const [selectedKeyIds, setSelectedKeyIds] = useState<string[]>([])
    const [aliasInput, setAliasInput] = useState("")
    const [removeAliasConfirmOpen, setRemoveAliasConfirmOpen] = useState(false)
    const [aliasToRemove, setAliasToRemove] = useState<{ kind: "global" | "local"; value: string; accessKeyId?: string } | null>(null)
    const [form, setForm] = useState<{
        globalAlias: string
        localAlias: string
        localAccessKeyId: string
        quotasMaxSize: string
        quotasMaxObjects: string
        websiteEnabled: boolean
        websiteIndex: string
        websiteError: string
        quotasMaxSizeUnit: string
    }>({
        globalAlias: "",
        localAlias: "",
        localAccessKeyId: "",
        quotasMaxSize: "",
        quotasMaxObjects: "",
        websiteEnabled: false,
        websiteIndex: "",
        websiteError: "",
        quotasMaxSizeUnit: "MB",
    })

    // theme / media query to make details dialog full screen on small devices
    const theme = useTheme()
    const isSmall = useMediaQuery(theme.breakpoints.down("sm"))

    function getBestUnit(bytes: number): { value: string, display: number } {
        if (bytes === 0) return { value: 'MB', display: 0 }
        const units = ['B', 'KB', 'MB', 'GB']
        const multipliers = [1, 1024, 1024 ** 2, 1024 ** 3]
        for (let i = units.length - 1; i >= 0; i--) {
            if (bytes >= multipliers[i]) {
                return { value: units[i], display: Math.round((bytes / multipliers[i]) * 100) / 100 } // round to 2 decimals
            }
        }
        return { value: 'B', display: bytes }
    }

    function openModal() {
        setForm({ globalAlias: "", localAlias: "", localAccessKeyId: "", quotasMaxSize: "", quotasMaxObjects: "", websiteEnabled: false, websiteIndex: "", websiteError: "", quotasMaxSizeUnit: "MB" })
        setOpen(true)
    }
    function closeModal() {
        setOpen(false)
    }

    async function submit() {
        // Build CreateBucket payload using typed shapes
        const createReq: components["schemas"]["CreateBucketRequest"] = {}
        if (form.globalAlias) createReq.globalAlias = form.globalAlias
        if (form.localAlias) createReq.localAlias = { alias: form.localAlias, accessKeyId: form.localAccessKeyId || "" }

        setSubmitting(true)
        try {
            const created = await CreateBucket(createReq)
            const bucketId = created?.id

            const updateBody: components["schemas"]["UpdateBucketRequestBody"] = {}
            const quotas: components["schemas"]["ApiBucketQuotas"] = {}
            const unitMultiplier = sizeUnits.find(u => u.value === form.quotasMaxSizeUnit)?.multiplier || 1
            const maxSizeBytes = Number(form.quotasMaxSize) * unitMultiplier
            if (maxSizeBytes > 0) quotas.maxSize = maxSizeBytes
            if (form.quotasMaxObjects) quotas.maxObjects = Number(form.quotasMaxObjects)
            if (quotas.maxSize !== undefined || quotas.maxObjects !== undefined) updateBody.quotas = quotas
            if (form.websiteEnabled) updateBody.websiteAccess = { enabled: true, indexDocument: form.websiteIndex || undefined, errorDocument: form.websiteError || undefined }

            if (bucketId && (updateBody.quotas || updateBody.websiteAccess)) {
                await UpdateBucket({ id: bucketId }, updateBody)
            }

            await fetchBuckets()
            setOpen(false)
        } catch {
            // ignore for now
        } finally {
            setSubmitting(false)
        }
    }

    const fetchBuckets = useCallback(async () => {
        if (!selectedConfigId) return
        setLoading(true)
        try {
            const res = await ListBuckets(selectedConfigId)
            if (Array.isArray(res)) setBuckets(res as Bucket[])
            else setBuckets([])
        } catch {
            setBuckets([])
        } finally {
            setLoading(false)
        }
    }, [selectedConfigId])

    async function fetchKeysList() {
        try {
            const res = await ListKeys()
            if (Array.isArray(res)) setAllKeys(res)
            else setAllKeys([])
        } catch {
            setAllKeys([])
        } finally {
            // done
        }
    }

    useEffect(() => {
        fetchBuckets()
    }, [fetchBuckets])

    function confirmDelete(id: string) {
        setToDeleteId(id)
        setDeleteDialogOpen(true)
    }

    async function doDelete() {
        if (!toDeleteId) return
        try {
            await DeleteBucket({ id: toDeleteId })
            await fetchBuckets()
        } catch {
            // ignore for now
        } finally {
            setDeleteDialogOpen(false)
            setToDeleteId(null)
        }
    }

    async function openDetails(id: string) {
        try {
            const res = await GetBucketInfo({ id })
            setSelectedBucket(res)
            // populate details form from response
            setEditing(false)
            const maxSize = res?.quotas?.maxSize || 0
            const { value: unit, display: size } = getBestUnit(maxSize)
            setDetailsForm({
                quotasMaxSize: size.toString(),
                quotasMaxSizeUnit: unit,
                quotasMaxObjects: res?.quotas?.maxObjects !== undefined ? String(res.quotas.maxObjects) : "",
                websiteEnabled: !!res?.websiteAccess,
                websiteIndex: res?.websiteConfig?.indexDocument || "",
                websiteError: res?.websiteConfig?.errorDocument || "",
            })
            // selected keys
            setSelectedKeyIds(res?.keys?.map((k) => k.accessKeyId) ?? [])
            // fetch available keys for selector
            fetchKeysList()
        } catch {
            setSelectedBucket(null)
        }
    }

    async function saveDetails() {
        if (!selectedBucket) return
        setSavingDetails(true)
        try {
            const updateBody: components["schemas"]["UpdateBucketRequestBody"] = {}
            const quotas: components["schemas"]["ApiBucketQuotas"] = {}
            const unitMultiplier = sizeUnits.find(u => u.value === detailsForm.quotasMaxSizeUnit)?.multiplier || 1
            const maxSizeBytes = Number(detailsForm.quotasMaxSize) * unitMultiplier
            if (maxSizeBytes > 0) quotas.maxSize = maxSizeBytes
            if (detailsForm.quotasMaxObjects) quotas.maxObjects = Number(detailsForm.quotasMaxObjects)
            if (quotas.maxSize !== undefined || quotas.maxObjects !== undefined) updateBody.quotas = quotas

            if (detailsForm.websiteEnabled) updateBody.websiteAccess = { enabled: true, indexDocument: detailsForm.websiteIndex || undefined, errorDocument: detailsForm.websiteError || undefined }
            else updateBody.websiteAccess = { enabled: false }

            await UpdateBucket({ id: selectedBucket.id }, updateBody)
            // handle key assignments: compute diffs and call Allow/Deny
            const currentKeyIds = selectedBucket.keys?.map((k) => k.accessKeyId) ?? []
            const toAdd = selectedKeyIds.filter((id) => !currentKeyIds.includes(id))
            const toRemove = currentKeyIds.filter((id) => !selectedKeyIds.includes(id))
            // grant full perms when adding, and revoke when removing
            await Promise.all([
                ...toAdd.map((id) => AllowBucketKey({ accessKeyId: id, bucketId: selectedBucket.id, permissions: { owner: true, read: true, write: true } })),
                ...toRemove.map((id) => DenyBucketKey({ accessKeyId: id, bucketId: selectedBucket.id, permissions: { owner: true, read: true, write: true } })),
            ])
            // refresh
            const refreshed = await GetBucketInfo({ id: selectedBucket.id })
            setSelectedBucket(refreshed)
            await fetchBuckets()
            setEditing(false)
        } catch {
            // ignore errors for now
        } finally {
            setSavingDetails(false)
        }
    }

    async function doAddAlias() {
        if (!selectedBucket || !aliasInput) return
        try {
            await AddBucketAlias({ bucketId: selectedBucket.id, globalAlias: aliasInput })
            // refresh details and list
            const refreshed = await GetBucketInfo({ id: selectedBucket.id })
            setSelectedBucket(refreshed)
            await fetchBuckets()
            setAliasInput("")
        } catch {
            // ignore
        }
    }

    function requestRemoveAlias(kind: "global" | "local", value: string, accessKeyId?: string) {
        setAliasToRemove({ kind, value, accessKeyId })
        setRemoveAliasConfirmOpen(true)
    }

    async function doRemoveAlias() {
        if (!selectedBucket || !aliasToRemove) return
        try {
            if (aliasToRemove.kind === "global") {
                await RemoveBucketAlias({ bucketId: selectedBucket.id, globalAlias: aliasToRemove.value })
            } else {
                await RemoveBucketAlias({ bucketId: selectedBucket.id, accessKeyId: aliasToRemove.accessKeyId!, localAlias: aliasToRemove.value })
            }
            const refreshed = await GetBucketInfo({ id: selectedBucket.id })
            setSelectedBucket(refreshed)
            await fetchBuckets()
        } catch {
            // ignore
        } finally {
            setRemoveAliasConfirmOpen(false)
            setAliasToRemove(null)
        }
    }

    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Box sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                justifyContent: "space-between",
                alignItems: { xs: "stretch", sm: "center" },
                gap: 2,
                mb: 2
            }}>
                <Stack sx={{ flex: 1 }}>
                    <Typography variant="h6">{t("dashboard.buckets")}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t("dashboard.buckets_desc")}
                    </Typography>
                </Stack>
                <Button
                    variant="contained"
                    onClick={openModal}
                    sx={{ whiteSpace: "nowrap" }}
                >
                    {t("dashboard.buckets_add")}
                </Button>
            </Box>

            <Box sx={{ mb: 2 }}>
                <Typography variant="h6">
                    {selectedProject ? `Project: ${selectedProject.name}` : 'No project selected'}
                </Typography>
            </Box>

            <TableContainer component={Paper} sx={{ flex: 1, overflow: "auto" }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ minWidth: { xs: 120, sm: 150 } }}>{t("buckets.col.id")}</TableCell>
                            <TableCell sx={{ minWidth: { xs: 100, sm: 120 } }}>{t("buckets.col.aliases")}</TableCell>
                            <TableCell sx={{ minWidth: { xs: 120, sm: 150 } }}>{t("buckets.col.creationDate")}</TableCell>
                            <TableCell sx={{ minWidth: { xs: 100, sm: 120 } }}>{t("buckets.actions")}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={4} sx={{ textAlign: "center" }}>
                                    <CircularProgress size={20} /> {t("buckets.loading")}
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && buckets.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} sx={{ textAlign: "center" }}>
                                    {t("buckets.empty")}
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading &&
                            buckets.map((b) => (
                                <TableRow key={b.id} hover>
                                    <TableCell>
                                        <Tooltip title={b.id}>
                                            <Box sx={{
                                                maxWidth: { xs: 120, sm: 200 },
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                                fontSize: { xs: "0.75rem", sm: "0.875rem" }
                                            }}>
                                                {b.id}
                                            </Box>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell sx={{
                                        maxWidth: { xs: 100, sm: 150 },
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap"
                                    }}>
                                        <Tooltip title={[...(b.globalAliases ?? []), ...(b.localAliases?.map((a) => a.alias) ?? [])].join(", ")}>
                                            <span>{[...(b.globalAliases ?? []), ...(b.localAliases?.map((a) => a.alias) ?? [])].join(", ") || "-"}</span>
                                        </Tooltip>
                                    </TableCell>
                                    <TableCell sx={{
                                        fontSize: { xs: "0.75rem", sm: "0.875rem" },
                                        whiteSpace: "nowrap"
                                    }}>
                                        {b.created ? new Date(b.created).toLocaleString() : ""}
                                    </TableCell>
                                    <TableCell>
                                        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
                                            <Button size="small" onClick={() => openDetails(b.id)}>
                                                {t("common.details")}
                                            </Button>
                                            <Button
                                                size="small"
                                                color="error"
                                                onClick={() => confirmDelete(b.id)}
                                            >
                                                {t("buckets.actions_delete")}
                                            </Button>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={open} onClose={closeModal} fullWidth maxWidth="sm">
                <DialogTitle>{t("buckets.modal.title")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField
                            autoFocus
                            margin="dense"
                            label={t("buckets.form.globalAlias")}
                            type="text"
                            fullWidth
                            value={form.globalAlias}
                            onChange={(e) => setForm((f) => ({ ...f, globalAlias: e.target.value }))}
                        />
                        <Stack direction="row" spacing={1} alignItems="center">
                            <TextField
                                margin="dense"
                                label={t("buckets.form.localAlias")}
                                type="text"
                                fullWidth
                                value={form.localAlias}
                                onChange={(e) => setForm((f) => ({ ...f, localAlias: e.target.value }))}
                            />
                            <TextField
                                margin="dense"
                                label={t("buckets.form.localAccessKeyId")}
                                type="text"
                                sx={{ minWidth: 200 }}
                                value={form.localAccessKeyId}
                                onChange={(e) => setForm((f) => ({ ...f, localAccessKeyId: e.target.value }))}
                            />
                        </Stack>

                        <Stack direction="row" spacing={1} alignItems="center">
                            <TextField
                                margin="dense"
                                label={t("buckets.form.quotas.maxSize")}
                                type="number"
                                value={form.quotasMaxSize}
                                onChange={(e) => setForm((f) => ({ ...f, quotasMaxSize: e.target.value }))}
                            />
                            <Select
                                size="small"
                                value={form.quotasMaxSizeUnit}
                                onChange={(e) => setForm((f) => ({ ...f, quotasMaxSizeUnit: e.target.value }))}
                            >
                                {sizeUnits.map(u => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
                            </Select>
                            <TextField
                                margin="dense"
                                label={t("buckets.form.quotas.maxObjects")}
                                type="number"
                                value={form.quotasMaxObjects}
                                onChange={(e) => setForm((f) => ({ ...f, quotasMaxObjects: e.target.value }))}
                            />
                        </Stack>

                        <Stack direction="row" spacing={1} alignItems="center">
                            <label>
                                <input type="checkbox" checked={form.websiteEnabled} onChange={(e) => setForm((f) => ({ ...f, websiteEnabled: e.target.checked }))} />{" "}
                                {t("buckets.form.website.enabled")}
                            </label>
                        </Stack>
                        {form.websiteEnabled && (
                            <Stack>
                                <TextField
                                    margin="dense"
                                    label={t("buckets.form.website.indexDocument")}
                                    value={form.websiteIndex}
                                    onChange={(e) => setForm((f) => ({ ...f, websiteIndex: e.target.value }))}
                                />
                                <TextField
                                    margin="dense"
                                    label={t("buckets.form.website.errorDocument")}
                                    value={form.websiteError}
                                    onChange={(e) => setForm((f) => ({ ...f, websiteError: e.target.value }))}
                                />
                            </Stack>
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeModal}>{t("common.cancel")}</Button>
                    <Button variant="contained" onClick={submit} disabled={submitting}>
                        {t("common.add")}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog
                open={!!selectedBucket}
                onClose={() => {
                    setSelectedBucket(null)
                    setEditing(false)
                }}
                fullWidth
                maxWidth="lg"
                fullScreen={isSmall}
            >
                <DialogTitle>{t("buckets.details_title")}</DialogTitle>
                <DialogContent>
                    {selectedBucket ? (
                        <Box sx={{ mt: 1 }}>
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Box>
                                    <Typography variant="subtitle2">
                                        {t("buckets.col.id")}: <code>{selectedBucket.id}</code>
                                    </Typography>
                                    <Typography variant="body2">
                                        {t("buckets.col.creationDate")}: {selectedBucket.created ? new Date(selectedBucket.created).toLocaleString() : ""}
                                    </Typography>
                                </Box>
                                <Box>
                                    <Typography variant="caption" color="text.secondary">
                                        {t("buckets.col.arn")}: {selectedBucket.id}
                                    </Typography>
                                </Box>
                            </Stack>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.stats_title")}</Typography>
                            <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                                <Typography variant="body2">
                                    {t("buckets.stats.objects")}: {selectedBucket.objects}
                                </Typography>
                                <Typography variant="body2">
                                    {t("buckets.stats.bytes")}: {selectedBucket.bytes}
                                </Typography>
                                <Typography variant="body2">
                                    {t("buckets.stats.unfinishedUploads")}: {selectedBucket.unfinishedUploads}
                                </Typography>
                            </Stack>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.col.aliases")}</Typography>
                            <Stack spacing={1} sx={{ mt: 1 }}>
                                {selectedBucket.globalAliases &&
                                    selectedBucket.globalAliases.map((a) => (
                                        <Box key={a} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                            <Typography>{a}</Typography>
                                            <Button size="small" color="error" onClick={() => requestRemoveAlias("global", a)}>
                                                {t("buckets.actions_delete")}
                                            </Button>
                                        </Box>
                                    ))}
                                {selectedBucket.keys &&
                                    selectedBucket.keys
                                        .flatMap((k) => (k.bucketLocalAliases ?? []).map((a) => ({ alias: a, accessKeyId: k.accessKeyId })))
                                        .map((l) => (
                                            <Box key={`${l.alias}-${l.accessKeyId}`} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                <Typography>
                                                    {l.alias} ({l.accessKeyId})
                                                </Typography>
                                                <Button size="small" color="error" onClick={() => requestRemoveAlias("local", l.alias, l.accessKeyId)}>
                                                    {t("buckets.actions_delete")}
                                                </Button>
                                            </Box>
                                        ))}
                            </Stack>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.details.keys")}</Typography>
                            <Box sx={{ mt: 1 }}>
                                <Autocomplete
                                    multiple
                                    options={allKeys}
                                    getOptionLabel={(opt) => `${opt.id} ${opt.name ? `(${opt.name})` : ""}`}
                                    value={allKeys.filter((k) => selectedKeyIds.includes(k.id))}
                                    onChange={(_, value) => setSelectedKeyIds(value.map((v) => v.id))}
                                    renderTags={(value: components["schemas"]["ListKeysResponseItem"][], getTagProps) =>
                                        value.map((option, index) => {
                                            const tagProps = getTagProps({ index }) as { key: string | number } & Record<string, unknown>
                                            const { key, ...rest } = tagProps
                                            return <Chip key={String(key)} variant="outlined" label={`${option.id}`} {...rest} />
                                        })
                                    }
                                    renderInput={(params) => <TextField {...params} size="small" label={t("buckets.details.assign_keys")} />}
                                />
                            </Box>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.details.quotas")}</Typography>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                                <TextField
                                    size="small"
                                    label={t("buckets.form.quotas.maxSize")}
                                    type="number"
                                    value={detailsForm.quotasMaxSize}
                                    onChange={(e) => setDetailsForm((f) => ({ ...f, quotasMaxSize: e.target.value }))}
                                    disabled={!editing}
                                />
                                <Select
                                    size="small"
                                    value={detailsForm.quotasMaxSizeUnit}
                                    onChange={(e) => setDetailsForm((f) => ({ ...f, quotasMaxSizeUnit: e.target.value }))}
                                    disabled={!editing}
                                >
                                    {sizeUnits.map(u => <MenuItem key={u.value} value={u.value}>{u.label}</MenuItem>)}
                                </Select>
                                <TextField
                                    size="small"
                                    label={t("buckets.form.quotas.maxObjects")}
                                    type="number"
                                    value={detailsForm.quotasMaxObjects}
                                    onChange={(e) => setDetailsForm((f) => ({ ...f, quotasMaxObjects: e.target.value }))}
                                    disabled={!editing}
                                />
                            </Stack>

                            <Divider sx={{ my: 2 }} />

                            <Typography variant="subtitle2">{t("buckets.details.website")}</Typography>
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1 }}>
                                <Typography variant="body2">{t("buckets.form.website.enabled")}</Typography>
                                <Switch checked={detailsForm.websiteEnabled} onChange={(e) => setDetailsForm((f) => ({ ...f, websiteEnabled: e.target.checked }))} disabled={!editing} />
                            </Stack>
                            {detailsForm.websiteEnabled && (
                                <Stack sx={{ mt: 1 }} spacing={1}>
                                    <TextField
                                        size="small"
                                        label={t("buckets.form.website.indexDocument")}
                                        value={detailsForm.websiteIndex}
                                        onChange={(e) => setDetailsForm((f) => ({ ...f, websiteIndex: e.target.value }))}
                                        disabled={!editing}
                                    />
                                    <TextField
                                        size="small"
                                        label={t("buckets.form.website.errorDocument")}
                                        value={detailsForm.websiteError}
                                        onChange={(e) => setDetailsForm((f) => ({ ...f, websiteError: e.target.value }))}
                                        disabled={!editing}
                                    />
                                </Stack>
                            )}

                            <Divider sx={{ my: 2 }} />

                            <Box sx={{ mt: 1 }}>
                                <Typography variant="subtitle2">{t("buckets.add_alias_title")}</Typography>
                                <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                                    <TextField size="small" label={t("buckets.form.alias")} value={aliasInput} onChange={(e) => setAliasInput(e.target.value)} />
                                    <Button variant="contained" size="small" onClick={doAddAlias}>
                                        {t("common.add")}
                                    </Button>
                                </Stack>
                            </Box>
                        </Box>
                    ) : null}
                </DialogContent>
                <DialogActions>
                    {!editing ? (
                        <>
                            <Button
                                onClick={() => {
                                    setEditing(true)
                                }}
                            >
                                {t("common.edit") || t("buckets.edit")}
                            </Button>
                            <Button
                                onClick={() => {
                                    setSelectedBucket(null)
                                    setEditing(false)
                                }}
                            >
                                {t("common.close")}
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button
                                onClick={() => {
                                    /* cancel edits: reset form */ if (selectedBucket) {
                                        const maxSize = selectedBucket.quotas?.maxSize || 0
                                        const { value: unit, display: size } = getBestUnit(maxSize)
                                        setDetailsForm({
                                            quotasMaxSize: size.toString(),
                                            quotasMaxSizeUnit: unit,
                                            quotasMaxObjects: selectedBucket.quotas?.maxObjects !== undefined ? String(selectedBucket.quotas.maxObjects) : "",
                                            websiteEnabled: !!selectedBucket.websiteAccess,
                                            websiteIndex: selectedBucket.websiteConfig?.indexDocument || "",
                                            websiteError: selectedBucket.websiteConfig?.errorDocument || "",
                                        })
                                    }
                                    setEditing(false)
                                }}
                            >
                                {t("common.cancel")}
                            </Button>
                            <Button variant="contained" onClick={saveDetails} disabled={savingDetails}>
                                {t("common.save")}
                            </Button>
                        </>
                    )}
                </DialogActions>
            </Dialog>

            {/* Remove alias confirmation dialog */}
            <Dialog open={removeAliasConfirmOpen} onClose={() => setRemoveAliasConfirmOpen(false)}>
                <DialogTitle>{t("buckets.remove_alias_confirm_title")}</DialogTitle>
                <DialogContent>
                    <Typography>{aliasToRemove ? t("buckets.remove_alias_confirm_desc", { alias: aliasToRemove.value }) : ""}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRemoveAliasConfirmOpen(false)}>{t("common.cancel")}</Button>
                    <Button variant="contained" color="error" onClick={doRemoveAlias}>
                        {t("common.delete")}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>{t("buckets.delete_confirm_title")}</DialogTitle>
                <DialogContent>
                    <Typography>{t("buckets.delete_confirm_desc")}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>{t("common.cancel")}</Button>
                    <Button variant="contained" color="error" onClick={doDelete}>
                        {t("common.delete")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
