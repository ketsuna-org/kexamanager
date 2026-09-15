import { createContext, useContext } from "react"

/** Severities handled by the global notification stack, aligned with MUI `Alert`. */
export type FeedbackSeverity = "success" | "info" | "warning" | "error"

/** Optional right-aligned action rendered inside a notification. */
export interface FeedbackAction {
    label: string
    onClick: () => void
}

/** Payload accepted by `notify`. */
export interface FeedbackMessage {
    severity: FeedbackSeverity
    message: string
    action?: FeedbackAction
}

/** A queued notification, identified so it can be dismissed on its own. */
export interface FeedbackItem extends FeedbackMessage {
    id: number
}

export interface FeedbackContextValue {
    /** Pushes a notification onto the single application-wide stack. */
    notify: (feedback: FeedbackMessage) => void
}

/** Errors stay long enough to be read; transient confirmations leave quickly. */
const DURATIONS: Record<FeedbackSeverity, number> = {
    success: 4000,
    info: 4000,
    warning: 6000,
    error: 8000,
}

/** Auto-dismiss delay for a notification, in milliseconds. */
export function feedbackDuration(severity: FeedbackSeverity): number {
    return DURATIONS[severity]
}

export const FeedbackContext = createContext<FeedbackContextValue | null>(null)

/** Fails loudly when used outside the provider mounted by `App.tsx`. */
export function useFeedback(): FeedbackContextValue {
    const context = useContext(FeedbackContext)
    if (!context) {
        throw new Error("useFeedback must be used within FeedbackContext.Provider")
    }
    return context
}
