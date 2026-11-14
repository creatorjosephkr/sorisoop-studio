import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { pathToFileURL } from 'url';
import { spawn, execFile, ChildProcessWithoutNullStreams } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

let mainWindow: BrowserWindow | null = null;

interface ActiveExport {
  process: ChildProcessWithoutNullStreams;
  outputPath: string;
  donePromise: Promise<{ outputPath: string }>;
  cancelled: boolean;
}

let activeExport: ActiveExport | null = null;

function resolveFfmpegPath(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffmpegStatic = require('ffmpeg-static') as string | null;
    if (ffmpegStatic) {
      const unpacked = ffmpegStatic.replace('app.asar', 'app.asar.unpacked');
      if (fs.existsSync(unpacked)) return unpacked;
      if (fs.existsSync(ffmpegStatic)) return ffmpegStatic;
    }
  } catch {
    // fallback to PATH
  }
  return 'ffmpeg';
}

interface HardwareEncoderInfo {
  codec: 'h264_videotoolbox' | 'h264_nvenc' | 'h264_amf' | 'h264_qsv' | 'h264_vaapi' | 'libx264';
  label: string;
  isHardware: boolean;
}

let cachedEncoderInfo: HardwareEncoderInfo | null = null;

async function probeEncoder(ffmpegPath: string, extraArgs: string[]): Promise<boolean> {
  try {
    await execFileAsync(
      ffmpegPath,
      [
        '-hide_banner',
        '-loglevel',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=256x256:d=0.04',
        '-frames:v',
        '1',
        ...extraArgs,
        '-f',
        'null',
        '-',
      ],
      { timeout: 4000 }
    );
    return true;
  } catch {
    return false;
  }
}

