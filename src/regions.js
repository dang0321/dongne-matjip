/**
 * 시/도와 시/군/구 목록.
 * 인천은 2026년 7월 개편(제물포구·영종구·검단구)을 넣되, 블로그 글에 여전히 많이 쓰이는
 * 예전 이름(중구·동구)도 함께 둔다. 주소 필터가 느슨해서 어느 쪽을 골라도 검색된다.
 */
export const SIDO = [
  {
    name: '서울특별시',
    short: '서울',
    districts: [
      '강남구', '강동구', '강북구', '강서구', '관악구', '광진구', '구로구', '금천구', '노원구',
      '도봉구', '동대문구', '동작구', '마포구', '서대문구', '서초구', '성동구', '성북구', '송파구',
      '양천구', '영등포구', '용산구', '은평구', '종로구', '중구', '중랑구',
    ],
  },
  {
    name: '부산광역시',
    short: '부산',
    districts: [
      '강서구', '금정구', '기장군', '남구', '동구', '동래구', '부산진구', '북구', '사상구',
      '사하구', '서구', '수영구', '연제구', '영도구', '중구', '해운대구',
    ],
  },
  {
    name: '대구광역시',
    short: '대구',
    districts: ['군위군', '남구', '달서구', '달성군', '동구', '북구', '서구', '수성구', '중구'],
  },
  {
    name: '인천광역시',
    short: '인천',
    districts: [
      '강화군', '검단구', '계양구', '남동구', '동구', '미추홀구', '부평구', '서구', '연수구',
      '영종구', '옹진군', '제물포구', '중구',
    ],
  },
  { name: '광주광역시', short: '광주', districts: ['광산구', '남구', '동구', '북구', '서구'] },
  { name: '대전광역시', short: '대전', districts: ['대덕구', '동구', '서구', '유성구', '중구'] },
  { name: '울산광역시', short: '울산', districts: ['남구', '동구', '북구', '울주군', '중구'] },
  { name: '세종특별자치시', short: '세종', districts: [] },
  {
    name: '경기도',
    short: '경기',
    districts: [
      '가평군', '고양시', '과천시', '광명시', '광주시', '구리시', '군포시', '김포시', '남양주시',
      '동두천시', '부천시', '성남시', '수원시', '시흥시', '안산시', '안성시', '안양시', '양주시',
      '양평군', '여주시', '연천군', '오산시', '용인시', '의왕시', '의정부시', '이천시', '파주시',
      '평택시', '포천시', '하남시', '화성시',
    ],
  },
  {
    name: '강원특별자치도',
    short: '강원',
    aliases: ['강원도'],
    districts: [
      '강릉시', '고성군', '동해시', '삼척시', '속초시', '양구군', '양양군', '영월군', '원주시',
      '인제군', '정선군', '철원군', '춘천시', '태백시', '평창군', '홍천군', '화천군', '횡성군',
    ],
  },
  {
    name: '충청북도',
    short: '충북',
    districts: [
      '괴산군', '단양군', '보은군', '영동군', '옥천군', '음성군', '제천시', '증평군', '진천군',
      '청주시', '충주시',
    ],
  },
  {
    name: '충청남도',
    short: '충남',
    districts: [
      '계룡시', '공주시', '금산군', '논산시', '당진시', '보령시', '부여군', '서산시', '서천군',
      '아산시', '예산군', '천안시', '청양군', '태안군', '홍성군',
    ],
  },
  {
    name: '전북특별자치도',
    short: '전북',
    aliases: ['전라북도'],
    districts: [
      '고창군', '군산시', '김제시', '남원시', '무주군', '부안군', '순창군', '완주군', '익산시',
      '임실군', '장수군', '전주시', '정읍시', '진안군',
    ],
  },
  {
    name: '전라남도',
    short: '전남',
    districts: [
      '강진군', '고흥군', '곡성군', '광양시', '구례군', '나주시', '담양군', '목포시', '무안군',
      '보성군', '순천시', '신안군', '여수시', '영광군', '영암군', '완도군', '장성군', '장흥군',
      '진도군', '함평군', '해남군', '화순군',
    ],
  },
  {
    name: '경상북도',
    short: '경북',
    districts: [
      '경산시', '경주시', '고령군', '구미시', '김천시', '문경시', '봉화군', '상주시', '성주군',
      '안동시', '영덕군', '영양군', '영주시', '영천시', '예천군', '울릉군', '울진군', '의성군',
      '청도군', '청송군', '칠곡군', '포항시',
    ],
  },
  {
    name: '경상남도',
    short: '경남',
    districts: [
      '거제시', '거창군', '고성군', '김해시', '남해군', '밀양시', '사천시', '산청군', '양산시',
      '의령군', '진주시', '창녕군', '창원시', '통영시', '하동군', '함안군', '함양군', '합천군',
    ],
  },
  {
    name: '제주특별자치도',
    short: '제주',
    aliases: ['제주도'],
    districts: ['서귀포시', '제주시'],
  },
];

