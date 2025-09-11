import { useState, useEffect } from 'react'
// vite logo removed
import Login from './pages/Login'
import Buckets from './pages/dashboard/Buckets'
import Websites from './pages/dashboard/Websites'
import ApplicationsKeys from './pages/dashboard/ApplicationsKeys'
import AdminTokens from './pages/dashboard/AdminTokens'
import Nodes from './pages/dashboard/Nodes'
import Blocks from './pages/dashboard/Blocks'
import Workers from './pages/dashboard/Workers'
import Health from './pages/dashboard/Health'
import ClusterLayout from './pages/dashboard/ClusterLayout'
import { createTheme, ThemeProvider } from '@mui/material/styles'
import Switch from '@mui/material/Switch'
import FormControlLabel from '@mui/material/FormControlLabel'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
// Tabs/Tab previously used; replaced by Drawer-based navigation
import Drawer from '@mui/material/Drawer'
import List from '@mui/material/List'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemIcon from '@mui/material/ListItemIcon'
import ListItemText from '@mui/material/ListItemText'
import CssBaseline from '@mui/material/CssBaseline'
import AppBar from '@mui/material/AppBar'
import Toolbar from '@mui/material/Toolbar'
import IconButton from '@mui/material/IconButton'
import MenuIcon from '@mui/icons-material/Menu'
// responsive helpers not required here
import StorageIcon from '@mui/icons-material/Storage'
import LanguageIcon from '@mui/icons-material/Language'
import VpnKeyIcon from '@mui/icons-material/VpnKey'
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings'
import DevicesIcon from '@mui/icons-material/Devices'
import AppsIcon from '@mui/icons-material/Apps'
import BuildIcon from '@mui/icons-material/Build'
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import Select from '@mui/material/Select'
import MenuItem from '@mui/material/MenuItem'
import Divider from '@mui/material/Divider'

