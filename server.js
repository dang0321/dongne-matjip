/** 소스에서 바로 실행할 때의 시작점: `node server.js` */
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApp as createBaseApp, diskAssets, parseEnv } from './src/app.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

export { parseEnv };

/** 이 폴더의 .env와 public/을 쓰는 앱을 만든다. 옵션은 src/app.js의 createApp과 같다. */
export function createApp(options = {}) {
  return createBaseApp({
    envFile: path.join(ROOT, '.env'),
    readAsset: diskAssets(path.join(ROOT, 'public')),
    ...options,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 3210;
  const server = await createApp();
  server.listen(port, '127.0.0.1', () => {
    console.log(`동네 맛집 순위가 켜졌습니다: http://localhost:${port}`);
  });
}
