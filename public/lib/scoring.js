const DAY_MS = 86_400_000;

/**
 * 점수 가중치(합 1). 실제 검색 결과로 맞춘 값이다.
 * 인기 지역에서는 "글이 많다, 최근 글이 있다"만으로는 식당이 갈리지 않아서,
 * 내 돈 주고 먹은 글과 제공받아 쓴 글의 비율을 따로 본다.
 */
export const WEIGHTS = {
  volume: 0.27, // 블로그 리뷰가 얼마나 많은가(같은 검색 안에서 가장 많은 곳 대비)
  authenticity: 0.2, // "내돈내산" 글과 "제공받아" 글의 비율
  sentiment: 0.18, // 글의 표현이 긍정적인가
  recency: 0.15, // 읽은 글이 얼마나 최근 것인가
  local: 0.15, // 지역 검색에서 얼마나 자주, 높게 나왔는가
  diversity: 0.05, // 한 사람이 도배한 것은 아닌가
};

/** 글의 신선도는 exp(-경과일/60)의 평균. 한 달 안팎의 글이 대부분이면 0.65쯤 나오고 이를 만점으로 본다. */
const FRESH_DECAY_DAYS = 60;
const FRESH_FULL = 0.65;
/** 리뷰량을 비교할 때의 최소 기준. 동네 전체에 글이 적을 때 몇 건 차이로 만점이 나오지 않게 한다. */
const VOLUME_FLOOR = 300;
/** 내돈내산·제공받아 글이 몇 건 없을 때 비율이 0이나 1로 튀지 않게 하는 보정값. */
const AUTH_SMOOTHING = 5;
const SPONSORED_WARN_SHARE = 0.2;

const POSITIVE = /맛있|존맛|jmt|인생|최고|만족|재방문|또\s?(?:가|갈|방문|올)|단골|(?<!불)친절|신선|푸짐|가성비|훌륭|감동|강추/i;
// "별로 안 기다렸다", "실망시키지 않는", "좀 아쉬워서 한 잔 더"처럼 부정이 아닌 문장을 피한다.
const NEGATIVE =
  /별로(?:였|여|예|에요|임|네|다|인|라서|\s?[.…ㅠㅜ])|실망(?!\s?(?:시키지|하지)\s?않|\s?없)|불친절|비추|최악|그저\s?그|다신\s?안|다시는\s?안|맛없|불쾌한|비위생/;
const SPONSORED = /협찬|체험단|제공\s?받|원고료|소정의|서포터즈|초대\s?받|유료\s?광고|광고\s?포함|지원\s?받아/;

const TAGS = [
  ['재방문', /재방문|또\s?(?:가|갈|방문|올)|단골/],
  ['웨이팅', /웨이팅|줄\s?서|대기\s?(?:줄|시간|번호)/],
  ['가성비', /가성비|저렴|착한\s?가격/],
  ['친절', /(?<!불)친절/],
  ['분위기', /분위기|인테리어|감성/],
  ['데이트', /데이트|기념일/],
  ['혼밥', /혼밥|혼술/],
  ['주차', /주차/],
  ['푸짐한 양', /푸짐|양\s?(?:이\s?)?많|넉넉/],
  ['현지인 맛집', /현지인|노포|로컬\s?맛집/],
];

const clamp = (value) => Math.min(1, Math.max(0, value));
const round2 = (value) => Math.round(value * 100) / 100;

/** 비교용 이름: 한글·영문·숫자만 남기고 소문자로. */
export function normalizeName(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^0-9a-z가-힣]/g, '');
}

/** 글에서 찾을 이름 후보. "온기솥밥 성수점"이면 지점명을 뗀 "온기솥밥"도 함께 찾는다. */
export function nameKeys(name) {
  const full = normalizeName(name);
  const base = normalizeName(String(name ?? '').replace(/\s+\S{1,8}점$/, ''));
  return [...new Set([full, base])].filter((key, index) => key.length >= (index === 0 ? 1 : 2));
}

/** 이 글이 정말 그 식당 이야기인가. 이름이 두 글자 이하면 제목에 있을 때만 인정한다. */
export function isRelevant(post, keys) {
  const title = normalizeName(post.title);
  const body = title + normalizeName(post.description);
  return keys.some((key) => (key.length <= 2 ? title.includes(key) : body.includes(key)));
}

