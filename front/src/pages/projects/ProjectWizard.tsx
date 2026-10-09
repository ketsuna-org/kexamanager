import { useEffect, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { useNavigate, useParams } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import CircularProgress from "@mui/material/CircularProgress"
import FormControlLabel from "@mui/material/FormControlLabel"
import { ArrowLeft, Check, Cloud, Server, X } from "lucide-react"
import { useProject } from "../../contexts/ProjectContext"
import { useFeedback } from "../../contexts/FeedbackContext"
import { toErrorMessage } from "../../api/storage"
import { Page } from "../../shell/Page"
import { k } from "../../theme"
import { Card, Muted, Pill, Section, TextField } from "../../ui/kit"
import { createProject, testProject, updateProject, type ConnectionTest, type ProjectForm, type ProjectType } from "./projectApi"

const EMPTY: ProjectForm = {
    name: "",
    type: "garage",
    s3_url: "",
    region: "garage",
    force_path_style: true,
    admin_url: "",
    admin_token: "",
    client_id: "",
    client_secret: "",
}

type Step = 1 | 2 | 3

function StepDot({ n, label, state }: { n: number; label: string; state: "done" | "current" | "todo" }) {
    return (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25, color: state === "todo" ? k.label : k.text }}>
            <Box
                component="b"
                sx={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    border: `1px solid ${state === "todo" ? k.borderStrong : k.accent}`,
                    bgcolor: state === "done" ? k.accent : state === "current" ? k.accentSoft : "transparent",
                    color: state === "done" ? k.onAccent : state === "current" ? k.accentText : k.label,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 13,
                    fontWeight: 600,
                    flex: "none",
                }}
            >
                {state === "done" ? <Check size={14} /> : n}
            </Box>
            <Box component="span" sx={{ fontWeight: state === "current" ? 600 : 400 }}>
                {label}
            </Box>
        </Box>
    )
}

function TypeCard({ selected, onClick, icon, title, text }: { selected: boolean; onClick: () => void; icon: ReactNode; title: string; text: string }) {
    return (
        <Box
            component="button"
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            sx={{
                flex: "1 1 260px",
                display: "flex",
                flexDirection: "column",
                gap: 1,
                p: "20px",
                textAlign: "left",
                font: "inherit",
                color: k.text,
                bgcolor: selected ? k.rowSelected : k.card,
                border: `1px solid ${selected ? k.accent : k.borderStrong}`,
                borderRadius: "12px",
                cursor: "pointer",
                "&:hover": { borderColor: selected ? k.accent : k.borderHover },
            }}
        >
            <Box sx={{ color: k.accentText }}>{icon}</Box>
            <Box sx={{ fontWeight: 600, fontSize: 15 }}>{title}</Box>
            <Muted>{text}</Muted>
        </Box>
    )
}

function CheckLine({ ok, children }: { ok: boolean; children: ReactNode }) {
    return (
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1.25, color: ok ? k.ok : k.err }}>
            {ok ? <Check size={18} style={{ flex: "none", marginTop: 1 }} /> : <X size={18} style={{ flex: "none", marginTop: 1 }} />}
            <Box sx={{ overflowWrap: "anywhere" }}>{children}</Box>
        </Box>
    )
}

