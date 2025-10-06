import { Schema, model, Document } from 'mongoose';
import { IRating } from '../types';

interface IRatingDocument extends IRating, Document {}

const RatingValueSchema = new Schema(
  {
    mu: { type: Number, required: true },
    sigma: { type: Number, required: true },
  },
  { _id: false },
);

const RatingSchema = new Schema<IRatingDocument>({
  player: { type: String, required: true },
  gamemode: { type: String, required: true },
  matchId: { type: String, required: true },
  date: { type: Date, default: Date.now },
  before: { type: RatingValueSchema, required: true },
  after: { type: RatingValueSchema, required: true },
  ordinalBefore: { type: Number, required: true },
  ordinalAfter: { type: Number, required: true },
  ordinalDiff: { type: Number, required: true },
});

// Index for efficient queries
RatingSchema.index({ player: 1, gamemode: 1 });
RatingSchema.index({ matchId: 1 });
RatingSchema.index({ date: -1 });

export const Rating = model<IRatingDocument>('Rating', RatingSchema);
