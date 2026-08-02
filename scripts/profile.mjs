// 看主页:默认打开自己的主页,输出账号资料 + 已发布作品及各项数据(JSON)
// 用法: node scripts/profile.mjs [--url 他人主页链接] [--count 20] [--headless]
// 默认显示浏览器窗口:抖音风控会拦截无头浏览器,无头模式经常抓不到数据
import { launch, isLoggedIn, requireLoginHint, normalizeAweme, getArg, hasFlag } from './lib.mjs';

const url = getArg('url', 'https://www.douyin.com/user/self');
const COUNT = parseInt(getArg('count', '20'), 10);

const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

let profile = null;
const videos = new Map();

page.on('response', async (res) => {
  const u = res.url();
  try {
    // 账号资料接口(自己是 profile/self,他人是 profile/other)
    if (/\/aweme\/v1\/web\/user\/profile\/(self|other)/.test(u)) {
      const data = await res.json();
      const user = data?.user;
      if (user) {
        profile = {
          nickname: user.nickname || '',
          douyin_id: user.unique_id || user.short_id || '',
          signature: (user.signature || '').trim(),
          followers: user.follower_count ?? null,
          following: user.following_count ?? null,
          total_likes: user.total_favorited ?? null,
          works_count: user.aweme_count ?? null,
        };
      }
    }
    // 主页作品列表接口
    if (/\/aweme\/v1\/web\/aweme\/post\//.test(u)) {
      const data = await res.json();
      for (const item of data?.aweme_list || []) {
        const v = normalizeAweme(item);
        if (v && !videos.has(v.id)) {
          v.create_time = item.create_time
            ? new Date(item.create_time * 1000).toISOString().slice(0, 10)
            : null;
          videos.set(v.id, v);
        }
      }
    }
  } catch {
    /* 忽略非 JSON 响应 */
  }
});

if (url.includes('/user/self') && !(await isLoggedIn(context))) requireLoginHint();

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

// 滚动加载更多作品
for (let i = 0; i < 10 && videos.size < COUNT; i++) {
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(1500);
}

const works = [...videos.values()].slice(0, COUNT);
console.log(JSON.stringify({ profile, works_count: works.length, works }, null, 2));
await context.close();
