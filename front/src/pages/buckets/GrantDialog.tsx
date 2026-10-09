import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Checkbox from "@mui/material/Checkbox"
import FormControlLabel from "@mui/material/FormControlLabel"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import { FormDialog } from "../../ui/dialogs"
import { Field } from "../../ui/kit"

export interface GrantOption {
    id: string
    label: string
}

export interface Grant {
    targetId: string
    read: boolean
    write: boolean
    owner: boolean
}

/**
 * Gives a key access to a bucket. Used from both sides: pick a key for a
 * bucket, or pick a bucket for a key (`options` lists the other side).
 */
export function GrantDialog({
    open,
    onClose,
    title,
    description,
    pickLabel,
    options,
    onSubmit,
}: {
    open: boolean
    onClose: () => void
    title: string
    description?: string
    pickLabel: string
    options: GrantOption[]
    onSubmit: (grant: Grant) => Promise<void>
}) {
    const { t } = useTranslation()
    const [targetId, setTargetId] = useState("")
    const [read, setRead] = useState(true)
    const [write, setWrite] = useState(true)
    const [owner, setOwner] = useState(false)
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        if (open) {
            setTargetId(options[0]?.id ?? "")
            setRead(true)
            setWrite(true)
            setOwner(false)
        }
        // Reset only when the dialog opens: parents rebuild `options` on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open])

    const submit = async () => {
        setBusy(true)
        try {
            await onSubmit({ targetId, read, write, owner })
            onClose()
        } finally {
            setBusy(false)
        }
    }

    return (
        <FormDialog
            open={open}
            onClose={onClose}
            title={title}
            description={description}
            submitLabel={t("access.grant")}
            onSubmit={submit}
            busy={busy}
            canSubmit={Boolean(targetId) && (read || write || owner)}
        >
            <Field label={pickLabel}>
                <Select value={targetId} onChange={(e) => setTargetId(e.target.value)} displayEmpty fullWidth>
                    {options.length === 0 && (
                        <MenuItem value="" disabled>
                            {t("access.nothingToPick")}
                        </MenuItem>
                    )}
                    {options.map((option) => (
                        <MenuItem key={option.id} value={option.id}>
                            {option.label}
                        </MenuItem>
                    ))}
                </Select>
            </Field>
            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                <FormControlLabel control={<Checkbox checked={read} onChange={(e) => setRead(e.target.checked)} />} label={t("access.read")} />
                <FormControlLabel control={<Checkbox checked={write} onChange={(e) => setWrite(e.target.checked)} />} label={t("access.write")} />
                <FormControlLabel control={<Checkbox checked={owner} onChange={(e) => setOwner(e.target.checked)} />} label={t("access.owner")} />
            </Box>
        </FormDialog>
    )
}
