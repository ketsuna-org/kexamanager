import { useState, useEffect, useCallback, type SubmitEvent } from "react"
import { useTranslation } from "react-i18next"
import Alert from "@mui/material/Alert"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import FormControlLabel from "@mui/material/FormControlLabel"
import TextField from "@mui/material/TextField"
import Typography from "@mui/material/Typography"
import Stack from "@mui/material/Stack"
import IconButton from "@mui/material/IconButton"
import Chip from "@mui/material/Chip"
import Tooltip from "@mui/material/Tooltip"
import DeleteIcon from "@mui/icons-material/Delete"
import KeyIcon from "@mui/icons-material/Key"
import { ListKeys, CreateKey, DeleteKey, GetKeyInfo, UpdateKey, ImportKey } from "../../utils/apiWrapper"
import type { components } from "../../types/openapi"
import PageHeader from "../../components/PageHeader"
import DataTable, { type DataTableColumn } from "../../components/data/DataTable"
import { useProject } from "../../contexts/ProjectContext"
import { projectBadge } from "./projectBadge"
import { formatDateTime } from "../../utils/format"

type KeyItem = components["schemas"]["ListKeysResponseItem"]
type KeyDetails = components["schemas"]["GetKeyInfoResponse"]

/** Largeur minimale du bouton de validation pour qu'il ne se decale pas pendant l'envoi. */
const SUBMIT_BUTTON_SX = { minWidth: 96 } as const

