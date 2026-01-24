/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_SERVER_URL: string
  readonly VITE_TREASURY_WALLET_ADDRESS: string
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_SUPABASE_SERVICE_ROLE_KEY: string
  readonly VITE_MASTER_ADMIN_KEY: string
  readonly VITE_WALLET_ENCRYPTION_KEY: string
  readonly DEBUG_TRANSACTIONS: string
  readonly SOLANA_CLUSTER: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
