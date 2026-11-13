/**
 * 실행 파일(exe)의 시작점. build/build.mjs가 이 파일을 하나로 묶어 Node와 합친다.
 * 화면 파일은 exe 안에 들어 있고, 네이버 키는 사용자 폴더에 저장한다
 * (exe를 다른 사람에게 건네도 키가 따라가지 않게 하려는 것).
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getAsset } from 'node:sea';
import { createApp } from '../src/app.js';

const FIRST_PORT = Number(process.env.PORT) || 3210;
const PORT_TRIES = 10;

function readAsset(relative) {
  try {
    return Buffer.from(getAsset(relative));
  } catch {
    return null; // exe에 들어 있지 않은 파일
  }
}

function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError);
      resolve();
    });
  });
}

function openBrowser(url) {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true })
      .on('error', () => {})
      .unref();
  } catch {
    // 브라우저를 못 열어도 주소는 화면에 적혀 있다
  }
}

async function main() {
  const dataDir = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'dongne-matjip');
  await mkdir(dataDir, { recursive: true });
  const server = await createApp({ envFile: path.join(dataDir, '.env'), readAsset });

  let port = FIRST_PORT;
  for (let attempt = 0; ; attempt += 1) {
    try {
      await listen(server, port);
      break;
    } catch (error) {
      if (error.code !== 'EADDRINUSE' || attempt >= PORT_TRIES - 1) throw error;
      port += 1; // 이미 쓰는 포트면 다음 번호로
    }
  }

  const url = `http://localhost:${port}`;
  console.log('');
  console.log('  동네 맛집 순위가 켜졌습니다.');
  console.log(`  브라우저에서 ${url} 을 엽니다. 열리지 않으면 주소를 직접 입력하세요.`);
  console.log('');
  console.log('  끝내려면 이 창을 닫으세요.');
  console.log(`  네이버 키는 ${path.join(dataDir, '.env')} 에 저장됩니다.`);
  if (!process.env.MATJIP_NO_BROWSER) openBrowser(url);
}

main().catch((error) => {
  console.error('');
  console.error('  프로그램을 시작하지 못했습니다.');
  console.error(`  ${error.message}`);
  console.error('');
  console.error('  30초 뒤 창이 닫힙니다.');
  setTimeout(() => process.exit(1), 30_000);
});
