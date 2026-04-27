import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';

import * as logger from './logger.ts';

import { findPackageJSON } from 'node:module';
import { resolve } from 'node:dns/promises';


const LESS_THAN_REGEX = /\</g;
function escapeHtmlText(text: string): string {
  return text.replace(LESS_THAN_REGEX, '&lt;');
}

const IP_ADDR_REGEX = /^[0-9a-fA-F:.]+$/;
async function ip(s: string) {
  if (!s) return '你的... IP 地址在哪里喵?';
  // try to resolve
  if (!IP_ADDR_REGEX.test(s)) s = (await resolve(s))[0] || '';
  if (!s) return 'It seems not a valid IP addrsss';
  // get data
  const url = 'https://regquery.ping2.sh/ip2location/v1/query?ip=' + s;
  logger.info('[inet] [ip]', url);
  const resp = await fetch(url);
  return resp.headers.get('content-type')?.startsWith('application/json') ?
    resp.json()
  :
    resp.text();
}


dotenv.config();

export const bot = new Telegraf(process.env.BOT_TOKEN!);
delete process.env.BOT_TOKEN;

bot.start((ctx) => {
  logger.logMessage(ctx);
  ctx.reply(`Welcome to ${ctx.botInfo.first_name}! 🚀\nSend /help to get help!`);
});

bot.help((ctx) => {
  logger.logMessage(ctx);
  ctx.replyWithMarkdownV2(
    '/start \\- Start the bot\n' +
    '/help \\- Show help text\n' +
    '/about \\- Show about text\n' +
    '/ip \\[name \\| ipaddr\\] \\- Query IP location information\n'
  ).catch(logger.error);
});

bot.command('about', async (ctx) => {
  logger.logMessage(ctx);
  const pkgjson = (await import(findPackageJSON(import.meta.url) || '{}', {with:{type:'json'}})).default;
  let res = '';
  for (const [k, v] of Object.entries(pkgjson)) {
    if (k === 'scripts' || k === 'devDependencies' || k === 'dependencies' || k === 'main') continue;
    res += `<strong>${k.replace(/^(.)/, c => c.toUpperCase())}</strong>: ${escapeHtmlText(typeof v !== 'string' ? JSON.stringify(v) : v)}\n`
  }
  await ctx.replyWithHTML(res || 'Please star: https://github.com/SessionHu/sino-tg-bot');
});

bot.command('ip', async (ctx) => {
  logger.logMessage(ctx);
  ctx.sendChatAction('typing').catch(logger.warn);
  try {
    const r = await ip(ctx.text.split(/\s+/)[1] || '');
    if (typeof r === 'string') {
      ctx.replyWithHTML(r.replace(/\<br(.*\/)?\>/g, '\n'));
    } else if (typeof r === 'object') {
      ctx.replyWithMarkdownV2('```json\n' + JSON.stringify(r, null, 2) + '\n```');
    } else {
      ctx.reply('结果异常: ' + r);
    }
  } catch (e) {
    ctx.reply(e instanceof Error && e.stack ? e.stack : String(e));
    logger.error(e);
  }
});

bot.on(message('text'), (ctx) => {
  logger.logMessage(ctx);
  if (ctx.chat.type === 'private')
    ctx.replyWithHTML(`你说了: "<code>${escapeHtmlText(ctx.message.text)}</code>"`).catch(logger.error);
});

bot.launch(() => {
  logger.info('Bot launched');
});

bot.catch((err, ctx) => {
  logger.error(`[${ctx.updateType}] error occurred:`, err);
  ctx[ctx.inlineMessageId ? 'editMessageText' : 'reply'](`[${ctx.updateType}] error occurred:\n${String(err)}`);
});

const onexit = async (signal: NodeJS.Signals) => {
  logger.warn('Received Signal:', signal);
  bot.stop(signal);
}
process.once('SIGTERM', onexit);
process.once('SIGINT', onexit);
process.once('SIGHUP', onexit);
