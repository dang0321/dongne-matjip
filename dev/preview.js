/**
 * 네이버 키 없이 화면만 확인하는 미리보기 서버.
 * 가짜 네이버 서버를 띄우고 앱을 거기에 연결한다. 실제 .env는 건드리지 않는다.
 */
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server.js';
import { createMockNaver, listen, TEST_KEYS } from './mock-naver.js';

const port = Number(process.env.PORT) || 3211;
const mockPort = await listen(createMockNaver());
const app = await createApp({
  credentials: { ...TEST_KEYS, provider: 'hub' },
  baseUrl: `http://127.0.0.1:${mockPort}`,
  envFile: path.join(os.tmpdir(), 'dongne-matjip-preview.env'),
  notice: '연습용 화면입니다. 여기 나오는 식당과 리뷰는 모두 지어낸 것입니다.',
});
await listen(app, port);
console.log(`미리보기: http://localhost:${port}`);
