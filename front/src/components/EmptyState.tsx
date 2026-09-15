import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Stack from "@mui/material/Stack"
import Typography from "@mui/material/Typography"
import type { SvgIconComponent } from "@mui/icons-material"

export type EmptyStateAction = {
    label: string
    onClick: () => void
    icon?: SvgIconComponent
}

interface EmptyStateProps {
    title: string
    description?: string
    icon?: SvgIconComponent
    primaryAction?: EmptyStateAction
    secondaryAction?: EmptyStateAction
    size?: "page" | "inline"
}

export default function EmptyState({ title, description, icon: Icon, primaryAction, secondaryAction, size = "page" }: EmptyStateProps) {
    const renderAction = (action: EmptyStateAction, variant: "contained" | "text", small: boolean) => {
        const ActionIcon = action.icon
        return (
            <Button
                variant={variant}
                size={small ? "small" : "medium"}
                startIcon={ActionIcon ? <ActionIcon /> : undefined}
                onClick={action.onClick}
            >
                {action.label}
            </Button>
        )
    }

    if (size === "inline") {
        return (
            <Stack
                direction="row"
                spacing={2}
                sx={{
                    alignItems: "center",
                    justifyContent: "center",
                    flexWrap: "wrap",
                    rowGap: 1,
                    py: 3,
                    textAlign: "left",
                }}
            >
                {Icon && (
                    <Box
                        sx={{
                            width: 40,
                            height: 40,
                            borderRadius: "50%",
                            bgcolor: "action.hover",
                            color: "text.secondary",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            flexShrink: 0,
                        }}
                    >
                        <Icon sx={{ fontSize: 22 }} />
                    </Box>
                )}
                <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
                        {title}
                    </Typography>
                    {description && (
                        <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {description}
                        </Typography>
                    )}
                </Box>
                {primaryAction && renderAction(primaryAction, "contained", true)}
                {secondaryAction && renderAction(secondaryAction, "text", true)}
            </Stack>
        )
    }

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                textAlign: "center",
                py: 6,
                gap: 2,
            }}
        >
            {Icon && (
                <Box
                    sx={{
                        width: 96,
                        height: 96,
                        borderRadius: "50%",
                        bgcolor: "action.hover",
                        color: "text.secondary",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                    }}
                >
                    <Icon sx={{ fontSize: 44 }} />
                </Box>
            )}

            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {title}
            </Typography>

            {description && (
                <Typography variant="body2" sx={{ color: "text.secondary", maxWidth: 420, lineHeight: 1.6 }}>
                    {description}
                </Typography>
            )}

            {(primaryAction || secondaryAction) && (
                <Stack direction="row" spacing={2} sx={{ mt: 1, flexWrap: "wrap", justifyContent: "center", rowGap: 1 }}>
                    {primaryAction && renderAction(primaryAction, "contained", false)}
                    {secondaryAction && renderAction(secondaryAction, "text", false)}
                </Stack>
            )}
        </Box>
    )
}
