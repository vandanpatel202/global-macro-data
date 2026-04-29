import { useEffect, useRef } from 'react';

interface Props {
  data?: number[];
  up: boolean;
}

export default function Sparkline({ data, up }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !data || data.length < 2) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio;
    const w = (canvas.width = canvas.clientWidth * dpr);
    const h = (canvas.height = canvas.clientHeight * dpr);
    ctx.clearRect(0, 0, w, h);
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const pad = 4 * dpr;
    const rootStyle = getComputedStyle(document.documentElement);
    const color = (up ? rootStyle.getPropertyValue('--up') : rootStyle.getPropertyValue('--down')).trim();
    ctx.lineWidth = 1.5 * dpr;
    ctx.strokeStyle = color;
    ctx.beginPath();
    data.forEach((v, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = color + '22';
    ctx.fill();
  }, [data, up]);

  return <canvas ref={ref} className="card-spark" width={160} height={36} />;
}
