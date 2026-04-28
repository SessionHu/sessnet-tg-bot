import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';

import * as logger from './logger.ts';

import { findPackageJSON } from 'node:module';
import { resolve } from 'node:dns/promises';
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';


const LESS_THAN_REGEX = /\</g;
function escapeHtmlText(text: string): string {
  return text.replace(LESS_THAN_REGEX, '&lt;');
}

async function ip(s: string) {
  if (!s) return 'Where... is your IP??';
  // try to resolve
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$|^[0-9a-f]{0,4}:[0-9a-f:]*:([0-9a-f]{0,4}|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i.test(s)) s = (await resolve(s))[0] || '';
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
    '/ip \\name\\|ipaddr\\ \\- Query IP location database\n' +
    '/whois object \\- Query WHOIS database\n',
    {reply_parameters:{message_id:ctx.message.message_id}}
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
  await ctx.replyWithHTML(res || 'Please star: https://github.com/SessionHu/sessnet-tg-bot', {reply_parameters:{message_id:ctx.message.message_id}});
});

bot.command('ip', async (ctx) => {
  logger.logMessage(ctx);
  ctx.sendChatAction('typing').catch(logger.warn);
  try {
    const r = await ip(ctx.text.split(/\s+/)[1] || '');
    if (typeof r === 'string') {
      ctx.replyWithHTML(r.replace(/\<br(.*\/)?\>/g, '\n'), {reply_parameters:{message_id:ctx.message.message_id}});
    } else if (typeof r === 'object') {
      ctx.replyWithMarkdownV2('```json\n' + JSON.stringify(r, null, 2) + '\n```', {reply_parameters:{message_id:ctx.message.message_id}});
    } else {
      ctx.reply('Unexpected result: ' + r, {reply_parameters:{message_id:ctx.message.message_id}});
    }
  } catch (e) {
    ctx.reply(e instanceof Error && e.stack ? e.stack : String(e));
    logger.error(e);
  }
});

bot.command('whois', async (ctx) => {
  logger.logMessage(ctx);
  ctx.sendChatAction('typing').catch(logger.warn);
  const cmd = ctx.text.split(/\s+/).slice(1);
  if (!cmd.length) {
    return ctx.reply('What do you want to query?', {reply_parameters:{message_id:ctx.message.message_id}});
  }
  // choose whois type
  let usedn42 = false;
  if (cmd.find(e => /^as\d+$/i.test(e))) {
    // asn
    usedn42 = true;
  } else if (cmd.find(e => /^(172\.(2[0-3]|31)|10\.\d{1,3})\.\d{1,3}\.\d{1,3}(\/\d+)?$|^fd[0-9a-f]{2}:[0-9a-f:]*:([0-9a-f]{0,4}|\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(\/\d+)?$/i.test(e))) {
    // dn42 ip
    usedn42 = true;
  } else if (cmd.find(e => /^(.+\.)?d\.f\.ip6\.arpa\.?$|^(.+\.)?((2[0-3]|31)\.172|10)\.in-addr\.arpa\.?$|^(.+\.)?(dn42|neo)\.?$/i.test(e))) {
    // dn42 domain name
    usedn42 = true;
  } else if (cmd.find(e => /^.*-(mnt|dn42)$/i.test(e))) {
    // mnt, person, role
    usedn42 = true;
  }
  // run
  const bfs = new Array<Buffer>;
  const cb = () => {
    ctx.replyWithHTML(`<pre>${escapeHtmlText(Buffer.concat(bfs).toString('utf8'))}</pre>`, {reply_parameters:{message_id:ctx.message.message_id}});
  };
  if (usedn42) {
    const skt = createConnection({host: 'whois.dn42', port: 43});
    skt.write(Buffer.from(cmd + '\r\n'));
    skt.on('data', (b: Buffer) => bfs.push(b));
    skt.on('close', cb);
  } else {
    const pid = spawn('whois', cmd, { shell: false });
    let closed1 = false, closed2 = false;
    pid.stderr.on('data', (b: Buffer) => bfs.push(b));
    pid.stdout.on('data', (b: Buffer) => bfs.push(b));
    pid.stdout.on('close', () => (closed1 = true) && closed2 && cb());
    pid.stderr.on('close', () => (closed2 = true) && closed1 && cb());
    pid.on('exit', (c) => c && ctx.reply('Error: process exited with ' + c));
  }
});

bot.on(message('text'), (ctx) => {
  logger.logMessage(ctx);
  if (ctx.chat.type === 'private')
    ctx.replyWithHTML(`You: "<code>${escapeHtmlText(ctx.message.text)}</code>"`, {reply_parameters:{message_id:ctx.message.message_id}}).catch(logger.error);
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
