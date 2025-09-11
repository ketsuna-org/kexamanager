import { useTranslation } from 'react-i18next'

export default function Health(){
  const { t } = useTranslation()
  return <div><h3>{t('dashboard.health')}</h3><p>{t('dashboard.health_desc')}</p></div>
}
