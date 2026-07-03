# 여기 있어 뮤직비디오 (easy MV)

노래 가사를 한 줄씩 나눠 학생들이 그림을 그리고, 그 그림들로 뮤직비디오를 완성하는 교육용 웹앱입니다.

> Created by. 교육뮤지컬 꿈꾸는 치수쌤 (chichiboo)

## 핵심 흐름

1. **활동지 제작 (교사)** — 가사를 줄 단위로 나눠 페이지를 만들고, PDF/JPG로 인쇄하거나 학생 링크(QR)를 공유
2. **웹에서 그리기 (학생)** — 링크로 접속해 자기 페이지에 그림 그리기 (연필/붓/지우개/채우기, 실행취소, 자동 저장)
3. **뮤직비디오 만들기 (교사)** — 음원 + 학생 그림으로 타임라인 편집(탭 싱크, 전환효과, Ken Burns) 후 MP4 내보내기

활동지 없이 **사진·그림만으로 바로 뮤직비디오**를 만들 수도 있습니다(홈 → "뮤직비디오 만들기", `/edit`).
사용법은 어느 화면에서든 우측 상단 **[사용법]** 아이콘으로 볼 수 있습니다.

## 주요 기능

**활동지 만들기 (`/create`)**
- 입력 내용이 브라우저(IndexedDB)에 **자동 저장** — 새로고침해도 마지막 초안을 이어서 편집(`localStorage`에 마지막 초안 id 기억)
- **실행취소 / 다시실행**(Ctrl+Z / Ctrl+Shift+Z, 아이콘 버튼) 과 **새로 만들기**(초기화) — 실수 복구
- 만든 활동지는 홈 "내 프로젝트" 목록에서 관리(편집·그리기·영상·삭제), 관리자 모드에서는 서버에 올려 다른 기기와 연동

**뮤직비디오 만들기 (`/edit`, `/edit/:projectId`)**
- 음원이 없어도 추가한 사진·그림이 **타임라인 썸네일**로 바로 표시되고, 썸네일을 **드래그해 순서 변경**
- **백업 / 복원**(우측 상단 아이콘): 편집 상태 + 사진을 `.emv.json` 파일로 저장하고 다른 브라우저·기기에서 복원 (음원은 저작권 보호를 위해 제외)
- **인트로/엔딩 카드 꾸미기**: 타임라인에서 카드를 선택하면 제목·부제/본문 텍스트와 **배경색 또는 배경 이미지**를 바꿀 수 있음(배경 밝기에 따라 글자색 자동 대비)

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

## 배포 (GitHub Pages / GitHub Actions)

저장소에서 바로 배포합니다. `.github/workflows/deploy.yml`이 기본 브랜치에 푸시될 때마다 빌드 후 GitHub Pages로 배포합니다.

**최초 1회 설정:**

1. **Settings → Pages → Build and deployment → Source**를 `GitHub Actions`로 설정
2. **커스텀 도메인** 사용 시 (`easymv.chichiboo.link`):
   - Settings → Pages → Custom domain에 `easymv.chichiboo.link` 입력 (저장소의 `public/CNAME`에도 포함되어 있음)
   - 도메인 DNS(chichiboo.link)에 CNAME 레코드 추가: `easymv` → `chichiboo123.github.io`
   - **Cloudflare를 쓴다면 이 레코드는 반드시 "DNS only(회색 구름)"** 로 두세요. 프록시(주황 구름)면 GitHub이 도메인 검증·HTTPS 인증서 발급을 못 해 배포가 `Deployment failed, try again later.` 로 실패합니다.
   - DNS 전파 후 "Enforce HTTPS" 체크
3. 기본 주소(`chichiboo123.github.io/easymv/`)를 쓰려면 `vite.config.ts`의 `base`를 `/easymv/`로 바꾸고 `public/CNAME`을 삭제하세요.

**동작 방식:**
- Build command: `npm run build` (CI에서 실행)
- Output directory: `dist`
- SPA 깊은 링크(`/draw/:id` 등) 대응: 워크플로우가 `dist/index.html`을 `dist/404.html`로 복사해, GitHub Pages가 404 폴백으로 앱을 로드하면 React Router가 경로를 처리합니다.

## 선택: 실시간 서버 연동 (Cloudflare)

기본은 서버 없이 동작합니다. 학생이 **다른 기기·집에서도** 코드로 접속해 그림을 제출하고 교사가 취합하려면,
선택적으로 Cloudflare Worker(KV + R2) 백엔드를 붙일 수 있습니다. 배포 방법은 [`worker/README.md`](worker/README.md)를
참고하세요. 배포한 Worker 주소를 저장소 Actions Variable `VITE_API_BASE` 에 넣으면 활성화됩니다. 이 값이 없으면
앱은 지금처럼 서버리스로만 동작합니다. (음원·완성 영상은 서버 연동 여부와 관계없이 항상 브라우저에서만 처리됩니다.)

## 라우팅

| 경로 | 화면 | 대상 |
|---|---|---|
| `/` | 홈 + 내 프로젝트 목록 | 교사 |
| `/create` | 활동지 제작 (`?id=`로 기존 프로젝트 편집, 없으면 마지막 초안 이어서) | 교사 |
| `/t/:projectId?d=…` | 교사용 공유(복제) 뷰 | 교사 |
| `/draw/:projectId?d=…` | 페이지 선택 그리드 | 학생 |
| `/draw/:projectId/:pageIndex` | 그리기 화면 | 학생 |
| `/view/:projectId/:pageIndex` | 단일 페이지 뷰어 | 공유 대상 |
| `/edit` | 뮤직비디오 편집 (활동지 없이 단독 실행) | 교사 |
| `/edit/:projectId` | 뮤직비디오 편집 (활동지 연계, PIN 필요) | 교사 |

> 서버 연동 프로젝트의 학생/편집 링크에는 `?srv=1`이 붙어 서버 모드로 동작합니다.
