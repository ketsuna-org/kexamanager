import { Box, Card, Typography } from "@mui/material"

const services = [
    { name: "Database Engine (Postgres)", status: "Healthy", color: "success.main" },
    { name: "Auth Provider (Google)", status: "Operational", color: "success.main" },
    { name: "Storage (S3-Compat)", status: "Degraded", color: "warning.main" },
    { name: "Function Runtime (Node v20)", status: "Healthy", color: "success.main" },
]

const SystemHealth = () => {
    return (
        <Card sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 3 }}>System Health</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {services.map((s, i) => (
                    <Box key={i} sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <Typography variant="body2" color="text.secondary">
                            {s.name}
                        </Typography>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: s.color }} />
                            <Typography variant="body2" sx={{ fontWeight: 500, color: "text.primary" }}>
                                {s.status}
                            </Typography>
                        </Box>
                    </Box>
                ))}
            </Box>
        </Card>
    )
}

export default SystemHealth
