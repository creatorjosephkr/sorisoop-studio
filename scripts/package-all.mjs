import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const ffmpegStaticDir = path.join(rootDir, 'node_modules', 'ffmpeg-static');
const ffmpegCacheDir = path.join(rootDir, 'node_modules', '.cache', 'sorisoop-ffmpeg');

const KOREAN_APP_NAME = '소리숲 뮤직비디오 스튜디오';
const ASCII_APP_NAME = 'SoriSoop MV Studio';
const pkg = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));

const TARGETS = [
  {
    id: 'mac-arm64',
    platform: 'darwin',
    arch: 'arm64',
    binaryName: 'ffmpeg',
    macOutDir: 'mac-arm64',
    dmgName: `SoriSoop_MV_Studio_v${pkg.version}-Mac-arm64.dmg`,
    builderArgs: ['--mac', 'dir', '--arm64'],
  },
  {
    id: 'mac-intel',
    platform: 'darwin',
    arch: 'x64',
    binaryName: 'ffmpeg',
    macOutDir: 'mac',
    dmgName: `SoriSoop_MV_Studio_v${pkg.version}-Mac-intel.dmg`,
    builderArgs: ['--mac', 'dir', '--x64'],
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

function buildKoreanMacDmg(target) {
  const releaseDir = path.join(rootDir, 'release');
  const appOutDir = path.join(releaseDir, target.macOutDir);
  const srcApp = path.join(appOutDir, `${ASCII_APP_NAME}.app`);
  const stageDir = path.join(releaseDir, `.dmg-stage-${target.id}`);
  const bgDir = path.join(stageDir, '.background');
  const bgSrc = path.join(rootDir, 'build', 'mac', 'dmg-background.png');
  const destApp = path.join(stageDir, `${KOREAN_APP_NAME}.app`);
  const rwDmgPath = path.join(releaseDir, `.rw-${target.dmgName}`);
  const dmgPath = path.join(releaseDir, target.dmgName);

  fs.rmSync(stageDir, { recursive: true, force: true });
  fs.rmSync(rwDmgPath, { force: true });
  fs.rmSync(dmgPath, { force: true });

  fs.mkdirSync(bgDir, { recursive: true });
  fs.copyFileSync(bgSrc, path.join(bgDir, 'background.png'));
  run('cp', ['-R', srcApp, destApp]);
  fs.symlinkSync('/Applications', path.join(stageDir, 'Applications'));

  console.log(`\n[dmg] Creating styled ${target.dmgName} with ${KOREAN_APP_NAME}.app...`);
  run('hdiutil', [
    'create',
    '-volname',
    KOREAN_APP_NAME,
    '-srcfolder',
    stageDir,
    '-ov',
    '-format',
    'UDRW',
    rwDmgPath,
  ]);
  fs.rmSync(stageDir, { recursive: true, force: true });

  const attachResult = spawnSync(
    'hdiutil',
    ['attach', '-readwrite', '-noverify', '-noautoopen', rwDmgPath],
    { cwd: rootDir, encoding: 'utf8' }
  );
  if (attachResult.status !== 0) {
    throw new Error(`hdiutil attach failed: ${attachResult.stderr}`);
  }
  const mountMatch = attachResult.stdout.match(/(\/Volumes\/[^\n\r]+)/);
  const mountPoint = mountMatch ? mountMatch[1].trim() : `/Volumes/${KOREAN_APP_NAME}`;
  const diskName = path.basename(mountPoint);

  try {
    const appleScript = `
tell application "Finder"
  tell disk "${diskName}"
    open
    set current view of container window to icon view
    set toolbar visible of container window to false
    set statusbar visible of container window to false
    set the bounds of container window to {200, 120, 860, 548}
    set viewOptions to the icon view options of container window
    set arrangement of viewOptions to not arranged
    set icon size of viewOptions to 112
    set text size of viewOptions to 12
    set background picture of viewOptions to file ".background:background.png"
    set position of item "${KOREAN_APP_NAME}.app" of container window to {185, 188}
    set position of item "Applications" of container window to {475, 188}
    close
    open
    update without registering applications
    delay 2
    close
  end tell
end tell
`;
    const osa = spawnSync('osascript', ['-e', appleScript], { cwd: rootDir, encoding: 'utf8' });
    if (osa.status !== 0) {
      console.warn(`[dmg] osascript layout warning: ${osa.stderr}`);
    }
    run('sync', []);
  } finally {
    spawnSync('hdiutil', ['detach', mountPoint, '-force'], { cwd: rootDir });
  }

  run('hdiutil', [
    'convert',
    rwDmgPath,
    '-format',
    'UDZO',
    '-imagekey',
    'zlib-level=9',
    '-o',
    dmgPath,
  ]);
  fs.rmSync(rwDmgPath, { force: true });
}

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
      if (target.platform === 'darwin') {
        buildKoreanMacDmg(target);
      }
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
