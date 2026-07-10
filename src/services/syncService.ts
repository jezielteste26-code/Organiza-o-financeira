/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * syncService — Sincronização Compartilhada via Firebase Realtime Database
 *
 * Funciona em qualquer plataforma: Netlify, APK (WebView/Capacitor), PWA.
 * Não requer servidor próprio — toda a comunicação é feita diretamente com o Firebase.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * CONFIGURAÇÃO:
 * 1. Crie um projeto em https://console.firebase.google.com
 * 2. Vá em "Build" → "Realtime Database" → Criar banco (modo teste)
 * 3. Vá em Configurações ⚙️ → Seus aplicativos → Web (</>)
 * 4. Registre o app e copie o objeto `firebaseConfig`
 * 5. Substitua os valores PLACEHOLDER abaixo ou configure as variáveis de ambiente.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getDatabase, ref, set, onValue, off, Database } from "firebase/database";

// ──────────────────────────────────────────────────────────────────────────────
// Configuração do Firebase
// Substitua pelos valores do seu projeto Firebase.
// Em produção, use variáveis de ambiente (VITE_FIREBASE_*).
// ──────────────────────────────────────────────────────────────────────────────
const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY            || "COLE_AQUI",
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN        || "COLE_AQUI",
  databaseURL:       import.meta.env.VITE_FIREBASE_DATABASE_URL       || "COLE_AQUI",
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID         || "COLE_AQUI",
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET     || "COLE_AQUI",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "COLE_AQUI",
  appId:             import.meta.env.VITE_FIREBASE_APP_ID             || "COLE_AQUI",
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID     || undefined,
};

// ──────────────────────────────────────────────────────────────────────────────
// Inicialização lazy do Firebase (evita dupla inicialização com hot reload)
// ──────────────────────────────────────────────────────────────────────────────
let app: FirebaseApp;
let db: Database;

function getFirebase(): { app: FirebaseApp; db: Database } {
  if (!app) {
    app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    db = getDatabase(app);
  }
  return { app, db };
}

/** Verifica se o Firebase está configurado (credenciais não são placeholder). */
export function isFirebaseConfigured(): boolean {
  return firebaseConfig.databaseURL !== "COLE_AQUI" &&
    firebaseConfig.databaseURL !== "" &&
    !firebaseConfig.databaseURL.includes("COLE_AQUI");
}

// ──────────────────────────────────────────────────────────────────────────────
// Gerenciamento do Código de Sincronização
// ──────────────────────────────────────────────────────────────────────────────
const SYNC_CODE_KEY = "fin_sync_code";

/** Retorna o código de sincronização ativo (ou null se não houver). */
export function getSyncCode(): string | null {
  return localStorage.getItem(SYNC_CODE_KEY);
}

/** Ativa um código de sincronização, salvando no localStorage. */
export function setSyncCode(code: string): void {
  localStorage.setItem(SYNC_CODE_KEY, code);
}

/** Desativa a sincronização removendo o código do localStorage. */
export function clearSyncCode(): void {
  localStorage.removeItem(SYNC_CODE_KEY);
}

/** Gera um código aleatório e legível de 6 caracteres (ex: "kf9x2m"). */
export function gerarCodigoAleatorio(): string {
  return Math.random().toString(36).substring(2, 8).toLowerCase();
}

// ──────────────────────────────────────────────────────────────────────────────
// Operações de leitura/escrita no Firebase Realtime Database
// ──────────────────────────────────────────────────────────────────────────────

export type SyncStatus = "idle" | "syncing" | "synced" | "error" | "no_code" | "not_configured";

/**
 * Envia (push) os dados do app para o Firebase Realtime Database.
 * Os dados ficam em: /sync_rooms/<code>/data
 */
export async function pushToServer(data: object): Promise<boolean> {
  const code = getSyncCode();
  if (!code) return false;
  if (!isFirebaseConfigured()) return false;

  try {
    const { db } = getFirebase();
    const roomRef = ref(db, `sync_rooms/${code}/data`);
    await set(roomRef, { ...data, _updatedAt: Date.now() });
    return true;
  } catch (err) {
    console.error("[syncService] Falha ao enviar dados para o Firebase:", err);
    return false;
  }
}

/**
 * Inscreve-se em atualizações em tempo real do Firebase para o código ativo.
 * A função `onDataReceived` é chamada sempre que outro dispositivo salvar dados.
 * Retorna uma função de "unsubscribe" para parar de ouvir.
 */
export function subscribeToRemoteChanges(
  onDataReceived: (data: object) => void,
  onError?: (err: Error) => void
): () => void {
  const code = getSyncCode();
  if (!code || !isFirebaseConfigured()) return () => {};

  try {
    const { db } = getFirebase();
    const roomRef = ref(db, `sync_rooms/${code}/data`);

    // Guarda o timestamp da ativação para ignorar o evento inicial (evita loop)
    const activatedAt = Date.now();
    let isFirstCall = true;

    onValue(roomRef, (snapshot) => {
      const remoteData = snapshot.val();
      if (!remoteData) return;

      // Ignora o primeiro evento (que são os dados que nós mesmos acabamos de enviar)
      if (isFirstCall) {
        isFirstCall = false;
        return;
      }

      // Só aplica dados remotos se forem mais recentes que a ativação local
      if (remoteData._updatedAt && remoteData._updatedAt > activatedAt) {
        const { _updatedAt: _, ...cleanData } = remoteData;
        onDataReceived(cleanData);
      }
    }, (error) => {
      console.error("[syncService] Erro no listener do Firebase:", error);
      onError?.(error);
    });

    // Retorna função para cancelar a inscrição
    return () => off(roomRef);
  } catch (err) {
    console.error("[syncService] Falha ao inscrever no Firebase:", err);
    return () => {};
  }
}
