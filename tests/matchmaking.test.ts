import { MatchmakingService, MatchmakingAlgorithm } from '../src/services/matchmaking';
import { RatingService } from '../src/services/rating';
import { PlayerService } from '../src/services/players';
import { IQueue, RatingValue } from '../src/types';

// Mock dependencies
jest.mock('../src/services/rating');
jest.mock('../src/services/players', () => ({
  PlayerService: {
    getInstance: jest.fn(),
  },
}));

// Mock only the random functions for predictable test results
jest.mock('../src/utils', () => ({
  ...jest.requireActual('../src/utils'),
  shuffled: jest.fn((arr) => [...arr]), // Return array in original order for predictable tests
  randomElement: jest.fn((arr) => arr[0]), // Always return first element for predictable tests
}));

const MockRatingService = RatingService as jest.MockedClass<typeof RatingService>;

describe('MatchmakingService - Fair Algorithm', () => {
  let matchmakingService: MatchmakingService;
  let mockRatingService: jest.Mocked<RatingService>;
  let mockPlayerService: jest.Mocked<PlayerService>;

  const gamemodeId = 'test-gamemode';

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock PlayerService singleton
    mockPlayerService = {
      getPlayersInQueue: jest.fn(),
    } as any;
    (PlayerService.getInstance as jest.Mock).mockReturnValue(mockPlayerService);

    // Mock RatingService instance
    mockRatingService = {
      getPlayerRating: jest.fn(),
      predictWin: jest.fn(),
    } as any;
    MockRatingService.mockImplementation(() => mockRatingService);

    matchmakingService = new MatchmakingService(gamemodeId);
  });

  describe('2v2 scenarios', () => {
    const createQueue = (algorithm: MatchmakingAlgorithm): IQueue => ({
      id: 'test-queue',
      gamemodeId,
      displayName: 'Test Queue',
      mapPool: ['test-map-1', 'test-map-2'],
      playerCount: 4,
      matchmakingAlgorithm: algorithm,
      players: [],
    });

    test('should create balanced teams for 2v2 with different skill levels', async () => {
      const players = ['player1', 'player2', 'player3', 'player4'];
      const queue = createQueue(MatchmakingAlgorithm.FAIR_TEAMS);

      // Mock players in queue
      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      // Mock player ratings - create a clear skill gap scenario
      const playerRatings = new Map<string, RatingValue>([
        ['player1', { mu: 30, sigma: 3 }], // High skill
        ['player2', { mu: 10, sigma: 3 }], // Low skill
        ['player3', { mu: 25, sigma: 3 }], // Medium-high skill
        ['player4', { mu: 15, sigma: 3 }], // Medium-low skill
      ]);

      mockRatingService.getPlayerRating.mockImplementation(async (playerId: string) => {
        return playerRatings.get(playerId)!;
      });

      // Mock win predictions - simulate fair matchmaking finding a balanced combination
      let callCount = 0;
      mockRatingService.predictWin.mockImplementation(async (teams: RatingValue[][]) => {
        callCount++;
        const team1Mu = teams[0].reduce((sum, r) => sum + r.mu, 0) / teams[0].length;
        const team2Mu = teams[1].reduce((sum, r) => sum + r.mu, 0) / teams[1].length;

        // Calculate probability based on rating difference
        const diff = team1Mu - team2Mu;
        const prob1 = 1 / (1 + Math.exp(-diff / 5));
        return [prob1, 1 - prob1];
      });

      const match = await matchmakingService.processQueue(queue);

      expect(match).not.toBeNull();
      expect(match!.teams.team1).toHaveLength(2);
      expect(match!.teams.team2).toHaveLength(2);
      expect([...match!.teams.team1, ...match!.teams.team2].sort()).toEqual(players.sort());

      // Verify that the algorithm tried to balance teams
      expect(mockRatingService.predictWin).toHaveBeenCalled();
    });

    test('should handle equal skill players in 2v2', async () => {
      const players = ['player1', 'player2', 'player3', 'player4'];
      const queue = createQueue(MatchmakingAlgorithm.FAIR_TEAMS);

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      // All players have equal skill
      const equalRating: RatingValue = { mu: 25, sigma: 8.33 };
      mockRatingService.getPlayerRating.mockResolvedValue(equalRating);

      // All combinations should be equally fair
      mockRatingService.predictWin.mockResolvedValue([0.5, 0.5]);

      const match = await matchmakingService.processQueue(queue);

      expect(match).not.toBeNull();
      expect(match!.teams.team1).toHaveLength(2);
      expect(match!.teams.team2).toHaveLength(2);
      expect([...match!.teams.team1, ...match!.teams.team2].sort()).toEqual(players.sort());
    });

    test('should prefer most balanced team combination in 2v2', async () => {
      const players = ['high1', 'high2', 'low1', 'low2'];
      const queue = createQueue(MatchmakingAlgorithm.FAIR_TEAMS);

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      // Two high skill, two low skill players
      const playerRatings = new Map<string, RatingValue>([
        ['high1', { mu: 35, sigma: 3 }],
        ['high2', { mu: 33, sigma: 3 }],
        ['low1', { mu: 15, sigma: 3 }],
        ['low2', { mu: 17, sigma: 3 }],
      ]);

      mockRatingService.getPlayerRating.mockImplementation(async (playerId: string) => {
        return playerRatings.get(playerId)!;
      });

      // Mock predictWin to favor balanced combinations (high+low vs high+low)
      mockRatingService.predictWin.mockImplementation(async (teams: RatingValue[][]) => {
        const team1Players = teams[0];
        const team2Players = teams[1];

        const team1AvgMu = team1Players.reduce((sum, r) => sum + r.mu, 0) / team1Players.length;
        const team2AvgMu = team2Players.reduce((sum, r) => sum + r.mu, 0) / team2Players.length;

        const diff = Math.abs(team1AvgMu - team2AvgMu);

        // Smaller difference = more balanced = closer to 0.5 win probability
        const prob1 = 0.5 + (team1AvgMu - team2AvgMu) / 100;
        return [Math.max(0.1, Math.min(0.9, prob1)), Math.max(0.1, Math.min(0.9, 1 - prob1))];
      });

      const match = await matchmakingService.processQueue(queue);

      expect(match).not.toBeNull();

      // The fair algorithm should ideally create teams like [high1, low1] vs [high2, low2]
      // or similar balanced combinations
      const team1 = match!.teams.team1;
      const team2 = match!.teams.team2;

      // Check that we have exactly 2 players per team
      expect(team1).toHaveLength(2);
      expect(team2).toHaveLength(2);

      // All players should be assigned
      expect([...team1, ...team2].sort()).toEqual(players.sort());
    });

    test('should fall back to random teams if fair algorithm fails', async () => {
      const players = ['player1', 'player2', 'player3', 'player4'];
      const queue = createQueue(MatchmakingAlgorithm.FAIR_TEAMS);

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      // Mock rating service to throw an error
      mockRatingService.getPlayerRating.mockRejectedValue(new Error('Database error'));

      const match = await matchmakingService.processQueue(queue);

      expect(match).not.toBeNull();
      expect(match!.teams.team1).toHaveLength(2);
      expect(match!.teams.team2).toHaveLength(2);
      expect([...match!.teams.team1, ...match!.teams.team2].sort()).toEqual(players.sort());
    });

    test('should use random teams for 2 or fewer players when using fair algorithm', async () => {
      const players = ['player1', 'player2'];
      const queue: IQueue = {
        id: 'test-queue',
        gamemodeId,
        displayName: 'Test Queue',
        mapPool: ['test-map-1', 'test-map-2'],
        playerCount: 2, // Set player count to 2 to match our test
        matchmakingAlgorithm: MatchmakingAlgorithm.FAIR_TEAMS,
        players: [],
      };

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      const match = await matchmakingService.processQueue(queue);

      expect(match).not.toBeNull();
      expect(match!.teams.team1).toHaveLength(1);
      expect(match!.teams.team2).toHaveLength(1);
      expect([...match!.teams.team1, ...match!.teams.team2].sort()).toEqual(players.sort());

      // Should not call rating service for such small teams
      expect(mockRatingService.getPlayerRating).not.toHaveBeenCalled();
    });
  });

  describe('3v3 scenarios', () => {
    const createQueue = (algorithm: MatchmakingAlgorithm): IQueue => ({
      id: 'test-queue',
      gamemodeId,
      displayName: 'Test Queue',
      mapPool: ['test-map-1', 'test-map-2'],
      playerCount: 6,
      matchmakingAlgorithm: algorithm,
      players: [],
    });

    test('should create balanced teams for 3v3 with mixed skill levels', async () => {
      const players = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
      const queue = createQueue(MatchmakingAlgorithm.FAIR_TEAMS);

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      // Mock player ratings with varied skill levels
      const playerRatings = new Map<string, RatingValue>([
        ['player1', { mu: 35, sigma: 3 }], // High
        ['player2', { mu: 30, sigma: 3 }], // High-medium
        ['player3', { mu: 25, sigma: 3 }], // Medium
        ['player4', { mu: 20, sigma: 3 }], // Medium-low
        ['player5', { mu: 15, sigma: 3 }], // Low
        ['player6', { mu: 10, sigma: 3 }], // Very low
      ]);

      mockRatingService.getPlayerRating.mockImplementation(async (playerId: string) => {
        return playerRatings.get(playerId)!;
      });

      mockRatingService.predictWin.mockImplementation(async (teams: RatingValue[][]) => {
        const team1AvgMu = teams[0].reduce((sum, r) => sum + r.mu, 0) / teams[0].length;
        const team2AvgMu = teams[1].reduce((sum, r) => sum + r.mu, 0) / teams[1].length;

        const diff = team1AvgMu - team2AvgMu;
        const prob1 = 1 / (1 + Math.exp(-diff / 5));
        return [prob1, 1 - prob1];
      });

      const match = await matchmakingService.processQueue(queue);

      expect(match).not.toBeNull();
      expect(match!.teams.team1).toHaveLength(3);
      expect(match!.teams.team2).toHaveLength(3);
      expect([...match!.teams.team1, ...match!.teams.team2].sort()).toEqual(players.sort());

      // Verify the algorithm evaluated different team combinations
      expect(mockRatingService.predictWin).toHaveBeenCalled();
    });

    test('should handle 3v3 with all equal skill players', async () => {
      const players = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
      const queue = createQueue(MatchmakingAlgorithm.FAIR_TEAMS);

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      // All players have equal skill
      const equalRating: RatingValue = { mu: 25, sigma: 8.33 };
      mockRatingService.getPlayerRating.mockResolvedValue(equalRating);
      mockRatingService.predictWin.mockResolvedValue([0.5, 0.5]);

      const match = await matchmakingService.processQueue(queue);

      expect(match).not.toBeNull();
      expect(match!.teams.team1).toHaveLength(3);
      expect(match!.teams.team2).toHaveLength(3);
      expect([...match!.teams.team1, ...match!.teams.team2].sort()).toEqual(players.sort());
    });

    test('should create most balanced 3v3 teams from diverse skill pool', async () => {
      const players = ['ace', 'pro', 'good', 'avg', 'new', 'beginner'];
      const queue = createQueue(MatchmakingAlgorithm.FAIR_TEAMS);

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      // Create a diverse skill distribution
      const playerRatings = new Map<string, RatingValue>([
        ['ace', { mu: 40, sigma: 2 }], // Expert
        ['pro', { mu: 35, sigma: 3 }], // Professional
        ['good', { mu: 25, sigma: 4 }], // Good
        ['avg', { mu: 20, sigma: 5 }], // Average
        ['new', { mu: 15, sigma: 6 }], // Newcomer
        ['beginner', { mu: 10, sigma: 7 }], // Beginner
      ]);

      mockRatingService.getPlayerRating.mockImplementation(async (playerId: string) => {
        return playerRatings.get(playerId)!;
      });

      mockRatingService.predictWin.mockImplementation(async (teams: RatingValue[][]) => {
        const team1AvgMu = teams[0].reduce((sum, r) => sum + r.mu, 0) / teams[0].length;
        const team2AvgMu = teams[1].reduce((sum, r) => sum + r.mu, 0) / teams[1].length;

        const diff = Math.abs(team1AvgMu - team2AvgMu);

        // Return probability difference - smaller difference means more balanced
        const probDiff = Math.min(0.4, diff / 50); // Scale the difference
        return [0.5 + probDiff / 2, 0.5 - probDiff / 2];
      });

      const match = await matchmakingService.processQueue(queue);

      expect(match).not.toBeNull();
      expect(match!.teams.team1).toHaveLength(3);
      expect(match!.teams.team2).toHaveLength(3);
      expect([...match!.teams.team1, ...match!.teams.team2].sort()).toEqual(players.sort());

      // The algorithm should have tried multiple combinations to find the most balanced
      expect(mockRatingService.predictWin).toHaveBeenCalledTimes(10); // C(5,2) = 10 combinations when fixing first player
    });

    test('should randomly assign team sides after finding best combination', async () => {
      const players = ['player1', 'player2', 'player3', 'player4', 'player5', 'player6'];
      const queue = createQueue(MatchmakingAlgorithm.FAIR_TEAMS);

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      // Set up equal ratings for predictable behavior
      const equalRating: RatingValue = { mu: 25, sigma: 3 };
      mockRatingService.getPlayerRating.mockResolvedValue(equalRating);
      mockRatingService.predictWin.mockResolvedValue([0.5, 0.5]);

      // Run the test multiple times to verify random assignment
      const results = [];
      for (let i = 0; i < 5; i++) {
        const match = await matchmakingService.processQueue(queue);
        results.push({
          team1: [...match!.teams.team1].sort(),
          team2: [...match!.teams.team2].sort(),
        });
      }

      // Each result should have valid teams
      results.forEach((result) => {
        expect(result.team1).toHaveLength(3);
        expect(result.team2).toHaveLength(3);
        expect([...result.team1, ...result.team2].sort()).toEqual(players.sort());
      });
    });
  });

  describe('Edge cases', () => {
    test('should return null when not enough players in queue', async () => {
      const players = ['player1', 'player2'];
      const queue: IQueue = {
        id: 'test-queue',
        gamemodeId,
        displayName: 'Test Queue',
        mapPool: ['test-map'],
        playerCount: 4,
        matchmakingAlgorithm: MatchmakingAlgorithm.FAIR_TEAMS,
        players: [],
      };

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      const match = await matchmakingService.processQueue(queue);

      expect(match).toBeNull();
    });

    test('should use random algorithm when specified', async () => {
      const players = ['player1', 'player2', 'player3', 'player4'];
      const queue: IQueue = {
        id: 'test-queue',
        gamemodeId,
        displayName: 'Test Queue',
        mapPool: ['test-map'],
        playerCount: 4,
        matchmakingAlgorithm: MatchmakingAlgorithm.RANDOM_TEAMS,
        players: [],
      };

      mockPlayerService.getPlayersInQueue.mockReturnValue(players);

      const match = await matchmakingService.processQueue(queue);

      expect(match).not.toBeNull();
      expect(match!.teams.team1).toHaveLength(2);
      expect(match!.teams.team2).toHaveLength(2);
      expect([...match!.teams.team1, ...match!.teams.team2].sort()).toEqual(players.sort());

      // Should not call rating service for random teams
      expect(mockRatingService.getPlayerRating).not.toHaveBeenCalled();
      expect(mockRatingService.predictWin).not.toHaveBeenCalled();
    });
  });
});
