import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ListBlockErrors } from '../../utils/apiWrapper'
import Table from '@mui/material/Table'
import TableBody from '@mui/material/TableBody'
import TableCell from '@mui/material/TableCell'
import TableContainer from '@mui/material/TableContainer'
import TableHead from '@mui/material/TableHead'
import TableRow from '@mui/material/TableRow'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogActions from '@mui/material/DialogActions'

export default function Blocks(){
  const { t } = useTranslation()
    const [errorsList, setErrorsList] = useState<unknown[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
    const [detailOpen, setDetailOpen] = useState(false)
    const [detailItem, setDetailItem] = useState<unknown | null>(null)

    async function load() {
      setLoading(true)
      setError(null)
      try {
  const res = await ListBlockErrors()
        const maybe = res as unknown
        const data = (maybe as { data?: unknown }).data
        if (Array.isArray(data)) setErrorsList(data)
        else if (Array.isArray(maybe)) setErrorsList(maybe as unknown[])
        else setErrorsList([])
      } catch (e) {
        setError((e as unknown as { message?: string })?.message || String(e))
      } finally {
        setLoading(false)
      }
    }

  useEffect(() => { load() }, [])

  function openDetails(item: unknown){ setDetailItem(item); setDetailOpen(true) }
  function closeDetails(){ setDetailOpen(false); setDetailItem(null) }

  return (
    <div>
      <h3>{t('dashboard.blocks')}</h3>
      <p>{t('dashboard.blocks_desc')}</p>
      {loading && <div>{t('common.loading')}</div>}
      {error && <div style={{color:'red'}}>{error}</div>}
      {!loading && !error && (
          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell>
                  <TableCell>{t('blocks.col.node')}</TableCell>
                  <TableCell>{t('blocks.col.error')}</TableCell>
                  <TableCell>{t('common.actions')}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {errorsList.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} sx={{textAlign:'center'}}>{t('blocks.empty')}</TableCell>
                  </TableRow>
                )}
                {errorsList.map((it, idx) => {
                  const obj = it as unknown as Record<string, unknown>
                  return (
                    <TableRow key={idx}>
                      <TableCell>{idx+1}</TableCell>
                      <TableCell>{(obj['Node'] as string) || (obj['node'] as string) || ''}</TableCell>
                      <TableCell>{(obj['Error'] as string) || (obj['error'] as string) || JSON.stringify(obj)}</TableCell>
                      <TableCell>
                        <Button size="small" onClick={() => openDetails(it)}>{t('common.details')}</Button>
                        <Button size="small" onClick={() => load()}>{t('common.refresh')}</Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </TableContainer>
      )}

      <Dialog open={detailOpen} onClose={closeDetails} fullWidth maxWidth="md">
        <DialogTitle>{t('common.details')}</DialogTitle>
        <DialogContent>
          <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(detailItem, null, 2)}</pre>
        </DialogContent>
        <DialogActions>
          <Button onClick={closeDetails}>{t('common.close')}</Button>
        </DialogActions>
      </Dialog>
    </div>
  )
}
