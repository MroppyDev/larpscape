// Item icon preview. Uses the game's hand-authored pixel-art renderer
// (src/sprites.ts — self-contained browser canvas code, no game-state
// imports) and falls back to a colored-initials swatch if it ever throws.
import { useEffect, useRef, useState } from 'react';
import { copyCanvas, itemIcon } from '../../../../src/sprites';

function hashHue(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return ((h % 360) + 360) % 360;
}

export function ItemIcon({ id, size = 26 }: { id: string; size?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const host = ref.current;
    if (!host || failed) return;
    try {
      const c = copyCanvas(itemIcon(id));
      c.style.width = `${size}px`;
      c.style.height = `${size}px`;
      c.style.imageRendering = 'pixelated';
      c.style.display = 'block';
      host.replaceChildren(c);
    } catch {
      setFailed(true);
    }
  }, [id, size, failed]);

  if (failed) {
    return (
      <span
        title={id}
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, borderRadius: 4, fontSize: size * 0.42,
          fontWeight: 600, color: '#fff',
          background: `hsl(${hashHue(id)}, 45%, 35%)`,
        }}
      >
        {id.slice(0, 2).toUpperCase()}
      </span>
    );
  }
  return <span ref={ref} style={{ display: 'inline-block', width: size, height: size }} />;
}
