import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { authenticateWithToken } from '../auth/tokenAuth'
import { useTranslation } from 'react-i18next'

export default function Login({ onAuth }: { onAuth: () => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
    const { t } = useTranslation()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
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
    <Box sx={{minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p:2}}>
      <Paper sx={{width: '100%', maxWidth: 520, p:3}} component="form" onSubmit={submit}>
        <Typography variant="h5" component="h1" gutterBottom>
          {t("login.title", "Connexion à KexaManager")}
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          {t("login.instructions", "Veuillez entrer votre token d'accès pour vous connecter à l'interface de gestion.")}
        </Typography>

        <TextField
          label={t("login.tokenLabel", "Token d'accès")}
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          fullWidth
          autoFocus
          margin="normal"
          error={Boolean(error)}
          helperText={error || ' '}
          disabled={loading}
          placeholder={t("login.tokenPlaceholder", "Entrez votre token ici")}
        />

        <Box sx={{display:'flex', gap:1, mt:2}}>
          <Button
            variant="contained"
            type="submit"
            disabled={loading || !token.trim()}
            sx={{ flex: 1 }}
          >
            {loading ? t("login.loading", "Connexion...") : t("login.submitButton", "Se connecter")}
          </Button>
          <Button
            variant="outlined"
            onClick={() => { setToken(''); setError(''); }}
            disabled={loading}
          >
            {t("login.clearButton", "Effacer")}
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
