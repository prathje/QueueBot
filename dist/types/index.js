"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTeamName = exports.TeamName = exports.MatchState = void 0;
var MatchState;
(function (MatchState) {
    MatchState["INITIAL"] = "initial";
    MatchState["CREATED"] = "created";
    MatchState["READY_UP"] = "ready_up";
    MatchState["IN_PROGRESS"] = "in_progress";
    MatchState["COMPLETED"] = "completed";
    MatchState["CANCELLED"] = "cancelled";
    MatchState["CLOSED"] = "closed";
})(MatchState || (exports.MatchState = MatchState = {}));
var TeamName;
(function (TeamName) {
    TeamName["TEAM1"] = "Red";
    TeamName["TEAM2"] = "Blue";
})(TeamName || (exports.TeamName = TeamName = {}));
const getTeamName = (teamNumber) => {
    return teamNumber === 1 ? TeamName.TEAM1 : TeamName.TEAM2;
};
exports.getTeamName = getTeamName;
//# sourceMappingURL=index.js.map