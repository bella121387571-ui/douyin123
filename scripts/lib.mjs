import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// 登录态(cookie、localStorage)保存在用户目录下,扫码登录一次后续可复用
export const USER_DATA_DIR =
  process.env.DOUYIN_USER_DATA_DIR ||
  path.join(os.homedir(), '.douyin-claude-plugin', 'user-data');

export async function launch({ headless = true } = {}) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
    headless,
    viewport: { width: 1400, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    args: ['--disable-blink-features=AutomationControlled'],
  });
  return context;
}

// 是否已登录:看 douyin.com 域下有没有 sessionid cookie
export async function isLoggedIn(context) {
  const cookies = await context.cookies('https://www.douyin.com');
  return cookies.some((c) => c.name === 'sessionid' && c.value);
}

export function requireLoginHint() {
  console.error('尚未登录抖音。请先运行: node scripts/login.mjs (会打开浏览器窗口,用抖音 App 扫码登录)');
  process.exit(2);
}

// 把接口返回的视频列表统一整理成简洁结构
export function normalizeAweme(a) {
  if (!a || !a.aweme_id) return null;
  const stats = a.statistics || {};
  return {
    id: a.aweme_id,
    url: `https://www.douyin.com/video/${a.aweme_id}`,
    desc: (a.desc || '').trim(),
    author: a.author?.nickname || '',
    likes: stats.digg_count ?? null,
    comments: stats.comment_count ?? null,
    shares: stats.share_count ?? null,
    duration_sec: a.video?.duration ? Math.round(a.video.duration / 1000) : null,
  };
}

export function getArg(name, fallback = undefined) {
  const i = process.argv.indexOf(`--${name}`);
  if (i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) {
    return process.argv[i + 1];
  }
  return fallback;
}

export function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}
