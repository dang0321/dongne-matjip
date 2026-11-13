/**
 * 실행 파일 만들기: `npm run build:exe`
 * 지금 쓰고 있는 Node 실행 파일을 복사한 뒤 앱 코드와 화면 파일을 그 안에 넣는다
 * (Node의 single executable application 기능). 빌드한 운영체제용 파일이 나온다.
 */
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { inject } from 'postject';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, 'dist');
const WORK = path.join(DIST, 'work');
const PUBLIC_DIR = path.join(ROOT, 'public');
const exeName = process.platform === 'win32' ? 'dongne-matjip.exe' : 'dongne-matjip';
const exePath = path.join(DIST, exeName);
// Node가 내장 코드를 찾을 때 쓰는 고정 표식(Node 문서에 적힌 값)
const SEA_FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

await rm(DIST, { recursive: true, force: true });
await mkdir(WORK, { recursive: true });

// 1) 앱 코드를 파일 하나로 묶는다
const bundle = path.join(WORK, 'main.cjs');
await build({
  entryPoints: [path.join(ROOT, 'build', 'sea-main.js')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: `node${process.versions.node.split('.')[0]}`,
  logLevel: 'warning',
});

// 2) 묶은 코드와 화면 파일을 Node가 읽는 덩어리(blob)로 만든다
const assets = {};
for (const entry of await readdir(PUBLIC_DIR, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = path.join(entry.parentPath, entry.name);
  assets[path.relative(PUBLIC_DIR, file).replaceAll('\\', '/')] = file; // 예: lib/rank.js
}
const blob = path.join(WORK, 'app.blob');
const config = path.join(WORK, 'sea-config.json');
await writeFile(config, JSON.stringify({ main: bundle, output: blob, disableExperimentalSEAWarning: true, assets }));
execFileSync(process.execPath, ['--experimental-sea-config', config], { stdio: 'inherit' });

// 3) Node 실행 파일을 복사해 그 안에 덩어리를 넣는다
await copyFile(process.execPath, exePath);
await inject(exePath, 'NODE_SEA_BLOB', await readFile(blob), {
  sentinelFuse: SEA_FUSE,
  machoSegmentName: process.platform === 'darwin' ? 'NODE_SEA' : undefined,
});

await rm(WORK, { recursive: true, force: true });
const size = (await stat(exePath)).size / 1e6;
console.log(`만들었습니다: ${path.relative(ROOT, exePath)} (${size.toFixed(0)}MB, Node ${process.versions.node})`);
