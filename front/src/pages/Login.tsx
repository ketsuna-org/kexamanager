import { useState } from "react"
import Box from "@mui/material/Box"
import Paper from "@mui/material/Paper"
import Typography from "@mui/material/Typography"
import TextField from "@mui/material/TextField"
import Button from "@mui/material/Button"
import Alert from "@mui/material/Alert"
import CircularProgress from "@mui/material/CircularProgress"
import PersonIcon from "@mui/icons-material/Person"
import { authenticateWithCredentials } from "../auth/tokenAuth"
import { useTranslation } from "react-i18next"

export default function Login({ onAuth }: { onAuth: () => void }) {
    const [username, setUsername] = useState("")
    const [password, setPassword] = useState("")
    const [error, setError] = useState("")
    const [loading, setLoading] = useState(false)
    const { t } = useTranslation()

    async function submit(e: React.FormEvent) {
        e.preventDefault()
        setError("")
        setLoading(true)

        if (!username || !password) {
            setError(t("login.errorEmpty", "Username and password are required"))
            setLoading(false)
            return
        }

        try {
            await authenticateWithCredentials(username, password)
            onAuth()
        } catch (err) {
            setError(err instanceof Error ? err.message : t("login.errorUnknown", "An unknown error occurred"))
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
                p: 2,
            }}
        >
            <Paper
                sx={{
                    width: "100%",
                    maxWidth: 400,
                    p: 4,
                    border: "1px solid",
                    borderColor: "divider",
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
                        <PersonIcon sx={{ color: "white", fontSize: 32 }} />
                    </Box>

                    <Typography variant="h4" component="h1" gutterBottom fontWeight={700} textAlign="center">
                        {t("login.title", "KexaManager")}
                    </Typography>

                    <Typography variant="body1" color="text.secondary" textAlign="center" sx={{ mb: 2 }}>
                        {t("login.instructions", "Veuillez entrer vos identifiants pour vous connecter.")}
                    </Typography>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <TextField
                    label={t("login.usernameLabel", "Nom d'utilisateur")}
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    fullWidth
                    autoFocus
                    margin="normal"
                    disabled={loading}
                    placeholder={t("login.usernamePlaceholder", "Entrez votre nom d'utilisateur")}
                    sx={{ mb: 2 }}
                />

                <TextField
                    label={t("login.passwordLabel", "Mot de passe")}
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    fullWidth
                    margin="normal"
                    disabled={loading}
                    placeholder={t("login.passwordPlaceholder", "Entrez votre mot de passe")}
                    sx={{ mb: 3 }}
                />

                <Button
                    variant="contained"
                    type="submit"
                    disabled={loading || !username.trim() || !password.trim()}
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
                        setUsername("")
                        setPassword("")
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
