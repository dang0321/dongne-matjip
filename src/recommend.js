import { normalizeName } from '../public/lib/scoring.js';
import { CATEGORIES } from './regions.js';

/** 블로그 리뷰까지 읽어 볼 후보 수. 후보 한 곳마다 API를 세 번 부른다. */
export const MAX_ANALYZE = 30;
/**
 * 리뷰를 한 요청에 몇 곳씩 가져올지. 5곳이면 네이버 호출이 15번이다.
 * 무료 Cloudflare Workers의 요청당 CPU 한도(10ms)에 걸리지 않도록 작게 나눈다.
 */
export const BATCH_SIZE = 5;
const POSTS_PER_PLACE = 30;

/** 지역 검색 결과에 섞여 나오는 식당이 아닌 업종(대분류 기준). */
const NOT_FOOD =
  /숙박|병원|의원|의료|약국|학원|교육|학문|부동산|미용|쇼핑|유통|금융|보험|여행|관광|명소|문화|예술|스포츠|오락|자동차|공공|기관|종교|생활|편의|건설|기업|서비스|산업/;

/** 이 오류가 나면 나머지 요청도 모두 실패하므로 바로 멈춘다. */
const FATAL = new Set(['auth', 'permission', 'quota']);

function mergeCandidates(lists) {
  const byKey = new Map();
  for (const list of lists) {
    list.items.forEach((item, rank) => {
      if (!item.name) return;
      const key = `${normalizeName(item.name)}|${normalizeName(item.roadAddress || item.address)}`;
      let candidate = byKey.get(key);
      if (!candidate) {
        candidate = { ...item, hits: 0, bestRank: rank, bestCommentRank: null };
        byKey.set(key, candidate);
      }
      candidate.hits += 1;
      candidate.bestRank = Math.min(candidate.bestRank, rank);
      if (list.sort === 'comment') {
        candidate.bestCommentRank =
          candidate.bestCommentRank === null ? rank : Math.min(candidate.bestCommentRank, rank);
      }
    });
  }
  return [...byKey.values()];
}

function mapUrl(candidate) {
  const where = (candidate.roadAddress || candidate.address).split(' ').slice(0, 2).join(' ');
  return `https://map.naver.com/p/search/${encodeURIComponent(`${candidate.name} ${where}`.trim())}`;
}

/**
 * 1단계: 지역 검색으로 식당 후보를 모은다(검색어마다 정확도순 5곳 + 리뷰 많은 순 5곳).
 * 네이버 호출은 종류에 따라 8~20번.
 */
export async function discover({ client, area, categoryId = 'all' }) {
  const category = CATEGORIES.find((item) => item.id === categoryId) ?? CATEGORIES[0];
  const searches = category.keywords.flatMap((keyword) =>
    ['random', 'comment'].map((sort) => ({ query: `${area.searchArea} ${keyword}`, sort })),
  );
  const runSearch = async (search) => {
    try {
      return { ...search, items: await client.searchLocal(search.query, search.sort) };
    } catch (error) {
      if (FATAL.has(error.kind)) throw error;
      return { ...search, items: [], error };
    }
  };
  // 첫 요청이 (재시도까지 하고도) 실패하면 나머지도 실패할 테니 여기서 멈춘다.
  const first = await runSearch(searches[0]);
  if (first.error) throw first.error;
  const lists = [first, ...(await Promise.all(searches.slice(1).map(runSearch)))];

  // 식당만 남기고, 고른 지역 주소인 곳으로 좁힌다(너무 적게 남으면 좁히지 않는다)
  let candidates = mergeCandidates(lists).filter((c) => !NOT_FOOD.test(c.category.split('>')[0]));
  if (area.addressAny.length) {
    const inArea = candidates.filter((c) =>
      area.addressAny.some((token) => `${c.address} ${c.roadAddress}`.includes(token)),
    );
    if (inArea.length >= 5) candidates = inArea;
  }
  candidates.sort(
    (a, b) => b.hits - a.hits || (a.bestCommentRank ?? 9) - (b.bestCommentRank ?? 9) || a.bestRank - b.bestRank,
  );

  return {
    area: area.label,
    reviewArea: area.reviewArea,
    category: category.label,
    candidateCount: candidates.length,
    batchSize: BATCH_SIZE,
    places: candidates.slice(0, MAX_ANALYZE).map((c) => ({
      name: c.name,
      category: c.category,
      address: c.roadAddress || c.address,
      telephone: c.telephone,
      homepage: c.link,
      mapUrl: mapUrl(c),
      hits: c.hits,
      bestCommentRank: c.bestCommentRank,
    })),
  };
}

const EMPTY_BLOG = '{"total":0,"items":[]}';

/**
 * 2단계: 후보 몇 곳의 블로그 리뷰를 가져온다. 한 곳마다 세 번 묻는다.
 * 글 30개(제목·요약)와, 협찬 비중을 가늠할 "제공받아"/"내돈내산" 글 수.
 *
 * 네이버 응답은 풀지 않고 JSON 문자열 그대로 이어 붙여 돌려준다(서버 CPU를 아끼려고).
 * 결과 모양: '{"batch":N,"items":[{"blog":{…},"provided":{…},"own":{…}}, …]}'
 * 받는 쪽은 public/lib/rank.js의 readReviewItem으로 풀어 쓴다.
 */
export async function fetchReviewsText({ client, reviewArea, places, batch }) {
  const searchRaw = async (query, display) => {
    try {
      return await client.searchBlogRaw(query, { display });
    } catch (error) {
      if (FATAL.has(error.kind)) throw error;
      return EMPTY_BLOG;
    }
  };
  const items = await Promise.all(
    places.map(async (place) => {
      const query = `${reviewArea} ${place.name}`;
      const [blog, provided, own] = await Promise.all([
        searchRaw(query, POSTS_PER_PLACE),
        searchRaw(`${query} 제공받아`, 1),
        searchRaw(`${query} 내돈내산`, 1),
      ]);
      return `{"blog":${blog},"provided":${provided},"own":${own}}`;
    }),
  );
  return `{"batch":${Number(batch)},"items":[${items.join(',')}]}`;
}
