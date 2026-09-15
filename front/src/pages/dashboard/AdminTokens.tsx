import { useEffect, useState, useCallback, type SubmitEvent } from "react"
import { useTranslation } from "react-i18next"
import { ListAdminTokens, CreateAdminToken, DeleteAdminToken, UpdateAdminToken, GetAdminTokenInfo } from "../../utils/apiWrapper"
import type { components } from "../../types/openapi"
import Typography from "@mui/material/Typography"
import Box from "@mui/material/Box"
import Dialog from "@mui/material/Dialog"
import DialogTitle from "@mui/material/DialogTitle"
import DialogContent from "@mui/material/DialogContent"
import DialogActions from "@mui/material/DialogActions"
import Button from "@mui/material/Button"
import IconButton from "@mui/material/IconButton"
import TextField from "@mui/material/TextField"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import Alert from "@mui/material/Alert"
import CircularProgress from "@mui/material/CircularProgress"
import Stack from "@mui/material/Stack"
import Tooltip from "@mui/material/Tooltip"
import DeleteIcon from "@mui/icons-material/Delete"
import EditIcon from "@mui/icons-material/Edit"
import VisibilityIcon from "@mui/icons-material/Visibility"
import TokenOutlinedIcon from "@mui/icons-material/TokenOutlined"
import PageHeader from "../../components/PageHeader"
import { useProject } from "../../contexts/ProjectContext"
import { useFeedback } from "../../contexts/FeedbackContext"
import { projectBadge } from "./projectBadge"
import DataTable, { type DataTableColumn } from "../../components/data/DataTable"
import { formatDateTime } from "../../utils/format"

/** Message lisible à partir d'une erreur inconnue (Error, string) avec repli traduit. */
function extractErrorMessage(err: unknown, fallback: string): string {
    if (err instanceof Error && err.message) return err.message
    if (typeof err === "string" && err) return err
    return fallback
}

/** Largeur minimale du bouton de validation pour qu'il ne se décale pas pendant l'envoi. */
const SUBMIT_BUTTON_SX = { minWidth: 96 } as const

