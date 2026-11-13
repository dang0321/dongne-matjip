import { safeUrl, stripHtml } from './text.js';

/**
 * 네이버 블로그 검색 응답(JSON 객체)을 화면과 점수 계산이 쓰는 모양으로 바꾼다.
 * 서버(src/naver.js)와 브라우저(public/lib/rank.js)가 함께 쓴다.
 */
export function readBlogResponse(data) {
  return {
    total: Number(data?.total) || 0,
    posts: (Array.isArray(data?.items) ? data.items : []).map((item) => ({
      title: stripHtml(item.title),
      description: stripHtml(item.description),
      link: safeUrl(item.link),
      blogger: stripHtml(item.bloggername),
      postdate: String(item.postdate ?? ''),
    })),
  };
}
