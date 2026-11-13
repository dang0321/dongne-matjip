/**
 * API의 본체. 웹 표준 Request/Response만 쓰고, 실행 환경에 따라 달라지는 것은 env로 받는다.
 * 지금은 로컬 Node 서버(src/app.js)가 이 코드를 부른다.
 *
 * 검색은 요청 여러 번으로 나뉜다(진행 상황을 단계별로 보여 주기 위해서다):
 *   GET /api/discover            후보 식당 모으기
 *   GET /api/reviews?batch=N     후보 5곳씩 블로그 리뷰 가져오기
 * 점수 계산은 브라우저가 한다(public/lib/rank.js).
 *
 * env가 주는 것:
 *   getClient()  네이버 클라이언트(키가 없으면 null)
 *   cache        { get(key) → 문자열|null, put(key, 문자열, 초) }
 *   allow()      새 검색을 허용할지(방문자별 횟수 제한). 항상 true여도 된다
 *   status()     { configured, provider, managed, notice }
 */
import { NaverError } from './naver.js';
import { BATCH_SIZE, discover, fetchReviewsText } from './recommend.js';
import { AreaError, CATEGORIES, HOT_SPOTS, resolveArea, SIDO } from './regions.js';

/**
 * 받아 온 자료를 잠깐 들고 있는 시간. 한 번의 검색이 요청 여러 번으로 나뉘어 있어서 그 사이에 필요하고,
 * 추천 개수만 바꿔 다시 볼 때도 쓴다. 네이버 약관이 검색 결과의 저장(캐시 포함)을 제한하므로 길게 두지 않는다.
 */
const CACHE_TTL_SECONDS = 10 * 60;
const LIMITS = [10, 15, 20];

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
const rawJson = (text) => new Response(text, { status: 200, headers: JSON_HEADERS });

const NAVER_STATUS = { auth: 502, permission: 502, quota: 429, rate: 429, network: 502, upstream: 502, request: 502 };

function searchKey(query) {
  const area = resolveArea({
    sido: query.get('sido') ?? '',
    sigungu: query.get('sigungu') ?? '',
    detail: query.get('detail') ?? '',
  });
  const categoryId = CATEGORIES.some((c) => c.id === query.get('category')) ? query.get('category') : 'all';
  return { area, categoryId, key: `${area.label}|${categoryId}` };
}

async function handleDiscover(query, env) {
  const { area, categoryId, key } = searchKey(query);
  const cached = await env.cache.get(`d:${key}`);
  if (cached) return rawJson(cached);

  const client = await env.getClient();
  if (!client) return json(503, { kind: 'setup', message: '네이버 검색 API 키를 먼저 연결하세요.' });
  if (!(await env.allow())) {
    return json(429, { kind: 'busy', message: '새 지역을 너무 자주 찾았습니다. 1분쯤 뒤에 다시 찾아보세요.' });
  }
  const text = JSON.stringify(await discover({ client, area, categoryId }));
  await env.cache.put(`d:${key}`, text, CACHE_TTL_SECONDS);
  return rawJson(text);
}

async function handleReviews(query, env) {
  const { key } = searchKey(query);
  const batch = Number(query.get('batch'));
  if (!Number.isInteger(batch) || batch < 0) return json(400, { kind: 'input', message: '잘못된 요청입니다.' });

  const cached = await env.cache.get(`r:${key}|${batch}`);
  if (cached) return rawJson(cached);

  // 어떤 식당을 조회할지는 저장해 둔 후보 목록에서만 읽는다(요청이 식당 이름을 정하지 못하게).
  const found = await env.cache.get(`d:${key}`);
  if (!found) return json(409, { kind: 'expired', message: '검색이 만료됐습니다. 다시 찾아보세요.' });
  const { places, reviewArea } = JSON.parse(found);
  const slice = places.slice(batch * BATCH_SIZE, (batch + 1) * BATCH_SIZE);
  if (!slice.length) return json(400, { kind: 'input', message: '잘못된 요청입니다.' });

  const client = await env.getClient();
  if (!client) return json(503, { kind: 'setup', message: '네이버 검색 API 키를 먼저 연결하세요.' });
  const text = await fetchReviewsText({ client, reviewArea, places: slice, batch });
  await env.cache.put(`r:${key}|${batch}`, text, CACHE_TTL_SECONDS);
  return rawJson(text);
}

export async function handleApi(request, env) {
  const url = new URL(request.url);
  try {
    if (request.method !== 'GET') return json(405, { message: '지원하지 않는 요청입니다.' });
    switch (url.pathname) {
      case '/api/status':
        return json(200, env.status());
      case '/api/regions':
        return json(200, {
          sido: SIDO.map(({ name, short, districts }) => ({ name, short, districts })),
          hotSpots: HOT_SPOTS,
          categories: CATEGORIES.map(({ id, label }) => ({ id, label })),
          limits: LIMITS,
        });
      case '/api/discover':
        return await handleDiscover(url.searchParams, env);
      case '/api/reviews':
        return await handleReviews(url.searchParams, env);
      default:
        return json(404, { message: '없는 주소입니다.' });
    }
  } catch (error) {
    if (error instanceof AreaError) return json(400, { kind: 'input', message: error.message });
    if (error instanceof NaverError) {
      return json(NAVER_STATUS[error.kind] ?? 502, { kind: error.kind, message: error.message });
    }
    console.error(error);
    return json(500, { kind: 'server', message: '순위를 만드는 중 문제가 생겼습니다. 다시 시도하세요.' });
  }
}
