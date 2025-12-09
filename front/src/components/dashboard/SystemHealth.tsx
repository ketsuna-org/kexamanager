import { Box, Card, Typography } from "@mui/material"
import { useEffect, useState } from "react"

// Remove hardcoded services array

const SystemHealth = () => {
    const [services, setServices] = useState<Array<{ name: string, status: string, color: string }>>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchHealth = async () => {
            try {
                setLoading(true);
                setError(null);
                const res = await fetch("/api/health");
                if (!res.ok) throw new Error("Failed to fetch health data");
                const data = await res.json();
                // Expecting data to be an array of { name, status, color }
                setServices(data);
            } catch (err: any) {
                setError(err.message || "Unknown error");
            } finally {
                setLoading(false);
            }
        };
        fetchHealth();
    }, []);

    return (
        <Card sx={{ p: 3, height: "100%" }}>
            <Typography variant="h6" sx={{ mb: 3 }}>System Health</Typography>
            {loading ? (
                <Typography variant="body2" color="text.secondary">Loading...</Typography>
            ) : error ? (
                <Typography variant="body2" color="error.main">Error: {error}</Typography>
            ) : (
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
            )}
        </Card>
    )
}

export default SystemHealth
