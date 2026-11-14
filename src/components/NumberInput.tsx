import React, { useEffect, useState } from 'react';

interface NumberInputProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  title?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * 숫자 입력 중 백스페이스로 빈 값까지 지울 수 있고,
 * Enter 키 또는 포커스 해제 시 값을 확정/보정하는 숫자 입력 컴포넌트
 */
export const NumberInput: React.FC<NumberInputProps> = ({
  value,
  onChange,
  min,
  max,
  step,
  className,
  title,
  placeholder,
  disabled,
}) => {
  const [draft, setDraft] = useState<string>(String(value));
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    if (!isFocused) {
      setDraft(String(value));
    }
  }, [value, isFocused]);

  const commitValue = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '.') {
      setDraft(String(value));
      return;
    }
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    let next = parsed;
    if (typeof min === 'number') next = Math.max(min, next);
    if (typeof max === 'number') next = Math.min(max, next);
    next = Number(next.toFixed(4));
    setDraft(String(next));
    onChange(next);
  };

  return (
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={draft}
      disabled={disabled}
      title={title}
      placeholder={placeholder}
      className={className}
      onFocus={(e) => {
        setIsFocused(true);
        setDraft(String(value));
        e.currentTarget.select();
      }}
      onChange={(e) => {
        setDraft(e.target.value);
      }}
      onBlur={() => {
        setIsFocused(false);
        commitValue(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commitValue(draft);
          setIsFocused(false);
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          setDraft(String(value));
          setIsFocused(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
};
