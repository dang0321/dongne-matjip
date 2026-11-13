/**
 * 음식 종류 아이콘(48×48). 손으로 그린 그림처럼 보이게 세 겹으로 그린다.
 *  1) 색 면: 선에서 살짝 어긋나게 칠한다(색연필로 대충 칠한 느낌)
 *  2) 먹선: 떨리는 선
 *  3) 덧선: 같은 선을 다르게 떨리게 한 번 더, 옅게(여러 번 그은 느낌)
 * 떨림은 index.html의 #sketch, #sketch2 필터가 입힌다.
 *
 * 소재와 구도는 배달 앱 카테고리 아이콘에서 따왔다(비빔밥, 연어 초밥, 짜장면, 파스타, 테이크아웃 커피,
 * 구운 고기, 쌀국수, 떡볶이). 그림 자체는 모두 선으로 새로 그린 것이다.
 */
const CREAM = '#fff6e0';
const WHITE = '#ffffff';
const YELLOW = '#ffcf4d';
const RED = '#ee5d4a';
const SALMON = '#ff8f6b';
const GREEN = '#8fcf78';
const BLUE = '#7fc0ea';
const BROWN = '#d99a5b';
const ORANGE = '#f29a4a';
const COFFEE = '#7a4a30';
const SAUCE = '#5f3b24';
const BRASS = '#e6c170';
const NORI = '#2f3a36';
const LID = '#e3eef2';
const TTEOK = '#f2713c';
const BROTH = '#f0cf8f';
const SILVER = '#e3e6ea';
const MEAT_TOP = '#cf8052';
const MEAT_SIDE = '#95502f';

const fill = (color, shape) => shape.replace('/>', ` fill="${color}"/>`);

function draw(fills, lines) {
  return (
    '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' +
    `<g class="ic-fill" filter="url(#sketch2)" transform="translate(1.4 1.2)">${fills.join('')}</g>` +
    `<g filter="url(#sketch)">${lines}</g>` +
    `<g filter="url(#sketch2)" opacity="0.45">${lines}</g>` +
    '</svg>'
  );
}

// 위에서 비스듬히 본 그릇: 몸통, 테두리(바깥 타원), 담긴 면(안쪽 타원), 몸통의 줄무늬
const BODY = '<path d="M7 21c0 10 7 18 17 18s17-8 17-18z"/>';
const BODY_LINE = '<path d="M7 21c0 10 7 18 17 18s17-8 17-18"/>';
const RIM = '<ellipse cx="24" cy="21" rx="17" ry="6.5"/>';
const INNER = '<ellipse cx="24" cy="21" rx="14" ry="4.8"/>';
const STRIPE = '<path d="M9 28c3 4 9 6 15 6s12-2 15-6l-1 3c-3 4-8 6-14 6s-11-2-14-6z"/>';

// 떡볶이: 비스듬히 놓인 굵은 떡 세 줄
const STICKS = [
  '<rect x="6" y="12" width="27" height="8.5" rx="4.25" transform="rotate(-24 19.5 16.25)"/>',
  '<rect x="11" y="19" width="27" height="8.5" rx="4.25" transform="rotate(-24 24.5 23.25)"/>',
  '<rect x="16" y="26" width="27" height="8.5" rx="4.25" transform="rotate(-24 29.5 30.25)"/>',
];
const FORK = '<path d="M27 27l3 1.500 4.500 13c.5 1.500-2.500 2.500-3 1z"/>';

// 구운 고기: 윗면과 두 옆면
const SLAB_TOP = '<path d="M9 21l22-7 9 6-22 8z"/>';
const SLAB_SIDES = '<path d="M9 21l9 7 22-8v6l-22 8-9-7z"/>';
const LETTUCE =
  '<path d="M5 33c-1-4 3-6 6-5 2-3 7-3 9-1 3-3 8-2 10 1 4-1 10 0 11 4 0 5-8 9-18 9S6 38 5 33z"/>';

// 비빔밥 고명
const TOPPINGS = [
  [GREEN, '<ellipse cx="14.500" cy="20.500" rx="4" ry="2.200"/>'],
  [SAUCE, '<ellipse cx="19.500" cy="17.800" rx="3.600" ry="1.800"/>'],
  [ORANGE, '<ellipse cx="28.500" cy="17.800" rx="3.600" ry="1.800"/>'],
  [RED, '<ellipse cx="33.500" cy="20.500" rx="4" ry="2.200"/>'],
  [BROWN, '<ellipse cx="24" cy="24.300" rx="6.500" ry="1.700"/>'],
];
const EGG = '<ellipse cx="24" cy="20.800" rx="5" ry="3.200"/>';
const YOLK = '<circle cx="24" cy="20.500" r="2.300"/>';

