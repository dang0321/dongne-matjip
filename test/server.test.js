import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { createMockNaver, LEGACY_TEST_KEYS, listen, TEST_KEYS } from '../dev/mock-naver.js';
import { rank, readReviewItem } from '../public/lib/rank.js';
import { createApp, parseEnv } from '../server.js';

let mock;
let mockUrl;
let tmp;
const servers = [];

before(async () => {
  mock = createMockNaver();
  mockUrl = `http://127.0.0.1:${await listen(mock)}`;
  tmp = await mkdtemp(path.join(os.tmpdir(), 'matjip-test-'));
});

after(async () => {
  for (const server of [mock, ...servers]) {
    server.closeAllConnections();
    server.close();
  }
  await rm(tmp, { recursive: true, force: true });
});

async function start(options = {}) {
  const app = await createApp({
    baseUrl: mockUrl,
    envFile: path.join(tmp, `${servers.length}.env`),
    clientOptions: { minIntervalMs: 0, backoffMs: 1 },
    ...options,
  });
  servers.push(app);
  return `http://127.0.0.1:${await listen(app)}`;
}

const get = async (url) => {
  const response = await fetch(url);
  return { status: response.status, body: await response.json() };
};

/** 화면이 하는 것과 같은 순서로 검색한다: 후보 → 리뷰 묶음들 → 점수 계산. */
async function search(base, params) {
  const query = new URLSearchParams(params).toString();
  const found = await get(`${base}/api/discover?${query}`);
  if (found.status !== 200) return { failure: found };
  const batches = Math.ceil(found.body.places.length / found.body.batchSize);
  const parts = [];
  for (let batch = 0; batch < batches; batch += 1) {
    const part = await get(`${base}/api/reviews?${query}&batch=${batch}`);
    if (part.status !== 200) return { failure: part };
    parts.push(part.body);
  }
  const reviews = parts.flatMap((part) => part.items).map(readReviewItem);
  return { found: found.body, reviews, ...rank(found.body.places, reviews) };
}

test('키가 없으면 설정이 필요하다고 알린다', async () => {
  const base = await start({ credentials: null });
  assert.deepEqual((await get(`${base}/api/status`)).body, {
    configured: false,
    provider: null,
    managed: false,
    notice: '',
  });
  const { failure } = await search(base, { sido: '서울특별시' });
  assert.deepEqual([failure.status, failure.body.kind], [503, 'setup']);
});

test('지역을 고르면 후보와 리뷰를 주고, 그것으로 점수순 목록이 나온다', async () => {
  const base = await start({ credentials: TEST_KEYS });
  const params = { sido: '서울특별시', sigungu: '성동구', detail: '성수동' };
  const { found, reviews, places, postsRead } = await search(base, params);

  assert.equal(found.area, '서울 성동구 성수동');
  assert.equal(found.batchSize, 5);
  assert.equal(reviews.length, found.places.length);
  assert.ok(postsRead > 100);

  const scores = places.map((place) => place.score);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a), '점수 내림차순');
  assert.ok(scores[0] > scores.at(-1));

  const names = places.map((place) => place.name);
  assert.equal(new Set(names).size, names.length, '같은 식당이 두 번 나오지 않는다');
  assert.ok(!names.includes('숲속 게스트하우스'), '식당이 아닌 곳은 뺀다');
  assert.ok(names.every((name) => !name.includes('<')), '태그가 남지 않는다');

  const top = places[0];
  assert.ok(top.reviews.samples.length > 0);
  assert.match(top.mapUrl, /^https:\/\/map\.naver\.com\/p\/search\//);
  assert.ok(top.reasons.some((reason) => reason.text.startsWith('블로그 리뷰 약')));
  assert.ok(places.some((place) => place.reasons.some((reason) => reason.tone === 'warn')));
});

test('한 요청이 네이버를 50번 넘게 부르지 않고, 같은 검색은 저장한 결과를 쓴다', async () => {
  // 네이버로 가는 요청 수를 세는 대리 서버
  let calls = 0;
  const proxy = http.createServer((req, res) => {
    calls += 1;
    http.get(`${mockUrl}${req.url}`, { headers: req.headers }, (upstream) => {
      res.writeHead(upstream.statusCode, upstream.headers);
      upstream.pipe(res);
    });
  });
  servers.push(proxy);
  const base = await start({ credentials: TEST_KEYS, baseUrl: `http://127.0.0.1:${await listen(proxy)}` });
  const query = new URLSearchParams({ sido: '서울특별시', sigungu: '성동구' }).toString();

  // 키가 어느 창구 것인지 알아내는 호출(첫 요청에만 든다)을 먼저 치른다
  await get(`${base}/api/discover?${new URLSearchParams({ detail: '연남동', category: 'snack' })}`);

  calls = 0;
  const found = await get(`${base}/api/discover?${query}`);
  assert.ok(calls > 0 && calls <= 50, `후보 모으기 ${calls}회`);

  calls = 0;
  const first = await get(`${base}/api/reviews?${query}&batch=0`);
  assert.equal(first.body.items.length, 5);
  assert.ok(calls > 0 && calls <= 50, `리뷰 한 묶음 ${calls}회`);

  calls = 0;
  assert.deepEqual((await get(`${base}/api/discover?${query}`)).body, found.body);
  assert.deepEqual((await get(`${base}/api/reviews?${query}&batch=0`)).body, first.body);
  assert.equal(calls, 0, '저장한 결과를 쓰면 네이버를 부르지 않는다');
});

