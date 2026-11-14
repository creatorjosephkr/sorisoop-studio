import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const ffmpegStaticDir = path.join(rootDir, 'node_modules', 'ffmpeg-static');
const ffmpegCacheDir = path.join(rootDir, 'node_modules', '.cache', 'sorisoop-ffmpeg');

const TARGETS = [
  {
    id: 'mac-arm64',
    platform: 'darwin',
    arch: 'arm64',
    binaryName: 'ffmpeg',
    builderArgs: [
      '--mac',
      'dmg',
      '--arm64',
      '-c.mac.artifactName=SoriSoop_MV_Studio_v${version}-Mac-arm64.${ext}',
    ],
  },
  {
    id: 'mac-intel',
    platform: 'darwin',
    arch: 'x64',
    binaryName: 'ffmpeg',
    builderArgs: [
      '--mac',
      'dmg',
      '--x64',
      '-c.mac.artifactName=SoriSoop_MV_Studio_v${version}-Mac-intel.${ext}',
    ],
  },
  {
    id: 'windows',
    platform: 'win32',
    arch: 'x64',
    binaryName: 'ffmpeg.exe',
    builderArgs: [
      '--win',
      'nsis',
      '--x64',
      '-c.win.artifactName=SoriSoop_MV_Studio_v${version}-Windows.${ext}',
    ],
  },
];

function run(cmd, args, extraEnv = {}) {
  const result = spawnSync(cmd, args, {
    cwd: rootDir,
    stdio: 'inherit',
    env: { ...process.env, ...extraEnv },
  });
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${cmd} ${args.join(' ')}`);
  }
}

function clearFfmpegBinaries() {
  for (const name of ['ffmpeg', 'ffmpeg.exe']) {
    const p = path.join(ffmpegStaticDir, name);
    if (fs.existsSync(p)) {
      fs.rmSync(p, { force: true });
    }
  }
}

function getCachedBinaryPath(platform, arch, binaryName) {
  return path.join(ffmpegCacheDir, `${platform}-${arch}`, binaryName);
}

function seedHostBinaryToCache() {
  const hostBinaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
  const existing = path.join(ffmpegStaticDir, hostBinaryName);
  const cached = getCachedBinaryPath(process.platform, process.arch, hostBinaryName);
  if (fs.existsSync(existing) && !fs.existsSync(cached)) {
    fs.mkdirSync(path.dirname(cached), { recursive: true });
    fs.copyFileSync(existing, cached);
  }
}

function ensureFfmpegCached(platform, arch, binaryName) {
  const cached = getCachedBinaryPath(platform, arch, binaryName);
  if (fs.existsSync(cached)) {
    return cached;
  }

  console.log(`\n[ffmpeg] Downloading ${platform}-${arch} (${binaryName})...`);
  clearFfmpegBinaries();
  run(process.execPath, [path.join(ffmpegStaticDir, 'install.js')], {
    npm_config_platform: platform,
    npm_config_arch: arch,
  });

  const downloaded = path.join(ffmpegStaticDir, binaryName);
  if (!fs.existsSync(downloaded)) {
    throw new Error(`Expected ffmpeg binary not found at ${downloaded}`);
  }

  fs.mkdirSync(path.dirname(cached), { recursive: true });
  fs.copyFileSync(downloaded, cached);
  return cached;
}

function activateFfmpegBinary(platform, arch, binaryName) {
  const cached = getCachedBinaryPath(platform, arch, binaryName);
  clearFfmpegBinaries();
  const dest = path.join(ffmpegStaticDir, binaryName);
  fs.copyFileSync(cached, dest);
  if (platform !== 'win32') {
    fs.chmodSync(dest, 0o755);
  }
}

function main() {
  if (!fs.existsSync(ffmpegStaticDir)) {
    throw new Error('node_modules/ffmpeg-static is missing. Run npm install first.');
  }

  console.log('[1/4] Building app (TypeScript + Vite + Electron)...');
  run('npm', ['run', 'build']);

  seedHostBinaryToCache();
  for (const target of TARGETS) {
    ensureFfmpegCached(target.platform, target.arch, target.binaryName);
  }

  const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const electronBuilderBin = path.join(
    rootDir,
    'node_modules',
    '.bin',
    process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'
  );
  const builderCmd = fs.existsSync(electronBuilderBin) ? electronBuilderBin : npxCmd;

  try {
    TARGETS.forEach((target, idx) => {
      console.log(`\n[${idx + 2}/4] Packaging ${target.id} (${target.platform}-${target.arch})...`);
      activateFfmpegBinary(target.platform, target.arch, target.binaryName);
      const args = builderCmd === npxCmd ? ['electron-builder', ...target.builderArgs] : target.builderArgs;
      run(builderCmd, args);
    });
  } finally {
    const hostBinaryName = process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg';
    const hostCached = getCachedBinaryPath(process.platform, process.arch, hostBinaryName);
    if (fs.existsSync(hostCached)) {
      activateFfmpegBinary(process.platform, process.arch, hostBinaryName);
    }
  }

  const releaseDir = path.join(rootDir, 'release');
  console.log(`\nDone! Build artifacts in ${releaseDir}:`);
  for (const file of fs.readdirSync(releaseDir)) {
    if (file.endsWith('.dmg') || file.endsWith('.exe')) {
      console.log(` - ${file}`);
    }
  }
}

main();
