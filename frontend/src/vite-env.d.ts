/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Backend adresi. Boşsa Vite proxy'si kullanılır (geliştirme). */
  readonly VITE_API_URL?: string;
  /** Socket.io adresi. Boşsa VITE_API_URL, o da boşsa "/" kullanılır. */
  readonly VITE_SOCKET_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
