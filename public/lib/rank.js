import { analyzePosts, buildReasons, organicReviews, scorePlace } from './scoring.js';

/**
 * 서버에서 받은 후보(places)와 리뷰(reviews, 같은 순서)를 읽어 점수순 목록을 만든다.
 * 브라우저에서 돈다. 서버는 네이버에서 자료만 가져오고 계산은 여기서 한다.
 */
export function rank(places, reviews, now = new Date()) {
  let postsRead = 0;
  const analysed = places.map((place, index) => {
    const review = reviews[index] ?? { total: 0, posts: [], provided: 0, own: 0 };
    postsRead += review.posts.length;
    const analysis = analyzePosts(place.name, review.posts, review.total, now, {
      providedTotal: review.provided,
      ownTotal: review.own,
    });
    return { place, analysis };
  });

  // 리뷰량은 이번 검색에서 가장 많은 곳에 견줘 매긴다
  const maxReviews = Math.max(0, ...analysed.map(({ analysis }) => organicReviews(analysis)));
  const ranked = analysed.map(({ place, analysis }) => {
    const { score, parts } = scorePlace(analysis, place, { maxReviews });
    return {
      name: place.name,
      category: place.category,
      address: place.address,
      telephone: place.telephone,
      homepage: place.homepage,
      mapUrl: place.mapUrl,
      score,
      parts,
      reasons: buildReasons(analysis, place),
      reviews: {
        estimated: analysis.estimatedReviews,
        sampled: analysis.relevantCount,
        recent30: analysis.recent30,
        provided: analysis.providedTotal,
        own: analysis.ownTotal,
        samples: analysis.samples,
      },
    };
  });

  ranked.sort(
    (a, b) => b.score - a.score || b.reviews.estimated - a.reviews.estimated || a.name.localeCompare(b.name, 'ko'),
  );
  return { places: ranked, postsRead };
}
