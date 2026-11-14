import React from 'react';

interface VuMeterProps {
  leftDb: number;
  rightDb: number;
}

// 아래(-54dB) -> 위(0dB, 최상단은 PEAK)까지 16단계 세분화 LED
const SEGMENT_THRESHOLDS_DB = [
  -54, -48, -42, -36, -30, -24, -20, -16,
  -12, -9, -7, -6, -4, -2, -0.5, 0,
];

function getLedColorClass(dbThreshold: number, isLit: boolean): string {
  if (!isLit) {
    return 'bg-slate-800/60';
  }
  if (dbThreshold >= 0) {
    return 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.9)]'; // PEAK
  }
  if (dbThreshold >= -2) {
    return 'bg-red-500';
  }
  if (dbThreshold >= -4) {
    return 'bg-orange-500';
  }
  if (dbThreshold >= -6) {
    return 'bg-amber-500';
  }
  if (dbThreshold >= -12) {
    return 'bg-yellow-400';
  }
  return 'bg-emerald-400';
}

export const VuMeter: React.FC<VuMeterProps> = ({ leftDb, rightDb }) => {
  const renderChannel = (label: string, db: number) => {
    const isPeak = Number.isFinite(db) && db >= 0;

    return (
      <div className="flex flex-col items-center gap-0.5">
        <div className="flex flex-col-reverse gap-[2px]">
          {SEGMENT_THRESHOLDS_DB.map((thresh, idx) => {
            const isLit = Number.isFinite(db) && db >= thresh;
            return (
              <div
                key={idx}
                className={`h-[3px] w-3 rounded-[1px] ${getLedColorClass(thresh, isLit)}`}
              />
            );
          })}
        </div>
        <span
          className={`mt-0.5 text-[9px] font-bold leading-none ${
            isPeak ? 'text-red-400' : 'text-slate-400'
          }`}
        >
          {label}
        </span>
      </div>
    );
  };

  return (
    <div
      className="flex h-24 shrink-0 flex-col items-center justify-between rounded-lg border border-slate-800 bg-slate-950/95 px-2 py-1"
      title={`L: ${Number.isFinite(leftDb) ? leftDb.toFixed(1) : '-∞'} dB / R: ${
        Number.isFinite(rightDb) ? rightDb.toFixed(1) : '-∞'
      } dB`}
    >
      <span className="text-[7px] font-bold tracking-wider text-rose-400/90 leading-none">
        PEAK
      </span>
      <div className="flex items-end gap-1.5">{renderChannel('L', leftDb)}{renderChannel('R', rightDb)}</div>
    </div>
  );
};
