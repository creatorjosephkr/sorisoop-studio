import React from 'react';

interface SettingSectionProps {
  title?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * 오른쪽 설정 패널의 개별 그룹 카드.
 */
export const SettingSection: React.FC<SettingSectionProps> = ({
  title,
  action,
  children,
  className = '',
}) => (
  <section
    className={`min-w-0 rounded-xl border border-slate-800/80 bg-slate-950/45 p-2.5 space-y-1.5 ${className}`}
  >
    {(title || action) && (
      <div className="flex items-center justify-between gap-2 border-b border-slate-800/70 pb-1.5">
        {title && (
          <div className="min-w-0 truncate text-[11px] font-semibold tracking-wide text-cyan-300">
            {title}
          </div>
        )}
        {action && <div className="flex shrink-0 items-center gap-1">{action}</div>}
      </div>
    )}
    <div>{children}</div>
  </section>
);

interface SettingRowProps {
  label: React.ReactNode;
  children: React.ReactNode;
  align?: 'center' | 'start';
  className?: string;
}

/**
 * 3:7 비율(항목 이름 3 : 값 설정 7)의 설정 행.
 */
export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  children,
  align = 'center',
  className = '',
}) => (
  <div
    className={`grid min-w-0 grid-cols-10 gap-2 py-1.5 first:pt-0.5 last:pb-0.5 ${
      align === 'start' ? 'items-start' : 'items-center'
    } ${className}`}
  >
    <div
      className={`col-span-3 min-w-0 text-[11px] font-medium leading-snug text-slate-400 break-keep ${
        align === 'start' ? 'pt-1' : ''
      }`}
    >
      {label}
    </div>
    <div className="col-span-7 min-w-0">{children}</div>
  </div>
);

interface SliderControlProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  valueLabel: string;
  onChange: (value: number) => void;
}

/**
 * 7영역 내부에 들어가는 슬라이더 + 우측 수치 표시.
 */
export const SliderControl: React.FC<SliderControlProps> = ({
  value,
  min,
  max,
  step = 1,
  valueLabel,
  onChange,
}) => (
  <div className="flex min-w-0 items-center gap-1.5">
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="min-w-0 flex-1 accent-cyan-400"
    />
    <span className="w-10 shrink-0 text-right font-mono text-[11px] text-slate-300">
      {valueLabel}
    </span>
  </div>
);

interface ColorControlProps {
  value: string;
  onChange: (value: string) => void;
  title?: string;
}

/**
 * 색상 피커 + HEX 값 표시.
 */
export const ColorControl: React.FC<ColorControlProps> = ({ value, onChange, title }) => (
  <div className="flex items-center gap-2">
    <input
      type="color"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      title={title}
      className="h-6 w-10 cursor-pointer rounded border border-slate-700 bg-transparent p-0"
    />
    <span className="font-mono text-[11px] uppercase text-slate-400">{value}</span>
  </div>
);

interface ToggleControlProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  onLabel?: string;
  offLabel?: string;
}

/**
 * 켜짐/꺼짐 토글 스위치.
 */
export const ToggleControl: React.FC<ToggleControlProps> = ({
  checked,
  onChange,
  onLabel = '사용',
  offLabel = '사용 안 함',
}) => (
  <label className="inline-flex cursor-pointer items-center gap-2 select-none">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="sr-only"
    />
    <span
      className={`relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors ${
        checked ? 'bg-cyan-500' : 'bg-slate-700'
      }`}
    >
      <span
        className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-3.5' : 'translate-x-0.5'
        }`}
      />
    </span>
    <span className={`text-[11px] ${checked ? 'text-cyan-300' : 'text-slate-400'}`}>
      {checked ? onLabel : offLabel}
    </span>
  </label>
);
