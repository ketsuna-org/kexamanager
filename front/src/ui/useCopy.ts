import { useTranslation } from "react-i18next"
import { useFeedback } from "../contexts/FeedbackContext"

/** Copies to the clipboard and confirms (or reports the failure) with a toast. */
export function useCopy() {
    const { notify } = useFeedback()
    const { t } = useTranslation()
    return async (value: string, what?: string) => {
        try {
            await navigator.clipboard.writeText(value)
            notify({ severity: "success", message: what ? t("ui.copiedWhat", { what }) : t("ui.copied") })
        } catch {
            notify({ severity: "error", message: t("ui.copyFailed") })
        }
    }
}
