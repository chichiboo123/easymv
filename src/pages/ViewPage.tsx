import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { exportPageJpg, exportPagePdf, renderPageWithDrawing } from '../lib/exporters'
import { loadDrawing, loadProject, sourceFromSearch } from '../lib/backend'
import type { PageData, Project } from '../lib/types'

export default function ViewPage() {
  const { projectId, pageIndex } = useParams()
  const [params] = useSearchParams()
  const source = sourceFromSearch(params)
  const [project, setProject] = useState<Project | null>(null)
  const [page, setPage] = useState<PageData | null>(null)
  const [drawingBlob, setDrawingBlob] = useState<Blob | null>(null)
  const [imgUrl, setImgUrl] = useState('')
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    if (!projectId) return
    let cancelled = false
    loadProject(source, projectId).then(async (p) => {
      if (cancelled) return
      if (!p) {
        setMissing(true)
        return
      }
      const pg = p.pages.find((x) => x.index === Number(pageIndex))
      if (!pg) {
        setMissing(true)
        return
      }
      setProject(p)
      setPage(pg)
      const d = await loadDrawing(source, projectId, Number(pageIndex))
      const blob = d?.blob ?? null
      setDrawingBlob(blob)
      const canvas = await renderPageWithDrawing(p, pg, blob)
      if (!cancelled) setImgUrl(canvas.toDataURL('image/jpeg', 0.85))
    })
    return () => {
      cancelled = true
    }
  }, [projectId, pageIndex, source])

  if (missing) {
    return (
      <Layout>
        <div className="card">
          <h1>그림을 찾을 수 없어요</h1>
          <p className="sub">
            이 앱은 서버 없이 동작해서, 그림은 그린 기기의 브라우저에만 저장돼요. 그림을 그린 기기에서 링크를 열어
            주세요.
          </p>
        </div>
      </Layout>
    )
  }

  if (!project || !page) {
    return (
      <Layout>
        <p className="sub">불러오는 중…</p>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="viewer-wrap form-stack">
        <h1>
          {project.title} — {page.index}페이지
        </h1>
        <p className="sub">
          {page.lyric}
          {page.studentName ? ` · 그린 사람: ${page.studentName}` : ''}
        </p>
        {imgUrl && <img src={imgUrl} alt={`${page.index}페이지 그림: ${page.lyric}`} />}
        <div className="option-row">
          <button className="btn" onClick={() => exportPageJpg(project, page, source === 'server' ? drawingBlob : undefined)}>
            <span className="material-icons-outlined" aria-hidden="true">
              image
            </span>
            JPG 다운로드
          </button>
          <button
            className="btn secondary"
            onClick={() => exportPagePdf(project, page, source === 'server' ? drawingBlob : undefined)}
          >
            <span className="material-icons-outlined" aria-hidden="true">
              picture_as_pdf
            </span>
            PDF 다운로드
          </button>
        </div>
      </div>
    </Layout>
  )
}
