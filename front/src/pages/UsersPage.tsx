import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import Radio from "@mui/material/Radio"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import { Plus, Trash2, Users } from "lucide-react"
import { toErrorMessage } from "../api/storage"
import { getCurrentUser } from "../auth/tokenAuth"
import { useFeedback } from "../contexts/FeedbackContext"
import { useAsync } from "../hooks/useAsync"
import { adminDelete, adminGet, adminPost, adminPut } from "../utils/adminClient"
import { Page } from "../shell/Page"
import { k } from "../theme"
import { Avatar, Card, EmptyBlock, ErrorBlock, Field, Muted, Pill, SidePanel, Spinner, TableWrap, TextField, WithPanel } from "../ui/kit"
import { ConfirmDialog } from "../ui/dialogs"
import { formatDate } from "../utils/format"

interface UserRow {
    ID: number
    CreatedAt: string
    username: string
    role: "admin" | "user" | string
}

type Editing = { mode: "create" } | { mode: "edit"; user: UserRow }

function RoleOption({ value, current, onChange, title, text }: { value: string; current: string; onChange: (v: string) => void; title: string; text: string }) {
    const selected = value === current
    return (
        <Box
            component="label"
            sx={{ display: "flex", gap: 1.25, alignItems: "flex-start", p: 1.5, border: `1px solid ${selected ? k.accent : k.borderStrong}`, bgcolor: selected ? k.rowSelected : "transparent", borderRadius: "10px", cursor: "pointer" }}
        >
            <Radio checked={selected} onChange={() => onChange(value)} value={value} name="role" sx={{ p: 0, mt: "2px" }} />
            <Box>
                <Box sx={{ fontWeight: 500 }}>{title}</Box>
                <Muted small>{text}</Muted>
            </Box>
        </Box>
    )
}

function UserForm({ editing, onClose, onSaved }: { editing: Editing; onClose: () => void; onSaved: () => void }) {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const existing = editing.mode === "edit" ? editing.user : null
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [role, setRole] = useState("user")
    const [busy, setBusy] = useState(false)

    useEffect(() => {
        setUsername(existing?.username ?? "")
        setPassword("")
        setRole(existing?.role ?? "user")
    }, [existing])

    const valid = username.trim().length > 0 && (existing ? true : password.length >= 8) && (password.length === 0 || password.length >= 8)
    const save = async () => {
        setBusy(true)
        try {
            if (existing) await adminPut(`/auth/users/${existing.ID}`, { username: username.trim(), password: password || undefined, role })
            else await adminPost("/auth/create-user", { username: username.trim(), password, role })
            notify({ severity: "success", message: existing ? t("users.updated", { name: username }) : t("users.created", { name: username }) })
            onSaved()
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setBusy(false)
        }
    }

    return (
        <SidePanel
            open
            onClose={onClose}
            title={existing ? t("users.editTitle", { name: existing.username }) : t("users.create")}
            footer={
                <>
                    <Button onClick={onClose}>{t("ui.cancel")}</Button>
                    <Button variant="contained" onClick={save} disabled={!valid || busy} startIcon={busy ? <CircularProgress size={14} /> : undefined}>
                        {existing ? t("ui.save") : t("users.createSubmit")}
                    </Button>
                </>
            }
        >
            <TextField label={t("users.username")} value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" autoFocus />
            <TextField
                label={existing ? t("users.newPassword") : t("users.password")}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                help={existing ? t("users.passwordKeep") : t("users.passwordHelp")}
                error={password && password.length < 8 ? t("users.passwordTooShort") : undefined}
            />
            <Field label={t("users.role")}>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }} role="radiogroup" aria-label={t("users.role")}>
                    <RoleOption value="user" current={role} onChange={setRole} title={t("users.roleUser")} text={t("users.roleUserText")} />
                    <RoleOption value="admin" current={role} onChange={setRole} title={t("users.roleAdmin")} text={t("users.roleAdminText")} />
                </Box>
            </Field>
        </SidePanel>
    )
}