export default function AdminTokens() {
    const { t, i18n } = useTranslation()
    const { selectedProject } = useProject()
    const { notify } = useFeedback()
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [actionError, setActionError] = useState<string | null>(null)
    const [tokens, setTokens] = useState<Awaited<ReturnType<typeof ListAdminTokens>>>([])

    // Dialog states
    const [formOpen, setFormOpen] = useState(false)
    const [viewOpen, setViewOpen] = useState(false)
    const [confirmOpen, setConfirmOpen] = useState(false)
    const [createdSecretOpen, setCreatedSecretOpen] = useState(false)

    // form model for create/edit
    const [editing, setEditing] = useState<null | { id?: string }>(null)
    const [form, setForm] = useState<{ name: string; expiration?: string; neverExpires: boolean; scope: string }>({ name: "", expiration: "", neverExpires: false, scope: "*" })
    const [formError, setFormError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    // view token detail
    type AdminToken = components["schemas"]["GetAdminTokenInfoResponse"]
    const [current, setCurrent] = useState<AdminToken | null>(null)
    // secret shown after creation
    const [createdSecret, setCreatedSecret] = useState<string | null>(null)

    const load = useCallback(async () => {
        setLoading(true)
        setLoadError(null)
        try {
            const res = await ListAdminTokens()
            if (Array.isArray(res)) {
                setTokens(res)
            } else {
                setTokens([])
                setLoadError(t("adminTokens.load_error"))
            }
        } catch (e) {
            setTokens([])
            setLoadError(extractErrorMessage(e, t("adminTokens.load_error")))
        } finally {
            setLoading(false)
        }
    }, [t])

    useEffect(() => {
        void load()
    }, [load])

    function openCreate() {
        setEditing(null)
        setForm({ name: "", expiration: "", neverExpires: false, scope: "*" })
        setFormError(null)
        setFormOpen(true)
    }

    function closeForm() {
        setFormOpen(false)
        setFormError(null)
    }

    function openEdit(tok: AdminToken) {
        if (!tok.id) {
            setActionError(t("adminTokens.invalid_id"))
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
        setFormError(null)
        setFormOpen(true)
    }

    /** Soumission au clavier (Entrée) du formulaire de création/édition. */
    function handleFormSubmit() {
        if (busy) return
        void handleSubmit()
    }

    async function openView(tok: AdminToken) {
        if (!tok.id) {
            setActionError(t("adminTokens.invalid_id"))
            return
        }
        setActionError(null)
        setBusy(true)
        try {
            const res = await GetAdminTokenInfo({ id: tok.id ?? undefined })
            setCurrent(res)
            setViewOpen(true)
        } catch (e) {
            setActionError(extractErrorMessage(e, t("adminTokens.details_load_error")))
        } finally {
            setBusy(false)
        }
    }

    function openConfirm(tok: AdminToken) {
        if (!tok.id) {
            setActionError(t("adminTokens.invalid_id"))
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
        setActionError(null)
        setFormError(null)
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
                notify({ severity: "success", message: t("adminTokens.updated") })
            } else {
                const res = await CreateAdminToken({
                    name: form.name || "",
                    expiration: form.neverExpires ? null : form.expiration ? getIsoDateString(form.expiration) : null,
                    neverExpires: form.neverExpires || undefined,
                    scope: form.scope ? form.scope.split(",").map((s) => s.trim()) : undefined,
                })
                notify({ severity: "success", message: t("adminTokens.created") })
                // show secret if returned
                if ("secretToken" in res && (res as unknown as { secretToken?: string }).secretToken) {
                    setCreatedSecret((res as unknown as { secretToken?: string }).secretToken ?? null)
                    setCreatedSecretOpen(true)
                }
            }
            setFormOpen(false)
            await load()
        } catch (e) {
            setFormError(extractErrorMessage(e, t("adminTokens.save_error")))
        } finally {
            setBusy(false)
        }
    }

    async function handleDelete() {
        if (!current) return
        if (!current.id) {
            setActionError(t("adminTokens.invalid_id"))
            return
        }
        setActionError(null)
        setBusy(true)
        try {
            await DeleteAdminToken({ id: current.id })
            notify({ severity: "success", message: t("adminTokens.deleted") })
            setConfirmOpen(false)
            await load()
        } catch (e) {
            setConfirmOpen(false)
            setActionError(extractErrorMessage(e, t("adminTokens.delete_error")))
        } finally {
            setBusy(false)
        }
    }

    return (
        <Box>
            <PageHeader
                title={t("dashboard.adminTokens")}
                subtitle={t("dashboard.adminTokens_desc")}
                badge={projectBadge(selectedProject)}
                action={
                    <Button variant="contained" onClick={openCreate} sx={{ whiteSpace: "nowrap" }}>
                        {t("adminTokens.token_add")}
                    </Button>
                }
            >
                {actionError && (
                    <Alert severity="error" onClose={() => setActionError(null)} sx={{ mb: 2 }}>
                        {actionError}
                    </Alert>
                )}
            </PageHeader>

            <DataTable<AdminToken>
                rows={tokens}
                getRowId={(tok, index) => tok.id ?? `row-${index}`}
                loading={loading}
                error={loadError}
                errorTitle={t("adminTokens.load_error_title")}
                retryLabel={t("common.retry")}
                onRetry={() => { void load() }}
                tableLabel={t("dashboard.adminTokens") as string}
                columns={[
                    {
                        id: "id",
                        header: t("keys.id_label"),
                        cell: (tok) => <Typography variant="code">{tok.id ?? t("common.fromconfig")}</Typography>,
                        sortValue: (tok) => tok.id ?? "",
                        minWidth: 140,
                    },
                    {
                        id: "created",
                        header: t("adminTokens.created"),
                        cell: (tok) => (tok.created ? formatDateTime(tok.created, i18n.language) : t("common.fromconfig")),
                        sortValue: (tok) => (tok.created ? new Date(tok.created) : null),
                        minWidth: 150,
                    },
                    {
                        id: "name",
                        header: t("adminTokens.name"),
                        cell: (tok) => tok.name ?? t("common.fromconfig"),
                        sortValue: (tok) => tok.name ?? "",
                        minWidth: 140,
                    },
                    {
                        id: "expiration",
                        header: t("adminTokens.expiration"),
                        cell: (tok) => (tok.expiration ? formatDateTime(tok.expiration, i18n.language) : t("common.never_expire")),
                        sortValue: (tok) => (tok.expiration ? new Date(tok.expiration) : null),
                        minWidth: 150,
                    },
                    {
                        id: "expired",
                        header: t("adminTokens.expired"),
                        cell: (tok) => (tok.expired ? t("common.yes") : t("common.no")),
                        sortValue: (tok) => tok.expired ?? false,
                        minWidth: 90,
                    },
                    {
                        id: "scope",
                        header: t("adminTokens.scope"),
                        cell: (tok) => (tok.scope || []).join(", "),
                        sortValue: (tok) => (tok.scope || []).join(", "),
                        truncate: true,
                        textValue: (tok) => (tok.scope || []).join(", "),
                        minWidth: 180,
                    },
                    {
                        id: "actions",
                        header: t("common.actions"),
                        align: "right" as const,
                        minWidth: 120,
                        cell: (tok) => (
                            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                                <Tooltip title={t("adminTokens.view") as string}>
                                    <span>
                                        <IconButton
                                            size="small"
                                            sx={{ width: 32, height: 32 }}
                                            aria-label={`${t("adminTokens.view") as string} ${tok.name ?? tok.id ?? ""}`}
                                            onClick={() => { void openView(tok) }}
                                        >
                                            <VisibilityIcon fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Tooltip title={t("adminTokens.edit") as string}>
                                    <span>
                                        <IconButton
                                            size="small"
                                            sx={{ width: 32, height: 32 }}
                                            aria-label={`${t("adminTokens.edit") as string} ${tok.name ?? tok.id ?? ""}`}
                                            onClick={() => openEdit(tok)}
                                        >
                                            <EditIcon fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                                <Tooltip title={t("adminTokens.delete") as string}>
                                    <span>
                                        <IconButton
                                            size="small"
                                            color="error"
                                            sx={{ width: 32, height: 32 }}
                                            aria-label={`${t("adminTokens.delete") as string} ${tok.name ?? tok.id ?? ""}`}
                                            onClick={() => openConfirm(tok)}
                                        >
                                            <DeleteIcon fontSize="small" />
                                        </IconButton>
                                    </span>
                                </Tooltip>
                            </Stack>
                        ),
                    },
                ] satisfies DataTableColumn<AdminToken>[]}
                searchValue={(tok) => [tok.id ?? "", tok.name ?? "", (tok.scope || []).join(" ")].join(" ")}
                defaultSort={{ id: "created", dir: "desc" }}
                pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
                emptyState={{
                    icon: <TokenOutlinedIcon sx={{ fontSize: 48, color: "text.disabled" }} />,
                    title: t("adminTokens.empty") as string,
                    primaryAction: { label: t("adminTokens.token_add") as string, onClick: openCreate },
                }}
            />

            {/* Create / Edit Dialog */}
            <Dialog
                open={formOpen}
                onClose={closeForm}
                fullWidth
                maxWidth="sm"
                slotProps={{
                    paper: {
                        component: "form",
                        onSubmit: (event: SubmitEvent<HTMLDivElement>) => {
                            event.preventDefault()
                            handleFormSubmit()
                        },
                    },
                }}
            >
                <DialogTitle>{editing ? t("adminTokens.edit_title") : t("adminTokens.create_title")}</DialogTitle>
                <DialogContent>
                    <Stack spacing={2} sx={{ mt: 1 }}>
                        {formError && (
                            <Alert severity="error" onClose={() => setFormError(null)}>
                                {formError}
                            </Alert>
                        )}
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
                                slotProps={{
                                    inputLabel: { shrink: true }
                                }}
                            />
                        )}
                    </Stack>
                </DialogContent>
                <DialogActions>
                    <Button onClick={closeForm}>{t("common.cancel")}</Button>
                    <Button type="submit" variant="contained" disabled={busy} sx={SUBMIT_BUTTON_SX}>
                        {t("common.save")}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* View Dialog */}
            <Dialog open={viewOpen} onClose={() => setViewOpen(false)} fullWidth maxWidth="sm">
                <DialogTitle>{t("adminTokens.details")}</DialogTitle>
                <DialogContent>
                    {busy && <CircularProgress />}
                    {current && (
                        <Box sx={{ whiteSpace: "pre-wrap" }}>
                            <b>{t("adminTokens.name")}:</b> {current.name}
                            <br />
                            <b>ID:</b> {current.id}
                            <br />
                            <b>{t("adminTokens.created")}:</b> {current.created ? formatDateTime(current.created, i18n.language) : t("common.fromconfig")}
                            <br />
                            <b>{t("adminTokens.expiration")}:</b> {current.expiration ? formatDateTime(current.expiration, i18n.language) : t("common.never_expire")}
                            <br />
                            <b>{t("adminTokens.scope")}:</b> {(current.scope || []).join(", ")}
                        </Box>
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
                    <Button color="error" variant="contained" onClick={() => { void handleDelete() }} disabled={busy} sx={SUBMIT_BUTTON_SX}>
                        {t("common.delete")}
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
                    <Typography variant="body2">{t("adminTokens.created_secret_msg")}</Typography>
                    <Box sx={{ wordBreak: "break-all" }}>{createdSecret}</Box>
                </DialogContent>
                <DialogActions>
                    <Button
                        onClick={() => {
                            void navigator.clipboard?.writeText(createdSecret || "")
                            notify({ severity: "success", message: t("common.copied") })
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

        </Box>
    );
}