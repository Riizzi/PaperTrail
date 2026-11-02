import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { DocumentType, ReferenceItem } from '../types';

/** Campos de metadados que o formulário edita (o resto do texto nunca é tocado) */
type EditableKey =
  | 'type' | 'title' | 'subtitle' | 'authors' | 'year' | 'place' | 'publication' | 'publisher'
  | 'volume' | 'number' | 'pages' | 'edition' | 'doi' | 'isbn' | 'url' | 'accessDate'
  | 'institution' | 'degree' | 'bookTitle' | 'bookOrganizer' | 'abstract';

type Field = {
  key: Exclude<EditableKey, 'type' | 'abstract'>;
  label: string;
  types?: DocumentType[]; // só aparece nesses tipos
  mono?: boolean;
  half?: boolean;
  placeholder?: string;
  required?: boolean;
};

const FIELDS: Field[] = [
  { key: 'title', label: 'Título *', required: true },
  { key: 'subtitle', label: 'Subtítulo' },
  { key: 'authors', label: 'Autores (separados por ponto e vírgula)', placeholder: 'Silva, João; Souza, Maria' },
  { key: 'bookTitle', label: 'Título do livro', types: ['chapter'] },
  { key: 'bookOrganizer', label: 'Organizador(es) do livro', types: ['chapter'] },
  { key: 'publication', label: 'Periódico', types: ['article'] },
  { key: 'publication', label: 'Nome do evento / anais', types: ['conference'] },
  { key: 'publication', label: 'Nome do site', types: ['webpage'] },
  { key: 'institution', label: 'Instituição', types: ['thesis'] },
  { key: 'degree', label: 'Tipo e curso', types: ['thesis'], placeholder: 'Dissertação (Mestrado em Educação)' },
  { key: 'year', label: 'Ano', mono: true, half: true },
  { key: 'place', label: 'Local', half: true },
  { key: 'publisher', label: 'Editora', types: ['book', 'chapter', 'conference'], half: true },
  { key: 'edition', label: 'Edição', types: ['book', 'chapter'], half: true, placeholder: '2. ed' },
  { key: 'volume', label: 'Volume', types: ['article', 'conference'], mono: true, half: true },
  { key: 'number', label: 'Número', types: ['article'], mono: true, half: true },
  { key: 'pages', label: 'Páginas', types: ['article', 'chapter', 'conference'], mono: true, half: true, placeholder: '1-20' },
  { key: 'isbn', label: 'ISBN', types: ['book', 'chapter'], mono: true, half: true },
  { key: 'doi', label: 'DOI', mono: true },
  { key: 'url', label: 'URL', mono: true },
  { key: 'accessDate', label: 'Data de acesso', mono: true, half: true, placeholder: '12 mar. 2025' },
];

const ALL_KEYS: EditableKey[] = ['type', 'abstract', ...new Set(FIELDS.map((f) => f.key))];

interface ItemEditFormProps {
  item: ReferenceItem;
  onSave: (fields: Partial<ReferenceItem>) => Promise<void>;
  onCancel: () => void;
  onDelete: () => void;
}

export const ItemEditForm: React.FC<ItemEditFormProps> = ({ item, onSave, onCancel, onDelete }) => {
  const [form, setForm] = useState<Partial<Record<EditableKey, string>>>(() =>
    Object.fromEntries(ALL_KEYS.map((k) => [k, (item[k] as string) || ''])) as Partial<Record<EditableKey, string>>
  );
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const type = (form.type || 'article') as DocumentType;
  const set = (k: EditableKey, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // Só os campos editados; vazio vira undefined (removido ao gravar)
      const fields = Object.fromEntries(
        ALL_KEYS.map((k) => [k, form[k]?.trim() ? form[k]!.trim() : undefined])
      ) as Partial<ReferenceItem>;
      fields.type = type;
      await onSave(fields);
    } finally {
      setSaving(false);
    }
  };

  const visible = FIELDS.filter((f) => !f.types || f.types.includes(type));
  const inputCls = 'w-full bg-[#FAF7F2] border border-[#E8DFD1] p-2 text-xs focus:outline-none focus:border-[#292524]';

  // agrupa campos "half" lado a lado
  const rows: Field[][] = [];
  for (const f of visible) {
    const last = rows[rows.length - 1];
    if (f.half && last && last.length === 1 && last[0].half) last.push(f);
    else rows.push([f]);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
      <div>
        <label htmlFor="edit-type" className="block text-[#78716C] mb-1">Tipo de documento</label>
        <select id="edit-type" value={type} onChange={(e) => set('type', e.target.value)} className={`${inputCls} font-mono`}>
          <option value="article">Artigo de periódico</option>
          <option value="book">Livro</option>
          <option value="chapter">Capítulo de livro</option>
          <option value="thesis">Tese / Dissertação / TCC</option>
          <option value="conference">Trabalho em evento</option>
          <option value="webpage">Site / Página Web</option>
        </select>
      </div>

      {rows.map((row) => (
        <div key={row.map((f) => f.key + f.label).join()} className={row.length > 1 ? 'grid grid-cols-2 gap-3' : ''}>
          {row.map((f) => (
            <div key={f.key + f.label}>
              <label htmlFor={`edit-${f.key}`} className="block text-[#78716C] mb-1">{f.label}</label>
              <input
                id={`edit-${f.key}`}
                type="text"
                value={form[f.key] || ''}
                onChange={(e) => set(f.key, e.target.value)}
                placeholder={f.placeholder}
                required={f.required}
                className={`${inputCls} ${f.mono ? 'font-mono' : 'font-sans'}`}
              />
            </div>
          ))}
        </div>
      ))}

      <div>
        <label htmlFor="edit-abstract" className="block text-[#78716C] mb-1">Resumo original (abstract)</label>
        <textarea
          id="edit-abstract"
          value={form.abstract || ''}
          onChange={(e) => set('abstract', e.target.value)}
          rows={4}
          className={`${inputCls} font-sans`}
        />
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-[#E8DFD1]">
        <button
          type="button"
          onClick={() => (confirmDelete ? onDelete() : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
          className={`px-3 py-1.5 text-xs border flex items-center gap-1 font-mono ${
            confirmDelete
              ? 'bg-[#991B1B] border-[#991B1B] text-white'
              : 'text-[#991B1B] hover:bg-[#FEE2E2] border-[#FCA5A5]'
          }`}
        >
          <Trash2 size={13} />
          {confirmDelete ? 'Confirmar exclusão' : 'Excluir texto'}
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="ledger-btn px-3 py-1.5 text-xs font-mono">
            Cancelar
          </button>
          <button type="submit" disabled={saving} className="ledger-btn-primary px-4 py-1.5 text-xs font-mono disabled:opacity-60">
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </form>
  );
};
