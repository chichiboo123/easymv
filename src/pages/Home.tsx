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
        <span className="material-icons-outlined" style={{ fontSize: 56, color: 'var(--primary)' }} aria-hidden="true">
          music_video
        </span>
        <h1>여기 있어 뮤직비디오</h1>
        <p className="sub">
          노래 가사를 한 줄씩 나눠 학생들이 그림을 그리고,
          <br />그 그림들로 우리 반 뮤직비디오를 완성해요.
        </p>
        <div className="home-actions">
          <Link to="/create" className="btn big pastel">
            프로젝트 시작
          </Link>
        </div>
      </section>

      <div className="feature-grid">
        <div className="feature-card" style={{ background: 'var(--pastel-blue)' }}>
          <span className="material-icons-outlined" aria-hidden="true">
            edit_document
          </span>
          <h2>① 활동지 제작</h2>
          <p className="sub">가사를 한 줄씩 나눠 활동지를 만들고 PDF·JPG로 내보내거나 학생 링크를 공유해요.</p>
        </div>
        <div className="feature-card" style={{ background: 'var(--pastel-yellow)' }}>
          <span className="material-icons-outlined" aria-hidden="true">
            brush
          </span>
          <h2>② 웹에서 그리기</h2>
          <p className="sub">학생이 링크로 접속해 자기 페이지에 그림을 그려요. 태블릿에 딱 맞아요.</p>
        </div>
        <div className="feature-card" style={{ background: 'var(--pastel-pink)' }}>
          <span className="material-icons-outlined" aria-hidden="true">
            movie
          </span>
          <h2>③ 뮤직비디오 만들기</h2>
          <p className="sub">음원과 그림을 타임라인에 얹어 MP4 뮤직비디오로 내보내요. 모두 브라우저 안에서!</p>
        </div>
      </div>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>내 프로젝트</h2>
        {projects.length === 0 ? (
          <p className="sub">아직 만든 프로젝트가 없어요. [활동지 만들기]로 시작해 보세요!</p>
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
