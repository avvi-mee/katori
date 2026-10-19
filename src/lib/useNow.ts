import { useEffect, useState } from 'react';

/** The current time, re-rendering every `every` ms while mounted (for live timers). */
export function useNow(every = 1000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(id);
  }, [every]);
  return now;
}
