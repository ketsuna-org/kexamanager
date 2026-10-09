import { useState, type FormEvent } from "react"
import { useTranslation } from "react-i18next"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import CircularProgress from "@mui/material/CircularProgress"
import { Database, KeyRound, Server, Wrench } from "lucide-react"
import { authenticateWithCredentials } from "../auth/tokenAuth"
import { useSettings } from "../contexts/useSettings"
import { k } from "../theme"
import { Logo } from "../shell/Sidebar"
import { Field, TextInput } from "../ui/kit"

export default function LoginPage({ onAuth }: { onAuth: () => void }) {
    const { t } = useTranslation()
    const { lang, setLang } = useSettings()
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [showPassword, setShowPassword] = useState(false)
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)

    async function submit(event: FormEvent) {
        event.preventDefault()
        setError("")
        if (!username || !password) {
            setError(t("login.errorEmpty"))
            return
        }
        setLoading(true)
        try {
            await authenticateWithCredentials(username, password)
            onAuth()
        } catch {
            setError(t("login.errorInvalid"))
        } finally {
            setLoading(false)
        }
    }

    const features = [
        { icon: <Database size={18} />, text: t("login.featureBuckets") },
        { icon: <KeyRound size={18} />, text: t("login.featureKeys") },
        { icon: <Server size={18} />, text: t("login.featureCluster") },
        { icon: <Wrench size={18} />, text: t("login.featureMaintenance") },
    ]

    return (
        <Box sx={{ minHeight: "100dvh", display: "flex", flexWrap: "wrap", bgcolor: k.bg }}>
            <Box
                sx={{
                    flex: "1 1 420px",
                    display: { xs: "none", md: "flex" },
                    flexDirection: "column",
                    justifyContent: "space-between",
                    gap: 4,
                    p: 6,
                    bgcolor: k.side,
                    borderRight: `1px solid ${k.border}`,
                }}
            >
                <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
                    <Logo />
                    <Box sx={{ fontWeight: 600, fontSize: 15 }}>KexaManager</Box>
                </Box>
                <Box sx={{ maxWidth: 460 }}>
                    <Box component="h1" sx={{ m: 0, fontSize: 30, fontWeight: 600, letterSpacing: "-0.02em", lineHeight: 1.2 }}>
                        {t("login.tagline")}
                    </Box>
                    <Box sx={{ mt: 1.5, color: k.text2, fontSize: 15 }}>{t("login.subtagline")}</Box>
                    <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, mt: 4, display: "flex", flexDirection: "column", gap: 1.5 }}>
                        {features.map((feature, index) => (
                            <Box component="li" key={index} sx={{ display: "flex", alignItems: "center", gap: 1.5, color: k.text2 }}>
                                <Box sx={{ width: 34, height: 34, borderRadius: "8px", bgcolor: k.accentSoft, color: k.accentText, display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
                                    {feature.icon}
                                </Box>
                                {feature.text}
                            </Box>
                        ))}
                    </Box>
                </Box>
                <Box sx={{ color: k.label, fontSize: 12.5 }}>{t("login.footer")}</Box>
            </Box>
            <Box sx={{ flex: "1 1 420px", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", p: { xs: 3, md: 6 }, gap: 3 }}>
                <Box component="form" onSubmit={submit} noValidate sx={{ width: "100%", maxWidth: 380, display: "flex", flexDirection: "column", gap: 2.5 }}>
                    <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center", gap: 1.25 }}>
                        <Logo />
                        <Box sx={{ fontWeight: 600, fontSize: 15 }}>KexaManager</Box>
                    </Box>
                    <Box>
                        <Box component="h2" sx={{ m: 0, fontSize: 24, fontWeight: 600 }}>
                            {t("login.title")}
                        </Box>
                        <Box sx={{ mt: 0.75, color: k.text2 }}>{t("login.subtitle")}</Box>
                    </Box>
                    <Field label={t("login.username")} htmlFor="login-username">
                        <TextInput id="login-username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoFocus sx={{ minHeight: 44 }} />
                    </Field>
                    <Field label={t("login.password")} htmlFor="login-password">
                        <TextInput
                            id="login-password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            sx={{ minHeight: 44, pr: 0.5 }}
                            endAdornment={
                                <Button size="small" variant="text" onClick={() => setShowPassword((v) => !v)}>
                                    {showPassword ? t("ui.hide") : t("ui.show")}
                                </Button>
                            }
                        />
                    </Field>
                    {error && (
                        <Box role="alert" sx={{ p: "10px 12px", borderRadius: "8px", bgcolor: k.errBg, color: k.err, fontSize: 13.5 }}>
                            {error}
                        </Box>
                    )}
                    <Button type="submit" variant="contained" disabled={loading} sx={{ minHeight: 44 }} startIcon={loading ? <CircularProgress size={14} /> : undefined}>
                        {t("login.submit")}
                    </Button>
                </Box>
                <Box sx={{ display: "flex", gap: 0.5 }}>
                    {(["fr", "en"] as const).map((code) => (
                        <Button key={code} size="small" variant="text" onClick={() => setLang(code)} sx={{ color: lang === code ? k.text : k.label }} aria-pressed={lang === code}>
                            {code === "fr" ? "Français" : "English"}
                        </Button>
                    ))}
                </Box>
            </Box>
        </Box>
    )
}
