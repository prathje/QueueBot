import { Schema, model, Document } from 'mongoose';
import { IPlayer } from '../types';

interface IPlayerDocument extends IPlayer, Document {}

const PlayerSchema = new Schema<IPlayerDocument>({
  discordId: { type: String, required: true, unique: true },
  username: { type: String, required: true },
  currentQueues: [{ type: String, default: [] }],
  currentMatch: { type: String, required: false }
}, {
  timestamps: true
});

export const Player = model<IPlayerDocument>('Player', PlayerSchema);