/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  /** Base URL of the datasets volume (optional, defaults to /data) */
  readonly VITE_DATA_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
