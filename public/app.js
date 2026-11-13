import { KIND_ICONS } from './icons.js';
import { rank } from './lib/rank.js';

const $ = (id) => document.getElementById(id);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(href, text, className = '') {
  const a = el('a', className, text);
  a.href = href;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  return a;
}

const form = $('search-form');
const sidoSelect = $('sido');
const sigunguSelect = $('sigungu');
const detailInput = $('detail');
const goButton = $('go');
const statusLine = $('status');
const progress = $('progress');
const progressBar = $('progress-bar');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

let regions = { sido: [], hotSpots: [], categories: [], limits: [] };
let searchTurn = 0;
/** 운영자가 키를 넣어 둔 공개 사이트인가. 그렇다면 방문자에게 키 입력 화면을 보이지 않는다. */
let managed = false;

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || '요청을 처리하지 못했습니다.');
  return data;
}

/** 화면 아래 검은 알약(토스트)에 진행 상황이나 오류를 띄운다. 빈 문자열이면 숨긴다. */
function setStatus(text, isError = false) {
  const toast = $('toast');
  statusLine.textContent = text;
  toast.dataset.show = text ? 'true' : 'false';
  toast.classList.toggle('toast--error', isError);
}

function showOnly(id) {
  for (const name of ['guide', 'notice', 'results']) $(name).hidden = name !== id;
}

function showNotice(title, body) {
  $('notice-title').textContent = title;
  $('notice-body').textContent = body;
  showOnly('notice');
}

let configured = false;

function openSetup(message = '') {
  $('setup').hidden = false;
  $('setup-msg').textContent = message;
  $('close-setup').hidden = !configured; // 키가 아직 없으면 닫을 이유가 없다
}

/* ---------- 지역 고르기 ---------- */

function fillSigungu() {
  const sido = regions.sido.find((item) => item.name === sidoSelect.value);
  const districts = sido?.districts ?? [];
  let placeholder = '시/도를 먼저 고르세요';
  if (sido) placeholder = districts.length ? '전체' : '구/군 없음';
  sigunguSelect.replaceChildren(new Option(placeholder, ''));
  for (const name of districts) sigunguSelect.add(new Option(name, name));
  sigunguSelect.disabled = districts.length === 0;
}

function buildPicker() {
  for (const sido of regions.sido) sidoSelect.add(new Option(sido.name, sido.name));

  const kinds = $('categories');
  regions.categories.forEach((category, index) => {
    const label = el('label', 'kind');
    const input = el('input');
    input.type = 'radio';
    input.name = 'category';
    input.value = category.id;
    input.checked = index === 0;
    // 원 안에는 대표 메뉴 그림을 넣고, 그림이 없는 종류는 이름 첫 글자로 대신한다
    const icon = el('span', 'kind__icon');
    if (KIND_ICONS[category.id]) icon.innerHTML = KIND_ICONS[category.id];
    else icon.textContent = category.label[0];
    icon.setAttribute('aria-hidden', 'true');
    label.append(input, icon, el('span', 'kind__label', category.label));
    kinds.append(label);
  });

  const limitSelect = $('limit');
  for (const limit of regions.limits) limitSelect.add(new Option(`${limit}곳`, String(limit)));
  limitSelect.value = '15';

  const hotspots = $('hotspots');
  for (const spot of regions.hotSpots) {
    const item = el('li');
    const button = el('button', 'chip', spot.label);
    button.type = 'button';
    button.addEventListener('click', () => {
      sidoSelect.value = spot.sido;
      fillSigungu();
      sigunguSelect.value = spot.sigungu;
      detailInput.value = spot.detail;
      search();
    });
    item.append(button);
    hotspots.append(item);
  }
}

/* ---------- 검색 ---------- */

function setBusy(busy) {
  goButton.disabled = busy;
  progress.hidden = !busy;
  if (!busy) progressBar.style.width = '0';
}

/** 서버에 묻는다. 실패하면 kind(오류 종류)가 붙은 Error를 던진다. */
async function api(url) {
  let response;
  try {
    response = await fetch(url);
  } catch {
    throw Object.assign(new Error('서버와 연결이 끊겼습니다. 잠시 뒤 다시 찾아보세요.'), { kind: 'connection' });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw Object.assign(new Error(data.message || '요청을 처리하지 못했습니다.'), { kind: data.kind ?? 'server' });
  }
  return data;
}

