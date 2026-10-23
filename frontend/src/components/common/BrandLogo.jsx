import React, { useEffect, useState } from 'react';
import { Store } from 'lucide-react';

const NAME = 'Website Presence';

// The intro plays when the site is opened (every logo on the first screen animates together), not on every page change.
let introDone = false;

/**
 * The product logo: a white shop icon on a rounded orange tile, followed by the name in Playfair Display SC.
 * On opening the site the tile pops in with a shine, the shop icon draws itself and the name appears letter by letter.
 * size: 'sm' | 'md' | 'lg'
 */
export default function BrandLogo({ size = 'md' }) {
  const [animate] = useState(() => !introDone);

  useEffect(() => {
    const timer = setTimeout(() => { introDone = true; }, 2500);
    return () => clearTimeout(timer);
  }, []);

  return (
    <span className={`brand-word brand-${size} ${animate ? 'brand-anim' : ''}`} role="img" aria-label={NAME}>
      <span className="brand-tile" aria-hidden="true">
        <Store className="brand-store" strokeWidth={2} />
      </span>
      <span className="brand-text" aria-hidden="true">
        {NAME.split('').map((ch, i) => (
          <span key={i} className="brand-letter" style={{ '--i': i }}>{ch}</span>
        ))}
      </span>
    </span>
  );
}
