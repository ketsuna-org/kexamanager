import { Box, Card, Typography } from "@mui/material"

const deployments = [
    { action: "Update function", target: "process-order", time: "2h ago" },
    { action: "Update function", target: "process-order", time: "3h ago" },
    { action: "Update function", target: "process-order", time: "3h ago" },
]

const RecentDeployments = () => {
    return (
        <Card sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Recent Deployments</Typography>
            <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {deployments.map((d, i) => (
                    <Box key={i} sx={{
                        p: 1.5,
                        bgcolor: "rgba(255,255,255,0.02)",
                        borderRadius: 1,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center"
                    }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                            <Box sx={{ width: 6, height: 6, borderRadius: "50%", bgcolor: "success.main" }} />
                            <Typography variant="body2" sx={{ color: "text.secondary" }}>
                                {d.action} <Box component="span" sx={{ color: "text.primary", bgcolor: "rgba(0,0,0,0.2)", px: 0.5, borderRadius: 0.5, fontFamily: "monospace" }}>{d.target}</Box>
                            </Typography>
                        </Box>
                        <Typography variant="caption" color="text.secondary">
                            {d.time}
                        </Typography>
                    </Box>
                ))}
            </Box>
        </Card>
    )
}

export default RecentDeployments
