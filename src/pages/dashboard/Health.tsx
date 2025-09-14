import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { GetClusterHealth } from '../../utils/apiWrapper'

export default function Health(){
  const { t } = useTranslation()
  const [health, setHealth] = useState<unknown | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    GetClusterHealth()
      .then((res) => {
        if (!mounted) return
        const maybe = res as unknown
        const data = (maybe as { data?: unknown }).data
        setHealth(data ?? maybe)
      })
      .catch((e) => { if (mounted) setError((e as unknown as { message?: string })?.message || String(e)) })
      .finally(() => { if (mounted) setLoading(false) })
    return () => { mounted = false }
  }, [])

  return (
    <div>
      <h3>{t('dashboard.health')}</h3>
      <p>{t('dashboard.health_desc')}</p>
      {loading && <div>{t('common.loading')}</div>}
      {error && <div style={{color:'red'}}>{error}</div>}
      {!loading && !error && <pre style={{whiteSpace:'pre-wrap'}}>{JSON.stringify(health, null, 2)}</pre>}
    </div>
  )
}
