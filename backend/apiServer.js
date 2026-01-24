/**
 * Sperm.io API Server
 * PostgreSQL Backend API for authentication and data operations
 * DEBUG LOG: All operations are logged for easier debugging
 */

import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '..', '.env.local') });
dotenv.config({ path: join(__dirname, '..', '.env.production') });

const app = express();
const PORT = process.env.API_PORT || 3001;

// DEBUG LOG: Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'spermio',
  user: process.env.DB_USER || 'spermio_app',
  password: process.env.DB_PASSWORD || 'spermio_password',
  max: 20, // Maximum pool connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
};

console.log('[API] Database config:', {
  host: dbConfig.host,
  port: dbConfig.port,
  database: dbConfig.database,
  user: dbConfig.user
});

// Create PostgreSQL pool
const pool = new pg.Pool(dbConfig);

// Test database connection
pool.on('connect', () => {
  console.log('[API] Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('[API] PostgreSQL pool error:', err);
});

// JWT Secret
const JWT_SECRET = process.env.JWT_SECRET || 'spermio-jwt-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:5173'],
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

// ============================================
// AUTH MIDDLEWARE
// ============================================
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // Verify session exists in database
    const sessionResult = await pool.query(
      'SELECT * FROM sessions WHERE user_id = $1 AND expires_at > NOW()',
      [decoded.userId]
    );

    if (sessionResult.rows.length === 0) {
      return res.status(401).json({ error: 'Session expired' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    console.error('[API] Token verification failed:', err.message);
    return res.status(403).json({ error: 'Invalid token' });
  }
};

// Admin authentication middleware
const authenticateAdmin = async (req, res, next) => {
  await authenticateToken(req, res, async () => {
    try {
      // Check if user is admin
      const userResult = await pool.query(
        'SELECT is_admin FROM profiles WHERE id = $1',
        [req.user.userId]
      );

      if (!userResult.rows[0]?.is_admin) {
        // Check IP whitelist
        const clientIP = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        const whitelistResult = await pool.query(
          'SELECT * FROM admin_whitelist WHERE ip_address = $1',
          [clientIP]
        );

        if (whitelistResult.rows.length === 0) {
          return res.status(403).json({ error: 'Admin access denied' });
        }
      }

      next();
    } catch (err) {
      console.error('[API] Admin auth error:', err);
      return res.status(500).json({ error: 'Admin authentication failed' });
    }
  });
};

// ============================================
// HEALTH CHECK
// ============================================
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', database: 'connected' });
  } catch (err) {
    console.error('[API] Health check failed - Database connection error:', err.message);
    console.error('[API] Detailed error:', err);
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: err.message,
      hint: 'Check if DB_HOST, DB_USER, and DB_PASSWORD are correct in environment variables.'
    });
  }
});

// ============================================
// AUTH ROUTES
// ============================================

