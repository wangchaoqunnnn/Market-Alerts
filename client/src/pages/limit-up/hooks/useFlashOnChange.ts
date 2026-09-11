import { useEffect, useRef, useState } from 'react';

/**
 * 数值变化闪烁动画 hook
 * 当数值变化时返回 true 持续一小段时间，用于添加闪烁样式
 */
export function useFlashOnChange(value: number | string, duration = 600): boolean {
  const [flash, setFlash] = useState(false);
  const prevRef = useRef(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (prevRef.current !== value) {
      setFlash(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setFlash(false), duration);
      prevRef.current = value;
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [value, duration]);

  return flash;
}
