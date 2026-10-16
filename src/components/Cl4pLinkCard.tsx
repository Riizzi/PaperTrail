import { useEffect, useState } from 'react';
import { cl4pDesvincular, cl4pEnviarAgora, cl4pOuvir, cl4pStatus, cl4pVincular } from '../services/cl4pLink';

/** Cartão de ajustes do Link CL4P-RZ (vincular, ver status, enviar agora, desvincular). */
export default function Cl4pLinkCard() {
  const [st, setSt] = useState(cl4pStatus);
  const [codigo, setCodigo] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => cl4pOuvir(() => setSt(cl4pStatus())), []);

  const quando = st.ultimoEnvio
    ? new Date(st.ultimoEnvio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="bg-[#FFFDF9] border border-[#E8DFD1] rounded-2xl p-4 space-y-3" style={{ boxShadow: '2px 2px 0 #E5DCD0' }}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] font-mono font-bold uppercase tracking-wider text-[#57534E]">Link CL4P-RZ</h3>
        <span className={`text-[10px] font-mono font-bold uppercase ${st.vinculado ? 'text-[#4E7060]' : 'text-[#A8A29E]'}`}>
          {st.vinculado ? '● vinculado' : '○ desligado'}
        </span>
      </div>
      <p className="text-xs text-[#78716C] leading-relaxed">
        {st.vinculado
          ? `Um resumo dos dados vai para o seu hub (${st.servidor}) sempre que algo muda.`
          : 'Abra este app pelo CL4P-RZ ou cole o código de vínculo que aparece nos ajustes do hub.'}
      </p>
      {st.vinculado ? (
        <>
          <p className="text-xs font-mono text-[#57534E]">
            {st.enviando ? 'Enviando…' : quando ? `Último envio: ${quando}` : 'Nenhum envio ainda.'}
          </p>
          {st.erro && <p className="text-xs text-[#B4413A]">{st.erro}</p>}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void cl4pEnviarAgora()}
              className="flex-1 min-h-11 rounded-xl text-sm font-bold bg-[#292524] text-[#FAF7F2] active:translate-x-px active:translate-y-px"
            >
              Enviar agora
            </button>
            <button
              type="button"
              onClick={() => {
                if (confirm('Desligar o envio para o CL4P-RZ?')) cl4pDesvincular();
              }}
              className="min-h-11 px-4 rounded-xl text-sm font-bold bg-[#FAF7F2] text-[#57534E] border border-[#E8DFD1]"
            >
              Desvincular
            </button>
          </div>
        </>
      ) : (
        <div className="flex gap-2">
          <input
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="cl4p1.…"
            autoCapitalize="off"
            autoCorrect="off"
            className="flex-1 min-w-0 bg-[#FAF7F2] border border-[#E8DFD1] px-3 py-2.5 rounded-xl text-base text-[#292524] focus:outline-none"
          />
          <button
            type="button"
            onClick={() => {
              setMsg(cl4pVincular(codigo) ? null : 'Código inválido.');
              setCodigo('');
            }}
            className="min-h-11 px-4 rounded-xl text-sm font-bold bg-[#292524] text-[#FAF7F2]"
          >
            Vincular
          </button>
        </div>
      )}
      {msg && <p className="text-xs text-[#B4413A]">{msg}</p>}
    </div>
  );
}
