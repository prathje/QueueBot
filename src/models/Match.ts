import { Schema, model, Document } from 'mongoose';
import { IMatch, MatchState } from '../types';

interface IMatchDocument extends Omit<IMatch, 'id'>, Document {
  matchId: string;
}

const MatchSchema = new Schema<IMatchDocument>({
  matchId: { type: String, required: true, unique: true },
  queueId: { type: String, required: true },
  gamemodeId: { type: String, required: true },
  players: [{ type: String, required: true }],
  teams: {
    team1: [{ type: String, required: true }],
    team2: [{ type: String, required: true }]
  },
  map: { type: String, required: true },
  state: {
    type: String,
    enum: Object.values(MatchState),
    default: MatchState.INITIAL
  },
  discordChannelId: { type: String, required: false },
  discordVoiceChannel1Id: { type: String, required: false },
  discordVoiceChannel2Id: { type: String, required: false },
  readyPlayers: [{ type: String, default: [] }],
  votes: {
    team1: [{ type: String, default: [] }],
    team2: [{ type: String, default: [] }],
    cancel: [{ type: String, default: [] }]
  }
}, {
  timestamps: true
});

export const Match = model<IMatchDocument>('Match', MatchSchema);