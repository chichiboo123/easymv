import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { decodeShared, sharedToProject } from '../lib/share'
import { getDrawing, getProject, saveProject } from '../lib/storage'
import type { Project } from '../lib/types'

const STATUS_LABEL = { empty: '⬜ 비어있음', drawing: '🎨 그리는 중', done: '✅ 완성' } as const

export default function DrawGrid() {
  const { projectId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const run = async () => {
      let p = await getProject(projectId)
      const d = params.get('d')
      if (!p && d) {
        // 링크 속 데이터로 프로젝트를 이 기기에 저장 (학생용 링크에는 PIN 미포함)
        const shared = decodeShared(d)
        if (shared && shared.projectId === projectId) {
          p = sharedToProject(shared)
          await saveProject(p)
        }
      }
      if (cancelled) return
      if (!p) {
        setNotFound(true)
        return
      }
      setProject(p)
      const t: Record<number, string> = {}
      for (const page of p.pages) {
        if (page.status === 'empty') continue
        const rec = await getDrawing(p.projectId, page.index)
        if (rec) t[page.index] = URL.createObjectURL(rec.blob)
      }
      if (!cancelled) setThumbs(t)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [projectId, params])

  if (notFound) {
    return (
      <Layout theme="draw">
        <div className="card">
          <h1>프로젝트를 찾을 수 없어요</h1>
          <p className="sub">
            선생님이 보내준 링크 전체(QR코드)로 다시 접속해 주세요. 링크에는 활동지 정보가 함께 담겨 있어요.
          </p>
        </div>
      </Layout>
    )
  }

  if (!project) {
    return (
      <Layout theme="draw">
        <p className="sub">불러오는 중…</p>
      </Layout>
    )
  }

  return (
    <Layout theme="draw" wide>
      <h1>{project.title || '우리 반 뮤직비디오'}</h1>
      <p className="sub">자기가 맡은 페이지를 눌러서 그림을 그려요!</p>
      <div className="page-grid">
        {project.pages.map((page) => (
          <button
            key={page.index}
            className="page-card"
            onClick={() => navigate(`/draw/${project.projectId}/${page.index}`)}
          >
            <div className="thumb">
              {thumbs[page.index] ? (
                <img src={thumbs[page.index]} alt={`${page.index}페이지 그림`} />
              ) : (
                <span className="material-icons-outlined" aria-hidden="true">
                  image
                </span>
              )}
            </div>
            <div className="info">
              <div className="lyric">
                {page.index}. {page.lyric}
              </div>
              <div className="status-line">
                <span className={`status-chip ${page.status}`}>{STATUS_LABEL[page.status]}</span>
                {page.studentName && <span>{page.studentName}</span>}
              </div>
            </div>
          </button>
        ))}
      </div>
      <p className="sub" style={{ marginTop: 16 }}>
        그림은 이 기기(태블릿)의 브라우저에 저장돼요. 같은 기기에서 이어 그릴 수 있어요.
      </p>
    </Layout>
  )
}
