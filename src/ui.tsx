import { useEffect, useRef, type ReactNode } from 'react'

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k) }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="max-h-[92dvh] w-full max-w-lg overflow-y-auto overflow-x-hidden rounded-t-3xl bg-bg p-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="min-w-0 flex-1 break-words text-xl font-bold">{title}</h2>
          <button className="btn-g shrink-0" onClick={onClose} aria-label="Tanca">✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}
export const Field = ({ label, children }: { label: string; children: ReactNode }) => <div className="min-w-0"><label className="f">{label}</label>{children}</div>
export const Empty = ({ children }: { children: ReactNode }) => <div className="card text-center text-sm text-mute">{children}</div>
export function Title({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return <div className="mb-3 mt-1 flex min-w-0 flex-wrap items-center justify-between gap-2"><h1 className="min-w-0 break-words text-2xl font-bold">{children}</h1>{right && <div className="shrink-0">{right}</div>}</div>
}
export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'warn' | 'bad' }) {
  return <div className="card"><div className="text-xs text-mute">{label}</div><div className={`mt-1 break-words font-serif text-2xl font-bold ${tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : ''}`}>{value}</div>{sub && <div className="mt-0.5 text-xs text-mute">{sub}</div>}</div>
}
export function useAutofocus<T extends HTMLElement>() { const r = useRef<T>(null); useEffect(() => { r.current?.focus() }, []); return r }
export const num = (s: string) => { const n = parseFloat(s.replace(',', '.')); return Number.isFinite(n) ? n : 0 }
export const uid = () => Math.random().toString(36).slice(2, 9)
