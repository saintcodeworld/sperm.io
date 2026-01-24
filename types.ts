
export interface Vector2 {
  x: number;
  y: number;
}

export interface PlayerData {
  id: string;
  name: string;
  pos: Vector2;
  angle: number;
  length: number;
  color: number;
  isBoosting: boolean;
  score: number;
  solValue: number;
  segments: Vector2[];
  solAddress: string;
}

export interface FoodData {
  id: string;
  x: number;
  y: number;
  value: number;
  color: number;
}

export interface GameState {
  players: Record<string, PlayerData>;
  food: Record<string, FoodData>;
}

export interface CashoutEvent {
  type: 'cashout-success';
  playerId: string;
  totalPot: number;
  signature: string;
}

export interface UserAccount {
  id: string;
  username: string;
  seedphrase: string;
  solAddress: string;
  balance: number;
  photoUrl?: string;
}

// Transaction types
export type TransactionType = 'deposit' | 'withdrawal' | 'game_win' | 'game_loss' | 'stake';

export interface Transaction {
  id: string;
  userId: string;
  type: TransactionType;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  transactionHash?: string;
  description?: string;
  createdAt: string;
}

// Game history types
export type GameResult = 'killed' | 'cashout' | 'disconnected';

export interface GameHistoryEntry {
  id: string;
  userId: string;
  gameId: string;
  finalLength: number;
  finalScore: number;
  stakeAmount: number;
  result: GameResult;
  killedBy?: string;
  survivedSeconds: number;
  solWon: number;
  solLost: number;
  createdAt: string;
}

// User statistics types
export interface UserStatistics {
  userId: string;
  totalGamesPlayed: number;
  totalWins: number;
  totalLosses: number;
  totalSolWon: number;
  totalSolLost: number;
  bestScore: number;
  bestLength: number;
  longestSurvivalSeconds: number;
  updatedAt: string;
}

// PnL statistics types for different time periods
export interface PnLStats {
  userId: string;
  gamesPlayed: number;
  wins: number;
  losses: number;
  solWon: number;
  solLost: number;
  entryFees: number;  // Total stake amounts
  netProfit: number;  // solWon - solLost
  pnlPercentage: number; // (netProfit / entryFees) * 100
  periodStart: string; // ISO date string
  periodEnd: string;   // ISO date string
}

export interface Room {
  id: string;
  entryFee: number;
  currentPlayers: number;
  state: GameState;
}

export const ROOM_CONFIGS = [
  { entryFee: 0 },    // Free testing room - no blockchain transactions
  { entryFee: 0.1 },
  { entryFee: 0.5 },
  { entryFee: 1.0 }
];

export const ARENA_SIZE = 5000;
export const INITIAL_LENGTH = 30;
export const SEGMENT_DISTANCE = 8;
export const BASE_SPEED = 220;
export const BOOST_SPEED = 380;
