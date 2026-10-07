import React, { useState, useEffect } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Download, Share, X } from 'lucide-react';

export const PWAInstallBanner: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem('papertrail_pwa_dismissed') === 'true') setDismissed(true);
    } catch {
      // navegação privada: só não lembra a escolha
    }
  }, []);

  if (isInstalled || dismissed) {
    return null;
  }

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem('papertrail_pwa_dismissed', 'true');
    } catch {
      // ignora
    }
  };

  // Android / Chromium prompt
  if (isInstallable) {
    return (
      <aside aria-label="Instalação do aplicativo" className="mb-3 p-3 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 text-[#292524]">
          <Download size={16} strokeWidth={1.75} className="shrink-0 text-[#292524]" />
          <span>Instale o PaperTrail para acesso rápido e offline.</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={install}
            className="ledger-btn px-2.5 py-1 text-xs font-mono font-medium text-[#292524] bg-[#FAF7F2]"
          >
            Instalar
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dispensar aviso"
            className="p-1 text-[#78716C] hover:text-[#292524]"
          >
            <X size={15} />
          </button>
        </div>
      </aside>
    );
  }

  // iOS Safari prompt
  if (isIOS) {
    return (
      <aside aria-label="Instalação no iOS" className="mb-3 p-3 bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow flex items-start justify-between gap-3 text-xs">
        <div className="flex items-start gap-2 text-[#292524]">
          <Share size={16} strokeWidth={1.75} className="shrink-0 mt-0.5 text-[#292524]" />
          <div>
            <span className="font-semibold block mb-0.5">Adicionar à tela de início</span>
            <span className="text-[#78716C]">
              Toque no ícone de <strong>Compartilhar</strong> no Safari e selecione <strong>Adicionar à Tela de Início</strong>.
            </span>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          aria-label="Dispensar aviso"
          className="p-1 text-[#78716C] hover:text-[#292524] shrink-0"
        >
          <X size={15} />
        </button>
      </aside>
    );
  }

  return null;
};
