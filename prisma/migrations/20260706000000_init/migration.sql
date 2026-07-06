-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PremiumTier" AS ENUM ('FREE', 'PLUS', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "LoopMode" AS ENUM ('OFF', 'TRACK', 'QUEUE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('YOUTUBE', 'SPOTIFY', 'APPLE_MUSIC', 'SOUNDCLOUD', 'DEEZER', 'HTTP', 'LOCAL', 'RADIO', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PlaybackEventType" AS ENUM ('PLAY', 'PAUSE', 'RESUME', 'STOP', 'SKIP', 'SEEK', 'FINISH', 'ERROR');

-- CreateTable
CREATE TABLE "Guild" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "shardId" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Guild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuildSettings" (
    "guildId" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'zh-TW',
    "djModeEnabled" BOOLEAN NOT NULL DEFAULT false,
    "djRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "blockedRoleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedTextChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allowedVoiceChannelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "defaultVolume" INTEGER NOT NULL DEFAULT 80,
    "maxQueueSize" INTEGER NOT NULL DEFAULT 1000,
    "announceNowPlaying" BOOLEAN NOT NULL DEFAULT true,
    "autoplayEnabled" BOOLEAN NOT NULL DEFAULT false,
    "premiumOnlyEffects" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuildSettings_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "SourceType" NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uri" TEXT,
    "author" TEXT,
    "durationMs" INTEGER,
    "artworkUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Playlist" (
    "id" TEXT NOT NULL,
    "guildId" TEXT,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaylistTrack" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "source" "SourceType" NOT NULL,
    "identifier" TEXT NOT NULL,
    "encoded" TEXT,
    "title" TEXT NOT NULL,
    "uri" TEXT,
    "author" TEXT,
    "durationMs" INTEGER,
    "artworkUrl" TEXT,
    "addedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaylistTrack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "History" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "source" "SourceType" NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "uri" TEXT,
    "author" TEXT,
    "durationMs" INTEGER,
    "eventType" "PlaybackEventType" NOT NULL DEFAULT 'PLAY',
    "positionMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "History_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Premium" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tier" "PremiumTier" NOT NULL DEFAULT 'FREE',
    "expiresAt" TIMESTAMP(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Premium_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueSnapshot" (
    "guildId" TEXT NOT NULL,
    "voiceChannelId" TEXT,
    "textChannelId" TEXT,
    "payload" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueSnapshot_pkey" PRIMARY KEY ("guildId")
);

-- CreateTable
CREATE TABLE "Analytics" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "eventType" "PlaybackEventType" NOT NULL,
    "source" "SourceType",
    "durationMs" INTEGER,
    "latencyMs" INTEGER,
    "nodeName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Analytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NodeStatus" (
    "name" TEXT NOT NULL,
    "connected" BOOLEAN NOT NULL DEFAULT false,
    "sessionId" TEXT,
    "players" INTEGER NOT NULL DEFAULT 0,
    "playingPlayers" INTEGER NOT NULL DEFAULT 0,
    "cpuLoad" DOUBLE PRECISION,
    "memoryUsedBytes" BIGINT,
    "frameDeficit" INTEGER,
    "frameNulled" INTEGER,
    "pingMs" INTEGER,
    "lastError" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NodeStatus_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "Guild_shardId_idx" ON "Guild"("shardId");

-- CreateIndex
CREATE INDEX "Favorite_userId_createdAt_idx" ON "Favorite"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Favorite_userId_identifier_key" ON "Favorite"("userId", "identifier");

-- CreateIndex
CREATE INDEX "Playlist_guildId_idx" ON "Playlist"("guildId");

-- CreateIndex
CREATE UNIQUE INDEX "Playlist_ownerId_name_key" ON "Playlist"("ownerId", "name");

-- CreateIndex
CREATE INDEX "PlaylistTrack_playlistId_idx" ON "PlaylistTrack"("playlistId");

-- CreateIndex
CREATE UNIQUE INDEX "PlaylistTrack_playlistId_position_key" ON "PlaylistTrack"("playlistId", "position");

-- CreateIndex
CREATE INDEX "History_guildId_createdAt_idx" ON "History"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "History_userId_createdAt_idx" ON "History"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Premium_userId_key" ON "Premium"("userId");

-- CreateIndex
CREATE INDEX "QueueSnapshot_updatedAt_idx" ON "QueueSnapshot"("updatedAt");

-- CreateIndex
CREATE INDEX "Analytics_guildId_createdAt_idx" ON "Analytics"("guildId", "createdAt");

-- CreateIndex
CREATE INDEX "Analytics_eventType_createdAt_idx" ON "Analytics"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "NodeStatus_connected_idx" ON "NodeStatus"("connected");

-- AddForeignKey
ALTER TABLE "GuildSettings" ADD CONSTRAINT "GuildSettings_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Playlist" ADD CONSTRAINT "Playlist_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaylistTrack" ADD CONSTRAINT "PlaylistTrack_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "Playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "History" ADD CONSTRAINT "History_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "History" ADD CONSTRAINT "History_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Premium" ADD CONSTRAINT "Premium_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueSnapshot" ADD CONSTRAINT "QueueSnapshot_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Analytics" ADD CONSTRAINT "Analytics_guildId_fkey" FOREIGN KEY ("guildId") REFERENCES "Guild"("id") ON DELETE CASCADE ON UPDATE CASCADE;
