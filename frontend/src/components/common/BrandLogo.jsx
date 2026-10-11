import React from 'react';
import { Store } from 'lucide-react';

/**
 * The product logo: a white shop icon on a rounded indigo-to-violet tile, followed by the name in bold, dark
 * lettering (Sora). size: 'sm' | 'md' | 'lg'
 */
export default function BrandLogo({ size = 'md' }) {
  return (
    <span className={`brand-word brand-${size}`}>
      <span className="brand-tile" aria-hidden="true">
        <Store className="brand-store" strokeWidth={2} />
      </span>
      <span className="brand-text">Website Presence</span>
    </span>
  );
}
