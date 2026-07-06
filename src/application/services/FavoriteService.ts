import { AppError } from "../../domain/errors/AppError";
import type { QueueTrack } from "../../domain/music/types";
import type { FavoriteRepository } from "../ports/Repositories";
import type { MusicService } from "./MusicService";

/**
 * Favorites workflow backed by repository storage.
 */
export class FavoriteService {
  public constructor(
    private readonly favorites: FavoriteRepository,
    private readonly music: MusicService
  ) {}

  public async addCurrent(guildId: string, userId: string): Promise<QueueTrack> {
    const current = await this.music.getCurrent(guildId);
    if (!current) {
      throw new AppError("MUSIC_EMPTY_QUEUE", "Nothing is playing.");
    }
    await this.favorites.add(userId, current);
    return current;
  }

  public async remove(userId: string, identifier: string): Promise<void> {
    await this.favorites.remove(userId, identifier);
  }

  public async list(userId: string, limit: number): Promise<readonly QueueTrack[]> {
    return this.favorites.list(userId, limit);
  }
}
