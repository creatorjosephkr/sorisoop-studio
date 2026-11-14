import React, { useEffect, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Link2,
  Loader2,
  Magnet,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { LyricSegment } from '../types';

interface SegmentListEditorProps {
  segments: LyricSegment[];
  selectedSegmentId: string | null;
  currentTime: number;
  duration: number;
  autoTrack: boolean;
  isWhisperRunning: boolean;
  whisperStatusText: string;
  whisperProgress: number | null;
  hasRawLyrics: boolean;
  hasAudio: boolean;
  onToggleAutoTrack: () => void;
  onRunWhisperSync: () => void;
  onCancelWhisperSync: () => void;
  onRefineSync: () => void;
  onShiftAll: (deltaSec: number) => void;
  onSnapVocalAttacks: () => void;
  onNormalizeGaps: () => void;
  onSelectSegment: (seg: LyricSegment) => void;
  onUpdateSegment: (id: string, patch: Partial<LyricSegment>) => void;
  onDeleteSegment: (id: string) => void;
  onInsertSegmentAt: (index: number, type: 'intro' | 'gap' | 'outro') => void;
  onInsertEmptyLyricAt: (index: number) => void;
  onMergeWithPrevious: (id: string) => void;
  onSplitSegment: (id: string, selStart: number, selEnd: number, newId: string) => void;
  onAddSegment: () => void;
}

export const SegmentListEditor: React.FC<SegmentListEditorProps> = ({
  segments,
  selectedSegmentId,
  currentTime,
  duration,
  autoTrack,
  isWhisperRunning,
  whisperStatusText,
  whisperProgress,
  hasRawLyrics,
  hasAudio,
  onToggleAutoTrack,
  onRunWhisperSync,
  onCancelWhisperSync,
  onRefineSync,
  onShiftAll,
  onSnapVocalAttacks,
  onNormalizeGaps,
  onSelectSegment,
  onUpdateSegment,
  onDeleteSegment,
  onInsertSegmentAt,
  onInsertEmptyLyricAt,
  onMergeWithPrevious,
  onSplitSegment,
  onAddSegment,
}) => {
  const activeCardRef = useRef<HTMLDivElement | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingFocusRef = useRef<{ id: string; cursorPos: number } | null>(null);

  const playingId =
    segments.find((s) => currentTime >= s.startTime && currentTime < s.endTime)?.id ?? null;
  const highlightedId = selectedSegmentId ?? playingId;

  useEffect(() => {
    if (autoTrack && activeCardRef.current) {
      activeCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [playingId, selectedSegmentId, autoTrack]);

  useEffect(() => {
    const pending = pendingFocusRef.current;
    if (!pending) return;
    const inputEl = inputRefs.current[pending.id];
    if (!inputEl) return;
    pendingFocusRef.current = null;
    requestAnimationFrame(() => {
      inputEl.focus();
      const pos = Math.min(pending.cursorPos, inputEl.value.length);
      inputEl.setSelectionRange(pos, pos);
    });
  }, [segments]);

  const nudge = (seg: LyricSegment, field: 'startTime' | 'endTime', delta: number) => {
    const nextVal = Math.max(
      0,
      Math.min(duration || 9999, Number((seg[field] + delta).toFixed(2)))
    );
    if (field === 'startTime') {
      onUpdateSegment(seg.id, { startTime: nextVal });
    } else {
      onUpdateSegment(seg.id, { endTime: nextVal });
    }
  };

  return (
    <div className="flex h-full flex-col gap-2.5">
      {/* 상단 컨트롤 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300">
            가사 구간 ({segments.length})
          </span>
          <button
            type="button"
            onClick={onToggleAutoTrack}
            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium transition ${
              autoTrack
                ? 'bg-cyan-500/20 text-cyan-300 ring-1 ring-cyan-500/40'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            자동 추적 {autoTrack ? 'ON' : 'OFF'}
          </button>
        </div>

        <button
          type="button"
          onClick={onAddSegment}
          disabled={!hasAudio}
          className="flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> 구간 추가
        </button>
      </div>

      {/* 로컬 Whisper AI 싱크 & 스냅 액션 바 */}
      <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/70 p-2.5">
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={onRunWhisperSync}
            disabled={!hasAudio || isWhisperRunning}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow hover:from-indigo-500 hover:to-cyan-500 disabled:opacity-45"
          >
            <Sparkles className="h-4 w-4" />
            {isWhisperRunning
              ? '로컬 Whisper 분석 중...'
              : hasRawLyrics
                ? '로컬 Whisper + 입력 가사 1줄 싱크 매칭'
                : '로컬 Whisper 음성 인식 가사 자동 생성'}
          </button>
          {isWhisperRunning && (
            <button
              type="button"
              onClick={onCancelWhisperSync}
              className="rounded-lg border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-xs font-semibold text-rose-300 hover:bg-rose-500/25"
            >
              중지
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={onRefineSync}
            disabled={!hasAudio || segments.length === 0}
            className="col-span-2 flex items-center justify-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 px-2 py-1.5 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-500/25 disabled:opacity-40"
          >
            <Sparkles className="h-3.5 w-3.5 text-cyan-300" />
            2차 싱크 정밀 검토 및 최적화 (무음 제거 + 보컬 스냅)
          </button>
          <button
            type="button"
            onClick={onSnapVocalAttacks}
            disabled={!hasAudio || segments.length === 0}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            <Magnet className="h-3.5 w-3.5 text-cyan-400" />
            보컬 어택 자동 스냅
          </button>
          <button
            type="button"
            onClick={onNormalizeGaps}
            disabled={segments.length < 2}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800/80 px-2 py-1.5 text-[11px] text-slate-200 hover:bg-slate-700 disabled:opacity-40"
          >
            <Link2 className="h-3.5 w-3.5 text-indigo-400" />
            가사 빈틈 연결/정리
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-950/70 px-2 py-1 text-[10px] text-slate-400">
          <span>전체 싱크 일괄 이동</span>
          <div className="flex gap-1">
            {[-0.5, -0.1, 0.1, 0.5].map((d) => (
              <button
                key={d}
                type="button"
                disabled={segments.length === 0}
                onClick={() => onShiftAll(d)}
                className="rounded bg-slate-800 px-1.5 py-0.5 text-slate-200 hover:bg-slate-700 disabled:opacity-40"
              >
                {d > 0 ? `+${d}s` : `${d}s`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 독립 상태 알림창 (2차 싱크 버튼 아래쪽에 크게 표시) */}
      {whisperStatusText && (
        <div
          className={`rounded-xl border px-3.5 py-2.5 shadow-lg transition-all ${
            isWhisperRunning
              ? 'border-cyan-400/60 bg-cyan-950/50 text-cyan-100'
              : /실패|오류|중지/.test(whisperStatusText)
                ? 'border-rose-500/50 bg-rose-950/50 text-rose-100'
                : 'border-emerald-500/50 bg-emerald-950/40 text-emerald-100'
          }`}
        >
          <div className="flex items-start gap-2.5">
            {isWhisperRunning ? (
              <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-cyan-400" />
            ) : /실패|오류|중지/.test(whisperStatusText) ? (
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider opacity-80">
                {isWhisperRunning
                  ? '정밀 음성 분석 진행 중'
                  : /실패|오류|중지/.test(whisperStatusText)
                    ? '작업 알림'
                    : '작업 완료'}
              </p>
              <p className="mt-0.5 text-[13px] font-semibold leading-snug">
                {whisperStatusText}
              </p>
            </div>
          </div>
          {isWhisperRunning && whisperProgress !== null && (
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-900">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-400 to-cyan-400 transition-all duration-200"
                style={{ width: `${Math.min(100, Math.max(0, whisperProgress))}%` }}
              />
            </div>
          )}
        </div>
      )}

      {/* 가사 카드 목록 */}
      <div className="flex-1 space-y-2 overflow-y-auto pr-1">
        {segments.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-slate-700 p-4 text-center text-xs text-slate-300">
            <p>등록된 가사 구간이 없습니다.</p>
            <p className="mt-1">음원 업로드 후 [로컬 Whisper 싱크]를 실행하거나 직접 추가하세요.</p>
          </div>
        ) : (
          segments.map((seg, idx) => {
            const isSelected = seg.id === selectedSegmentId;
            const isActive = seg.id === playingId;
            const isHighlighted = seg.id === highlightedId;
            const segDur = Math.max(0.1, seg.endTime - seg.startTime);
            const progress = isActive
              ? Math.min(100, Math.max(0, ((currentTime - seg.startTime) / segDur) * 100))
              : 0;

            return (
              <React.Fragment key={seg.id}>
                {idx === 0 && seg.startTime > 0.5 && (
                  <button
                    type="button"
                    onClick={() => onInsertSegmentAt(0, 'intro')}
                    className="w-full rounded-md border border-dashed border-slate-800 py-1 text-[10px] text-slate-500 hover:border-indigo-500/50 hover:text-indigo-300"
                  >
                    + 전주(Intro) 구간 추가
                  </button>
                )}

                <div
                  ref={isHighlighted ? activeCardRef : null}
                  onClick={() => onSelectSegment(seg)}
                  className={`relative cursor-pointer rounded-xl border p-2.5 transition ${
                    isSelected
                      ? 'border-cyan-400 bg-slate-900 ring-2 ring-cyan-400/40'
                      : isActive
                        ? 'border-indigo-400/80 bg-slate-900 ring-1 ring-indigo-400/30'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  {/* 위쪽 테두리 마우스 호버 시 가사 추가 버튼 */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="group/top absolute -top-2.5 left-4 right-4 z-20 flex h-4 items-center justify-center"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInsertEmptyLyricAt(idx);
                      }}
                      className="flex items-center gap-1 rounded-full border border-cyan-400/70 bg-slate-950/95 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-300 opacity-0 shadow-md transition-opacity group-hover/top:opacity-100 hover:bg-cyan-500/20"
                      title="이 위치 위에 빈 가사(3초) 추가"
                    >
                      <Plus className="h-3 w-3" /> 가사 추가
                    </button>
                  </div>

                  {/* 아래쪽 테두리 마우스 호버 시 가사 추가 버튼 */}
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="group/bottom absolute -bottom-2.5 left-4 right-4 z-20 flex h-4 items-center justify-center"
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onInsertEmptyLyricAt(idx + 1);
                      }}
                      className="flex items-center gap-1 rounded-full border border-cyan-400/70 bg-slate-950/95 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-300 opacity-0 shadow-md transition-opacity group-hover/bottom:opacity-100 hover:bg-cyan-500/20"
                      title="이 위치 아래에 빈 가사(3초) 추가"
                    >
                      <Plus className="h-3 w-3" /> 가사 추가
                    </button>
                  </div>

                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                        #{idx + 1}
                      </span>
                      <span className="font-mono text-[11px] text-cyan-300">
                        {seg.startTime.toFixed(2)}s ~ {seg.endTime.toFixed(2)}s
                      </span>
                      {seg.notes && (
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.5 text-[10px] text-indigo-300">
                          {seg.notes}
                        </span>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSegment(seg.id);
                      }}
                      className="rounded p-1 text-slate-500 hover:bg-rose-500/15 hover:text-rose-400"
                      title="삭제"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <input
                    ref={(el) => {
                      inputRefs.current[seg.id] = el;
                    }}
                    type="text"
                    value={seg.text}
                    onFocus={() => onSelectSegment(seg)}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectSegment(seg);
                    }}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      const selStart = e.currentTarget.selectionStart ?? 0;
                      const selEnd = e.currentTarget.selectionEnd ?? selStart;

                      if (e.key === 'Backspace' && idx > 0 && selStart === 0 && selEnd === 0) {
                        e.preventDefault();
                        const prevSeg = segments[idx - 1];
                        const cursorPos =
                          prevSeg.text.length === 0
                            ? 0
                            : seg.text.length === 0 ||
                                /\s$/.test(prevSeg.text) ||
                                /^\s/.test(seg.text)
                              ? prevSeg.text.length
                              : prevSeg.text.length + 1;
                        pendingFocusRef.current = { id: prevSeg.id, cursorPos };
                        onMergeWithPrevious(seg.id);
                        return;
                      }

                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        const leftText = seg.text.slice(0, selStart).trimEnd();
                        const rightText = seg.text.slice(selEnd).trimStart();
                        if (leftText.length > 0 && rightText.length > 0) {
                          e.preventDefault();
                          const newId = `seg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
                          pendingFocusRef.current = { id: newId, cursorPos: 0 };
                          onSplitSegment(seg.id, selStart, selEnd, newId);
                        }
                      }
                    }}
                    onChange={(e) => onUpdateSegment(seg.id, { text: e.target.value })}
                    placeholder="가사 입력..."
                    className="w-full rounded-lg border border-slate-800 bg-slate-950/80 px-2.5 py-1.5 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
                  />

                  <div
                    className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1">
                      <span>시작</span>
                      <button
                        type="button"
                        onClick={() => nudge(seg, 'startTime', -0.1)}
                        className="rounded bg-slate-800 px-1.5 py-0.5 hover:bg-slate-700"
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => nudge(seg, 'startTime', 0.1)}
                        className="rounded bg-slate-800 px-1.5 py-0.5 hover:bg-slate-700"
                      >
                        +0.1s
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span>끝</span>
                      <button
                        type="button"
                        onClick={() => nudge(seg, 'endTime', -0.1)}
                        className="rounded bg-slate-800 px-1.5 py-0.5 hover:bg-slate-700"
                      >
                        -0.1s
                      </button>
                      <button
                        type="button"
                        onClick={() => nudge(seg, 'endTime', 0.1)}
                        className="rounded bg-slate-800 px-1.5 py-0.5 hover:bg-slate-700"
                      >
                        +0.1s
                      </button>
                    </div>
                  </div>

                  {isActive && (
                    <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-slate-800">
                      <div
                        className="h-full bg-cyan-400"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                  )}
                </div>

                {idx < segments.length - 1 && segments[idx + 1].startTime - seg.endTime > 1.0 && (
                  <button
                    type="button"
                    onClick={() => onInsertSegmentAt(idx + 1, 'gap')}
                    className="w-full rounded-md border border-dashed border-slate-800 py-1 text-[10px] text-slate-500 hover:border-indigo-500/50 hover:text-indigo-300"
                  >
                    + 간주/빈 구간 추가
                  </button>
                )}
              </React.Fragment>
            );
          })
        )}
      </div>
    </div>
  );
};
