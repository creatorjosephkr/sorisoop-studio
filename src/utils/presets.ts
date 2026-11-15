import { SubtitleStylePreset } from '../types';

const STORAGE_KEY = 'sorisoop_subtitle_presets_v1';

export const DEFAULT_PRESETS: SubtitleStylePreset[] = [
  {
    id: 'neon-karaoke',
    name: '네온 스타일',
    isBuiltIn: true,
    fontId: 'pretendard-bold',
    fontSize: 56,
    fontWeight: 700,
    letterSpacing: -0.5,
    lineHeight: 1.3,
    textColor: '#ffffff',
    useGradient: true,
    gradientStart: '#ffffff',
    gradientEnd: '#67e8f9',
    strokeColor: '#020617',
    strokeWidth: 3,
    shadowColor: '#38bdf8',
    shadowBlur: 18,
    boxEnabled: false,
    boxColor: '#020617',
    boxOpacity: 0.65,
    boxRadius: 16,
    boxPaddingX: 28,
    boxPaddingY: 16,
    position: 'center',
    offsetY: 0,
    showPrevNext: true,
    animation: 'karaoke-bar',
    karaokeBarColor: '#38bdf8',
  },
  {
    id: 'ballad-serif',
    name: '감성 발라드 (명조)',
    isBuiltIn: true,
    fontId: 'gowun-batang',
    fontSize: 48,
    fontWeight: 700,
    letterSpacing: 1,
    lineHeight: 1.4,
    textColor: '#f8fafc',
    useGradient: false,
    gradientStart: '#f8fafc',
    gradientEnd: '#e2e8f0',
    strokeColor: '#0f172a',
    strokeWidth: 2,
    shadowColor: 'rgba(0, 0, 0, 0.85)',
    shadowBlur: 14,
    boxEnabled: false,
    boxColor: '#000000',
    boxOpacity: 0.5,
    boxRadius: 12,
    boxPaddingX: 24,
    boxPaddingY: 12,
    position: 'bottom',
    offsetY: -80,
    showPrevNext: false,
    animation: 'fade',
    karaokeBarColor: '#f472b6',
  },
  {
    id: 'cinematic-clean',
    name: '시네마틱 미니멀',
    isBuiltIn: true,
    fontId: 'gowun-dodum',
    fontSize: 42,
    fontWeight: 400,
    letterSpacing: 2.5,
    lineHeight: 1.35,
    textColor: '#f1f5f9',
    useGradient: false,
    gradientStart: '#ffffff',
    gradientEnd: '#cbd5e1',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: 'rgba(0,0,0,0.9)',
    shadowBlur: 10,
    boxEnabled: true,
    boxColor: '#020617',
    boxOpacity: 0.68,
    boxRadius: 999,
    boxPaddingX: 32,
    boxPaddingY: 14,
    position: 'bottom',
    offsetY: -70,
    showPrevNext: false,
    animation: 'fade',
    karaokeBarColor: '#94a3b8',
  },
  {
    id: 'shorts-pop',
    name: '쇼츠/릴스 팝 강조',
    isBuiltIn: true,
    fontId: 'black-han-sans',
    fontSize: 64,
    fontWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.25,
    textColor: '#fde047',
    useGradient: true,
    gradientStart: '#fef08a',
    gradientEnd: '#fb923c',
    strokeColor: '#0f172a',
    strokeWidth: 8,
    shadowColor: 'rgba(0,0,0,0.9)',
    shadowBlur: 12,
    boxEnabled: false,
    boxColor: '#000000',
    boxOpacity: 0.5,
    boxRadius: 12,
    boxPaddingX: 24,
    boxPaddingY: 12,
    position: 'center',
    offsetY: 120,
    showPrevNext: false,
    animation: 'pop',
    karaokeBarColor: '#facc15',
  },
  {
    id: 'jua-cute',
    name: '어쿠스틱 주아체',
    isBuiltIn: true,
    fontId: 'jua',
    fontSize: 52,
    fontWeight: 400,
    letterSpacing: 0.5,
    lineHeight: 1.3,
    textColor: '#ffffff',
    useGradient: false,
    gradientStart: '#ffffff',
    gradientEnd: '#bae6fd',
    strokeColor: '#1e1b4b',
    strokeWidth: 5,
    shadowColor: 'rgba(30,27,75,0.75)',
    shadowBlur: 10,
    boxEnabled: true,
    boxColor: '#312e81',
    boxOpacity: 0.45,
    boxRadius: 20,
    boxPaddingX: 28,
    boxPaddingY: 14,
    position: 'bottom',
    offsetY: -90,
    showPrevNext: true,
    animation: 'karaoke-bar',
    karaokeBarColor: '#a78bfa',
  },
  {
    id: 'plain-none',
    name: '스타일 없음',
    isBuiltIn: true,
    fontId: 'pretendard-medium',
    fontSize: 48,
    fontWeight: 500,
    letterSpacing: 0,
    lineHeight: 1.35,
    textColor: '#ffffff',
    useGradient: false,
    gradientStart: '#ffffff',
    gradientEnd: '#ffffff',
    strokeColor: '#000000',
    strokeWidth: 0,
    shadowColor: '#000000',
    shadowBlur: 0,
    boxEnabled: false,
    boxColor: '#000000',
    boxOpacity: 0,
    boxRadius: 0,
    boxPaddingX: 0,
    boxPaddingY: 0,
    position: 'bottom',
    offsetX: 0,
    offsetY: 0,
    showPrevNext: false,
    animation: 'none',
    karaokeBarColor: '#ffffff',
  },
];

export function mergeWithDefaultPresets(list: SubtitleStylePreset[]): {
  merged: SubtitleStylePreset[];
  migrated: boolean;
} {
  let migrated = false;
  const byId = new Map(
    list.map((p) => {
      if (p.id === 'neon-karaoke' && (p.name.includes('가라오케') || p.name.includes('(기본)'))) {
        migrated = true;
        return [p.id, { ...p, name: '네온 스타일' }] as const;
      }
      return [p.id, p] as const;
    })
  );
  for (const def of DEFAULT_PRESETS) {
    if (!byId.has(def.id)) {
      byId.set(def.id, def);
      migrated = true;
    }
  }
  return { merged: Array.from(byId.values()), migrated };
}

export function loadPresets(): SubtitleStylePreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PRESETS;
    const parsed = JSON.parse(raw) as SubtitleStylePreset[];
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_PRESETS;

    const { merged, migrated } = mergeWithDefaultPresets(parsed);
    if (migrated) savePresets(merged);
    return merged;
  } catch {
    return DEFAULT_PRESETS;
  }
}

export function savePresets(presets: SubtitleStylePreset[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