async function detectBestVideoEncoder(ffmpegPath: string): Promise<HardwareEncoderInfo> {
  if (cachedEncoderInfo) return cachedEncoderInfo;

  const candidates: Array<{ info: HardwareEncoderInfo; probeArgs: string[]; precheck?: () => boolean }> = [];

  if (process.platform === 'darwin') {
    candidates.push({
      info: {
        codec: 'h264_videotoolbox',
        label: 'Apple VideoToolbox (GPU 가속)',
        isHardware: true,
      },
      probeArgs: ['-c:v', 'h264_videotoolbox', '-b:v', '4M', '-pix_fmt', 'yuv420p'],
    });
  } else if (process.platform === 'win32') {
    candidates.push(
      {
        info: {
          codec: 'h264_nvenc',
          label: 'NVIDIA NVENC (GPU 가속)',
          isHardware: true,
        },
        probeArgs: ['-c:v', 'h264_nvenc', '-b:v', '4M', '-pix_fmt', 'yuv420p'],
      },
      {
        info: {
          codec: 'h264_amf',
          label: 'AMD AMF (GPU 가속)',
          isHardware: true,
        },
        probeArgs: ['-c:v', 'h264_amf', '-b:v', '4M', '-pix_fmt', 'yuv420p'],
      },
      {
        info: {
          codec: 'h264_qsv',
          label: 'Intel QuickSync (GPU 가속)',
          isHardware: true,
        },
        probeArgs: ['-c:v', 'h264_qsv', '-b:v', '4M', '-pix_fmt', 'nv12'],
      }
    );
  } else {
    candidates.push(
      {
        info: {
          codec: 'h264_nvenc',
          label: 'NVIDIA NVENC (GPU 가속)',
          isHardware: true,
        },
        probeArgs: ['-c:v', 'h264_nvenc', '-b:v', '4M', '-pix_fmt', 'yuv420p'],
      },
      {
        info: {
          codec: 'h264_qsv',
          label: 'Intel QuickSync (GPU 가속)',
          isHardware: true,
        },
        probeArgs: ['-c:v', 'h264_qsv', '-b:v', '4M', '-pix_fmt', 'nv12'],
      },
      {
        info: {
          codec: 'h264_vaapi',
          label: 'Linux VA-API (GPU 가속)',
          isHardware: true,
        },
        precheck: () => fs.existsSync('/dev/dri/renderD128'),
        probeArgs: [
          '-vaapi_device',
          '/dev/dri/renderD128',
          '-vf',
          'format=nv12,hwupload',
          '-c:v',
          'h264_vaapi',
          '-b:v',
          '4M',
        ],
      }
    );
  }

  for (const cand of candidates) {
    if (cand.precheck && !cand.precheck()) continue;
    const ok = await probeEncoder(ffmpegPath, cand.probeArgs);
    if (ok) {
      cachedEncoderInfo = cand.info;
      return cachedEncoderInfo;
    }
  }

  cachedEncoderInfo = {
    codec: 'libx264',
    label: 'CPU 소프트웨어 인코딩 (libx264)',
    isHardware: false,
  };
  return cachedEncoderInfo;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    title: '소리숲 뮤직비디오 스튜디오',
    width: 1760,
    height: 1020,
    minWidth: 1120,
    minHeight: 740,
    backgroundColor: '#020617',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: app.isPackaged,
    },
  });
  mainWindow.webContents.setAudioMuted(false);

  mainWindow.webContents.on('context-menu', (_event, params) => {
    if (params.isEditable) {
      const menu = Menu.buildFromTemplate([
        { label: '실행 취소', role: 'undo', enabled: params.editFlags.canUndo },
        { label: '다시 실행', role: 'redo', enabled: params.editFlags.canRedo },
        { type: 'separator' },
        { label: '잘라내기', role: 'cut', enabled: params.editFlags.canCut },
        { label: '복사', role: 'copy', enabled: params.editFlags.canCopy },
        { label: '붙여넣기', role: 'paste', enabled: params.editFlags.canPaste },
        { type: 'separator' },
        { label: '모두 선택', role: 'selectAll', enabled: params.editFlags.canSelectAll },
      ]);
      menu.popup({ window: mainWindow ?? undefined });
    } else if (params.selectionText.trim().length > 0) {
      const menu = Menu.buildFromTemplate([{ label: '복사', role: 'copy' }]);
      menu.popup({ window: mainWindow ?? undefined });
    }
  });

  if (process.env.VITE_DEV_SERVER_URL || !app.isPackaged) {
    const devUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    mainWindow.loadURL(devUrl).catch(() => {
      mainWindow?.loadFile(path.join(__dirname, '../dist/index.html'));
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

const GITHUB_REPO_URL = 'https://github.com/creatorjosephkr/sorisoop-studio';
const GITHUB_RELEASES_API =
  'https://api.github.com/repos/creatorjosephkr/sorisoop-studio/releases/latest';
const GITHUB_RELEASES_PAGE = `${GITHUB_REPO_URL}/releases/latest`;

interface UpdateCheckResult {
  status: 'update-available' | 'up-to-date' | 'error';
  currentVersion: string;
  latestVersion?: string;
  releaseName?: string;
  releaseNotes?: string;
  releaseUrl: string;
  downloadUrl?: string;
  publishedAt?: string;
  errorMessage?: string;
}

function normalizeVersion(raw: string): string {
  return raw.trim().replace(/^[vV]/, '').split('-')[0] || '0.0.0';
}

function compareVersions(a: string, b: string): number {
  const pa = normalizeVersion(a)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const pb = normalizeVersion(b)
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const va = pa[i] ?? 0;
    const vb = pb[i] ?? 0;
    if (va > vb) return 1;
    if (va < vb) return -1;
  }
  return 0;
}

async function checkForUpdates(): Promise<UpdateCheckResult> {
  const currentVersion = app.getVersion();
  try {
    const res = await fetch(GITHUB_RELEASES_API, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'SoriSoop-MV-Studio',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (res.status === 404) {
      return {
        status: 'up-to-date',
        currentVersion,
        latestVersion: currentVersion,
        releaseUrl: GITHUB_RELEASES_PAGE,
        errorMessage: 'GitHub 저장소에 아직 등록된 릴리즈가 없습니다.',
      };
    }

    if (!res.ok) {
      return {
        status: 'error',
        currentVersion,
        releaseUrl: GITHUB_RELEASES_PAGE,
        errorMessage: `GitHub 응답 오류 (HTTP ${res.status})`,
      };
    }

    const data = (await res.json()) as {
      tag_name?: string;
      name?: string;
      body?: string;
      html_url?: string;
      published_at?: string;
      assets?: Array<{ name?: string; browser_download_url?: string }>;
    };

    const tag = data.tag_name ?? '';
    const latestVersion = normalizeVersion(tag);
    const releaseUrl = data.html_url || GITHUB_RELEASES_PAGE;
    const assets = Array.isArray(data.assets) ? data.assets : [];
    const targetExt = process.platform === 'darwin' ? '.dmg' : '.exe';
    const matchedAsset =
      assets.find((a) => a.name?.toLowerCase().endsWith(targetExt)) ??
      assets.find((a) => a.name?.toLowerCase().endsWith('.zip'));

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return {
      status: hasUpdate ? 'update-available' : 'up-to-date',
      currentVersion,
      latestVersion,
      releaseName: data.name || (tag ? `Release ${tag}` : undefined),
      releaseNotes: data.body?.trim() || undefined,
      releaseUrl,
      downloadUrl: matchedAsset?.browser_download_url || releaseUrl,
      publishedAt: data.published_at,
    };
  } catch (err) {
    return {
      status: 'error',
      currentVersion,
      releaseUrl: GITHUB_RELEASES_PAGE,
      errorMessage:
        err instanceof Error ? err.message : '업데이트 서버에 연결하지 못했습니다.',
    };
  }
}

function buildApplicationMenu(): Menu {
  const isMac = process.platform === 'darwin';
  const appName = '소리숲 뮤직비디오 스튜디오';
  const repoUrl = 'https://github.com/creatorjosephkr/sorisoop-studio';
  const blogUrl = 'https://blog.naver.com/josephk1010';

  const infoAndLinksItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '사용방법',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          mainWindow.webContents.send('menu:open-guide');
        }
      },
    },
    {
      label: '업데이트 확인',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          mainWindow.webContents.send('menu:open-update');
        }
      },
    },
    {
      label: '개인정보처리방침',
      click: () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
          if (mainWindow.isMinimized()) mainWindow.restore();
          mainWindow.focus();
          mainWindow.webContents.send('menu:open-privacy');
        }
      },
    },
    { type: 'separator' },
    {
      label: '저장소 보기',
      click: () => {
        void shell.openExternal(repoUrl);
      },
    },
    {
      label: '개발자 블로그 보기',
      click: () => {
        void shell.openExternal(blogUrl);
      },
    },
  ];

  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: appName,
            submenu: [
              { label: `${appName} 정보`, role: 'about' as const },
              { type: 'separator' as const },
              ...infoAndLinksItems,
              { type: 'separator' as const },
              { label: `${appName} 숨기기`, role: 'hide' as const },
              { label: '모두 보기', role: 'unhide' as const },
              { type: 'separator' as const },
              { label: '종료', role: 'quit' as const },
            ],
          },
        ]
      : []),
    {
      label: '편집',
      submenu: [
        { label: '실행 취소', role: 'undo' as const },
        { label: '다시 실행', role: 'redo' as const },
        { type: 'separator' as const },
        { label: '잘라내기', role: 'cut' as const },
        { label: '복사', role: 'copy' as const },
        { label: '붙여넣기', role: 'paste' as const },
        { label: '모두 선택', role: 'selectAll' as const },
      ],
    },
    {
      label: '창',
      submenu: [
        { label: '최소화', role: 'minimize' as const },
        { label: '전체 화면', role: 'togglefullscreen' as const },
      ],
    },
    ...(!isMac
      ? [
          {
            label: '정보',
            submenu: [
              {
                label: `${appName} 정보`,
                click: () => {
                  const opts: Electron.MessageBoxOptions = {
                    type: 'info',
                    title: `${appName} 정보`,
                    message: `${appName} v${app.getVersion()}`,
                    detail:
                      '모든 사람이 모든 곳에서 무료로 사용하세요\nCopyright © 2026 크리에이터요셉  jospeh@kakao.com',
                    buttons: ['확인'],
                  };
                  if (mainWindow) {
                    void dialog.showMessageBox(mainWindow, opts);
                  } else {
                    void dialog.showMessageBox(opts);
                  }
                },
              },
              { type: 'separator' as const },
              ...infoAndLinksItems,
              { type: 'separator' as const },
              { label: '종료', role: 'quit' as const },
            ],
          },
        ]
      : []),
  ];

  return Menu.buildFromTemplate(template);
}

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// macOS(특히 인텔 맥)에서 샌드박스 오디오 서비스 프로세스가 CoreAudio 출력을 차단해 무음이 되는 현상 방지
app.commandLine.appendSwitch(
  'disable-features',
  'AudioServiceOutOfProcess,AudioServiceSandbox'
);

