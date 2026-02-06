# Save System Architecture

## Overview
The save system in Realm of Eternity uses a hybrid localStorage + server persistence model with debounced server saves to balance performance and data safety.

## Key Components

### State Management
- `saveTimeoutRef`: Tracks the current debounce timeout
- `lastSaveTimeRef`: Timestamp of the last server save
- `pendingReasonRef`: Signals when a server save is pending (non-null when saveGame() was called)
- `justLoadedFromServerRef`: Prevents save loops when loading from server

### Constants
- `SAVE_DEBOUNCE_MS = 3000`: Minimum 3 seconds between server saves

### Core Functions

#### `performServerSave(playerData, reason)`
- Executes the actual server save via `/api/save` endpoint
- Includes player data, identity, timestamp, and reason
- Handles errors gracefully with console warnings
- Returns response status for debugging

#### `saveGame(reason)`
- Immediately writes to localStorage as "belt-and-suspenders" backup
- Signals the post-render useEffect to perform server save
- Does NOT call performServerSave directly (player state may be stale)

### Save Flow

1. **User Action**: Game state changes trigger `saveGame(reason)`
2. **Immediate Local**: localStorage updated instantly
3. **Signal Pending**: `pendingReasonRef` set to reason
4. **Post-Render Effect**: useEffect on `[player]` detects pending save
5. **Debounce Check**: If enough time passed, save immediately
6. **Schedule Save**: Otherwise, set timeout for remaining debounce period
7. **Execute Save**: `performServerSave` with current player state

### Authentication Integration

#### Login/Register
- On successful auth, load server save and merge with local state
- Push current state to server for cross-device sync

#### Logout
- Flush any pending server saves before clearing auth state
- Clear timeouts and localStorage auth tokens

#### Auth Verification
- On app load, verify token and load server data if valid
- Fall back to offline play if verification fails

### Error Handling
- Server saves fail gracefully with console warnings
- localStorage always available as backup
- Network issues don't break gameplay

### Performance Optimizations
- Debounced saves prevent server spam
- localStorage writes are synchronous and fast
- Server saves only when authenticated
- Pending saves batched during debounce windows

### Data Structure
Server save payload:
```json
{
  "player": { /* full player state */ },
  "playerIdentity": {
    "playerId": "uuid",
    "displayName": "string",
    "totalLevel": number,
    "combatLevel": number,
    "currentLocation": "string",
    "currentActivity": "string",
    "lastOnline": timestamp
  },
  "timestamp": number,
  "reason": "string"
}
```

### Edge Cases Handled
- Farming timer updates don't trigger unnecessary saves
- Server load merges don't cause save loops
- Auth state changes flush pending saves
- Tab visibility changes update progress bars
- Network failures don't lose progress (localStorage backup)