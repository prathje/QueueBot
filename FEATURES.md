# Feature Overview

## Player Profiles
Each player is identified by his discord id but the username is the one used for display.
A player state is stored in the database, this state contains:
- the discord id
- the username
- the current queue(s) (if any)
- the current match (if any)

## Gamemode
A Gamemode is defined by:
- a unique ID (e.g., "gCTF")
- a display name (e.g., "gCTF - Capture the Flag")

The gamemode allows to group multiple queues together.
For each gamemode, there is going to be a dedicated category in the discord server.
If the category does not exist, the should create it automatically.

## Matchmaking Queues
Each queue is part of a gamemode and defined by:
- a unique id (e.g., "gCTF 2v2")
- a map pool (e.g., a list of strings, "ctf1", "ctf2")
- a player count (e.g. 4)
- a matchmaking algorithm (e.g., "random teams")

For each queue, there is going to be a dedicated text channel (using the display name) in the discord server.
If the channel does not exist, the bot will create it automatically.
In this channel, there is only a single message with buttons to join/leave the queue.
This message further contains the number of players currently in the queue though no names are displayed.

When a player clicks the "Join Queue" button, he is added to the queue. If he clicks the "Leave Queue" button, he is removed from the queue.
The bot confirms the action with a message in the same channel but only visible for that one player.

### Matchmaking Algorithm
Every time a player joins or leaves the queue, it generates an event that is handled by the matchmaking algorithm.
This algorithm then checks the players in the queue or pool and tries to create matches.
When a match is created, the involved players are automatically removed from all queues and the message in the queue channel is updated.

## Matches
A MatchHandler service handles the flow of matches: 
When a match is created, the bot creates a dedicated text channel for that match on the discord server. This channel has a short but unique id.
All the relevant players are added to that channel and a message is posted with a "Ready Up!" button.
This message contains the lineup and the map to be played. The "ready up" is confirmed by a message in the match channel but only visible for that one player.

Once all the players readied up, the match can start. If a player does not ready up within a certain time, the match is cancelled and the players are informed and placed back in the queue.
The bot creates two temporary voice channels for the two teams. The voice channels are only accessible for the players in that match and team.

### Match Handling
The channel should then hold a new message that allows the players to vote for the winning team. This message also contains a button to vote for cancelling the match in case something went wrong.
A vote requires a majority of the players to vote for one team. If the players do not vote within a certain time (e.g., 2 hours), the match is cancelled and the players are informed.
The state of the match is always updated in the database in case the bot crashes or is restarted. This means that the details, e.g. the id of the text and voice channels, the ready state of the players and the times of votes are stored in the database.
If the bot restarts, it recovers the state from the database and continues where it left off.
The match states are as follows:
- Initial: Default state when a match is created. Teams with players and map are assigned.
- Created: Dedicated text channel created, players added to channel.
- Ready Up: Waiting for players to ready up.
- In Progress: All players readied up, waiting for votes.
- Completed: Votes tallied, match completed. A MatchResult is created and stored in the database, it contains the queue id, gamemode, time, the winning team, the map played and the players involved as well as the match id.
- Cancelled: Match cancelled due to timeout or player action.
- Closed: Match is closed and channels are deleted. Players are free to join the queues again.

A MatchResult is created when the match is completed, this MatchResult can then later be used to display stats and leaderboards.

### Leaderboards and Stats (future)
The bot can keep track of player stats and leaderboards based on the MatchResults. This can be used to display player rankings and performance over time.
This feature is planned for the future.