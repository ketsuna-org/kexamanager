import { Fragment, useContext, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Link } from "react-router-dom"
import Box from "@mui/material/Box"
import IconButton from "@mui/material/IconButton"
import { Menu as MenuIcon } from "lucide-react"
import { k, layout } from "../theme"
import { ShellContext } from "./shellContext"


export interface Crumb {
    label: ReactNode
    to?: string
}

export interface PageTab {
    id: string
    label: ReactNode
    to: string
}

/**
 * One screen of the console: top bar (breadcrumbs and quick actions), optional
 * tabs, then the body with its heading. Every page goes through it so spacing
 * and the mobile menu button stay identical everywhere.
 */
export function Page({
    crumbs,
    topActions,
    title,
    description,
    actions,
    banner,
    tabs,
    activeTab,
    children,
    wide,
}: {
    crumbs: Crumb[]
    topActions?: ReactNode
    title?: ReactNode
    description?: ReactNode
    actions?: ReactNode
    banner?: ReactNode
    tabs?: PageTab[]
    activeTab?: string
    children: ReactNode
    wide?: boolean
}) {
    const { t } = useTranslation()
    const { openNav } = useContext(ShellContext)
    return (
        <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, minHeight: "100%" }}>
            <Box
                component="header"
                sx={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 1.5,
                    justifyContent: "space-between",
                    px: { xs: 2, md: 4 },
                    py: "10px",
                    borderBottom: `1px solid ${k.border}`,
                    minHeight: layout.topBar,
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
                    <IconButton onClick={openNav} aria-label={t("nav.open")} sx={{ display: { lg: "none" }, ml: -1 }}>
                        <MenuIcon />
                    </IconButton>
                    <Box component="nav" aria-label={t("nav.breadcrumb")} sx={{ display: "flex", alignItems: "center", gap: 1, color: k.text2, fontSize: 13, minWidth: 0, flexWrap: "wrap" }}>
                        {crumbs.map((crumb, index) => {
                            const last = index === crumbs.length - 1
                            return (
                                <Fragment key={index}>
                                    {index > 0 && <span aria-hidden>/</span>}
                                    {last ? (
                                        <Box component="b" aria-current="page" sx={{ color: k.text, fontWeight: 500, overflowWrap: "anywhere" }}>
                                            {crumb.label}
                                        </Box>
                                    ) : crumb.to ? (
                                        <Box component={Link} to={crumb.to} sx={{ color: k.text2, textDecoration: "none", "&:hover": { color: k.text } }}>
                                            {crumb.label}
                                        </Box>
                                    ) : (
                                        <span>{crumb.label}</span>
                                    )}
                                </Fragment>
                            )
                        })}
                    </Box>
                </Box>
                {topActions && <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap" }}>{topActions}</Box>}
            </Box>
            {banner}
            {tabs && (
                <Box component="nav" sx={{ display: "flex", gap: 0.5, borderBottom: `1px solid ${k.border}`, overflowX: "auto", px: { xs: 2, md: 4 } }}>
                    {tabs.map((tab) => {
                        const on = tab.id === activeTab
                        return (
                            <Box
                                key={tab.id}
                                component={Link}
                                to={tab.to}
                                aria-current={on ? "page" : undefined}
                                sx={{
                                    px: "14px",
                                    minHeight: 46,
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 1,
                                    color: on ? k.text : k.text2,
                                    textDecoration: "none",
                                    borderBottom: `2px solid ${on ? k.accent : "transparent"}`,
                                    mb: "-1px",
                                    whiteSpace: "nowrap",
                                    "&:hover": { color: k.text },
                                }}
                            >
                                {tab.label}
                            </Box>
                        )
                    })}
                </Box>
            )}
            <Box
                component="main"
                sx={{
                    p: { xs: "20px 16px 48px", md: "28px 32px 56px" },
                    display: "flex",
                    flexDirection: "column",
                    gap: 2.5,
                    maxWidth: wide ? "none" : layout.contentMax,
                    width: "100%",
                    minWidth: 0,
                }}
            >
                {(title || actions) && (
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 2, flexWrap: "wrap" }}>
                        <Box sx={{ minWidth: 0 }}>
                            {title && (
                                <Box component="h1" sx={{ m: 0, fontSize: 24, fontWeight: 600, letterSpacing: "-0.01em", overflowWrap: "anywhere" }}>
                                    {title}
                                </Box>
                            )}
                            {description && <Box sx={{ mt: 0.75, color: k.text2 }}>{description}</Box>}
                        </Box>
                        {actions && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{actions}</Box>}
                    </Box>
                )}
                {children}
            </Box>
        </Box>
    )
}
