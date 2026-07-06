import type { PrismaClient } from "@prisma/client";

import type {
  PlaylistReadModel,
  PlaylistRepository,
  PlaylistTrackInput
} from "../../../application/ports/Repositories";

export class PrismaPlaylistRepository implements PlaylistRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async create(input: {
    readonly ownerId: string;
    readonly guildId: string | null;
    readonly name: string;
    readonly description: string | null;
    readonly isPublic: boolean;
  }): Promise<PlaylistReadModel> {
    await this.prisma.user.upsert({
      where: { id: input.ownerId },
      update: {},
      create: { id: input.ownerId }
    });

    if (input.guildId) {
      await this.prisma.guild.upsert({
        where: { id: input.guildId },
        update: {},
        create: { id: input.guildId }
      });
    }

    const playlist = await this.prisma.playlist.upsert({
      where: { ownerId_name: { ownerId: input.ownerId, name: input.name } },
      update: {
        guildId: input.guildId,
        description: input.description,
        isPublic: input.isPublic
      },
      create: {
        ownerId: input.ownerId,
        guildId: input.guildId,
        name: input.name,
        description: input.description,
        isPublic: input.isPublic
      },
      include: { tracks: { orderBy: { position: "asc" } } }
    });

    return toReadModel(playlist);
  }

  public async addTracks(playlistId: string, tracks: readonly PlaylistTrackInput[]): Promise<void> {
    const count = await this.prisma.playlistTrack.count({ where: { playlistId } });
    await this.prisma.playlistTrack.createMany({
      data: tracks.map((track, index) => ({
        playlistId,
        position: count + index + 1,
        source: track.source,
        identifier: track.identifier,
        encoded: track.encoded,
        title: track.title,
        uri: track.uri,
        author: track.author,
        durationMs: track.durationMs,
        artworkUrl: track.artworkUrl,
        addedById: track.addedById
      }))
    });
  }

  public async getByName(ownerId: string, name: string): Promise<PlaylistReadModel | null> {
    const playlist = await this.prisma.playlist.findUnique({
      where: { ownerId_name: { ownerId, name } },
      include: { tracks: { orderBy: { position: "asc" } } }
    });
    return playlist ? toReadModel(playlist) : null;
  }

  public async list(ownerId: string): Promise<readonly PlaylistReadModel[]> {
    const playlists = await this.prisma.playlist.findMany({
      where: { ownerId },
      orderBy: { updatedAt: "desc" },
      include: { tracks: { orderBy: { position: "asc" } } }
    });
    return playlists.map(toReadModel);
  }

  public async delete(ownerId: string, name: string): Promise<void> {
    await this.prisma.playlist.deleteMany({ where: { ownerId, name } });
  }
}

type PlaylistWithTracks = Awaited<ReturnType<PrismaClient["playlist"]["findMany"]>>[number] & {
  readonly tracks: readonly {
    readonly source: PlaylistTrackInput["source"];
    readonly identifier: string;
    readonly encoded: string | null;
    readonly title: string;
    readonly uri: string | null;
    readonly author: string | null;
    readonly durationMs: number | null;
    readonly artworkUrl: string | null;
    readonly addedById: string;
  }[];
};

function toReadModel(playlist: PlaylistWithTracks): PlaylistReadModel {
  return {
    id: playlist.id,
    name: playlist.name,
    description: playlist.description,
    isPublic: playlist.isPublic,
    tracks: playlist.tracks.map((track) => ({
      source: track.source,
      identifier: track.identifier,
      encoded: track.encoded,
      title: track.title,
      uri: track.uri,
      author: track.author,
      durationMs: track.durationMs,
      artworkUrl: track.artworkUrl,
      addedById: track.addedById
    }))
  };
}
