// 「看」视频:打开视频页静音播放,按时间顺序截取若干帧画面,并抓取文案和热评。
// 截图存到 .douyin-data/watch/ 下,供 Claude 读图理解视频内容。
// 用法: node scripts/watch.mjs --url "https://www.douyin.com/video/xxx" [--frames 6] [--interval 2]
import fs from 'node:fs';
import path from 'node:path';
import { launch, getArg, hasFlag } from './lib.mjs';

const url = getArg('url');
if (!url) {
  console.error('用法: node scripts/watch.mjs --url "视频链接" [--frames 6] [--interval 2]');
  process.exit(2);
}
const FRAMES = Math.min(parseInt(getArg('frames', '6'), 10), 12);
const INTERVAL = parseFloat(getArg('interval', '2'));

const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(6000);

const video = page.locator('video').first();
if ((await video.count()) === 0) {
  console.error('页面里没找到视频播放器。确认链接是视频页(https://www.douyin.com/video/...);');
  console.error('如果弹了滑块验证,请在窗口里完成后重试。');
  await context.close();
  process.exit(1);
}

// 静音、从头播放,避免吵到用户也保证截到开头的画面
await page.evaluate(() => {
  const v = document.querySelector('video');
  if (v) {
    v.muted = true;
    v.currentTime = 0;
    v.play().catch(() => {});
  }
});
await page.waitForTimeout(1500);

// 顺手清理 24 小时前的旧截图,防止磁盘堆积(独立清理见 scripts/cleanup.mjs)
const watchBase = path.join(process.cwd(), '.douyin-data', 'watch');
try {
  for (const name of fs.readdirSync(watchBase)) {
    const p = path.join(watchBase, name);
    if (Date.now() - fs.statSync(p).mtimeMs > 24 * 3600 * 1000) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  }
} catch {
  /* 目录不存在等情况,忽略 */
}

const id = (url.match(/video\/(\d+)/) || [])[1] || String(Date.now());
const dir = path.join(watchBase, id);
fs.mkdirSync(dir, { recursive: true });

const framePaths = [];
for (let i = 0; i < FRAMES; i++) {
  const file = path.join(dir, `frame-${String(i + 1).padStart(2, '0')}.png`);
  try {
    await video.screenshot({ path: file });
    framePaths.push(file);
  } catch {
    /* 某帧截失败就跳过 */
  }
  await page.waitForTimeout(INTERVAL * 1000);
}

// 文案(页面标题里通常含视频文案)和热评区文本(best-effort)
const title = (await page.title()).replace(/ - 抖音$/, '').trim();
let commentsPreview = '';
try {
  commentsPreview = await page.evaluate(() => {
    const el = document.querySelector('[data-e2e="comment-list"]');
    return el ? el.innerText.slice(0, 1200) : '';
  });
} catch {
  /* 忽略 */
}

if (framePaths.length === 0) {
  console.error('⚠️ 一帧都没截到,视频可能没有开始播放。加 --headful 观察页面后重试。');
}
console.log(
  JSON.stringify(
    { url, title, dir, frames: framePaths, comments_preview: commentsPreview },
    null,
    2
  )
);
await context.close();
