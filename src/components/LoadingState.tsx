import Box from "@mui/material/Box"
import CircularProgress from "@mui/material/CircularProgress"
import Typography from "@mui/material/Typography"
import Skeleton from "@mui/material/Skeleton"

interface LoadingStateProps {
    type?: "spinner" | "skeleton"
    message?: string
    size?: "small" | "medium" | "large"
    rows?: number
}

export default function LoadingState({ type = "spinner", message = "Loading...", size = "medium", rows = 3 }: LoadingStateProps) {
    const getSize = () => {
        switch (size) {
            case "small":
                return 24
            case "large":
                return 60
            default:
                return 40
        }
    }

    if (type === "skeleton") {
        return (
            <Box sx={{ width: "100%" }}>
                {Array.from({ length: rows }).map((_, index) => (
                    <Skeleton key={index} variant="rectangular" height={60} sx={{ mb: 1, borderRadius: 1 }} animation="wave" />
                ))}
            </Box>
        )
    }

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                py: 4,
                gap: 2,
            }}
        >
            <CircularProgress size={getSize()} thickness={4} />
            {message && (
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>
                    {message}
                </Typography>
            )}
        </Box>
    )
}
