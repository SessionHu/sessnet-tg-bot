import type { InlineKeyboardButton } from 'telegraf/types';
import { servers } from './index.ts';

export interface LgResponse {
  data: string,
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
  return servers.map((e, i) => [{ text: e[1] + (i === serverIndex ? ' \u2705' : ''), callback_data: `${crypto.randomUUID()}:${i}` }]);
}

export async function ping(dst: string, ipv?: string, serverIndex = activeServer.get()): Promise<LgResponse> {
  const sv = servers[serverIndex]!;
  const res = await fetch(`https://${sv[0]}/cgi-bin/lgmain?action=ping&target=${encodeURIComponent(dst)}&ipv=${ipv}`);
  return {
    data: await res.text(),
    list: getServerList(serverIndex,)
  };
}
