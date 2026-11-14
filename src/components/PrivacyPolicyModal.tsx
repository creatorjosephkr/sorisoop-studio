import React from 'react';
import { HardDrive, Lock, ShieldCheck, Cpu, X } from 'lucide-react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              로컬 프라이버시 보호
            </span>
            <h2 className="mt-2 text-lg font-bold text-slate-100">
              소리숲 뮤직비디오 스튜디오 개인정보처리방침
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            aria-label="개인정보처리방침 닫기"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-slate-300">
          소리숲 뮤직비디오 스튜디오는 개인정보를 수집하지 않으며, 사용자가 불러온 음원·영상·이미지·가사 및 내보낸 결과물을 외부 서버로 전송하지 않습니다.
        </p>

        <div className="space-y-3">
          <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300">
              <Lock className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-100">
                개인정보 수집과 외부 전송이 없습니다
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                소리숲 뮤직비디오 스튜디오는 회원가입이나 로그인이 필요 없으며, 개인정보를 수집하지 않습니다. 입력한 가사·텍스트·음원·배경 영상 및 이미지를 외부 서버나 클라우드로 전송하지 않으며, 이용자를 추적하는 분석 도구를 사용하지 않습니다.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-300">
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-100">
                음성 분석과 영상 렌더링은 내 컴퓨터 안에서
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Whisper 로컬 음성 분석(가사 싱크)과 FFmpeg 기반 영상 인코딩(MP4 · 투명 배경 MOV)은 모두 내 컴퓨터 안에서 직접 처리됩니다. 필요한 음성 분석 모델을 한 번 내려받은 뒤에는 인터넷 연결 없이도 모든 기능을 사용할 수 있으며, GPU 가속 감지 정보는 인코딩 속도 향상을 위해서만 기기 내부에서 사용됩니다.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
              <HardDrive className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold text-slate-100">
                프로젝트와 미디어 파일도 내 컴퓨터에 보관
              </h3>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                작성한 가사 싱크·자막 스타일·텍스트 레이어·영상 편집 정보(.ssproj 프로젝트 파일)와 내보낸 영상 파일은 사용자가 지정한 내 컴퓨터 위치에만 저장됩니다. 앱 설정 및 프리셋은 기기 내부 저장소에만 보관되며, 앱을 삭제해도 사용자가 저장한 프로젝트 파일이나 영상 파일은 자동으로 삭제되지 않습니다.
              </p>
            </div>
          </div>
        </div>

        <p className="mt-4 border-t border-slate-800 pt-3 text-[11px] leading-relaxed text-slate-400">
          최초 1회 로컬 Whisper 음성 분석 모델을 다운로드할 때만 모델 저장소에 인터넷으로 접속하며, 이때 일반적인 접속 정보(IP 주소 등)가 전달될 수 있으나 사용자의 음원·가사·영상·이미지 데이터는 일절 전송되지 않습니다.
        </p>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
};
