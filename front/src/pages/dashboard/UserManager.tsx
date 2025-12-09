import { useState, useEffect, useCallback } from "react"
import {
    Box,
    Typography,
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
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Alert,
    CircularProgress,
    IconButton,
    Chip,
} from "@mui/material"
import { Edit, Delete, PersonAdd } from "@mui/icons-material"
import { useTranslation } from "react-i18next"
import { adminGet, adminPost, adminPut, adminDelete } from "../../utils/adminClient"
import type { ApiError } from "../../utils/adminClient"

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
    const [error, setError] = useState("")
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingUser, setEditingUser] = useState<User | null>(null)
    const [formData, setFormData] = useState({
        username: "",
        password: "",
        role: "user" as "admin" | "user",
    })
    const [saving, setSaving] = useState(false)
    const { t } = useTranslation()

    const loadUsers = useCallback(async () => {
        try {
            setLoading(true)
            const response = await adminGet<User[]>("/auth/users")
            setUsers(response)
            setError("")
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to load users")
        } finally {
            setLoading(false)
        }
    }, [])

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
            setError(t("userManager.errorUsername", "Username is required"))
            return
        }

        if (!editingUser && !formData.password) {
            setError(t("userManager.errorPassword", "Password is required for new users"))
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

    const handleDelete = async (user: User) => {
        if (user.username === "root") {
            setError(t("userManager.errorDeleteRoot", "Cannot delete root user"))
            return
        }

        if (!confirm(t("userManager.confirmDelete", `Delete user "${user.username}"?`))) {
            return
        }

        try {
            await adminDelete(`/auth/users/${user.ID}`)
            await loadUsers()
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to delete user")
        }
    }

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
            </Box>
        )
    }

    return (
        <Box sx={{ p: 3 }}>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" component="h1">
                    {t("userManager.title", "Gestion des utilisateurs")}
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<PersonAdd />}
                    onClick={() => handleOpenDialog()}
                >
                    {t("userManager.addUser", "Nouvel utilisateur")}
                </Button>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
                    {error}
                </Alert>
            )}

            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell>{t("userManager.username", "Nom d'utilisateur")}</TableCell>
                            <TableCell>{t("userManager.role", "Rôle")}</TableCell>
                            <TableCell>{t("userManager.createdAt", "Créé le")}</TableCell>
                            <TableCell align="right">{t("userManager.actions", "Actions")}</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {users.map((user) => (
                            <TableRow key={user.ID}>
                                <TableCell>
                                    <Box display="flex" alignItems="center" gap={1}>
                                        {user.username}
                                        {user.username === "root" && (
                                            <Chip
                                                label="SYSTEM"
                                                size="small"
                                                color="warning"
                                            />
                                        )}
                                    </Box>
                                </TableCell>
                                <TableCell>
                                    <Chip
                                        label={user.role.toUpperCase()}
                                        color={user.role === "admin" ? "primary" : "default"}
                                        size="small"
                                    />
                                </TableCell>
                                <TableCell>
                                    {new Date(user.CreatedAt).toLocaleDateString()}
                                </TableCell>
                                <TableCell align="right">
                                    {user.username !== "root" && (
                                        <>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleOpenDialog(user)}
                                                color="primary"
                                            >
                                                <Edit />
                                            </IconButton>
                                            <IconButton
                                                size="small"
                                                onClick={() => handleDelete(user)}
                                                color="error"
                                            >
                                                <Delete />
                                            </IconButton>
                                        </>
                                    )}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingUser
                        ? t("userManager.editUser", "Modifier l'utilisateur")
                        : t("userManager.addUser", "Nouvel utilisateur")}
                </DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <TextField
                        label={t("userManager.username", "Nom d'utilisateur")}
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
                                ? t("userManager.newPassword", "Nouveau mot de passe (optionnel)")
                                : t("userManager.password", "Mot de passe")
                        }
                        type="password"
                        value={formData.password}
                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                        fullWidth
                        margin="normal"
                        required={!editingUser}
                        helperText={
                            editingUser
                                ? t("userManager.passwordHelp", "Laissez vide pour conserver le mot de passe actuel")
                                : ""
                        }
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel>{t("userManager.role", "Rôle")}</InputLabel>
                        <Select
                            value={formData.role}
                            onChange={(e) =>
                                setFormData({ ...formData, role: e.target.value as "admin" | "user" })
                            }
                            disabled={editingUser?.username === "root"}
                        >
                            <MenuItem value="user">
                                {t("userManager.roleUser", "Utilisateur")}
                            </MenuItem>
                            <MenuItem value="admin">
                                {t("userManager.roleAdmin", "Administrateur")}
                            </MenuItem>
                        </Select>
                    </FormControl>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>
                        {t("common.cancel", "Annuler")}
                    </Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving}>
                        {saving ? <CircularProgress size={20} /> : t("common.save", "Enregistrer")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
