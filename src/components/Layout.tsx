import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import Footer from './Footer'
import Modal from './Modal'
import { disableAdmin, enableAdmin, isAdmin, registerSecretClick, serverConfigured } from '../lib/config'

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
  const navigate = useNavigate()
  const [admin, setAdmin] = useState(isAdmin())
  const [keyModal, setKeyModal] = useState(false)
  const [keyInput, setKeyInput] = useState('')

  useEffect(() => {
    const onChange = () => setAdmin(isAdmin())
    window.addEventListener('easymv-admin-change', onChange)
    return () => window.removeEventListener('easymv-admin-change', onChange)
  }, [])

  const onBrandClick = () => {
    if (registerSecretClick()) {
      if (isAdmin()) return // 이미 켜져 있으면 배지로 끄도록
      setKeyInput('')
      setKeyModal(true)
    } else {
      navigate('/')
    }
  }

  return (
    <>
      <header className="app-header">
        <button type="button" className="brand" onClick={onBrandClick} aria-label="홈으로">
          <span className="material-icons-outlined" aria-hidden="true">
            music_video
          </span>
          여기 있어 뮤직비디오
        </button>
        {admin && (
          <button
            type="button"
            className="theme-chip"
            style={{ background: '#111', color: '#fff', border: 'none', cursor: 'pointer' }}
            onClick={() => {
              if (window.confirm('관리자 모드를 끌까요?')) disableAdmin()
            }}
            title="관리자 모드 끄기"
          >
            ☁️ 관리자 모드
          </button>
        )}
        {theme && (
          <span className="theme-chip" style={{ background: THEME_COLORS[theme] }}>
            {THEME_LABELS[theme]}
          </span>
        )}
      </header>
      <main className={`app-main${wide ? ' wide' : ''}`}>{children}</main>
      <Footer />

      {keyModal && (
        <Modal
          title="관리자 모드"
          onClose={() => setKeyModal(false)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setKeyModal(false)}>
                취소
              </button>
              <button
                className="btn"
                disabled={!keyInput.trim()}
                onClick={() => {
                  enableAdmin(keyInput.trim())
                  setKeyModal(false)
                }}
              >
                켜기
              </button>
            </>
          }
        >
          <p className="sub">관리자 키를 입력하면 프로젝트를 서버에 올려 다른 기기와 실시간으로 연결할 수 있어요.</p>
          <input
            type="password"
            placeholder="관리자 키"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
            autoFocus
          />
          {!serverConfigured() && (
            <p className="sub" style={{ color: 'var(--danger)', marginTop: 8 }}>
              아직 서버 주소가 설정되지 않았어요. 서버 연결 기능은 배포 설정 후 사용할 수 있어요.
            </p>
          )}
        </Modal>
      )}
    </>
  )
}
