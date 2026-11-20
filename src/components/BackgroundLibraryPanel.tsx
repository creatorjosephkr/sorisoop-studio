import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Download,
  Film,
  Image as ImageIcon,
  Pencil,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  AspectRatio,
  BackgroundLibraryCategory,
  BackgroundLibraryItem,
  BackgroundLibraryRatio,
} from '../types';

const BG_LIBRARY_STORAGE_KEY = 'sorisoop_bg_library_v1';
const BG_BUILTIN_NAMES_STORAGE_KEY = 'sorisoop_bg_builtin_names_v1';

const BUILTIN_SAMPLE_BACKGROUNDS: BackgroundLibraryItem[] = [
  {
    id: 'builtin-01-16x9',
    name: '기본 샘플 01 (16:9)',
    mediaType: 'image',
    aspectRatio: '16:9',
    url: './backgrounds/Default_01_16x9.png',
    isBuiltIn: true,
    createdAt: 1,
  },
  {
    id: 'builtin-02-16x9',
    name: '기본 샘플 02 (16:9)',
    mediaType: 'image',
    aspectRatio: '16:9',
    url: './backgrounds/Default_02_16x9.png',
    isBuiltIn: true,
    createdAt: 2,
  },
  {
    id: 'builtin-03-16x9',
    name: '기본 샘플 03 (16:9)',
    mediaType: 'image',
    aspectRatio: '16:9',
    url: './backgrounds/Default_03_16x9.png',
    isBuiltIn: true,
    createdAt: 3,
  },
  {
    id: 'builtin-04-16x9',
    name: '기본 샘플 04 (16:9)',
    mediaType: 'image',
    aspectRatio: '16:9',
    url: './backgrounds/Default_04_16x9.png',
    isBuiltIn: true,
    createdAt: 4,
  },
  {
    id: 'builtin-05-16x9',
    name: '기본 샘플 05 (16:9)',
    mediaType: 'image',
    aspectRatio: '16:9',
    url: './backgrounds/Default_05_16x9.png',
    isBuiltIn: true,
    createdAt: 5,
  },
  {
    id: 'builtin-01-9x16',
    name: '기본 샘플 01 (9:16)',
    mediaType: 'image',
    aspectRatio: '9:16',
    url: './backgrounds/Default_01_9x16.png',
    isBuiltIn: true,
    createdAt: 6,
  },
  {
    id: 'builtin-02-9x16',
    name: '기본 샘플 02 (9:16)',
    mediaType: 'image',
    aspectRatio: '9:16',
    url: './backgrounds/Default_02_9x16.png',
    isBuiltIn: true,
    createdAt: 7,
  },
  {
    id: 'builtin-03-9x16',
    name: '기본 샘플 03 (9:16)',
    mediaType: 'image',
    aspectRatio: '9:16',
    url: './backgrounds/Default_03_9x16.png',
    isBuiltIn: true,
    createdAt: 8,
  },
  {
    id: 'builtin-04-9x16',
    name: '기본 샘플 04 (9:16)',
    mediaType: 'image',
    aspectRatio: '9:16',
    url: './backgrounds/Default_04_9x16.png',
    isBuiltIn: true,
    createdAt: 9,
  },
  {
    id: 'builtin-05-9x16',
    name: '기본 샘플 05 (9:16)',
    mediaType: 'image',
    aspectRatio: '9:16',
    url: './backgrounds/Default_05_9x16.png',
    isBuiltIn: true,
    createdAt: 10,
  },
];

function loadStoredUserItems(): BackgroundLibraryItem[] {
  try {
    const raw = localStorage.getItem(BG_LIBRARY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is BackgroundLibraryItem =>
        Boolean(item && typeof item.id === 'string' && typeof item.url === 'string') &&
        !item.url.startsWith('blob:')
    );
  } catch {
    return [];
  }
}

function loadBuiltInCustomNames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(BG_BUILTIN_NAMES_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

async function detectMediaAspectRatio(
  url: string,
  mediaType: BackgroundLibraryCategory
): Promise<BackgroundLibraryRatio> {
  return new Promise((resolve) => {
    if (mediaType === 'image') {
      const img = new Image();
      img.onload = () => {
        resolve(img.naturalHeight > img.naturalWidth ? '9:16' : '16:9');
      };
      img.onerror = () => resolve('16:9');
      img.src = url;
    } else {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        const w = video.videoWidth || 16;
        const h = video.videoHeight || 9;
        resolve(h > w ? '9:16' : '16:9');
      };
      video.onerror = () => resolve('16:9');
      video.src = url;
    }
  });
}

