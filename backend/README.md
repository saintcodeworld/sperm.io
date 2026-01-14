# Backend Server - DepositScanner

Backend server რომელიც ამოწმებს Solana wallet-ებს და ავტომატურად ამატებს deposits-ს.

## Setup

```bash
cd backend
npm install
```

## Run

```bash
npm start
```

## რას აკეთებს:

- ყოველ 15 წამში სკანირებს ყველა მოთამაშის internal wallet-ს
- როცა SOL deposit მოდის, ავტომატურად ემატება balance-ს
- იყენებს Supabase Service Role Key-ს authoritative access-ისთვის

## Environment Variables

დარწმუნდით რომ `../.env.local`-ში არის:
```
SUPABASE_SERVICE_ROLE_KEY=your_key_here
```