function App() {
  // example counter removed
  const [authed, setAuthed] = useState(false)
  const [role, setRole] = useState<'admin' | 'user' | null>(null)
  const [tab, setTab] = useState<string>('buckets')
  const [dark, setDark] = useState<boolean>(() => localStorage.getItem('kexamanager:dark') === '1')

  const { t } = useTranslation()
  const [lang, setLang] = useState<string>(() => localStorage.getItem('kexamanager:lang') || 'fr')
  // responsive helpers not required here
  const [mobileOpen, setMobileOpen] = useState(false)

  // sync i18n language and persist
  useEffect(() => {
    i18n.changeLanguage(lang)
    localStorage.setItem('kexamanager:lang', lang)
  }, [lang])

  const theme = createTheme({
    palette: {
      mode: dark ? 'dark' : 'light',
    },
    components: {
      MuiTabs: {
        styleOverrides: {
          root: {
            backgroundColor: undefined,
          }
        }
      },
      MuiTab: {
        styleOverrides: {
          root: {
            // ensure contrast in dark mode
            color: dark ? 'rgba(255,255,255,0.85)' : undefined,
          }
        }
      }
    }
  })

  useEffect(() => {
    const v = localStorage.getItem('kexamanager:auth')
  setAuthed(Boolean(v))
  const r = localStorage.getItem('kexamanager:role')
  if (r === 'admin' || r === 'user') setRole(r)
  }, [])

  // keep tab in sync with role when role changes
  useEffect(() => {
    if (role === 'admin' || role === 'user') setTab(role)
  }, [role])

  function onAuth(r: 'admin' | 'user') {
    setAuthed(true)
    setRole(r)
  }

  function onAuthWithUser(r: 'admin' | 'user') {
    onAuth(r)
  }

  function logout() {
    localStorage.removeItem('kexamanager:auth')
    localStorage.removeItem('kexamanager:role')
    setAuthed(false)
    setRole(null)
  }

  if (!authed) return <Login onAuth={onAuthWithUser} />

  return (
    <ThemeProvider theme={theme}>
      <Container maxWidth="lg" sx={{py:3}}>
        <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',mb:2}}>
          <Box sx={{display:'flex',alignItems:'center',gap:2}}>
              <FormControlLabel control={<Switch checked={dark} onChange={(e) => { setDark(e.target.checked); localStorage.setItem('kexamanager:dark', e.target.checked ? '1':'0') }} />} label="Dark" />
              <Select value={lang} size="small" onChange={(e) => setLang(String(e.target.value))}>
                <MenuItem value="fr">FR</MenuItem>
                <MenuItem value="en">EN</MenuItem>
              </Select>
          </Box>
          <Box>
              <Button variant="outlined" onClick={logout}>Se déconnecter</Button>
          </Box>
        </Box>

  <Typography variant="h5" gutterBottom>{t('dashboard.title')}</Typography>

        <CssBaseline />
        <Box sx={{display:'flex',gap:2}}>
          {/* AppBar for mobile to show hamburger */}
          <AppBar position="fixed" color="default" sx={{ display: { md: 'none' } }}>
            <Toolbar>
              <IconButton edge="start" color="inherit" aria-label="menu" onClick={() => setMobileOpen(true)}>
                <MenuIcon />
              </IconButton>
              <Typography variant="h6" sx={{flex:1}}>{t('dashboard.title')}</Typography>
            </Toolbar>
          </AppBar>

          {/* Temporary Drawer for mobile */}
          <Drawer
            variant="temporary"
            open={mobileOpen}
            onClose={() => setMobileOpen(false)}
            ModalProps={{keepMounted:true}}
            PaperProps={{sx:{width:240, bgcolor:'background.paper', color:'text.primary'}}}
            sx={{ display: { xs: 'block', md: 'none' } }}
          >
            <List sx={{width:240, pt:2}}>
              <ListItemButton selected={tab==='buckets'} onClick={() => { setTab('buckets'); setMobileOpen(false); }}>
                <ListItemIcon><StorageIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.buckets')} />
              </ListItemButton>
              <ListItemButton selected={tab==='websites'} onClick={() => { setTab('websites'); setMobileOpen(false); }}>
                <ListItemIcon><LanguageIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.websites')} />
              </ListItemButton>
              <ListItemButton selected={tab==='apps'} onClick={() => { setTab('apps'); setMobileOpen(false); }}>
                <ListItemIcon><VpnKeyIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.apps')} />
              </ListItemButton>
              <Divider sx={{ my: 1 }} />
              <ListItemButton selected={tab==='adminTokens'} onClick={() => { setTab('adminTokens'); setMobileOpen(false); }}>
                <ListItemIcon><AdminPanelSettingsIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.adminTokens')} />
              </ListItemButton>
              <ListItemButton selected={tab==='nodes'} onClick={() => { setTab('nodes'); setMobileOpen(false); }}>
                <ListItemIcon><DevicesIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.nodes')} />
              </ListItemButton>
              <ListItemButton selected={tab==='blocks'} onClick={() => { setTab('blocks'); setMobileOpen(false); }}>
                <ListItemIcon><AppsIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.blocks')} />
              </ListItemButton>
              <ListItemButton selected={tab==='workers'} onClick={() => { setTab('workers'); setMobileOpen(false); }}>
                <ListItemIcon><BuildIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.workers')} />
              </ListItemButton>
              <ListItemButton selected={tab==='health'} onClick={() => { setTab('health'); setMobileOpen(false); }}>
                <ListItemIcon><HealthAndSafetyIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.health')} />
              </ListItemButton>
              <ListItemButton selected={tab==='cluster'} onClick={() => { setTab('cluster'); setMobileOpen(false); }}>
                <ListItemIcon><AccountTreeIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.cluster')} />
              </ListItemButton>
            </List>
          </Drawer>

          {/* Permanent Drawer for md+ */}
          <Drawer variant="permanent" open PaperProps={{sx:{bgcolor:'background.paper', color:'text.primary'}}} sx={{ display: { xs: 'none', md: 'block' } }}>
            <List sx={{width:240, pt:2, height: '100vh'}}>
              <ListItemButton selected={tab==='buckets'} onClick={() => setTab('buckets')}>
                <ListItemIcon><StorageIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.buckets')} />
              </ListItemButton>
              <ListItemButton selected={tab==='websites'} onClick={() => setTab('websites')}>
                <ListItemIcon><LanguageIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.websites')} />
              </ListItemButton>
              <ListItemButton selected={tab==='apps'} onClick={() => setTab('apps')}>
                <ListItemIcon><VpnKeyIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.apps')} />
              </ListItemButton>
              <Divider sx={{ my: 1 }} />
              <ListItemButton selected={tab==='adminTokens'} onClick={() => setTab('adminTokens')}>
                <ListItemIcon><AdminPanelSettingsIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.adminTokens')} />
              </ListItemButton>
              <ListItemButton selected={tab==='nodes'} onClick={() => setTab('nodes')}>
                <ListItemIcon><DevicesIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.nodes')} />
              </ListItemButton>
              <ListItemButton selected={tab==='blocks'} onClick={() => setTab('blocks')}>
                <ListItemIcon><AppsIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.blocks')} />
              </ListItemButton>
              <ListItemButton selected={tab==='workers'} onClick={() => setTab('workers')}>
                <ListItemIcon><BuildIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.workers')} />
              </ListItemButton>
              <ListItemButton selected={tab==='health'} onClick={() => setTab('health')}>
                <ListItemIcon><HealthAndSafetyIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.health')} />
              </ListItemButton>
              <ListItemButton selected={tab==='cluster'} onClick={() => setTab('cluster')}>
                <ListItemIcon><AccountTreeIcon /></ListItemIcon>
                <ListItemText primary={t('dashboard.cluster')} />
              </ListItemButton>
            </List>
          </Drawer>

          <Box component="main" sx={{flex:1, p:3, ml: { md: '240px', xs: 0 }, mt: { xs: '64px', md: 0 } }}>
            {tab === 'buckets' && <Buckets />}
            {tab === 'websites' && <Websites />}
            {tab === 'apps' && <ApplicationsKeys />}
            {tab === 'adminTokens' && <AdminTokens />}
            {tab === 'nodes' && <Nodes />}
            {tab === 'blocks' && <Blocks />}
            {tab === 'workers' && <Workers />}
            {tab === 'health' && <Health />}
            {tab === 'cluster' && <ClusterLayout />}
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  )
}

export default App