function showProgress(share, text) {
  progressBar.style.width = `${(share * 100).toFixed(1)}%`;
  setStatus(text);
}

/**
 * 검색은 세 단계다. 서버는 네이버에서 자료만 가져오고, 점수는 여기(브라우저)에서 매긴다.
 *  1) 후보 식당 모으기  2) 후보를 10곳씩 나눠 블로그 리뷰 가져오기  3) 점수 계산
 */
async function search() {
  if (!sidoSelect.value && !detailInput.value.trim()) {
    setStatus('시/도를 고르거나 동네 이름을 입력하세요.', true);
    sidoSelect.focus();
    return;
  }
  const turn = ++searchTurn; // 검색 중에 다시 찾으면 앞선 검색 결과는 버린다
  const limit = Number($('limit').value);
  const params = new URLSearchParams({
    sido: sidoSelect.value,
    sigungu: sigunguSelect.value,
    detail: detailInput.value.trim(),
    category: form.elements.category.value,
  });
  setBusy(true);
  showProgress(0.05, '식당 후보를 모으는 중');

  try {
    const found = await api(`/api/discover?${params}`);
    if (turn !== searchTurn) return;

    const batches = Math.ceil(found.places.length / found.batchSize);
    let done = 0;
    showProgress(0.4, `블로그 리뷰를 읽는 중 (0/${found.places.length})`);
    const parts = await Promise.all(
      Array.from({ length: batches }, async (_, batch) => {
        const part = await api(`/api/reviews?${params}&batch=${batch}`);
        done += part.items.length;
        if (turn === searchTurn) {
          showProgress(0.4 + 0.6 * (done / found.places.length), `블로그 리뷰를 읽는 중 (${done}/${found.places.length})`);
        }
        return part;
      }),
    );
    if (turn !== searchTurn) return;

    const reviews = parts.sort((a, b) => a.batch - b.batch).flatMap((part) => part.items);
    const ranked = rank(found.places, reviews);
    renderResults({
      area: found.area,
      category: found.category,
      candidateCount: found.candidateCount,
      analyzedCount: found.places.length,
      postsRead: ranked.postsRead,
      places: ranked.places.slice(0, limit),
    });
  } catch (error) {
    if (turn === searchTurn) renderFailure({ kind: error.kind ?? 'server', message: error.message });
  } finally {
    if (turn === searchTurn) setBusy(false);
  }
}

function renderFailure({ kind, message }) {
  if (kind === 'input' || kind === 'busy') {
    setStatus(message, true);
    return;
  }
  setStatus('');
  if (!managed && (kind === 'setup' || kind === 'auth' || kind === 'permission')) {
    openSetup(kind === 'setup' ? '' : message);
    showNotice('네이버 API 키를 확인하세요', message);
    $('setup').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
    return;
  }
  const titles = {
    setup: '아직 준비 중입니다',
    auth: '지금은 검색할 수 없습니다',
    permission: '지금은 검색할 수 없습니다',
    quota: '오늘 검색 한도를 다 썼습니다',
    rate: '잠시 뒤 다시 찾아보세요',
    network: '네이버에 연결하지 못했습니다',
    connection: '연결이 끊겼습니다',
    expired: '다시 찾아보세요',
  };
  const body =
    managed && (kind === 'auth' || kind === 'permission' || kind === 'setup')
      ? '사이트 설정에 문제가 있습니다. 운영자가 확인할 때까지 기다려 주세요.'
      : message;
  showNotice(titles[kind] ?? '순위를 만들지 못했습니다', body);
}

/* ---------- 순위표 ---------- */

const PARTS = [
  ['volume', '리뷰량'],
  ['authenticity', '내돈내산'],
  ['sentiment', '글의 표현'],
  ['recency', '최근 반응'],
  ['local', '동네 인기'],
];

