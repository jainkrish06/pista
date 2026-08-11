import Redis from "ioredis";
import { env } from "../config/env.js";
import { prisma } from "@pista/database";

class MatchmakingService {
  private redis: Redis | null = null;

  // In-memory fallback structures
  private memoryQueue: string[] = [];
  private memoryUserSockets = new Map<string, string>();
  private memoryActiveMatches = new Map<string, string>();
  private memoryMatchPeers = new Map<string, string[]>();

  constructor() {
    if (env.REDIS_URL) {
      this.redis = new Redis(env.REDIS_URL);
    }
  }

  /**
   * Adds a user to the matchmaking queue and associates their socket ID.
   */
  async enqueue(userId: string, socketId: string): Promise<void> {
    if (this.redis) {
      // Remove any existing occurrences to prevent duplicates
      await this.redis.lrem("matchmaking_queue", 0, userId);
      // Push user to the tail of the queue
      await this.redis.rpush("matchmaking_queue", userId);
      // Map user ID to socket ID
      await this.redis.hset("user_sockets", userId, socketId);
    } else {
      this.memoryQueue = this.memoryQueue.filter((id) => id !== userId);
      this.memoryQueue.push(userId);
      this.memoryUserSockets.set(userId, socketId);
    }
  }

  /**
   * Removes a user from the matchmaking queue.
   */
  async dequeue(userId: string): Promise<void> {
    if (this.redis) {
      await this.redis.lrem("matchmaking_queue", 0, userId);
    } else {
      this.memoryQueue = this.memoryQueue.filter((id) => id !== userId);
    }
  }

  /**
   * Deassociates a user's socket ID (called on connection disconnect).
   */
  async removeSocketId(userId: string): Promise<void> {
    if (this.redis) {
      await this.redis.hdel("user_sockets", userId);
    } else {
      this.memoryUserSockets.delete(userId);
    }
  }

  /**
   * Pops the next compatible user from the head of the queue.
   * Filters out candidates that have blocked or been blocked by the current user.
   */
  async popCandidate(currentUserId: string, io: any, myFilters?: any): Promise<string | null> {
    // 1. Fetch blocked relationships involving the current user
    const blocks = await prisma.block.findMany({
      where: {
        OR: [
          { blockerId: currentUserId },
          { blockedUserId: currentUserId },
        ],
      },
      select: {
        blockerId: true,
        blockedUserId: true,
      },
    });

    const blockedUserIds = new Set(
      blocks.map((b) => (b.blockerId === currentUserId ? b.blockedUserId : b.blockerId))
    );

    const skippedCandidates: string[] = [];

    while (true) {
      let candidateId: string | null = null;
      if (this.redis) {
        candidateId = await this.redis.lpop("matchmaking_queue");
      } else {
        candidateId = this.memoryQueue.shift() || null;
      }

      if (!candidateId) {
        // Re-enqueue skipped blocked candidates to the tail of the queue
        for (const skippedId of skippedCandidates) {
          if (this.redis) {
            await this.redis.rpush("matchmaking_queue", skippedId);
          } else {
            this.memoryQueue.push(skippedId);
          }
        }
        return null;
      }

      // If we popped ourselves, put ourselves back at the head of the queue and stop
      if (candidateId === currentUserId) {
        if (this.redis) {
          await this.redis.lpush("matchmaking_queue", currentUserId);
        } else {
          this.memoryQueue.unshift(currentUserId);
        }
        // Re-enqueue skipped blocked candidates to the tail of the queue
        for (const skippedId of skippedCandidates) {
          if (this.redis) {
            await this.redis.rpush("matchmaking_queue", skippedId);
          } else {
            this.memoryQueue.push(skippedId);
          }
        }
        return null;
      }

      // Fetch the candidate's socket ID
      const socketId = await this.getSocketId(candidateId);
      if (!socketId) {
        continue; // Stale queue entry (no socket mapping), discard
      }

      // Check if candidate is blocked
      if (blockedUserIds.has(candidateId)) {
        skippedCandidates.push(candidateId);
        continue;
      }

      const socket = io.sockets.sockets.get(socketId);
      if (!socket || !socket.connected) {
        // Socket is no longer active; clean up this user and continue looking
        await this.dequeue(candidateId);
        continue;
      }

      // 2. Evaluate mutual premium filters (gender, country, interests)
      const partnerFilters = socket.data?.filters;
      if (myFilters || partnerFilters) {
        const profiles = await prisma.profile.findMany({
          where: {
            userId: { in: [currentUserId, candidateId] },
          },
        });
        const myProfile = profiles.find((p) => p.userId === currentUserId);
        const partnerProfile = profiles.find((p) => p.userId === candidateId);

        // a. Validate Candidate B against User A's filters
        if (myFilters) {
          if (myFilters.gender && partnerProfile?.gender !== myFilters.gender) {
            skippedCandidates.push(candidateId);
            continue;
          }
          if (myFilters.country && partnerProfile?.country !== myFilters.country) {
            skippedCandidates.push(candidateId);
            continue;
          }
          if (myFilters.interests && myFilters.interests.length > 0) {
            const hasCommon = myFilters.interests.some((interest: string) =>
              partnerProfile?.interests.includes(interest)
            );
            if (!hasCommon) {
              skippedCandidates.push(candidateId);
              continue;
            }
          }
        }

        // b. Validate User A against Candidate B's filters
        if (partnerFilters) {
          if (partnerFilters.gender && myProfile?.gender !== partnerFilters.gender) {
            skippedCandidates.push(candidateId);
            continue;
          }
          if (partnerFilters.country && myProfile?.country !== partnerFilters.country) {
            skippedCandidates.push(candidateId);
            continue;
          }
          if (partnerFilters.interests && partnerFilters.interests.length > 0) {
            const hasCommon = partnerFilters.interests.some((interest: string) =>
              myProfile?.interests.includes(interest)
            );
            if (!hasCommon) {
              skippedCandidates.push(candidateId);
              continue;
            }
          }
        }
      }

      // Re-enqueue skipped blocked candidates to the tail of the queue
      for (const skippedId of skippedCandidates) {
        if (this.redis) {
          await this.redis.rpush("matchmaking_queue", skippedId);
        } else {
          this.memoryQueue.push(skippedId);
        }
      }

      return candidateId;
    }
  }


