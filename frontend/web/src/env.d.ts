/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly GITPULSE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
