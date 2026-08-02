// Claude「看视频」:打开一条抖音视频,按时间点截取若干帧存成图片,
// Claude 之后用 Read 工具读这些帧,就能理解视频画面内容。
// 用法: node scripts/watch.mjs --url "https://www.douyin.com/video/xxx" [--frames 6] [--out 目录] [--headless]
import path from 'node:path';
import fs from 'node:fs';
import { launch, isLoggedIn, requireLoginHint, normalizeAweme, getArg, hasFlag } from './lib.mjs';

const url = getArg('url') || (getArg('id') ? `https://www.douyin.com/video/${getArg('id')}` : null);
if (!url) {
  console.error('用法: node scripts/watch.mjs --url "视频链接" [--frames 6] [--out 目录]');
  process.exit(2);
}
const FRAMES = Math.min(Math.max(parseInt(getArg('frames', '6'), 10) || 6, 1), 20);
const videoId = (url.match(/video\/(\d+)/) || [])[1] || String(Date.now());
const OUT_DIR = getArg('out', path.join('frames', videoId));

const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

if (!(await isLoggedIn(context))) requireLoginHint();

// 顺带从详情接口抓一份元数据(文案、作者、点赞等)
let meta = null;
page.on('response', async (res) => {
  if (!/\/aweme\/v1\/web\/aweme\/detail\//.test(res.url())) return;
  try {
    const data = await res.json();
    const v = normalizeAweme(data?.aweme_detail);
    if (v) meta = v;
  } catch {
    /* 忽略非 JSON */
  }
});

await page.goto(url, { waitUntil: 'domcontentloaded' });

// 等视频元素加载出 metadata(拿得到时长)
const video = page.locator('video').first();
try {
  await video.waitFor({ state: 'attached', timeout: 20000 });
  await page.waitForFunction(
    () => {
      const v = document.querySelector('video');
      return v && v.readyState >= 1 && v.duration > 0;
    },
    { timeout: 20000 }
  );
} catch {
  console.error('⚠️ 没等到视频加载。可能弹了滑块验证(在窗口里完成后重试),或该链接不是视频页。');
  await context.close();
  process.exit(1);
}

// 静音并暂停,由我们控制进度逐帧截图
await page.evaluate(() => {
  const v = document.querySelector('video');
  v.muted = true;
  v.pause();
});
const duration = await page.evaluate(() => document.querySelector('video').duration);

fs.mkdirSync(OUT_DIR, { recursive: true });
const frames = [];
for (let i = 0; i < FRAMES; i++) {
  // 均匀取点,避开首尾各 5%(片头黑屏/片尾定格)
  const t = duration * (0.05 + (0.9 * i) / Math.max(FRAMES - 1, 1));
  await page.evaluate(async (time) => {
    const v = document.querySelector('video');
    v.currentTime = time;
    await new Promise((resolve) => {
      if (Math.abs(v.currentTime - time) < 0.3) return resolve();
      v.addEventListener('seeked', resolve, { once: true });
      setTimeout(resolve, 5000); // 兜底,防止 seeked 不触发卡死
    });
  }, t);
  await page.waitForTimeout(300); // 等画面渲染稳定
  const file = path.join(OUT_DIR, `frame-${String(i + 1).padStart(2, '0')}-${Math.round(t)}s.png`);
  try {
    await video.screenshot({ path: file });
  } catch {
    // 视频元素截图偶尔失败(被浮层挡住等),退回截整页
    await page.screenshot({ path: file });
  }
  frames.push({ time_sec: Math.round(t), file });
}

console.log(
  JSON.stringify(
    {
      video: meta || { id: videoId, url },
      duration_sec: Math.round(duration),
      frames_dir: OUT_DIR,
      frames,
      hint: '用 Read 工具依次查看 frames 里的图片,即可理解视频画面内容;结合文案(desc)做总结。',
    },
    null,
    2
  )
);
await context.close();
