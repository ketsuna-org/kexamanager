import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import Button from "@mui/material/Button"
import Alert from "@mui/material/Alert"
import AlertTitle from "@mui/material/AlertTitle"
import ErrorOutlinedIcon from "@mui/icons-material/ErrorOutlined"
import RefreshIcon from "@mui/icons-material/Refresh"

interface ErrorStateProps {
    title?: string
    message?: string
    onRetry?: () => void
    retryLabel?: string
    severity?: "error" | "warning" | "info"
    variant?: "alert" | "centered"
}

export default function ErrorState({
    title = "Something went wrong",
    message = "An error occurred while loading the data. Please try again.",
    onRetry,
    retryLabel = "Try Again",
    severity = "error",
    variant = "alert",
}: ErrorStateProps) {
    if (variant === "centered") {
        return (
            <Box
                sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    py: 6,
                    textAlign: "center",
                    gap: 2,
                }}
            >
                <Box
                    sx={{
                        p: 2,
                        borderRadius: "50%",
                        bgcolor: `${severity}.light`,
                        color: `${severity}.main`,
                        mb: 1,
                    }}
                >
                    <ErrorOutlinedIcon sx={{ fontSize: 48 }} />
                </Box>

                <Typography variant="h6" sx={{
                    fontWeight: 600
                }}>
                    {title}
                </Typography>

                <Typography
                    variant="body1"
                    sx={{
                        color: "text.secondary",
                        maxWidth: 400,
                        lineHeight: 1.6
                    }}>
                    {message}
                </Typography>

                {onRetry && (
                    <Button variant="contained" startIcon={<RefreshIcon />} onClick={onRetry} sx={{ mt: 2 }}>
                        {retryLabel}
                    </Button>
                )}
            </Box>
        );
    }

    return (
        <Alert
            severity={severity}
            sx={{ mb: 2 }}
            action={
                onRetry ? (
                    <Button color="inherit" size="small" startIcon={<RefreshIcon />} onClick={onRetry}>
                        {retryLabel}
                    </Button>
                ) : undefined
            }
        >
            {title && <AlertTitle>{title}</AlertTitle>}
            {message}
        </Alert>
    )
}
