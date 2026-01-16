/**
 * PostgreSQL Database Client
 * Replaces Supabase with direct PostgreSQL connection
 * DEBUG LOG: All database operations are logged for easier debugging
 */

// Note: In production, this will use the 'pg' package
// For frontend, we'll use API calls to the backend

interface QueryResult<T = any> {
  data: T | null;
  error: { message: string; code?: string } | null;
}

interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

// DEBUG LOG: Database configuration from environment variables
const getConfig = (): DatabaseConfig => ({
  host: import.meta.env.VITE_DB_HOST || 'localhost',
  port: parseInt(import.meta.env.VITE_DB_PORT || '5432'),
  database: import.meta.env.VITE_DB_NAME || 'spermio',
  user: import.meta.env.VITE_DB_USER || 'spermio_app',
  password: import.meta.env.VITE_DB_PASSWORD || '',
  ssl: import.meta.env.VITE_DB_SSL === 'true'
});

// API Base URL for backend database operations
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

/**
 * Database client class that communicates with backend API
 * Frontend cannot directly connect to PostgreSQL, so we use REST API
 */
class DatabaseClient {
  private baseUrl: string;
  private authToken: string | null = null;

  constructor() {
    this.baseUrl = API_BASE_URL;
    console.log('[DB] Database client initialized with API URL:', this.baseUrl);
  }

  // Set authentication token for API requests
  setAuthToken(token: string | null) {
    this.authToken = token;
    console.log('[DB] Auth token updated');
  }

  // Get headers for API requests
  private getHeaders(): HeadersInit {
    const headers: HeadersInit = {
      'Content-Type': 'application/json'
    };
    if (this.authToken) {
      headers['Authorization'] = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  // Generic API request helper
  private async apiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
    body?: any
  ): Promise<QueryResult<T>> {
    try {
      console.log(`[DB] API ${method} request to: ${endpoint}`);
      
      const options: RequestInit = {
        method,
        headers: this.getHeaders(),
        credentials: 'include'
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(`${this.baseUrl}${endpoint}`, options);
      const data = await response.json();

      if (!response.ok) {
        console.error(`[DB] API error: ${data.error || 'Unknown error'}`);
        return { data: null, error: { message: data.error || 'API request failed', code: String(response.status) } };
      }

      console.log(`[DB] API response success for: ${endpoint}`);
      return { data: data.data || data, error: null };
    } catch (err: any) {
      console.error(`[DB] API request failed:`, err);
      return { data: null, error: { message: err.message || 'Network error' } };
    }
  }

  // ============================================
  // AUTH METHODS
  // ============================================

  async signUp(email: string, password: string, username: string): Promise<QueryResult<{ user: any; session: any }>> {
    console.log(`[DB] Signing up user: ${username}`);
    return this.apiRequest('/auth/signup', 'POST', { email, password, username });
  }

  async signIn(email: string, password: string): Promise<QueryResult<{ user: any; session: any }>> {
    console.log(`[DB] Signing in user`);
    const result = await this.apiRequest<{ user: any; session: any }>('/auth/signin', 'POST', { email, password });
    if (result.data?.session?.token) {
      this.setAuthToken(result.data.session.token);
      localStorage.setItem('auth_token', result.data.session.token);
    }
    return result;
  }

  async signOut(): Promise<QueryResult<void>> {
    console.log(`[DB] Signing out user`);
    const result = await this.apiRequest<void>('/auth/signout', 'POST');
    this.setAuthToken(null);
    localStorage.removeItem('auth_token');
    return result;
  }

  async getSession(): Promise<QueryResult<{ session: any; user: any } | null>> {
    // Try to restore token from localStorage
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken && !this.authToken) {
      this.setAuthToken(storedToken);
    }
    
    if (!this.authToken) {
      return { data: null, error: null };
    }
    
    console.log(`[DB] Getting current session`);
    return this.apiRequest('/auth/session', 'GET');
  }

  async getUser(): Promise<QueryResult<{ user: any } | null>> {
    if (!this.authToken) {
      return { data: null, error: null };
    }
    console.log(`[DB] Getting current user`);
    return this.apiRequest('/auth/user', 'GET');
  }

  async updatePassword(newPassword: string): Promise<QueryResult<void>> {
    console.log(`[DB] Updating password`);
    return this.apiRequest('/auth/password', 'PUT', { password: newPassword });
  }

  // ============================================
  // PROFILES TABLE METHODS
  // ============================================

  async getProfile(userId: string): Promise<QueryResult<any>> {
    console.log(`[DB] Getting profile for user: ${userId}`);
    return this.apiRequest(`/profiles/${userId}`, 'GET');
  }

  async getProfileByUsername(username: string): Promise<QueryResult<any>> {
    console.log(`[DB] Getting profile by username: ${username}`);
    return this.apiRequest(`/profiles/username/${username}`, 'GET');
  }

  async updateProfile(userId: string, updates: any): Promise<QueryResult<any>> {
    console.log(`[DB] Updating profile for user: ${userId}`);
    return this.apiRequest(`/profiles/${userId}`, 'PUT', updates);
  }

  // ============================================
  // GAME HISTORY METHODS
  // ============================================

  async recordGameHistory(data: {
    userId: string;
    gameId: string;
    finalLength: number;
    finalScore: number;
    stakeAmount: number;
    result: string;
    killedBy?: string;
    survivedSeconds: number;
    solWon: number;
    solLost: number;
  }): Promise<QueryResult<any>> {
    console.log(`[DB] Recording game history for user: ${data.userId}`);
    return this.apiRequest('/game-history', 'POST', data);
  }

  async getGameHistory(userId: string, limit: number = 20): Promise<QueryResult<any[]>> {
    console.log(`[DB] Getting game history for user: ${userId}, limit: ${limit}`);
    return this.apiRequest(`/game-history/${userId}?limit=${limit}`, 'GET');
  }

  // ============================================
  // USER STATISTICS METHODS
  // ============================================

  async getUserStatistics(userId: string): Promise<QueryResult<any>> {
    console.log(`[DB] Getting statistics for user: ${userId}`);
    return this.apiRequest(`/statistics/${userId}`, 'GET');
  }

  async updateUserStatistics(userId: string, updates: any): Promise<QueryResult<any>> {
    console.log(`[DB] Updating statistics for user: ${userId}`);
    return this.apiRequest(`/statistics/${userId}`, 'PUT', updates);
  }

  // ============================================
  // TRANSACTION HISTORY METHODS
  // ============================================

  async recordTransaction(data: {
    userId: string;
    type: string;
    amount: number;
    balanceBefore: number;
    balanceAfter: number;
    transactionHash?: string;
    description?: string;
  }): Promise<QueryResult<any>> {
    console.log(`[DB] Recording transaction for user: ${data.userId}`);
    return this.apiRequest('/transactions', 'POST', data);
  }

  async getTransactionHistory(userId: string, limit: number = 50): Promise<QueryResult<any[]>> {
    console.log(`[DB] Getting transaction history for user: ${userId}`);
    return this.apiRequest(`/transactions/${userId}?limit=${limit}`, 'GET');
  }

  // ============================================
  // PNL METHODS
  // ============================================

  async getPnLStats(userId: string, periodHours: number): Promise<QueryResult<any>> {
    console.log(`[DB] Getting ${periodHours}h PnL for user: ${userId}`);
    return this.apiRequest(`/statistics/${userId}/pnl?hours=${periodHours}`, 'GET');
  }
}

// Export singleton instance
export const db = new DatabaseClient();

// Export auth object for compatibility with existing code
export const auth = {
  signUp: (data: { email: string; password: string; options?: { data?: { username: string } } }) => 
    db.signUp(data.email, data.password, data.options?.data?.username || ''),
  signInWithPassword: (data: { email: string; password: string }) => 
    db.signIn(data.email, data.password),
  signOut: () => db.signOut(),
  getSession: () => db.getSession(),
  getUser: () => db.getUser(),
  updateUser: (data: { password?: string }) => 
    data.password ? db.updatePassword(data.password) : Promise.resolve({ data: null, error: null })
};

// Export for backwards compatibility with Supabase-style queries
export const database = {
  from: (table: string) => new QueryBuilder(table)
};

// Query builder for Supabase-style queries
class QueryBuilder {
  private table: string;
  private selectColumns: string = '*';
  private whereConditions: { column: string; value: any; operator: string }[] = [];
  private orderByColumn: string | null = null;
  private orderByAscending: boolean = true;
  private limitCount: number | null = null;
  private isSingle: boolean = false;

