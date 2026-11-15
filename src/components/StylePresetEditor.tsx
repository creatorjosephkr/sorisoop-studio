import React, { useEffect, useState } from 'react';
import { Check, Plus, RotateCcw, Save, ShieldCheck, Trash2 } from 'lucide-react';
import { BUNDLED_FONTS } from '../fonts/fonts';
import { FontPicker } from './FontPicker';
import {
  ColorControl,
  SettingRow,
  SettingSection,
  SliderControl,
  ToggleControl,
} from './SettingLayout';
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
  onResetBuiltInPreset: (id: string) => void;
}

export const StylePresetEditor: React.FC<StylePresetEditorProps> = ({
  presets,
  activePreset,
  onSelectPreset,
  onChangeActiveStyle,
  onSaveOverwritePreset,
  onCreatePreset,
  onDeletePreset,
  onResetBuiltInPreset,
}) => {
  const [newPresetName, setNewPresetName] = useState('');
  const [showNewInput, setShowNewInput] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!savedNotice) return;
    const timer = window.setTimeout(() => setSavedNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [savedNotice]);

  const selectedFont = BUNDLED_FONTS.find((f) => f.id === activePreset.fontId) ?? BUNDLED_FONTS[0];

  const handleCreate = () => {
    const trimmed = newPresetName.trim();
    if (!trimmed) return;
    onCreatePreset(trimmed);
    setNewPresetName('');
    setShowNewInput(false);
    setSavedNotice(`'${trimmed}' 스타일이 저장되었습니다.`);
  };

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden pr-2.5 text-xs">
      {/* 저작권 안전 폰트 안내 배너 */}
      <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-[11px] text-emerald-200">
        <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" />
        <p className="leading-relaxed text-emerald-300/85">
          <span className="font-semibold text-emerald-200">저작권 안전 모드:</span> 상업적 무료 내장 한글 폰트(SIL OFL 1.0)만 사용됩니다.
        </p>
      </div>

      {/* 프리셋 선택 및 관리 */}
      <SettingSection
        title="자막 스타일 프리셋"
        action={
          <>
            {!activePreset.isBuiltIn ? (
              <button
                type="button"
                onClick={() => {
                  onSaveOverwritePreset();
                  setSavedNotice('현재 스타일에 저장되었습니다.');
                }}
                className="flex items-center gap-1 rounded bg-cyan-600/80 px-2 py-1 text-[10px] text-white hover:bg-cyan-500"
                title="현재 사용자 프리셋에 수정사항 덮어쓰기 저장"
              >
                <Save className="h-3 w-3" /> 저장
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onResetBuiltInPreset(activePreset.id);
                  setSavedNotice('기본 스타일 설정으로 복원되었습니다.');
                }}
                className="flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-700"
                title="기본 프리셋 설정을 원래 값으로 되돌립니다"
              >
                <RotateCcw className="h-3 w-3" /> 기본값
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowNewInput((v) => !v)}
              className="flex items-center gap-1 rounded bg-indigo-600/80 px-2 py-1 text-[10px] text-white hover:bg-indigo-500"
              title="현재 설정한 자막 스타일을 새 이름으로 저장합니다"
            >
              <Plus className="h-3 w-3" /> 스타일 저장
            </button>
            {!activePreset.isBuiltIn && (
              <button
                type="button"
                onClick={() => onDeletePreset(activePreset.id)}
                className="rounded bg-rose-500/20 p-1 text-rose-300 hover:bg-rose-500/30"
                title="프리셋 삭제"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            )}
          </>
        }
      >
        <SettingRow label="프리셋 선택" align={showNewInput || savedNotice ? 'start' : 'center'}>
          <div className="space-y-1.5">
            <select
              value={activePreset.id}
              onChange={(e) => onSelectPreset(e.target.value)}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
            >
              {presets.map((p) => {
                const displayName = p.isBuiltIn
                  ? p.name
                      .replace(/\s*가라오케\s*/g, ' 스타일')
                      .replace(/\s*\(기본\)\s*/g, '')
                      .trim()
                  : p.name;
                return (
                  <option key={p.id} value={p.id}>
                    {displayName} {p.isBuiltIn ? '(기본)' : '(사용자)'}
                  </option>
                );
              })}
            </select>

            {showNewInput && (
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreate();
                  }}
                  placeholder="새 스타일 이름..."
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCreate}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-cyan-500 px-2.5 py-1 font-semibold text-slate-950 hover:bg-cyan-400"
                >
                  <Save className="h-3 w-3" /> 저장
                </button>
              </div>
            )}

            {savedNotice && (
              <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/15 px-2.5 py-1 text-[11px] text-emerald-300">
                <Check className="h-3.5 w-3.5 shrink-0" />
                <span>{savedNotice}</span>
              </div>
            )}
          </div>
        </SettingRow>
      </SettingSection>

      {/* 폰트 & 크기 */}
      <SettingSection title="폰트 & 크기">
        <SettingRow label="한글 폰트" align="start">
          <div className="space-y-1">
            <FontPicker
              value={activePreset.fontId}
              onChange={(fontId) => onChangeActiveStyle({ fontId })}
            />
            <p className="text-[10px] text-slate-500">라이선스: {selectedFont.license}</p>
          </div>
        </SettingRow>

        <SettingRow label="글자 크기">
          <SliderControl
            min={24}
            max={96}
            value={activePreset.fontSize}
            valueLabel={`${activePreset.fontSize}px`}
            onChange={(fontSize) => onChangeActiveStyle({ fontSize })}
          />
        </SettingRow>

        <SettingRow label="줄 간격">
          <SliderControl
            min={1.0}
            max={2.0}
            step={0.05}
            value={activePreset.lineHeight}
            valueLabel={activePreset.lineHeight.toFixed(2)}
            onChange={(lineHeight) => onChangeActiveStyle({ lineHeight })}
          />
        </SettingRow>
      </SettingSection>

      {/* 텍스트 색상 & 효과 */}
      <SettingSection title="텍스트 색상 & 효과">
        <SettingRow label="그라데이션">
          <ToggleControl
            checked={activePreset.useGradient}
            onChange={(useGradient) => onChangeActiveStyle({ useGradient })}
          />
        </SettingRow>

        {activePreset.useGradient ? (
          <>
            <SettingRow label="시작 색상">
              <ColorControl
                value={activePreset.gradientStart}
                onChange={(gradientStart) => onChangeActiveStyle({ gradientStart })}
              />
            </SettingRow>
            <SettingRow label="끝 색상">
              <ColorControl
                value={activePreset.gradientEnd}
                onChange={(gradientEnd) => onChangeActiveStyle({ gradientEnd })}
              />
            </SettingRow>
          </>
        ) : (
          <SettingRow label="글자 색상">
            <ColorControl
              value={activePreset.textColor}
              onChange={(textColor) => onChangeActiveStyle({ textColor })}
            />
          </SettingRow>
        )}

        <SettingRow label="외곽선 두께">
          <SliderControl
            min={0}
            max={30}
            value={activePreset.strokeWidth}
            valueLabel={`${activePreset.strokeWidth}px`}
            onChange={(strokeWidth) => onChangeActiveStyle({ strokeWidth })}
          />
        </SettingRow>

        <SettingRow label="외곽선 색상">
          <ColorControl
            value={activePreset.strokeColor}
            onChange={(strokeColor) => onChangeActiveStyle({ strokeColor })}
          />
        </SettingRow>

        <SettingRow label="그림자/글로우">
          <SliderControl
            min={0}
            max={32}
            value={activePreset.shadowBlur}
            valueLabel={`${activePreset.shadowBlur}px`}
            onChange={(shadowBlur) => onChangeActiveStyle({ shadowBlur })}
          />
        </SettingRow>
      </SettingSection>

      {/* 자막 배경 박스 */}
      <SettingSection title="자막 배경 박스">
        <SettingRow label="배경 박스">
          <ToggleControl
            checked={activePreset.boxEnabled}
            onChange={(checked) => {
              onChangeActiveStyle({
                boxEnabled: checked,
                ...(checked && activePreset.boxOpacity <= 0 ? { boxOpacity: 0.65 } : {}),
                ...(checked && activePreset.boxPaddingX === 0 && activePreset.boxPaddingY === 0
                  ? { boxPaddingX: 24, boxPaddingY: 12, boxRadius: 12 }
                  : {}),
              });
            }}
          />
        </SettingRow>

        {activePreset.boxEnabled && (
          <>
            <SettingRow label="박스 색상">
              <ColorControl
                value={activePreset.boxColor}
                onChange={(boxColor) => onChangeActiveStyle({ boxColor })}
              />
            </SettingRow>

            <SettingRow label="박스 투명도">
              <SliderControl
                min={0}
                max={1}
                step={0.05}
                value={activePreset.boxOpacity}
                valueLabel={`${Math.round(activePreset.boxOpacity * 100)}%`}
                onChange={(boxOpacity) => onChangeActiveStyle({ boxOpacity })}
              />
            </SettingRow>

            <SettingRow label="테두리 두께">
              <SliderControl
                min={0}
                max={12}
                step={1}
                value={activePreset.boxBorderWidth ?? 0}
                valueLabel={`${activePreset.boxBorderWidth ?? 0}px`}
                onChange={(boxBorderWidth) => onChangeActiveStyle({ boxBorderWidth })}
              />
            </SettingRow>

            <SettingRow label="테두리 색상">
              <ColorControl
                value={activePreset.boxBorderColor ?? '#ffffff'}
                onChange={(boxBorderColor) => onChangeActiveStyle({ boxBorderColor })}
              />
            </SettingRow>

            <SettingRow label="모서리 라운드">
              <SliderControl
                min={0}
                max={48}
                step={1}
                value={activePreset.boxRadius}
                valueLabel={`${activePreset.boxRadius}px`}
                onChange={(boxRadius) => onChangeActiveStyle({ boxRadius })}
              />
            </SettingRow>

            <SettingRow label="박스 크기 (좌우)">
              <SliderControl
                min={0}
                max={80}
                step={2}
                value={activePreset.boxPaddingX}
                valueLabel={`${activePreset.boxPaddingX}px`}
                onChange={(boxPaddingX) => onChangeActiveStyle({ boxPaddingX })}
              />
            </SettingRow>

            <SettingRow label="박스 크기 (상하)">
              <SliderControl
                min={0}
                max={60}
                step={2}
                value={activePreset.boxPaddingY}
                valueLabel={`${activePreset.boxPaddingY}px`}
                onChange={(boxPaddingY) => onChangeActiveStyle({ boxPaddingY })}
              />
            </SettingRow>
          </>
        )}
      </SettingSection>

      {/* 위치 & 애니메이션 */}
      <SettingSection
        title="위치 & 애니메이션"
        action={
          (activePreset.offsetY !== 0 || (activePreset.offsetX ?? 0) !== 0) && (
            <button
              type="button"
              onClick={() => onChangeActiveStyle({ offsetX: 0, offsetY: 0 })}
              className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-0.5 text-[10px] text-slate-300 hover:bg-slate-700"
            >
              <RotateCcw className="h-3 w-3" />
              위치 초기화
            </button>
          )
        }
      >
        <SettingRow label="기본 위치">
          <div className="grid grid-cols-3 gap-1.5">
            {(['top', 'center', 'bottom'] as SubtitlePosition[]).map((pos) => (
              <button
                key={pos}
                type="button"
                onClick={() => onChangeActiveStyle({ position: pos })}
                className={`rounded-lg py-1.5 text-[11px] font-medium transition ${
                  activePreset.position === pos
                    ? 'bg-cyan-500 text-slate-950'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {pos === 'top' ? '상단' : pos === 'center' ? '중앙' : '하단'}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label="상하 위치">
          <SliderControl
            min={-450}
            max={450}
            step={5}
            value={activePreset.offsetY}
            valueLabel={`${activePreset.offsetY}px`}
            onChange={(offsetY) => onChangeActiveStyle({ offsetY })}
          />
        </SettingRow>

        <SettingRow label="좌우 위치">
          <SliderControl
            min={-600}
            max={600}
            step={5}
            value={activePreset.offsetX ?? 0}
            valueLabel={`${activePreset.offsetX ?? 0}px`}
            onChange={(offsetX) => onChangeActiveStyle({ offsetX })}
          />
        </SettingRow>

        <SettingRow label="애니메이션">
          <select
            value={activePreset.animation}
            onChange={(e) =>
              onChangeActiveStyle({ animation: e.target.value as SubtitleAnimation })
            }
            className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100"
          >
            <option value="karaoke-bar">가사 진행 바</option>
            <option value="fade">부드러운 페이드 (Fade)</option>
            <option value="pop">팝 강조 (Pop)</option>
            <option value="none">애니메이션 없음</option>
          </select>
        </SettingRow>

        <SettingRow label="구절 힌트">
          <ToggleControl
            checked={activePreset.showPrevNext}
            onLabel="이전/다음 표시"
            offLabel="표시 안 함"
            onChange={(showPrevNext) => onChangeActiveStyle({ showPrevNext })}
          />
        </SettingRow>
      </SettingSection>
    </div>
  );
};