  /**
   * Retrieves the socket ID mapped to a user.
   */
  async getSocketId(userId: string): Promise<string | null> {
    if (this.redis) {
      return await this.redis.hget("user_sockets", userId);
    } else {
      return this.memoryUserSockets.get(userId) || null;
    }
  }

  /**
   * Associates an active match with a user.
   */
  async setActiveMatch(userId: string, matchId: string): Promise<void> {
    if (this.redis) {
      await this.redis.hset("active_matches", userId, matchId);
    } else {
      this.memoryActiveMatches.set(userId, matchId);
    }
  }

  /**
   * Retrieves the active match ID of a user, if any.
   */
  async getActiveMatch(userId: string): Promise<string | null> {
    if (this.redis) {
      return await this.redis.hget("active_matches", userId);
    } else {
      return this.memoryActiveMatches.get(userId) || null;
    }
  }

  /**
   * Clears the active match association for a user.
   */
  async clearActiveMatch(userId: string): Promise<void> {
    if (this.redis) {
      await this.redis.hdel("active_matches", userId);
    } else {
      this.memoryActiveMatches.delete(userId);
    }
  }

  /**
   * Caches the list of user IDs in an active match.
   */
  async setMatchPeers(matchId: string, userIds: string[]): Promise<void> {
    if (this.redis) {
      await this.redis.hset("match_peers", matchId, JSON.stringify(userIds));
    } else {
      this.memoryMatchPeers.set(matchId, userIds);
    }
  }

  /**
   * Retrieves the cached user IDs in a match.
   */
  async getMatchPeers(matchId: string): Promise<string[] | null> {
    if (this.redis) {
      const val = await this.redis.hget("match_peers", matchId);
      return val ? JSON.parse(val) : null;
    } else {
      return this.memoryMatchPeers.get(matchId) || null;
    }
  }

  /**
   * Clears the cached match peers mapping.
   */
  async clearMatchPeers(matchId: string): Promise<void> {
    if (this.redis) {
      await this.redis.hdel("match_peers", matchId);
    } else {
      this.memoryMatchPeers.delete(matchId);
    }
  }

  /**
   * Helper to inspect the queue length (mostly for testing and diagnostics).
   */
  async getQueueLength(): Promise<number> {
    if (this.redis) {
      return await this.redis.llen("matchmaking_queue");
    } else {
      return this.memoryQueue.length;
    }
  }

  /**
   * Flushes all matchmaking queue and active match state (used for testing).
   */
  async flush(): Promise<void> {
    if (this.redis) {
      await this.redis.del("matchmaking_queue", "user_sockets", "active_matches", "match_peers");
    } else {
      this.memoryQueue = [];
      this.memoryUserSockets.clear();
      this.memoryActiveMatches.clear();
      this.memoryMatchPeers.clear();
    }
  }
}

export const matchmakingService = new MatchmakingService();
