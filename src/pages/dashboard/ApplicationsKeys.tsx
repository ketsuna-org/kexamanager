import { useTranslation } from 'react-i18next'

export default function ApplicationsKeys(){
  const { t } = useTranslation()
  return <div><h3>{t('dashboard.apps')}</h3><p>{t('dashboard.apps_desc')}</p></div>
}