function renderPlace(place, index) {
  const item = el('li', index < 3 ? 'place place--top' : 'place');
  const rank = el('div', 'place__rank', String(index + 1));
  rank.setAttribute('aria-hidden', 'true');

  const body = el('div', 'place__body');

  const line = el('div', 'place__line');
  const score = el('span', 'place__score', String(place.score));
  score.append(el('small', '', '점'));
  line.append(el('h3', 'place__name', place.name), score);

  const meta = el('p', 'place__meta');
  if (place.category) meta.append(el('span', '', place.category.split('>').join(' › ')));
  if (place.address) meta.append(el('span', '', place.address));

  const tags = el('ul', 'tags');
  for (const reason of place.reasons) {
    tags.append(el('li', reason.tone === 'plain' ? 'tag' : `tag tag--${reason.tone}`, reason.text));
  }

  const bars = el('dl', 'bars');
  for (const [key, label] of PARTS) {
    const percent = Math.round((place.parts[key] ?? 0) * 100);
    const group = el('div');
    const track = el('dd');
    const fill = el('i');
    fill.style.width = `${percent}%`;
    track.append(fill);
    track.setAttribute('aria-label', `${percent}%`);
    group.append(el('dt', '', label), track);
    bars.append(group);
  }

  const more = el('div', 'place__more');
  if (place.reviews.samples.length) {
    const details = el('details', 'reviews');
    details.append(el('summary', '', `블로그 리뷰 ${place.reviews.samples.length}건 읽기`));
    const list = el('ul');
    for (const sample of place.reviews.samples) {
      const row = el('li');
      row.append(sample.link ? link(sample.link, sample.title) : el('strong', '', sample.title));
      row.append(el('p', '', sample.snippet));
      const by = [sample.blogger, sample.date.replaceAll('-', '.'), sample.sponsored ? '협찬 표시 있음' : '']
        .filter(Boolean)
        .join(' / ');
      row.append(el('small', '', by));
      list.append(row);
    }
    details.append(list);
    more.append(details);
  }
  more.append(link(place.mapUrl, '네이버 지도에서 보기', 'btn btn--ghost'));
  if (place.homepage) more.append(link(place.homepage, '홈페이지', 'btn btn--ghost'));
  if (place.telephone) more.append(el('span', 'place__tel', place.telephone));

  body.append(line, meta, tags, bars, more);
  item.append(rank, body);
  return item;
}

function renderResults(data) {
  setStatus('');
  if (!data.places.length) {
    showNotice(
      `${data.area}에서 식당을 찾지 못했습니다`,
      '동네 이름의 철자를 확인하거나, 구 단위처럼 더 넓은 지역으로 다시 찾아보세요.',
    );
    return;
  }
  const kind = data.category === '전체' ? '' : ` ${data.category}`;
  $('results-title').textContent = `${data.area}${kind} 추천 ${data.places.length}곳`;
  $('results-sub').textContent =
    `후보 ${data.candidateCount}곳 가운데 ${data.analyzedCount}곳의 블로그 글 ` +
    `${data.postsRead.toLocaleString('ko-KR')}개를 읽고 순위를 매겼습니다.`;
  $('list').replaceChildren(...data.places.map(renderPlace));
  showOnly('results');
  $('results').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
}

/* ---------- 키 설정 ---------- */

$('setup-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = $('save-keys');
  const message = $('setup-msg');
  button.disabled = true;
  message.textContent = '';
  try {
    await requestJson('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: $('client-id').value, clientSecret: $('client-secret').value }),
    });
    $('setup-form').reset();
    $('setup').hidden = true;
    configured = true;
    showOnly('guide');
    setStatus('키를 저장했습니다. 지역을 고르고 맛집을 찾아보세요.');
  } catch (error) {
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

$('close-setup').addEventListener('click', () => {
  $('setup').hidden = true;
  $('open-setup').focus();
});

$('open-setup').addEventListener('click', () => {
  openSetup();
  $('setup').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  $('client-id').focus({ preventScroll: true });
});

sidoSelect.addEventListener('change', fillSigungu);
form.addEventListener('submit', (event) => {
  event.preventDefault();
  search();
});

try {
  const [regionData, status] = await Promise.all([requestJson('/api/regions'), requestJson('/api/status')]);
  regions = regionData;
  buildPicker();
  if (status.notice) {
    $('banner').textContent = status.notice;
    $('banner').hidden = false;
  }
  configured = status.configured;
  managed = Boolean(status.managed);
  $('open-setup').hidden = managed;
  if (managed && !configured) showNotice('아직 준비 중입니다', '사이트 설정이 끝나지 않았습니다. 잠시 뒤 다시 들러 주세요.');
  else if (!configured) openSetup();
} catch {
  showNotice('프로그램을 불러오지 못했습니다', '서버가 켜져 있는지 확인하고 화면을 새로 고치세요.');
}
