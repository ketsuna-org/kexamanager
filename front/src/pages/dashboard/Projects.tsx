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
    Alert,
    CircularProgress,
    Switch,
    FormControlLabel,
} from "@mui/material"
import { Add, Edit, Delete } from "@mui/icons-material"
import { useTranslation } from "react-i18next"
import { adminGet, adminPost, adminPut, adminDelete } from "../../utils/adminClient"
import type { ApiError } from "../../utils/adminClient"

interface ProjectsProps {
    selectedProject: number | null
    onSelectProject: (projectId: number | null) => void
    onProjectsChange: (projects: Array<{id: number, name: string}>) => void
}

interface S3Config {
    id: number
    user_id: number
    name: string
    type: "garage" | "s3"
    s3_url: string
    admin_url?: string
    admin_token?: string
    client_id: string
    region: string
    force_path_style: boolean
}

export default function Projects({ selectedProject, onSelectProject, onProjectsChange }: ProjectsProps) {
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
    const { t } = useTranslation()

    const loadConfigs = useCallback(async () => {
        try {
            setLoading(true)
            const response = await adminGet<S3Config[]>("/s3-configs")
            setConfigs(response)
            onProjectsChange(response.map(c => ({ id: c.id, name: c.name })))
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to load configs")
        } finally {
            setLoading(false)
        }
    }, [onProjectsChange])

    // Only load configs if we don't have them yet
    useEffect(() => {
        if (configs.length === 0) {
            loadConfigs()
        }
    }, [loadConfigs, configs.length])

    const handleOpenDialog = (config?: S3Config) => {
        setError("")  // Clear any previous errors
        if (config) {
            setEditingConfig(config)
            setFormData({
                name: config.name,
                type: config.type,
                s3_url: config.s3_url,
                admin_url: config.admin_url || "",
                admin_token: config.admin_token || "",
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

    const handleDelete = async (config: S3Config) => {
        if (!confirm(`Delete config "${config.name}"?`)) return

        try {
            await adminDelete(`/s3-configs/delete?id=${config.id}`)
            await loadConfigs()
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to delete config")
        }
    }

    if (loading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="200px">
                <CircularProgress />
            </Box>
        )
    }

    // If a project is selected, show project workspace
    if (selectedProject) {
        const project = configs.find(c => c.id === selectedProject)
        return (
            <Box>
                <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                    <Box>
                        <Button
                            variant="outlined"
                            onClick={() => onSelectProject(null)}
                            sx={{ mr: 2 }}
                        >
                            ← Back to Projects
                        </Button>
                        <Typography variant="h4" component="h1" sx={{ display: 'inline' }}>
                            Project: {project?.name || 'Unknown'}
                        </Typography>
                    </Box>
                </Box>
                <Typography variant="body1" color="text.secondary">
                    Project workspace - configure and manage your S3/Garage environment
                </Typography>
            </Box>
        )
    }

    // Show projects list
    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" component="h1">
                    {t("projects.title", "Projects")}
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => handleOpenDialog()}
                >
                    {t("projects.addConfig", "Add Project")}
                </Button>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(300px, 1fr))" gap={2}>
                {configs.map((config) => (
                    <Card key={config.id} sx={{ height: "fit-content" }}>
                        <CardContent>
                            <Typography key={`name-${config.id}`} variant="h6" gutterBottom>
                                {config.name}
                            </Typography>
                            <Typography key={`type-${config.id}`} variant="body2" color="text.secondary">
                                Type: {config.type.toUpperCase()}
                            </Typography>
                            <Typography key={`url-${config.id}`} variant="body2" color="text.secondary">
                                URL: {config.s3_url}
                            </Typography>
                            {config.admin_url && (
                                <Typography key={`admin-${config.id}`} variant="body2" color="text.secondary">
                                    Admin: {config.admin_url}
                                </Typography>
                            )}
                            <Typography key={`region-${config.id}`} variant="body2" color="text.secondary">
                                Region: {config.region}
                            </Typography>
                        </CardContent>
                        <CardActions>
                            <Button
                                key={`open-${config.id}`}
                                size="small"
                                color="primary"
                                variant="contained"
                                onClick={() => onSelectProject(config.id)}
                                sx={{ mr: 1 }}
                            >
                                Open Project
                            </Button>
                            <Button
                                key={`edit-${config.id}`}
                                size="small"
                                startIcon={<Edit />}
                                onClick={() => handleOpenDialog(config)}
                            >
                                {t("common.edit", "Edit")}
                            </Button>
                            <Button
                                key={`delete-${config.id}`}
                                size="small"
                                color="error"
                                startIcon={<Delete />}
                                onClick={() => handleDelete(config)}
                            >
                                {t("common.delete", "Delete")}
                            </Button>
                        </CardActions>
                    </Card>
                ))}
            </Box>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingConfig ? t("projects.editConfig", "Edit Project") : t("projects.addConfig", "Add Project")}
                </DialogTitle>
                <DialogContent>
                    {error && (
                        <Alert severity="error" sx={{ mb: 2 }}>
                            {error}
                        </Alert>
                    )}
                    <TextField
                        label={t("projects.name", "Name")}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        fullWidth
                        margin="normal"
                        required
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel>{t("projects.type", "Type")}</InputLabel>
                        <Select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value as "garage" | "s3" })}
                        >
                            <MenuItem value="s3">S3</MenuItem>
                            <MenuItem value="garage">Garage</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        label={t("projects.s3Url", "S3 URL")}
                        value={formData.s3_url}
                        onChange={(e) => setFormData({ ...formData, s3_url: e.target.value })}
                        fullWidth
                        margin="normal"
                        required
                    />
                    {formData.type === "garage" && (
                        <>
                            <TextField
                                label={t("projects.adminUrl", "Admin URL")}
                                value={formData.admin_url}
                                onChange={(e) => setFormData({ ...formData, admin_url: e.target.value })}
                                fullWidth
                                margin="normal"
                            />
                            <TextField
                                label={t("projects.adminToken", "Admin Token")}
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
                                label={(formData.type === "s3" || (formData.type === "garage" && !formData.admin_url)) ? t("projects.clientId", "Client ID") + " *" : t("projects.clientId", "Client ID")}
                                value={formData.client_id}
                                onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                                fullWidth
                                margin="normal"
                                required={formData.type === "s3" || (formData.type === "garage" && !formData.admin_url)}
                            />
                            <TextField
                                label={(formData.type === "s3" || (formData.type === "garage" && !formData.admin_url)) ? t("projects.clientSecret", "Client Secret") + " *" : t("projects.clientSecret", "Client Secret")}
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
                        label={t("projects.region", "Region")}
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
                        label={t("projects.forcePathStyle", "Force Path Style")}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog}>
                        {t("common.cancel", "Cancel")}
                    </Button>
                    <Button onClick={handleSave} variant="contained" disabled={saving}>
                        {saving ? <CircularProgress size={20} /> : t("common.save", "Save")}
                    </Button>
                </DialogActions>
            </Dialog>
        </Box>
    )
}
