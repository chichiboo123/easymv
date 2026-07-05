import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles.css'

// 라우트별 코드 분할: 학생 그리기 화면이 편집기·PDF 라이브러리까지 내려받지 않도록
const Home = lazy(() => import('./pages/Home'))
const Create = lazy(() => import('./pages/Create'))
const TeacherShare = lazy(() => import('./pages/TeacherShare'))
const DrawGrid = lazy(() => import('./pages/DrawGrid'))
const DrawPage = lazy(() => import('./pages/DrawPage'))
const ViewPage = lazy(() => import('./pages/ViewPage'))
const Editor = lazy(() => import('./pages/Editor'))

function RouteLoading() {
  return (
    <div className="route-loading" role="status">
      <div className="spinner" aria-hidden="true" />
      불러오는 중…
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<RouteLoading />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/create" element={<Create />} />
          <Route path="/t/:projectId" element={<TeacherShare />} />
          <Route path="/draw/:projectId" element={<DrawGrid />} />
          <Route path="/draw/:projectId/:pageIndex" element={<DrawPage />} />
          <Route path="/view/:projectId/:pageIndex" element={<ViewPage />} />
          <Route path="/edit" element={<Editor />} />
          <Route path="/edit/:projectId" element={<Editor />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
)
