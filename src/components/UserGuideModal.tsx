import React, { useState } from 'react';
import {
  BookOpen,
  Film,
  Image as ImageIcon,
  Layers,
  Music,
  ShieldCheck,
  Sparkles,
  Type,
  X,
} from 'lucide-react';
import guideMainImg from '../assets/guide/guide-main.png';
import guideTextImg from '../assets/guide/guide-text.png';
import guideBgImg from '../assets/guide/guide-bg.png';
import guideExportImg from '../assets/guide/guide-export.png';

interface UserGuideModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type GuideTab = 'overview' | 'features' | 'lyrics' | 'media' | 'text' | 'export';

const TABS: Array<{ id: GuideTab; label: string; icon: React.ReactNode }> = [
  { id: 'overview', label: '목적·특성·라이선스', icon: <ShieldCheck className="h-3.5 w-3.5" /> },
  { id: 'features', label: '주요 기능', icon: <Sparkles className="h-3.5 w-3.5" /> },
  { id: 'lyrics', label: '음원·가사 싱크', icon: <Music className="h-3.5 w-3.5" /> },
  { id: 'media', label: '배경·영상 편집', icon: <ImageIcon className="h-3.5 w-3.5" /> },
  { id: 'text', label: '자막·텍스트', icon: <Type className="h-3.5 w-3.5" /> },
  { id: 'export', label: '영상 내보내기', icon: <Film className="h-3.5 w-3.5" /> },
];

