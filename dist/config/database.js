"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToDatabase = connectToDatabase;
exports.disconnectFromDatabase = disconnectFromDatabase;
const mongoose_1 = __importDefault(require("mongoose"));
async function connectToDatabase() {
    try {
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/teeworlds-league';
        await mongoose_1.default.connect(mongoUri);
        console.log('Connected to MongoDB successfully');
    }
    catch (error) {
        console.error('Failed to connect to MongoDB:', error);
        process.exit(1);
    }
}
async function disconnectFromDatabase() {
    try {
        await mongoose_1.default.disconnect();
        console.log('Disconnected from MongoDB');
    }
    catch (error) {
        console.error('Error disconnecting from MongoDB:', error);
    }
}
//# sourceMappingURL=database.js.map