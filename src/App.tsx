import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, seed, ensureCycles, getSettings, DEFAULT_SETTINGS } from './db'
import Inici from './pages/Inici'
import Compra from './pages/Compra'
import Rebost from './pages/Rebost'
import Tiquets from './pages/Tiquets'
import Analisi from './pages/Analisi'
import Configuracio from './pages/Configuracio'

export type Tab = 'inici' | 'compra' | 'rebost' | 'tiquets' | 'analisi' | 'config'
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'inici', label: 'Inici', icon: '🏡' },
  { id: 'compra', label: 'Compra', icon: '🛒' },
  { id: 'rebost', label: 'El meu rebost', icon: '🫙' },
  { id: 'tiquets', label: 'Tiquets', icon: '🧾' },
  { id: 'analisi', label: 'Anàlisi', icon: '📊' },
  { id: 'config', label: 'Configuració', icon: '⚙️' },
]

function applyTheme(pref: string) {
  const dark = pref === 'fosc' || (pref === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export default function App() {
  const [tab, setTab] = useState<Tab>('inici')
  const [ready, setReady] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)
  const settings = useLiveQuery(getSettings, [], DEFAULT_SETTINGS)
  const pending = useLiveQuery(() => db.alerts.count(), [], 0)

  useEffect(() => { seed().then(() => ensureCycles()).then(() => setReady(true)) }, [])
  useEffect(() => {
    applyTheme(settings.theme)
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => settings.theme === 'auto' && applyTheme('auto')
    mq.addEventListener('change', h)
    return () => mq.removeEventListener('change', h)
  }, [settings.theme])
  useEffect(() => {
    const on = () => setOnline(true), off = () => setOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  if (!ready) return <div className="grid h-full place-items-center text-mute">Carregant El Rebost…</div>
  const go = (t: Tab) => { setTab(t); window.scrollTo(0, 0) }
  return (
    <div className="min-h-full">
      {!online && <div className="bg-sand/30 px-3 py-1.5 text-center text-xs text-warn">Sense connexió: les dades es guarden en aquest dispositiu.</div>}
      <main key={tab} className="page">
        {tab === 'inici' && <Inici go={go} />}
        {tab === 'compra' && <Compra />}
        {tab === 'rebost' && <Rebost />}
        {tab === 'tiquets' && <Tiquets />}
        {tab === 'analisi' && <Analisi />}
        {tab === 'config' && <Configuracio onProducts={() => go('rebost')} />}
      </main>
      <nav className="nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 backdrop-blur" aria-label="Navegació principal">
        <ul className="mx-auto grid max-w-[720px] grid-cols-6">
          {TABS.map((t) => (
            <li key={t.id}>
              <button onClick={() => go(t.id)} aria-current={tab === t.id ? 'page' : undefined}
                className={`flex h-[58px] w-full flex-col items-center justify-center gap-0.5 px-0 text-[9.5px] leading-tight tracking-tight ${tab === t.id ? 'font-semibold text-brand' : 'text-mute'}`}>
                <span className={`text-lg ${tab === t.id ? '' : 'grayscale opacity-70'}`}>{t.icon}</span>
                <span className="text-center">{t.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>
      {pending < 0 && null}
    </div>
  )
}
