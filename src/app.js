/**
 * 내 컴퓨터에서 돌리는 Node 서버. 화면 파일을 주고, 네이버 키를 받아 .env에 저장하고,
 * 나머지 /api 요청은 src/core.js에 넘긴다.
 */
import http from 'node:http';
import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';
import { handleApi } from './core.js';
import { createNaverClient, NaverError, PROVIDERS } from './naver.js';

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
};
const KEY_PATTERN = /^[A-Za-z0-9_-]{5,100}$/;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);
const CACHE_MAX = 300;

export function parseEnv(text) {
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line.replace(/^﻿/, ''));
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

async function readEnvFile(file) {
  try {
    return parseEnv(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function saveKeys(file, { clientId, clientSecret, provider }) {
  let lines = [];
  try {
    lines = (await readFile(file, 'utf8')).split(/\r?\n/);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  lines = lines.filter(
    (line) => line.trim() !== '' && !/^\s*NAVER_(CLIENT_ID|CLIENT_SECRET|API_PROVIDER)\s*=/.test(line),
  );
  lines.push(`NAVER_API_PROVIDER=${provider}`, `NAVER_CLIENT_ID=${clientId}`, `NAVER_CLIENT_SECRET=${clientSecret}`);
  await writeFile(file, `${lines.join('\n')}\n`, { mode: 0o600 });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req, limit = 10_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('요청이 너무 큽니다.'), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw Object.assign(new Error('요청 형식이 올바르지 않습니다.'), { status: 400 });
  }
}

/** 폴더 안의 화면 파일을 읽어 주는 함수를 만든다. 폴더 밖 경로나 없는 파일은 null. */
export function diskAssets(directory) {
  return async (relative) => {
    const file = path.resolve(directory, relative);
    if (!file.startsWith(directory + path.sep)) return null;
    try {
      return await readFile(file);
    } catch {
      return null;
    }
  };
}

async function serveStatic(res, pathname, readAsset) {
  let relative;
  try {
    relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  } catch {
    relative = '';
  }
  const type = CONTENT_TYPES[path.extname(relative)];
  const data = relative && type ? await readAsset(relative) : null;
  if (!data) return sendJson(res, 404, { message: '없는 주소입니다.' });
  res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache' });
  res.end(data);
}

/** 프로그램이 켜져 있는 동안 메모리에만 두는 임시 보관소. 디스크에는 아무것도 남기지 않는다. */
function memoryCache() {
  const entries = new Map();
  return {
    async get(key) {
      const entry = entries.get(key);
      if (!entry) return null;
      if (entry.expires < Date.now()) {
        entries.delete(key);
        return null;
      }
      return entry.value;
    },
    async put(key, value, ttlSeconds) {
      entries.set(key, { value, expires: Date.now() + ttlSeconds * 1000 });
      if (entries.size > CACHE_MAX) entries.delete(entries.keys().next().value);
    },
    clear: () => entries.clear(),
  };
}

/**
 * HTTP 서버를 만든다(listen은 호출하는 쪽에서).
 * - envFile: 네이버 키를 읽고 저장할 .env 파일 경로
 * - readAsset(relativePath): 화면 파일 내용을 주는 함수(없으면 null)
 * - credentials({ clientId, clientSecret, provider? })를 주지 않으면 환경 변수와 envFile에서 읽는다.
 * - baseUrl은 테스트에서 가짜 네이버 서버를 가리킬 때만 쓴다.
 */
export async function createApp({
  envFile,
  readAsset,
  baseUrl = process.env.NAVER_API_BASE || undefined,
  credentials,
  notice = '',
  clientOptions = {},
} = {}) {
  let keys = null; // { clientId, clientSecret }
  let provider = null; // 'hub' | 'legacy' | null(아직 모름)
  let client = null;
  const cache = memoryCache();

  const makeClient = (clientKeys, clientProvider, extra = {}) =>
    createNaverClient({ ...clientKeys, provider: clientProvider, baseUrl, ...clientOptions, ...extra });

  /** 키가 API HUB 것인지 개발자센터 것인지 실제로 한 번씩 불러서 알아낸다. */
  async function detectProvider(clientKeys) {
    let firstError;
    for (const candidate of Object.keys(PROVIDERS)) {
      try {
        await makeClient(clientKeys, candidate, { retries: 1 }).searchBlog('맛집', { display: 1 });
        return candidate;
      } catch (error) {
        if (!(error instanceof NaverError)) throw error;
        firstError ??= error;
        // 인증 문제가 아니면(네트워크 등) 다른 창구를 시도해도 소용없다
        if (error.kind !== 'auth' && error.kind !== 'permission') throw error;
      }
    }
    throw firstError;
  }

  function useKeys(clientKeys, clientProvider = null) {
    keys = clientKeys;
    provider = PROVIDERS[clientProvider] ? clientProvider : null;
    client = provider ? makeClient(keys, provider) : null;
    cache.clear();
  }

  if (credentials === undefined) {
    const env = { ...(await readEnvFile(envFile)), ...process.env };
    if (env.NAVER_CLIENT_ID && env.NAVER_CLIENT_SECRET) {
      useKeys({ clientId: env.NAVER_CLIENT_ID, clientSecret: env.NAVER_CLIENT_SECRET }, env.NAVER_API_PROVIDER);
    }
  } else if (credentials) {
    const { provider: given, ...rest } = credentials;
    useKeys(rest, given);
  }

  const apiEnv = {
    cache,
    async getClient() {
      if (!keys) return null;
      if (!client) useKeys(keys, await detectProvider(keys));
      return client;
    },
    allow: async () => true, // 혼자 쓰는 프로그램이라 횟수 제한이 없다
    status: () => ({ configured: Boolean(keys), provider, managed: false, notice }),
  };

  async function handleConfig(req, res) {
    if (!/^application\/json\b/i.test(req.headers['content-type'] || '')) {
      return sendJson(res, 415, { message: 'JSON으로 보내야 합니다.' });
    }
    const body = await readJsonBody(req);
    const clientKeys = {
      clientId: String(body.clientId ?? '').trim(),
      clientSecret: String(body.clientSecret ?? '').trim(),
    };
    if (!KEY_PATTERN.test(clientKeys.clientId) || !KEY_PATTERN.test(clientKeys.clientSecret)) {
      return sendJson(res, 400, { message: 'Client ID와 Client Secret을 정확히 붙여 넣었는지 확인하세요.' });
    }
    let detected;
    try {
      detected = await detectProvider(clientKeys);
    } catch (error) {
      if (error instanceof NaverError) return sendJson(res, 400, { kind: error.kind, message: error.message });
      throw error;
    }
    await saveKeys(envFile, { ...clientKeys, provider: detected });
    useKeys(clientKeys, detected);
    sendJson(res, 200, { configured: true, provider: detected });
  }

  return http.createServer(async (req, res) => {
    try {
      // 이 컴퓨터에서 연 화면의 요청만 받는다(다른 사이트가 몰래 호출하는 것을 막는다).
      const host = String(req.headers.host || '').replace(/:\d+$/, '');
      if (!LOCAL_HOSTS.has(host)) return sendJson(res, 403, { message: '이 주소로는 접속할 수 없습니다.' });
      const url = new URL(req.url, `http://${req.headers.host}`);

      if (req.method === 'POST') {
        const origin = req.headers.origin;
        let sameOrigin = true;
        if (origin) {
          try {
            sameOrigin = new URL(origin).host === req.headers.host;
          } catch {
            sameOrigin = false;
          }
        }
        if (!sameOrigin) return sendJson(res, 403, { message: '허용되지 않은 요청입니다.' });
        if (url.pathname === '/api/config') return await handleConfig(req, res);
        return sendJson(res, 404, { message: '없는 주소입니다.' });
      }

      if (url.pathname.startsWith('/api/')) {
        const response = await handleApi(new Request(url, { method: req.method }), apiEnv);
        res.writeHead(response.status, Object.fromEntries(response.headers));
        return res.end(await response.text());
      }
      if (req.method !== 'GET') return sendJson(res, 405, { message: '지원하지 않는 요청입니다.' });
      return await serveStatic(res, url.pathname, readAsset);
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent) {
        sendJson(res, error.status || 500, { message: error.status ? error.message : '서버 오류가 발생했습니다.' });
      } else res.end();
    }
  });
}
