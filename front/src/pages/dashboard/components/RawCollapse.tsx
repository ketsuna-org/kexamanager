import { useState } from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import Collapse from '@mui/material/Collapse'
import Tooltip from '@mui/material/Tooltip'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import Typography from '@mui/material/Typography'

export default function RawCollapse({ title, data, defaultOpen }: { title?: string, data: unknown, defaultOpen?: boolean }){
  const [open, setOpen] = useState(Boolean(defaultOpen))

  const copy = async () => {
    try{
      await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    }catch(e){
      // ignore copy errors
      void e
    }
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" gap={1}>
        {title && <Typography variant="subtitle1">{title}</Typography>}
        <Box sx={{flex:1}} />
        <Tooltip title={open ? 'Hide raw' : 'Show raw'}>
          <IconButton onClick={() => setOpen(v => !v)}>
            <ExpandMoreIcon sx={{transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 200ms'}} />
          </IconButton>
        </Tooltip>
        <Tooltip title="Copy JSON">
          <IconButton onClick={copy}><ContentCopyIcon /></IconButton>
        </Tooltip>
      </Box>
      <Collapse in={open} sx={{mt:1}}>
        <Paper variant="outlined" sx={{p:2, bgcolor: 'background.paper'}}>
          <pre style={{whiteSpace:'pre-wrap', margin:0}}>{JSON.stringify(data, null, 2)}</pre>
          <Box mt={1} display="flex" justifyContent="flex-end">
            <Button size="small" onClick={copy} startIcon={<ContentCopyIcon />}>Copy</Button>
          </Box>
        </Paper>
      </Collapse>
    </Box>
  )
}
