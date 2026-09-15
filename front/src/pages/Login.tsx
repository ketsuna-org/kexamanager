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
            setError(t("login.errorEmpty"))
            setLoading(false)
            return
        }

        try {
            await authenticateWithCredentials(username, password)
            onAuth()
        } catch (err) {
            setError(err instanceof Error ? err.message : t("login.errorUnknown"))
        } finally {
            setLoading(false)
        }
    }

    return (
        <Box
            sx={{
                minHeight: "100dvh",
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
                        <PersonIcon aria-hidden="true" sx={{ color: "white", fontSize: 32 }} />
                    </Box>

                    <Typography
                        variant="h4"
                        component="h1"
                        gutterBottom
                        sx={{
                            fontWeight: 700,
                            textAlign: "center"
                        }}>
                        {t("login.brand")}
                    </Typography>

                    <Typography
                        variant="body1"
                        sx={{
                            color: "text.secondary",
                            textAlign: "center",
                            mb: 2
                        }}>
                        {t("login.instructions")}
                    </Typography>
                </Box>

                {error && (
                    <Alert severity="error" sx={{ mb: 2 }}>
                        {error}
                    </Alert>
                )}

                <TextField
                    label={t("login.usernameLabel")}
                    type="text"
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    fullWidth
                    autoFocus
                    margin="normal"
                    disabled={loading}
                    placeholder={t("login.usernamePlaceholder")}
                    sx={{ mb: 2 }}
                />

                <TextField
                    label={t("login.passwordLabel")}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    fullWidth
                    margin="normal"
                    disabled={loading}
                    placeholder={t("login.passwordPlaceholder")}
                    sx={{ mb: 3 }}
                />

                <Button
                    variant="contained"
                    type="submit"
                    disabled={loading || !username.trim() || !password.trim()}
                    aria-busy={loading}
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
                            aria-hidden="true"
                            sx={{
                                position: "absolute",
                                left: "50%",
                                top: "50%",
                                marginLeft: "-10px",
                                marginTop: "-10px",
                            }}
                        />
                    )}
                    <Box sx={{ opacity: loading ? 0 : 1 }}>{t("login.submitButton")}</Box>
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
                    {t("login.clearButton")}
                </Button>
            </Paper>
        </Box>
    );
}
