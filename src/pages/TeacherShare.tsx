import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import Layout from '../components/Layout'
import { loadFontForCanvas } from '../lib/fonts'
import { renderPageCanvas } from '../lib/render'
import { decodeShared, sharedToProject } from '../lib/share'
import { getProject, saveProject } from '../lib/storage'
import { genPin, genProjectId } from '../lib/util'

export default function TeacherShare() {
  const { projectId } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [previews, setPreviews] = useState<string[]>([])

  const shared = useMemo(() => {
    const d = params.get('d')
    return d ? decodeShared(d) : null
  }, [params])

  useEffect(() => {
    if (!shared) return
    let cancelled = false
    const run = async () => {
      const p = sharedToProject(shared)
      await loadFontForCanvas(p.font, p.pages.map((pg) => pg.lyric).join(''))
      if (cancelled) return
      const urls = p.pages.slice(0, 8).map((page) => renderPageCanvas(p, page, { scale: 0.14 }).toDataURL('image/jpeg', 0.7))
      if (!cancelled) setPreviews(urls)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [shared])

  if (!shared) {
    return (
      <Layout theme="create">
        <div className="card">
          <h1>링크를 열 수 없어요</h1>
          <p className="sub">공유 링크가 잘못되었거나 잘려서 전달된 것 같아요. 링크 전체를 다시 복사해 달라고 요청해 주세요.</p>
        </div>
      </Layout>
    )
  }

  const copyToMine = async () => {
    const p = sharedToProject(shared)
    // 내가 이미 같은 ID를 갖고 있으면 새 ID로 복제
    const existing = await getProject(p.projectId)
    if (existing) p.projectId = genProjectId()
    if (!p.pin) p.pin = genPin()
    await saveProject(p)
    navigate(`/create?id=${p.projectId}`)
  }

  return (
    <Layout theme="create">
      <h1>공유받은 활동지</h1>
      <div className="card form-stack">
        <h2 style={{ margin: 0 }}>{shared.title || '(제목 없음)'}</h2>
        <p className="sub" style={{ margin: 0 }}>
          {shared.pages.length}페이지 · 폰트 {shared.font} · 프로젝트 ID {projectId}
        </p>
        <div className="preview-list">
          {previews.map((u, i) => (
            <div key={i} className="preview-item">
              <span className="pnum">{i + 1}</span>
              <img src={u} alt={`${i + 1}페이지 미리보기`} />
            </div>
          ))}
        </div>
        {shared.pages.length > 8 && <p className="sub">… 외 {shared.pages.length - 8}페이지</p>}
        <div>
          <button className="btn big" onClick={copyToMine}>
            <span className="material-icons-outlined" aria-hidden="true">
              content_copy
            </span>
            내 프로젝트로 복사
          </button>
        </div>
        <p className="sub">복사하면 내 브라우저에 저장되고, 자유롭게 편집·공유할 수 있어요.</p>
      </div>
    </Layout>
  )
}
