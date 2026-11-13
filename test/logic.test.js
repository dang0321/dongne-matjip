import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createNaverClient, NaverError } from '../src/naver.js';
import { AreaError, resolveArea, SIDO } from '../src/regions.js';
import { analyzePosts, buildReasons, isRelevant, nameKeys, scorePlace } from '../public/lib/scoring.js';
import { safeUrl, stripHtml } from '../public/lib/text.js';

const NOW = new Date('2026-11-13T00:00:00Z');
const post = (overrides = {}) => ({
  title: '성수동 온기솥밥 후기',
  description: '정말 맛있어서 재방문했습니다.',
  link: 'https://blog.example.com/1',
  blogger: '가',
  postdate: '20261001',
  ...overrides,
});

test('stripHtml은 태그를 지우고 엔티티를 푼다', () => {
  assert.equal(stripHtml('<b>온기</b>솥밥 &amp; 국수 &#39;본점&#39;'), "온기솥밥 & 국수 '본점'");
  assert.equal(stripHtml(null), '');
});

test('safeUrl은 http(s) 주소만 통과시킨다', () => {
  assert.equal(safeUrl('https://example.com/a'), 'https://example.com/a');
  assert.equal(safeUrl('javascript:alert(1)'), '');
});

test('시/도 17곳이 모두 있고 구·군 이름이 겹치지 않는다', () => {
  assert.equal(SIDO.length, 17);
  for (const sido of SIDO) assert.equal(new Set(sido.districts).size, sido.districts.length, sido.name);
});

test('resolveArea는 검색어와 주소 필터를 만든다', () => {
  assert.deepEqual(resolveArea({ sido: '서울특별시', sigungu: '성동구' }), {
    label: '서울 성동구',
    searchArea: '서울 성동구',
    reviewArea: '성동구',
    addressAny: ['성동구'],
  });
  // 여러 시/도에 있는 이름은 시/도 약칭을 붙인다
  assert.equal(resolveArea({ sido: '서울특별시', sigungu: '중구' }).reviewArea, '서울 중구');
  assert.equal(resolveArea({ sido: '강원특별자치도', sigungu: '고성군' }).reviewArea, '강원 고성');
  assert.equal(resolveArea({ sido: '경기도', sigungu: '광주시' }).reviewArea, '경기 광주');
  assert.equal(resolveArea({ sido: '경기도', sigungu: '수원시' }).reviewArea, '수원');
  assert.equal(resolveArea({ sido: '제주특별자치도', sigungu: '제주시' }).reviewArea, '제주');

  // 동네 이름을 넣으면 리뷰 검색은 동네 이름으로, 주소 필터는 시/도 수준으로 느슨해진다
  const seongsu = resolveArea({ sido: '서울특별시', sigungu: '성동구', detail: ' 성수동! ' });
  assert.equal(seongsu.label, '서울 성동구 성수동');
  assert.equal(seongsu.reviewArea, '성수동');
  assert.deepEqual(seongsu.addressAny, ['서울특별시', '서울']);

  assert.deepEqual(resolveArea({ detail: '연남동' }).addressAny, []);
});

test('resolveArea는 잘못된 입력을 거절한다', () => {
  assert.throws(() => resolveArea({}), AreaError);
  assert.throws(() => resolveArea({ sido: '없는도' }), AreaError);
  assert.throws(() => resolveArea({ sido: '서울특별시', sigungu: '해운대구' }), AreaError);
  assert.throws(() => resolveArea({ detail: '!!!' }), AreaError);
});

test('nameKeys는 지점명을 뗀 이름도 찾는다', () => {
  assert.deepEqual(nameKeys('온기솥밥 성수점'), ['온기솥밥성수점', '온기솥밥']);
  assert.deepEqual(nameKeys('서울반점'), ['서울반점']); // 띄어쓰기 없는 "~점"은 지점명이 아니다
});

test('isRelevant는 식당 이름이 있는 글만 고른다', () => {
  const keys = nameKeys('온기솥밥 성수점');
  assert.equal(isRelevant(post(), keys), true);
  assert.equal(isRelevant(post({ title: '성수동 산책', description: '날씨가 좋았다' }), keys), false);
  // 두 글자 이름은 제목에 있을 때만 인정
  assert.equal(isRelevant(post({ title: '성수동 맛집', description: '온 가족이 갔다' }), nameKeys('온')), false);
});

