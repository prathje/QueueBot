import { Document } from 'mongoose';
import { IMatch } from '../types';
interface IMatchDocument extends Omit<IMatch, 'id'>, Document {
    matchId: string;
}
export declare const Match: import("mongoose").Model<IMatchDocument, {}, {}, {}, Document<unknown, {}, IMatchDocument, {}, {}> & IMatchDocument & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export {};
//# sourceMappingURL=Match.d.ts.map