/**
 * 테스트와 화면 확인용 가짜 네이버 검색 서버.
 * 실제 API(NAVER API HUB와 예전 개발자센터 둘 다)와 같은 주소·응답 모양을 쓰지만
 * 식당과 글은 모두 지어낸 것이다.
 */
import http from 'node:http';

/** NAVER API HUB 쪽에서만 통하는 연습용 키 */
export const TEST_KEYS = { clientId: 'test-id', clientSecret: 'test-secret' };
/** 예전 개발자센터 쪽에서만 통하는 연습용 키 */
export const LEGACY_TEST_KEYS = { clientId: 'old-id', clientSecret: 'old-secret' };

// [이름, 업종, 도로명, 전체 글 수, 긍정 글 비율, 협찬 성향(높을수록 제공받아 쓴 글이 많다), 최근 글 비율]
const POOL = [
  ['온기솥밥 성수점', '한식>솥밥', '연무장길 12', 2600, 0.85, 0.05, 0.7],
  ['화로상회', '한식>육류,고기요리', '성수이로 88', 1900, 0.8, 0.1, 0.6],
  ['모래시계 파스타', '양식>이탈리아음식', '서울숲2길 7', 1400, 0.75, 0.45, 0.8],
  ['달빛국수', '한식>국수', '뚝섬로 301', 900, 0.7, 0, 0.3],
  ['서울반점', '중식>중식당', '왕십리로 55', 700, 0.6, 0, 0.2],
  ['스시 한결', '일식>초밥,롤', '아차산로 40', 1200, 0.9, 0.15, 0.5],
  ['골목떡볶이', '분식>떡볶이', '성수일로 19', 500, 0.65, 0, 0.4],
  ['파도횟집', '한식>해물,생선요리', '둘레길 3', 350, 0.5, 0, 0.1],
  ['밤산책 포차', '술집>포장마차', '연무장5길 9', 800, 0.7, 0.2, 0.6],
  ['숲속 게스트하우스', '숙박>게스트하우스', '서울숲길 44', 300, 0.5, 0, 0.3],
  ['한우마당 본점', '한식>육류,고기요리', '성덕정길 21', 1100, 0.8, 0.05, 0.4],
  ['라멘 고요', '일식>일본식라면', '성수이로7길 5', 1000, 0.85, 0.05, 0.75],
  ['마라공방', '중식>마라탕', '아차산로9길 2', 450, 0.55, 0.3, 0.5],
  ['브런치 창가', '양식>브런치', '서울숲4길 16', 1600, 0.7, 0.4, 0.9],
  ['할매국밥', '한식>국밥', '고산자로 120', 650, 0.9, 0, 0.25],
  ['동네김밥', '분식>김밥', '무학로 8', 150, 0.6, 0, 0.2],
].map(([name, category, road, total, mood, sponsored, fresh]) => ({
  name,
  category,
  road,
  total,
  mood,
  sponsored,
  fresh,
}));

const PRAISE = [
  '정말 맛있어서 재방문 의사 100%입니다. 직원분들도 친절하고 양도 푸짐해요.',
  '웨이팅이 있었지만 기다린 보람이 있는 맛집. 가성비도 좋고 분위기도 좋았어요.',
  '현지인 추천으로 갔는데 인생 메뉴를 만났습니다. 또 가고 싶은 단골 예약.',
  '재료가 신선하고 간이 딱 맞아요. 데이트 코스로도 최고였습니다. 주차도 편해요.',
];
const COMPLAINT = [
  '기대가 컸는데 솔직히 별로였어요. 웨이팅에 비해 실망스러웠습니다.',
  '맛은 그저 그랬고 직원이 불친절해서 아쉬웠어요.',
];
const DISCLOSURE = ' 이 글은 업체로부터 식사를 제공받아 작성했습니다.';

function hash(text) {
  let value = 2166136261;
  for (const char of text) value = Math.imul(value ^ char.codePointAt(0), 16777619);
  return value >>> 0;
}