export const KIND_ICONS = {
  // 전체: 칸이 나뉜 도시락(벤토)
  all: draw(
    [
      fill(YELLOW, '<rect x="8" y="8" width="18" height="32" rx="4"/>'),
      fill(SALMON, '<rect x="30" y="8" width="10" height="14" rx="3.5"/>'),
      fill(GREEN, '<rect x="30" y="26" width="10" height="14" rx="3.5"/>'),
    ],
    '<rect x="8" y="8" width="18" height="32" rx="4"/><rect x="30" y="8" width="10" height="14" rx="3.5"/><rect x="30" y="26" width="10" height="14" rx="3.5"/>',
  ),
  // 한식: 놋그릇에 담긴 비빔밥
  korean: draw(
    [
      fill(BRASS, BODY),
      fill(BRASS, RIM),
      fill(CREAM, INNER),
      ...TOPPINGS.map(([color, shape]) => fill(color, shape)),
      fill(WHITE, EGG),
      fill(YELLOW, YOLK),
    ],
    `${BODY_LINE}${RIM}${INNER}${EGG}${YOLK}<path d="M19 21l-7 1.500M29 21l7 1.500M21.500 18.500l-2-3M26.500 18.500l2-3"/>`,
  ),
  // 고기: 상추 위에 올린 구운 고기와 양념
  meat: draw(
    [
      fill(GREEN, LETTUCE),
      fill(MEAT_SIDE, SLAB_SIDES),
      fill(MEAT_TOP, SLAB_TOP),
      fill(RED, '<ellipse cx="26" cy="18.500" rx="4.500" ry="2.800"/>'),
    ],
    `${LETTUCE}${SLAB_SIDES}${SLAB_TOP}<path d="M18 28v6"/><path d="M15.500 20.500l7 5M33 16l5 3.500"/><ellipse cx="26" cy="18.500" rx="4.300" ry="2.600"/>`,
  ),
  // 일식: 김 띠를 두른 연어 초밥
  japanese: draw(
    [
      fill(CREAM, '<path d="M10 24v7c0 3 2 5 5 5h18c3 0 5-2 5-5v-7z"/>'),
      fill(SALMON, '<path d="M6 23c2-7 9-10 18-10s16 3 18 10c-5 2-11 3-18 3S11 25 6 23z"/>'),
      fill(NORI, '<path d="M20.500 13h7l1 23h-9z"/>'),
    ],
    '<path d="M10 25v6c0 3 2 5 5 5h18c3 0 5-2 5-5v-6"/><path d="M6 23c2-7 9-10 18-10s16 3 18 10c-5 2-11 3-18 3S11 25 6 23z"/><path d="M20.500 13.500l-1 22.500M27.500 13.500l1 22.500"/><path d="M12 16.500l-1.500 6.500M16 14.500l-1 9M33 14.500l1 9M37 16.500l1.500 6.500"/>',
  ),
  // 중식: 파란 줄 그릇의 짜장면과 젓가락
  chinese: draw(
    [
      fill(WHITE, BODY),
      fill(BLUE, STRIPE),
      fill(CREAM, RIM),
      fill(YELLOW, INNER),
      fill(SAUCE, '<path d="M15 20.500c2-3 7-4 11-3s7 2.500 6 4.500-5 3-9 3-9-2-8-4.500z"/>'),
      fill(GREEN, '<circle cx="20" cy="20" r="1.500"/>'),
      fill(GREEN, '<circle cx="25" cy="21.500" r="1.500"/>'),
      fill(BROWN, '<path d="M31 3l2 .5-5 15.500-2-.5zM37 5l2 .8-8 14.200-1.800-.8z"/>'),
    ],
    `${BODY_LINE}${RIM}${INNER}<path d="M15 20.500c2-3 7-4 11-3s7 2.500 6 4.500-5 3-9 3-9-2-8-4.500z"/><path d="M31.500 3l-4.500 15.500M37.500 5.500l-7.500 14"/>`,
  ),
  // 양식: 흰 접시에 말아 올린 스파게티, 토마토와 바질
  western: draw(
    [
      fill(WHITE, '<ellipse cx="24" cy="30" rx="20" ry="9.500"/>'),
      fill(YELLOW, '<path d="M11 28c0-8 5-13 13-13s13 5 13 13c0 3-6 5-13 5s-13-2-13-5z"/>'),
      fill(RED, '<circle cx="24" cy="15.500" r="5"/>'),
      fill(GREEN, '<path d="M24 11c-1-4 1-6 3-6 1 2 0 5-3 6z"/>'),
      fill(GREEN, '<path d="M25 12c2-3 5-4 7-2-1 2-4 3-7 2z"/>'),
    ],
    '<ellipse cx="24" cy="30" rx="20" ry="9.500"/><path d="M11 28c0-8 5-13 13-13s13 5 13 13c0 3-6 5-13 5s-13-2-13-5z"/><path d="M14.500 27c2-4 5-7 9.500-7s7.500 3 9.500 7M18.500 29c1-3 3-4.500 5.500-4.500s4.500 1.500 5.500 4.500M22 31.500c.5-1.500 1.200-2 2-2s1.500.5 2 2"/><circle cx="24" cy="15.500" r="4.800"/><path d="M24 11c-1-4 1-6 3-6 1 2 0 5-3 6zM25 12c2-3 5-4 7-2-1 2-4 3-7 2z"/>',
  ),
  // 아시안: 젓가락으로 면을 들어 올린 쌀국수와 라임
  asian: draw(
    [
      fill(WHITE, BODY),
      fill(RED, STRIPE),
      fill(CREAM, RIM),
      fill(BROTH, INNER),
      fill(CREAM, '<path d="M19 8.500l11-2.500 1.500 14.500h-11z"/>'),
      fill(GREEN, '<path d="M31 19.500c1-3 5-3.500 7-1.500-1 3-4 4-7 1.500z"/>'),
      fill(RED, '<circle cx="15.500" cy="20.500" r="1.600"/>'),
      fill(BROWN, '<path d="M11 9.500l28-6.500.5 2-28 6.500zM12 14l28-6.500.5 2-28 6.500z"/>'),
    ],
    `${BODY_LINE}${RIM}${INNER}<path d="M11 10.500l28.500-6.500M12 15l28.500-6.500"/><path d="M20.500 9c-.8 4 .5 7.500 0 11.500M24 8.300c-.5 4 .5 8 .3 12.200M27.500 7.500c0 4 .8 8.500 1.200 12.800"/><path d="M31 19.500c1-3 5-3.500 7-1.500-1 3-4 4-7 1.500z"/>`,
  ),
  // 분식: 굵은 떡볶이 떡 세 줄과 포크
  snack: draw(
    [...STICKS.map((shape) => fill(TTEOK, shape)), fill(SILVER, FORK)],
    `${STICKS.join('')}${FORK}<path d="M12 15.500l9-4M17 22.500l9-4M22 29.500l5-2.200"/>`,
  ),
  // 해산물: 생선
  seafood: draw(
    [
      fill(BLUE, '<path d="M5 24c5-8 13-11 21-9 4 1 8 4 10 9-2 5-6 8-10 9-8 2-16-1-21-9z"/>'),
      fill(BLUE, '<path d="M36 24l7-7v14z"/>'),
    ],
    '<path d="M5 24c5-8 13-11 21-9 4 1 8 4 10 9-2 5-6 8-10 9-8 2-16-1-21-9z"/><path d="M36 24l7-7v14z"/><circle cx="13" cy="22" r="1.3" fill="currentColor"/><path d="M20 17.5c2 4 2 9 0 13"/>',
  ),
  // 카페·디저트: 둥근 뚜껑과 빨대가 있는 아이스 커피
  cafe: draw(
    [
      fill(COFFEE, '<path d="M13 17l2.500 23c.2 1.500 1 2.500 2.500 2.500h12c1.500 0 2.300-1 2.500-2.500L35 17z"/>'),
      fill(BROWN, '<path d="M14 25h20l-1 9H15z"/>'),
      fill(LID, '<path d="M11 17c0-6 5-10 13-10s13 4 13 10z"/>'),
      fill(BROWN, '<path d="M24.500 2h2.500l-1.500 16h-2.500z"/>'),
    ],
    '<path d="M13 17l2.500 23c.2 1.500 1 2.500 2.500 2.500h12c1.500 0 2.300-1 2.500-2.500L35 17"/><path d="M11 17c0-6 5-10 13-10s13 4 13 10z"/><path d="M14 25h20M15 34h18"/><path d="M25.500 2l-1.500 15"/><path d="M17 19.500h4v3.500h-4zM26 20h4v3h-4z"/>',
  ),
  // 술집: 거품 올라온 맥주잔
  bar: draw(
    [
      fill(YELLOW, '<path d="M12 17v21c0 2 1 3 3 3h12c2 0 3-1 3-3V17z"/>'),
      fill(CREAM, '<path d="M11 17c-3-4 0-8 4-7 1-4 7-5 9-2 3-2 8 0 8 4 2 1 2 4 0 5z"/>'),
    ],
    '<path d="M12 17v21c0 2 1 3 3 3h12c2 0 3-1 3-3V17"/><path d="M30 22h4c3 0 4 2 4 4v6c0 3-2 4-4 4h-4"/><path d="M11 17c-3-4 0-8 4-7 1-4 7-5 9-2 3-2 8 0 8 4 2 1 2 4 0 5z"/><path d="M18 23v12M24 23v12"/>',
  ),
};