export const HOT_SPOTS = [
  { label: '성수동', sido: '서울특별시', sigungu: '성동구', detail: '성수동' },
  { label: '홍대', sido: '서울특별시', sigungu: '마포구', detail: '홍대' },
  { label: '을지로', sido: '서울특별시', sigungu: '중구', detail: '을지로' },
  { label: '강남역', sido: '서울특별시', sigungu: '강남구', detail: '강남역' },
  { label: '이태원', sido: '서울특별시', sigungu: '용산구', detail: '이태원' },
  { label: '수원 행궁동', sido: '경기도', sigungu: '수원시', detail: '행궁동' },
  { label: '부산 해운대', sido: '부산광역시', sigungu: '해운대구', detail: '해운대' },
  { label: '대구 동성로', sido: '대구광역시', sigungu: '중구', detail: '동성로' },
  { label: '전주 한옥마을', sido: '전북특별자치도', sigungu: '전주시', detail: '전주 한옥마을' },
  { label: '경주 황리단길', sido: '경상북도', sigungu: '경주시', detail: '황리단길' },
  { label: '강릉', sido: '강원특별자치도', sigungu: '강릉시', detail: '' },
  { label: '제주 애월', sido: '제주특별자치도', sigungu: '제주시', detail: '애월' },
];

/** 음식 종류마다 후보를 모을 때 쓰는 검색어. 지역 검색은 한 번에 5곳만 주므로 여러 번 나눠 묻는다. */
export const CATEGORIES = [
  { id: 'all', label: '전체', keywords: ['맛집', '한식', '고기집', '일식', '중식', '양식', '분식', '국밥', '술집', '횟집'] },
  { id: 'korean', label: '한식', keywords: ['한식 맛집', '한정식', '국밥', '찌개', '백반', '칼국수'] },
  { id: 'meat', label: '고기', keywords: ['고기집', '삼겹살', '소고기', '갈비', '곱창'] },
  { id: 'japanese', label: '일식', keywords: ['일식 맛집', '초밥', '라멘', '돈카츠', '우동'] },
  { id: 'chinese', label: '중식', keywords: ['중식 맛집', '중국집', '짜장면', '마라탕', '양꼬치'] },
  { id: 'western', label: '양식', keywords: ['양식 맛집', '파스타', '피자', '스테이크', '브런치'] },
  { id: 'asian', label: '아시안', keywords: ['아시아음식', '쌀국수', '태국음식', '베트남음식', '인도커리'] },
  { id: 'snack', label: '분식', keywords: ['분식', '떡볶이', '김밥', '만두'] },
  { id: 'seafood', label: '해산물', keywords: ['횟집', '해산물', '조개구이', '생선구이'] },
  { id: 'cafe', label: '카페·디저트', keywords: ['카페', '디저트', '베이커리', '빵집'] },
  { id: 'bar', label: '술집', keywords: ['술집', '이자카야', '포차', '와인바', '호프'] },
];

export class AreaError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AreaError';
  }
}

function cleanDetail(detail) {
  return String(detail ?? '')
    .normalize('NFC')
    .replace(/[^0-9A-Za-z가-힣\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 30);
}

/** 블로그 검색에 붙일 짧은 지역 이름. 이름이 겹치는 구·군에는 시/도 약칭을 붙인다. */
function reviewNameFor(sido, sigungu) {
  const shared = SIDO.filter((s) => s.districts.includes(sigungu)).length > 1;
  const stem = /[시군]$/.test(sigungu) && sigungu.length >= 3 ? sigungu.slice(0, -1) : sigungu;
  const sameAsOtherSido = SIDO.some((s) => s !== sido && s.short === stem);
  return shared || sameAsOtherSido || sigungu.length <= 2 ? `${sido.short} ${stem}` : stem;
}

/**
 * 고른 지역을 검색에 쓸 문자열들로 바꾼다.
 * - label: 화면에 보여 줄 이름
 * - searchArea: 식당 후보를 찾을 때 붙이는 지역어
 * - reviewArea: 블로그 리뷰를 찾을 때 붙이는 짧은 지역어
 * - addressAny: 후보 주소에 이 중 하나가 들어 있어야 그 지역 식당으로 본다
 */
export function resolveArea({ sido = '', sigungu = '', detail = '' } = {}) {
  const place = cleanDetail(detail);
  const province = sido ? SIDO.find((s) => s.name === sido) : null;
  if (sido && !province) throw new AreaError('목록에 없는 시/도입니다.');
  if (sigungu && !province?.districts.includes(sigungu)) throw new AreaError('목록에 없는 시/군/구입니다.');
  if (!province && !place) throw new AreaError('시/도를 고르거나 동네 이름을 입력하세요.');

  const label = [province?.short, sigungu, place].filter(Boolean).join(' ');
  const reviewArea = place || (sigungu ? reviewNameFor(province, sigungu) : province.short);

  let addressAny = [];
  if (sigungu && !place) addressAny = [sigungu];
  else if (province) addressAny = [province.name, province.short, ...(province.aliases ?? [])];

  return { label, searchArea: label, reviewArea, addressAny };
}
