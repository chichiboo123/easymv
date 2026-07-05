import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Layout from '../components/Layout'
import Modal from '../components/Modal'
import { deleteProject, listProjects } from '../lib/storage'
import { srvSuffix } from '../lib/backend'
import { isAdmin, serverConfigured } from '../lib/config'
import type { Project } from '../lib/types'

export default function Home() {
  const [projects, setProjects] = useState<Project[]>([])
  const [deleting, setDeleting] = useState<Project | null>(null)
  const [admin, setAdmin] = useState(isAdmin())
  const [openCode, setOpenCode] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    listProjects().then(setProjects)
    const onChange = () => setAdmin(isAdmin())
    window.addEventListener('easymv-admin-change', onChange)
    return () => window.removeEventListener('easymv-admin-change', onChange)
  }, [])

  return (
    <Layout>
      <section className="home-hero">
        <span className="hero-icon">
          <span className="material-icons-outlined" aria-hidden="true">
            music_video
          </span>
        </span>
        <h1>여기 있어 뮤직비디오</h1>
        <div className="home-actions">
          <Link to="/create" className="home-cta" style={{ background: 'var(--pastel-blue)' }}>
            <span className="home-cta-emoji" aria-hidden="true">📝</span>
            <strong>프로젝트 시작</strong>
            <span className="sub">가사 → 그리기 → 영상</span>
          </Link>
          <Link to="/edit" className="home-cta" style={{ background: 'var(--pastel-pink)' }}>
            <span className="home-cta-emoji" aria-hidden="true">🎬</span>
            <strong>뮤직비디오 만들기</strong>
            <span className="sub">사진·음원만으로 바로</span>
          </Link>
        </div>
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>내 프로젝트</h2>
        {projects.length === 0 ? (
          <p className="sub">아직 만든 프로젝트가 없어요. 위의 [프로젝트 시작] 버튼으로 시작해 보세요!</p>
        ) : (
          <div className="project-list">
            {projects.map((p) => (
              <div key={p.projectId} className="card project-row" style={{ padding: 14 }}>
                <span className="title">
                  {p.title || '(제목 없음)'}
                  {p.publishedToServer && (
                    <span
                      className="badge"
                      style={{ marginLeft: 8, background: 'var(--pastel-green)', color: '#1b6e42' }}
                    >
                      ☁️ 실시간
                    </span>
                  )}
                </span>
                <span className="meta">
                  {p.pages.length}페이지 · {new Date(p.createdAt).toLocaleDateString('ko-KR')} · ID {p.projectId}
                </span>
                <button className="mini-btn" onClick={() => navigate(`/create?id=${p.projectId}`)}>
                  <span className="material-icons-outlined" aria-hidden="true">
                    edit
                  </span>
                  편집
                </button>
                <button className="mini-btn" onClick={() => navigate(`/draw/${p.projectId}${srvSuffix(p)}`)}>
                  <span className="material-icons-outlined" aria-hidden="true">
                    brush
                  </span>
                  그리기
                </button>
                <button className="mini-btn" onClick={() => navigate(`/edit/${p.projectId}${srvSuffix(p)}`)}>
                  <span className="material-icons-outlined" aria-hidden="true">
                    movie
                  </span>
                  뮤직비디오
                </button>
                <button className="mini-btn" style={{ color: 'var(--danger)' }} onClick={() => setDeleting(p)}>
                  <span className="material-icons-outlined" aria-hidden="true">
                    delete
                  </span>
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="sub" style={{ marginTop: 12 }}>
          프로젝트와 그림은 이 브라우저 안에만 저장돼요. 다른 기기에서 이어서 쓰려면 공유 링크를 사용하세요.
        </p>
      </section>

      {admin && serverConfigured() && (
        <section className="card" style={{ marginTop: 16, border: '2px solid #111' }}>
          <h2 style={{ marginTop: 0 }}>☁️ 서버 프로젝트 열기 (관리자)</h2>
          <p className="sub">
            다른 기기에서 만든(서버에 올린) 프로젝트를 코드로 열어요. 학생 그림을 취합해 뮤직비디오를 만들 수 있어요.
          </p>
          <div className="share-row">
            <input
              type="text"
              placeholder="프로젝트 코드 (예: a3x9k2)"
              value={openCode}
              onChange={(e) => setOpenCode(e.target.value.trim())}
              style={{ maxWidth: 240 }}
              aria-label="프로젝트 코드"
            />
            <button
              className="btn"
              disabled={!openCode}
              onClick={() => navigate(`/edit/${openCode}?srv=1`)}
            >
              뮤직비디오 편집 열기
            </button>
            <button
              className="btn secondary"
              disabled={!openCode}
              onClick={() => navigate(`/draw/${openCode}?srv=1`)}
            >
              그리기 화면 열기
            </button>
          </div>
        </section>
      )}

      {deleting && (
        <Modal
          title="프로젝트를 삭제할까요?"
          onClose={() => setDeleting(null)}
          actions={
            <>
              <button className="btn ghost" onClick={() => setDeleting(null)}>
                취소
              </button>
              <button
                className="btn danger"
                onClick={async () => {
                  await deleteProject(deleting.projectId)
                  setProjects(await listProjects())
                  setDeleting(null)
                }}
              >
                삭제하기
              </button>
            </>
          }
        >
          <p>
            <strong>{deleting.title || '(제목 없음)'}</strong> 프로젝트와 학생 그림이 모두 지워져요. 되돌릴 수 없어요.
          </p>
        </Modal>
      )}
    </Layout>
  )
}
