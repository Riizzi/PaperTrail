import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Letter, LetterColor } from '../types';

/**
 * Cartinhas: mensagens deixadas por um link secreto, sem login.
 *
 * - letterboxes/{uid}            { writeKey }  — só o dono lê/escreve
 * - letterboxes/{uid}/letters/x  { text, from?, color, key, createdAt }
 *   qualquer pessoa cria, desde que `key` seja igual ao writeKey atual (regras do Firestore);
 *   só o dono lê, marca como lida e apaga.
 *
 * O link é /cartinha#{uid}.{writeKey}. Gerar um link novo troca o writeKey e o antigo para de funcionar.
 * O código vai no fragmento (#), que não chega aos logs do servidor.
 */

export const LETTER_COLORS: Record<LetterColor, { bg: string; border: string; tape: string; label: string }> = {
  amarelo: { bg: '#FBF1C7', border: '#E8D9A0', tape: '#EADFB0', label: 'Amarelo' },
  rosa: { bg: '#FBE3EA', border: '#EFC0CE', tape: '#F1CDD8', label: 'Rosa' },
  azul: { bg: '#E2EEF8', border: '#BCD3E8', tape: '#C9DBEC', label: 'Azul' },
  verde: { bg: '#E5F2DF', border: '#BFD9B4', tape: '#CDE2C4', label: 'Verde' },
};

export const MAX_LETTER_CHARS = 1000;
export const MAX_FROM_CHARS = 60;

function randomKey(bytes = 18): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return Array.from(arr, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, bytes * 2);
}

/** Link para mandar a quem vai escrever. Cria a caixa na primeira vez; `renew` invalida o link anterior. */
export async function getLetterLink(uid: string, renew = false): Promise<string> {
  const ref = doc(db, 'letterboxes', uid);
  let key: string | undefined;
  if (!renew) {
    const snap = await getDoc(ref);
    key = snap.exists() ? (snap.data().writeKey as string) : undefined;
  }
  if (!key) {
    key = randomKey();
    await setDoc(ref, { writeKey: key, updatedAt: serverTimestamp() });
  }
  return `${window.location.origin}/cartinha#${uid}.${key}`;
}

/** Lê "#uid.chave" do endereço da página de escrever */
export function parseLetterHash(hash: string): { ownerId: string; key: string } | null {
  const m = hash.replace(/^#/, '').match(/^([\w-]{1,128})\.([a-z0-9]{8,64})$/i);
  return m ? { ownerId: m[1], key: m[2] } : null;
}

export async function sendLetter(
  target: { ownerId: string; key: string },
  letter: { text: string; from?: string; color: LetterColor }
): Promise<void> {
  const text = letter.text.trim().slice(0, MAX_LETTER_CHARS);
  if (!text) throw new Error('Escreva alguma coisa antes de enviar.');
  const from = letter.from?.trim().slice(0, MAX_FROM_CHARS);
  const id = `l_${Date.now()}_${randomKey(4)}`;
  try {
    await setDoc(doc(db, 'letterboxes', target.ownerId, 'letters', id), {
      text,
      ...(from ? { from } : {}),
      color: letter.color,
      key: target.key,
      createdAt: serverTimestamp(),
    });
  } catch (err: any) {
    if (err?.code === 'permission-denied') {
      throw new Error('Este link não vale mais. Peça o link novo para quem vai receber.');
    }
    throw new Error('Não foi possível enviar agora. Confira a internet e tente de novo.');
  }
}

export function subscribeToLetters(uid: string, onUpdate: (letters: Letter[]) => void): () => void {
  const q = query(collection(db, 'letterboxes', uid, 'letters'), orderBy('createdAt', 'desc'), limit(200));
  return onSnapshot(
    q,
    (snap) => {
      onUpdate(
        snap.docs.map((d) => {
          const data = d.data({ serverTimestamps: 'estimate' });
          const toIso = (v: any) => (v?.toDate ? v.toDate().toISOString() : typeof v === 'string' ? v : undefined);
          return {
            id: d.id,
            text: String(data.text || ''),
            from: data.from || undefined,
            color: (data.color in LETTER_COLORS ? data.color : 'amarelo') as LetterColor,
            createdAt: toIso(data.createdAt) || new Date().toISOString(),
            readAt: toIso(data.readAt),
          };
        })
      );
    },
    (err) => console.error('Não foi possível carregar as cartinhas:', err)
  );
}

export async function markLettersRead(uid: string, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map((id) => updateDoc(doc(db, 'letterboxes', uid, 'letters', id), { readAt: serverTimestamp() }))
  );
}

export async function deleteLetter(uid: string, id: string): Promise<void> {
  await deleteDoc(doc(db, 'letterboxes', uid, 'letters', id));
}
