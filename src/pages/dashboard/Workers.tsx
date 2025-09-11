import { useTranslation } from 'react-i18next'

export default function Workers(){
  const { t } = useTranslation()
  return <div><h3>{t('dashboard.workers')}</h3><p>{t('dashboard.workers_desc')}</p></div>
}