test('리뷰는 먼저 모아 둔 후보에 대해서만 가져온다', async () => {
  const base = await start({ credentials: TEST_KEYS });
  const query = new URLSearchParams({ sido: '서울특별시', sigungu: '성동구' }).toString();
  const early = await get(`${base}/api/reviews?${query}&batch=0`);
  assert.deepEqual([early.status, early.body.kind], [409, 'expired']);

  await get(`${base}/api/discover?${query}`);
  assert.equal((await get(`${base}/api/reviews?${query}&batch=99`)).status, 400);
  assert.equal((await get(`${base}/api/reviews?${query}&batch=-1`)).status, 400);
  assert.equal((await get(`${base}/api/reviews?${query}&batch=x`)).status, 400);
});

test('주소가 지역과 맞는 후보가 거의 없으면 필터를 풀어 준다', async () => {
  const base = await start({ credentials: TEST_KEYS });
  const { found, places } = await search(base, { sido: '부산광역시', sigungu: '해운대구', category: 'meat' });
  assert.equal(found.category, '고기');
  assert.ok(places.length > 0);
});

test('지역을 고르지 않으면 입력 오류로 답한다', async () => {
  const base = await start({ credentials: TEST_KEYS });
  const { failure } = await search(base, {});
  assert.deepEqual([failure.status, failure.body.kind], [400, 'input']);
});

test('키가 틀리면 인증 오류로 답한다', async () => {
  const base = await start({ credentials: { clientId: 'wrong-id', clientSecret: 'wrong-secret' } });
  const { failure } = await search(base, { detail: '연남동' });
  assert.deepEqual([failure.status, failure.body.kind], [502, 'auth']);
});

test('키 저장: 틀린 키는 거절하고 맞는 키는 .env에 적는다', async () => {
  const envFile = path.join(tmp, 'config.env');
  await writeFile(envFile, 'PORT=4000\nNAVER_CLIENT_ID=old-value\n');
  const base = await start({ credentials: null, envFile });
  const save = (body, headers = {}) =>
    fetch(`${base}/api/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });

  assert.equal((await save({ clientId: 'bad', clientSecret: 'x' })).status, 400);
  assert.equal((await save({ clientId: 'wrong-id', clientSecret: 'wrong-secret' })).status, 400);
  assert.equal((await save({ clientId: 'test-id\nEVIL=1', clientSecret: 'test-secret' })).status, 400);
  assert.equal((await save(TEST_KEYS, { Origin: 'https://evil.example' })).status, 403);
  assert.equal((await get(`${base}/api/status`)).body.configured, false);

  const saved = await save(TEST_KEYS);
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).provider, 'hub');
  assert.deepEqual(parseEnv(await readFile(envFile, 'utf8')), {
    PORT: '4000',
    NAVER_API_PROVIDER: 'hub',
    NAVER_CLIENT_ID: 'test-id',
    NAVER_CLIENT_SECRET: 'test-secret',
  });

  // 저장된 .env로 새로 켜도 설정된 상태다
  const restarted = await start({ envFile });
  assert.deepEqual((await get(`${restarted}/api/status`)).body, {
    configured: true,
    provider: 'hub',
    managed: false,
    notice: '',
  });
});

test('예전 개발자센터 키를 넣으면 그쪽 창구로 알아서 연결한다', async () => {
  const envFile = path.join(tmp, 'legacy.env');
  const base = await start({ credentials: null, envFile });
  const saved = await fetch(`${base}/api/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(LEGACY_TEST_KEYS),
  });
  assert.equal((await saved.json()).provider, 'legacy');
  assert.equal(parseEnv(await readFile(envFile, 'utf8')).NAVER_API_PROVIDER, 'legacy');
  assert.ok((await search(base, { detail: '성수동', category: 'japanese' })).places.length > 0);

  // .env에 창구가 적혀 있지 않아도(직접 키만 적은 경우) 첫 검색 때 알아낸다
  const bare = await start({ credentials: LEGACY_TEST_KEYS });
  assert.ok((await search(bare, { detail: '성수동' })).places.length > 0);
  assert.equal((await get(`${bare}/api/status`)).body.provider, 'legacy');
});

test('화면 파일을 주고, 폴더 밖 파일과 낯선 Host는 막는다', async () => {
  const base = await start({ credentials: null });
  const page = await fetch(`${base}/`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /동네 맛집 순위/);
  for (const file of ['app.js', 'icons.js', 'lib/rank.js', 'lib/scoring.js']) {
    assert.equal((await fetch(`${base}/${file}`)).status, 200, file);
  }
  assert.equal((await fetch(`${base}/..%2Fserver.js`)).status, 404);
  assert.equal((await fetch(`${base}/..%2F.env`)).status, 404);
  assert.equal((await fetch(`${base}/api/nope`)).status, 404);

  const regions = (await get(`${base}/api/regions`)).body;
  assert.equal(regions.sido.length, 17);
  assert.equal(regions.categories[0].id, 'all');

  const status = await new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: new URL(base).port, path: '/api/status', headers: { Host: 'evil.example' } }, (res) => {
        res.resume();
        resolve(res.statusCode);
      })
      .on('error', reject);
  });
  assert.equal(status, 403);
});
