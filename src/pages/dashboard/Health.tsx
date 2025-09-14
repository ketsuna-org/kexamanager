import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GetClusterHealth } from '../../utils/apiWrapper'
import { GetClusterStatistics } from '../../utils/apiWrapper'
import type { components } from '../../types/openapi'

// MUI imports
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Chip from '@mui/material/Chip'
import Button from '@mui/material/Button'
import Typography from '@mui/material/Typography'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import ReportProblemIcon from '@mui/icons-material/ReportProblem'
import CancelIcon from '@mui/icons-material/Cancel'
import LinkIcon from '@mui/icons-material/Link'
import StorageIcon from '@mui/icons-material/Storage'
import LayersIcon from '@mui/icons-material/Layers'
import AccountTreeIcon from '@mui/icons-material/AccountTree'
import Snackbar from '@mui/material/Snackbar'
import Alert from '@mui/material/Alert'
import MetricPaper from './components/MetricPaper'
import RawCollapse from './components/RawCollapse'

type ClusterHealth = components['schemas']['GetClusterHealthResponse']

export default function Health(){
  const { t } = useTranslation()
  const [health, setHealth] = useState<ClusterHealth | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // raw visibility handled by RawCollapse component
  const [snackOpen, setSnackOpen] = useState(false)
  const [stats, setStats] = useState<components['schemas']['GetClusterStatisticsResponse'] | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    GetClusterHealth()
      .then((res) => {
        if (!mounted) return
        const data = (res as ClusterHealth)
        setHealth(data)
      })
      .catch((e) => { if (mounted) setError((e as unknown as { message?: string })?.message || String(e)) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    let mounted = true
    setStatsLoading(true)
    GetClusterStatistics()
      .then((res) => {
        if (!mounted) return
        setStats(res as components['schemas']['GetClusterStatisticsResponse'])
      })
      .catch((e) => { if (mounted) setStatsError((e as unknown as { message?: string })?.message || String(e)) })
      .finally(() => { if (mounted) setStatsLoading(false) })
    return () => { mounted = false }
  }, [])

  // raw copy handled by RawCollapse

  const copyStats = async () => {
    if (!stats) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(stats, null, 2))
      setSnackOpen(true)
    } catch {
      // ignore
    }
  }

  const chipColor = (status?: string) => {
    switch (status) {
      case 'healthy': return 'success'
      case 'degraded': return 'warning'
      case 'unavailable': return 'error'
      default: return 'default'
    }
  }

  return (
    <Box sx={{p:4}}>
      <Typography variant="h5" gutterBottom sx={{mb:1}}>{t('dashboard.health')}</Typography>
      <Typography variant="body2" color="textSecondary" paragraph sx={{mb:3}}>{t('dashboard.health_desc')}</Typography>

      {loading && <Typography>{t('common.loading')}</Typography>}
      {error && <Typography color="error">{error}</Typography>}

      {!loading && !error && health && (
        <Box>
          <Box display="flex" alignItems="center" gap={2} mb={3} sx={{px:1}}>
            <Typography variant="subtitle1" sx={{fontWeight:700}}>{t('dashboard.cluster_status')}:</Typography>
            <Chip
              icon={health.status === 'healthy' ? <CheckCircleIcon /> : health.status === 'degraded' ? <ReportProblemIcon /> : <CancelIcon />}
              label={health.status}
              color={chipColor(health.status)}
              sx={{textTransform:'capitalize', py:0.5}}
            />
            <Box sx={{flex:1}} />
            <RawCollapse data={health} defaultOpen={false} />
          </Box>

          <Box sx={{display:'flex', gap:3, flexWrap:'wrap', alignItems:'stretch'}}>
            <Box sx={{flex:'1 1 220px', minWidth:220}}>
              <MetricPaper icon={<LinkIcon fontSize="large" color="action"/>} label={t('dashboard.connected_nodes')} value={`${health.connectedNodes} / ${health.knownNodes}`} />
            </Box>
            <Box sx={{flex:'1 1 220px', minWidth:220}}>
              <MetricPaper icon={<StorageIcon fontSize="large" color="action"/>} label={t('dashboard.storage_nodes')} value={`${health.storageNodesOk} / ${health.storageNodes}`} />
            </Box>
            <Box sx={{flex:'1 1 220px', minWidth:220}}>
              <MetricPaper icon={<LayersIcon fontSize="large" color="action"/>} label={t('dashboard.partitions_all_ok')} value={`${health.partitionsAllOk} / ${health.partitions}`} />
            </Box>
            <Box sx={{flex:'1 1 220px', minWidth:220}}>
              <MetricPaper icon={<AccountTreeIcon fontSize="large" color="action"/>} label={t('dashboard.partitions_quorum')} value={`${health.partitionsQuorum} / ${health.partitions}`} />
            </Box>
          </Box>

          {/* raw view handled by RawCollapse above */}
          <Box sx={{mt:2}}>
            <Typography variant="subtitle1" sx={{mb:1, fontWeight:700}}>{t('dashboard.cluster_stats')}</Typography>
            {statsLoading && <Typography>{t('common.loading')}</Typography>}
            {statsError && <Typography color="error">{statsError}</Typography>}
            {!statsLoading && !statsError && stats && (
              <Paper variant="outlined" sx={{p:2, bgcolor: 'background.paper'}}>
                <Typography variant="caption" color="text.secondary">{t('dashboard.cluster_stats_freeform')}</Typography>
                <pre style={{whiteSpace:'pre-wrap', marginTop:8, marginBottom:8}}>{stats.freeform}</pre>
                <Box display="flex" justifyContent="flex-end" gap={1}>
                  <Button size="small" onClick={copyStats} startIcon={<ContentCopyIcon />}>{t('dashboard.copy_json')}</Button>
                </Box>
              </Paper>
            )}
          </Box>
          <Snackbar open={snackOpen} autoHideDuration={2500} onClose={() => setSnackOpen(false)} anchorOrigin={{vertical:'bottom', horizontal:'right'}}>
            <Alert severity="success" sx={{width:'100%'}} onClose={() => setSnackOpen(false)}>{t('common.copied') ?? t('dashboard.copy_json')}</Alert>
          </Snackbar>
        </Box>
      )}
    </Box>
  )
}

// Snackbar close handler
// (snackbar handled inside component)
