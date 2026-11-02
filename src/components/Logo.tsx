import React from 'react';

export const LogoMark: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <svg width={size} height={size} viewBox="0 0 512 512" fill="none" aria-hidden="true">
    <rect width="512" height="512" fill="#D6CFC4" />
    <path d="M 180 120 L 310 120 L 370 180 L 370 340 L 180 340 Z" fill="#EBE5DC" stroke="#1C1917" strokeWidth="24" strokeLinejoin="round" />
    <path d="M 310 120 L 310 180 L 370 180" fill="#D6CFC4" stroke="#1C1917" strokeWidth="24" strokeLinejoin="round" />
    <line x1="220" y1="210" x2="330" y2="210" stroke="#1C1917" strokeWidth="18" strokeLinecap="round" />
    <line x1="220" y1="250" x2="310" y2="250" stroke="#1C1917" strokeWidth="18" strokeLinecap="round" />
    <path d="M 275 340 C 275 390, 220 400, 200 430 C 185 450, 195 470, 240 460 C 290 450, 340 430, 360 460" stroke="#1C1917" strokeWidth="20" strokeLinecap="round" strokeDasharray="6 24" />
  </svg>
);

export const Logo: React.FC<{ onClick?: () => void }> = ({ onClick }) => (
  <button type="button" onClick={onClick} className="flex items-center gap-2.5 select-none text-left">
    <span className="w-8 h-8 rounded-sm bg-[#D6CFC4] border border-[#292524] flex items-center justify-center ledger-shadow-sm">
      <LogoMark />
    </span>
    <span>
      <span className="font-mono font-bold text-sm text-[#292524] tracking-tight block leading-tight">PaperTrail</span>
      <span className="font-mono text-[9px] uppercase tracking-widest text-[#78716C] block leading-tight">Referências</span>
    </span>
  </button>
);
