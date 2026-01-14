declare global {
  interface Window {
    Buffer: typeof Buffer;
  }
  
  interface ImportMetaEnv {
    readonly VITE_MASTER_ADMIN_KEY: string;
    readonly VITE_TREASURY_WALLET_ADDRESS: string;
    readonly VITE_SUPABASE_URL: string;
    readonly VITE_SUPABASE_ANON_KEY: string;
    readonly VITE_WALLET_ENCRYPTION_KEY: string;
    readonly GEMINI_API_KEY?: string;
    readonly TREASURY_PUBLIC_KEY?: string;
  }
  
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export {};
