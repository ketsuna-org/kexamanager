import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Chip from "@mui/material/Chip"

interface PageHeaderProps {
    title: string
    subtitle?: string
    badge?: {
        label: string
        color?: "primary" | "secondary" | "success" | "warning" | "error" | "info"
        variant?: "filled" | "outlined"
    }
    action?: React.ReactNode
    children?: React.ReactNode
}

export default function PageHeader({ title, subtitle, badge, action, children }: PageHeaderProps) {
    return (
        <Box sx={{ mb: 4 }}>
            <Box
                sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    mb: subtitle ? 1 : 2,
                    gap: 2,
                }}
            >
                <Box sx={{ flex: 1 }}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 0.5 }}>
                        <Typography
                            variant="h4"
                            component="h1"
                            sx={{
                                fontWeight: 700,
                                color: "text.primary",
                                lineHeight: 1.2,
                            }}
                        >
                            {title}
                        </Typography>
                        {badge && <Chip label={badge.label} color={badge.color || "primary"} variant={badge.variant || "filled"} size="small" sx={{ fontWeight: 600 }} />}
                    </Box>
                    {subtitle && (
                        <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.5 }}>
                            {subtitle}
                        </Typography>
                    )}
                </Box>
                {action && <Box sx={{ flexShrink: 0 }}>{action}</Box>}
            </Box>
            {children}
        </Box>
    )
}
