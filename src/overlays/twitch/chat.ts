// Twitch sohbetini anonim IRC (WebSocket) ile okur. Aynı kanala bağlanan tüm
// overlay'ler tek bağlantıyı paylaşır.

import { createSignal, type Accessor } from "solid-js";

export interface ChatMsg {
  id: string;
  user: string;
  color: string;
  text: string;
  mod: boolean;
  sub: boolean;
  vip: boolean;
  broadcaster: boolean;
  ts: number;
}

interface Conn {
  msgs: Accessor<ChatMsg[]>;
  status: Accessor<"connecting" | "open" | "closed">;
  refs: number;
  close: () => void;
}

const conns = new Map<string, Conn>();

function parseTags(raw: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const kv of raw.split(";")) {
    const i = kv.indexOf("=");
    if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1).replace(/\\s/g, " ");
  }
  return o;
}

/** Tek IRC satırından sohbet mesajı çıkarır (PRIVMSG değilse null) */
export function parseLine(line: string): ChatMsg | null {
  let rest = line;
  let tags: Record<string, string> = {};
  if (rest.startsWith("@")) {
    const sp = rest.indexOf(" ");
    tags = parseTags(rest.slice(1, sp));
    rest = rest.slice(sp + 1);
  }
  const m = /^:(\w+)!\S+ PRIVMSG #\S+ :(.*)$/.exec(rest);
  if (!m) return null;
  const badges = tags["badges"] ?? "";
  let text = m[2];
  // /me mesajları
  const action = /^\u0001ACTION (.*)\u0001$/.exec(text);
  if (action) text = action[1];
  return {
    id: tags["id"] || `${Date.now()}-${Math.random()}`,
    user: tags["display-name"] || m[1],
    color: tags["color"] || "",
    text,
    mod: badges.includes("moderator"),
    sub: badges.includes("subscriber"),
    vip: badges.includes("vip"),
    broadcaster: badges.includes("broadcaster"),
    ts: Number(tags["tmi-sent-ts"]) || Date.now(),
  };
}

export function joinChat(channel: string, max: number): Conn {
  const ch = channel.trim().toLowerCase().replace(/^#/, "");
  const existing = conns.get(ch);
  if (existing) {
    existing.refs++;
    return existing;
  }
  const [msgs, setMsgs] = createSignal<ChatMsg[]>([]);
  const [status, setStatus] = createSignal<"connecting" | "open" | "closed">("connecting");
  let ws: WebSocket | null = null;
  let stopped = false;
  let retry = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (stopped) return;
    setStatus("connecting");
    try {
      ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    } catch {
      setStatus("closed");
      return;
    }
    ws.onopen = () => {
      ws!.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws!.send("PASS SCHMOOPIIE");
      ws!.send(`NICK justinfan${Math.floor(10000 + Math.random() * 80000)}`);
      ws!.send(`JOIN #${ch}`);
      setStatus("open");
      retry = 1000;
    };
    ws.onmessage = (e) => {
      for (const line of String(e.data).split("\r\n")) {
        if (!line) continue;
        if (line.startsWith("PING")) {
          ws?.send(line.replace("PING", "PONG"));
          continue;
        }
        const m = parseLine(line);
        if (m) setMsgs((l) => [...l, m].slice(-Math.max(max, 40)));
        else if (line.includes(" CLEARCHAT ") || line.includes(" CLEARMSG ")) {
          const id = /target-msg-id=([^; ]+)/.exec(line)?.[1];
          const user = / CLEARCHAT #\S+ :(\S+)/.exec(line)?.[1];
          setMsgs((l) => (id ? l.filter((x) => x.id !== id) : user ? l.filter((x) => x.user.toLowerCase() !== user) : []));
        }
      }
    };
    ws.onclose = () => {
      setStatus("closed");
      if (!stopped) {
        timer = setTimeout(connect, retry);
        retry = Math.min(retry * 2, 30000);
      }
    };
  };
  connect();

  const conn: Conn = {
    msgs,
    status,
    refs: 1,
    close: () => {
      conn.refs--;
      if (conn.refs > 0) return;
      stopped = true;
      clearTimeout(timer);
      ws?.close();
      conns.delete(ch);
    },
  };
  conns.set(ch, conn);
  return conn;
}
