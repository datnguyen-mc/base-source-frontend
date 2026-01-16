// IframeHeartbeat.tsx
import { useEffect } from "react";

export default function IframeHeartbeat() {
  useEffect(() => {
    let timer = null;

    const send = () => {
      try {
        window.parent?.postMessage(
          { type: "IFRAME_HEARTBEAT", t: Date.now() },
          "*"
        );
      } catch {}
    };

    send();

    timer = window.setInterval(send, 500);

    return () => {
      if (timer) window.clearInterval(timer);
    };
  }, []);

  return null; 
}
