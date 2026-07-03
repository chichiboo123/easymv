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
  const [helpOpen, setHelpOpen] = useState(false)

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
        <div className="header-right">
          {theme && (
            <span className="theme-chip" style={{ background: THEME_COLORS[theme] }}>
              {THEME_LABELS[theme]}
            </span>
          )}
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
              ☁️ 관리자
            </button>
          )}
          <button type="button" className="help-btn" onClick={() => setHelpOpen(true)} aria-label="사용법 보기">
            <span className="material-icons-outlined" aria-hidden="true">
              help_outline
            </span>
            <span className="help-label">사용법</span>
          </button>
        </div>
      </header>
      <main className={`app-main${wide ? ' wide' : ''}`}>{children}</main>
      <Footer />

      {helpOpen && (
        <Modal
          title="이렇게 사용해요"
          onClose={() => setHelpOpen(false)}
          actions={
            <button className="btn" onClick={() => setHelpOpen(false)}>
              알겠어요
            </button>
          }
        >
          <ol className="help-steps">
            <li>
              <span className="help-emoji" aria-hidden="true">📝</span>
              <div>
                <strong>활동지 만들기</strong>
                <p>가사를 한 줄씩 넣으면 페이지가 만들어져요. 학생 링크(QR)를 나눠주세요.</p>
              </div>
            </li>
            <li>
              <span className="help-emoji" aria-hidden="true">🎨</span>
              <div>
                <strong>그림 그리기</strong>
                <p>학생이 링크로 들어와 자기 페이지에 그림을 그려요.</p>
              </div>
            </li>
            <li>
              <span className="help-emoji" aria-hidden="true">🎬</span>
              <div>
                <strong>뮤직비디오 만들기</strong>
                <p>음원과 그림으로 영상을 완성해요. 활동지 없이 사진·그림만 올려서도 만들 수 있어요.</p>
              </div>
            </li>
          </ol>
          <p className="sub" style={{ marginTop: 12 }}>
            모든 작업은 이 브라우저 안에서 처리돼요. 음원은 어디에도 올라가지 않아요.
          </p>
        </Modal>
      )}

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
