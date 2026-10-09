import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import { k } from "../../theme"
import { formatTime } from "../../utils/format"
import { Avatar, Mono, Pill, Tag } from "../../ui/kit"
import { actionTag, logTarget, type LogEntry } from "./logs"

/** Who did what, on what: `root a créé la clé ci-deploy`. */
export function LogSentence({ entry }: { entry: LogEntry }) {
    const { t } = useTranslation()
    const target = logTarget(entry)
    const who = entry.username || t("activity.system")
    const verb = t(`activity.actions.${entry.action}`, { defaultValue: "" }) || t("activity.didAction", { action: actionTag(entry.action) })
    return (
        <Box component="span" sx={{ overflowWrap: "anywhere" }}>
            <b>{who}</b> {verb}
            {target && (
                <>
                    {" "}
                    <Mono sx={{ color: k.text }}>{target}</Mono>
                </>
            )}
            {!target && entry.details && (
                <Box component="span" sx={{ color: k.text2 }}>
                    {" "}
                    · {entry.details}
                </Box>
            )}
        </Box>
    )
}

export function StatusPill({ status }: { status: string }) {
    const { t } = useTranslation()
    return status === "success" ? <Pill tone="ok">{t("activity.success")}</Pill> : <Pill tone="err">{t("activity.failure")}</Pill>
}

/** Compact line for the overview's "latest actions" card. */
export function LogLine({ entry }: { entry: LogEntry }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: "20px", py: "12px", borderTop: `1px solid ${k.rowBorder}`, flexWrap: "wrap" }}>
            <Mono sx={{ color: k.label, width: 44 }}>{formatTime(entry.CreatedAt)}</Mono>
            <Avatar name={entry.username || "·"} size={26} />
            <Box sx={{ flex: "1 1 240px", minWidth: 0 }}>
                <LogSentence entry={entry} />
            </Box>
            <Tag sx={{ display: { xs: "none", sm: "inline-flex" } }}>{actionTag(entry.action)}</Tag>
            <StatusPill status={entry.status} />
        </Box>
    )
}
