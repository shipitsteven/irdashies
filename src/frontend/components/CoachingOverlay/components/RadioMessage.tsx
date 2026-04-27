import { useEffect, useRef } from 'react';

interface RadioMessageProps {
  message: string | null;
  fadeDuration: number; // seconds
  fontSize: number;
}

export const RadioMessage = ({
  message,
  fadeDuration,
  fontSize,
}: RadioMessageProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  // Use DOM manipulation for the fade animation to avoid setState in effect
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !message) return;

    // Reset opacity to show new message
    el.style.opacity = '1';

    const timer = setTimeout(() => {
      el.style.opacity = '0';
    }, fadeDuration * 1000);

    return () => clearTimeout(timer);
  }, [message, fadeDuration]);

  if (!message) return null;

  return (
    <div
      ref={containerRef}
      className="transition-opacity ease-out"
      style={{
        transitionDuration: '2s',
        opacity: 0,
        fontSize: `${fontSize - 1}px`,
      }}
    >
      <span className="text-sky-300/80 italic">
        &quot;{message}&quot;
      </span>
    </div>
  );
};
