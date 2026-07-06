import type { AppError } from "../../domain/errors/AppError";
import type { LoopMode, PlaybackStatus } from "../../domain/music/types";

const exposedMessageTranslations = new Map<string, string>([
  ["Command not found.", "找不到這個指令。"],
  ["Command cooldown is still active.", "操作太快了，請稍後再試。"],
  ["Administrator permission is required.", "需要管理員權限才能使用這個指令。"],
  ["You must join a voice channel first.", "請先加入語音頻道。"],
  ["Join a voice channel first.", "請先加入語音頻道。"],
  ["This voice channel is not allowed.", "這個語音頻道不允許使用音樂指令。"],
  ["This text channel is not allowed.", "這個文字頻道不允許使用音樂指令。"],
  [
    "One of your roles is blocked from using music commands.",
    "你的其中一個身分組被禁止使用音樂指令。"
  ],
  ["You do not have an allowed role.", "你的身分組沒有使用此指令的權限。"],
  ["DJ role is required for this action.", "這個操作需要 DJ 身分組。"],
  ["Premium is required for this effect.", "這個音效需要 Premium 權限。"],
  ["Guild member context not found.", "找不到你的伺服器成員資訊，請稍後再試。"],
  ["This command can only be used in a guild.", "這個指令只能在伺服器內使用。"],
  ["Effect preset is required.", "請選擇一個音效預設。"],
  ["Unknown music subcommand.", "未知的音樂子指令。"],
  ["No playable tracks found.", "找不到可播放的歌曲，請換個關鍵字或網址再試一次。"],
  ["Search query cannot be empty.", "搜尋內容不能為空。"],
  ["No playlist tracks could be resolved.", "播放清單內沒有可解析的歌曲。"],
  ["Playlist was not found after import.", "匯入後找不到播放清單。"],
  ["Playlist not found.", "找不到播放清單。"],
  ["No previous track is available.", "沒有上一首可以播放。"],
  ["Current track is not seekable.", "目前歌曲不支援跳轉。"],
  ["No track is available to play.", "目前沒有可播放的歌曲。"],
  ["Voice channel is not known for this guild.", "找不到此伺服器的語音頻道連線資訊。"],
  ["No active player for this guild.", "這個伺服器目前沒有正在運作的播放器。"],
  ["Nothing is playing.", "目前沒有正在播放的歌曲。"],
  ["Queue size limit exceeded.", "播放佇列已達上限。"],
  ["Track not found at requested queue position.", "在指定的佇列位置找不到歌曲。"],
  ["Volume is out of range.", "音量超出可設定範圍。"],
  ["Queue position is out of range.", "佇列位置超出範圍。"],
  ["Queue insert position is out of range.", "插入位置超出佇列範圍。"],
  ["Failed to connect to voice channel.", "無法連接到語音頻道，請稍後再試。"],
  ["No available Lavalink node.", "目前沒有可用的音樂節點，請稍後再試。"],
  ["Lavalink resolve failed.", "查詢歌曲時發生錯誤，請稍後再試。"]
]);

export function formatPlaybackStatus(status: PlaybackStatus): string {
  switch (status) {
    case "idle":
      return "閒置";
    case "connecting":
      return "連線中";
    case "playing":
      return "播放中";
    case "paused":
      return "已暫停";
    case "stopped":
      return "已停止";
  }
}

export function formatLoopMode(mode: LoopMode): string {
  switch (mode) {
    case "OFF":
      return "關閉";
    case "TRACK":
      return "單曲循環";
    case "QUEUE":
      return "佇列循環";
  }
}

export function formatEnabled(enabled: boolean): string {
  return enabled ? "開啟" : "關閉";
}

export function formatDiscordErrorMessage(error: AppError): string {
  if (!error.expose) {
    return "發生內部錯誤，請稍後再試。";
  }

  const translated = exposedMessageTranslations.get(error.message);
  if (translated) {
    return translated;
  }

  switch (error.code) {
    case "PERMISSION_DENIED":
      return "你沒有權限執行這個操作。";
    case "RATE_LIMITED":
      return "操作太快了，請稍後再試。";
    case "MUSIC_RESOLVE_FAILED":
      return "找不到可播放的歌曲，請換個關鍵字或網址再試一次。";
    case "MUSIC_GATEWAY_FAILED":
      return "音樂節點暫時無法處理，請稍後再試。";
    case "MUSIC_EMPTY_QUEUE":
      return "目前播放佇列是空的。";
    case "MUSIC_NOT_CONNECTED":
      return "目前尚未連接到語音頻道。";
    case "NOT_FOUND":
      return "找不到指定的資料。";
    case "VALIDATION_FAILED":
      return "輸入內容不正確，請檢查後再試。";
    case "CONFIG_INVALID":
    case "INFRASTRUCTURE_FAILED":
      return "發生內部錯誤，請稍後再試。";
  }
}
