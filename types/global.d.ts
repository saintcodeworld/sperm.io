declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
  
  interface ImportMetaEnv {
    readonly VITE_MASTER_ADMIN_KEY: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