test('analyzePosts는 관련 글에서 신호를 센다', () => {
  const posts = [
    post({ blogger: '가' }), // 43일 전
    post({ blogger: '나', description: '친절하고 재방문 의사 있어요', postdate: '20261105' }), // 8일 전
    post({ blogger: '다', description: '체험단으로 제공받아 작성', postdate: '20240101' }),
    post({ blogger: '라', description: '기대보다 별로였고 불친절', postdate: '20250101' }),
    post({ title: '성수동 산책', description: '날씨 좋은 날' }),
  ];
  const analysis = analyzePosts('온기솥밥 성수점', posts, 1000, NOW, { providedTotal: 250, ownTotal: 40 });
  assert.equal(analysis.relevantCount, 4);
  assert.equal(analysis.estimatedReviews, 800);
  assert.equal(analysis.recent30, 1);
  assert.ok(analysis.freshness > 0.3 && analysis.freshness < 0.4, `freshness=${analysis.freshness}`);
  assert.equal(analysis.uniqueBloggers, 4);
  assert.equal(analysis.positive, 2);
  assert.equal(analysis.negative, 1); // "불친절"은 긍정으로 세지 않는다
  assert.equal(analysis.sponsoredShare, 0.25);
  assert.deepEqual(analysis.tags, [{ label: '재방문', count: 2 }]);
  assert.equal(analysis.samples.at(-1).sponsored, true); // 협찬 문구가 보이는 글은 뒤로
});

test('부정처럼 보이지만 부정이 아닌 문장은 세지 않는다', () => {
  const count = (texts) =>
    analyzePosts('온기솥밥', texts.map((description, i) => post({ blogger: `b${i}`, description })), 10, NOW).negative;
  assert.equal(count(['별로 안 기다리고 들어갔어요', '언제 가도 실망시키지 않는 집', '좀 아쉬워서 한 잔 더 마셨어요']), 0);
  assert.equal(count(['기대했는데 별로여서 실망했네요', '솔직히 비추천입니다', '직원이 불친절했어요']), 3);
});

test('리뷰가 많고 최근에도 좋은 식당이 더 높은 점수를 받는다', () => {
  const busy = analyzePosts(
    '온기솥밥',
    Array.from({ length: 30 }, (_, i) => post({ blogger: `b${i}`, postdate: '20261020' })),
    2500,
    NOW,
    { providedTotal: 100, ownTotal: 400 },
  );
  const quiet = analyzePosts('온기솥밥', [post({ postdate: '20230101' })], 3, NOW);
  const high = scorePlace(busy, { hits: 4, bestCommentRank: 0 }, { maxReviews: 2500 });
  const low = scorePlace(quiet, { hits: 1, bestCommentRank: null }, { maxReviews: 2500 });
  assert.ok(high.score > 85, `high=${high.score}`);
  assert.ok(low.score < 25, `low=${low.score}`);
});

test('리뷰량은 같은 검색에서 가장 많은 곳에 견줘 매긴다', () => {
  const posts = Array.from({ length: 10 }, (_, i) => post({ blogger: `b${i}` }));
  const place = analyzePosts('온기솥밥', posts, 1000, NOW);
  assert.equal(scorePlace(place, {}, { maxReviews: 1000 }).parts.volume, 1);
  assert.ok(scorePlace(place, {}, { maxReviews: 30000 }).parts.volume < 0.7);
  // 동네 전체에 글이 적으면 몇 건으로 만점이 되지 않는다
  const tiny = analyzePosts('온기솥밥', posts, 12, NOW);
  assert.ok(scorePlace(tiny, {}, { maxReviews: 12 }).parts.volume < 0.5);
});

test('제공받아 쓴 글이 많으면 점수가 깎이고 경고가 붙는다', () => {
  const posts = Array.from({ length: 10 }, (_, i) => post({ blogger: `b${i}` }));
  const honest = analyzePosts('온기솥밥', posts, 500, NOW, { providedTotal: 20, ownTotal: 90 });
  const paid = analyzePosts('온기솥밥', posts, 500, NOW, { providedTotal: 150, ownTotal: 5 });
  const context = { maxReviews: 500 };
  assert.ok(scorePlace(paid, {}, context).score < scorePlace(honest, {}, context).score - 10);
  assert.ok(buildReasons(paid).some((reason) => reason.tone === 'warn' && reason.text === '제공받아 쓴 글 30%'));
  assert.ok(buildReasons(honest).every((reason) => reason.tone !== 'warn'));
  assert.ok(buildReasons(honest).some((reason) => reason.text === '내돈내산 글 90건' && reason.tone === 'good'));
});