app.whenReady().then(() => {
  nativeTheme.themeSource = 'dark';
  app.setAboutPanelOptions({
    applicationName: '소리숲 뮤직비디오 스튜디오',
    applicationVersion: app.getVersion(),
    credits: '모든 사람이 모든 곳에서 무료로 사용하세요',
    copyright: 'Copyright © 2026 크리에이터요셉  jospeh@kakao.com',
  });
  Menu.setApplicationMenu(buildApplicationMenu());
  createWindow();

  // 앱 시작 시 백그라운드로 GitHub Releases 버전 확인 (새 버전 있을 때만 알림)
  if (mainWindow) {
    const win = mainWindow;
    win.webContents.once('did-finish-load', () => {
      setTimeout(() => {
        void checkForUpdates().then((res) => {
          if (res.status === 'update-available' && !win.isDestroyed()) {
            win.webContents.send('menu:open-update', res);
          }
        });
      }, 2000);
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (activeExport) {
    activeExport.cancelled = true;
    activeExport.process.kill('SIGKILL');
    activeExport = null;
  }
  app.quit();
});

app.on('before-quit', () => {
  if (activeExport) {
    activeExport.cancelled = true;
    activeExport.process.kill('SIGKILL');
    activeExport = null;
  }
});

ipcMain.handle('app:info', () => ({
  platform: process.platform,
  version: app.getVersion(),
  ffmpegPath: resolveFfmpegPath(),
  modelsDir: path.join(app.getPath('userData'), 'whisper-models'),
}));

ipcMain.handle('app:set-theme', (_event, theme: string) => {
  const isLight = theme === 'light-gray' || theme === 'white';
  nativeTheme.themeSource = isLight ? 'light' : 'dark';
  const bgMap: Record<string, string> = {
    default: '#020617',
    'dark-gray': '#111113',
    'light-gray': '#eaedf1',
    white: '#ffffff',
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(bgMap[theme] ?? '#020617');
  }
  if (process.platform === 'win32') {
    Menu.setApplicationMenu(buildApplicationMenu());
  }
});

ipcMain.handle('dialog:open-audio', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '노래 음원 파일 선택',
    properties: ['openFile'],
    filters: [
      { name: 'Audio Files', extensions: ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg'] },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const buffer = await fs.promises.readFile(filePath);
  return {
    filePath,
    name: path.basename(filePath),
    data: new Uint8Array(buffer),
  };
});

ipcMain.handle('file:read-audio', async (_event, filePath: string) => {
  if (!filePath || !fs.existsSync(filePath)) return null;
  const buffer = await fs.promises.readFile(filePath);
  return {
    filePath,
    name: path.basename(filePath),
    data: new Uint8Array(buffer),
  };
});

ipcMain.handle('dialog:open-background', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '배경 이미지 또는 영상 선택',
    properties: ['openFile'],
    filters: [
      {
        name: 'Media Files',
        extensions: ['png', 'jpg', 'jpeg', 'webp', 'mp4', 'mov', 'webm', 'mkv'],
      },
    ],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const ext = path.extname(filePath).toLowerCase();
  const isVideo = ['.mp4', '.mov', '.webm', '.mkv'].includes(ext);
  return {
    filePath,
    name: path.basename(filePath),
    mediaType: isVideo ? 'video' : 'image',
    fileUrl: pathToFileURL(filePath).toString(),
  };
});

ipcMain.handle('dialog:open-project', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '프로젝트 파일 열기',
    properties: ['openFile'],
    filters: [{ name: 'SoriSoop Project', extensions: ['ssproj', 'json'] }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  const filePath = result.filePaths[0];
  const content = await fs.promises.readFile(filePath, 'utf-8');
  return {
    filePath,
    name: path.basename(filePath),
    content,
  };
});

ipcMain.handle(
  'file:save-text-to-path',
  async (_event, { filePath, content }: { filePath: string; content: string }) => {
    if (!filePath) return null;
    await fs.promises.writeFile(filePath, content, 'utf-8');
    return filePath;
  }
);

ipcMain.handle(
  'dialog:save-text',
  async (
    _event,
    {
      defaultName,
      content,
      extName,
      ext,
    }: { defaultName: string; content: string; extName: string; ext: string }
  ) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName,
      filters: [{ name: extName, extensions: [ext] }],
    });
    if (result.canceled || !result.filePath) return null;
    await fs.promises.writeFile(result.filePath, content, 'utf-8');
    return result.filePath;
  }
);

