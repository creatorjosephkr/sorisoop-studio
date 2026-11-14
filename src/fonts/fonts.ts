import { BundledFont } from '../types';

/**
 * 저작권 안전 가드:
 * 사용자 PC의 시스템 폰트는 일절 스캔/참조하지 않으며,
 * 앱에 내장된 상업적 무료(SIL OFL 1.0) 한글 폰트만 허용합니다.
 */
export const BUNDLED_FONTS: BundledFont[] = [
  {
    id: 'pretendard-bold',
    family: 'Sorisoop-Pretendard',
    displayName: 'Pretendard Bold (프리텐다드 굵게)',
    category: '고딕',
    license: 'SIL OFL 1.0 (상업적 이용 무료)',
    url: './fonts/Pretendard-Bold.woff2',
    weight: '700',
  },
  {
    id: 'pretendard-regular',
    family: 'Sorisoop-Pretendard',
    displayName: 'Pretendard Regular (프리텐다드 보통)',
    category: '고딕',
    license: 'SIL OFL 1.0 (상업적 이용 무료)',
    url: './fonts/Pretendard-Regular.woff2',
    weight: '400',
  },
  {
    id: 'gowun-batang',
    family: 'Sorisoop-GowunBatang',
    displayName: '고운바탕 Bold (감성 명조)',
    category: '명조',
    license: 'SIL OFL 1.0 (상업적 이용 무료)',
    url: './fonts/GowunBatang-Bold.ttf',
    weight: '700',
  },
  {
    id: 'gowun-dodum',
    family: 'Sorisoop-GowunDodum',
    displayName: '고운돋움 Regular (부드러운 고딕)',
    category: '고딕',
    license: 'SIL OFL 1.0 (상업적 이용 무료)',
    url: './fonts/GowunDodum-Regular.ttf',
    weight: '400',
  },
  {
    id: 'black-han-sans',
    family: 'Sorisoop-BlackHanSans',
    displayName: '검은고딕 Black Han Sans (강조 타이틀)',
    category: '포인트/손글씨',
    license: 'SIL OFL 1.0 (상업적 이용 무료)',
    url: './fonts/BlackHanSans-Regular.ttf',
    weight: '400',
  },
  {
    id: 'jua',
    family: 'Sorisoop-Jua',
    displayName: '배달의민족 주아체 (둥근 포인트)',
    category: '포인트/손글씨',
    license: 'SIL OFL 1.0 (상업적 이용 무료)',
    url: './fonts/Jua-Regular.ttf',
    weight: '400',
  },
  {
    id: 'bithumb-gothic-basic',
    family: 'Sorisoop-BithumbGothicBasic',
    displayName: '빗썸고딕 Basic (Bithumb Gothic Basic)',
    category: '고딕',
    license: '내장 무료 폰트 (Bithumb Gothic)',
    url: './fonts/Bithumb Gothic Basic.ttf',
    weight: '400',
  },
  {
    id: 'bithumb-gothic-original',
    family: 'Sorisoop-BithumbGothicOriginal',
    displayName: '빗썸고딕 Original (Bithumb Gothic Original)',
    category: '고딕',
    license: '내장 무료 폰트 (Bithumb Gothic)',
    url: './fonts/Bithumb Gothic Original.ttf',
    weight: '400',
  },
  {
    id: 'maplestory-light',
    family: 'Sorisoop-MaplestoryLight',
    displayName: '넥슨 메이플스토리 Light (Maplestory Light)',
    category: '포인트/손글씨',
    license: '내장 무료 폰트 (Nexon Maplestory)',
    url: './fonts/Maplestory Light.ttf',
    weight: '300',
  },
  {
    id: 'maplestory-bold',
    family: 'Sorisoop-MaplestoryBold',
    displayName: '넥슨 메이플스토리 Bold (Maplestory Bold)',
    category: '포인트/손글씨',
    license: '내장 무료 폰트 (Nexon Maplestory)',
    url: './fonts/Maplestory Bold.ttf',
    weight: '700',
  },
  {
    id: 'okdandan-bold',
    family: 'Sorisoop-OkDanDanBold',
    displayName: 'OK단단체 Bold (OkDanDan Bold)',
    category: '포인트/손글씨',
    license: '내장 무료 폰트 (OK단단체)',
    url: './fonts/OkDanDan-Bold.ttf',
    weight: '700',
  },
  {
    id: 'one-mobile-pop',
    family: 'Sorisoop-ONEMobilePOP',
    displayName: 'ONE 모바일고딕 POP (ONE Mobile POP)',
    category: '포인트/손글씨',
    license: '내장 무료 폰트 (ONE Mobile POP)',
    url: './fonts/ONE Mobile POP.ttf',
    weight: '400',
  },
  {
    id: 'kcc-ganpan',
    family: 'Sorisoop-KCCGanpan',
    displayName: 'KCC 간판체 (KCC-Ganpan)',
    category: '포인트/손글씨',
    license: '내장 무료 폰트 (KCC 간판체)',
    url: './fonts/KCC-Ganpan.ttf',
    weight: '400',
  },
  {
    id: 'korail-light',
    family: 'Sorisoop-KorailLight',
    displayName: '한국철도 코레일체 Light (Korail Light)',
    category: '고딕',
    license: '내장 무료 폰트 (한국철도공사 코레일체)',
    url: './fonts/Korai_ L.ttf',
    weight: '300',
  },
  {
    id: 'korail-medium',
    family: 'Sorisoop-KorailMedium',
    displayName: '한국철도 코레일체 Medium (Korail Medium)',
    category: '고딕',
    license: '내장 무료 폰트 (한국철도공사 코레일체)',
    url: './fonts/Korail_M.ttf',
    weight: '500',
  },
  {
    id: 'korail-bold',
    family: 'Sorisoop-KorailBold',
    displayName: '한국철도 코레일체 Bold (Korail Bold)',
    category: '고딕',
    license: '내장 무료 폰트 (한국철도공사 코레일체)',
    url: './fonts/Korail_B.ttf',
    weight: '700',
  },
];

let fontsLoadedPromise: Promise<void> | null = null;

export function ensureBundledFontsLoaded(): Promise<void> {
  if (fontsLoadedPromise) return fontsLoadedPromise;

  fontsLoadedPromise = (async () => {
    await Promise.all(
      BUNDLED_FONTS.map(async (f) => {
        try {
          const face = new FontFace(f.family, `url("${f.url}")`, {
            weight: f.weight,
            style: 'normal',
          });
          const loaded = await face.load();
          document.fonts.add(loaded);
        } catch (err) {
          console.error(`내장 폰트 로드 실패 (${f.id}):`, err);
        }
      })
    );
    await document.fonts.ready;
  })();

  return fontsLoadedPromise;
}

export function getBundledFontById(fontId: string): BundledFont {
  return BUNDLED_FONTS.find((f) => f.id === fontId) ?? BUNDLED_FONTS[0];
}
