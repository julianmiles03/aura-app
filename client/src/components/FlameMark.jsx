import { useId } from 'react';

// aura's purple flame. Decorative: it always sits next to the "aura" wordmark, which carries the name.
export default function FlameMark({ className = 'flame-mark' }) {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 24 30" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9B7BFF" />
          <stop offset="1" stopColor="#5B3DF5" />
        </linearGradient>
      </defs>
      <path fill={`url(#${id})`} d="M12.6 1c1.1 4.5-.4 7 2.3 10 1.5-1.4 1.9-3.4 1.6-5.6C19.7 8.8 22 13.4 22 18.6a10 10 0 0 1-20 0c0-5.6 3.9-9.1 6.2-13.2.5 2.7 1.5 4.4 2.9 5.4.9-3 1.2-6.2 1.5-9.8z" />
      <path fill="#E6DEFF" d="M12 28.4a5.2 5.2 0 0 1-5.2-5.2c0-3.1 2.4-5 3.5-7.6.7 1.9 1.9 2.9 3 2.9.3-1.1.3-2.1.1-3.3 2.3 1.8 3.8 4.5 3.8 8a5.2 5.2 0 0 1-5.2 5.2z" />
    </svg>
  );
}
