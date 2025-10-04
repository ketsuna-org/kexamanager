import { useState, useEffect } from "react"
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

export default function S3Configs() {
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

    useEffect(() => {
        loadConfigs()
    }, [])

    const loadConfigs = async () => {
        try {
            setLoading(true)
            const response = await adminGet<S3Config[]>("/s3-configs")
            setConfigs(response)
        } catch (err) {
            const apiError = err as ApiError
            setError(apiError.message || "Failed to load configs")
        } finally {
            setLoading(false)
        }
    }

    const handleOpenDialog = (config?: S3Config) => {
        if (config) {
            setEditingConfig(config)
            setFormData({
                name: config.name,
                type: config.type,
                s3_url: config.s3_url,
                admin_url: config.admin_url || "",
                admin_token: "",
                client_id: config.client_id,
                client_secret: "", // Don't show existing secret
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

    const handleSave = async () => {
        if (!formData.name || !formData.s3_url) {
            setError("Name and S3 URL are required")
            return
        }

        if (formData.type === "garage" && !formData.admin_url) {
            setError("Admin URL is required for Garage type")
            return
        }

        if (formData.type === "garage" && !formData.admin_token) {
            setError("Admin Token is required for Garage type")
            return
        }

        // Pour Garage avec admin_token, client_id et client_secret sont optionnels
        // Pour S3 ou Garage sans admin_token, ils sont requis
        const needsCredentials = formData.type === "s3" || (formData.type === "garage" && !formData.admin_token)
        if (needsCredentials && (!formData.client_id || !formData.client_secret)) {
            setError("Client ID and Client Secret are required")
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

    return (
        <Box>
            <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
                <Typography variant="h4" component="h1">
                    {t("s3Configs.title", "S3 Configurations")}
                </Typography>
                <Button
                    variant="contained"
                    startIcon={<Add />}
                    onClick={() => handleOpenDialog()}
                >
                    {t("s3Configs.addConfig", "Add Config")}
                </Button>
            </Box>

            {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                    {error}
                </Alert>
            )}

            <Box display="flex" flexWrap="wrap" gap={3}>
                {configs.map((config) => (
                    <Box key={config.id} flex="1 1 300px" maxWidth="400px">
                        <Card>
                            <CardContent>
                                <Typography variant="h6" gutterBottom>
                                    {config.name}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    Type: {config.type.toUpperCase()}
                                </Typography>
                                <Typography variant="body2" color="text.secondary">
                                    URL: {config.s3_url}
                                </Typography>
                                {config.admin_url && (
                                    <Typography variant="body2" color="text.secondary">
                                        Admin: {config.admin_url}
                                    </Typography>
                                )}
                                <Typography variant="body2" color="text.secondary">
                                    Region: {config.region}
                                </Typography>
                            </CardContent>
                            <CardActions>
                                <Button
                                    size="small"
                                    startIcon={<Edit />}
                                    onClick={() => handleOpenDialog(config)}
                                >
                                    {t("common.edit", "Edit")}
                                </Button>
                                <Button
                                    size="small"
                                    color="error"
                                    startIcon={<Delete />}
                                    onClick={() => handleDelete(config)}
                                >
                                    {t("common.delete", "Delete")}
                                </Button>
                            </CardActions>
                        </Card>
                    </Box>
                ))}
            </Box>

            <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
                <DialogTitle>
                    {editingConfig ? t("s3Configs.editConfig", "Edit Config") : t("s3Configs.addConfig", "Add Config")}
                </DialogTitle>
                <DialogContent>
                    <TextField
                        label={t("s3Configs.name", "Name")}
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        fullWidth
                        margin="normal"
                        required
                    />
                    <FormControl fullWidth margin="normal">
                        <InputLabel>{t("s3Configs.type", "Type")}</InputLabel>
                        <Select
                            value={formData.type}
                            onChange={(e) => setFormData({ ...formData, type: e.target.value as "garage" | "s3" })}
                        >
                            <MenuItem value="s3">S3</MenuItem>
                            <MenuItem value="garage">Garage</MenuItem>
                        </Select>
                    </FormControl>
                    <TextField
                        label={t("s3Configs.s3Url", "S3 URL")}
                        value={formData.s3_url}
                        onChange={(e) => setFormData({ ...formData, s3_url: e.target.value })}
                        fullWidth
                        margin="normal"
                        required
                        placeholder="https://s3.example.com"
                    />
                    {formData.type === "garage" && (
                        <TextField
                            label={t("s3Configs.adminUrl", "Admin URL")}
                            value={formData.admin_url}
                            onChange={(e) => setFormData({ ...formData, admin_url: e.target.value })}
                            fullWidth
                            margin="normal"
                            required
                            placeholder="https://garage.example.com"
                        />
                    )}
                    {formData.type === "garage" && (
                        <TextField
                            label={t("s3Configs.adminToken", "Admin Token")}
                            type="password"
                            value={formData.admin_token}
                            onChange={(e) => setFormData({ ...formData, admin_token: e.target.value })}
                            fullWidth
                            margin="normal"
                            required
                            placeholder="Admin API token for Garage"
                        />
                    )}
                    {(() => {
                        const needsCredentials = formData.type === "s3" || (formData.type === "garage" && !formData.admin_token)
                        return (
                            <>
                                <TextField
                                    label={needsCredentials ? t("s3Configs.clientId", "Client ID") + " *" : t("s3Configs.clientId", "Client ID")}
                                    value={formData.client_id}
                                    onChange={(e) => setFormData({ ...formData, client_id: e.target.value })}
                                    fullWidth
                                    margin="normal"
                                    required={needsCredentials}
                                    placeholder={needsCredentials ? "Required" : "Optional when using Admin Token"}
                                />
                                <TextField
                                    label={needsCredentials ? t("s3Configs.clientSecret", "Client Secret") + " *" : t("s3Configs.clientSecret", "Client Secret")}
                                    type="password"
                                    value={formData.client_secret}
                                    onChange={(e) => setFormData({ ...formData, client_secret: e.target.value })}
                                    fullWidth
                                    margin="normal"
                                    required={needsCredentials}
                                    placeholder={needsCredentials ? "Required" : "Optional when using Admin Token"}
                                />
                            </>
                        )
                    })()}
                    <TextField
                        label={t("s3Configs.region", "Region")}
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
                        label={t("s3Configs.forcePathStyle", "Force Path Style")}
                    />
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog} disabled={saving}>
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
