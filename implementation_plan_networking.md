# Networking Layer Refactor Implementation Plan

## Goal
Resolve cross-region latency jitter (teleporting) by upgrading the networking architecture to use Client-Side Prediction with Reconciliation and Entity Interpolation, running on a 20Hz fixed server tick.

## 1. Server-Side Changes (`backend/gameServer.js`)

### Fixed Tick Rate
- **Current**: 13.3Hz (75ms interval).
- **Target**: 20Hz (50ms interval).
- **Action**: Update `setInterval` delays from `75` to `50` in `startGlobalBroadcaster` and `startGameStateUpdates`.

### Processing
- Ensure the server simulation step (`dt`) matches the tick rate or handles variable delta time correctly (already handled by `ServerSim.js` `update(dt)`).

## 2. Client-Side Update: Local Player (`game/GameScene.ts`)

### Client-Side Prediction (CSP)
- **Status**: Already partially implemented (client moves head immediately on input).
- **Improvement**: Explicitly decouple "Render Position" from "Physics Position" if needed, but for Phaser, modifying the sprite directly is fine for CSP.

### Server Reconciliation
- **Concept**: The client often drifts from the server due to latency or packet loss. Instead of hard "snapping" only when deviation is huge (>200px), we will implement a replay system.
- **Mechanism**:
    1.  **Input Buffer**: Store valid inputs (Angle, Boost Status, DeltaTime) in a ring buffer with a timestamp/sequence number.
    2.  **State Buffer**: Store the resulting Local Position for each frame in a circular buffer.
    3.  **Correction**:
        - When a `game-state` update arrives from the server, find the local state that matches the server's timestamp (approximate lag compensation).
        - Compare Server Position vs Local History Position at that time.
        - If distance > `RECONCILIATION_THRESHOLD` (e.g., 20px):
            - **Teleport** local physics state to Server Position.
            - **Replay** all inputs in the Input Buffer from that timestamp up to `Now`.
            - This "corrects" the path without a visible visual snap (if the correction is small) or snaps correctly if large.
            - *Note*: Visual smoothing (lerp) can be applied to the correction to avoid a 1-frame jerk.

## 3. Client-Side Update: Remote Players (`game/GameScene.ts`)

### Entity Interpolation
- **Status**: Logic was recently patched, but we will standardize it.
- **Mechanism**:
    - Continue using the `stateBuffer` for remote players.
    - **Render Delay**: Strictly enforce `renderTime = Date.now() - 100ms`.
    - **Interpolation**: Find state `A` (before renderTime) and state `B` (after renderTime).
    - `t = (renderTime - A.time) / (B.time - A.time)`.
    - Render at `Lerp(A.pos, B.pos, t)`.
    - If `B` is missing (packet loss), extrapolate linearly from `A` using velocity/angle.

## 4. Data Structures

### Input Struct
```typescript
interface PlayerInput {
    seq: number;       // Sequence number (frame count)
    timestamp: number;
    angle: number;
    boost: boolean;
    dt: number;
}
```

### Server Packet Update
- Server packets need to effectively be "snapshots" of the world.
- We will rely on `Date.now()` timestamps (NTP sync assumption is essentially "close enough" for this game type, or we use RecvTime - Latency). For simplicity, we will continue using `serverTimestamp` and adjust for `ServerTimeOffset`.

## 5. Execution Steps
1.  **Modify `gameServer.js`**: Set tick rate to 50ms (20Hz).
2.  **Modify `ServerSim.js`**: Ensure `dt` is passed correctly if it was hardcoded.
3.  **Refactor `GameScene.ts`**:
    - **Add Input History**: `private inputHistory: PlayerInput[] = [];`
    - **Add Reconciliation Logic**: in `handleStateUpdate`, compare local history with server authoritative state.
    - **Refine Interpolation**: Ensure the 100ms delay logic is rock solid.
