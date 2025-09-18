import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import TextField from "@mui/material/TextField"
// Tooltip and Switch removed as they're unused in this component
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import IconButton from "@mui/material/IconButton"
import CircularProgress from "@mui/material/CircularProgress"
import Chip from "@mui/material/Chip"
import { ListKeys, CreateKey, DeleteKey, GetKeyInfo, UpdateKey, ImportKey } from "../../utils/apiWrapper"
import type { components } from "../../types/openapi"
import { S3Client, ListBucketsCommand } from "@aws-sdk/client-s3"

type KeyItem = components["schemas"]["ListKeysResponseItem"]
type KeyDetails = components["schemas"]["GetKeyInfoResponse"]

export default function ApplicationsKeys() {
    const { t } = useTranslation()
    const [keys, setKeys] = useState<KeyItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [createOpen, setCreateOpen] = useState(false)
    const [createSubmitting, setCreateSubmitting] = useState(false)
    const [createForm, setCreateForm] = useState({ name: "", expiration: "", neverExpires: false, permissions: { createBucket: false } })

    const [importOpen, setImportOpen] = useState(false)
    const [importSubmitting, setImportSubmitting] = useState(false)
    const [importForm, setImportForm] = useState({ accessKeyId: "", secretAccessKey: "", name: "" })

    const [detailOpen, setDetailOpen] = useState(false)
    const [selectedKey, setSelectedKey] = useState<KeyDetails | null>(null)
    const [editing, setEditing] = useState(false)
    const [savingDetails, setSavingDetails] = useState(false)
    const [detailsForm, setDetailsForm] = useState({ name: "", expiration: "", neverExpires: false, permissions: { createBucket: false } })
    const [showSecret, setShowSecret] = useState(false)

    const [createdSecretOpen, setCreatedSecretOpen] = useState(false)
    const [createdSecret, setCreatedSecret] = useState<string | null>(null)

    const [s3TestLoading, setS3TestLoading] = useState(false)
    const [s3TestResult, setS3TestResult] = useState<string | null>(null)

    function getIsoDateString(stringDate: string) {
        const date = new Date(stringDate)
        if (isNaN(date.getTime())) {
            return ""
        }
        return date.toISOString()
    }

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [toDeleteId, setToDeleteId] = useState<string | null>(null)

    async function load() {
        setLoading(true)
        setError(null)
        try {
            const res = await ListKeys()
            const maybe = res as unknown
            const data = (maybe as { data?: unknown }).data
            if (Array.isArray(data)) setKeys(data as KeyItem[])
            else if (Array.isArray(maybe)) setKeys(maybe as KeyItem[])
            else setKeys([])
        } catch (e) {
            const msg = (e as unknown) instanceof Error ? (e as Error).message : String(e)
            setError(msg)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        load()
    }, [])

    function openCreate() {
        setCreateForm({ name: "", expiration: "", neverExpires: false, permissions: { createBucket: false } })
        setCreateOpen(true)
    }
    function closeCreate() {
        setCreateOpen(false)
    }

    async function submitCreate() {
        setCreateSubmitting(true)
        try {
            const body: components["schemas"]["UpdateKeyRequestBody"] = {}
            if (createForm.name) body.name = createForm.name
            if (createForm.expiration) body.expiration = getIsoDateString(createForm.expiration)
            if (createForm.neverExpires) body.neverExpires = true
            // permissions: set allow flags when true
            if (createForm.permissions) {
                const allow: components["schemas"]["KeyPerm"] = {}
                if (createForm.permissions.createBucket)allow.createBucket = true;
                body.allow = allow
            }
            const res = await CreateKey(body)
            // if API returns secretAccessKey on creation, show it
            const maybe = res as unknown as { secretAccessKey?: string }
            if (maybe && maybe.secretAccessKey) {
                setCreatedSecret(maybe.secretAccessKey)
                setCreatedSecretOpen(true)
            }
            await load()
            setCreateOpen(false)
        } catch (e) {
            console.error("CreateKey error", e)
            setError(String(e))
        } finally {
            setCreateSubmitting(false)
        }
    }

    function openImport() {
        setImportForm({ accessKeyId: "", secretAccessKey: "", name: "" })
        setImportOpen(true)
    }
    function closeImport() {
        setImportOpen(false)
    }

    async function submitImport() {
        setImportSubmitting(true)
        try {
            const res = await ImportKey({ accessKeyId: importForm.accessKeyId, secretAccessKey: importForm.secretAccessKey, name: importForm.name || undefined })
            const maybe2 = res as unknown as { secretAccessKey?: string }
            if (maybe2 && maybe2.secretAccessKey) {
                setCreatedSecret(maybe2.secretAccessKey)
                setCreatedSecretOpen(true)
            }
            await load()
            setImportOpen(false)
        } catch (e) {
            console.error("ImportKey error", e)
            setError(String(e))
        } finally {
            setImportSubmitting(false)
        }
    }

    function confirmDelete(id: string) {
        setToDeleteId(id)
        setDeleteDialogOpen(true)
    }

    async function doDelete() {
        if (!toDeleteId) return
        try {
            await DeleteKey({ id: toDeleteId })
            await load()
        } catch (e) {
            console.error("DeleteKey error", e)
            setError(String(e))
        } finally {
            setDeleteDialogOpen(false)
            setToDeleteId(null)
        }
    }

    async function openDetails(id: string) {
        try {
            const res = await GetKeyInfo({ id, showSecretKey: true })
            setSelectedKey(res)
            setEditing(false)
            setDetailsForm({ name: res?.name || "", expiration: res?.expiration || "", neverExpires: false, permissions: { createBucket: !!res?.permissions?.createBucket } })
            setDetailOpen(true)
        } catch (e) {
            console.error("GetKeyInfo error", e)
            setSelectedKey(null)
            setError(String(e))
        }
    }

    function closeDetails() {
        setDetailOpen(false)
        setSelectedKey(null)
        setEditing(false)
    }

    async function saveDetails() {
        if (!selectedKey) return
        setSavingDetails(true)
        try {
            const body: components["schemas"]["UpdateKeyRequestBody"] = {}
            if (detailsForm.name) body.name = detailsForm.name
            if (detailsForm.expiration) body.expiration = detailsForm.expiration
            if (detailsForm.neverExpires) body.neverExpires = true
            if (detailsForm.permissions) {
                const allow: components["schemas"]["KeyPerm"] = {}
                if (detailsForm.permissions.createBucket) {
                    allow.createBucket = true
                } else {
                    allow.createBucket = false
                }
                body.allow = allow
            }else {
                body.allow = {
                    createBucket: false
                }
            }
            await UpdateKey({ id: selectedKey.accessKeyId }, body)
            const refreshed = await GetKeyInfo({ id: selectedKey.accessKeyId })
            setSelectedKey(refreshed)
            await load()
            setEditing(false)
        } catch (e) {
            console.error("UpdateKey error", e)
            setError(String(e))
        } finally {
            setSavingDetails(false)
        }
    }

    async function testS3Connection() {
        if (!selectedKey || !selectedKey.secretAccessKey) return

        setS3TestLoading(true)
        setS3TestResult(null)

        try {
            // Get S3 endpoint from environment
            console.log('Fetching S3 URL from /api/getS3url...')
            const s3EndpointResponse = await fetch('/api/getS3url')
            if (!s3EndpointResponse.ok) {
                throw new Error(`Failed to fetch S3 URL: ${s3EndpointResponse.status} ${s3EndpointResponse.statusText}`)
            }
            const s3EndpointData = await s3EndpointResponse.json()
            const s3Endpoint = s3EndpointData.url
            console.log('S3 Endpoint received:', s3Endpoint)

            if (!s3Endpoint) {
                throw new Error('No S3 endpoint received from server')
            }

            // Validate URL format
            try {
                new URL(s3Endpoint)
            } catch {
                throw new Error(`Invalid S3 endpoint URL: ${s3Endpoint}`)
            }

            console.log('Creating S3 client...')
            const s3Client = new S3Client({
                region: 'garage', // Default region, can be made configurable
                endpoint: s3Endpoint,
                credentials: {
                    accessKeyId: selectedKey.accessKeyId,
                    secretAccessKey: selectedKey.secretAccessKey,
                },
                forcePathStyle: true, // Required for MinIO and some S3-compatible services
                // Disable SSL verification for local development if using HTTP
                ...(s3Endpoint.startsWith('http://') && { tls: false }),
            })

            console.log('Testing S3 connection...')
            const command = new ListBucketsCommand({})
            const result = await s3Client.send(command)
            console.log('S3 test successful:', result)

            setS3TestResult('success')
        } catch (e) {
            console.error('S3 test error:', e)
            // Provide more detailed error information
            let errorMessage = 'Unknown error'
            if (e instanceof Error) {
                errorMessage = e.message
                if (e.name === 'TypeError' && e.message.includes('Failed to fetch')) {
                    errorMessage = 'Network error: Cannot connect to S3 endpoint. Check CORS policy or network connectivity.'
                }
            }
            setS3TestResult(`error: ${errorMessage}`)
        } finally {
            setS3TestLoading(false)
        }
    }

    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {error && (
                <Typography color="error" sx={{ mb: 1 }}>
                    {error}
                </Typography>
            )}
            <Box sx={{
                display: "flex",
                flexDirection: { xs: "column", sm: "row" },
                justifyContent: "space-between",
                alignItems: { xs: "stretch", sm: "center" },
                gap: 2,
                mb: 2,
                flexShrink: 0
            }}>
                <Stack sx={{ flex: 1 }}>
                    <Typography variant="h6">{t("dashboard.apps")}</Typography>
                    <Typography variant="body2" color="text.secondary">
                        {t("dashboard.apps_desc")}
                    </Typography>
                </Stack>
                <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                    <Button variant="outlined" onClick={() => load()}>
                        {t("common.refresh")}
                    </Button>
                    <Button variant="contained" onClick={openCreate}>
                        {t("common.add")}
                    </Button>
                    <Button variant="text" onClick={openImport}>
                        {t("keys.import.label")}
                    </Button>
                </Stack>
            </Box>

            <TableContainer component={Paper} sx={{ flex: 1, overflow: "auto" }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell>{t("keys.col.name")}</TableCell>
                            <TableCell>{t("buckets.col.creationDate")}</TableCell>
                            <TableCell>{t("keys.col.expiration")}</TableCell>
                            <TableCell>{t("common.actions")}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {loading && (
                            <TableRow>
                                <TableCell colSpan={4} sx={{ textAlign: "center" }}>
                                    <CircularProgress size={20} /> {t("common.loading")}
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading && keys.length === 0 && (
                            <TableRow>
                                <TableCell colSpan={4} sx={{ textAlign: "center" }}>
                                    {t("keys.empty")}
                                </TableCell>
                            </TableRow>
                        )}
                        {!loading &&
                            keys.map((k) => (
                                <TableRow key={k.id} hover>
                                    <TableCell>{k.name}</TableCell>
                                    <TableCell>{k.created ? new Date(k.created).toLocaleString() : ""}</TableCell>
                                    <TableCell>{k.expiration || ""}</TableCell>
                                    <TableCell>
                                        <Stack direction="row" spacing={1} alignItems="center">
                                            <Button size="small" onClick={() => openDetails(k.id)}>
                                                {t("common.details")}
                                            </Button>
                                            <IconButton size="small" aria-label="delete" onClick={() => confirmDelete(k.id)}>
                                                <span style={{ color: "error.main" }}>{t("common.delete")}</span>
                                            </IconButton>
                                        </Stack>
                                    </TableCell>
                                </TableRow>
                            ))}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Create dialog */}
            <Dialog open={createOpen} onClose={closeCreate} fullWidth maxWidth="sm">
                <DialogTitle>{t("common.add")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField label={t("keys.col.name")} value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
                        <TextField
                            label={t("keys.create_expiration_label")}
                            type="datetime-local"
                            value={createForm.expiration}
                            onChange={(e) => setCreateForm((f) => ({ ...f, expiration: e.target.value }))}
                            fullWidth
                            InputLabelProps={{ shrink: true }}
                        />
                        <label>
                            <input
                                type="checkbox"
                                checked={createForm.permissions.createBucket}
                                onChange={(e) => setCreateForm((f) => ({ ...f, permissions: { ...f.permissions, createBucket: e.target.checked } }))}
                            />{" "}
                            {t("keys.perm.createBucket")}
                        </label>
                        <label>
                            <input type="checkbox" checked={createForm.neverExpires} onChange={(e) => setCreateForm((f) => ({ ...f, neverExpires: e.target.checked }))} /> {t("common.never_expire")}
                        </label>
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeCreate}>{t("common.cancel")}</Button>
                    <Button variant="contained" onClick={submitCreate} disabled={createSubmitting}>
                        {t("common.add")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Import dialog */}
            <Dialog open={importOpen} onClose={closeImport} fullWidth maxWidth="sm">
                <DialogTitle>{t("keys.import_title")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField label={t("keys.import.accessKeyId")} value={importForm.accessKeyId} onChange={(e) => setImportForm((f) => ({ ...f, accessKeyId: e.target.value }))} fullWidth />
                        <TextField
                            label={t("keys.import.secretAccessKey")}
                            value={importForm.secretAccessKey}
                            onChange={(e) => setImportForm((f) => ({ ...f, secretAccessKey: e.target.value }))}
                            fullWidth
                        />
                        <TextField label={t("keys.col.name")} value={importForm.name} onChange={(e) => setImportForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeImport}>{t("common.cancel")}</Button>
                    <Button variant="contained" onClick={submitImport} disabled={importSubmitting}>
                        {t("keys.import.label")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Details dialog */}
            <Dialog open={detailOpen} onClose={closeDetails} fullWidth maxWidth="md">
                <DialogTitle>{t("common.details")}</DialogTitle>
                <DialogContent>
                    {selectedKey ? (
                        <Box sx={{ mt: 1 }}>
                            {!editing ? (
                                <Box>
                                    <Typography>
                                        <b>{t("keys.col.name")}:</b> {selectedKey.name}
                                    </Typography>
                                    <Typography>
                                        <b>{t("keys.id_label")}:</b> {selectedKey.accessKeyId}
                                    </Typography>
                                    <Typography>
                                        <b>{t("keys.created_label")}:</b> {selectedKey.created ?? ""}
                                    </Typography>
                                    <Typography>
                                        <b>{t("keys.expiration_label")}:</b> {selectedKey.expiration ?? t("common.never_expire")}
                                    </Typography>
                                    <Typography>
                                        <b>{t("keys.expired_label")}:</b> {selectedKey.expired ? t("common.yes") : t("common.no")}
                                    </Typography>
                                    <Typography>
                                        <b>{t("keys.permissions_label")}:</b>
                                    </Typography>
                                    <Box sx={{ mt: 0.5 }}>
                                        {selectedKey.permissions && Object.keys(selectedKey.permissions).length > 0 ? (
                                            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
                                                {Object.entries(selectedKey.permissions).map(([k, v]) => (v ? <Chip key={k} label={t(`keys.perm.${k}`)} size="small" /> : null))}
                                            </Stack>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">
                                                {t("keys.no_permissions")}
                                            </Typography>
                                        )}
                                    </Box>
                                    <Typography>
                                        <b>{t("keys.buckets_label")}:</b> {(selectedKey.buckets || []).map((b) => b.id).join(", ")}
                                    </Typography>
                                    <Box sx={{ mt: 1 }}>
                                        {selectedKey.secretAccessKey ? (
                                            <Box>
                                                {!showSecret ? (
                                                    <Button variant="outlined" size="small" onClick={() => setShowSecret(true)}>
                                                        {t("keys.show_secret")}
                                                    </Button>
                                                ) : (
                                                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                                                        <code style={{ wordBreak: "break-all" }}>{selectedKey.secretAccessKey}</code>
                                                        <Button
                                                            size="small"
                                                            onClick={() => {
                                                                navigator.clipboard?.writeText(selectedKey.secretAccessKey || "")
                                                            }}
                                                        >
                                                            {t("common.copy")}
                                                        </Button>
                                                        <Button size="small" onClick={() => setShowSecret(false)}>
                                                            {t("keys.hide_secret")}
                                                        </Button>
                                                    </Box>
                                                )}
                                                <Box sx={{ mt: 2 }}>
                                                    <Button
                                                        variant="outlined"
                                                        size="small"
                                                        onClick={testS3Connection}
                                                        disabled={s3TestLoading}
                                                        sx={{ mr: 1 }}
                                                    >
                                                        {s3TestLoading ? <CircularProgress size={16} /> : 'Test S3 Connection'}
                                                    </Button>
                                                    {s3TestResult && (
                                                        <Chip
                                                            label={s3TestResult === 'success' ? 'S3 Connection OK' : `S3 Error: ${s3TestResult}`}
                                                            color={s3TestResult === 'success' ? 'success' : 'error'}
                                                            size="small"
                                                        />
                                                    )}
                                                </Box>
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" color="text.secondary">
                                                {t("keys.no_secret")}
                                            </Typography>
                                        )}
                                    </Box>
                                </Box>
                            ) : (
                                <Stack spacing={2}>
                                    <TextField label={t("keys.col.name")} value={detailsForm.name} onChange={(e) => setDetailsForm((d) => ({ ...d, name: e.target.value }))} fullWidth />
                                    {!detailsForm.neverExpires && (
                                        <TextField
                                            label={t("adminTokens.expiration") as string}
                                            type="datetime-local"
                                            value={detailsForm.expiration || ""}
                                            onChange={(e) => setDetailsForm((d) => ({ ...d, expiration: e.target.value }))}
                                            InputLabelProps={{ shrink: true }}
                                        />
                                    )}
                                    <label>
                                        <input type="checkbox" checked={detailsForm.neverExpires} onChange={(e) => setDetailsForm((d) => ({ ...d, neverExpires: e.target.checked }))} />{" "}
                                        {t("common.never_expire")}
                                    </label>
                                    <label>
                                        <input
                                            type="checkbox"
                                            checked={detailsForm.permissions.createBucket}
                                            onChange={(e) => setDetailsForm((d) => ({ ...d, permissions: { ...d.permissions, createBucket: e.target.checked } }))}
                                        />{" "}
                                        {t("keys.perm.createBucket")}
                                    </label>
                                </Stack>
                            )}
                        </Box>
                    ) : (
                        <div>{t("common.loading")}</div>
                    )}
                </DialogContent>
                <DialogActions>
                    {!editing && <Button onClick={() => setEditing(true)}>{t("common.edit")}</Button>}
                    {editing && (
                        <Button
                            onClick={() => {
                                setEditing(false)
                                setDetailsForm({
                                    name: selectedKey?.name || "",
                                    expiration: selectedKey?.expiration || "",
                                    neverExpires: false,
                                    permissions: { createBucket: !!selectedKey?.permissions?.createBucket },
                                })
                            }}
                        >
                            {t("common.cancel")}
                        </Button>
                    )}
                    {editing && (
                        <Button variant="contained" onClick={saveDetails} disabled={savingDetails}>
                            {t("common.save")}
                        </Button>
                    )}
                    <Button onClick={closeDetails}>{t("common.close")}</Button>
                </DialogActions>
            </Dialog>

            {/* Created secret dialog (shown after create/import if API returns secret) */}
            <Dialog
                open={createdSecretOpen}
                onClose={() => {
                    setCreatedSecretOpen(false)
                    setCreatedSecret(null)
                }}
            >
                <DialogTitle>{t("keys.created_secret_title")}</DialogTitle>
                <DialogContent>
                    <Typography>{t("keys.created_secret_msg")}</Typography>
                    <Box sx={{ wordBreak: "break-all", mt: 1 }}>{createdSecret}</Box>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            navigator.clipboard?.writeText(createdSecret || "")
                        }}
                    >
                        {t("common.copy")}
                    </Button>
                    <Button
                        onClick={() => {
                            setCreatedSecretOpen(false)
                            setCreatedSecret(null)
                        }}
                    >
                        {t("common.close")}
                    </Button>
                </DialogActions>
            </Dialog>

            <Dialog open={deleteDialogOpen} onClose={() => setDeleteDialogOpen(false)}>
                <DialogTitle>{t("common.delete")}</DialogTitle>
                <DialogContent>
                    <div>{t("keys.delete_confirm")}</div>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>{t("common.cancel")}</Button>
                    <Button color="error" variant="contained" onClick={doDelete}>
                        {t("common.delete")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
