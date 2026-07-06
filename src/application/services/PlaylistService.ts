import { AppError } from "../../domain/errors/AppError";
import type {
  PlaylistReadModel,
  PlaylistRepository,
  PlaylistTrackInput
} from "../ports/Repositories";
import type { MusicService } from "./MusicService";
import type { TrackResolver } from "./TrackResolver";

/**
 * Playlist import/export service for Discord commands and REST API.
 */
export class PlaylistService {
  public constructor(
    private readonly repository: PlaylistRepository,
    private readonly resolver: TrackResolver,
    private readonly music: MusicService
  ) {}

  public async create(input: {
    readonly ownerId: string;
    readonly guildId: string | null;
    readonly name: string;
    readonly description: string | null;
    readonly isPublic: boolean;
  }): Promise<PlaylistReadModel> {
    return this.repository.create(input);
  }

  public async importFromText(input: {
    readonly ownerId: string;
    readonly guildId: string | null;
    readonly name: string;
    readonly description: string | null;
    readonly isPublic: boolean;
    readonly text: string;
  }): Promise<PlaylistReadModel> {
    const playlist = await this.repository.create(input);
    const lines = input.text
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .slice(0, 500);

    const tracks: PlaylistTrackInput[] = [];
    for (const line of lines) {
      const resolved = await this.resolver.resolve(line, input.ownerId);
      const track = resolved.tracks[0];
      if (!track) {
        continue;
      }
      tracks.push({
        source: track.source,
        identifier: track.identifier,
        encoded: track.encoded,
        title: track.title,
        uri: track.uri,
        author: track.author,
        durationMs: track.durationMs,
        artworkUrl: track.artworkUrl,
        addedById: input.ownerId
      });
    }

    if (tracks.length === 0) {
      throw new AppError("MUSIC_RESOLVE_FAILED", "No playlist tracks could be resolved.");
    }

    await this.repository.addTracks(playlist.id, tracks);
    const created = await this.repository.getByName(input.ownerId, input.name);
    if (!created) {
      throw new AppError("NOT_FOUND", "Playlist was not found after import.");
    }
    return created;
  }

  public async export(ownerId: string, name: string): Promise<string> {
    const playlist = await this.repository.getByName(ownerId, name);
    if (!playlist) {
      throw new AppError("NOT_FOUND", "Playlist not found.");
    }
    return playlist.tracks
      .map((track) => track.uri ?? `${track.source}:${track.identifier}`)
      .join("\n");
  }

  public async list(ownerId: string): Promise<readonly PlaylistReadModel[]> {
    return this.repository.list(ownerId);
  }

  public async play(input: {
    readonly ownerId: string;
    readonly guildId: string;
    readonly voiceChannelId: string;
    readonly textChannelId: string | null;
    readonly shardId: number;
    readonly playlistName: string;
  }): Promise<void> {
    const playlist = await this.repository.getByName(input.ownerId, input.playlistName);
    if (!playlist) {
      throw new AppError("NOT_FOUND", "Playlist not found.");
    }

    for (const track of playlist.tracks) {
      await this.music.play({
        guildId: input.guildId,
        voiceChannelId: input.voiceChannelId,
        textChannelId: input.textChannelId,
        shardId: input.shardId,
        requesterId: input.ownerId,
        query: track.uri ?? track.identifier
      });
    }
  }

  public async delete(ownerId: string, name: string): Promise<void> {
    await this.repository.delete(ownerId, name);
  }
}
