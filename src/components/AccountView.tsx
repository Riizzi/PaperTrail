import React, { useState } from 'react';
import type { User } from 'firebase/auth';
import {
  logOut,
  exportAllUserData,
  deleteAllUserDataAndAccount,
  saveUserItem,
  saveUserCollection,
} from '../services/firebase';
import { Download, Upload, LogOut, Trash2, Database, HardDrive, AlertTriangle, X } from 'lucide-react';

interface AccountViewProps {
  user: User;
  itemCount: number;
  collectionCount: number;
  onToast: (msg: string) => void;
}

export const AccountView: React.FC<AccountViewProps> = ({
  user,
  itemCount,
  collectionCount,
  onToast,
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Custom styled modal state for deletion
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleExportBackup = async () => {
    setIsExporting(true);
    try {
      const data = await exportAllUserData(user.uid);
      if (!data) throw new Error('Falha ao exportar');

      const jsonStr = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `papertrail_backup_${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);

      onToast('Backup exportado com sucesso');
    } catch {
      onToast('Erro ao exportar backup');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);

      if (!parsed.items || !Array.isArray(parsed.items)) {
        throw new Error('Formato de backup inválido.');
      }

      // Restore collections
      if (Array.isArray(parsed.collections)) {
        for (const col of parsed.collections) {
          await saveUserCollection(user.uid, {
            ...col,
            userId: user.uid,
          });
        }
      }

      // Restore items (including notesList, attachment metadata, abstract)
      for (const it of parsed.items) {
        await saveUserItem(user.uid, {
          ...it,
          userId: user.uid,
        });
      }

      onToast(`Backup restaurado (${parsed.items.length} textos)`);
    } catch (err: any) {
      console.error(err);
      onToast(err.message || 'Erro ao importar backup');
    } finally {
      setIsImporting(false);
      e.target.value = '';
    }
  };

  const handleConfirmDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (confirmInput.trim() !== 'EXCLUIR') {
      setDeleteError('Digite EXCLUIR em maiúsculas para confirmar.');
      return;
    }

    setIsDeleting(true);
    setDeleteError(null);

    try {
      await deleteAllUserDataAndAccount(user);
      onToast('Conta e dados excluídos com sucesso');
    } catch (err: any) {
      console.error(err);
      if (err.code === 'auth/requires-recent-login') {
        setDeleteError('Esta operação requer autenticação recente. Saia da conta, entre novamente e repita a exclusão.');
      } else {
        setDeleteError(err.message || 'Erro ao excluir conta. Tente novamente.');
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      await logOut();
      onToast('Sessão encerrada');
    } catch {
      onToast('Erro ao sair');
    }
  };

  return (
    <div className="space-y-4 text-xs font-mono">
      {/* Account Info Card */}
      <div className="bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow p-4 space-y-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-[#57534E]">
          Conta de usuário
        </h2>

        <div className="p-3 bg-[#FAF7F2] border border-[#E8DFD1] space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[#78716C] font-sans">E-mail:</span>
            <span className="font-semibold text-[#292524]">{user.email || 'Não informado'}</span>
          </div>
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-[#78716C] font-sans">Identificador:</span>
            <span className="text-[#78716C] truncate max-w-[190px]">{user.uid}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-center pt-1">
          <div className="p-2 bg-[#FAF7F2] border border-[#E8DFD1]">
            <span className="block font-bold text-base text-[#292524]">{itemCount}</span>
            <span className="text-[10px] text-[#78716C] font-sans uppercase">Textos salvos</span>
          </div>
          <div className="p-2 bg-[#FAF7F2] border border-[#E8DFD1]">
            <span className="block font-bold text-base text-[#292524]">{collectionCount}</span>
            <span className="text-[10px] text-[#78716C] font-sans uppercase">Coleções</span>
          </div>
        </div>

        <div className="pt-2 border-t border-[#F0E9DF]">
          <button
            onClick={handleSignOut}
            className="w-full ledger-btn py-2 text-xs flex items-center justify-center gap-1.5 text-[#292524] bg-[#FAF7F2]"
          >
            <LogOut size={14} />
            <span>Sair da conta</span>
          </button>
        </div>
      </div>

      {/* Offline Storage Status */}
      <div className="bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow p-4 space-y-2">
        <div className="flex items-center gap-2">
          <HardDrive size={15} strokeWidth={1.8} className="text-[#292524]" />
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#292524]">
            Armazenamento Offline (Firestore)
          </h3>
        </div>
        <p className="text-xs font-sans text-[#78716C] leading-relaxed">
          O cache persistente local está ativado. Sua biblioteca é salva no dispositivo para leitura e consulta mesmo sem conexão à internet. Ao reconectar, as alterações são sincronizadas.
        </p>
      </div>

      {/* Backup & Data Export/Import */}
      <div className="bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Database size={15} strokeWidth={1.8} className="text-[#292524]" />
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#292524]">
            Backup e portabilidade
          </h3>
        </div>

        <p className="text-xs font-sans text-[#78716C]">
          Exporte uma cópia completa de segurança em arquivo JSON (inclui metadados de anexos e apontamentos) ou restaure um backup anterior.
        </p>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <button
            onClick={handleExportBackup}
            disabled={isExporting}
            className="flex-1 ledger-btn-primary py-2 text-xs flex items-center justify-center gap-1.5"
          >
            <Download size={14} />
            <span>{isExporting ? 'Exportando...' : 'Exportar backup (JSON)'}</span>
          </button>

          <label className="flex-1 ledger-btn py-2 text-xs flex items-center justify-center gap-1.5 bg-[#FAF7F2] cursor-pointer">
            <Upload size={14} />
            <span>{isImporting ? 'Importando...' : 'Importar backup (JSON)'}</span>
            <input
              type="file"
              accept=".json,application/json"
              onChange={handleImportBackup}
              disabled={isImporting}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-[#FFFDF9] border border-[#FCA5A5] ledger-shadow p-4 space-y-3">
        <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-[#991B1B]">
          Zona de perigo
        </h3>
        <p className="text-xs font-sans text-[#78716C]">
          Apague definitivamente todos os registros, coleções, arquivos anexados e sua conta.
        </p>
        <button
          onClick={() => {
            setShowDeleteModal(true);
            setConfirmInput('');
            setDeleteError(null);
          }}
          className="w-full border border-[#FCA5A5] bg-[#FFF5F5] hover:bg-[#FEE2E2] text-[#991B1B] py-2 text-xs font-mono font-medium flex items-center justify-center gap-1.5"
        >
          <Trash2 size={14} />
          <span>Excluir conta e dados</span>
        </button>
      </div>

      {/* Retro Ledger Styled In-App Deletion Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-[1px] p-4">
          <div className="w-full max-w-sm bg-[#FFFDF9] border border-[#E8DFD1] ledger-shadow-md p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#F0E9DF] pb-2">
              <div className="flex items-center gap-2 text-[#991B1B]">
                <AlertTriangle size={18} />
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider">
                  Confirmar exclusão de conta
                </h3>
              </div>
              <button
                onClick={() => setShowDeleteModal(false)}
                className="text-[#78716C] hover:text-[#292524] p-1"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-xs font-sans text-[#57534E] leading-relaxed">
              Esta ação é permanente e irreversível. Todos os seus textos salvos, anotações, coleções e arquivos no armazenamento serão apagados.
            </p>

            {deleteError && (
              <div className="p-2.5 bg-[#FFF5F5] border border-[#FCA5A5] text-[#991B1B] text-xs font-sans leading-relaxed">
                {deleteError}
              </div>
            )}

            <form onSubmit={handleConfirmDelete} className="space-y-3">
              <div>
                <label className="block text-[11px] font-sans text-[#57534E] mb-1">
                  Digite <strong>EXCLUIR</strong> para prosseguir:
                </label>
                <input
                  type="text"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  placeholder="EXCLUIR"
                  className="w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 font-mono text-xs focus:outline-none focus:border-[#991B1B]"
                  autoFocus
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#F0E9DF]">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={isDeleting}
                  className="ledger-btn px-3 py-1.5 font-mono text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isDeleting || confirmInput.trim() !== 'EXCLUIR'}
                  className="px-3 py-1.5 font-mono text-xs bg-[#991B1B] text-white border border-[#991B1B] disabled:opacity-50 ledger-btn"
                >
                  {isDeleting ? 'Excluindo...' : 'Excluir definitivamente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