function parsePostDate(value) {
  const match = /^(\d{4})(\d{2})(\d{2})$/.exec(String(value ?? ''));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

/**
 * 한 식당에 대한 블로그 검색 결과를 읽고 신호를 뽑는다.
 * - posts: "지역 식당명" 검색의 상위 글(제목과 요약), total: 그 검색에 걸린 전체 글 수
 * - providedTotal / ownTotal: 같은 검색어에 "제공받아" / "내돈내산"을 붙였을 때의 글 수.
 *   요약문에는 협찬 문구가 거의 나오지 않아서, 협찬 비중은 이 글 수로 가늠한다.
 */
export function analyzePosts(name, posts = [], total = 0, now = new Date(), { providedTotal = 0, ownTotal = 0 } = {}) {
  const keys = nameKeys(name);
  const relevant = posts
    .filter((post) => isRelevant(post, keys))
    .map((post) => {
      const text = `${post.title} ${post.description}`;
      const date = parsePostDate(post.postdate);
      return {
        ...post,
        date,
        daysAgo: date ? Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS)) : null,
        sponsored: SPONSORED.test(text),
        positive: POSITIVE.test(text),
        negative: NEGATIVE.test(text),
        text,
      };
    });

  const relevantCount = relevant.length;
  const relevanceRatio = posts.length ? relevantCount / posts.length : 0;
  // 상위 글 가운데 실제 그 식당 글의 비율로 전체 글 수를 어림한다.
  const estimatedReviews = Math.max(relevantCount, Math.round(total * relevanceRatio));
  const dated = relevant.filter((post) => post.daysAgo !== null);

  const tags = TAGS.map(([label, pattern]) => ({
    label,
    count: relevant.filter((post) => pattern.test(post.text)).length,
  }))
    .filter((tag) => tag.count >= 2)
    .sort((a, b) => b.count - a.count);

  const samples = [...relevant]
    .sort((a, b) => Number(a.sponsored) - Number(b.sponsored) || (a.daysAgo ?? 1e9) - (b.daysAgo ?? 1e9))
    .slice(0, 4)
    .map((post) => ({
      title: post.title,
      snippet: post.description,
      blogger: post.blogger,
      date: post.date ? post.date.toISOString().slice(0, 10) : '',
      link: post.link,
      sponsored: post.sponsored,
    }));

  return {
    fetched: posts.length,
    total,
    relevantCount,
    estimatedReviews,
    recent30: dated.filter((post) => post.daysAgo <= 30).length,
    freshness: dated.length
      ? dated.reduce((sum, post) => sum + Math.exp(-post.daysAgo / FRESH_DECAY_DAYS), 0) / dated.length
      : 0,
    uniqueBloggers: new Set(relevant.map((post) => post.blogger || post.link)).size,
    positive: relevant.filter((post) => post.positive).length,
    negative: relevant.filter((post) => post.negative).length,
    providedTotal,
    ownTotal,
    sponsoredShare: total ? clamp(providedTotal / total) : 0,
    tags,
    samples,
  };
}

/** 제공받아 쓴 글을 뺀 리뷰 수(어림값). 협찬으로 불어난 글 수가 리뷰량 점수를 올리지 않게 한다. */
export function organicReviews(analysis) {
  return Math.round(analysis.estimatedReviews * (1 - analysis.sponsoredShare));
}

/**
 * 0~100점.
 * - discovery: 지역 검색에서 얻은 신호. hits(몇 번의 검색에 걸렸는가),
 *   bestCommentRank(리뷰 많은 순 검색에서의 최고 순위, 0이 1등)
 * - maxReviews: 같은 검색에서 organicReviews가 가장 큰 식당의 값. 리뷰량은 이 값에 견줘 매긴다.
 */
export function scorePlace(analysis, { hits = 1, bestCommentRank = null } = {}, { maxReviews = 0 } = {}) {
  const confidence = clamp(analysis.relevantCount / 5); // 읽은 글이 몇 개 없으면 글에서 뽑은 신호를 덜 믿는다
  const volume = clamp(
    Math.log10(1 + organicReviews(analysis)) / Math.log10(1 + Math.max(maxReviews, VOLUME_FLOOR)),
  );
  const authenticity =
    (confidence * (analysis.ownTotal + AUTH_SMOOTHING)) /
    (analysis.ownTotal + analysis.providedTotal + 2 * AUTH_SMOOTHING);
  const sentiment = (confidence * (analysis.positive + 1)) / (analysis.positive + 2 * analysis.negative + 2);
  const recency = clamp(analysis.freshness / FRESH_FULL);
  const local = clamp(0.5 * clamp(hits / 4) + 0.5 * (bestCommentRank === null ? 0 : (5 - bestCommentRank) / 5));
  const diversity = analysis.relevantCount ? (confidence * analysis.uniqueBloggers) / analysis.relevantCount : 0;

  const parts = { volume, authenticity, sentiment, recency, local, diversity };
  const raw = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => sum + weight * parts[key], 0);

  return {
    score: Math.round(100 * clamp(raw)),
    parts: Object.fromEntries(Object.entries(parts).map(([key, value]) => [key, round2(value)])),
  };
}

/** 왜 추천했는지 화면에 붙일 짧은 근거들. */
export function buildReasons(analysis, { bestCommentRank = null } = {}) {
  const count = (value) => value.toLocaleString('ko-KR');
  const reasons = [];
  if (analysis.estimatedReviews > 0) {
    reasons.push({ text: `블로그 리뷰 약 ${count(analysis.estimatedReviews)}건`, tone: 'plain' });
  }
  if (analysis.ownTotal >= 20 && analysis.ownTotal > analysis.providedTotal) {
    reasons.push({ text: `내돈내산 글 ${count(analysis.ownTotal)}건`, tone: 'good' });
  }
  if (bestCommentRank !== null && bestCommentRank <= 1) reasons.push({ text: '동네 리뷰 수 상위', tone: 'plain' });
  if (analysis.recent30 >= 10) reasons.push({ text: '최근 한 달 리뷰 활발', tone: 'plain' });
  for (const tag of analysis.tags.slice(0, 3)) {
    reasons.push({ text: `${tag.label} 언급 ${tag.count}건`, tone: 'plain' });
  }
  if (analysis.negative >= 3) reasons.push({ text: `부정적인 후기 ${analysis.negative}건`, tone: 'warn' });
  if (analysis.providedTotal >= 20 && analysis.sponsoredShare >= SPONSORED_WARN_SHARE) {
    reasons.push({ text: `제공받아 쓴 글 ${Math.round(analysis.sponsoredShare * 100)}%`, tone: 'warn' });
  }
  if (analysis.relevantCount === 0) reasons.push({ text: '리뷰를 찾지 못함', tone: 'warn' });
  return reasons;
}
