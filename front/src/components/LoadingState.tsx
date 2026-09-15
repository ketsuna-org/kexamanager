import { useTranslation } from "react-i18next"

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

export default function LoadingState({ type = "spinner", message, size = "medium", rows = 3 }: LoadingStateProps) {
    const { t } = useTranslation()
    /** Libelle resolu par i18next ; la prop `message` reste une surcharge optionnelle. */
    const label = message ?? t("common.loading")

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
            <Box role="status" aria-label={label} aria-busy="true" sx={{ width: "100%" }}>
                {Array.from({ length: rows }).map((_, index) => (
                    <Skeleton key={index} variant="rectangular" height={60} sx={{ mb: 1, borderRadius: 1 }} animation="wave" />
                ))}
            </Box>
        )
    }

    return (
        <Box
            role="status"
            aria-live="polite"
            aria-label={label}
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
            {label && (
                <Typography
                    variant="body2"
                    sx={{
                        color: "text.secondary",
                        fontWeight: 500
                    }}>
                    {label}
                </Typography>
            )}
        </Box>
    );
}
