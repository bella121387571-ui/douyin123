import { chromium } from 'playwright';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { execSync } from 'node:child_process';

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
    // 每个浏览器渠道最多试两次:第一次失败(多半是上次残留的浏览器进程还锁着
    // 登录态目录)就清掉残留进程再试一次
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const context = await chromium.launchPersistentContext(USER_DATA_DIR, {
          ...options,
          channel,
          timeout: 45000, // 启动卡住时快速失败,而不是无限等待
        });
        // 降低被风控识别为自动化的概率
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        return context;
      } catch (e) {
        lastErr = e;
        if (/Executable doesn't exist|install/i.test(String(e))) break; // 没装这个浏览器,换下一个
        if (attempt === 0) {
          console.error('浏览器启动失败,清理残留的自动化浏览器进程后重试……');
          killStaleBrowsers();
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw e;
      }
    }
  }
  console.error('没有找到可用的浏览器:Playwright 自带 Chromium、本机 Chrome、本机 Edge 都不可用。');
  console.error('请安装 Chrome/Edge,或运行 npx playwright install chromium 后重试。');
  throw lastErr;
}

// 清理残留的自动化浏览器进程:只杀命令行里带我们登录态目录名的进程,
// 不会影响用户自己打开的浏览器
export function killStaleBrowsers() {
  try {
    if (process.platform === 'win32') {
      execSync(
        `powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*douyin-claude-plugin*' -and $_.Name -match 'chrome|msedge|chromium' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"`,
        { stdio: 'ignore' }
      );
    } else {
      execSync("pkill -f 'douyin-claude-plugin' || true", { stdio: 'ignore' });
    }
  } catch {
    /* 清理失败不阻塞主流程 */
  }
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
  // 图文帖(图片合集)没有视频,链接走 /note/;视频帖走 /video/
  const isImages = Array.isArray(a.images) && a.images.length > 0;
  return {
    id: a.aweme_id,
    type: isImages ? '图文' : '视频',
    image_count: isImages ? a.images.length : undefined,
    url: `https://www.douyin.com/${isImages ? 'note' : 'video'}/${a.aweme_id}`,
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
