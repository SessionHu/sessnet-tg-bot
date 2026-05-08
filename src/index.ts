import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import dotenv from 'dotenv';

import * as logger from './logger.ts';
import * as lg from './lg.ts';
import { escapeHtmlText } from './escape.ts';

import { findPackageJSON } from 'node:module';
import { lookup } from 'node:dns/promises';
import { createConnection, isIP } from 'node:net';
import { spawn } from 'node:child_process';


async function ip(s: string) {
  if (!s) return 'Where... is your IP??';
  // try to resolve
  if (!isIP(s)) s = (await lookup(s)).address || '';
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

const OUTPUT_LIMIT_LENGTH = 4095;

dotenv.config();

export const servers: [string, string][] = process.env.SERVERS?.split(',').map(e => e.split(';') as [string, string]) || [];

export const bot = new Telegraf(process.env.BOT_TOKEN!);
delete process.env.BOT_TOKEN;

bot.start((ctx) => {
  logger.logMessage(ctx);
  ctx.reply(`Welcome to ${ctx.botInfo.first_name}! 🚀\nSend /help to get help!`);
});

bot.help((ctx) => {
  logger.logMessage(ctx);
  ctx.replyWithHTML(
    '/start - Start the bot\n' +
    '/help - Show help text\n' +
    '/about - Show about text\n' +
    '/ip name|ipaddr - Query IP location database\n' +
    '/whois object - Query WHOIS database\n' +
    '/ping[4|6] host - ICMP Ping\n' +
    '/trace[route][4|6][I|U] host - Traceroute with ICMP or UDP\n' +
    '/dig query - BIND9 lookup utility DiG\n' +
    '/route[A] - Show BIRD route for IP address or CIDR\n',
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
    const txt = Buffer.concat(bfs);
    if (txt.length > OUTPUT_LIMIT_LENGTH) {
      ctx.sendChatAction('upload_document');
      ctx.replyWithDocument({
        source: txt,
        filename: cmd.join('_') + '.txt'
      }, {
        caption: `Command output too long (${txt.length} > ${OUTPUT_LIMIT_LENGTH})!\nHere is your output text document.`
      });
    } else {
      ctx.replyWithHTML(`<pre>${escapeHtmlText(txt.toString('utf8'))}</pre>`, {reply_parameters:{message_id:ctx.message.message_id}});
    }
  };
  if (usedn42) {
    const skt = createConnection({host: 'whois.dn42', port: 43});
    skt.write(Buffer.from(cmd.join(' ') + '\r\n'));
    skt.on('data', (b: Buffer) => bfs.push(b));
    skt.on('close', cb);
  } else {
    const pid = spawn('whois', cmd, { shell: false });
    pid.stderr.on('data', (b: Buffer) => bfs.push(b));
    pid.stdout.on('data', (b: Buffer) => bfs.push(b));
    pid.on('close', cb);
  }
});

bot.command('nya', (ctx) => {
  logger.logMessage(ctx);
  ctx.sendChatAction('typing').catch(logger.warn);
  ctx.reply('Nya~', {reply_parameters:{message_id:ctx.message.message_id}}).catch(logger.error);
});

const PING_REGEX = /^ping(4|6)?$/;
bot.command(PING_REGEX, async (ctx) => {
  logger.logMessage(ctx);
  ctx.sendChatAction('typing').catch(logger.warn);
  const res = await lg.ping(ctx.text.split(/\s+/)[1]!, ctx.match[1]);
  ctx.replyWithHTML(`<pre>${escapeHtmlText(res.data)}</pre>`, {reply_parameters:{message_id:ctx.message.message_id}, reply_markup:{inline_keyboard:res.list}}).catch(logger.error);
});

const TRACEROUTE_REGEX = /^trace(?:route)?(4|6)?(I|U)?$/;
bot.command(TRACEROUTE_REGEX, async (ctx) => {
  logger.logMessage(ctx);
  ctx.sendChatAction('typing').catch(logger.warn);
  const res = await lg.trace(ctx.text.split(/\s+/)[1]!, ctx.match[1], ctx.match[2] === 'I' ? 'icmp' : 'udp');
  ctx.replyWithHTML(`<pre>${escapeHtmlText(res.data)}</pre>`, {reply_parameters:{message_id:ctx.message.message_id}, reply_markup:{inline_keyboard:res.list}}).catch(logger.error);
});

bot.command('dig', async (ctx) => {
  logger.logMessage(ctx);
  ctx.sendChatAction('typing').catch(logger.warn);
  const res = await lg.dig(ctx.text.split(/\s+/).slice(1).join(' '));
  ctx.replyWithHTML(`<pre>${escapeHtmlText(res.data)}</pre>`, {reply_parameters:{message_id:ctx.message.message_id}, reply_markup:{inline_keyboard:res.list}}).catch(logger.error);
});

const ROUTE_REGEX = /^(?:b)?route(A)?$/;
bot.command(ROUTE_REGEX, async (ctx) => {
  logger.logMessage(ctx);
  ctx.sendChatAction('typing').catch(logger.warn);
  const res = await lg.broute(ctx.text.split(/\s+/)[1]!, ctx.match[1] === 'A');
  ctx.replyWithHTML(`<pre>${escapeHtmlText(res.data)}</pre>`, {reply_parameters:{message_id:ctx.message.message_id}, reply_markup:{inline_keyboard:res.list}}).catch(logger.error);
});

bot.on('callback_query', async(ctx) => {
  if (!ctx.callbackQuery.message || !('reply_to_message' in ctx.callbackQuery.message) || !('text' in ctx.callbackQuery.message.reply_to_message) || !('data' in ctx.callbackQuery)) return;
  const parts = ctx.callbackQuery.message.reply_to_message.text.split(/\s+/);
  const cmd = parts[0]!.replace(/^\/(.+?)(@.+)?$/, (_, p) => p);
  let matched: RegExpExecArray | null;
  if (matched = PING_REGEX.exec(cmd)) {
    const res = await lg.ping(parts[1]!, matched[1], Number(ctx.callbackQuery.data.split(':')[1]));
    await ctx.editMessageText(`<pre>${escapeHtmlText(res.data)}</pre>`, {parse_mode: 'HTML', reply_markup:{inline_keyboard:res.list}});
  } else if (matched = TRACEROUTE_REGEX.exec(cmd)) {
    const res = await lg.trace(parts[1]!, matched[1], matched[2] === 'I' ? 'icmp' : 'udp', Number(ctx.callbackQuery.data.split(':')[1]));
    await ctx.editMessageText(`<pre>${escapeHtmlText(res.data)}</pre>`, {parse_mode: 'HTML', reply_markup:{inline_keyboard:res.list}});
  } else if (cmd === 'dig') {
    const res = await lg.dig(parts.slice(1).join(' '), Number(ctx.callbackQuery.data.split(':')[1]));
    await ctx.editMessageText(`<pre>${escapeHtmlText(res.data)}</pre>`, {parse_mode: 'HTML', reply_markup:{inline_keyboard:res.list}});
  } else if (matched = ROUTE_REGEX.exec(cmd)) {
    const res = await lg.broute(parts[1]!, matched[1] === 'A', Number(ctx.callbackQuery.data.split(':')[1]));
    await ctx.editMessageText(`<pre>${escapeHtmlText(res.data)}</pre>`, {parse_mode: 'HTML', reply_markup:{inline_keyboard:res.list}});
  }
});

bot.on(message('text'), (ctx) => {
  logger.logMessage(ctx);
  if (ctx.chat.type === 'private')
    ctx.replyWithHTML(`You: "<code>${escapeHtmlText(ctx.message.text)}</code>"`, {reply_parameters:{message_id:ctx.message.message_id}}).catch(logger.error);
  else
    if (Math.random() > .8) ctx.react('🤔', true).catch(logger.warn);
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
