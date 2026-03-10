import { useEffect, useRef } from 'react';
import useTimerStore from '../stores/useTimerStore';

const FAVICONS = {
  idle: createFaviconSvg('#6b6b8a'),
  active: createFaviconSvg('#10b981'),
};

function createFaviconSvg(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <circle cx="16" cy="16" r="14" fill="${color}" opacity="0.9"/>
    <text x="16" y="21" text-anchor="middle" font-size="14" font-weight="bold" fill="white">S</text>
  </svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export default function useDynamicFavicon() {
  const running = useTimerStore((s) => s.running);
  const linkRef = useRef(null);

  useEffect(() => {
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    linkRef.current = link;
  }, []);

  useEffect(() => {
    if (linkRef.current) {
      linkRef.current.href = running ? FAVICONS.active : FAVICONS.idle;
    }
    // Update page title
    document.title = running ? '⏱ Standing — StandUpTracker' : 'StandUpTracker';
  }, [running]);
}
