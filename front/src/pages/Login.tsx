import { useState } from "react"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import TextField from "@mui/material/TextField"
import Button from "@mui/material/Button"
import Alert from "@mui/material/Alert"
import CircularProgress from "@mui/material/CircularProgress"
import VpnKeyIcon from "@mui/icons-material/VpnKey"
import { authenticateWithToken } from "../auth/tokenAuth"
import { useTranslation } from "react-i18next"

export default function Login({ onAuth }: { onAuth: () => void }) {
    const [token, setToken] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const { t } = useTranslation()

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setLoading(true)

        if (!token || token.trim().length === 0) {
            setError(t("login.errorEmptyToken", "Le token ne peut pas être vide"))
            setLoading(false)
            return
        }

        try {
            // Authentifier avec le token en utilisant l'endpoint GetClusterHealth
            await authenticateWithToken(token)

            // Si l'authentification réussit, passer à l'interface principale
            onAuth()
        } catch (err) {
            // Afficher le message d'erreur retourné par la fonction d'authentification
            setError(err instanceof Error ? err.message : t("login.errorUnknown", "Une erreur inconnue est survenue"))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Box
            sx={{
                minHeight: "100vh",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                bgcolor: "background.default",
                backgroundImage: "radial-gradient(circle at 25px 25px, rgba(59, 130, 246, 0.05) 2%, transparent 0%), radial-gradient(circle at 75px 75px, rgba(156, 39, 176, 0.05) 2%, transparent 0%)",
                backgroundSize: "100px 100px",
                p: 2,
            }}
        >
            <Paper
                sx={{
                    width: "100%",
                    maxWidth: 480,
                    p: 4,
                    backdropFilter: "blur(10px)",
                    border: "1px solid rgba(255, 255, 255, 0.1)",
                }}
                component="form"
                onSubmit={submit}
                elevation={3}
            >
                <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", mb: 3 }}>
                    <Box
                        sx={{
                            p: 2,
                            borderRadius: "50%",
                            bgcolor: "primary.main",
                            mb: 2,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <VpnKeyIcon sx={{ color: "white", fontSize: 32 }} />
                    </Box>

                    <Typography variant="h4" component="h1" gutterBottom fontWeight={700} textAlign="center">
                        {t("login.title", "KexaManager")}
                    </Typography>

                    <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 2 }}>
                        {t("login.instructions", "Veuillez entrer votre token d'accès pour vous connecter à l'interface de gestion.")}
                    </Typography>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <TextField
                    label={t("login.tokenLabel", "Token d'accès")}
                    type="password"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    fullWidth
                    autoFocus
                    margin="normal"
                    disabled={loading}
                    placeholder={t("login.tokenPlaceholder", "Entrez votre token ici")}
                    sx={{ mb: 3 }}
                />

                <Button
                    variant="contained"
                    type="submit"
                    disabled={loading || !token.trim()}
                    fullWidth
                    size="large"
                    sx={{
                        mb: 2,
                        py: 1.5,
                        position: "relative",
                    }}
                >
                    {loading && (
                        <CircularProgress
                            size={20}
                            sx={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                marginLeft: "-10px",
                                marginTop: "-10px",
                            }}
                        />
                    )}
                    <Box sx={{ opacity: loading ? 0 : 1 }}>{t("login.submitButton", "Se connecter")}</Box>
                </Button>

                <Button
                    variant="text"
                    onClick={() => {
                        setToken("")
                        setError("")
                    }}
                    disabled={loading}
                    fullWidth
                    sx={{ color: "text.secondary" }}
                >
                    {t("login.clearButton", "Effacer")}
                </Button>
            </Paper>
        </Box>
    )
}