function random(seed) {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled(seed) {
  const rand = random(seed);
  return POOL.map((place) => [rand(), place])
    .sort((a, b) => a[0] - b[0])
    .map(([, place]) => place);
}

function localItems(query, sort) {
  const picked =
    sort === 'comment'
      ? shuffled(query).slice(0, 9).sort((a, b) => b.total - a.total)
      : shuffled(`${query}/accuracy`);
  return picked.slice(0, 5).map((place, index) => ({
    title: place.name.replace(/^(\S+)/, '<b>$1</b>'),
    link: index % 2 ? '' : 'https://example.com/',
    category: place.category,
    description: '',
    telephone: '',
    address: `서울특별시 성동구 성수동2가 ${100 + index}`,
    roadAddress: `서울특별시 성동구 ${place.road}`,
    mapx: '1270557000',
    mapy: '375445000',
  }));
}

function postDate(daysAgo) {
  return new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10).replaceAll('-', '');
}

function blogItems(fullQuery, display) {
  // "… 제공받아", "… 내돈내산"은 글 수만 묻는 검색이다
  const suffix = / (제공받아|내돈내산)$/.exec(fullQuery);
  const query = suffix ? fullQuery.slice(0, suffix.index) : fullQuery;
  const place = POOL.find((item) => query.includes(item.name));
  if (!place) return { total: 0, items: [] };
  if (suffix) {
    const share = suffix[1] === '제공받아' ? place.sponsored * 0.6 : place.mood * 0.12;
    return { total: Math.round(place.total * share), items: [] };
  }
  const area = query.replace(place.name, '').trim();
  const rand = random(query);
  const count = Math.min(display, Math.max(3, Math.round(place.total / 60)));
  const items = Array.from({ length: count }, (_, index) => {
    const onTopic = rand() < 0.85;
    const happy = rand() < place.mood;
    const paid = rand() < place.sponsored;
    const daysAgo = Math.floor(rand() < place.fresh ? rand() * 170 : 200 + rand() * 900);
    const lines = happy ? PRAISE : COMPLAINT;
    return {
      title: onTopic ? `[${area}] <b>${place.name}</b> 다녀온 후기 ${index + 1}` : `${area} 주말 나들이 기록 ${index + 1}`,
      link: `https://blog.example.com/post/${hash(`${query}${index}`)}`,
      description: onTopic
        ? `${place.name} ${lines[Math.floor(rand() * lines.length)]}${paid ? DISCLOSURE : ''}`
        : '날씨가 좋아서 동네를 한 바퀴 걸었습니다. 사진 위주의 기록 &amp; 메모.',
      bloggername: `블로거${Math.floor(rand() * 40)}`,
      bloggerlink: 'https://blog.example.com/',
      postdate: postDate(daysAgo),
    };
  });
  return { total: place.total, items };
}

/** 두 창구의 주소·헤더·인증 실패 응답을 흉내 낸다. 키는 창구마다 다르다. */
const ROUTES = {
  '/search/v1/local': { kind: 'local', api: 'hub' },
  '/search/v1/blog': { kind: 'blog', api: 'hub' },
  '/v1/search/local.json': { kind: 'local', api: 'legacy' },
  '/v1/search/blog.json': { kind: 'blog', api: 'legacy' },
};

function authorized(api, headers) {
  if (api === 'hub') {
    return (
      headers['x-ncp-apigw-api-key-id'] === TEST_KEYS.clientId &&
      headers['x-ncp-apigw-api-key'] === TEST_KEYS.clientSecret
    );
  }
  return (
    headers['x-naver-client-id'] === LEGACY_TEST_KEYS.clientId &&
    headers['x-naver-client-secret'] === LEGACY_TEST_KEYS.clientSecret
  );
}

export function createMockNaver() {
  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const reply = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    const route = ROUTES[url.pathname];
    if (!route) return reply(404, { errorMessage: 'Invalid search api', errorCode: 'SE05' });
    if (!authorized(route.api, req.headers)) {
      return reply(
        401,
        route.api === 'hub'
          ? { error: { errorCode: '200', message: 'Authentication Failed', details: 'Invalid authentication information.' } }
          : { errorMessage: 'Authentication failed. (인증에 실패했습니다.)', errorCode: '024' },
      );
    }
    const query = url.searchParams.get('query') ?? '';
    const display = Number(url.searchParams.get('display')) || 10;
    if (route.kind === 'local') {
      const items = localItems(query, url.searchParams.get('sort'));
      return reply(200, { total: items.length, start: 1, display: items.length, items });
    }
    const { total, items } = blogItems(query, display);
    reply(200, { total, start: 1, display: items.length, items });
  });
}

export function listen(server, port = 0) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolve(server.address().port));
  });
}
