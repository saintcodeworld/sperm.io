import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '..', '.env.local') });

console.log('🚀 Starting DepositScanner Backend Server...');
console.log('📍 Environment Check:');
console.log('   - SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅ Loaded' : '❌ Missing');

const { depositScanner } = await import('../services/DepositScanner.ts');

depositScanner.setStatusCallback((connected, message) => {
  if (connected) {
    console.log(`✅ ${message}`);
  } else {
    console.error(`❌ ${message}`);
  }
});

await depositScanner.start();

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down DepositScanner...');
  depositScanner.stop();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down DepositScanner...');
  depositScanner.stop();
  process.exit(0);
});

console.log('✅ Backend Server Running - Monitoring deposits every 15 seconds...');
