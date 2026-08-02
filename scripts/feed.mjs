// 刷抖音推荐流:打开首页,监听推荐接口的响应,滚动加载并输出视频列表(JSON)
// 用法: node scripts/feed.mjs [--count 15] [--headless]
// 默认显示浏览器窗口:抖音风控会拦截无头浏览器,无头模式经常抓不到数据
import { launch, isLoggedIn, requireLoginHint, normalizeAweme, getArg, hasFlag } from './lib.mjs';

const COUNT = parseInt(getArg('count', '10'), 10);
const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

const videos = new Map();

page.on('response', async (res) => {
  const url = res.url();
  // 推荐流相关接口都在 /aweme/v1/web/ 下,列表字段统一叫 aweme_list
  if (!/\/aweme\/v1\/web\/(tab\/feed|module\/feed|feed)/.test(url)) return;
  try {
    const data = await res.json();
    for (const item of data?.aweme_list || []) {
      const v = normalizeAweme(item.aweme || item);
      if (v && !videos.has(v.id)) videos.set(v.id, v);
    }
  } catch {
    /* 非 JSON 响应,忽略 */
  }
});

await page.goto('https://www.douyin.com/?recommend=1', { waitUntil: 'domcontentloaded' });

if (!(await isLoggedIn(context))) {
  console.error('提示:未登录也能看推荐,但内容不是个性化的。想刷自己的推荐请先运行 login。');
}

// 等首屏接口回来,然后模拟“往下刷”触发加载更多
await page.waitForTimeout(8000);
for (let i = 0; i < 15 && videos.size < COUNT; i++) {
  await page.keyboard.press('ArrowDown'); // 抖音网页版按下键切下一个视频
  await page.waitForTimeout(2000);
}

const list = [...videos.values()].slice(0, COUNT);
if (list.length === 0) {
  console.error('⚠️ 没有抓到任何视频。常见原因:');
  console.error('  1. 页面弹出了滑块/验证码 —— 请在浏览器窗口里手动完成验证后重新运行');
  console.error('  2. 用了 --headless 无头模式 —— 抖音风控会拦截,去掉该参数重试');
  console.error('  3. 弹出了登录引导遮挡页面 —— 先运行 node scripts/login.mjs');
}
console.log(JSON.stringify({ count: list.length, videos: list }, null, 2));
await context.close();
