import { contextBridge, ipcRenderer } from 'electron';

export interface OpenedAudioFile {
  filePath: string;
  name: string;
  data: Uint8Array;
}

export interface OpenedBackgroundFile {
  filePath: string;
  name: string;
  mediaType: 'image' | 'video';
  fileUrl: string;
}

export interface WhisperChunk {
  text: string;
  timestamp: [number, number | null];
}

export interface WhisperResult {
  text: string;
  chunks: WhisperChunk[];
}

export interface VideoExportStartOptions {
  width: number;
  height: number;
  fps: number;
  audioPath: string;
  defaultFileName: string;
  format?: 'mp4' | 'mov_alpha';
}

contextBridge.exposeInMainWorld('electronAPI', {
  getAppInfo: () => ipcRenderer.invoke('app:info'),
  openAudioFile: (): Promise<OpenedAudioFile | null> =>
    ipcRenderer.invoke('dialog:open-audio'),
  readAudioFileByPath: (filePath: string): Promise<OpenedAudioFile | null> =>
    ipcRenderer.invoke('file:read-audio', filePath),
  openBackgroundFile: (): Promise<OpenedBackgroundFile | null> =>
    ipcRenderer.invoke('dialog:open-background'),
  openProjectFile: (): Promise<{ filePath: string; name: string; content: string } | null> =>
    ipcRenderer.invoke('dialog:open-project'),
  saveTextFileToPath: (filePath: string, content: string): Promise<string | null> =>
    ipcRenderer.invoke('file:save-text-to-path', { filePath, content }),
  saveTextFile: (
    defaultName: string,
    content: string,
    extName: string,
    ext: string
  ): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-text', { defaultName, content, extName, ext }),
  saveImageFile: (
    defaultName: string,
    pngDataUrl: string,
    jpegDataUrl: string
  ): Promise<string | null> =>
    ipcRenderer.invoke('dialog:save-image', { defaultName, pngDataUrl, jpegDataUrl }),
  getPicturesDir: (): Promise<string> => ipcRenderer.invoke('app:get-pictures-dir'),
  pickFolder: (defaultPath?: string): Promise<string | null> =>
    ipcRenderer.invoke('dialog:pick-folder', defaultPath),
  saveImageToPath: (options: {
    folderPath: string;
    fileName: string;
    format: 'png' | 'jpg';
    dataUrl: string;
  }): Promise<string> => ipcRenderer.invoke('file:save-image-to-path', options),

  transcribeWhisper: (
    pcm16k: Float32Array,
    modelId: string,
    language: string
  ): Promise<WhisperResult> =>
    ipcRenderer.invoke('whisper:transcribe', { pcm16k, modelId, language }),

  onWhisperProgress: (
    callback: (payload: { status: string; progress?: number; message: string }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { status: string; progress?: number; message: string }
    ) => callback(payload);
    ipcRenderer.on('whisper:progress', listener);
    return () => ipcRenderer.removeListener('whisper:progress', listener);
  },

  getVideoEncoderInfo: (): Promise<{ codec: string; label: string; isHardware: boolean }> =>
    ipcRenderer.invoke('export:get-encoder-info'),
  startVideoExport: (options: VideoExportStartOptions): Promise<{ outputPath: string } | null> =>
    ipcRenderer.invoke('export:start', options),
  writeVideoFrame: (rgbaBytes: Uint8Array): Promise<void> =>
    ipcRenderer.invoke('export:frame', rgbaBytes),
  finishVideoExport: (): Promise<{ outputPath: string }> =>
    ipcRenderer.invoke('export:finish'),
  cancelVideoExport: (): Promise<void> =>
    ipcRenderer.invoke('export:cancel'),
  showItemInFolder: (filePath: string): Promise<void> =>
    ipcRenderer.invoke('shell:show-item', filePath),
  openExternalUrl: (url: string): Promise<void> =>
    ipcRenderer.invoke('shell:open-external', url),
  checkAppUpdate: () => ipcRenderer.invoke('app:check-update'),
  setAppTheme: (theme: string): Promise<void> => ipcRenderer.invoke('app:set-theme', theme),
  setUnsavedChanges: (dirty: boolean): void =>
    ipcRenderer.send('app:set-unsaved-changes', dirty),
  confirmWindowClose: (): Promise<void> => ipcRenderer.invoke('app:confirm-close'),
  onRequestClose: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('app:request-close', listener);
    return () => ipcRenderer.removeListener('app:request-close', listener);
  },
  onOpenPrivacyPolicy: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('menu:open-privacy', listener);
    return () => ipcRenderer.removeListener('menu:open-privacy', listener);
  },
  onOpenUserGuide: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('menu:open-guide', listener);
    return () => ipcRenderer.removeListener('menu:open-guide', listener);
  },
  onOpenUpdateModal: (callback: (prefetched?: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, prefetched?: unknown) =>
      callback(prefetched);
    ipcRenderer.on('menu:open-update', listener);
    return () => ipcRenderer.removeListener('menu:open-update', listener);
  },
});
