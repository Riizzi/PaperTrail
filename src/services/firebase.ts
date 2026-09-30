import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  deleteUser,
  type User,
} from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  collection,
  doc,
  setDoc,
  getDocs,
  deleteDoc,
  onSnapshot,
  getDoc,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import type { ReferenceItem, Collection } from '../types';
import { deleteAllAttachments } from './attachments';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Removes undefined fields from objects and nested objects/arrays before Firestore operations
 */
export function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined).filter(v => v !== undefined) as unknown as T;
  }
  if (typeof obj === 'object') {
    const cleaned: any = {};
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined) {
        cleaned[key] = typeof value === 'object' && value !== null ? cleanUndefined(value) : value;
      }
    }
    return cleaned;
  }
  return obj;
}

// Configuração do Firebase via variáveis de ambiente (arquivo .env.local / painel da Vercel)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase App
export const app = initializeApp(firebaseConfig);

// Initialize Firestore with ignoreUndefinedProperties and persistent offline cache
export const db = initializeFirestore(
  app,
  {
    ignoreUndefinedProperties: true,
    localCache: persistentLocalCache({
      tabManager: persistentMultipleTabManager(),
    }),
  }
);

// Initialize Firebase Auth
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Check for redirect result on iOS standalone load
export async function checkRedirectAuth(): Promise<User | null> {
  try {
    const result = await getRedirectResult(auth);
    return result?.user || null;
  } catch (err) {
    console.error('getRedirectResult error:', err);
    return null;
  }
}

// Authentication helpers
export async function signInWithGoogle() {
  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true
  );
  const isIOS = typeof window !== 'undefined' && /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());

  if (isStandalone && isIOS) {
    // In standalone iOS PWA mode, popup often fails or gets blocked; use redirect
    return await signInWithRedirect(auth, googleProvider);
  }
  return await signInWithPopup(auth, googleProvider);
}

export async function signInWithEmail(email: string, pass: string) {
  return await signInWithEmailAndPassword(auth, email, pass);
}

export async function signUpWithEmail(email: string, pass: string) {
  return await createUserWithEmailAndPassword(auth, email, pass);
}

export async function logOut() {
  return await firebaseSignOut(auth);
}

// Firestore operations for References
export function subscribeToUserItems(userId: string, onUpdate: (items: ReferenceItem[]) => void, onError?: (err: any) => void) {
  const colPath = `users/${userId}/items`;
  const q = query(collection(db, 'users', userId, 'items'), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const items: ReferenceItem[] = [];
      snapshot.forEach((d) => {
        items.push(d.data() as ReferenceItem);
      });
      onUpdate(items);
    },
    (error) => {
      // Per requirements: do NOT throw inside onSnapshot callback
      console.error('Não foi possível carregar seus dados (onSnapshot items):', error);
      if (onError) onError(error);
    }
  );
}

