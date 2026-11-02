import React from 'react';
import type { LetterColor } from '../types';
import { LETTER_COLORS } from '../services/letters';

interface LetterNoteProps {
  color: LetterColor;
  /** inclinação leve, em graus */
  tilt?: number;
  children: React.ReactNode;
  className?: string;
}

/** Quadradinho de post-it com fita no topo */
export const LetterNote: React.FC<LetterNoteProps> = ({ color, tilt = 0, children, className = '' }) => {
  const c = LETTER_COLORS[color] || LETTER_COLORS.amarelo;
  return (
    <div
      className={`relative border px-4 pt-6 pb-3 shadow-[2px_3px_0_#E5DCD0] ${className}`}
      style={{ backgroundColor: c.bg, borderColor: c.border, transform: tilt ? `rotate(${tilt}deg)` : undefined }}
    >
      <span
        aria-hidden="true"
        className="absolute -top-2 left-1/2 -translate-x-1/2 w-16 h-4 opacity-80 border border-white/60"
        style={{ backgroundColor: c.tape, transform: 'translateX(-50%) rotate(-2deg)' }}
      />
      {children}
    </div>
  );
};

/** inclinação estável por id (o post-it não "pula" a cada render) */
export function tiltFor(id: string): number {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 5) - 2) * 0.6;
}
