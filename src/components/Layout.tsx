import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Footer from './Footer'

const THEME_COLORS: Record<string, string> = {
  create: 'var(--pastel-blue)',
  draw: 'var(--pastel-yellow)',
  edit: 'var(--pastel-pink)',
}

const THEME_LABELS: Record<string, string> = {
  create: '활동지 만들기',
  draw: '그림 그리기',
  edit: '뮤직비디오 만들기',
}

export default function Layout({
  children,
  theme,
  wide,
}: {
  children: ReactNode
  theme?: 'create' | 'draw' | 'edit'
  wide?: boolean
}) {
  return (
    <>
      <header className="app-header">
        <Link to="/" className="brand">
          <span className="material-icons-outlined" aria-hidden="true">
            music_video
          </span>
          여기 있어 뮤직비디오
        </Link>
        {theme && (
          <span className="theme-chip" style={{ background: THEME_COLORS[theme] }}>
            {THEME_LABELS[theme]}
          </span>
        )}
      </header>
      <main className={`app-main${wide ? ' wide' : ''}`}>{children}</main>
      <Footer />
    </>
  )
}
