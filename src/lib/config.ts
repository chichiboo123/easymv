// 서버(선택 기능) 연결 설정 + 관리자 모드 상태

/** 빌드 시 주입되는 Worker API 주소. 없으면 서버 기능 자체가 숨겨짐. */
export const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export const serverConfigured = (): boolean => API_BASE.length > 0

const ADMIN_FLAG = 'easymv_admin'
const ADMIN_KEY = 'easymv_admin_key'

export const isAdmin = (): boolean => {
  try {
    return localStorage.getItem(ADMIN_FLAG) === '1'
  } catch {
    return false
  }
}

export const getAdminKey = (): string => {
  try {
    return localStorage.getItem(ADMIN_KEY) ?? ''
  } catch {
    return ''
  }
}

export function enableAdmin(key: string): void {
  localStorage.setItem(ADMIN_FLAG, '1')
  localStorage.setItem(ADMIN_KEY, key)
  window.dispatchEvent(new Event('easymv-admin-change'))
}

export function disableAdmin(): void {
  localStorage.removeItem(ADMIN_FLAG)
  localStorage.removeItem(ADMIN_KEY)
  window.dispatchEvent(new Event('easymv-admin-change'))
}

// ---------- 숨은 진입: 로고 5회 연속 클릭 ----------
let clickTimes: number[] = []
export function registerSecretClick(): boolean {
  const now = Date.now()
  clickTimes = clickTimes.filter((t) => now - t < 1500)
  clickTimes.push(now)
  if (clickTimes.length >= 5) {
    clickTimes = []
    return true
  }
  return false
}
