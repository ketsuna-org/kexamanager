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
    Card,
    CardContent,
    CardActions,
    Chip,
    Alert,
    CircularProgress,
    Switch,
    FormControlLabel,
    IconButton,
} from "@mui/material"
import { Add, Delete } from "@mui/icons-material"
import { useTranslation } from "react-i18next"
import { adminGet, adminPost, adminPut, adminDelete } from "../../utils/adminClient"
import type { ApiError } from "../../utils/adminClient"
import ConfirmDialog from "../../components/ConfirmDialog"
import PageHeader from "../../components/PageHeader"
import { useProject } from "../../contexts/ProjectContext"
import { projectBadge } from "./projectBadge"

interface ProjectsProps {
    selectedProject: number | null
    onSelectProject: (projectId: number | null) => void
    onProjectsChange: (projects: Array<{ id: number, name: string, admin_url?: string, type?: string }>) => void
}

interface S3Config {
    id: number
    CreatedAt: string
    UpdatedAt: string
    DeletedAt: string | null
    user_id: number
    name: string
    type: "garage" | "s3"
    s3_url: string
    admin_url?: string
    client_id: string
    region: string
    force_path_style: boolean
}

export default function Projects({ selectedProject, onSelectProject, onProjectsChange }: ProjectsProps) {
    const { selectedProject: activeProject } = useProject()
    const [configs, setConfigs] = useState<S3Config[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState("")
    const [dialogOpen, setDialogOpen] = useState(false)
    const [editingConfig, setEditingConfig] = useState<S3Config | null>(null)
    const [formData, setFormData] = useState({
        name: "",
        type: "s3" as "garage" | "s3",
        s3_url: "",
        admin_url: "",
        admin_token: "",
        client_id: "",
        client_secret: "",
        region: "us-east-1",
        force_path_style: true,
    })
    const [saving, setSaving] = useState(false)
    const [pendingDelete, setPendingDelete] = useState<S3Config | null>(null)
    const [deleting, setDeleting] = useState(false)
    const { t } = useTranslation()

    const loadConfigs = useCallback(async () => {
        try {
            setLoading(true)
            const response = await adminGet<S3Config[]>("/s3-configs")
            const data = Array.isArray(response) ? response : []
            setConfigs(data)
            // Update parent component with simplified config list
            onProjectsChange(data.map(c => ({ id: c.id, name: c.name, admin_url: c.admin_url, type: c.type })))
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to load configs")
            setConfigs([])
        } finally {
            setLoading(false)
        }
    }, [onProjectsChange])

    // Load configs on component mount only
    useEffect(() => {
        loadConfigs()
        // Use empty dependency to load only once
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    const handleOpenDialog = (config?: S3Config) => {
        setError("")  // Clear any previous errors
        if (config) {
            setEditingConfig(config)
            setFormData({
                name: config.name,
                type: config.type,
                s3_url: config.s3_url,
                admin_url: config.admin_url || "",
                admin_token: "",
                client_id: config.client_id,
                client_secret: "",
                region: config.region,
                force_path_style: config.force_path_style,
            })
        } else {
            setEditingConfig(null)
            setFormData({
                name: "",
                type: "s3",
                s3_url: "",
                admin_url: "",
                admin_token: "",
                client_id: "",
                client_secret: "",
                region: "us-east-1",
                force_path_style: true,
            })
        }
        setDialogOpen(true)
    }

    const handleCloseDialog = () => {
        setDialogOpen(false)
        setEditingConfig(null)
        setError("")
    }

    const handleSave = async () => {
        if (!formData.name || !formData.s3_url) {
            setError("Name and S3 URL are required")
            return
        }

        // Pour S3 ou Garage sans admin_url, ils sont requis
        const needsCredentials = formData.type === "s3" || (formData.type === "garage" && !formData.admin_url)
        if (needsCredentials && (!formData.client_id || !formData.client_secret)) {
            setError("Client ID and Client Secret are required for this configuration")
            return
        }

        try {
            setSaving(true)
            setError("")

            if (editingConfig) {
                await adminPut(`/s3-configs/update?id=${editingConfig.id}`, formData)
            } else {
                await adminPost("/s3-configs/create", formData)
            }

            await loadConfigs()
            handleCloseDialog()
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to save config")
        } finally {
            setSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!pendingDelete) return

        try {
            setDeleting(true)
            setError("")
            await adminDelete(`/s3-configs/delete?id=${pendingDelete.id}`)
            setPendingDelete(null)
            await loadConfigs()
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to delete config")
        } finally {
            setDeleting(false)
        }
    }

    if (loading) {
        return (
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                    minHeight: "200px"
                }}>
                <CircularProgress aria-label={t("common.loading")} />
            </Box>
        );
    }

    // Show projects list
    return (
        <Box sx={{ p: 3 }}>
            <PageHeader
                title={t("projects.title")}
                subtitle={t("projects.list_desc")}
                badge={projectBadge(activeProject)}
                action={
                    <Button
                        variant="contained"
                        startIcon={<Add />}
                        onClick={() => handleOpenDialog()}
                    >
                        {t("projects.addConfig")}
                    </Button>
                }
            />

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(350px, 1fr))",
                    gap: 3
                }}>
                {configs && configs.map((config) => (
                    <Card key={config.id} sx={{
                        height: "100%",
                        display: "flex",
                        flexDirection: "column",
                        transition: "transform 0.2s, border-color 0.2s",
                        "&:hover": {
                            borderColor: "primary.main",
                            transform: "translateY(-2px)"
                        }
                    }}>
                        <CardContent sx={{ flex: 1 }}>
                            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 2 }}>
                                <Typography variant="h6" sx={{
                                    fontWeight: 600
                                }}>
                                    {config.name}
                                </Typography>
                                <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                                    {config.id === selectedProject && (
                                        <Chip size="small" color="primary" label={t("projects.active")} />
                                    )}
                                    <Box sx={{
                                        px: 1, py: 0.5,
                                        borderRadius: 1,
                                        bgcolor: "rgba(255,255,255,0.05)",
                                        fontSize: "0.75rem",
                                        fontWeight: 600,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.05em",
                                        color: "text.secondary"
                                    }}>
                                        {config.type}
                                    </Box>
                                    <IconButton
                                        size="small"
                                        color="error"
                                        aria-label={`${t("common.delete")} ${config.name}`}
                                        onClick={() => setPendingDelete(config)}
                                        sx={{ ml: 1, mt: -0.5 }}
                                    >
                                        <Delete fontSize="small" />
                                    </IconButton>
                                </Box>
                            </Box>

                            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                                <Box sx={{ display: "flex", gap: 1 }}>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            color: "text.secondary",
                                            minWidth: 60
                                        }}>URL:</Typography>
                                    <Typography variant="body2" sx={{ fontFamily: "monospace", bgcolor: "rgba(0,0,0,0.2)", px: 0.5, borderRadius: 0.5 }}>
                                        {config.s3_url}
                                    </Typography>
                                </Box>
                                <Box sx={{ display: "flex", gap: 1 }}>
                                    <Typography
                                        variant="body2"
                                        sx={{
                                            color: "text.secondary",
                                            minWidth: 60
                                        }}>Region:</Typography>
                                    <Typography variant="body2">{config.region}</Typography>
                                </Box>
                            </Box>
                        </CardContent>
                        <CardActions sx={{ p: 2, pt: 0, justifyContent: "flex-end", gap: 1 }}>
                            <Button
                                size="small"
                                variant="outlined"
                                color="inherit"
                                aria-label={`${t("common.edit")} ${config.name}`}
                                onClick={() => handleOpenDialog(config)}
                            >
                                {t("common.edit")}
                            </Button>
                            <Button
                                size="small"
                                variant="contained"
                                color="primary"
                                aria-label={`${t("common.open")} ${config.name}`}
                                onClick={() => onSelectProject(config.id)}
                            >
                                {t("common.open")}
                            </Button>
                        </CardActions>
                    </Card>
                ))}
            </Box>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingConfig ? t("projects.editConfig") : t("projects.addConfig")}
                </DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <TextField
                        label={t("projects.name")}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        fullWidth
                        margin="normal"
                        required
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel id="project-type-label">{t("projects.type")}</InputLabel>
                        <Select
                            labelId="project-type-label"
                            id="project-type"
                            label={t("projects.type")}
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value as "garage" | "s3" })}
                        >
                            <MenuItem value="s3">S3</MenuItem>
                            <MenuItem value="garage">Garage</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        label={t("projects.s3Url")}
                        value={formData.s3_url}
                        onChange={(e) => setFormData({ ...formData, s3_url: e.target.value })}
                        fullWidth
                        margin="normal"
                        required
                    />
                    {formData.type === "garage" && (
                        <>
                            <TextField
                                label={t("projects.adminUrl")}
                                value={formData.admin_url}
                                onChange={(e) => setFormData({ ...formData, admin_url: e.target.value })}
                                fullWidth
                                margin="normal"
                            />
                            <TextField
                                label={t("projects.adminToken")}
                                value={formData.admin_token}
                                onChange={(e) => setFormData({ ...formData, admin_token: e.target.value })}
                                fullWidth
                                margin="normal"
                                type="password"
                            />
                        </>
                    )}
                    {(formData.type === "s3" || (formData.type === "garage" && !formData.admin_url)) && (
                        <>
                            <TextField
                                label={(formData.type === "s3" || (formData.type === "garage" && !formData.admin_url)) ? t("projects.clientId") + " *" : t("projects.clientId")}
                                value={formData.client_id}
                                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                                fullWidth
                                margin="normal"
                                required={formData.type === "s3" || (formData.type === "garage" && !formData.admin_url)}
                            />
                            <TextField
                                label={(formData.type === "s3" || (formData.type === "garage" && !formData.admin_url)) ? t("projects.clientSecret") + " *" : t("projects.clientSecret")}
                                value={formData.client_secret}
                                onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                                fullWidth
                                margin="normal"
                                type="password"
                                required={formData.type === "s3" || (formData.type === "garage" && !formData.admin_url)}
                            />
                        </>
                    )}
                    <TextField
                        label={t("projects.region")}
                        value={formData.region}
                        onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                        fullWidth
                        margin="normal"
                    />
                    <FormControlLabel
                        control={
                            <Switch
                                checked={formData.force_path_style}
                                onChange={(e) => setFormData({ ...formData, force_path_style: e.target.checked })}
                            />
                        }
                        label={t("projects.forcePathStyle")}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>
                        {t("common.cancel")}
                    </Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving} aria-busy={saving}>
                        {saving ? <CircularProgress size={20} aria-hidden="true" /> : t("common.save")}
                    </Button>
                </DialogActions>
            </Dialog>

            <ConfirmDialog
                open={!!pendingDelete}
                title={t("projects.deleteConfig")}
                message={t("projects.deleteConfigMessage", {
                    name: pendingDelete?.name || "" })}
                confirmLabel={t("common.delete")}
                confirmColor="error"
                loading={deleting}
                onConfirm={handleDelete}
                onClose={() => setPendingDelete(null)}
            />
        </Box>
    );
}
