import { Document } from 'mongoose';
import { IPlayer } from '../types';
interface IPlayerDocument extends IPlayer, Document {
}
export declare const Player: import("mongoose").Model<IPlayerDocument, {}, {}, {}, Document<unknown, {}, IPlayerDocument, {}, {}> & IPlayerDocument & Required<{
    _id: unknown;
}> & {
    __v: number;
}, any>;
export {};
//# sourceMappingURL=Player.d.ts.map