import { useState, useEffect, useCallback } from "react"
import {
    Box,
    Button,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    Alert,
    CircularProgress,
    IconButton,
    Chip,
} from "@mui/material"
import { Edit, Delete, PersonAdd } from "@mui/icons-material"
import { useTranslation } from "react-i18next"
import { adminGet, adminPost, adminPut, adminDelete } from "../../utils/adminClient"
import type { ApiError } from "../../utils/adminClient"
import ConfirmDialog from "../../components/ConfirmDialog"
import PageHeader from "../../components/PageHeader"
import DataTable, { type DataTableColumn } from "../../components/data/DataTable"
import { formatDateTime } from "../../utils/format"

interface User {
    ID: number
    CreatedAt: string
    UpdatedAt: string
    username: string
    role: "admin" | "user"
}

export default function UserManager() {
    const [users, setUsers] = useState<User[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [error, setError] = useState("")
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [formData, setFormData] = useState({
        username: "",
        password: "",
        role: "user" as "admin" | "user",
    })
    const [saving, setSaving] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<User | null>(null)
    const [deleting, setDeleting] = useState(false)
    const { t, i18n } = useTranslation()

    const loadUsers = useCallback(async () => {
        try {
            setLoading(true)
            const response = await adminGet<User[]>("/auth/users")
            setUsers(response)
            setLoadError(null)
        } catch (err) {
            const apiError = err as ApiError
            setLoadError(apiError.message || t("common.load_error"))
        } finally {
            setLoading(false)
        }
    }, [t])

    useEffect(() => {
        loadUsers()
    }, [loadUsers])

    const handleOpenDialog = (user?: User) => {
        setError("")
        if (user) {
            setEditingUser(user)
            setFormData({
                username: user.username,
                password: "",
                role: user.role,
            })
        } else {
            setEditingUser(null)
            setFormData({
                username: "",
                password: "",
                role: "user",
            })
        }
        setDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setDialogOpen(false)
        setEditingUser(null)
        setError("")
    }

    const handleSave = async () => {
        if (!formData.username) {
            setError(t("userManager.errorUsername"))
            return
        }

        if (!editingUser && !formData.password) {
            setError(t("userManager.errorPassword"))
            return
        }

        try {
            setSaving(true)
            setError("")

            if (editingUser) {
                // Update existing user
                const updateData: {
                    username: string
                    role: string
                    password?: string
                } = {
                    username: formData.username,
                    role: formData.role,
                }
                if (formData.password) {
                    updateData.password = formData.password
                }
                await adminPut(`/auth/users/${editingUser.ID}`, updateData)
            } else {
                // Create new user
                await adminPost("/auth/create-user", formData)
            }

            await loadUsers()
            handleCloseDialog()
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to save user")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!pendingDelete) return

        try {
            setDeleting(true)
            setError("")
            await adminDelete(`/auth/users/${pendingDelete.ID}`)
            setPendingDelete(null)
            await loadUsers()
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to delete user")
        } finally {
            setDeleting(false)
        }
    }

    const requestDelete = (user: User) => {
        if (user.username === "root") {
            setError(t("userManager.errorDeleteRoot"))
            return
        }
        setError("")
        setPendingDelete(user)
    }

    const userColumns: DataTableColumn<User>[] = [
        {
            id: "username",
            header: t("userManager.username"),
            minWidth: 200,
            sortValue: (user) => user.username,
            cell: (user) => (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                    {user.username}
                    {user.username === "root" && <Chip label="SYSTEM" size="small" color="warning" />}
                </Box>
            ),
        },
        {
            id: "role",
            header: t("userManager.role"),
            minWidth: 120,
            sortValue: (user) => user.role,
            cell: (user) => (
                <Chip label={user.role.toUpperCase()} color={user.role === "admin" ? "primary" : "default"} size="small" />
            ),
        },
        {
            id: "createdAt",
            header: t("userManager.createdAt"),
            minWidth: 180,
            sortValue: (user) => new Date(user.CreatedAt),
            cell: (user) => formatDateTime(user.CreatedAt, i18n.language),
        },
        {
            id: "actions",
            header: t("userManager.actions"),
            align: "right",
            minWidth: 110,
            cell: (user) =>
                user.username === "root" ? null : (
                    <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
                        <IconButton
                            size="small"
                            color="primary"
                            sx={{ width: 32, height: 32 }}
                            onClick={() => handleOpenDialog(user)}
                            aria-label={`${t("common.edit")} ${user.username}`}
                        >
                            <Edit fontSize="small" />
                        </IconButton>
                        <IconButton
                            size="small"
                            color="error"
                            sx={{ width: 32, height: 32 }}
                            onClick={() => requestDelete(user)}
                            aria-label={`${t("common.delete")} ${user.username}`}
                        >
                            <Delete fontSize="small" />
                        </IconButton>
                    </Box>
                ),
        },
    ]

    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                title={t("userManager.title")}
                subtitle={t("userManager.subtitle")}
                action={
                    <Button
                        variant="contained"
                        startIcon={<PersonAdd />}
                        onClick={() => handleOpenDialog()}
                    >
                        {t("userManager.addUser")}
                    </Button>
                }
            />

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
                    {error}
                </Alert>
            )}

            <DataTable<User>
                rows={users}
                getRowId={(user) => String(user.ID)}
                loading={loading}
                error={loadError}
                errorTitle={t("common.load_error") as string}
                retryLabel={t("common.retry") as string}
                onRetry={() => { void loadUsers() }}
                tableLabel={t("userManager.title") as string}
                columns={userColumns}
                searchValue={(user) => `${user.username} ${user.role}`}
                defaultSort={{ id: "username", dir: "asc" }}
                pagination={{ defaultRowsPerPage: 25, rowsPerPageOptions: [25, 50, 100] }}
                emptyState={{
                    icon: <PersonAdd sx={{ fontSize: 48, color: "text.disabled" }} />,
                    title: t("userManager.empty") as string,
                    primaryAction: { label: t("userManager.addUser") as string, onClick: () => handleOpenDialog() },
                }}
            />

            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingUser
                        ? t("userManager.editUser")
                        : t("userManager.addUser")}
                </DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <TextField
                        label={t("userManager.username")}
                        value={formData.username}
                        onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                        fullWidth
                        margin="normal"
                        required
                        disabled={editingUser?.username === "root"}
                    />
                    <TextField
                        label={
                            editingUser
                                ? t("userManager.newPassword")
                                : t("userManager.password")
                        }
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        fullWidth
                        margin="normal"
                        required={!editingUser}
                        helperText={
                            editingUser
                                ? t("userManager.passwordHelp")
                                : ""
                        }
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel>{t("userManager.role")}</InputLabel>
                        <Select
                            value={formData.role}
                            onChange={(e) =>
                                setFormData({ ...formData, role: e.target.value as "admin" | "user" })
                            }
                            disabled={editingUser?.username === "root"}
                        >
                            <MenuItem value="user">
                                {t("userManager.roleUser")}
                            </MenuItem>
                            <MenuItem value="admin">
                                {t("userManager.roleAdmin")}
                            </MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>
                        {t("common.cancel")}
                    </Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving}>
                        {saving ? <CircularProgress size={20} /> : t("common.save")}
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={!!pendingDelete}
                title={t("userManager.deleteUser")}
                message={t("userManager.confirmDelete", {
                    username: pendingDelete?.username || "" })}
                confirmLabel={t("common.delete")}
                confirmColor="error"
                loading={deleting}
                onConfirm={handleDelete}
                onClose={() => setPendingDelete(null)}
            />
        </Box>
    );
}