export async function saveUserItem(userId: string, item: ReferenceItem): Promise<void> {
  const docPath = `users/${userId}/items/${item.id}`;
  try {
    const cleaned = cleanUndefined(item);
    await setDoc(doc(db, 'users', userId, 'items', item.id), cleaned);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function deleteUserItem(userId: string, itemId: string): Promise<void> {
  const docPath = `users/${userId}/items/${itemId}`;
  try {
    await deleteItemFulltext(userId, itemId);
    await deleteDoc(doc(db, 'users', userId, 'items', itemId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

// Firestore operations for Collections
export function subscribeToUserCollections(userId: string, onUpdate: (cols: Collection[]) => void, onError?: (err: any) => void) {
  const colPath = `users/${userId}/collections`;
  const q = query(collection(db, 'users', userId, 'collections'), orderBy('createdAt', 'desc'));

  return onSnapshot(
    q,
    (snapshot) => {
      const cols: Collection[] = [];
      snapshot.forEach((d) => {
        cols.push(d.data() as Collection);
      });
      onUpdate(cols);
    },
    (error) => {
      // Per requirements: do NOT throw inside onSnapshot callback
      console.error('Não foi possível carregar suas coleções (onSnapshot collections):', error);
      if (onError) onError(error);
    }
  );
}

export async function saveUserCollection(userId: string, colItem: Collection): Promise<void> {
  const docPath = `users/${userId}/collections/${colItem.id}`;
  try {
    const cleaned = cleanUndefined(colItem);
    await setDoc(doc(db, 'users', userId, 'collections', colItem.id), cleaned);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, docPath);
  }
}

export async function deleteUserCollection(userId: string, collectionId: string): Promise<void> {
  const docPath = `users/${userId}/collections/${collectionId}`;
  try {
    await deleteDoc(doc(db, 'users', userId, 'collections', collectionId));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, docPath);
  }
}

// Texto completo extraído do anexo: users/{uid}/items/{itemId}/content/fulltext (+ partes extras)
const FULLTEXT_CHUNK = 800_000;

export async function saveItemFulltext(
  userId: string,
  itemId: string,
  text: string,
  meta: { pageCount?: number; wordCount?: number }
): Promise<void> {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += FULLTEXT_CHUNK) chunks.push(text.slice(i, i + FULLTEXT_CHUNK));
  if (chunks.length === 0) chunks.push('');

  await deleteItemFulltext(userId, itemId);
  await setDoc(doc(db, 'users', userId, 'items', itemId, 'content', 'fulltext'), {
    text: chunks[0],
    totalParts: chunks.length,
    pageCount: meta.pageCount ?? null,
    wordCount: meta.wordCount ?? null,
    charCount: text.length,
    updatedAt: new Date().toISOString(),
  });
  for (let p = 1; p < chunks.length; p++) {
    await setDoc(doc(db, 'users', userId, 'items', itemId, 'content', `fulltext_part_${p}`), { part: p, text: chunks[p] });
  }
}

export async function getItemFulltext(userId: string, itemId: string): Promise<string> {
  try {
    const first = await getDoc(doc(db, 'users', userId, 'items', itemId, 'content', 'fulltext'));
    if (!first.exists()) return '';
    const data = first.data();
    let text: string = data.text || '';
    const total = Number(data.totalParts || 1);
    for (let p = 1; p < total; p++) {
      const part = await getDoc(doc(db, 'users', userId, 'items', itemId, 'content', `fulltext_part_${p}`));
      if (part.exists()) text += part.data().text || '';
    }
    return text;
  } catch (err) {
    console.warn('Não foi possível ler o texto completo:', err);
    return '';
  }
}

export async function deleteItemFulltext(userId: string, itemId: string): Promise<void> {
  try {
    const snap = await getDocs(collection(db, 'users', userId, 'items', itemId, 'content'));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  } catch (err) {
    console.warn('Não foi possível apagar o texto completo:', err);
  }
}

// Complete data export and wipe in batches of up to 400
export async function exportAllUserData(userId: string) {
  const itemsPath = `users/${userId}/items`;
  const collectionsPath = `users/${userId}/collections`;
  try {
    const itemsSnap = await getDocs(collection(db, 'users', userId, 'items'));
    const colsSnap = await getDocs(collection(db, 'users', userId, 'collections'));

    const items: ReferenceItem[] = [];
    itemsSnap.forEach((d) => items.push(d.data() as ReferenceItem));

    const collections: Collection[] = [];
    colsSnap.forEach((d) => collections.push(d.data() as Collection));

    return {
      version: '2.0',
      exportedAt: new Date().toISOString(),
      items,
      collections,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, `${itemsPath} & ${collectionsPath}`);
  }
}

export async function deleteAllUserDataAndAccount(user: User): Promise<void> {
  const userId = user.uid;

  // 1. Apagar os anexos no Supabase Storage (via servidor)
  try {
    await deleteAllAttachments();
  } catch (storageErr) {
    console.warn('Storage cleanup notice:', storageErr);
  }

  // 2. Fetch all Firestore documents to delete in batches of up to 400
  const itemsSnap = await getDocs(collection(db, 'users', userId, 'items'));
  const colsSnap = await getDocs(collection(db, 'users', userId, 'collections'));

  const allDocRefs = [
    ...itemsSnap.docs.map(d => d.ref),
    ...colsSnap.docs.map(d => d.ref),
  ];

  // Also include subcollections content/fulltext
  for (const itemDoc of itemsSnap.docs) {
    try {
      const contentSnap = await getDocs(collection(db, 'users', userId, 'items', itemDoc.id, 'content'));
      contentSnap.docs.forEach(d => allDocRefs.push(d.ref));
    } catch {
      // Ignore
    }
  }

  const BATCH_SIZE = 400;
  for (let i = 0; i < allDocRefs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = allDocRefs.slice(i, i + BATCH_SIZE);
    chunk.forEach(ref => batch.delete(ref));
    await batch.commit();
  }

  // 3. Delete Firebase Auth user
  await deleteUser(user);
}