test('글이 하나도 없으면 0점에 가깝고 그 사실을 알린다', () => {
  const none = analyzePosts('아무도모르는집', [], 0, NOW);
  assert.ok(scorePlace(none).score <= 5);
  assert.deepEqual(buildReasons(none), [{ text: '리뷰를 찾지 못함', tone: 'warn' }]);
});

function stubFetch(responses) {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url: String(url), headers: options.headers });
    const next = responses.shift();
    return new Response(JSON.stringify(next.body), { status: next.status });
  };
  return { calls, fetchImpl };
}

test('네이버 클라이언트는 속도 제한에 걸리면 다시 시도한다', async () => {
  const { calls, fetchImpl } = stubFetch([
    { status: 429, body: { errorMessage: 'Rate limit exceeded.', errorCode: '012' } },
    { status: 200, body: { total: 1, items: [{ title: '<b>달빛</b>국수', category: '한식>국수' }] } },
  ]);
  const client = createNaverClient({ clientId: 'id', clientSecret: 'secret', fetchImpl, minIntervalMs: 0, backoffMs: 1 });
  const items = await client.searchLocal('성수동 국수');
  assert.equal(calls.length, 2);
  assert.equal(items[0].name, '달빛국수');
});

test('창구에 따라 주소와 인증 헤더가 달라진다', async () => {
  const ok = () => ({ status: 200, body: { total: 0, items: [] } });

  const hub = stubFetch([ok(), ok()]);
  const hubClient = createNaverClient({ clientId: 'id', clientSecret: 'secret', fetchImpl: hub.fetchImpl, minIntervalMs: 0 });
  await hubClient.searchLocal('성수동 국수', 'comment');
  await hubClient.searchBlog('성수동 달빛국수', { display: 30 });
  assert.match(
    hub.calls[0].url,
    /^https:\/\/naverapihub\.apigw\.ntruss\.com\/search\/v1\/local\?query=.+&display=5&start=1&sort=comment$/,
  );
  assert.match(hub.calls[1].url, /^https:\/\/naverapihub\.apigw\.ntruss\.com\/search\/v1\/blog\?query=.+&display=30&start=1&sort=sim$/);
  assert.deepEqual(hub.calls[0].headers, { 'X-NCP-APIGW-API-KEY-ID': 'id', 'X-NCP-APIGW-API-KEY': 'secret' });

  const legacy = stubFetch([ok()]);
  const legacyClient = createNaverClient({
    clientId: 'id',
    clientSecret: 'secret',
    provider: 'legacy',
    fetchImpl: legacy.fetchImpl,
    minIntervalMs: 0,
  });
  await legacyClient.searchLocal('성수동 국수');
  assert.match(legacy.calls[0].url, /^https:\/\/openapi\.naver\.com\/v1\/search\/local\.json\?query=.+&sort=random$/);
  assert.deepEqual(legacy.calls[0].headers, { 'X-Naver-Client-Id': 'id', 'X-Naver-Client-Secret': 'secret' });
});

test('네이버 클라이언트는 인증 실패와 하루 한도 초과를 다시 시도하지 않는다', async () => {
  for (const [status, body, kind] of [
    [401, { errorMessage: 'Authentication failed', errorCode: '024' }, 'auth'],
    [401, { error: { errorCode: '200', message: 'Authentication Failed' } }, 'auth'],
    [401, { error: { errorCode: '210', message: 'Permission Denied' } }, 'permission'],
    [429, { errorMessage: 'Query limit exceeded', errorCode: '010' }, 'quota'],
    [429, { error: { errorCode: '400', message: 'Quota Exceeded' } }, 'quota'],
    [403, {}, 'permission'],
  ]) {
    const { calls, fetchImpl } = stubFetch([{ status, body }]);
    const client = createNaverClient({ clientId: 'id', clientSecret: 'secret', fetchImpl, minIntervalMs: 0 });
    await assert.rejects(client.searchBlog('맛집'), (error) => error instanceof NaverError && error.kind === kind);
    assert.equal(calls.length, 1);
  }
});
