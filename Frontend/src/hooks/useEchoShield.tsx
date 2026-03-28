import { useEffect, useRef } from "react";
import type { DetectionMessage } from "../utils/tdoa";

const WS_URL = "ws://localhost:8765";

type Options = {
  onMessage: (msg: DetectionMessage) => void;
};

export function useEchoShield({ onMessage }: Options) {
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  useEffect(() => {
    let ws: WebSocket;
    let alive = true;
    const seenIds = new Set<string>(); // evita duplicados

    function connect() {
      ws = new WebSocket(WS_URL);

      ws.onopen = () => console.log("✅ EchoShield WebSocket ligado");

      ws.onmessage = (event) => {
        try {
            const raw = JSON.parse(event.data);
            const key = `${raw.device_id}_${raw.analysis_id}_${raw.timestamp}`;
            console.log("🔑 KEY:", key, "| JÁ VISTO:", seenIds.has(key));
          if (seenIds.has(key)) return; // ignora duplicado
          seenIds.add(key);

          const msg: DetectionMessage = {
            ...raw,
            timestamp: raw.timestamp / 1_000_000_000,
          };

          onMessageRef.current(msg);
        } catch (e) {
          console.warn("⚠️ Erro ao parsear mensagem WebSocket:", e);
        }
      };

      ws.onclose = () => {
        if (alive) {
          console.log("🔄 WebSocket desligado, a reconectar em 2s...");
          setTimeout(connect, 2000);
        }
      };

      ws.onerror = (e) => console.error("❌ WebSocket erro:", e);
    }

    connect();

    return () => {
      alive = false;
      ws?.close();
    };
  }, []);
}