export const UserGuideModal: React.FC<UserGuideModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<GuideTab>('overview');

  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl"
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
              <BookOpen className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                소리숲 뮤직비디오 스튜디오 사용방법
              </h2>
              <p className="text-[11px] text-slate-400">
                로컬 가사 싱크 &amp; 영상·텍스트 편집 · 고화질 내보내기 가이드
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="사용방법 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 섹션 탭 */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-800 bg-slate-950/60 px-5 py-2.5">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-slate-950 font-semibold'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* 본문 */}
        <div className="flex-1 overflow-y-auto p-5 text-xs leading-relaxed text-slate-300">
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="mb-1.5 text-sm font-bold text-cyan-300">1. 앱 목적</h3>
                <p>
                  <strong>소리숲 뮤직비디오 스튜디오</strong>는 노래 음원 파일과 가사 텍스트만 있으면
                  누구나 자신의 PC에서 간편하게 <strong>가사 싱크 뮤직비디오</strong>와{' '}
                  <strong>투명 배경 자막 영상(MOV)</strong>을 제작할 수 있도록 설계된 무료 데스크톱
                  스튜디오입니다.
                </p>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="mb-2 text-sm font-bold text-emerald-300">2. 앱 특성</h3>
                <ul className="list-disc space-y-1.5 pl-4 text-slate-300">
                  <li>
                    <strong>100% 로컬 처리 &amp; 프라이버시 보호</strong>: 회원가입이나 서버 업로드 없이
                    음원·가사·영상·이미지를 내 컴퓨터 안에서만 처리합니다.
                  </li>
                  <li>
                    <strong>AI 자동 가사 싱크 + 음향 피크 스냅</strong>: 내장 Whisper 로컬 음성 분석
                    모델이 가사 타이밍을 맞추고, 파형/보컬 에너지 피크에 맞춰 시작·끝을 정밀 보정합니다.
                  </li>
                  <li>
                    <strong>GPU 하드웨어 가속 인코딩</strong>: Apple Silicon(VideoToolbox), NVIDIA
                    GeForce(NVENC, RTX 5050 등 최신~구형 GPU), AMD(AMF), Intel(QSV)을 자동 감지해
                    빠르게 내보냅니다.
                  </li>
                  <li>
                    <strong>멀티 트랙 타임라인 &amp; 트랜지션</strong>: 오디오 트랙 위 비디오 트랙에서
                    영상·이미지 트림, 분할, 이동, 6종 트랜지션을 직관적으로 편집할 수 있습니다.
                  </li>
                </ul>
              </section>

              <section className="rounded-xl border border-slate-800 bg-slate-950/60 p-4">
                <h3 className="mb-2 text-sm font-bold text-amber-300">3. 라이선스</h3>
                <ul className="list-disc space-y-1.5 pl-4 text-slate-300">
                  <li>
                    <strong>앱 사용</strong>: 개인 PC에 설치해서 사용하는 무료 앱이며, 제작한 영상의{' '}
                    <strong>상업적 이용이 가능</strong>합니다.
                  </li>
                  <li>
                    <strong>개별 라이선스 확인 필수</strong>: 영상에 사용하는 노래 음원, 배경 영상·이미지,
                    개별 배포 폰트의 저작권 및 라이선스 조건은 사용자가 직접 확인해야 합니다.
                  </li>
                  <li>
                    <strong>내장 폰트</strong>: Pretendard, 고운바탕, 고운돋움, 검은고딕, 주아체 등
                    SIL OFL 1.0 무료 한글 폰트와 빗썸고딕체가 기본 내장되어 있습니다.
                  </li>
                </ul>
              </section>
            </div>
          )}

          {activeTab === 'features' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <h4 className="mb-1 flex items-center gap-1.5 font-bold text-cyan-300">
                    <Layers className="h-3.5 w-3.5" /> 화면 비율 및 비주얼 효과
                  </h4>
                  <p className="text-slate-400">
                    16:9(유튜브), 9:16(쇼츠·릴스), 1:1(인스타그램) 비율을 지원하며 홀로그램, 오디오
                    스펙트럼(디지털/아날로그), 투명 6기둥 LED 레벨미터를 영상 위 레이어에 배치합니다.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <h4 className="mb-1 flex items-center gap-1.5 font-bold text-emerald-300">
                    <Music className="h-3.5 w-3.5" /> AI 가사 싱크 &amp; 파형 타임라인
                  </h4>
                  <p className="text-slate-400">
                    Whisper Small/Base/Medium 모델로 가사를 자동 정렬하고, 확대/축소 가능한 타임라인에서
                    구간 이동·길이 조절·실행 취소(Undo/Redo)·단축키(Space, I, O)를 지원합니다.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <h4 className="mb-1 flex items-center gap-1.5 font-bold text-indigo-300">
                    <ImageIcon className="h-3.5 w-3.5" /> 비디오·이미지 트랙 &amp; 트랜지션
                  </h4>
                  <p className="text-slate-400">
                    배경 영상과 이미지(기본 5초/150프레임)를 트랙에 올려 트림·분할·삭제·이어붙이기를
                    하고, 클립 시작/끝 우클릭 또는 접합부 클릭으로 6종 트랜지션을 적용합니다.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3.5">
                  <h4 className="mb-1 flex items-center gap-1.5 font-bold text-amber-300">
                    <Type className="h-3.5 w-3.5" /> 텍스트 레이어 &amp; 프로젝트 저장
                  </h4>
                  <p className="text-slate-400">
                    테두리·그림자·배경 박스 속성을 갖춘 텍스트를 프리뷰 화면에 드래그해 자유롭게
                    배치하며, 작업 내용은 <code className="text-cyan-300">.ssproj</code> 프로젝트 파일로
                    저장·복원할 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                <img
                  src={guideMainImg}
                  alt="소리숲 뮤직비디오 스튜디오 전체 화면"
                  className="w-full object-contain"
                />
                <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">
                  스튜디오 전체 화면: 상단 툴바, 좌측 프리뷰·비디오/오디오 타임라인, 우측 편집 패널
                </p>
              </div>
            </div>
          )}

          {activeTab === 'lyrics' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-cyan-300">
                  노래 파일과 가사를 입력하고 싱크 맞추는 과정
                </h3>
                <ol className="list-decimal space-y-2 pl-4">
                  <li>
                    <strong>음원 열기</strong>: 상단 툴바의 <strong>음원 열기</strong> 버튼을 눌러
                    MP3, WAV, M4A 등의 노래 파일을 불러옵니다. 오디오 트랙에 파형이 자동으로 그려집니다.
                  </li>
                  <li>
                    <strong>가사 입력</strong>: 상단의 <strong>가사 입력</strong> 버튼을 클릭해 노래 가사를
                    한 줄에 한 구절씩 붙여넣습니다. <code className="text-cyan-300">[Intro]</code>,{' '}
                    <code className="text-cyan-300">[Chorus]</code> 같은 단락 태그는 자동으로 제외됩니다.
                  </li>
                  <li>
                    <strong>AI 가사 싱크 맞추기</strong>: 우측 <strong>가사 싱크</strong> 탭에서 로컬
                    음성분석 모델(기본 <code>whisper-small</code> 권장)을 선택한 뒤{' '}
                    <strong>AI 가사 싱크 맞추기</strong>를 누릅니다.
                  </li>
                  <li>
                    <strong>음향 피크 스냅 &amp; 수동 미세 조정</strong>: 자동 싱크 후{' '}
                    <strong>음향 피크 스냅</strong>으로 보컬 시작점에 맞추거나, 타임라인 파형 위 가사
                    블록의 좌/우 경계를 드래그해 세밀하게 조정합니다. (단축키:{' '}
                    <code>Space</code> 재생/일시정지, <code>I</code> 현재 위치로 시작점,{' '}
                    <code>O</code> 현재 위치로 끝점)
                  </li>
                </ol>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                <img
                  src={guideMainImg}
                  alt="가사 싱크 및 타임라인 화면"
                  className="w-full object-contain"
                />
                <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">
                  가사 싱크 탭에서 AI 자동 싱크 및 구간별 타임코드를 확인·수정할 수 있습니다.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'media' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-emerald-300">
                  배경 설정 및 영상·이미지 첨부 후 편집하는 방법
                </h3>
                <ol className="list-decimal space-y-2 pl-4">
                  <li>
                    <strong>단일 배경 &amp; 비주얼 효과</strong>: 우측 <strong>배경 설정</strong> 탭에서
                    배경 어둡기(Dim)와 블러를 조절하고, 홀로그램·오디오 스펙트럼·6기둥 투명 LED
                    레벨미터 표시 여부를 설정합니다.
                  </li>
                  <li>
                    <strong>비디오 트랙에 영상/이미지 추가</strong>: 타임라인 상단의{' '}
                    <strong>+ 영상/사진 추가</strong> 또는 <strong>현재 위치 삽입</strong>으로 클립을
                    올립니다. 사진은 기본 <strong>5초(150프레임)</strong>로 할당됩니다.
                  </li>
                  <li>
                    <strong>클립 기본 편집</strong>: 클립을 선택하면 상단 도구바에서{' '}
                    <strong>투명도</strong>와 <strong>프레임에 맞추기(비율 채움)</strong>를 설정할 수
                    있으며, 클립 좌/우 끝을 드래그해 <strong>앞/뒤 길이 조절(트림)</strong>, 재생헤드
                    위치에서 <strong>분할</strong>, <strong>빈 공간 이어붙이기</strong>,{' '}
                    <strong>삭제</strong>가 가능합니다.
                  </li>
                  <li>
                    <strong>트랜지션 적용</strong>: 클립과 클립이 이어진 접합부 아이콘을 클릭하거나,{' '}
                    <strong>클립의 시작(좌측)·끝(우측) 부분을 마우스 우클릭</strong>하면 트랜지션 적용
                    창이 열립니다. (<code>크로스 디졸브</code>, <code>밀어내기</code>,{' '}
                    <code>슬라이드</code>, <code>딥 투 블랙</code>, <code>딥 투 화이트</code>,{' '}
                    <code>TV 지지직</code> / 기본 1초·30프레임)
                  </li>
                </ol>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                <img
                  src={guideBgImg}
                  alt="배경 설정 및 비주얼 효과 화면"
                  className="w-full object-contain"
                />
                <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">
                  배경 설정 탭 및 타임라인 상단 비디오 트랙에서 클립과 효과를 함께 관리합니다.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'text' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-indigo-300">
                  자막 스타일 및 텍스트 레이어 추가·설정 방법
                </h3>
                <ol className="list-decimal space-y-2 pl-4">
                  <li>
                    <strong>자막 스타일</strong>: <strong>자막 스타일</strong> 탭에서 폰트 목록(폰트
                    유형 · 이름 · <code>소리숲 SoriSoop 字</code> 미리보기)으로 글꼴을 고르고 크기,
                    위치, 애니메이션, 색상 프리셋을 저장합니다.
                  </li>
                  <li>
                    <strong>텍스트 레이어 추가</strong>: 우측 <strong>텍스트</strong> 탭에서{' '}
                    <strong>+ 추가</strong>를 누르면 곡 제목, 아티스트명, 워터마크 등 자유 텍스트를
                    여러 개 올릴 수 있습니다.
                  </li>
                  <li>
                    <strong>프리뷰 화면 자유 배치</strong>: 프리뷰 캔버스 위에서 텍스트를 마우스로
                    직접 클릭·드래그해 원하는 위치로 이동하거나 X/Y 슬라이더로 정밀 배치합니다.
                  </li>
                  <li>
                    <strong>세부 속성 설정</strong>: <strong>테두리</strong>(두께·색상),{' '}
                    <strong>그림자</strong>(색상·방향 각도·거리·퍼짐 정도),{' '}
                    <strong>배경 박스</strong>(색상·투명도·모서리 라운드·가로/세로 크기)를 설정합니다.
                  </li>
                </ol>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                <img
                  src={guideTextImg}
                  alt="텍스트 레이어 편집 화면"
                  className="w-full object-contain"
                />
                <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">
                  텍스트 탭에서 글자 내용, 테두리, 그림자, 배경 박스를 설정하고 프리뷰에서 드래그로 배치합니다.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-2.5">
                <h3 className="text-sm font-bold text-amber-300">영상 내보내기 방법</h3>
                <ol className="list-decimal space-y-2 pl-4">
                  <li>
                    상단 툴바 우측의 <strong>내보내기</strong> 버튼을 클릭합니다.
                  </li>
                  <li>
                    <strong>내보내기 형식 선택</strong>:
                    <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-400">
                      <li>
                        <strong>일반 영상 (MP4 · H.264)</strong>: 배경·음원·가사·텍스트·효과가 모두
                        합쳐진 최종 뮤직비디오 파일입니다. 내 컴퓨터의 GPU 하드웨어 가속(Apple
                        VideoToolbox, NVIDIA NVENC 등)이 자동 적용됩니다.
                      </li>
                      <li>
                        <strong>투명 배경 자막 (MOV · ProRes 4444)</strong>: 배경 없이 가사·텍스트(및
                        선택 시 6기둥 LED 레벨미터)만 알파 채널로 내보내 프리미어 프로, 파이널컷 프로,
                        캡컷 등에서 오버레이로 활용할 수 있습니다.
                      </li>
                    </ul>
                  </li>
                  <li>
                    <strong>해상도 및 프레임률 선택</strong>: <code>1080p Full HD</code> 또는{' '}
                    <code>720p HD</code>, 프레임률(<code>29.97 / 30 / 60fps</code>)을 고른 뒤{' '}
                    <strong>내보내기 시작</strong>을 누르고 저장 위치를 지정합니다.
                  </li>
                </ol>
              </div>

              <div className="overflow-hidden rounded-xl border border-slate-700 bg-slate-950">
                <img
                  src={guideExportImg}
                  alt="영상 내보내기 설정 모달"
                  className="w-full max-w-lg mx-auto object-contain"
                />
                <p className="border-t border-slate-800 px-3 py-2 text-[11px] text-slate-400">
                  내보내기 모달에서 출력 형식, 해상도, 프레임률 및 GPU 가속 적용 여부를 확인할 수 있습니다.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end border-t border-slate-800 bg-slate-950/70 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-cyan-500 px-5 py-1.5 text-xs font-bold text-slate-950 hover:bg-cyan-400"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
};
