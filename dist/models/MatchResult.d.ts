import { Document } from 'mongoose';
import { IMatchResult } from '../types';
interface IMatchResultDocument extends IMatchResult, Document {
}
export declare const MatchResult: import("mongoose").Model<IMatchResultDocument, {}, {}, {}, Document<unknown, {}, IMatchResultDocument, {}, {}> & IMatchResultDocument & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export {};
//# sourceMappingURL=MatchResult.d.ts.map