import { Box, Card, Typography } from "@mui/material"
import type { LucideIcon } from "lucide-react"

interface StatCardProps {
    label: string
    value: string
    change?: string
    changeType?: "positive" | "negative" | "neutral"
    period?: string
    icon: LucideIcon
}

const StatCard = ({ label, value, change, changeType = "positive", period, icon: Icon }: StatCardProps) => {
    return (
        <Card sx={{ p: 3, height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "start", mb: 2 }}>
                <Typography variant="body2" color="text.secondary">
                    {label}
                </Typography>
                <Box sx={{ p: 1, borderRadius: 1.5, bgcolor: "rgba(255,255,255,0.03)", color: "text.secondary" }}>
                    <Icon size={18} />
                </Box>
            </Box>
            <Box>
                <Typography variant="h4" sx={{ fontWeight: 600, mb: 1 }}>
                    {value}
                </Typography>
                {change && (
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography
                            variant="caption"
                            sx={{
                                color: changeType === "positive" ? "success.main" : changeType === "negative" ? "error.main" : "text.secondary",
                                fontWeight: 600,
                                bgcolor: changeType === "positive" ? "rgba(16, 185, 129, 0.1)" : changeType === "negative" ? "rgba(239, 68, 68, 0.1)" : "transparent",
                                px: 0.5, py: 0.25, borderRadius: 0.5
                            }}
                        >
                            {change}
                        </Typography>
                        {period && (
                            <Typography variant="caption" color="text.secondary">
                                {period}
                            </Typography>
                        )}
                    </Box>
                )}
            </Box>
        </Card>
    )
}

export default StatCard