// Sign up
app.post('/api/auth/signup', async (req, res) => {
  const { email, password, username } = req.body;
  console.log(`[API] Signup attempt for: ${username}`);

  try {
    // Validate input
    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Email, password, and username are required' });
    }

    // Check if user exists
    const existingUser = await pool.query(
      'SELECT id FROM profiles WHERE email = $1 OR username = $2',
      [email, username]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({ error: 'User already exists' });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user
    const result = await pool.query(
      `INSERT INTO profiles (email, password_hash, username) 
       VALUES ($1, $2, $3) 
       RETURNING id, username, email, internal_pubkey, account_balance, created_at`,
      [email, passwordHash, username]
    );

    const user = result.rows[0];

    // Create session token
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Store session
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, token.substring(0, 50), expiresAt, req.ip, req.headers['user-agent']]
    );

    console.log(`[API] User created successfully: ${username}`);
    res.json({
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email
        },
        session: {
          token,
          expiresAt
        }
      }
    });
  } catch (err) {
    console.error('[API] Signup error:', err);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Sign in
app.post('/api/auth/signin', async (req, res) => {
  const { email, password } = req.body;
  console.log(`[API] Signin attempt for: ${email}`);

  try {
    // Find user
    const result = await pool.query(
      'SELECT * FROM profiles WHERE email = $1',
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Create session token
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });

    // Store session
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await pool.query(
      `INSERT INTO sessions (user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.id, token.substring(0, 50), expiresAt, req.ip, req.headers['user-agent']]
    );

    console.log(`[API] User signed in: ${user.username}`);
    res.json({
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          internal_pubkey: user.internal_pubkey,
          account_balance: parseFloat(user.account_balance) || 0,
          photo_url: user.photo_url
        },
        session: {
          token,
          expiresAt
        }
      }
    });
  } catch (err) {
    console.error('[API] Signin error:', err);
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

// Sign out
app.post('/api/auth/signout', authenticateToken, async (req, res) => {
  try {
    await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.user.userId]);
    console.log(`[API] User signed out: ${req.user.username}`);
    res.json({ data: { success: true } });
  } catch (err) {
    console.error('[API] Signout error:', err);
    res.status(500).json({ error: 'Failed to sign out' });
  }
});

// Get session
app.get('/api/auth/session', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, internal_pubkey, account_balance, photo_url FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      data: {
        session: { userId: user.id },
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          internal_pubkey: user.internal_pubkey,
          account_balance: parseFloat(user.account_balance) || 0,
          photo_url: user.photo_url
        }
      }
    });
  } catch (err) {
    console.error('[API] Session error:', err);
    res.status(500).json({ error: 'Failed to get session' });
  }
});

// Get current user
app.get('/api/auth/user', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, internal_pubkey, account_balance, photo_url FROM profiles WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ data: { user: result.rows[0] } });
  } catch (err) {
    console.error('[API] Get user error:', err);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update password
app.put('/api/auth/password', authenticateToken, async (req, res) => {
  const { password } = req.body;

  try {
    const passwordHash = await bcrypt.hash(password, 12);
    await pool.query(
      'UPDATE profiles SET password_hash = $1 WHERE id = $2',
      [passwordHash, req.user.userId]
    );

    console.log(`[API] Password updated for user: ${req.user.username}`);
    res.json({ data: { success: true } });
  } catch (err) {
    console.error('[API] Password update error:', err);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// ============================================
// PROFILE ROUTES
// ============================================

app.get('/api/profiles/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username, email, internal_pubkey, internal_privkey_encrypted, account_balance, photo_url FROM profiles WHERE id = $1',
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found', code: 'PGRST116' });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[API] Get profile error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

app.get('/api/profiles/username/:username', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, username FROM profiles WHERE username = $1',
      [req.params.username]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Profile not found', code: 'PGRST116' });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[API] Get profile by username error:', err);
    res.status(500).json({ error: 'Failed to get profile' });
  }
});

app.put('/api/profiles/:userId', authenticateToken, async (req, res) => {
  const updates = req.body;
  const allowedFields = ['internal_pubkey', 'internal_privkey_encrypted', 'account_balance', 'photo_url'];

  try {
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        setClause.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    values.push(req.params.userId);

    const result = await pool.query(
      `UPDATE profiles SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    console.log(`[API] Profile updated for user: ${req.params.userId}`);
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[API] Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// ============================================
// GAME HISTORY ROUTES
// ============================================

app.post('/api/game-history', authenticateToken, async (req, res) => {
  const { userId, gameId, finalLength, finalScore, stakeAmount, result, killedBy, survivedSeconds, solWon, solLost } = req.body;

  try {
    const insertResult = await pool.query(
      `INSERT INTO game_history 
       (user_id, game_id, final_length, final_score, stake_amount, result, killed_by, survived_seconds, sol_won, sol_lost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [userId, gameId, finalLength, finalScore, stakeAmount, result, killedBy, survivedSeconds, solWon, solLost]
    );

    console.log(`[API] Game history recorded for user: ${userId}`);
    res.json({ data: insertResult.rows[0] });
  } catch (err) {
    console.error('[API] Record game history error:', err);
    res.status(500).json({ error: 'Failed to record game history' });
  }
});

app.get('/api/game-history/:userId', authenticateToken, async (req, res) => {
  const limit = parseInt(req.query.limit) || 20;

  try {
    const result = await pool.query(
      `SELECT * FROM game_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.params.userId, limit]
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error('[API] Get game history error:', err);
    res.status(500).json({ error: 'Failed to get game history' });
  }
});

// ============================================
// USER STATISTICS ROUTES
// ============================================

app.get('/api/statistics/:userId', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM user_statistics WHERE user_id = $1',
      [req.params.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Statistics not found', code: 'PGRST116' });
    }

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[API] Get statistics error:', err);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

app.put('/api/statistics/:userId', authenticateToken, async (req, res) => {
  const updates = req.body;

  try {
    // Check if statistics exist
    const existing = await pool.query(
      'SELECT id FROM user_statistics WHERE user_id = $1',
      [req.params.userId]
    );

    if (existing.rows.length === 0) {
      // Create new statistics
      const result = await pool.query(
        `INSERT INTO user_statistics (user_id, total_games_played, total_wins, total_losses, total_sol_won, total_sol_lost, best_score, best_length, longest_survival_seconds)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [req.params.userId, updates.total_games_played || 0, updates.total_wins || 0, updates.total_losses || 0,
        updates.total_sol_won || 0, updates.total_sol_lost || 0, updates.best_score || 0,
        updates.best_length || 0, updates.longest_survival_seconds || 0]
      );
      return res.json({ data: result.rows[0] });
    }

    // Update existing
    const setClause = Object.keys(updates).map((key, idx) => `${key} = $${idx + 1}`).join(', ');
    const values = [...Object.values(updates), req.params.userId];

    const result = await pool.query(
      `UPDATE user_statistics SET ${setClause} WHERE user_id = $${values.length} RETURNING *`,
      values
    );

    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[API] Update statistics error:', err);
    res.status(500).json({ error: 'Failed to update statistics' });
  }
});

// PnL Statistics
app.get('/api/statistics/:userId/pnl', authenticateToken, async (req, res) => {
  const hours = parseInt(req.query.hours) || 24;
  const startDate = new Date(Date.now() - hours * 60 * 60 * 1000);

  try {
    const result = await pool.query(
      `SELECT 
         COUNT(*) as games_played,
         SUM(CASE WHEN result = 'cashout' THEN 1 ELSE 0 END) as wins,
         SUM(CASE WHEN result != 'cashout' THEN 1 ELSE 0 END) as losses,
         COALESCE(SUM(sol_won), 0) as sol_won,
         COALESCE(SUM(sol_lost), 0) as sol_lost,
         COALESCE(SUM(stake_amount), 0) as entry_fees
       FROM game_history 
       WHERE user_id = $1 AND created_at >= $2`,
      [req.params.userId, startDate]
    );

    const stats = result.rows[0];
    const netProfit = parseFloat(stats.sol_won) - parseFloat(stats.sol_lost);
    const entryFees = parseFloat(stats.entry_fees);
    const pnlPercentage = entryFees > 0 ? (netProfit / entryFees) * 100 : 0;

    res.json({
      data: {
        userId: req.params.userId,
        gamesPlayed: parseInt(stats.games_played),
        wins: parseInt(stats.wins),
        losses: parseInt(stats.losses),
        solWon: parseFloat(stats.sol_won),
        solLost: parseFloat(stats.sol_lost),
        entryFees,
        netProfit,
        pnlPercentage,
        periodStart: startDate.toISOString(),
        periodEnd: new Date().toISOString()
      }
    });
  } catch (err) {
    console.error('[API] Get PnL error:', err);
    res.status(500).json({ error: 'Failed to get PnL statistics' });
  }
});

// ============================================
// TRANSACTION ROUTES
// ============================================

app.post('/api/transactions', authenticateToken, async (req, res) => {
  const { userId, type, amount, balanceBefore, balanceAfter, transactionHash, description } = req.body;

  try {
    const result = await pool.query(
      `INSERT INTO transaction_history 
       (user_id, type, amount, balance_before, balance_after, transaction_hash, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, type, amount, balanceBefore, balanceAfter, transactionHash, description]
    );

    console.log(`[API] Transaction recorded for user: ${userId}`);
    res.json({ data: result.rows[0] });
  } catch (err) {
    console.error('[API] Record transaction error:', err);
    res.status(500).json({ error: 'Failed to record transaction' });
  }
});

app.get('/api/transactions/:userId', authenticateToken, async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;

  try {
    const result = await pool.query(
      `SELECT * FROM transaction_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [req.params.userId, limit]
    );

    res.json({ data: result.rows });
  } catch (err) {
    console.error('[API] Get transactions error:', err);
    res.status(500).json({ error: 'Failed to get transactions' });
  }
});

// ============================================
// GENERIC QUERY ENDPOINT (for QueryBuilder)
// ============================================

app.get('/api/query/:table', authenticateToken, async (req, res) => {
  const { table } = req.params;
  const allowedTables = ['profiles', 'game_history', 'user_statistics', 'transaction_history'];

  if (!allowedTables.includes(table)) {
    return res.status(403).json({ error: 'Table access not allowed' });
  }

  try {
    const select = req.query.select || '*';
    const limit = parseInt(req.query.limit) || 100;
    const single = req.query.single === 'true';
    const orderBy = req.query.orderBy;
    const orderDir = req.query.orderDir || 'asc';

    let query = `SELECT ${select} FROM ${table}`;
    const values = [];
    let paramIndex = 1;

    // Build WHERE clause from query params
    const whereConditions = [];
    let i = 0;
    while (req.query[`where[${i}][column]`]) {
      const column = req.query[`where[${i}][column]`];
      const value = req.query[`where[${i}][value]`];
      const operator = req.query[`where[${i}][operator]`] || 'eq';

      const opMap = { eq: '=', gte: '>=', lte: '<=', gt: '>', lt: '<', neq: '!=' };
      whereConditions.push(`${column} ${opMap[operator] || '='} $${paramIndex}`);
      values.push(value);
      paramIndex++;
      i++;
    }

    if (whereConditions.length > 0) {
      query += ` WHERE ${whereConditions.join(' AND ')}`;
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy} ${orderDir.toUpperCase()}`;
    }

    query += ` LIMIT ${limit}`;

    const result = await pool.query(query, values);

    if (single) {
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Not found', code: 'PGRST116' });
      }
      return res.json({ data: result.rows[0] });
    }

    res.json({ data: result.rows });
  } catch (err) {
    console.error('[API] Query error:', err);
    res.status(500).json({ error: 'Query failed' });
  }
});

// ============================================
// START SERVER
// ============================================

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 API Server running on port ${PORT}`);
  console.log(`📊 Database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  console.log(`🔐 JWT Secret configured: ${JWT_SECRET ? 'Yes' : 'No'}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down API server...');
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down API server...');
  await pool.end();
  process.exit(0);
});

export default app;
