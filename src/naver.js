import { safeUrl, stripHtml } from '../public/lib/text.js';

/**
 * 네이버 검색 API를 받는 두 창구. 파라미터와 응답 모양은 같고 주소와 인증 헤더만 다르다.
 * - hub: 네이버 클라우드 플랫폼의 NAVER API HUB. 2026-07-31 이후 새로 받는 키는 모두 이쪽이다.
 * - legacy: 네이버 개발자센터. 예전에 받은 키만 2027-06-30까지 쓸 수 있다.
 */
export const PROVIDERS = {
  hub: {
    label: 'NAVER API HUB',
    baseUrl: 'https://naverapihub.apigw.ntruss.com',
    paths: { local: '/search/v1/local', blog: '/search/v1/blog' },
    headers: (id, secret) => ({ 'X-NCP-APIGW-API-KEY-ID': id, 'X-NCP-APIGW-API-KEY': secret }),
    // 키 하나당 초당 50건까지 허용된다. 여유를 두고 초당 33건쯤으로 보낸다.
    minIntervalMs: 30,
    maxConcurrent: 6,
  },
  legacy: {
    label: '네이버 개발자센터',
    baseUrl: 'https://openapi.naver.com',
    paths: { local: '/v1/search/local.json', blog: '/v1/search/blog.json' },
    headers: (id, secret) => ({ 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': secret }),
    minIntervalMs: 120,
    maxConcurrent: 4,
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class NaverError extends Error {
  /** kind: auth | permission | quota | rate | network | upstream | request */
  constructor(message, { status = 0, code = '', kind = 'upstream', upstream = '' } = {}) {
    super(message);
    this.name = 'NaverError';
    this.status = status;
    this.code = code;
    this.kind = kind;
    this.upstream = upstream;
  }
}

/** 요청 시작 간격과 동시 요청 수를 함께 제한한다. 네이버 검색 API는 초당 호출 수 제한이 있다. */
function createLimiter(minIntervalMs, maxConcurrent) {
  let active = 0;
  let nextSlot = 0;
  const waiting = [];

  async function acquire() {
    if (active >= maxConcurrent) await new Promise((resolve) => waiting.push(resolve));
    else active += 1;
    const now = Date.now();
    const wait = Math.max(0, nextSlot - now);
    nextSlot = Math.max(now, nextSlot) + minIntervalMs;
    if (wait > 0) await sleep(wait);
  }

  function release() {
    const next = waiting.shift();
    if (next) next(); // 자리를 그대로 넘겨준다
    else active -= 1;
  }

  return async (task) => {
    await acquire();
    try {
      return await task();
    } finally {
      release();
    }
  };
}

/**
 * 오류 응답은 두 모양이다.
 * 검색 계층: { errorCode, errorMessage } / API HUB 게이트웨이: { error: { errorCode, message, details } }
 */
function toError(status, body) {
  const gateway = body?.error && typeof body.error === 'object' ? body.error : {};
  const upstream = String(body?.errorMessage ?? gateway.message ?? '');
  const code = String(body?.errorCode ?? gateway.errorCode ?? '');
  const meta = { status, code, upstream };
  const noPermission = new NaverError(
    '이 애플리케이션은 블로그·지역 검색 API를 쓸 수 없습니다. Application을 만들 때 "블로그"와 "지역"을 모두 골랐는지 확인하세요.',
    { ...meta, kind: 'permission' },
  );
  if (status === 401) {
    if (code === '210' || /permission/i.test(upstream)) return noPermission;
    return new NaverError(
      'Client ID 또는 Client Secret이 올바르지 않습니다. Application에 "블로그"와 "지역" API가 모두 들어 있는지도 확인하세요.',
      { ...meta, kind: 'auth' },
    );
  }
  if (status === 403) return noPermission;
  if (status === 429) {
    // 하루 한도 초과: 개발자센터는 010, API HUB 게이트웨이는 400(Quota Exceeded)
    if (code === '010' || code === '400' || /quota|query limit|허용량/i.test(upstream)) {
      return new NaverError('오늘 쓸 수 있는 네이버 검색 API 호출 한도를 모두 썼습니다. 내일 다시 시도하세요.', {
        ...meta,
        kind: 'quota',
      });
    }
    return new NaverError('네이버 검색 API 호출이 너무 잦습니다. 잠시 뒤 다시 시도하세요.', { ...meta, kind: 'rate' });
  }
  if (status >= 500) {
    return new NaverError('네이버 검색 서버가 응답하지 않습니다. 잠시 뒤 다시 시도하세요.', { ...meta, kind: 'upstream' });
  }
  return new NaverError(`네이버 검색 API가 요청을 거절했습니다 (${status}).`, { ...meta, kind: 'request' });
}

const RETRYABLE = new Set(['rate', 'network', 'upstream']);

export function createNaverClient({
  clientId,
  clientSecret,
  provider = 'hub',
  baseUrl,
  minIntervalMs,
  maxConcurrent,
  retries = 3,
  backoffMs = 400,
  timeoutMs = 8000,
  fetchImpl = fetch,
} = {}) {
  if (!clientId || !clientSecret) throw new Error('clientId와 clientSecret이 필요합니다.');
  const api = PROVIDERS[provider];
  if (!api) throw new Error(`알 수 없는 provider입니다: ${provider}`);
  baseUrl ??= api.baseUrl;
  const limit = createLimiter(minIntervalMs ?? api.minIntervalMs, maxConcurrent ?? api.maxConcurrent);
  const headers = api.headers(clientId, clientSecret);

  async function once(url) {
    let response;
    try {
      response = await fetchImpl(url, { headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch {
      throw new NaverError('네이버 검색 서버에 연결하지 못했습니다. 인터넷 연결을 확인하세요.', { kind: 'network' });
    }
    if (!response.ok) {
      throw toError(response.status, await response.json().catch(() => ({})));
    }
    try {
      return await response.json();
    } catch {
      throw new NaverError('네이버 검색 서버가 읽을 수 없는 응답을 보냈습니다.', { status: response.status });
    }
  }

  async function request(pathname, params) {
    const url = new URL(pathname, baseUrl);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await limit(() => once(url));
      } catch (error) {
        if (!RETRYABLE.has(error.kind) || attempt >= retries) throw error;
        await sleep(backoffMs * 2 ** attempt);
      }
    }
  }

  return {
    /** 지역 검색. 한 번에 최대 5곳. sort: random(정확도순) | comment(리뷰 많은 순) */
    async searchLocal(query, sort = 'random') {
      const data = await request(api.paths.local, { query, display: 5, start: 1, sort });
      return (Array.isArray(data.items) ? data.items : []).map((item) => ({
        name: stripHtml(item.title),
        category: stripHtml(item.category),
        address: stripHtml(item.address),
        roadAddress: stripHtml(item.roadAddress),
        telephone: stripHtml(item.telephone),
        link: safeUrl(item.link),
      }));
    },

    /** 블로그 검색. total은 검색어에 걸린 전체 글 수. */
    async searchBlog(query, { display = 30, sort = 'sim' } = {}) {
      const data = await request(api.paths.blog, { query, display, start: 1, sort });
      return {
        total: Number(data.total) || 0,
        posts: (Array.isArray(data.items) ? data.items : []).map((item) => ({
          title: stripHtml(item.title),
          description: stripHtml(item.description),
          link: safeUrl(item.link),
          blogger: stripHtml(item.bloggername),
          postdate: String(item.postdate ?? ''),
        })),
      };
    },
  };
}
