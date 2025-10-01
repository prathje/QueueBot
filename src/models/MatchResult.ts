import { Schema, model, Document } from 'mongoose';
import { IMatchResult } from '../types';

interface IMatchResultDocument extends IMatchResult, Document {}

const MatchResultSchema = new Schema<IMatchResultDocument>({
  matchId: { type: String, required: true, unique: true },
  queueId: { type: String, required: true },
  gamemodeId: { type: String, required: true },
  winningTeam: { type: Number, enum: [1, 2], required: true },
  map: { type: String, required: true },
  teams: {
    team1: [{ type: String, required: true }],
    team2: [{ type: String, required: true }]
  },
  players: [{ type: String, required: true }],
  displayNames: { type: Object, default: {} },
  startedAt: { type: Date, required: true },
  completedAt: { type: Date, default: Date.now }
});

export const MatchResult = model<IMatchResultDocument>('MatchResult', MatchResultSchema);