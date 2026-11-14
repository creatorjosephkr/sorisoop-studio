import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { BUNDLED_FONTS, getBundledFontById } from '../fonts/fonts';

interface FontPickerProps {
  value: string;
  onChange: (fontId: string) => void;
}

const PREVIEW_TEXT = '소리숲 SoriSoop 字';

export const FontPicker: React.FC<FontPickerProps> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedFont = getBundledFontById(value);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-1.5 text-left text-xs text-slate-100 transition hover:border-cyan-500/70"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="shrink-0 rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-cyan-300">
            {selectedFont.category}
          </span>
          <span className="truncate font-medium text-slate-200">{selectedFont.displayName}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            style={{
              fontFamily: `"${selectedFont.family}"`,
              fontWeight: Number(selectedFont.weight) || 400,
            }}
            className="text-xs text-amber-200"
          >
            {PREVIEW_TEXT}
          </span>
          <ChevronDown
            className={`h-3.5 w-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && (
        <div className="absolute right-0 left-0 z-50 mt-1 max-h-72 overflow-y-auto rounded-xl border border-slate-700 bg-slate-950 shadow-2xl">
          <div className="grid grid-cols-[72px_1fr_auto] items-center gap-2 border-b border-slate-800 bg-slate-900/90 px-2.5 py-1.5 text-[10px] font-semibold text-slate-400">
            <span>폰트 유형</span>
            <span>폰트 이름</span>
            <span className="text-right">폰트 미리보기</span>
          </div>
          <div className="divide-y divide-slate-800/70">
            {BUNDLED_FONTS.map((f) => {
              const isSelected = f.id === selectedFont.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => {
                    onChange(f.id);
                    setOpen(false);
                  }}
                  className={`grid w-full grid-cols-[72px_1fr_auto] items-center gap-2 px-2.5 py-2 text-left transition ${
                    isSelected
                      ? 'bg-cyan-500/15 text-cyan-100'
                      : 'text-slate-200 hover:bg-slate-900'
                  }`}
                >
                  <span className="truncate rounded bg-slate-800/90 px-1.5 py-0.5 text-center text-[10px] text-cyan-300">
                    {f.category}
                  </span>
                  <span className="truncate text-[11px] font-medium">{f.displayName}</span>
                  <span
                    style={{
                      fontFamily: `"${f.family}"`,
                      fontWeight: Number(f.weight) || 400,
                    }}
                    className="whitespace-nowrap text-right text-sm text-amber-200"
                  >
                    {PREVIEW_TEXT}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