export default function ProjectWizard() {
    const { t } = useTranslation()
    const navigate = useNavigate()
    const { notify } = useFeedback()
    const { projectId } = useParams()
    const editId = projectId ? Number(projectId) : undefined
    const { projects, reloadProjects, selectProject } = useProject()
    const existing = editId ? projects.find((p) => p.id === editId) : undefined

    const [step, setStep] = useState<Step>(editId ? 2 : 1)
    const [form, setForm] = useState<ProjectForm>(EMPTY)
    const [test, setTest] = useState<ConnectionTest | null>(null)
    const [testing, setTesting] = useState(false)
    const [saving, setSaving] = useState(false)
    const [errors, setErrors] = useState<Partial<Record<keyof ProjectForm, string>>>({})

    useEffect(() => {
        if (!existing) return
        setForm({
            name: existing.name,
            type: existing.type === "s3" ? "s3" : "garage",
            s3_url: existing.s3_url ?? "",
            region: existing.region ?? "",
            force_path_style: existing.force_path_style ?? true,
            admin_url: existing.admin_url ?? "",
            admin_token: "",
            client_id: existing.client_id ?? "",
            client_secret: "",
        })
    }, [existing])

    const set = <K extends keyof ProjectForm>(key: K, value: ProjectForm[K]) => {
        setForm((f) => ({ ...f, [key]: value }))
        setErrors((e) => ({ ...e, [key]: undefined }))
        if (key !== "name") setTest(null)
    }

    const isGarage = form.type === "garage"
    const hasAdmin = isGarage && form.admin_url.trim() !== ""
    const keyRequired = !hasAdmin
    // On edit, an empty secret keeps the stored one.
    const storedAdminToken = Boolean(existing?.admin_url)
    const storedSecret = Boolean(existing?.client_id)

    const chooseType = (type: ProjectType) => {
        setForm((f) => ({ ...f, type, region: f.region || (type === "garage" ? "garage" : "us-east-1"), admin_url: type === "s3" ? "" : f.admin_url, admin_token: type === "s3" ? "" : f.admin_token }))
        setTest(null)
    }

    const validateConnection = (): boolean => {
        const next: typeof errors = {}
        if (!form.s3_url.trim()) next.s3_url = t("wizard.required")
        if (hasAdmin && !form.admin_token && !storedAdminToken) next.admin_token = t("wizard.tokenRequired")
        if (keyRequired && !form.client_id.trim()) next.client_id = t("wizard.keyRequired")
        if (keyRequired && !form.client_secret && !(storedSecret && form.client_id === existing?.client_id)) next.client_secret = t("wizard.keyRequired")
        setErrors(next)
        return Object.keys(next).length === 0
    }

    const runTest = async () => {
        setTesting(true)
        try {
            setTest(await testProject(form, editId))
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setTesting(false)
        }
    }

    const goToStep3 = () => {
        if (!validateConnection()) return
        setStep(3)
        void runTest()
    }

    const save = async () => {
        if (!form.name.trim()) {
            setErrors({ name: t("wizard.required") })
            return
        }
        setSaving(true)
        try {
            const saved = editId ? await updateProject(editId, form) : await createProject(form)
            await reloadProjects()
            notify({ severity: "success", message: editId ? t("wizard.updated", { name: form.name }) : t("wizard.created", { name: form.name }) })
            if (editId) {
                navigate("/projects")
            } else {
                selectProject(saved.id)
                navigate("/overview")
            }
        } catch (error) {
            notify({ severity: "error", message: toErrorMessage(error) })
        } finally {
            setSaving(false)
        }
    }

    const steps = [t("wizard.stepType"), t("wizard.stepConnection"), t("wizard.stepName")]
    const testFailed = test && ((test.s3.tested && !test.s3.ok) || (test.admin.tested && !test.admin.ok))

    return (
        <Page
            crumbs={[{ label: t("nav.projects"), to: "/projects" }, { label: editId ? t("wizard.editTitle") : t("projects.new") }]}
            topActions={<Button onClick={() => navigate("/projects")}>{t("ui.cancel")}</Button>}
            title={editId ? t("wizard.editTitle") : t("projects.new")}
        >
            <Box sx={{ display: "flex", gap: 3, flexWrap: "wrap" }} aria-label={t("wizard.progress")}>
                {steps.map((label, index) => {
                    const n = (index + 1) as Step
                    return <StepDot key={label} n={n} label={label} state={n < step ? "done" : n === step ? "current" : "todo"} />
                })}
            </Box>

            <Box sx={{ maxWidth: 820, display: "flex", flexDirection: "column", gap: 2.5 }}>
                {step === 1 && (
                    <>
                        <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap" }}>
                            <TypeCard selected={form.type === "garage"} onClick={() => chooseType("garage")} icon={<Server />} title={t("wizard.garageTitle")} text={t("wizard.garageText")} />
                            <TypeCard selected={form.type === "s3"} onClick={() => chooseType("s3")} icon={<Cloud />} title={t("wizard.s3Title")} text={t("wizard.s3Text")} />
                        </Box>
                        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
                            <Button variant="contained" onClick={() => setStep(2)}>
                                {t("wizard.continue")}
                            </Button>
                        </Box>
                    </>
                )}

                {step === 2 && (
                    <>
                        <Box>
                            <Box component="h2" sx={{ m: 0, fontSize: 18, fontWeight: 600 }}>
                                {isGarage ? t("wizard.connectGarage") : t("wizard.connectS3")}
                            </Box>
                            <Muted>{isGarage ? t("wizard.connectGarageText") : t("wizard.connectS3Text")}</Muted>
                        </Box>
                        <Section title={t("wizard.s3Endpoint")} actions={<Pill tone="accent">{t("wizard.mandatory")}</Pill>}>
                            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", "& > *": { flex: "1 1 220px" } }}>
                                <TextField label={t("wizard.s3Url")} value={form.s3_url} onChange={(e) => set("s3_url", e.target.value)} placeholder="https://s3.example.com" error={errors.s3_url} mono fieldSx={{ flex: "2 1 280px" }} />
                                <TextField label={t("wizard.region")} value={form.region} onChange={(e) => set("region", e.target.value)} placeholder={isGarage ? "garage" : "us-east-1"} mono />
                            </Box>
                            <FormControlLabel
                                control={<Checkbox checked={form.force_path_style} onChange={(e) => set("force_path_style", e.target.checked)} />}
                                label={
                                    <Box>
                                        <Box sx={{ fontWeight: 500 }}>{t("wizard.pathStyle")}</Box>
                                        <Muted small>{t("wizard.pathStyleHelp")}</Muted>
                                    </Box>
                                }
                                sx={{ alignItems: "flex-start", m: 0, gap: 0.5 }}
                            />
                        </Section>

                        {isGarage && (
                            <Section title={t("wizard.adminApi")} actions={<Pill tone="info">{t("wizard.recommended")}</Pill>}>
                                <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", "& > *": { flex: "1 1 220px" } }}>
                                    <TextField label={t("wizard.adminUrl")} value={form.admin_url} onChange={(e) => set("admin_url", e.target.value)} placeholder="https://garage-admin.example.com" mono />
                                    <TextField
                                        label={t("wizard.adminToken")}
                                        type="password"
                                        value={form.admin_token}
                                        onChange={(e) => set("admin_token", e.target.value)}
                                        placeholder={storedAdminToken ? t("wizard.unchanged") : ""}
                                        error={errors.admin_token}
                                        disabled={!form.admin_url.trim()}
                                        mono
                                        autoComplete="off"
                                    />
                                </Box>
                                <Muted small>{t("wizard.adminHelp")}</Muted>
                            </Section>
                        )}

                        <Section title={t("wizard.projectKey")} actions={<Pill tone={keyRequired ? "accent" : "neutral"}>{keyRequired ? t("wizard.mandatory") : t("ui.optional")}</Pill>}>
                            <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", "& > *": { flex: "1 1 220px" } }}>
                                <TextField label="Access key ID" value={form.client_id} onChange={(e) => set("client_id", e.target.value)} error={errors.client_id} mono autoComplete="off" />
                                <TextField
                                    label="Secret access key"
                                    type="password"
                                    value={form.client_secret}
                                    onChange={(e) => set("client_secret", e.target.value)}
                                    placeholder={storedSecret ? t("wizard.unchanged") : ""}
                                    error={errors.client_secret}
                                    mono
                                    autoComplete="off"
                                />
                            </Box>
                            {!keyRequired && <Muted small>{t("wizard.keyOptionalHelp")}</Muted>}
                        </Section>

                        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                            {editId ? <span /> : (
                                <Button startIcon={<ArrowLeft />} onClick={() => setStep(1)}>
                                    {t("wizard.stepType")}
                                </Button>
                            )}
                            <Button variant="contained" onClick={goToStep3}>
                                {t("wizard.continue")}
                            </Button>
                        </Box>
                    </>
                )}

                {step === 3 && (
                    <>
                        <Section title={t("wizard.stepName")}>
                            <TextField label={t("wizard.name")} value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="prod-garage" error={errors.name} autoFocus help={t("wizard.nameHelp")} />
                        </Section>
                        <Card sx={{ p: "20px", display: "flex", flexDirection: "column", gap: 1.5 }}>
                            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, flexWrap: "wrap" }}>
                                <Box component="h2" sx={{ m: 0, fontSize: 16, fontWeight: 600 }}>
                                    {t("wizard.test")}
                                </Box>
                                <Button size="small" onClick={runTest} disabled={testing} startIcon={testing ? <CircularProgress size={12} /> : undefined}>
                                    {t("wizard.testAgain")}
                                </Button>
                            </Box>
                            {testing && <Muted>{t("wizard.testing")}</Muted>}
                            {!testing && test && (
                                <>
                                    {test.s3.tested ? (
                                        <CheckLine ok={test.s3.ok}>{test.s3.ok ? t("wizard.s3Ok", { count: test.s3.buckets ?? 0 }) : t("wizard.s3Failed", { error: test.s3.error })}</CheckLine>
                                    ) : (
                                        <Muted>{t("wizard.s3NotTested")}</Muted>
                                    )}
                                    {test.admin.tested && (
                                        <CheckLine ok={test.admin.ok}>
                                            {test.admin.ok ? t("wizard.adminOk", { status: t(`overview.health.${test.admin.status}`, { defaultValue: test.admin.status }), up: test.admin.nodesUp, count: test.admin.nodes }) : t("wizard.adminFailed", { error: test.admin.error })}
                                        </CheckLine>
                                    )}
                                    {testFailed && <Muted small>{t("wizard.saveAnyway")}</Muted>}
                                </>
                            )}
                        </Card>
                        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
                            <Button startIcon={<ArrowLeft />} onClick={() => setStep(2)}>
                                {t("wizard.stepConnection")}
                            </Button>
                            <Button variant="contained" onClick={save} disabled={saving} startIcon={saving ? <CircularProgress size={14} /> : undefined}>
                                {editId ? t("wizard.saveChanges") : t("wizard.createProject")}
                            </Button>
                        </Box>
                    </>
                )}
            </Box>
        </Page>
    )
}
