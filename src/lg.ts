import { InputFile } from 'grammy';
import type { InlineKeyboardButton } from 'grammy/types';
import { servers } from './index.ts';

export interface LgResponse {
  data: string,
  list: InlineKeyboardButton[][]
}

export interface LgResponsePhoto {
  data: InputFile,
  list: InlineKeyboardButton[][]
}

const activeServer = (() => {
  let activeServerIndex = 0;
  return {
    get: () => {
      if (activeServerIndex < 0 || activeServerIndex >= servers.length)
        activeServerIndex = 0;
      return activeServerIndex;
    },
    set: (v: number) => {
      if (v >= 0 && v < servers.length)
        activeServerIndex = v;
    }
  };
})();

function getServerList(serverIndex: number): InlineKeyboardButton[][] {
  activeServer.set(serverIndex);
  return servers.map((e, i) => [{ text: e[1] + (i === serverIndex ? ' \u2705' : ''), callback_data: `${crypto.randomUUID()}:${i}` } as InlineKeyboardButton]).concat([[
    { text: 'Peer Info', url: 'https://dn42.xhustudio.eu.org/peering.html' },
    { text: 'NTP Pool 42', url: 'https://ntppool42.sess.moe/' }
  ]]);
}

export async function ping(dst: string, ipv?: string, serverIndex = activeServer.get()): Promise<LgResponse> {
  const sv = servers[serverIndex]!;
  return {
    data: await fetch(`https://${sv[0]}/cgi-bin/lgmain?action=ping&target=${encodeURIComponent(dst)}&ipv=${ipv}`).then(r => r.text()).catch(e => (e instanceof Error && e.stack) || String(e)),
    list: getServerList(serverIndex,)
  };
}

export async function trace(dst: string, ipv?: string, proto?: string, serverIndex = activeServer.get()): Promise<LgResponse> {
  const sv = servers[serverIndex]!;
  return {
    data: await fetch(`https://${sv[0]}/cgi-bin/lgmain?action=trace&target=${encodeURIComponent(dst)}&ipv=${ipv}&proto=${proto}`).then(r => r.text()).catch(e => (e instanceof Error && e.stack) || String(e)),
    list: getServerList(serverIndex,)
  };
}

export async function dig(dst: string, serverIndex = activeServer.get()): Promise<LgResponse> {
  const sv = servers[serverIndex]!;
  return {
    data: await fetch(`https://${sv[0]}/cgi-bin/lgmain?action=dig&target=${encodeURIComponent(dst)}`).then(r => r.text()).catch(e => (e instanceof Error && e.stack) || String(e)),
    list: getServerList(serverIndex,)
  };
}

export async function broute(dst: string, all = false, serverIndex = activeServer.get()): Promise<LgResponse> {
  const sv = servers[serverIndex]!;
  return {
    data: await fetch(`https://${sv[0]}/cgi-bin/lgmain?action=broute&target=${encodeURIComponent(dst || '0.0.0.0')}&all=${all}`).then(r => r.text()).catch(e => (e instanceof Error && e.stack) || String(e)),
    list: getServerList(serverIndex,)
  };
}

export async function topology(serverIndex = activeServer.get()): Promise<LgResponsePhoto> {
  const sv = servers[serverIndex]!;
  const data = await fetch(`https://${sv[0]}/cgi-bin/lgmain?action=topology`).then(r => r.text());
	return {
    data: new InputFile(await (await import('./topology.ts')).default(data), 'topology.png'),
    list: getServerList(serverIndex,)
  };
}
