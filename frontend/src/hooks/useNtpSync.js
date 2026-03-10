import { useEffect, useRef } from 'react';
import useSocketStore from '../stores/useSocketStore';
import useTimerStore from '../stores/useTimerStore';

const NTP_ROUNDS = 5;
const NTP_INTERVAL = 60_000; // re-sync every 60s

export default function useNtpSync() {
  const socket = useSocketStore((s) => s.socket);
  const setNtpOffset = useTimerStore((s) => s.setNtpOffset);
  const samplesRef = useRef([]);

  useEffect(() => {
    if (!socket) return;

    function runSync() {
      samplesRef.current = [];
      for (let i = 0; i < NTP_ROUNDS; i++) {
        setTimeout(() => {
          if (!socket.connected) return;
          const t0 = Date.now();
          socket.emit('NTP_PING', { t0 });
        }, i * 200);
      }
    }

    function handlePong(data) {
      const t3 = Date.now();
      const { t0, t1, t2 } = data;
      const rtt = (t3 - t0) - (t2 - t1);
      const offset = ((t1 - t0) + (t2 - t3)) / 2;

      samplesRef.current.push({ rtt, offset });

      if (samplesRef.current.length >= NTP_ROUNDS) {
        // Use median offset (discard outliers)
        const sorted = [...samplesRef.current].sort((a, b) => a.rtt - b.rtt);
        const median = sorted[Math.floor(sorted.length / 2)];
        setNtpOffset(Math.round(median.offset));
      }
    }

    socket.on('NTP_PONG', handlePong);
    runSync();
    const interval = setInterval(runSync, NTP_INTERVAL);

    return () => {
      socket.off('NTP_PONG', handlePong);
      clearInterval(interval);
    };
  }, [socket, setNtpOffset]);
}
