import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';

// 多账号支持:DOUYIN_PROFILE=claude(或 --profile claude)使用独立的登录态目录,
// 例如给 Claude 自己的小号用,和主账号互不影响
const PROFILE =
  process.env.DOUYIN_PROFILE ||
  (() => {
    const i = process.argv.indexOf('--profile');
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : '';
  })();

// 登录态(cookie、localStorage)保存在用户目录下,扫码登录一次后续可复用
export const USER_DATA_DIR =
  process.env.DOUYIN_USER_DATA_DIR ||
  path.join(os.homedir(), '.douyin-claude-plugin', PROFILE ? `user-data-${PROFILE}` : 'user-data');

export async function launch({ headless = true } = {}) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  const options = {
    headless,
    viewport: { width: 1400, height: 900 },
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai',
    args: ['--disable-blink-features=AutomationControlled'],
  };
  // 依次尝试:Playwright 自带 Chromium → 本机 Chrome → 本机 Edge。
  // 国内下载 Playwright 浏览器经常失败,直接用系统已装的浏览器即可。
  // 也可用环境变量 DOUYIN_BROWSER=chrome|msedge|chromium 强制指定。
  const channels = process.env.DOUYIN_BROWSER
    ? [process.env.DOUYIN_BROWSER === 'chromium' ? undefined : process.env.DOUYIN_BROWSER]
    : [undefined, 'chrome', 'msedge'];
  let lastErr;
  for (const channel of channels) {
    try {
      const context = await chromium.launchPersistentContext(USER_DATA_DIR, { ...options, channel });
      // 降低被风控识别为自动化的概率
      await context.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });
      return context;
    } catch (e) {
      lastErr = e;
      if (!/Executable doesn't exist|install/i.test(String(e))) throw e;
    }
  }
  console.error('没有找到可用的浏览器:Playwright 自带 Chromium、本机 Chrome、本机 Edge 都不可用。');
  console.error('请安装 Chrome/Edge,或运行 npx playwright install chromium 后重试。');
  throw lastErr;
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
