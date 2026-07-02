import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import './styles.css'
import Home from './pages/Home'
import Create from './pages/Create'
import TeacherShare from './pages/TeacherShare'
import DrawGrid from './pages/DrawGrid'
import DrawPage from './pages/DrawPage'
import ViewPage from './pages/ViewPage'
import Editor from './pages/Editor'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<Create />} />
        <Route path="/t/:projectId" element={<TeacherShare />} />
        <Route path="/draw/:projectId" element={<DrawGrid />} />
        <Route path="/draw/:projectId/:pageIndex" element={<DrawPage />} />
        <Route path="/view/:projectId/:pageIndex" element={<ViewPage />} />
        <Route path="/edit/:projectId" element={<Editor />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
