import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'
import TextField from '@mui/material/TextField'
import Button from '@mui/material/Button'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import FormControlLabel from '@mui/material/FormControlLabel'
import FormControl from '@mui/material/FormControl'
import FormLabel from '@mui/material/FormLabel'

// demo passwords per role (dev only)
const PASSWORDS: Record<string, string> = {
  admin: 'adminpass',
  user: 'userpass',
}

type Role = 'admin' | 'user'

export default function Login({ onAuth }: { onAuth: (role: Role, username?: string) => void }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [role, setRole] = useState<Role>('user')
  const { t } = useTranslation()

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    if (role === 'admin') {
      // fixed admin credentials (dev)
      const expected = PASSWORDS.admin
      if (username !== 'admin' || password !== expected) {
        setError('Identifiants admin incorrects')
        return
      }
      localStorage.setItem('kexamanager:auth', '1')
      localStorage.setItem('kexamanager:role', 'admin')
      localStorage.setItem('kexamanager:username', 'admin')
      onAuth('admin', 'admin')
      return
    }

    // user: accept any password but require a username
    if (!username || username.trim().length === 0) {
      setError("Le nom d'utilisateur est requis pour se connecter en tant qu'utilisateur")
      return
    }
    localStorage.setItem('kexamanager:auth', '1')
    localStorage.setItem('kexamanager:role', 'user')
    localStorage.setItem('kexamanager:username', username)
    onAuth('user', username)
  }

  return (
    <Box sx={{minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: 'background.default', p:2}}>
      <Paper sx={{width: '100%', maxWidth: 520, p:3}} component="form" onSubmit={submit}>
        <Typography variant="h5" component="h1" gutterBottom>Connexion</Typography>

        <TextField
          label={t('login.username')}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          fullWidth
          margin="normal"
        />

        <FormControl component="fieldset" sx={{mb:2}}>
          <FormLabel component="legend">{t('login.role')}</FormLabel>
          <RadioGroup row value={role} onChange={(e) => setRole(e.target.value as Role)}>
            <FormControlLabel value="admin" control={<Radio />} label="Admin" />
            <FormControlLabel value="user" control={<Radio />} label="Utilisateur" />
          </RadioGroup>
        </FormControl>

        <TextField
          label={t('login.password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          fullWidth
          autoFocus
          margin="normal"
          error={Boolean(error)}
          helperText={error || ' '}
        />

        <Box sx={{display:'flex', gap:1, mt:1}}>
          <Button variant="contained" type="submit">{t('login.login')}</Button>
          <Button variant="outlined" onClick={() => { setPassword(''); setError(''); }}>{t('login.clear')}</Button>
        </Box>
      </Paper>
    </Box>
  )
}
