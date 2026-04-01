import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const API_BASE = "http://127.0.0.1:18765";

export async function api<T = any>(
  path: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "API Error");
  }
  return res.json();
}

export function createSSE(path: string, onMessage: (data: any) => void) {
  const es = new EventSource(`${API_BASE}${path}`);

  es.addEventListener("frame", (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  });

  es.addEventListener("distance", (e) => {
    try {
      onMessage(JSON.parse(e.data));
    } catch {}
  });

  es.addEventListener("stopped", () => {
    es.close();
  });

  es.onerror = () => {
    // Will auto-reconnect
  };

  return es;
}
