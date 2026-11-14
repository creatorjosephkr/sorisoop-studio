import React, { useState } from 'react';
import { Copy, Plus, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { BUNDLED_FONTS } from '../fonts/fonts';
import { FontPicker } from './FontPicker';
import {
  SubtitleAnimation,
  SubtitlePosition,
  SubtitleStylePreset,
} from '../types';

interface StylePresetEditorProps {
  presets: SubtitleStylePreset[];
  activePreset: SubtitleStylePreset;
  onSelectPreset: (id: string) => void;
  onChangeActiveStyle: (patch: Partial<SubtitleStylePreset>) => void;
  onSaveOverwritePreset: () => void;
  onCreatePreset: (newName: string) => void;
  onDeletePreset: (id: string) => void;
}

export const StylePresetEditor: React.FC<StylePresetEditorProps> = ({
  presets,
  activePreset,
  onSelectPreset,
  onChangeActiveStyle,
  onSaveOverwritePreset,
  onCreatePreset,
  onDeletePreset,
}) => {
  const [newPresetName, setNewPresetName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);

  const selectedFont = BUNDLED_FONTS.find((f) => f.id === activePreset.fontId) ?? BUNDLED_FONTS[0];

  const handleCreate = () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    onCreatePreset(trimmed);
    setNewPresetName('');
    setShowNewInput(false);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1 text-xs">
      {/* 저작권 안전 폰트 안내 배너 */}
      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/30 p-2.5 text-[11px] text-emerald-200">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
        <div>
          <p className="font-semibold">폰트 저작권 안전 모드 작동 중</p>
          <p className="mt-0.5 text-emerald-300/80">
            PC 시스템 폰트 사용이 차단되어 있으며, 상업적 이용이 무료인 앱 내장 한글 폰트(SIL OFL 1.0)만 사용할 수 있습니다.
          </p>
        </div>
      </div>

      {/* 프리셋 선택 및 관리 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-300">자막 스타일 프리셋</span>
          <div className="flex items-center gap-1">
            {!activePreset.isBuiltIn && (
              <button
                type="button"
                onClick={onSaveOverwritePreset}
                className="flex items-center gap-1 rounded bg-cyan-600/80 px-2 py-1 text-[11px] text-white hover:bg-cyan-500"
                title="현재 프리셋에 수정사항 저장"
              >
                <Save className="h-3 w-3" /> 저장
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNewInput((v) => !v)}
              className="flex items-center gap-1 rounded bg-indigo-600/80 px-2 py-1 text-[11px] text-white hover:bg-indigo-500"
            >
              <Plus className="h-3 w-3" /> 새 프리셋
            </button>
            {!activePreset.isBuiltIn && (
              <button
                type="button"
                onClick={() => onDeletePreset(activePreset.id)}
                className="rounded bg-rose-500/20 p-1 text-rose-300 hover:bg-rose-500/30"
                title="프리셋 삭제"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        <select
          value={activePreset.id}
          onChange={(e) => onSelectPreset(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
        >
          {presets.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} {p.isBuiltIn ? '(기본)' : '(사용자)'}
            </option>
          ))}
        </select>

        {showNewInput && (
          <div className="flex gap-1.5 pt-1">
            <input
              type="text"
              value={newPresetName}
              onChange={(e) => setNewPresetName(e.target.value)}
              placeholder="새 프리셋 이름..."
              className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1 text-xs text-slate-100"
            />
            <button
              type="button"
              onClick={handleCreate}
              className="flex items-center gap-1 rounded-lg bg-cyan-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-cyan-400"
            >
              <Copy className="h-3 w-3" /> 복제 저장
            </button>
          </div>
        )}
      </div>

      {/* 내장 무료 한글 폰트 선택 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5 space-y-2">
        <label className="block font-semibold text-slate-300">내장 무료 한글 폰트</label>
        <FontPicker
          value={activePreset.fontId}
          onChange={(fontId) => onChangeActiveStyle({ fontId })}
        />
        <p className="text-[10px] text-slate-400">라이선스: {selectedFont.license}</p>

        <div className="grid grid-cols-2 gap-2 pt-1">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-slate-400">
              <span>글자 크기</span>
              <span>{activePreset.fontSize}px</span>
            </div>
            <input
              type="range"
              min={24}
              max={96}
              value={activePreset.fontSize}
              onChange={(e) => onChangeActiveStyle({ fontSize: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-slate-400">
              <span>줄 간격</span>
              <span>{activePreset.lineHeight.toFixed(2)}</span>
            </div>
            <input
              type="range"
              min={1.0}
              max={2.0}
              step={0.05}
              value={activePreset.lineHeight}
              onChange={(e) => onChangeActiveStyle({ lineHeight: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>
      </div>

      {/* 색상, 외곽선, 글로우 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5 space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="font-semibold text-slate-300">텍스트 색상 & 효과</span>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-300">
            <input
              type="checkbox"
              checked={activePreset.useGradient}
              onChange={(e) => onChangeActiveStyle({ useGradient: e.target.checked })}
              className="accent-cyan-400"
            />
            그라데이션 사용
          </label>
        </div>

        {activePreset.useGradient ? (
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center justify-between rounded-lg bg-slate-950 px-2.5 py-1.5">
              <span className="text-[11px] text-slate-400">시작 색</span>
              <input
                type="color"
                value={activePreset.gradientStart}
                onChange={(e) => onChangeActiveStyle({ gradientStart: e.target.value })}
              />
            </label>
            <label className="flex items-center justify-between rounded-lg bg-slate-950 px-2.5 py-1.5">
              <span className="text-[11px] text-slate-400">끝 색</span>
              <input
                type="color"
                value={activePreset.gradientEnd}
                onChange={(e) => onChangeActiveStyle({ gradientEnd: e.target.value })}
              />
            </label>
          </div>
        ) : (
          <label className="flex items-center justify-between rounded-lg bg-slate-950 px-2.5 py-1.5">
            <span className="text-[11px] text-slate-400">글자 색상</span>
            <input
              type="color"
              value={activePreset.textColor}
              onChange={(e) => onChangeActiveStyle({ textColor: e.target.value })}
            />
          </label>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-slate-400">
              <span>외곽선 두께</span>
              <span>{activePreset.strokeWidth}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={12}
              value={activePreset.strokeWidth}
              onChange={(e) => onChangeActiveStyle({ strokeWidth: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>
          <div>
            <div className="mb-1 flex justify-between text-[11px] text-slate-400">
              <span>그림자/글로우</span>
              <span>{activePreset.shadowBlur}px</span>
            </div>
            <input
              type="range"
              min={0}
              max={32}
              value={activePreset.shadowBlur}
              onChange={(e) => onChangeActiveStyle({ shadowBlur: Number(e.target.value) })}
              className="w-full accent-cyan-400"
            />
          </div>
        </div>

        <label className="flex items-center justify-between rounded-lg bg-slate-950 px-2.5 py-1.5">
          <span className="text-[11px] text-slate-400">자막 배경 박스</span>
          <input
            type="checkbox"
            checked={activePreset.boxEnabled}
            onChange={(e) => onChangeActiveStyle({ boxEnabled: e.target.checked })}
            className="accent-cyan-400"
          />
        </label>
      </div>

      {/* 위치 & 애니메이션 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-2.5 space-y-2.5">
        <span className="block font-semibold text-slate-300">위치 & 애니메이션</span>

        <div className="grid grid-cols-3 gap-1.5">
          {(['top', 'center', 'bottom'] as SubtitlePosition[]).map((pos) => (
            <button
              key={pos}
              type="button"
              onClick={() => onChangeActiveStyle({ position: pos })}
              className={`rounded-lg py-1.5 text-[11px] font-medium ${
                activePreset.position === pos
                  ? 'bg-cyan-500 text-slate-950'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {pos === 'top' ? '상단' : pos === 'center' ? '중앙' : '하단'}
            </button>
          ))}
        </div>

        <div>
          <div className="mb-1 flex justify-between text-[11px] text-slate-400">
            <span>세로 미세 오프셋</span>
            <span>{activePreset.offsetY}px</span>
          </div>
          <input
            type="range"
            min={-250}
            max={250}
            step={5}
            value={activePreset.offsetY}
            onChange={(e) => onChangeActiveStyle({ offsetY: Number(e.target.value) })}
            className="w-full accent-cyan-400"
          />
        </div>

        <select
          value={activePreset.animation}
          onChange={(e) =>
            onChangeActiveStyle({ animation: e.target.value as SubtitleAnimation })
          }
          className="w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-100"
        >
          <option value="karaoke-bar">가라오케 진행 바</option>
          <option value="fade">부드러운 페이드 (Fade)</option>
          <option value="pop">팝 강조 (Pop)</option>
          <option value="none">애니메이션 없음</option>
        </select>

        <label className="flex items-center justify-between text-[11px] text-slate-300">
          <span>이전/다음 구절 힌트 표시</span>
          <input
            type="checkbox"
            checked={activePreset.showPrevNext}
            onChange={(e) => onChangeActiveStyle({ showPrevNext: e.target.checked })}
            className="accent-cyan-400"
          />
        </label>
      </div>
    </div>
  );
};