ipcMain.handle('export:get-encoder-info', async () => {
  const ffmpegPath = resolveFfmpegPath();
  return detectBestVideoEncoder(ffmpegPath);
});

ipcMain.handle(
  'export:start',
  async (
    _event,
    {
      width,
      height,
      fps,
      audioPath,
      defaultFileName,
      format = 'mp4',
    }: {
      width: number;
      height: number;
      fps: number;
      audioPath: string;
      defaultFileName: string;
      format?: 'mp4' | 'mov_alpha';
    }
  ) => {
    if (!mainWindow) return null;

    const isMovAlpha = format === 'mov_alpha';
    const saveRes = await dialog.showSaveDialog(mainWindow, {
      title: isMovAlpha ? '투명 배경 자막 영상(MOV) 내보내기' : '뮤직비디오 MP4 내보내기',
      defaultPath: defaultFileName,
      filters: isMovAlpha
        ? [{ name: 'QuickTime MOV (투명 배경 ProRes 4444)', extensions: ['mov'] }]
        : [{ name: 'MP4 Video (H.264)', extensions: ['mp4'] }],
    });

    if (saveRes.canceled || !saveRes.filePath) return null;
    const outputPath = saveRes.filePath;
    const ffmpegPath = resolveFfmpegPath();

    const args = [
      '-y',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${width}x${height}`,
      '-r',
      String(fps),
      '-i',
      'pipe:0',
    ];

    if (audioPath && fs.existsSync(audioPath)) {
      args.push('-i', audioPath);
    }

    const appVersion = app.getVersion();
    const appTitle = `소리숲 뮤직비디오 스튜디오 (SoriSoop MV Studio) v${appVersion}`;
    const appAuthor = '크리에이터요셉 (creatorjosephkr)';
    const metadataArgs = [
      '-metadata',
      `encoding_tool=${appTitle}`,
      '-metadata',
      `software=${appTitle}`,
      '-metadata',
      `com.apple.quicktime.software=${appTitle}`,
      '-metadata',
      `artist=${appAuthor}`,
      '-metadata',
      `author=${appAuthor}`,
      '-metadata',
      `com.apple.quicktime.author=${appAuthor}`,
      '-metadata',
      `copyright=Copyright © 2026 ${appAuthor}`,
      '-metadata',
      `comment=Created with ${appTitle} by ${appAuthor}`,
    ];

    if (isMovAlpha) {
      args.push('-c:v', 'prores_ks', '-profile:v', '4444', '-pix_fmt', 'yuva444p10le');
      if (audioPath && fs.existsSync(audioPath)) {
        args.push('-c:a', 'pcm_s16le', '-shortest');
      }
      args.push(...metadataArgs, '-movflags', 'use_metadata_tags', outputPath);
    } else {
      const encoder = await detectBestVideoEncoder(ffmpegPath);
      const targetBitrate = height >= 1080 ? '14M' : '8M';
      if (encoder.codec === 'h264_videotoolbox') {
        args.push('-c:v', 'h264_videotoolbox', '-b:v', targetBitrate, '-pix_fmt', 'yuv420p');
      } else if (encoder.codec === 'h264_nvenc') {
        args.push('-c:v', 'h264_nvenc', '-b:v', targetBitrate, '-pix_fmt', 'yuv420p');
      } else if (encoder.codec === 'h264_amf') {
        args.push('-c:v', 'h264_amf', '-b:v', targetBitrate, '-pix_fmt', 'yuv420p');
      } else if (encoder.codec === 'h264_qsv') {
        args.push('-c:v', 'h264_qsv', '-b:v', targetBitrate, '-pix_fmt', 'nv12');
      } else if (encoder.codec === 'h264_vaapi') {
        args.push(
          '-vaapi_device',
          '/dev/dri/renderD128',
          '-vf',
          'format=nv12,hwupload',
          '-c:v',
          'h264_vaapi',
          '-b:v',
          targetBitrate
        );
      } else {
        args.push('-c:v', 'libx264', '-preset', 'fast', '-crf', '18', '-pix_fmt', 'yuv420p');
      }
      if (audioPath && fs.existsSync(audioPath)) {
        args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
      }
      args.push(...metadataArgs, '-movflags', '+faststart+use_metadata_tags', outputPath);
    }

    const proc = spawn(ffmpegPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    proc.stdin.on('error', () => {
      // 취소 또는 조기 종료 시 발생하는 EPIPE / ERR_STREAM_DESTROYED 예외로 메인 프로세스가 죽지 않도록 방지
    });
    let stderrLog = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrLog += chunk.toString();
      if (stderrLog.length > 8000) stderrLog = stderrLog.slice(-4000);
    });

    const donePromise = new Promise<{ outputPath: string }>((resolve, reject) => {
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (activeExport?.cancelled) {
          reject(new Error('사용자가 내보내기를 취소했습니다.'));
        } else if (code === 0) {
          resolve({ outputPath });
        } else {
          reject(new Error(`FFmpeg 종료 코드 ${code}: ${stderrLog.slice(-600)}`));
        }
      });
    });

    activeExport = { process: proc, outputPath, donePromise, cancelled: false };
    return { outputPath };
  }
);

ipcMain.handle('export:frame', async (_event, rgbaBytes: Uint8Array) => {
  const current = activeExport;
  if (!current || current.cancelled) {
    throw new Error('사용자가 내보내기를 취소했습니다.');
  }
  const stdin = current.process.stdin;
  if (stdin.destroyed || !stdin.writable) {
    throw new Error('사용자가 내보내기를 취소했습니다.');
  }
  const buf = Buffer.from(rgbaBytes.buffer, rgbaBytes.byteOffset, rgbaBytes.byteLength);
  const canContinue = stdin.write(buf);
  if (!canContinue) {
    await new Promise<void>((resolve) => {
      const cleanup = () => {
        stdin.off('drain', onDone);
        stdin.off('close', onDone);
        stdin.off('error', onDone);
      };
      const onDone = () => {
        cleanup();
        resolve();
      };
      stdin.once('drain', onDone);
      stdin.once('close', onDone);
      stdin.once('error', onDone);
    });
  }
});

ipcMain.handle('export:finish', async () => {
  if (!activeExport) throw new Error('진행 중인 내보내기가 없습니다.');
  const current = activeExport;
  if (!current.process.stdin.destroyed && current.process.stdin.writable) {
    current.process.stdin.end();
  }
  try {
    return await current.donePromise;
  } finally {
    if (activeExport === current) activeExport = null;
  }
});

ipcMain.handle('export:cancel', async () => {
  const current = activeExport;
  if (!current) return;
  current.cancelled = true;
  activeExport = null;
  try {
    current.process.stdin.destroy();
  } catch {
    // ignore
  }
  try {
    current.process.kill('SIGKILL');
  } catch {
    // ignore
  }
});

ipcMain.handle('shell:show-item', (_event, filePath: string) => {
  shell.showItemInFolder(filePath);
});

ipcMain.handle('shell:open-external', (_event, url: string) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
  return Promise.resolve();
});

ipcMain.handle('app:check-update', () => {
  return checkForUpdates();
});