export default function ApplicationsKeys() {
    const { t, i18n } = useTranslation()
    const { selectedProject } = useProject()
    const [keys, setKeys] = useState<KeyItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [loadError, setLoadError] = useState<string | null>(null)

    const [createOpen, setCreateOpen] = useState(false)
    const [createSubmitting, setCreateSubmitting] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [createForm, setCreateForm] = useState({ name: "", expiration: "", neverExpires: false, permissions: { createBucket: false } })

    const [importOpen, setImportOpen] = useState(false)
    const [importSubmitting, setImportSubmitting] = useState(false)
    const [importError, setImportError] = useState<string | null>(null)
    const [importForm, setImportForm] = useState({ accessKeyId: "", secretAccessKey: "", name: "" })

    const [detailOpen, setDetailOpen] = useState(false)
    const [selectedKey, setSelectedKey] = useState<KeyDetails | null>(null)
    const [editing, setEditing] = useState(false)
    const [savingDetails, setSavingDetails] = useState(false)
    const [detailsError, setDetailsError] = useState<string | null>(null)
    const [detailsForm, setDetailsForm] = useState({ name: "", expiration: "", neverExpires: false, permissions: { createBucket: false } })
    const [showSecret, setShowSecret] = useState(false)

    const [createdSecretOpen, setCreatedSecretOpen] = useState(false)
    const [createdSecret, setCreatedSecret] = useState<string | null>(null)

    function getIsoDateString(stringDate: string) {
        const date = new Date(stringDate)
        if (isNaN(date.getTime())) {
            return ""
        }
        return date.toISOString()
    }

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
    const [toDeleteId, setToDeleteId] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setError(null)
        setLoadError(null)
        try {
            const res = await ListKeys()
            const maybe = res as unknown
            const data = (maybe as { data?: unknown }).data
            if (Array.isArray(data)) setKeys(data as KeyItem[])
            else if (Array.isArray(maybe)) setKeys(maybe as KeyItem[])
            else setKeys([])
        } catch (e) {
            const msg = (e as unknown) instanceof Error ? (e as Error).message : String(e)
            setLoadError(msg)
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    function openCreate() {
        setCreateForm({ name: "", expiration: "", neverExpires: false, permissions: { createBucket: false } })
        setCreateError(null)
        setCreateOpen(true)
    }
    function closeCreate() {
        setCreateOpen(false)
        setCreateError(null)
    }

    async function submitCreate() {
        setCreateSubmitting(true)
        setCreateError(null)
        try {
            const body: components["schemas"]["UpdateKeyRequestBody"] = {}
            if (createForm.name) body.name = createForm.name
            if (createForm.expiration) body.expiration = getIsoDateString(createForm.expiration)
            if (createForm.neverExpires) body.neverExpires = true
            // permissions: set allow flags when true
            if (createForm.permissions) {
                const allow: components["schemas"]["KeyPerm"] = {}
                if (createForm.permissions.createBucket) allow.createBucket = true;
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
            setCreateError(String(e))
        } finally {
            setCreateSubmitting(false)
        }
    }

    /** Soumission au clavier (Entree) du dialogue de creation. */
    function handleCreateSubmit() {
        if (createSubmitting) return
        void submitCreate()
    }

    function openImport() {
        setImportForm({ accessKeyId: "", secretAccessKey: "", name: "" })
        setImportError(null)
        setImportOpen(true)
    }
    function closeImport() {
        setImportOpen(false)
        setImportError(null)
    }

    async function submitImport() {
        setImportSubmitting(true)
        setImportError(null)
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
            setImportError(String(e))
        } finally {
            setImportSubmitting(false)
        }
    }

    /** Soumission au clavier (Entree) du dialogue d'import. */
    function handleImportSubmit() {
        if (importSubmitting) return
        void submitImport()
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
        setDetailsError(null)
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

    async function impersonateKeyById(id: string, useSessionStorage = true) {
        try {
            const res = await GetKeyInfo({ id, showSecretKey: true })
            if (!res?.secretAccessKey) throw new Error('Secret not available for this key')
            // Store both key ID and secret access key for backend authentication
            const storage = useSessionStorage ? sessionStorage : localStorage
            storage.setItem('kexamanager:s3:keyId', res.accessKeyId)
            storage.setItem('kexamanager:s3:secretAccessKey', res.secretAccessKey)
            // Redirect to S3 Browser tab in Cluster view
            window.location.href = '/cluster?tab=S3%20Browser'
        } catch (e) {
            console.error('Impersonate by id error', e)
            setError(e instanceof Error ? e.message : String(e))
        }
    }

    function closeDetails() {
        setDetailOpen(false)
        setSelectedKey(null)
        setEditing(false)
        setDetailsError(null)
    }

    /** Soumission au clavier (Entree) du formulaire d'edition des details. */
    function handleDetailsSubmit() {
        if (!editing || savingDetails) return
        void saveDetails()
    }

    async function saveDetails() {
        if (!selectedKey) return
        setSavingDetails(true)
        setDetailsError(null)
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
            } else {
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
            setDetailsError(String(e))
        } finally {
            setSavingDetails(false)
        }
    }

    async function impersonateSelectedKey(useSessionStorage = true) {
        if (!selectedKey || !selectedKey.secretAccessKey) return

        try {
            // Store both key ID and secret access key for backend authentication
            const storage = useSessionStorage ? sessionStorage : localStorage
            storage.setItem('kexamanager:s3:keyId', selectedKey.accessKeyId)
            storage.setItem('kexamanager:s3:secretAccessKey', selectedKey.secretAccessKey)
            // Redirect to S3 Browser tab in Cluster view
            window.location.href = '/cluster?tab=S3%20Browser'
        } catch (e) {
            console.error('Impersonate error:', e)
        }
    }

    return (
        <Box sx={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {error && (
                <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
                    {error}
                </Alert>
            )}
            <Box sx={{ flexShrink: 0 }}>
                <PageHeader
                    title={t("dashboard.apps")}
                    subtitle={t("dashboard.apps_desc")}
                    badge={projectBadge(selectedProject)}
                    action={
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
                    }
                />
            </Box>

            <Box sx={{ flex: 1, overflow: "auto" }}>
                <DataTable<KeyItem>
                    rows={keys}
                    getRowId={(k) => k.id}
                    loading={loading}
                    error={loadError}
                    errorTitle={t("common.load_error")}
                    retryLabel={t("common.retry")}
                    onRetry={() => { void load() }}
                    tableLabel={t("dashboard.apps") as string}
                    columns={[
                        {
                            id: "name",
                            header: t("keys.col.name"),
                            minWidth: 220,
                            truncate: true,
                            textValue: (k) => k.name,
                            sortValue: (k) => k.name,
                            cell: (k) => k.name,
                        },
                        {
                            id: "created",
                            header: t("buckets.col.creationDate"),
                            minWidth: 170,
                            sortValue: (k) => (k.created ? new Date(k.created) : null),
                            cell: (k) => (k.created ? formatDateTime(k.created, i18n.language) : ""),
                        },
                        {
                            id: "expiration",
                            header: t("keys.col.expiration"),
                            minWidth: 170,
                            sortValue: (k) => (k.expiration ? new Date(k.expiration) : null),
                            cell: (k) => k.expiration || "",
                        },
                        {
                            id: "actions",
                            header: t("common.actions"),
                            align: "right",
                            minWidth: 260,
                            cell: (k) => (
                                <Stack direction="row" spacing={1} sx={{
                                    alignItems: "center",
                                    justifyContent: "flex-end"
                                }}>
                                    <Button size="small" onClick={() => openDetails(k.id)}>
                                        {t("common.details")}
                                    </Button>
                                    <Button size="small" variant="outlined" onClick={() => impersonateKeyById(k.id)}>
                                        Impersonate
                                    </Button>
                                    <Tooltip title={t("common.delete")}>
                                        <IconButton
                                            size="small"
                                            color="error"
                                            sx={{ width: 32, height: 32 }}
                                            aria-label={`${t("common.delete")} ${k.name}`}
                                            onClick={() => confirmDelete(k.id)}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </Tooltip>
                                </Stack>
                            ),
                        },
                    ] satisfies DataTableColumn<KeyItem>[]}
                    searchValue={(k) => `${k.name} ${k.id}`}
                    pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
                    emptyState={{
                        icon: <KeyIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
                        title: t("keys.empty"),
                        primaryAction: { label: t("common.add"), onClick: openCreate },
                    }}
                />
            </Box>

            {/* Create dialog */}
            <Dialog
                open={createOpen}
                onClose={closeCreate}
                fullWidth
                maxWidth="sm"
                slotProps={{
                    paper: {
                        component: "form",
                        onSubmit: (event: SubmitEvent<HTMLDivElement>) => {
                            event.preventDefault()
                            handleCreateSubmit()
                        },
                    },
                }}
            >
                <DialogTitle>{t("common.add")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {createError && (
                            <Alert severity="error" onClose={() => setCreateError(null)}>
                                {createError}
                            </Alert>
                        )}
                        <TextField label={t("keys.col.name")} value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} fullWidth />
                        <TextField
                            label={t("keys.create_expiration_label")}
                            type="datetime-local"
                            value={createForm.expiration}
                            onChange={(e) => setCreateForm((f) => ({ ...f, expiration: e.target.value }))}
                            fullWidth
                            slotProps={{
                                inputLabel: { shrink: true }
                            }}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={createForm.permissions.createBucket}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, permissions: { ...f.permissions, createBucket: e.target.checked } }))}
                                />
                            }
                            label={t("keys.perm.createBucket")}
                        />
                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={createForm.neverExpires}
                                    onChange={(e) => setCreateForm((f) => ({ ...f, neverExpires: e.target.checked }))}
                                />
                            }
                            label={t("common.never_expire")}
                        />
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeCreate}>{t("common.cancel")}</Button>
                    <Button type="submit" variant="contained" disabled={createSubmitting} sx={SUBMIT_BUTTON_SX}>
                        {t("common.add")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Import dialog */}
            <Dialog
                open={importOpen}
                onClose={closeImport}
                fullWidth
                maxWidth="sm"
                slotProps={{
                    paper: {
                        component: "form",
                        onSubmit: (event: SubmitEvent<HTMLDivElement>) => {
                            event.preventDefault()
                            handleImportSubmit()
                        },
                    },
                }}
            >
                <DialogTitle>{t("keys.import_title")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {importError && (
                            <Alert severity="error" onClose={() => setImportError(null)}>
                                {importError}
                            </Alert>
                        )}
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
                    <Button type="submit" variant="contained" disabled={importSubmitting} sx={SUBMIT_BUTTON_SX}>
                        {t("keys.import.label")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Details dialog */}
            <Dialog
                open={detailOpen}
                onClose={closeDetails}
                fullWidth
                maxWidth="md"
                slotProps={editing ? {
                    paper: {
                        component: "form",
                        onSubmit: (event: SubmitEvent<HTMLDivElement>) => {
                            event.preventDefault()
                            handleDetailsSubmit()
                        },
                    },
                } : undefined}
            >
                <DialogTitle>{t("common.details")}</DialogTitle>
                <DialogContent>
                    {detailsError && (
                        <Alert severity="error" onClose={() => setDetailsError(null)} sx={{ mt: 1 }}>
                            {detailsError}
                        </Alert>
                    )}
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
                                                {Object.entries(selectedKey.permissions).map(([k, v]) => (v ? <Chip key={k} label={t(`keys.perm.${k}`, k)} size="small" /> : null))}
                                            </Stack>
                                        ) : (
                                            <Typography variant="body2" sx={{
                                                color: "text.secondary"
                                            }}>
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
                                                        <Box component="code" sx={{ wordBreak: "break-all" }}>{selectedKey.secretAccessKey}</Box>
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
                                                    <Button variant="contained" size="small" onClick={() => impersonateSelectedKey(true)} sx={{ mr: 1 }}>
                                                        Impersonate key (session)
                                                    </Button>
                                                    <Button size="small" onClick={() => impersonateSelectedKey(false)}>
                                                        Impersonate key (local)
                                                    </Button>
                                                </Box>
                                            </Box>
                                        ) : (
                                            <Typography variant="body2" sx={{
                                                color: "text.secondary"
                                            }}>
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
                                            slotProps={{
                                                inputLabel: { shrink: true }
                                            }}
                                        />
                                    )}
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={detailsForm.neverExpires}
                                                onChange={(e) => setDetailsForm((d) => ({ ...d, neverExpires: e.target.checked }))}
                                            />
                                        }
                                        label={t("common.never_expire")}
                                    />
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                checked={detailsForm.permissions.createBucket}
                                                onChange={(e) => setDetailsForm((d) => ({ ...d, permissions: { ...d.permissions, createBucket: e.target.checked } }))}
                                            />
                                        }
                                        label={t("keys.perm.createBucket")}
                                    />
                                </Stack>
                            )}
                        </Box>
                    ) : (
                        <Typography>{t("common.loading")}</Typography>
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
                        <Button type="submit" variant="contained" disabled={savingDetails} sx={SUBMIT_BUTTON_SX}>
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
                    <Typography>{t("keys.delete_confirm")}</Typography>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setDeleteDialogOpen(false)}>{t("common.cancel")}</Button>
                    <Button color="error" variant="contained" onClick={doDelete}>
                        {t("common.delete")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    );
}