// 搜索抖音视频:打开搜索页,监听搜索接口响应,输出结果列表(JSON)
// 用法: node scripts/search.mjs --keyword "关键词" [--count 15] [--headful]
import { launch, normalizeAweme, getArg, hasFlag } from './lib.mjs';

const keyword = getArg('keyword');
if (!keyword) {
  console.error('用法: node scripts/search.mjs --keyword "关键词" [--count 15]');
  process.exit(2);
}
const COUNT = parseInt(getArg('count', '10'), 10);

const context = await launch({ headless: !hasFlag('headful') });
const page = context.pages()[0] || (await context.newPage());

const videos = new Map();

page.on('response', async (res) => {
  if (!/\/aweme\/v1\/web\/(general\/search|search\/item)/.test(res.url())) return;
  try {
    const data = await res.json();
    // 综合搜索的结果在 data[].aweme_info,视频搜索在 data[].aweme_info 或 aweme_list
    const buckets = [];
    if (Array.isArray(data?.data)) {
      for (const d of data.data) {
        if (d?.aweme_info) buckets.push(d.aweme_info);
        if (Array.isArray(d?.aweme_list)) buckets.push(...d.aweme_list);
      }
    }
    if (Array.isArray(data?.aweme_list)) buckets.push(...data.aweme_list);
    for (const item of buckets) {
      const v = normalizeAweme(item);
      if (v && !videos.has(v.id)) videos.set(v.id, v);
    }
  } catch {
    /* 忽略非 JSON */
  }
});

await page.goto(
  `https://www.douyin.com/search/${encodeURIComponent(keyword)}?type=video`,
  { waitUntil: 'domcontentloaded' }
);

await page.waitForTimeout(5000);
for (let i = 0; i < 8 && videos.size < COUNT; i++) {
  await page.mouse.wheel(0, 2000); // 滚动触发加载更多
  await page.waitForTimeout(1500);
}

const list = [...videos.values()].slice(0, COUNT);
console.log(JSON.stringify({ keyword, count: list.length, videos: list }, null, 2));
await context.close();
