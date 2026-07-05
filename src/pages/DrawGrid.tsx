import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { decodeShared, sharedToProject } from '../lib/share'
import { getProject, saveProject } from '../lib/storage'
import { loadDrawing, sourceFromSearch } from '../lib/backend'
import { serverGetProject } from '../lib/api'
import type { Project } from '../lib/types'

const STATUS_LABEL = { empty: '⬜ 비어있음', drawing: '🎨 그리는 중', done: '✅ 완성' } as const

export default function DrawGrid() {
  const { projectId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [project, setProject] = useState<Project | null>(null)
  const [thumbs, setThumbs] = useState<Record<number, string>>({})
  const [notFound, setNotFound] = useState(false)

  const source = sourceFromSearch(params)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    const run = async () => {
      let p: Project | undefined
      if (source === 'server') {
        // 서버(다른 기기)에서 프로젝트 불러오기
        p = await serverGetProject(projectId)
      } else {
        p = await getProject(projectId)
        const d = params.get('d')
        if (!p && d) {
          // 링크 속 데이터로 프로젝트를 이 기기에 저장 (학생용 링크에는 PIN 미포함)
          const shared = decodeShared(d)
          if (shared && shared.projectId === projectId) {
            p = sharedToProject(shared)
            await saveProject(p)
          }
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
        const d = await loadDrawing(source, p.projectId, page.index)
        if (d) t[page.index] = URL.createObjectURL(d.blob)
      }
      if (!cancelled) setThumbs(t)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [projectId, params, source])

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
      <div className="notice" style={{ margin: '10px 0 16px', maxWidth: 640 }}>
        <span className="material-icons-outlined" aria-hidden="true">
          touch_app
        </span>
        <span>
          <strong>내가 맡은 가사 카드를 눌러</strong> 그림을 그려요. 다 그리면 <strong>완성!</strong> 버튼을 누르는 것,
          잊지 마세요.
        </span>
      </div>
      <div className="page-grid">
        {project.pages.map((page) => (
          <button
            key={page.index}
            className="page-card"
            onClick={() =>
              navigate(`/draw/${project.projectId}/${page.index}${source === 'server' ? '?srv=1' : ''}`)
            }
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
