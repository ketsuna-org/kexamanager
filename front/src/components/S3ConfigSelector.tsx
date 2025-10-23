import { useState, useEffect } from "react"
import { useTranslation } from "react-i18next"
import FormControl from "@mui/material/FormControl"
import InputLabel from "@mui/material/InputLabel"
import Select from "@mui/material/Select"
import MenuItem from "@mui/material/MenuItem"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import CircularProgress from "@mui/material/CircularProgress"
import Alert from "@mui/material/Alert"
import { GetS3Configs, type S3Config } from "../utils/apiWrapper"

interface S3ConfigSelectorProps {
    selectedConfigId: number | null
    onConfigChange: (configId: number | null) => void
    label?: string
}

export default function S3ConfigSelector({ selectedConfigId, onConfigChange, label }: S3ConfigSelectorProps) {
    const { t } = useTranslation()
    const [configs, setConfigs] = useState<S3Config[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const loadConfigs = async () => {
            try {
                setLoading(true)
                const s3Configs = await GetS3Configs()
                setConfigs(s3Configs)
                setError(null)

                // Auto-select first config if none selected
                if (s3Configs.length > 0 && selectedConfigId === null) {
                    onConfigChange(s3Configs[0].id)
                }
            } catch (err) {
                setError(err instanceof Error ? err.message : 'Failed to load S3 configurations')
            } finally {
                setLoading(false)
            }
        }

        loadConfigs()
    }, [selectedConfigId, onConfigChange])

    if (loading) {
        return (
            <Box display="flex" alignItems="center" gap={1}>
                <CircularProgress size={20} />
                <Typography variant="body2">{t("dashboard.loading_configs", "Loading configurations...")}</Typography>
            </Box>
        )
    }

    if (error) {
        return (
            <Alert severity="error" sx={{ mb: 2 }}>
                {error}
            </Alert>
        )
    }

    if (configs.length === 0) {
        return (
            <Alert severity="warning" sx={{ mb: 2 }}>
                {t("dashboard.no_configs", "No S3 configurations found. Please create one in the S3 Configurations page.")}
            </Alert>
        )
    }

    return (
        <FormControl fullWidth size="small">
            <InputLabel>
                {label || t("dashboard.select_config", "Select S3 Configuration")}
            </InputLabel>
            <Select
                value={selectedConfigId || ''}
                onChange={(e) => onConfigChange(e.target.value ? Number(e.target.value) : null)}
                label={label || t("dashboard.select_config", "Select S3 Configuration")}
            >
                {configs.map((config) => (
                    <MenuItem key={config.id} value={config.id}>
                        {config.name} ({config.type === 'garage' ? 'Garage' : 'S3'})
                    </MenuItem>
                ))}
            </Select>
        </FormControl>
    )
}
