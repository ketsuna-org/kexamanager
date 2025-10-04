import { useEffect, useState, useCallback } from "react"
import { useTranslation } from "react-i18next"
import { ListAdminTokens, CreateAdminToken, DeleteAdminToken, UpdateAdminToken, GetAdminTokenInfo, type ApiError } from "../../utils/apiWrapper"
import type { components } from "../../types/openapi"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableContainer from "@mui/material/TableContainer"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Paper from "@mui/material/Paper"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import TextField from "@mui/material/TextField"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Snackbar from "@mui/material/Snackbar"
import Alert from "@mui/material/Alert"
import CircularProgress from "@mui/material/CircularProgress"
import Stack from "@mui/material/Stack"
import Tooltip from "@mui/material/Tooltip"
import DeleteIcon from "@mui/icons-material/Delete"
import EditIcon from "@mui/icons-material/Edit"
import VisibilityIcon from "@mui/icons-material/Visibility"

export default function AdminTokens() {
    const { t } = useTranslation()
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [tokens, setTokens] = useState<Awaited<ReturnType<typeof ListAdminTokens>>>([])

    // Dialog states
    const [formOpen, setFormOpen] = useState(false)
    const [viewOpen, setViewOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [createdSecretOpen, setCreatedSecretOpen] = useState(false)

    // Snackbar
    const [snack, setSnack] = useState<{ open: boolean; severity: "success" | "error" | "info"; message: string }>({ open: false, severity: "info", message: "" })

    // form model for create/edit
    const [editing, setEditing] = useState<null | { id?: string }>(null)
    const [form, setForm] = useState<{ name: string; expiration?: string; neverExpires: boolean; scope: string }>({ name: "", expiration: "", neverExpires: false, scope: "*" })
    const [busy, setBusy] = useState(false)

    // view token detail
    type AdminToken = components["schemas"]["GetAdminTokenInfoResponse"]
    const [current, setCurrent] = useState<AdminToken | null>(null)
    // secret shown after creation
    const [createdSecret, setCreatedSecret] = useState<string | null>(null)

    async function load() {
        setLoading(true)
        setError(null)
        try {
            const res = await ListAdminTokens()
            if (res && Array.isArray(res)) setTokens(res)
        } catch (e) {
            setError((e as unknown as { message?: string })?.message || String(e))
        } finally {
            setLoading(false)
        }
    }

    const loadCallback = useCallback(load, [])

    useEffect(() => {
        loadCallback()
    }, [loadCallback])

    function openCreate() {
        setEditing(null)
        setForm({ name: "", expiration: "", neverExpires: false, scope: "*" })
        setFormOpen(true)
    }

    function openEdit(tok: AdminToken) {
        if (!tok.id) {
            setSnack({ open: true, severity: "error", message: t("adminTokens.invalid_id") })
            return
        }
        setEditing({ id: tok.id ?? undefined })
        setForm({
            name: tok.name ?? "",
            expiration: tok.expiration ?? "",
            // If expiration is explicitly null it means never expires
            neverExpires: tok.expiration === null,
            scope: (tok.scope || []).join(", "),
        })
        setFormOpen(true)
    }

    async function openView(tok: AdminToken) {
        try {
            setBusy(true)
            if (!tok.id) {
                setSnack({ open: true, severity: "error", message: t("adminTokens.invalid_id") })
                return
            }
            const res = await GetAdminTokenInfo({ id: tok.id ?? undefined })
            setCurrent(res)
            setViewOpen(true)
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            setSnack({ open: true, severity: "error", message: msg })
        } finally {
            setBusy(false)
        }
    }

    function openConfirm(tok: AdminToken) {
        if (!tok.id) {
            setSnack({ open: true, severity: "error", message: t("adminTokens.invalid_id") })
            return
        }
        setCurrent(tok)
        setConfirmOpen(true)
    }

    function getIsoDateString(stringDate: string) {
        const date = new Date(stringDate)
        if (isNaN(date.getTime())) {
            return ""
        }
        return date.toISOString()
    }

    async function handleSubmit() {
        setBusy(true)
        try {
            if (editing && editing.id) {
                await UpdateAdminToken(
                    { id: editing.id },
                    {
                        name: form.name || undefined,
                        expiration: form.neverExpires ? null : form.expiration ? getIsoDateString(form.expiration) : null,
                        neverExpires: form.neverExpires || false,
                        scope: form.scope ? form.scope.split(",").map((s) => s.trim()) : undefined,
                    }
                )
                setSnack({ open: true, severity: "success", message: t("adminTokens.updated") })
            } else {
                const res = await CreateAdminToken({
                    name: form.name || "",
                    expiration: form.neverExpires ? null : form.expiration ? getIsoDateString(form.expiration) : null,
                    neverExpires: form.neverExpires || undefined,
                    scope: form.scope ? form.scope.split(",").map((s) => s.trim()) : undefined,
                })
                setSnack({ open: true, severity: "success", message: t("adminTokens.created") })
                // show secret if returned
                if ("secretToken" in res && (res as unknown as { secretToken?: string }).secretToken) {
                    setCreatedSecret((res as unknown as { secretToken?: string }).secretToken ?? null)
                    setCreatedSecretOpen(true)
                }
            }
            setFormOpen(false)
            await load()
        } catch (e) {
            const error = e as unknown as ApiError
            setSnack({ open: true, severity: "error", message: error.message })
        } finally {
            setBusy(false)
        }
    }

    async function handleDelete() {
        if (!current) return
        if (!current.id) {
            setSnack({ open: true, severity: "error", message: t("adminTokens.invalid_id") })
            return
        }
        setBusy(true)
        try {
            await DeleteAdminToken({ id: current.id })
            setSnack({ open: true, severity: "success", message: t("adminTokens.deleted") })
            setConfirmOpen(false)
            await load()
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e)
            setSnack({ open: true, severity: "error", message: msg })
        } finally {
            setBusy(false)
        }
    }

    return (
        <div>
            <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 2 }}>
                <div>
                    <h3>{t("dashboard.adminTokens")}</h3>
                    <p>{t("dashboard.adminTokens_desc")}</p>
                </div>
                <div>
                    <Button variant="contained" onClick={openCreate}>
                        {t("adminTokens.token_add")}
                    </Button>
                </div>
            </Stack>

            {loading && (
                <div>
                    <CircularProgress size={20} /> {t("common.loading")}
                </div>
            )}
            {error && <div style={{ color: "red" }}>{error}</div>}

            {!loading && !error && (
                <TableContainer component={Paper}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>#</TableCell>
                                <TableCell>{t("adminTokens.created")}</TableCell>
                                <TableCell>{t("adminTokens.name")}</TableCell>
                                <TableCell>{t("adminTokens.expiration")}</TableCell>
                                <TableCell>{t("adminTokens.expired")}</TableCell>
                                <TableCell>{t("adminTokens.scope")}</TableCell>
                                <TableCell>{t("common.actions")}</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {tokens.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={7} sx={{ textAlign: "center" }}>
                                        {t("adminTokens.empty")}
                                    </TableCell>
                                </TableRow>
                            )}
                            {tokens.map((tok, idx) => {
                                return (
                                    <TableRow key={tok.id ?? idx}>
                                        <TableCell>{tok.id ?? t("common.fromconfig")}</TableCell>
                                        <TableCell>{tok.created ?? t("common.fromconfig")}</TableCell>
                                        <TableCell>{tok.name ?? t("common.fromconfig")}</TableCell>
                                        <TableCell>{tok.expiration ?? t("common.never_expire")}</TableCell>
                                        <TableCell>{tok.expired ? t("common.yes") : t("common.no")}</TableCell>
                                        <TableCell>{(tok.scope || []).join(", ")}</TableCell>
                                        <TableCell>
                                            <Stack direction="row" spacing={1}>
                                                <Tooltip title={t("adminTokens.view") as string}>
                                                    <span>
                                                        <IconButton size="small" onClick={() => openView(tok)}>
                                                            <VisibilityIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title={t("adminTokens.edit") as string}>
                                                    <span>
                                                        <IconButton size="small" onClick={() => openEdit(tok)}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                                <Tooltip title={t("adminTokens.delete") as string}>
                                                    <span>
                                                        <IconButton size="small" color="error" onClick={() => openConfirm(tok)}>
                                                            <DeleteIcon fontSize="small" />
                                                        </IconButton>
                                                    </span>
                                                </Tooltip>
                                            </Stack>
                                        </TableCell>
                                    </TableRow>
                                )
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            )}

            {/* Create / Edit Dialog */}
            <Dialog open={formOpen} onClose={() => setFormOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{editing ? t("adminTokens.edit_title") : t("adminTokens.create_title")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        <TextField label={t("adminTokens.name") as string} value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} fullWidth />
                        <TextField
                            label={t("adminTokens.scope") as string}
                            value={form.scope}
                            onChange={(e) => setForm((s) => ({ ...s, scope: e.target.value }))}
                            helperText={t("adminTokens.scope_desc") as string}
                            fullWidth
                        />
                        <FormControlLabel
                            control={<Checkbox checked={form.neverExpires} onChange={(e) => setForm((s) => ({ ...s, neverExpires: e.target.checked }))} />}
                            label={t("common.never_expire") as string}
                        />
                        {!form.neverExpires && (
                            <TextField
                                label={t("adminTokens.expiration") as string}
                                type="datetime-local"
                                value={form.expiration || ""}
                                onChange={(e) => setForm((s) => ({ ...s, expiration: e.target.value }))}
                                InputLabelProps={{ shrink: true }}
                            />
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setFormOpen(false)}>{t("common.cancel")}</Button>
                    <Button variant="contained" onClick={handleSubmit} disabled={busy}>
                        {busy ? <CircularProgress size={16} /> : t("common.save")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* View Dialog */}
            <Dialog open={viewOpen} onClose={() => setViewOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{t("adminTokens.details")}</DialogTitle>
                <DialogContent>
                    {busy && <CircularProgress />}
                    {current && (
                        <div style={{ whiteSpace: "pre-wrap" }}>
                            <b>{t("adminTokens.name")}:</b> {current.name}
                            <br />
                            <b>ID:</b> {current.id}
                            <br />
                            <b>{t("adminTokens.created")}:</b> {current.created}
                            <br />
                            <b>{t("adminTokens.expiration")}:</b> {current.expiration}
                            <br />
                            <b>{t("adminTokens.scope")}:</b> {(current.scope || []).join(", ")}
                        </div>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setViewOpen(false)}>{t("common.close")}</Button>
                </DialogActions>
            </Dialog>

            {/* Confirm delete */}
            <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
                <DialogTitle>{t("adminTokens.delete_confirm_title")}</DialogTitle>
                <DialogContent>{t("adminTokens.delete_confirm_desc")}</DialogContent>
                <DialogActions>
                    <Button onClick={() => setConfirmOpen(false)}>{t("common.cancel")}</Button>
                    <Button color="error" variant="contained" onClick={handleDelete} disabled={busy}>
                        {busy ? <CircularProgress size={16} /> : t("common.delete")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* Created secret dialog */}
            <Dialog
                open={createdSecretOpen}
                onClose={() => {
                    setCreatedSecretOpen(false)
                    setCreatedSecret(null)
                }}
            >
                <DialogTitle>{t("adminTokens.created_secret_title")}</DialogTitle>
                <DialogContent>
                    <p>{t("adminTokens.created_secret_msg")}</p>
                    <div style={{ wordBreak: "break-all" }}>{createdSecret}</div>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            navigator.clipboard?.writeText(createdSecret || "")
                            setSnack({ open: true, severity: "success", message: t("common.copied") })
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

            <Snackbar open={snack.open} autoHideDuration={4000} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
                <Alert severity={snack.severity} onClose={() => setSnack((s) => ({ ...s, open: false }))}>
                    {snack.message}
                </Alert>
            </Snackbar>
        </div>
    )
}
