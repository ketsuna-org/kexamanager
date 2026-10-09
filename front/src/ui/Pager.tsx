import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import { k } from "../theme"

/** "1 to 25 of 120" with previous/next, under a client-paginated table. */
export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
    const { t } = useTranslation()
    if (total <= pageSize) return null
    const from = page * pageSize + 1
    const to = Math.min(total, (page + 1) * pageSize)
    return (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: "16px", py: "12px", borderTop: `1px solid ${k.border}`, flexWrap: "wrap" }}>
            <Box sx={{ color: k.text2, fontSize: 13 }}>{t("ui.range", { from, to, total })}</Box>
            <Box sx={{ display: "flex", gap: 1 }}>
                <Button size="small" disabled={page === 0} onClick={() => onPage(page - 1)}>
                    {t("ui.previous")}
                </Button>
                <Button size="small" disabled={to >= total} onClick={() => onPage(page + 1)}>
                    {t("ui.next")}
                </Button>
            </Box>
        </Box>
    )
}
