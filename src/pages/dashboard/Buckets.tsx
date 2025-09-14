import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Tooltip from '@mui/material/Tooltip'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'
import TextField from '@mui/material/TextField'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import { ListBuckets } from '../../utils/apiWrapper'

type Bucket = {
  BucketArn?: string
  BucketRegion?: string
  CreationDate?: string
  Name?: string
}

export default function Buckets(){
  const { t } = useTranslation()
  const [buckets, setBuckets] = useState<Bucket[]>([])
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ BucketArn: '', BucketRegion: '', Name: '' })

  function openModal(){ setForm({ BucketArn: '', BucketRegion: '', Name: '' }); setOpen(true) }
  function closeModal(){ setOpen(false) }
  function submit(){
    const b: Bucket = { ...form, CreationDate: new Date().toISOString() }
    setBuckets(prev => [b, ...prev])
    setOpen(false)
  }

  useEffect(() => {
    let mounted = true
    ListBuckets()
      .then((res) => {
        if (!mounted) return
        const maybeData = (res as unknown) as { data?: unknown }
        if (Array.isArray(maybeData.data)) setBuckets(maybeData.data as Bucket[])
      })
      .catch(() => {})
    return () => { mounted = false }
  }, [])

  return (
    <Box>
      <Box sx={{display:'flex',justifyContent:'space-between',alignItems:'center',mb:2}}>
        <div>
          <h3 style={{margin:0}}>{t('dashboard.buckets')}</h3>
          <p style={{margin:0}}>{t('dashboard.buckets_desc')}</p>
        </div>
        <Button variant="contained" onClick={openModal}>{t('dashboard.buckets_add')}</Button>
      </Box>

      <TableContainer component={Paper}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>{t('buckets.col.arn')}</TableCell>
              <TableCell>{t('buckets.col.region')}</TableCell>
              <TableCell>{t('buckets.col.creationDate')}</TableCell>
              <TableCell>{t('buckets.col.name')}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {buckets.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} sx={{textAlign:'center'}}>{t('buckets.empty')}</TableCell>
              </TableRow>
            )}
            {buckets.map((b, idx) => (
              <TableRow key={idx}>
                <TableCell>
                  <Tooltip title={t('buckets.arn_tooltip')}>
                    <span style={{wordBreak:'break-all'}}>{b.BucketArn}</span>
                  </Tooltip>
                </TableCell>
                <TableCell>{b.BucketRegion}</TableCell>
                <TableCell>{b.CreationDate ? new Date(b.CreationDate).toLocaleString() : ''}</TableCell>
                <TableCell>{b.Name}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={open} onClose={closeModal} fullWidth maxWidth="sm">
        <DialogTitle>{t('buckets.modal.title')}</DialogTitle>
        <DialogContent>
          <Tooltip title={t('buckets.arn_tooltip')}>
            <TextField
              autoFocus
              margin="dense"
              label={t('buckets.form.arn')}
              type="text"
              fullWidth
              value={form.BucketArn}
              onChange={(e) => setForm(f => ({...f, BucketArn: e.target.value}))}
            />
          </Tooltip>
          <TextField
            margin="dense"
            label={t('buckets.form.region')}
            type="text"
            fullWidth
            value={form.BucketRegion}
            onChange={(e) => setForm(f => ({...f, BucketRegion: e.target.value}))}
          />
          <TextField
            margin="dense"
            label={t('buckets.form.name')}
            type="text"
            fullWidth
            value={form.Name}
            onChange={(e) => setForm(f => ({...f, Name: e.target.value}))}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={closeModal}>{t('common.cancel')}</Button>
          <Button variant="contained" onClick={submit}>{t('common.add')}</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
