# Gate Keeper

Gate Keeper is a Discord bot that helps manage invited users in a server. It automatically gives a role when someone joins, starts a grace timer, and kicks users who do not join voice chat within the allowed time.

The bot was built for servers where people get invited for games and those people sometimes stay much longer than expected. Instead of removing users manually one by one, Gate Keeper handles it automatically.

## Features

- Automatically assigns a role when a user joins
- Starts a 1-hour grace timer
- Stops the timer when the user joins voice chat
- Restarts the timer when the user leaves voice chat
- Sends one private message before kicking
- Periodically checks for users affected by manual role changes

## Requirements

- Node.js
- A Discord bot token
- The target role ID
- Server Members Intent enabled in the Discord Developer Portal

## Setup

1. Install dependencies
2. Create a `.env` file
3. Add your bot token and role ID
4. Run the bot

## Environment Variables

```env
BOT_TOKEN=your_bot_token
ROLE_ID=your_role_id
GRACE_MS=3600000
SWEEP_MS=300000
```

## Note

If the bot restarts, active timers are reset because they are stored in memory.