function getFileExtension(urlOrName: string, mediaType: BackgroundLibraryCategory): string {
  const clean = urlOrName.split('?')[0].split('#')[0];
  const m = /\.([a-zA-Z0-9]+)$/.exec(clean);
  if (m) return m[1].toLowerCase();
  return mediaType === 'video' ? 'mp4' : 'png';
}

function ensureExtension(name: string, fallbackExt: string): string {
  const trimmed = name.trim() || 'background';
  if (/\.[a-zA-Z0-9]{2,5}$/.test(trimmed)) return trimmed;
  return `${trimmed}.${fallbackExt}`;
}

interface BackgroundLibraryPanelProps {
  currentAspectRatio: AspectRatio;
  onAddToTimeline: (item: {
    url: string;
    name: string;
    mediaType: 'image' | 'video';
    filePath?: string;
  }) => Promise<void> | void;
}

export const BackgroundLibraryPanel: React.FC<BackgroundLibraryPanelProps> = ({
  currentAspectRatio,
  onAddToTimeline,
}) => {
  const [category, setCategory] = useState<BackgroundLibraryCategory>('image');
  const [ratioFilter, setRatioFilter] = useState<BackgroundLibraryRatio>(
    currentAspectRatio === '9:16' ? '9:16' : '16:9'
  );
  const [userItems, setUserItems] = useState<BackgroundLibraryItem[]>(loadStoredUserItems);
  const [builtInNames, setBuiltInNames] =
    useState<Record<string, string>>(loadBuiltInCustomNames);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    try {
      const persistable = userItems.filter((item) => !item.url.startsWith('blob:'));
      localStorage.setItem(BG_LIBRARY_STORAGE_KEY, JSON.stringify(persistable));
    } catch {
      // ignore storage quota errors
    }
  }, [userItems]);

  useEffect(() => {
    try {
      localStorage.setItem(BG_BUILTIN_NAMES_STORAGE_KEY, JSON.stringify(builtInNames));
    } catch {
      // ignore storage quota errors
    }
  }, [builtInNames]);

  useEffect(() => {
    if (!statusMessage) return;
    const timer = window.setTimeout(() => setStatusMessage(null), 3000);
    return () => window.clearTimeout(timer);
  }, [statusMessage]);

  const allItems = useMemo(() => {
    const samples = BUILTIN_SAMPLE_BACKGROUNDS.map((item) => ({
      ...item,
      name: builtInNames[item.id] ?? item.name,
    }));
    return [...userItems, ...samples];
  }, [userItems, builtInNames]);

  const categoryCounts = useMemo(
    () => ({
      image: allItems.filter((i) => i.mediaType === 'image').length,
      video: allItems.filter((i) => i.mediaType === 'video').length,
    }),
    [allItems]
  );

  const ratioCounts = useMemo(() => {
    const inCategory = allItems.filter((i) => i.mediaType === category);
    return {
      '16:9': inCategory.filter((i) => i.aspectRatio === '16:9').length,
      '9:16': inCategory.filter((i) => i.aspectRatio === '9:16').length,
    };
  }, [allItems, category]);

  const filteredItems = useMemo(
    () =>
      allItems.filter(
        (item) => item.mediaType === category && item.aspectRatio === ratioFilter
      ),
    [allItems, category, ratioFilter]
  );

  const handleRegister = async () => {
    if (window.electronAPI?.registerBgLibraryFiles) {
      const picked = await window.electronAPI.registerBgLibraryFiles({ mediaType: category });
      if (!picked || picked.length === 0) return;

      const added: BackgroundLibraryItem[] = [];
      for (const file of picked) {
        const detectedRatio = await detectMediaAspectRatio(file.fileUrl, file.mediaType);
        added.push({
          id: `user-bg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: file.name,
          mediaType: file.mediaType,
          aspectRatio: detectedRatio,
          url: file.fileUrl,
          filePath: file.filePath,
          isBuiltIn: false,
          createdAt: Date.now(),
        });
      }
      setUserItems((prev) => [...added, ...prev]);
      setCategory(added[0].mediaType);
      setRatioFilter(added[0].aspectRatio);
      setStatusMessage(`${added.length}개 배경 소스를 등록했습니다.`);
      return;
    }

    fileInputRef.current?.click();
  };

  const handleBrowserFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;

    const added: BackgroundLibraryItem[] = [];
    for (const file of files) {
      const mediaType: BackgroundLibraryCategory = file.type.startsWith('video/')
        ? 'video'
        : 'image';
      const url = URL.createObjectURL(file);
      const detectedRatio = await detectMediaAspectRatio(url, mediaType);
      added.push({
        id: `user-bg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        mediaType,
        aspectRatio: detectedRatio,
        url,
        isBuiltIn: false,
        createdAt: Date.now(),
      });
    }
    setUserItems((prev) => [...added, ...prev]);
    setCategory(added[0].mediaType);
    setRatioFilter(added[0].aspectRatio);
    setStatusMessage(`${added.length}개 배경 소스를 등록했습니다.`);
  };

  const handleStartRename = (item: BackgroundLibraryItem) => {
    setEditingId(item.id);
    setEditingName(item.name);
  };

  const handleCommitRename = (item: BackgroundLibraryItem) => {
    const trimmed = editingName.trim();
    if (!trimmed) {
      setEditingId(null);
      return;
    }
    if (item.isBuiltIn) {
      setBuiltInNames((prev) => ({ ...prev, [item.id]: trimmed }));
    } else {
      setUserItems((prev) =>
        prev.map((entry) => (entry.id === item.id ? { ...entry, name: trimmed } : entry))
      );
    }
    setEditingId(null);
    setStatusMessage('배경 이름을 변경했습니다.');
  };

  const handleDelete = async (item: BackgroundLibraryItem) => {
    if (item.isBuiltIn) return;
    if (item.filePath && window.electronAPI?.deleteBgLibraryFile) {
      await window.electronAPI.deleteBgLibraryFile(item.filePath);
    }
    if (item.url.startsWith('blob:')) {
      URL.revokeObjectURL(item.url);
    }
    setUserItems((prev) => prev.filter((entry) => entry.id !== item.id));
    setStatusMessage('배경 소스를 삭제했습니다.');
  };

  const handleSaveToPc = async (item: BackgroundLibraryItem) => {
    const ext = getFileExtension(item.filePath || item.url || item.name, item.mediaType);
    const defaultName = ensureExtension(item.name, ext);

    if (window.electronAPI?.saveMediaFile) {
      let dataBytes: Uint8Array | undefined;
      if (!item.filePath) {
        const res = await fetch(item.url);
        const buf = await res.arrayBuffer();
        dataBytes = new Uint8Array(buf);
      }
      const savedPath = await window.electronAPI.saveMediaFile({
        defaultName,
        sourcePath: item.filePath,
        dataBytes,
      });
      if (savedPath) {
        setStatusMessage('PC에 저장했습니다.');
      }
      return;
    }

    const a = document.createElement('a');
    a.href = item.url;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setStatusMessage('PC 다운로드를 시작했습니다.');
  };

  return (
    <div className="space-y-2.5">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={category === 'video' ? 'video/*' : 'image/*'}
        onChange={(e) => void handleBrowserFileChange(e)}
        className="hidden"
      />

      {/* 상단 카테고리 + 등록 버튼 */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-2.5 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-1 rounded-lg border border-slate-800 bg-slate-950/70 p-0.5">
            <button
              type="button"
              onClick={() => setCategory('image')}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold transition ${
                category === 'image'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <ImageIcon className="h-3 w-3" />
              이미지 ({categoryCounts.image})
            </button>
            <button
              type="button"
              onClick={() => setCategory('video')}
              className={`flex flex-1 items-center justify-center gap-1 rounded-md py-1 text-[11px] font-semibold transition ${
                category === 'video'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              <Film className="h-3 w-3" />
              영상 ({categoryCounts.video})
            </button>
          </div>

          <button
            type="button"
            onClick={() => void handleRegister()}
            className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-indigo-500"
            title={`${category === 'image' ? '이미지' : '영상'} 소스 등록`}
          >
            <Plus className="h-3.5 w-3.5" />
            등록
          </button>
        </div>

        {/* 비율 필터 (16:9 / 9:16) */}
        <div className="grid grid-cols-2 gap-1.5">
          {(['16:9', '9:16'] as BackgroundLibraryRatio[]).map((ratio) => (
            <button
              key={ratio}
              type="button"
              onClick={() => setRatioFilter(ratio)}
              className={`rounded-md border py-1 text-[11px] font-medium transition ${
                ratioFilter === ratio
                  ? 'border-cyan-500/60 bg-cyan-500/15 text-cyan-200'
                  : 'border-slate-800 bg-slate-950/50 text-slate-400 hover:text-slate-200'
              }`}
            >
              {ratio} ({ratioCounts[ratio]})
            </button>
          ))}
        </div>

        {statusMessage && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-950/40 px-2 py-1 text-[10px] font-medium text-emerald-300">
            {statusMessage}
          </div>
        )}
      </div>

      {/* 배경 목록 */}
      {filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 p-6 text-center">
          <Upload className="h-5 w-5 text-slate-500" />
          <p className="text-[11px] text-slate-400">
            {category === 'image' ? '이미지' : '영상'} ({ratioFilter}) 카테고리에 등록된 배경이
            없습니다.
          </p>
          <button
            type="button"
            onClick={() => void handleRegister()}
            className="rounded-lg border border-indigo-500/50 bg-indigo-500/15 px-3 py-1.5 text-[11px] font-semibold text-indigo-300 hover:bg-indigo-500/25"
          >
            + {category === 'image' ? '이미지' : '영상'} 등록하기
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredItems.map((item) => {
            const isEditing = editingId === item.id;
            return (
              <div
                key={item.id}
                className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/70 p-2 space-y-2"
              >
                <div className="flex gap-2.5">
                  {/* 썸네일 */}
                  <div
                    className={`relative shrink-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 ${
                      item.aspectRatio === '9:16' ? 'h-20 w-12' : 'h-16 w-28'
                    }`}
                  >
                    {item.mediaType === 'image' ? (
                      <img
                        src={item.url}
                        alt={item.name}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <video
                        src={item.url}
                        muted
                        playsInline
                        preload="metadata"
                        onMouseEnter={(e) => {
                          void e.currentTarget.play().catch(() => {});
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.pause();
                          e.currentTarget.currentTime = 0;
                        }}
                        className="h-full w-full object-cover"
                      />
                    )}
                    <span className="absolute bottom-1 left-1 rounded bg-slate-950/80 px-1 py-0.5 text-[9px] font-semibold text-slate-200">
                      {item.aspectRatio}
                    </span>
                  </div>

                  {/* 정보 & 이름 변경 */}
                  <div className="min-w-0 flex-1 flex flex-col justify-between">
                    <div>
                      <span
                        className={`inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                          item.isBuiltIn
                            ? 'bg-cyan-500/15 text-cyan-300'
                            : 'bg-indigo-500/20 text-indigo-300'
                        }`}
                      >
                        {item.isBuiltIn ? '기본 샘플' : '사용자 등록'}
                      </span>

                      {isEditing ? (
                        <div className="mt-1 flex items-center gap-1">
                          <input
                            type="text"
                            value={editingName}
                            autoFocus
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleCommitRename(item);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="min-w-0 flex-1 rounded border border-cyan-500/60 bg-slate-950 px-1.5 py-0.5 text-[11px] text-slate-100 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleCommitRename(item)}
                            className="rounded bg-cyan-500/20 p-1 text-cyan-300 hover:bg-cyan-500/30"
                            title="저장"
                          >
                            <Check className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded bg-slate-800 p-1 text-slate-400 hover:bg-slate-700"
                            title="취소"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ) : (
                        <p
                          className="mt-1 truncate text-[11px] font-semibold text-slate-100"
                          title={item.name}
                        >
                          {item.name}
                        </p>
                      )}
                    </div>

                    {/* 액션 버튼들 */}
                    <div className="mt-1.5 flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void onAddToTimeline(item)}
                        className="flex items-center gap-1 rounded-md bg-emerald-600/85 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-500"
                        title="타임라인에 배경 클립 추가"
                      >
                        타임라인에 올리기
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartRename(item)}
                        className="rounded-md border border-slate-700 bg-slate-800/80 p-1 text-slate-300 hover:bg-slate-700"
                        title="이름 변경"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        onClick={() => void handleSaveToPc(item)}
                        className="rounded-md border border-slate-700 bg-slate-800/80 p-1 text-slate-300 hover:bg-slate-700"
                        title="PC에 저장하기"
                      >
                        <Download className="h-3 w-3" />
                      </button>

                      <button
                        type="button"
                        disabled={item.isBuiltIn}
                        onClick={() => void handleDelete(item)}
                        className="rounded-md border border-slate-700 bg-slate-800/80 p-1 text-rose-300 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-35"
                        title={
                          item.isBuiltIn ? '기본 샘플은 삭제할 수 없습니다' : '목록에서 삭제'
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
