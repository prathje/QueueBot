

# Architecture
The queue system has a lot of moving parts.
At the same time, it is deeply integrated with Discord interactions and a database.

For now, the main logic:    
- index.ts: simply handles all the initialization and bootstrapping of the service, i.e., connecting to mongodb and discord using DiscordJs. Holds the gamemodes with their respective queue configurations.
- gamemode.ts: (instantiated by index.ts) handles discord interactions for the gamemode, e.g., creates the category
- queue.ts: (instantiated by gamemode.ts) handles the discord interaction for the queue, e.g., creates the channel and the join/leave message with buttons. Creates new match handlers for each new match. Calls the matchmaking service when players join/leave the queue.
- players.ts: (global service) defines the player model and handles the player state (e.g., which queue they are in, which match they are in), uses the discord id as identifier, does not handle any discord or db interactions
- matchmaking.ts: (instantiated by queue.ts) Handles the matchmaking, i.e., creating matches from players in the queue, does not handle any discord or db interactions. Is simply called by queue.ts when players join/leave the queue.
- match_handler.ts: (instantiated by queue.ts for EVERY ongoing match) Handles the match flow, i.e., ready up, voting, cancelling, directly handles discord and db interactions. Creates a text channel with the respective players and voice channels for the teams. Also handles timeouts and state recovery on restart.



