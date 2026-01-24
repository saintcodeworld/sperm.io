-- Sperm.io PostgreSQL Database Schema
-- Production-ready schema for local PostgreSQL deployment

-- Enable UUID extension for generating UUIDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- USERS/PROFILES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    internal_pubkey VARCHAR(100) DEFAULT 'PENDING',
    internal_privkey_encrypted TEXT DEFAULT 'PENDING',
    account_balance DECIMAL(20, 10) DEFAULT 0,
    photo_url TEXT,
    is_admin BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);

-- ============================================
-- GAME HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS game_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    game_id VARCHAR(100) NOT NULL,
    final_length INTEGER DEFAULT 0,
    final_score INTEGER DEFAULT 0,
    stake_amount DECIMAL(20, 10) DEFAULT 0,
    result VARCHAR(20) NOT NULL CHECK (result IN ('killed', 'cashout', 'disconnected')),
    killed_by VARCHAR(100),
    survived_seconds INTEGER DEFAULT 0,
    sol_won DECIMAL(20, 10) DEFAULT 0,
    sol_lost DECIMAL(20, 10) DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for faster user game history lookups
CREATE INDEX IF NOT EXISTS idx_game_history_user_id ON game_history(user_id);
CREATE INDEX IF NOT EXISTS idx_game_history_created_at ON game_history(created_at DESC);

-- ============================================
-- USER STATISTICS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS user_statistics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    total_games_played INTEGER DEFAULT 0,
    total_wins INTEGER DEFAULT 0,
    total_losses INTEGER DEFAULT 0,
    total_sol_won DECIMAL(20, 10) DEFAULT 0,
    total_sol_lost DECIMAL(20, 10) DEFAULT 0,
    best_score INTEGER DEFAULT 0,
    best_length INTEGER DEFAULT 0,
    longest_survival_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for user statistics
CREATE INDEX IF NOT EXISTS idx_user_statistics_user_id ON user_statistics(user_id);

-- ============================================
-- TRANSACTION HISTORY TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS transaction_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    type VARCHAR(20) NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'game_win', 'game_loss', 'stake')),
    amount DECIMAL(20, 10) NOT NULL,
    balance_before DECIMAL(20, 10) DEFAULT 0,
    balance_after DECIMAL(20, 10) DEFAULT 0,
    transaction_hash VARCHAR(200),
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for transaction history
CREATE INDEX IF NOT EXISTS idx_transaction_history_user_id ON transaction_history(user_id);
CREATE INDEX IF NOT EXISTS idx_transaction_history_created_at ON transaction_history(created_at DESC);

-- ============================================
-- SESSIONS TABLE (for JWT-like session management)
-- ============================================
CREATE TABLE IF NOT EXISTS sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT
);

-- Index for session lookups
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- ============================================
-- ADMIN WHITELIST TABLE (for extra auth)
-- ============================================
CREATE TABLE IF NOT EXISTS admin_whitelist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    ip_address VARCHAR(45) NOT NULL,
    description VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for profiles table
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for user_statistics table
DROP TRIGGER IF EXISTS update_user_statistics_updated_at ON user_statistics;
CREATE TRIGGER update_user_statistics_updated_at
    BEFORE UPDATE ON user_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- CLEANUP OLD SESSIONS (Run periodically)
-- ============================================
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS void AS $$
BEGIN
    DELETE FROM sessions WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- GRANT PERMISSIONS (for application user)
-- ============================================
-- Note: Run these after creating the application user
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO spermio_app;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO spermio_app;

COMMENT ON TABLE profiles IS 'User accounts and wallet information';
COMMENT ON TABLE game_history IS 'Record of all games played';
COMMENT ON TABLE user_statistics IS 'Aggregated statistics per user';
COMMENT ON TABLE transaction_history IS 'All financial transactions';
COMMENT ON TABLE sessions IS 'Active user sessions for authentication';
COMMENT ON TABLE admin_whitelist IS 'IP addresses allowed to access admin panel';
