# 여기 있어 뮤직비디오 (easy MV)

노래 가사를 한 줄씩 나눠 학생들이 그림을 그리고, 그 그림들로 뮤직비디오를 완성하는 교육용 웹앱입니다.

> Created by. 교육뮤지컬 꿈꾸는 치수쌤 (chichiboo)

## 핵심 흐름

1. **활동지 제작 (교사)** — 가사를 줄 단위로 나눠 페이지를 만들고, PDF/JPG로 인쇄하거나 학생 링크(QR)를 공유
2. **웹에서 그리기 (학생)** — 링크로 접속해 자기 페이지에 그림 그리기 (연필/붓/지우개/채우기, 실행취소, 자동 저장)
3. **뮤직비디오 만들기 (교사)** — 음원 + 학생 그림으로 타임라인 편집(탭 싱크, 전환효과, Ken Burns) 후 MP4 내보내기

## 아키텍처: 백엔드 없는 서버리스

**이 앱은 서버(백엔드) 없이 정적 호스팅만으로 동작합니다.** 원 기획의 KV/R2 백엔드는 다음 방식으로 대체했습니다:

| 원 기획 (서버) | 현재 구현 (서버리스) |
|---|---|
| KV에 프로젝트 JSON 저장 | 브라우저 IndexedDB에 저장 |
| 공유 링크가 서버에서 프로젝트 조회 | 프로젝트 설정 전체를 lz-string으로 압축해 **URL에 포함** (`?d=…`) |
| R2에 학생 그림 JPG 업로드 | 그린 기기의 IndexedDB에 JPG + 벡터 작업내역 저장 |
| 여러 기기의 그림을 서버에서 취합 | 같은 기기(교사 태블릿을 돌려쓰는 경우) 자동 취합, 다른 기기는 JPG 다운로드 → 편집기에 이미지 추가 |

이 구조의 특성:

- **되는 것**: 활동지 제작·인쇄, 링크/QR 공유(설정 복제), 같은 브라우저 안에서의 전체 흐름(그리기 → 편집 → 영상), 교사 간 활동지 복제
- **제약**: 학생이 **각자 다른 기기**에서 그린 그림은 자동으로 교사 기기로 모이지 않습니다. 이 경우 학생이 JPG를 내려받아 제출하고, 교사가 편집기의 "이미지 추가"로 불러옵니다. (태블릿을 돌려쓰며 그리는 교실에서는 자동 취합이 그대로 동작합니다)
- **추후 고도화**: Cloudflare Pages Functions + KV/R2를 붙이면 `src/lib/storage.ts`(저장)와 `src/lib/share.ts`(링크)만 서버 호출로 교체하면 됩니다. 데이터 모델(`src/lib/types.ts`)은 원 기획의 KV JSON 스키마와 호환되게 유지했습니다.

음원과 영상 렌더링은 기획대로 **전부 브라우저 안에서만** 처리됩니다 (저작권 파일이 어디에도 업로드되지 않음).

## 기술 스택

- React + Vite + TypeScript, React Router (SPA)
- 그리기: Canvas 직접 구현 (op 기록 + 재생 방식 실행취소, flood fill, 핀치 줌)
- PDF: `jspdf` (페이지를 캔버스로 렌더링 후 이미지 삽입 — 한글 폰트 문제 회피)
- ZIP: `jszip` / QR: `qrcode` / 저장: `idb` (IndexedDB)
- 영상: Canvas 프레임 렌더링 → WebCodecs `VideoEncoder` + `mp4-muxer` (H.264 + AAC, AAC 미지원 브라우저는 Opus)
  → WebCodecs 미지원 시 `MediaRecorder` webm 폴백
- 공유 링크: `lz-string` URL 압축

## 개발

```bash
npm install
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드 (dist/)
npm run lint     # oxlint
```

## 배포 (Cloudflare Pages)

- Build command: `npm run build`
- Output directory: `dist`
- SPA 라우팅용 `public/_redirects` 포함됨 (`/* /index.html 200`)

## 라우팅

| 경로 | 화면 | 대상 |
|---|---|---|
| `/` | 홈 + 내 프로젝트 목록 | 교사 |
| `/create` | 활동지 제작 (`?id=`로 기존 프로젝트 편집) | 교사 |
| `/t/:projectId?d=…` | 교사용 공유(복제) 뷰 | 교사 |
| `/draw/:projectId?d=…` | 페이지 선택 그리드 | 학생 |
| `/draw/:projectId/:pageIndex` | 그리기 화면 | 학생 |
| `/view/:projectId/:pageIndex` | 단일 페이지 뷰어 | 공유 대상 |
| `/edit/:projectId` | 뮤직비디오 편집 (PIN 필요) | 교사 |
