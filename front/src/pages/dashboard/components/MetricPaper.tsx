import React from 'react'
import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Typography from '@mui/material/Typography'

export default function MetricPaper({ icon, label, value }: { icon?: React.ReactNode, label: string, value: string }){
  return (
    <Paper sx={{p:2, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:110}} elevation={1}>
      {icon && <Box sx={{mb:1}}>{icon}</Box>}
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{mt:1, fontWeight:700, textAlign:'center'}}>{value}</Typography>
    </Paper>
  )
}
