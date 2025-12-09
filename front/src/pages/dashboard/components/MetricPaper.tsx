import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import { useTheme } from "@mui/material/styles"

interface MetricPaperProps {
    icon?: React.ReactNode
    label: string
    value: string
    trend?: "up" | "down" | "neutral"
    trendValue?: string
    color?: "primary" | "secondary" | "success" | "warning" | "error" | "info"
}

export default function MetricPaper({ icon, label, value, trend = "neutral", trendValue, color = "primary" }: MetricPaperProps) {
    const theme = useTheme()

    const getTrendColor = () => {
        switch (trend) {
            case "up":
                return theme.palette.success.main
            case "down":
                return theme.palette.error.main
            default:
                return theme.palette.text.secondary
        }
    }

    return (
        <Paper
            sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
                minHeight: "fit-content",
                position: "relative",
                overflow: "hidden",
                // Fond violet pur à 15% d'opacité
                bgcolor: 'rgba(127,0,255,0.15)',
                backgroundImage: 'none',
                transition: "transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out",
                // Supprimer toute bordure (y compris overrides thème)
                border: 'none',
                // Utilise la couleur en token pour conserver la compatibilité et éviter lint unused
                borderColor: `${color}.main`,
                "&:hover": {
                    transform: "translateY(-2px)",
                    boxShadow: theme.shadows[4],
                },
            }}
            elevation={2}
        >
            {/* Background decoration */}
            <Box
                sx={{
                    position: "absolute",
                    top: -20,
                    right: -20,
                    width: 80,
                    height: 80,
                    borderRadius: "50%",
                    bgcolor: theme.palette.mode === 'dark' ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.05)",
                }}
            />

            {/* Header with icon and trend */}
            {(icon || trendValue) && (
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 1 }}>
                    {icon && (
                        <Box
                            sx={{
                                p: 1.5,
                                borderRadius: 2,
                                // Fond des icônes: blanc (light) / noir (dark)
                                bgcolor: theme.palette.mode === 'dark' ? '#ffffff' : '#000000',
                                // Couleur par défaut interne (si texte/icône non MUI)
                                color: theme.palette.mode === 'dark' ? '#111827' : '#ffffff',
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: 2,
                                // Pas de bordure autour de l'icône
                                border: 'none',
                                "& .MuiSvgIcon-root": {
                                    fontSize: 24,
                                    // Icône: blanche (dark) / noire (light)
                                    color: `${theme.palette.mode === 'dark' ? '#111827' : '#ffffff'} !important`,
                                },
                            }}
                        >
                            {icon}
                        </Box>
                    )}

                    {trendValue && (
                        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            <Typography
                                variant="caption"
                                sx={{
                                    color: getTrendColor(),
                                    fontWeight: 600,
                                    fontSize: "0.7rem",
                                }}
                            >
                                {trend === "up" ? "↗" : trend === "down" ? "↘" : "→"} {trendValue}
                            </Typography>
                        </Box>
                    )}
                </Box>
            )}

            {/* Content */}
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                <Typography
                    variant="body2"
                    color="text.secondary"
                    sx={{
                        fontWeight: 500,
                        lineHeight: 1.3,
                        fontSize: "0.875rem",
                    }}
                >
                    {label}
                </Typography>

                <Typography
                    variant="h5"
                    sx={{
                        fontWeight: 700,
                        color: "text.primary",
                        lineHeight: 1.2,
                        fontSize: "1.5rem",
                    }}
                >
                    {value}
                </Typography>
            </Box>
        </Paper>
    )
}
