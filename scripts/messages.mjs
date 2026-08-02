// 私信(需登录):默认列出会话列表;--with "昵称" 查看和某人的最近聊天记录;
// --with "昵称" --send "内容" 给该联系人发一条私信
// 用法: node scripts/messages.mjs [--with "昵称"] [--send "内容"] [--count 30] [--profile claude]
// 私信数据只在本机处理,不会上传到任何地方
import fs from 'node:fs';
import path from 'node:path';
import { launch, isLoggedIn, requireLoginHint, getArg, hasFlag } from './lib.mjs';

const withName = getArg('with');
const sendText = getArg('send');
const COUNT = parseInt(getArg('count', '30'), 10);

if (sendText && !withName) {
  console.error('--send 必须和 --with "昵称" 一起用,指明发给谁。');
  process.exit(2);
}

const context = await launch({ headless: hasFlag('headless') });
const page = context.pages()[0] || (await context.newPage());

if (!(await isLoggedIn(context))) requireLoginHint();

// 抓所有 IM 相关接口的响应,既用于解析会话列表,也在失败时留作修复线索
const rawCaptures = [];
const contacts = [];

// 在任意 JSON 里递归找「像联系人」的数组:元素带昵称和用户 id
function extractContacts(node) {
  if (Array.isArray(node)) {
    const looksLikeUsers = node.filter(
      (it) =>
        it && typeof it === 'object' && typeof it.nickname === 'string' && (it.uid || it.user_id || it.sec_uid)
    );
    if (looksLikeUsers.length > 0) {
      for (const it of looksLikeUsers) {
        if (!contacts.some((c) => c.nickname === it.nickname)) {
          contacts.push({ nickname: it.nickname, signature: it.signature || '' });
        }
      }
      return;
    }
    for (const it of node) extractContacts(it);
    return;
  }
  if (node && typeof node === 'object') {
    for (const v of Object.values(node)) extractContacts(v);
  }
}

page.on('response', async (res) => {
  const u = res.url();
  if (!/douyin\.com/.test(u) || !/\/im\/|imapi|message/i.test(u)) return;
  try {
    const data = await res.json();
    rawCaptures.push({ url: u.split('?')[0], data });
    extractContacts(data);
  } catch {
    /* 忽略非 JSON */
  }
});

await page.goto('https://www.douyin.com', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(5000);

// 打开侧边栏的「私信」面板
const imEntry = page.getByText('私信', { exact: true }).first();
if ((await imEntry.count()) === 0) {
  console.error('没找到「私信」入口,页面可能改版了。加 --headful 观察页面结构后修本脚本。');
  await context.close();
  process.exit(1);
}
await imEntry.click();
await page.waitForTimeout(6000);

function dumpRaw(reason) {
  const dumpDir = path.join(process.cwd(), '.douyin-data');
  fs.mkdirSync(dumpDir, { recursive: true });
  const dumpFile = path.join(dumpDir, 'messages-raw.json');
  fs.writeFileSync(dumpFile, JSON.stringify(rawCaptures, null, 2));
  console.error(`⚠️ ${reason}`);
  console.error(`   已把 IM 接口原始响应存到 ${dumpFile},可交给 Claude 分析并修复本脚本。`);
}

if (!withName) {
  // 模式一:输出会话列表(从接口解析到的联系人 + 面板可见文本兜底)
  let panelText = '';
  try {
    // 取私信面板的可见文本作为兜底信息
    panelText = await page.evaluate(() => {
      const candidates = [...document.querySelectorAll('div')].filter(
        (el) => el.innerText && el.innerText.includes('私信') && el.offsetHeight > 300
      );
      candidates.sort((a, b) => a.innerText.length - b.innerText.length);
      return candidates[0]?.innerText.slice(0, 3000) || '';
    });
  } catch {
    /* 忽略 */
  }
  if (contacts.length === 0 && !panelText) dumpRaw('没有解析到会话列表。');
  console.log(
    JSON.stringify(
      { mode: 'conversations', contacts: contacts.slice(0, COUNT), panel_text_fallback: panelText },
      null,
      2
    )
  );
} else {
  // 模式二:打开指定联系人的会话,读取最近聊天内容
  const item = page.getByText(withName, { exact: false }).first();
  if ((await item.count()) === 0) {
    dumpRaw(`私信面板里没找到「${withName}」。先不带 --with 运行拿到会话列表,确认昵称写法。`);
    await context.close();
    process.exit(1);
  }
  await item.click();
  await page.waitForTimeout(5000);

  // 发送模式:在聊天输入框输入内容并回车
  if (sendText) {
    const inputSel = [
      'div[contenteditable="true"]',
      'textarea[placeholder*="发送"]',
      'textarea[placeholder*="消息"]',
    ];
    let input = null;
    for (const sel of inputSel) {
      const loc = page.locator(sel).last(); // 聊天输入框一般在面板底部,取最后一个
      if (await loc.count()) {
        input = loc;
        break;
      }
    }
    if (!input) {
      dumpRaw('没找到私信输入框,页面可能改版了。');
      await context.close();
      process.exit(1);
    }
    await input.click();
    await page.waitForTimeout(500);
    await page.keyboard.type(sendText, { delay: 50 });
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(3000);
    console.log(
      JSON.stringify({ mode: 'send', to: withName, text: sendText, ok: true }, null, 2)
    );
    await context.close();
    process.exit(0);
  }

  // 聊天记录区域的可见文本(按行);结构复杂,先用文本快照,后续可按需精修
  const chatText = await page.evaluate(() => {
    const candidates = [...document.querySelectorAll('div')].filter(
      (el) => el.offsetHeight > 300 && el.querySelectorAll('img').length < 50 && el.innerText
    );
    candidates.sort((a, b) => b.innerText.length - a.innerText.length);
    return candidates[0]?.innerText.slice(-6000) || '';
  });
  if (!chatText) dumpRaw(`打开了「${withName}」的会话,但没抓到聊天文本。`);
  console.log(JSON.stringify({ mode: 'chat', with: withName, transcript_text: chatText }, null, 2));
}

await context.close();
