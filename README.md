# 🌲 SoriSoop MV Studio (소리숲 뮤직비디오 스튜디오)

로컬 Whisper AI 음성 인식 기반의 **가사 자동 싱크 & 무료 한글 폰트 내장 뮤직비디오 제작 스튜디오**입니다. (macOS / Windows 지원)

---

## 📦 다운로드

[GitHub Releases](https://github.com/creatorjosephkr/sorisoop-studio/releases/latest)에서 OS 및 CPU 아키텍처에 맞는 설치 파일을 다운로드할 수 있습니다.

| 플랫폼 | 파일명 | 대상 |
| :--- | :--- | :--- |
| **macOS (Apple Silicon)** | `SoriSoop_MV_Studio_v1.0.0-Mac-arm64.dmg` | M1 / M2 / M3 / M4 등 Apple Silicon Mac |
| **macOS (Intel)** | `SoriSoop_MV_Studio_v1.0.0-Mac-intel.dmg` | Intel 프로세서 기반 Mac (`x64`) |
| **Windows** | `SoriSoop_MV_Studio_v1.0.0-Windows.exe` | Windows 64-bit (`x64`) 설치 파일 |

---

## ✨ 주요 기능

- **로컬 Whisper AI 가사 싱크**
  - 외부 서버 업로드 없이 로컬 환경(`@huggingface/transformers`)에서 오디오와 가사를 분석해 타임라인 싱크를 자동 생성합니다.
- **실시간 프리뷰 & 오디오 파형 타임라인**
  - 반응형 프리뷰 화면과 오디오 파형 타임라인, 시간 눈금자 재생헤드 드래그, 구간별 세그먼트 편집을 지원합니다.
- **배경 영상/이미지 & 텍스트 레이어**
  - 다중 배경 영상 클립·이미지, 오버레이, 모션 효과, 곡 제목·아티스트 등 자유로운 텍스트 레이어 배치가 가능합니다.
- **고화질 MP4 & 자막 파일 내보내기**
  - 내장 `ffmpeg` 기반 하드웨어 가속 MP4 영상 렌더링과 `SRT` / `ASS` 자막 내보내기를 지원합니다.
- **프로젝트 관리 & 업데이트 알림**
  - `.ssproj` 프로젝트 파일 저장/불러오기 및 GitHub Releases 버전 확인 기반 업데이트 알림 모달을 제공합니다.

---

## 🔤 내장 무료 한글 폰트 (16종)

시스템 폰트 저작권 걱정 없이 앱 내부에 포함된 상업적 이용 무료 한글 폰트만 안전하게 사용합니다.

- **고딕**: Pretendard (Regular / Bold), 고운돋움 Regular, 빗썸고딕 (Basic / Original), 한국철도 코레일체 (Light / Medium / Bold)
- **명조**: 고운바탕 Bold
- **포인트/손글씨**: 검은고딕 (Black Han Sans), 배달의민족 주아체, 넥슨 메이플스토리 (Light / Bold), OK단단체 Bold, ONE 모바일고딕 POP, KCC 간판체

---

## 🛠️ 개발 및 빌드 방법

### 1. 의존성 설치 및 개발 실행
```bash
npm install
npm run electron:dev
```

### 2. 프로덕션 빌드 (`TypeScript` + `Vite` + `Electron`)
```bash
npm run build
```

### 3. 멀티 플랫폼 패키징 (Mac arm64 / Mac intel / Windows x64)
타깃별 `ffmpeg-static` 바이너리를 자동으로 준비해 `release/` 폴더에 3가지 설치 파일을 한 번에 생성합니다.
```bash
npm run package:all
```

개별 타깃 빌드:
```bash
npm run package:mac
npm run package:win
```

---

## 🧩 기술 스택

- **Desktop**: Electron 34, electron-builder
- **Frontend**: React 19, TypeScript, Vite 6, Tailwind CSS 4, Lucide Icons
- **AI / Media**: `@huggingface/transformers` (Whisper), `ffmpeg-static`
