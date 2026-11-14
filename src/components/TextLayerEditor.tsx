import React from 'react';
import { Eye, EyeOff, Plus, Sparkles, Trash2, Type } from 'lucide-react';
import { FontPicker } from './FontPicker';
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
    <div className="flex h-full flex-col gap-3 overflow-y-auto pr-1 text-xs">
      <div className="flex items-center justify-between">
        <span className="font-semibold text-slate-300">
          텍스트 레이어 ({layers.length})
        </span>
        <button
          type="button"
          onClick={onAddLayer}
          className="flex items-center gap-1 rounded-lg bg-cyan-500 px-2.5 py-1.5 text-[11px] font-semibold text-slate-950 hover:bg-cyan-400"
        >
          <Plus className="h-3.5 w-3.5" />
          텍스트 추가
        </button>
      </div>

      {/* 레이어 목록 */}
      {layers.length === 0 ? (
        <div className="flex h-36 flex-col items-center justify-center rounded-xl border border-dashed border-slate-800 p-4 text-center text-slate-500">
          <Type className="mb-1.5 h-5 w-5 text-slate-600" />
          <p>추가된 텍스트 레이어가 없습니다.</p>
          <p className="mt-1 text-[11px]">제목, 아티스트, 워터마크 등을 자유롭게 배치해 보세요.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
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
                    {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
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

      {/* 선택된 텍스트 레이어 속성 */}
      {active && (
        <div className="space-y-3 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-cyan-300">
              글자 내용
            </label>
            <textarea
              rows={2}
              value={active.text}
              onChange={(e) => onUpdateLayer(active.id, { text: e.target.value })}
              placeholder="화면에 표시할 글자를 입력하세요..."
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
            />
          </div>

          {/* 화면 자유 배치 (프리뷰 드래그 또는 슬라이더) */}
          <div className="space-y-1.5 border-t border-slate-800 pt-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">화면 배치</span>
              <span className="text-[10px] text-cyan-400">프리뷰에서 직접 드래그 가능</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                  <span>가로 (X)</span>
                  <span>{Math.round(active.x)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={active.x}
                  onChange={(e) => onUpdateLayer(active.id, { x: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
              <div>
                <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                  <span>세로 (Y)</span>
                  <span>{Math.round(active.y)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={0.5}
                  value={active.y}
                  onChange={(e) => onUpdateLayer(active.id, { y: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>
          </div>

          {/* 표출 범위 & 트랜지션 */}
          <div className="space-y-2 border-t border-slate-800 pt-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">표출 범위</span>
              <span className="text-[10px] text-slate-500">
                {active.alwaysVisible ? '영상 전체' : '타임라인 텍스트 트랙 활성화'}
              </span>
            </div>
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
            {!active.alwaysVisible && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-slate-400">시작 (초)</span>
                    <input
                      type="number"
                      min={0}
                      max={duration || 9999}
                      step={0.1}
                      value={active.startTime}
                      onChange={(e) => {
                        const val = Math.max(0, Number(e.target.value) || 0);
                        onUpdateLayer(active.id, {
                          startTime: val,
                          endTime: Math.max(val + 0.2, active.endTime),
                        });
                      }}
                      className="mt-0.5 w-full rounded bg-slate-900 px-2 py-1 font-mono text-slate-100"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400">끝 (초)</span>
                    <input
                      type="number"
                      min={0.2}
                      max={duration || 9999}
                      step={0.1}
                      value={active.endTime}
                      onChange={(e) => {
                        const val = Math.max(active.startTime + 0.2, Number(e.target.value) || 0);
                        onUpdateLayer(active.id, { endTime: val });
                      }}
                      className="mt-0.5 w-full rounded bg-slate-900 px-2 py-1 font-mono text-slate-100"
                    />
                  </div>
                </div>

                {/* 시작 / 끝 트랜지션 설정 */}
                <div className="space-y-1.5 rounded-lg border border-slate-800/80 bg-slate-900/60 p-2">
                  <div className="flex items-center gap-1 text-[10px] font-semibold text-violet-300">
                    <Sparkles className="h-3 w-3" />
                    트랜지션 (타임라인 트랙 우클릭으로도 편집 가능)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] text-slate-400">시작 (In)</span>
                      <select
                        value={active.transitionIn?.type ?? 'none'}
                        onChange={(e) =>
                          onUpdateLayer(active.id, {
                            transitionIn: {
                              type: e.target.value as TextTransitionType,
                              durationSec:
                                active.transitionIn?.durationSec ??
                                DEFAULT_TEXT_TRANSITION_DURATION,
                            },
                          })
                        }
                        className="mt-0.5 w-full rounded bg-slate-950 px-1.5 py-1 text-[11px] text-slate-100"
                      >
                        {(Object.keys(TEXT_TRANSITION_LABELS) as TextTransitionType[]).map((k) => (
                          <option key={k} value={k}>
                            {TEXT_TRANSITION_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      {(active.transitionIn?.type ?? 'none') !== 'none' && (
                        <input
                          type="number"
                          min={0.1}
                          max={3}
                          step={0.1}
                          value={
                            active.transitionIn?.durationSec ?? DEFAULT_TEXT_TRANSITION_DURATION
                          }
                          onChange={(e) =>
                            onUpdateLayer(active.id, {
                              transitionIn: {
                                type: active.transitionIn?.type ?? 'fade',
                                durationSec: Math.max(
                                  0.1,
                                  Math.min(3, Number(e.target.value) || 0.5)
                                ),
                              },
                            })
                          }
                          className="mt-1 w-full rounded bg-slate-950 px-2 py-0.5 font-mono text-[10px] text-violet-200"
                          title="시작 트랜지션 길이 (초)"
                        />
                      )}
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400">끝 (Out)</span>
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
                        className="mt-0.5 w-full rounded bg-slate-950 px-1.5 py-1 text-[11px] text-slate-100"
                      >
                        {(Object.keys(TEXT_TRANSITION_LABELS) as TextTransitionType[]).map((k) => (
                          <option key={k} value={k}>
                            {TEXT_TRANSITION_LABELS[k]}
                          </option>
                        ))}
                      </select>
                      {(active.transitionOut?.type ?? 'none') !== 'none' && (
                        <input
                          type="number"
                          min={0.1}
                          max={3}
                          step={0.1}
                          value={
                            active.transitionOut?.durationSec ?? DEFAULT_TEXT_TRANSITION_DURATION
                          }
                          onChange={(e) =>
                            onUpdateLayer(active.id, {
                              transitionOut: {
                                type: active.transitionOut?.type ?? 'fade',
                                durationSec: Math.max(
                                  0.1,
                                  Math.min(3, Number(e.target.value) || 0.5)
                                ),
                              },
                            })
                          }
                          className="mt-1 w-full rounded bg-slate-950 px-2 py-0.5 font-mono text-[10px] text-violet-200"
                          title="끝 트랜지션 길이 (초)"
                        />
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* 글꼴 & 색상 */}
          <div className="space-y-2 border-t border-slate-800 pt-2.5">
            <span className="block font-semibold text-slate-300">글꼴 및 기본 스타일</span>
            <FontPicker
              value={active.fontId}
              onChange={(fontId) => onUpdateLayer(active.id, { fontId })}
            />

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                  <span>크기</span>
                  <span>{active.fontSize}px</span>
                </div>
                <input
                  type="range"
                  min={16}
                  max={140}
                  step={1}
                  value={active.fontSize}
                  onChange={(e) => onUpdateLayer(active.id, { fontSize: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
              <div>
                <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                  <span>투명도</span>
                  <span>{Math.round(active.opacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0.05}
                  max={1}
                  step={0.05}
                  value={active.opacity}
                  onChange={(e) => onUpdateLayer(active.id, { opacity: Number(e.target.value) })}
                  className="w-full accent-cyan-400"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">글자 색상</span>
              <input
                type="color"
                value={active.textColor}
                onChange={(e) => onUpdateLayer(active.id, { textColor: e.target.value })}
                className="h-6 w-12 cursor-pointer rounded border border-slate-700 bg-transparent"
              />
            </div>
          </div>

          {/* 테두리 설정 */}
          <div className="space-y-2 border-t border-slate-800 pt-2.5">
            <label className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">테두리 (외곽선)</span>
              <input
                type="checkbox"
                checked={active.strokeEnabled}
                onChange={(e) => onUpdateLayer(active.id, { strokeEnabled: e.target.checked })}
                className="accent-cyan-400"
              />
            </label>
            {active.strokeEnabled && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">테두리 색상</span>
                  <input
                    type="color"
                    value={active.strokeColor}
                    onChange={(e) => onUpdateLayer(active.id, { strokeColor: e.target.value })}
                    className="h-6 w-12 cursor-pointer rounded border border-slate-700 bg-transparent"
                  />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                    <span>테두리 두께</span>
                    <span>{active.strokeWidth}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={20}
                    step={0.5}
                    value={active.strokeWidth}
                    onChange={(e) =>
                      onUpdateLayer(active.id, { strokeWidth: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 그림자 설정 (색상, 방향 각도, 거리, 부드럽게 퍼짐) */}
          <div className="space-y-2 border-t border-slate-800 pt-2.5">
            <label className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">그림자</span>
              <input
                type="checkbox"
                checked={active.shadowEnabled}
                onChange={(e) => onUpdateLayer(active.id, { shadowEnabled: e.target.checked })}
                className="accent-cyan-400"
              />
            </label>
            {active.shadowEnabled && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">그림자 색상</span>
                  <input
                    type="color"
                    value={active.shadowColor}
                    onChange={(e) => onUpdateLayer(active.id, { shadowColor: e.target.value })}
                    className="h-6 w-12 cursor-pointer rounded border border-slate-700 bg-transparent"
                  />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                    <span>방향 (각도)</span>
                    <span>{active.shadowAngle}°</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={360}
                    step={5}
                    value={active.shadowAngle}
                    onChange={(e) =>
                      onUpdateLayer(active.id, { shadowAngle: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                    <span>거리</span>
                    <span>{active.shadowDistance}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={active.shadowDistance}
                    onChange={(e) =>
                      onUpdateLayer(active.id, { shadowDistance: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                    <span>부드럽게 퍼짐</span>
                    <span>{active.shadowBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={40}
                    step={1}
                    value={active.shadowBlur}
                    onChange={(e) =>
                      onUpdateLayer(active.id, { shadowBlur: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 배경 박스 설정 (색상, 투명도, 모서리 라운드, 가로/세로 크기) */}
          <div className="space-y-2 border-t border-slate-800 pt-2.5">
            <label className="flex items-center justify-between">
              <span className="font-semibold text-slate-300">배경 박스</span>
              <input
                type="checkbox"
                checked={active.boxEnabled}
                onChange={(e) => onUpdateLayer(active.id, { boxEnabled: e.target.checked })}
                className="accent-cyan-400"
              />
            </label>
            {active.boxEnabled && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-400">박스 색상</span>
                  <input
                    type="color"
                    value={active.boxColor}
                    onChange={(e) => onUpdateLayer(active.id, { boxColor: e.target.value })}
                    className="h-6 w-12 cursor-pointer rounded border border-slate-700 bg-transparent"
                  />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                    <span>박스 투명도</span>
                    <span>{Math.round(active.boxOpacity * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min={0.05}
                    max={1}
                    step={0.05}
                    value={active.boxOpacity}
                    onChange={(e) =>
                      onUpdateLayer(active.id, { boxOpacity: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div>
                  <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                    <span>모서리 라운드</span>
                    <span>{active.boxRadius}px</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={1}
                    value={active.boxRadius}
                    onChange={(e) =>
                      onUpdateLayer(active.id, { boxRadius: Number(e.target.value) })
                    }
                    className="w-full accent-cyan-400"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                      <span>가로 여백</span>
                      <span>{active.boxPaddingX}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={2}
                      value={active.boxPaddingX}
                      onChange={(e) =>
                        onUpdateLayer(active.id, { boxPaddingX: Number(e.target.value) })
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                  <div>
                    <div className="mb-0.5 flex justify-between text-[10px] text-slate-400">
                      <span>세로 여백</span>
                      <span>{active.boxPaddingY}px</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={80}
                      step={2}
                      value={active.boxPaddingY}
                      onChange={(e) =>
                        onUpdateLayer(active.id, { boxPaddingY: Number(e.target.value) })
                      }
                      className="w-full accent-cyan-400"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