export default function UsersPage() {
    const { t } = useTranslation()
    const { notify } = useFeedback()
    const me = getCurrentUser()
    const users = useAsync(() => adminGet<UserRow[]>("/auth/users"), [])
    const [editing, setEditing] = useState<Editing | null>(null)
    const [deleting, setDeleting] = useState<UserRow | null>(null)
    const [busy, setBusy] = useState(false)

    const rows = [...(users.data ?? [])].sort((a, b) => Number(b.username === "root") - Number(a.username === "root") || a.username.localeCompare(b.username))

    return (
        <Page
            crumbs={[{ label: t("nav.groups.instance") }, { label: t("nav.users") }]}
            title={t("nav.users")}
            description={t("users.description")}
            actions={
                <Button variant="contained" startIcon={<Plus />} onClick={() => setEditing({ mode: "create" })}>
                    {t("users.create")}
                </Button>
            }
        >
            <WithPanel
                panel={
                    editing && (
                        <UserForm
                            key={editing.mode === "edit" ? editing.user.ID : "new"}
                            editing={editing}
                            onClose={() => setEditing(null)}
                            onSaved={() => {
                                setEditing(null)
                                users.refresh()
                            }}
                        />
                    )
                }
            >
                {users.error && <ErrorBlock message={users.error} onRetry={users.refresh} />}
                <Card>
                    {users.loading && !users.data ? (
                        <Spinner />
                    ) : rows.length === 0 ? (
                        <EmptyBlock icon={<Users />} title={t("users.empty")} />
                    ) : (
                        <TableWrap minWidth={560}>
                            <Table>
                                <TableHead>
                                    <TableRow>
                                        <TableCell>{t("users.account")}</TableCell>
                                        <TableCell>{t("users.role")}</TableCell>
                                        <TableCell>{t("users.createdAt")}</TableCell>
                                        <TableCell align="right">{t("ui.actions")}</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {rows.map((user) => {
                                        const isRoot = user.username === "root"
                                        const isMe = user.username === me?.username
                                        return (
                                            <TableRow key={user.ID} hover selected={editing?.mode === "edit" && editing.user.ID === user.ID}>
                                                <TableCell>
                                                    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5 }}>
                                                        <Avatar name={user.username} />
                                                        <Box>
                                                            <Box sx={{ fontWeight: 500 }}>
                                                                {user.username}
                                                                {isMe && (
                                                                    <Box component="span" sx={{ color: k.label, fontWeight: 400 }}>
                                                                        {" "}
                                                                        · {t("users.you")}
                                                                    </Box>
                                                                )}
                                                            </Box>
                                                            {isRoot && <Muted small>{t("users.rootNote")}</Muted>}
                                                        </Box>
                                                    </Box>
                                                </TableCell>
                                                <TableCell>{user.role === "admin" ? <Pill tone="accent">{t("users.roleAdmin")}</Pill> : <Pill>{t("users.roleUser")}</Pill>}</TableCell>
                                                <TableCell>{formatDate(user.CreatedAt)}</TableCell>
                                                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                                                    {!isRoot && (
                                                        <>
                                                            <Button size="small" onClick={() => setEditing({ mode: "edit", user })}>
                                                                {t("ui.edit")}
                                                            </Button>{" "}
                                                            <Button size="small" color="error" onClick={() => setDeleting(user)} disabled={isMe} aria-label={t("users.deleteTitle", { name: user.username })}>
                                                                <Trash2 size={15} />
                                                            </Button>
                                                        </>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </TableWrap>
                    )}
                </Card>
            </WithPanel>
            <ConfirmDialog
                open={Boolean(deleting)}
                onClose={() => setDeleting(null)}
                title={t("users.deleteTitle", { name: deleting?.username })}
                message={t("users.deleteMessage")}
                confirmLabel={t("ui.delete")}
                confirmText={deleting?.username}
                busy={busy}
                onConfirm={async () => {
                    if (!deleting) return
                    setBusy(true)
                    try {
                        await adminDelete(`/auth/users/${deleting.ID}`)
                        setDeleting(null)
                        users.refresh()
                    } catch (error) {
                        notify({ severity: "error", message: toErrorMessage(error) })
                    } finally {
                        setBusy(false)
                    }
                }}
            />
        </Page>
    )
}