  constructor(table: string) {
    this.table = table;
  }

  select(columns: string = '*') {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: any) {
    this.whereConditions.push({ column, value, operator: 'eq' });
    return this;
  }

  gte(column: string, value: any) {
    this.whereConditions.push({ column, value, operator: 'gte' });
    return this;
  }

  lte(column: string, value: any) {
    this.whereConditions.push({ column, value, operator: 'lte' });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderByColumn = column;
    this.orderByAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    this.limitCount = 1;
    return this;
  }

  async insert(data: any): Promise<QueryResult<any>> {
    console.log(`[DB] Insert into ${this.table}`);
    return db['apiRequest'](`/query/${this.table}`, 'POST', { action: 'insert', data });
  }

  async update(data: any): Promise<QueryResult<any>> {
    console.log(`[DB] Update ${this.table}`);
    return db['apiRequest'](`/query/${this.table}`, 'PUT', { 
      action: 'update', 
      data, 
      where: this.whereConditions 
    });
  }

  async delete(): Promise<QueryResult<any>> {
    console.log(`[DB] Delete from ${this.table}`);
    return db['apiRequest'](`/query/${this.table}`, 'DELETE', { 
      where: this.whereConditions 
    });
  }

  // Execute SELECT query
  then<TResult1 = QueryResult<any>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<any>) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    const queryParams = new URLSearchParams();
    queryParams.set('select', this.selectColumns);
    
    this.whereConditions.forEach((cond, idx) => {
      queryParams.set(`where[${idx}][column]`, cond.column);
      queryParams.set(`where[${idx}][value]`, String(cond.value));
      queryParams.set(`where[${idx}][operator]`, cond.operator);
    });

    if (this.orderByColumn) {
      queryParams.set('orderBy', this.orderByColumn);
      queryParams.set('orderDir', this.orderByAscending ? 'asc' : 'desc');
    }

    if (this.limitCount) {
      queryParams.set('limit', String(this.limitCount));
    }

    queryParams.set('single', String(this.isSingle));

    const promise = db['apiRequest'](`/query/${this.table}?${queryParams.toString()}`, 'GET');
    return promise.then(onfulfilled, onrejected);
  }
}

export default db;
