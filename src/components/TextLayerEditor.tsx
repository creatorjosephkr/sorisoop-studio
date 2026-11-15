import React from 'react';
import { Eye, EyeOff, Plus, Trash2, Type } from 'lucide-react';
import { FontPicker } from './FontPicker';
import { NumberInput } from './NumberInput';
import {
  ColorControl,
  SettingRow,
  SettingSection,
  SliderControl,
  ToggleControl,
} from './SettingLayout';
import { TextLayer, TextTransitionType } from '../types';
import {
  DEFAULT_TEXT_TRANSITION_DURATION,
  TEXT_TRANSITION_LABELS,
} from '../utils/videoClipUtils';

interface TextLayerEditorProps {
  layers: TextLayer[];
  selectedLayerId: string | null;
  duration: number;
  onSelectLayer: (id: string) => void;
  onAddLayer: () => void;
  onUpdateLayer: (id: string, patch: Partial<TextLayer>) => void;
  onDeleteLayer: (id: string) => void;
}

export const TextLayerEditor: React.FC<TextLayerEditorProps> = ({
  layers,
  selectedLayerId,
  duration,
  onSelectLayer,
  onAddLayer,
  onUpdateLayer,
  onDeleteLayer,
}) => {
  const active = layers.find((l) => l.id === selectedLayerId) ?? layers[0] ?? null;

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-2.5 overflow-y-auto overflow-x-hidden pr-2.5 text-xs">
      {/* 레이어 목록 */}
      <SettingSection
        title={`텍스트 레이어 (${layers.length})`}
        action={
          <button
            type="button"
            onClick={onAddLayer}
            className="flex items-center gap-1 rounded-md bg-cyan-500 px-2 py-1 text-[10px] font-semibold text-slate-950 hover:bg-cyan-400"
          >
            <Plus className="h-3 w-3" />
            텍스트 추가
          </button>
        }
      >
        {layers.length === 0 ? (
          <div className="flex h-28 flex-col items-center justify-center p-3 text-center text-slate-500">
            <Type className="mb-1.5 h-5 w-5 text-slate-600" />
            <p>추가된 텍스트 레이어가 없습니다.</p>
            <p className="mt-1 text-[10px]">제목, 아티스트, 워터마크 등을 배치해 보세요.</p>
          </div>
        ) : (
          <div className="space-y-1.5 pt-1">
            {layers.map((layer, idx) => {
              const isSel = active?.id === layer.id;
              return (
                <div
                  key={layer.id}
                  onClick={() => onSelectLayer(layer.id)}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 transition ${
                    isSel
                      ? 'border-cyan-400 bg-slate-900 ring-1 ring-cyan-400/40'
                      : 'border-slate-800 bg-slate-950/70 hover:border-slate-700'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium text-slate-200">
                      #{idx + 1} {layer.text.trim() || '(빈 텍스트)'}
                    </p>
                    <p className="text-[10px] text-slate-500">
                      위치 {Math.round(layer.x)}%, {Math.round(layer.y)}% ·{' '}
                      {layer.alwaysVisible
                        ? '전체 구간'
                        : `${layer.startTime.toFixed(1)}s ~ ${layer.endTime.toFixed(1)}s`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onUpdateLayer(layer.id, { visible: !layer.visible });
                      }}
                      className="rounded p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                      title={layer.visible ? '숨기기' : '표시'}
                    >
                      {layer.visible ? (
                        <Eye className="h-3.5 w-3.5" />
                      ) : (
                        <EyeOff className="h-3.5 w-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteLayer(layer.id);
                      }}
                      className="rounded p-1 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SettingSection>

      {/* 선택된 텍스트 레이어 속성 */}
      {active && (
        <>
          <SettingSection
            title="내용 & 화면 배치"
            action={
              <span className="text-[10px] text-cyan-400/90">프리뷰에서 직접 드래그 가능</span>
            }
          >
            <SettingRow label="글자 내용" align="start">
              <textarea
                rows={2}
                value={active.text}
                onChange={(e) => onUpdateLayer(active.id, { text: e.target.value })}
                placeholder="화면에 표시할 글자를 입력하세요..."
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
              />
            </SettingRow>

            <SettingRow label="가로 (X)">
              <SliderControl
                min={0}
                max={100}
                step={0.5}
                value={active.x}
                valueLabel={`${Math.round(active.x)}%`}
                onChange={(x) => onUpdateLayer(active.id, { x })}
              />
            </SettingRow>

            <SettingRow label="세로 (Y)">
              <SliderControl
                min={0}
                max={100}
                step={0.5}
                value={active.y}
                valueLabel={`${Math.round(active.y)}%`}
                onChange={(y) => onUpdateLayer(active.id, { y })}
              />
            </SettingRow>
          </SettingSection>

          <SettingSection
            title="표출 범위 & 트랜지션"
            action={
              <span className="text-[10px] text-slate-500">
                {active.alwaysVisible ? '영상 전체' : '트랙 우클릭 편집 가능'}
              </span>
            }
          >
            <SettingRow label="표출 범위">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => onUpdateLayer(active.id, { alwaysVisible: true })}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    active.alwaysVisible
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-200'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  영상 전체
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const safeStart = Math.max(0, active.startTime || 0);
                    const safeEnd =
                      active.endTime > safeStart + 0.2
                        ? active.endTime
                        : Math.min(duration || safeStart + 5, safeStart + 5);
                    onUpdateLayer(active.id, {
                      alwaysVisible: false,
                      startTime: Number(safeStart.toFixed(2)),
                      endTime: Number(Math.max(safeStart + 0.2, safeEnd).toFixed(2)),
                    });
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                    !active.alwaysVisible
                      ? 'border-violet-400 bg-violet-500/20 text-violet-200'
                      : 'border-slate-700 bg-slate-900 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  특정 구간
                </button>
              </div>
            </SettingRow>

            {!active.alwaysVisible && (
              <>
                <SettingRow label="표출 시간">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-500">시작 (초)</span>
                      <NumberInput
                        min={0}
                        max={duration || 9999}
                        step={0.1}
                        value={active.startTime}
                        onChange={(val) => {
                          const clamped = Math.max(0, val);
                          onUpdateLayer(active.id, {
                            startTime: clamped,
                            endTime: Math.max(clamped + 0.2, active.endTime),
                          });
                        }}
                        className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-100"
                      />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500">끝 (초)</span>
                      <NumberInput
                        min={0.2}
                        max={duration || 9999}
                        step={0.1}
                        value={active.endTime}
                        onChange={(val) => {
                          const clamped = Math.max(active.startTime + 0.2, val);
                          onUpdateLayer(active.id, { endTime: clamped });
                        }}
                        className="mt-0.5 w-full rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-slate-100"
                      />
                    </div>
                  </div>
                </SettingRow>

                <SettingRow label="시작 (In)" align="start">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={active.transitionIn?.type ?? 'none'}
                      onChange={(e) =>
                        onUpdateLayer(active.id, {
                          transitionIn: {
                            type: e.target.value as TextTransitionType,
                            durationSec:
                              active.transitionIn?.durationSec ?? DEFAULT_TEXT_TRANSITION_DURATION,
                          },
                        })
                      }
                      className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
                    >
                      {(Object.keys(TEXT_TRANSITION_LABELS) as TextTransitionType[]).map((k) => (
                        <option key={k} value={k}>
                          {TEXT_TRANSITION_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    {(active.transitionIn?.type ?? 'none') !== 'none' && (
                      <NumberInput
                        min={0.1}
                        max={3}
                        step={0.1}
                        value={
                          active.transitionIn?.durationSec ?? DEFAULT_TEXT_TRANSITION_DURATION
                        }
                        onChange={(val) =>
                          onUpdateLayer(active.id, {
                            transitionIn: {
                              type: active.transitionIn?.type ?? 'fade',
                              durationSec: Math.max(0.1, Math.min(3, val)),
                            },
                          })
                        }
                        className="w-16 shrink-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-violet-200"
                        title="시작 트랜지션 길이 (초)"
                      />
                    )}
                  </div>
                </SettingRow>

                <SettingRow label="끝 (Out)" align="start">
                  <div className="flex items-center gap-1.5">
                    <select
                      value={active.transitionOut?.type ?? 'none'}
                      onChange={(e) =>
                        onUpdateLayer(active.id, {
                          transitionOut: {
                            type: e.target.value as TextTransitionType,
                            durationSec:
                              active.transitionOut?.durationSec ??
                              DEFAULT_TEXT_TRANSITION_DURATION,
                          },
                        })
                      }
                      className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-100"
                    >
                      {(Object.keys(TEXT_TRANSITION_LABELS) as TextTransitionType[]).map((k) => (
                        <option key={k} value={k}>
                          {TEXT_TRANSITION_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    {(active.transitionOut?.type ?? 'none') !== 'none' && (
                      <NumberInput
                        min={0.1}
                        max={3}
                        step={0.1}
                        value={
                          active.transitionOut?.durationSec ?? DEFAULT_TEXT_TRANSITION_DURATION
                        }
                        onChange={(val) =>
                          onUpdateLayer(active.id, {
                            transitionOut: {
                              type: active.transitionOut?.type ?? 'fade',
                              durationSec: Math.max(0.1, Math.min(3, val)),
                            },
                          })
                        }
                        className="w-16 shrink-0 rounded border border-slate-700 bg-slate-900 px-2 py-1 font-mono text-[11px] text-violet-200"
                        title="끝 트랜지션 길이 (초)"
                      />
                    )}
                  </div>
                </SettingRow>
              </>
            )}
          </SettingSection>

          <SettingSection title="글꼴 및 기본 스타일">
            <SettingRow label="한글 폰트">
              <FontPicker
                value={active.fontId}
                onChange={(fontId) => onUpdateLayer(active.id, { fontId })}
              />
            </SettingRow>

            <SettingRow label="글자 크기">
              <SliderControl
                min={16}
                max={140}
                step={1}
                value={active.fontSize}
                valueLabel={`${active.fontSize}px`}
                onChange={(fontSize) => onUpdateLayer(active.id, { fontSize })}
              />
            </SettingRow>

            <SettingRow label="투명도">
              <SliderControl
                min={0.05}
                max={1}
                step={0.05}
                value={active.opacity}
                valueLabel={`${Math.round(active.opacity * 100)}%`}
                onChange={(opacity) => onUpdateLayer(active.id, { opacity })}
              />
            </SettingRow>

            <SettingRow label="글자 색상">
              <ColorControl
                value={active.textColor}
                onChange={(textColor) => onUpdateLayer(active.id, { textColor })}
              />
            </SettingRow>
          </SettingSection>

          <SettingSection title="테두리 (외곽선)">
            <SettingRow label="테두리">
              <ToggleControl
                checked={active.strokeEnabled}
                onChange={(strokeEnabled) => onUpdateLayer(active.id, { strokeEnabled })}
              />
            </SettingRow>

            {active.strokeEnabled && (
              <>
                <SettingRow label="테두리 색상">
                  <ColorControl
                    value={active.strokeColor}
                    onChange={(strokeColor) => onUpdateLayer(active.id, { strokeColor })}
                  />
                </SettingRow>
                <SettingRow label="테두리 두께">
                  <SliderControl
                    min={0}
                    max={20}
                    step={0.5}
                    value={active.strokeWidth}
                    valueLabel={`${active.strokeWidth}px`}
                    onChange={(strokeWidth) => onUpdateLayer(active.id, { strokeWidth })}
                  />
                </SettingRow>
              </>
            )}
          </SettingSection>

          <SettingSection title="그림자">
            <SettingRow label="그림자">
              <ToggleControl
                checked={active.shadowEnabled}
                onChange={(shadowEnabled) => onUpdateLayer(active.id, { shadowEnabled })}
              />
            </SettingRow>

            {active.shadowEnabled && (
              <>
                <SettingRow label="그림자 색상">
                  <ColorControl
                    value={active.shadowColor}
                    onChange={(shadowColor) => onUpdateLayer(active.id, { shadowColor })}
                  />
                </SettingRow>
                <SettingRow label="방향 (각도)">
                  <SliderControl
                    min={0}
                    max={360}
                    step={5}
                    value={active.shadowAngle}
                    valueLabel={`${active.shadowAngle}°`}
                    onChange={(shadowAngle) => onUpdateLayer(active.id, { shadowAngle })}
                  />
                </SettingRow>
                <SettingRow label="거리">
                  <SliderControl
                    min={0}
                    max={40}
                    step={1}
                    value={active.shadowDistance}
                    valueLabel={`${active.shadowDistance}px`}
                    onChange={(shadowDistance) => onUpdateLayer(active.id, { shadowDistance })}
                  />
                </SettingRow>
                <SettingRow label="부드럽게 퍼짐">
                  <SliderControl
                    min={0}
                    max={40}
                    step={1}
                    value={active.shadowBlur}
                    valueLabel={`${active.shadowBlur}px`}
                    onChange={(shadowBlur) => onUpdateLayer(active.id, { shadowBlur })}
                  />
                </SettingRow>
              </>
            )}
          </SettingSection>

          <SettingSection title="배경 박스">
            <SettingRow label="배경 박스">
              <ToggleControl
                checked={active.boxEnabled}
                onChange={(boxEnabled) => onUpdateLayer(active.id, { boxEnabled })}
              />
            </SettingRow>

            {active.boxEnabled && (
              <>
                <SettingRow label="박스 색상">
                  <ColorControl
                    value={active.boxColor}
                    onChange={(boxColor) => onUpdateLayer(active.id, { boxColor })}
                  />
                </SettingRow>
                <SettingRow label="박스 투명도">
                  <SliderControl
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={active.boxOpacity}
                    valueLabel={`${Math.round(active.boxOpacity * 100)}%`}
                    onChange={(boxOpacity) => onUpdateLayer(active.id, { boxOpacity })}
                  />
                </SettingRow>
                <SettingRow label="모서리 라운드">
                  <SliderControl
                    min={0}
                    max={60}
                    step={1}
                    value={active.boxRadius}
                    valueLabel={`${active.boxRadius}px`}
                    onChange={(boxRadius) => onUpdateLayer(active.id, { boxRadius })}
                  />
                </SettingRow>
                <SettingRow label="가로 여백">
                  <SliderControl
                    min={0}
                    max={100}
                    step={2}
                    value={active.boxPaddingX}
                    valueLabel={`${active.boxPaddingX}px`}
                    onChange={(boxPaddingX) => onUpdateLayer(active.id, { boxPaddingX })}
                  />
                </SettingRow>
                <SettingRow label="세로 여백">
                  <SliderControl
                    min={0}
                    max={80}
                    step={2}
                    value={active.boxPaddingY}
                    valueLabel={`${active.boxPaddingY}px`}
                    onChange={(boxPaddingY) => onUpdateLayer(active.id, { boxPaddingY })}
                  />
                </SettingRow>
              </>
            )}
          </SettingSection>
        </>
      )}
    </div>
  );
};
