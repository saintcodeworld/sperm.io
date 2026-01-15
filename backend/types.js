// Game constants and types for backend
export const ARENA_SIZE = 5000;
export const INITIAL_LENGTH = 30;
export const SEGMENT_DISTANCE = 8;
export const BASE_SPEED = 220;
export const BOOST_SPEED = 380;

export const ROOM_CONFIGS = [
  { entryFee: 0 },    // Free testing room - no blockchain transactions
  { entryFee: 0.1 },
  { entryFee: 0.5 },
  { entryFee: 1.0 }
];

// Basic game state interfaces
export const GameState = {
  players: {},
  food: {}
};
