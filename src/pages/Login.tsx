import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import { authenticateWithToken } from '../auth/tokenAuth'

export default function Login({ onAuth }: { onAuth: () => void }) {
  const [token, setToken] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!token || token.trim().length === 0) {
      setError('Le token est requis pour se connecter')
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
      setError(err instanceof Error ? err.message : 'Erreur de connexion inconnue')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Box sx={{minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p:2}}>
      <Paper sx={{width: '100%', maxWidth: 520, p:3}} component="form" onSubmit={submit}>
        <Typography variant="h5" component="h1" gutterBottom>
          Connexion à Kexamanager
        </Typography>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Entrez votre token d'accès pour vous connecter
        </Typography>

        <TextField
          label="Token d'accès"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          fullWidth
          autoFocus
          margin="normal"
          error={Boolean(error)}
          helperText={error || ' '}
          disabled={loading}
          placeholder="Saisissez votre token..."
        />

        <Box sx={{display:'flex', gap:1, mt:2}}>
          <Button
            variant="contained"
            type="submit"
            disabled={loading || !token.trim()}
            sx={{ flex: 1 }}
          >
            {loading ? 'Connexion...' : 'Se connecter'}
          </Button>
          <Button
            variant="outlined"
            onClick={() => { setToken(''); setError(''); }}
            disabled={loading}
          >
            Effacer
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
