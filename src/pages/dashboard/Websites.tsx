import { useTranslation } from 'react-i18next'

export default function Websites(){
  const { t } = useTranslation()
  return <div><h3>{t('dashboard.websites')}</h3><p>{t('dashboard.websites_desc')}</p></div>
}
