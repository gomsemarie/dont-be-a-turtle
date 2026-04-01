import { useEffect, useRef, useCallback, useState } from "react";

const API_BASE = "http://127.0.0.1:18765";

/**
 * SSE hook that maintains a stable connection.
 * The connection is keyed by `path` — it only reconnects when `path` itself changes.
 * Passing `null` disconnects; passing the same path string keeps the existing connection alive
 * even if the component re-renders (e.g. due to parent tab switches).
 */
export function useSSE<T = any>(
  path: string | null,
  eventName: string,
  onData?: (data: T) => void
) {
  const [data, setData] = useState<T | null>(null);
  const [connected, setConnected] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  // Keep a stable ref for the latest onData callback
  const onDataRef = useRef(onData);
  onDataRef.current = onData;
  // Track the path that's currently connected
  const connectedPathRef = useRef<string | null>(null);

  useEffect(() => {
    // If path hasn't changed, do nothing (prevents reconnect on re-render)
    if (path === connectedPathRef.current) return;

    // Clean up old connection
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
      connectedPathRef.current = null;
      setConnected(false);
    }

    if (!path) return;

    const es = new EventSource(`${API_BASE}${path}`);
    esRef.current = es;
    connectedPathRef.current = path;

    es.addEventListener(eventName, (e) => {
      try {
        const parsed = JSON.parse((e as MessageEvent).data);
        setData(parsed);
        onDataRef.current?.(parsed);
      } catch {}
    });

    es.addEventListener("stopped", () => {
      es.close();
      esRef.current = null;
      connectedPathRef.current = null;
      setConnected(false);
    });

    es.onopen = () => setConnected(true);
    es.onerror = () => {
      setConnected(false);
      // NOTE: Do NOT reset connectedPathRef here.
      // The browser's EventSource auto-reconnects on its own.
      // Resetting connectedPathRef would cause a duplicate reconnect on next re-render.
    };

    return () => {
      es.close();
      esRef.current = null;
      connectedPathRef.current = null;
      setConnected(false);
    };
  }, [path, eventName]);

  const disconnect = useCallback(() => {
    esRef.current?.close();
    esRef.current = null;
    connectedPathRef.current = null;
    setConnected(false);
  }, []);

  return { data, connected, disconnect };
}
