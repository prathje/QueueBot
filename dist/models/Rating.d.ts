import { Document } from 'mongoose';
import { IRating } from '../types';
interface IRatingDocument extends IRating, Document {
}
export declare const Rating: import("mongoose").Model<IRatingDocument, {}, {}, {}, Document<unknown, {}, IRatingDocument, {}, {}> & IRatingDocument & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export {};
//# sourceMappingURL=Rating.d.ts.map