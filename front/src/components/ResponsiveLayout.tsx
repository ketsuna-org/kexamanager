import { Box } from "@mui/material"
import type { ReactNode } from "react"

interface ResponsiveLayoutProps {
    children: ReactNode
    maxContent?: boolean
}

export default function ResponsiveLayout({ children, maxContent = true }: ResponsiveLayoutProps) {
    return (
        <Box
            sx={{
                flex: maxContent ? 1 : "none",
                display: "flex",
                flexDirection: "column",
                overflow: maxContent ? "hidden" : "visible",
                height: maxContent ? "100%" : "auto",
                width: "100%",
            }}
        >
            {children}
        </Box>
    )
}

export function ResponsiveContent({ children }: { children: ReactNode }) {
    return (
        <Box
            sx={{
                flex: 1,
                overflow: "auto",
                width: "100%",
            }}
        >
            {children}
        </Box>
    )
}

export function ResponsiveHeader({ children }: { children: ReactNode }) {
    return (
        <Box
            sx={{
                flexShrink: 0,
                width: "100%",
                mb: 2,
            }}
        >
            {children}
        </Box>
    )
}