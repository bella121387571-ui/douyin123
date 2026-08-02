// 看自己主页的「喜欢」或「收藏」列表(需登录)
// 用法: node scripts/my.mjs --type likes|collects [--count 20] [--headless]
import { launch, isLoggedIn, requireLoginHint, normalizeAweme, getArg, hasFlag } from './lib.mjs';

const type = getArg('type', 'likes');
const COUNT = parseInt(getArg('count', '20'), 10);

const TABS = {
  likes: {
    url: 'https://www.douyin.com/user/self?showTab=like',
    api: /\/aweme\/v1\/web\/aweme\/favorite\//, // 「喜欢」列表接口
    label: '喜欢',
  },
  collects: {
    url: 'https://www.douyin.com/user/self?showTab=favorite_collection',
    api: /\/aweme\/v1\/web\/(aweme\/listcollection|collect\/aweme)/, // 「收藏」列表接口
    label: '收藏',
  },
};

const tab = TABS[type];
if (!tab) {
  console.error('用法: node scripts/my.mjs --type likes|collects [--count 20]');
  process.exit(2);
}

const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

if (!(await isLoggedIn(context))) requireLoginHint();

const videos = new Map();
page.on('response', async (res) => {
  if (!tab.api.test(res.url())) return;
  try {
    const data = await res.json();
    for (const item of data?.aweme_list || []) {
      const v = normalizeAweme(item);
      if (v && !videos.has(v.id)) videos.set(v.id, v);
    }
  } catch {
    /* 忽略非 JSON */
  }
});

await page.goto(tab.url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(8000);

for (let i = 0; i < 10 && videos.size < COUNT; i++) {
  await page.mouse.wheel(0, 3000);
  await page.waitForTimeout(2000);
}

const list = [...videos.values()].slice(0, COUNT);
if (list.length === 0) {
  console.error(`⚠️ 没有抓到「${tab.label}」内容。可能原因:列表本来是空的;页面弹了滑块验证(在窗口里完成后重试);`);
  console.error('   或「喜欢」列表被设为了仅自己可见且页面结构有变。');
}
console.log(JSON.stringify({ type: tab.label, count: list.length, videos: list }, null, 2));
await context.close();
