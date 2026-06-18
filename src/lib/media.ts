export type Platform = "youTube" | "soundCloud" | "tikTok" | "instagram" | "twitter" | "pinterest" | "spotify" | "unsupported"
export type DownloadMode = "audio" | "video"
export type DownloadPreset =
  | "best"
  | "balanced"
  | "audio-mp3"
  | "audio-m4a"
  | "audio-opus"
  | "audio-wav"
  | "video-mp4-best"
  | "video-mp4-1080"
  | "video-mp4-720"
export type DownloadStatus =
  | "waiting"
  | "checking"
  | "blocked"
  | "downloading"
  | "converting"
  | "completed"
  | "failed"
  | "cancelled"

export type Inspection = {
  platform: Platform
  downloadable: boolean
  title?: string | null
  creator?: string | null
  duration?: number | null
  thumbnail?: string | null
  formats: string[]
  formatDetails?: FormatDetail[]
  limitation?: string | null
  suggestedFileName?: string | null
}

export type FormatDetail = {
  id: string
  kind: "audio" | "video" | "muxed"
  label: string
  ext?: string | null
  resolution?: string | null
  width?: number | null
  height?: number | null
  fps?: number | null
  videoCodec?: string | null
  audioCodec?: string | null
  audioBitrate?: number | null
  videoBitrate?: number | null
  totalBitrate?: number | null
  filesize?: number | null
  note?: string | null
}

export type PlaylistEntry = {
  id: string
  url: string
  title: string
  creator?: string | null
  duration?: number | null
  thumbnail?: string | null
  index: number
}

export type PlaylistInspection = {
  platform: Platform
  downloadable: boolean
  title?: string | null
  creator?: string | null
  entries: PlaylistEntry[]
  limitation?: string | null
}

export type Settings = {
  theme: "light" | "dark" | "system"
  defaultOutputFolder: string
  defaultFormat: DownloadMode
  defaultQuality: DownloadPreset
  platformDefaults: PlatformDefaults
  playlistConcurrency: number
  playlistFolderMode: boolean
  keepHistory: boolean
}

export type PlatformWithDefaults = "youTube" | "soundCloud" | "tikTok" | "instagram" | "twitter" | "pinterest"

export type PlatformDefault = {
  mode: DownloadMode
  quality: DownloadPreset
}

export type PlatformDefaults = Record<PlatformWithDefaults, PlatformDefault>

export type ToolDetail = {
  name: string
  requiredVersion: string
  managedInstalled: boolean
  managedVersion?: string | null
  managedPath?: string | null
  systemInstalled: boolean
  systemVersion?: string | null
  activeSource: "managed" | "system" | "missing" | string
  ready: boolean
  message: string
}

export type ToolStatus = {
  ytDlp: ToolDetail
  ffmpeg: ToolDetail
  ready: boolean
}

export type HistoryItem = {
  id: string
  url?: string | null
  title: string
  creator?: string | null
  thumbnail?: string | null
  duration?: number | null
  platform: Platform
  path: string
  mode: DownloadMode
  quality?: DownloadPreset | string | null
  fileName?: string | null
  outputDir?: string | null
  selectedFormatId?: string | null
  playlistTitle?: string | null
  playlistIndex?: number | null
  playlistTotal?: number | null
  completedAt: string
}

export type DownloadItem = {
  id: string
  url: string
  title: string
  creator?: string | null
  thumbnail?: string | null
  duration?: number | null
  platform: Platform
  mode: DownloadMode
  quality: DownloadPreset
  outputDir: string
  fileName: string
  status: DownloadStatus
  progress: number
  message: string
  splitChapters?: boolean
  saveSubtitles?: boolean
  subtitleLanguage?: string
  selectedFormatId?: string
  path?: string
  playlistTitle?: string
  playlistIndex?: number
  playlistTotal?: number
}

export const defaultSettings: Settings = {
  theme: "system",
  defaultOutputFolder: "",
  defaultFormat: "audio",
  defaultQuality: "best",
  platformDefaults: {
    youTube: { mode: "audio", quality: "best" },
    soundCloud: { mode: "audio", quality: "best" },
    tikTok: { mode: "audio", quality: "best" },
    instagram: { mode: "video", quality: "best" },
    twitter: { mode: "video", quality: "best" },
    pinterest: { mode: "video", quality: "best" },
  },
  playlistConcurrency: 2,
  playlistFolderMode: false,
  keepHistory: true,
}

export function clampPlaylistConcurrency(value: number) {
  if (!Number.isFinite(value)) return 2
  return Math.min(3, Math.max(1, Math.round(value)))
}

export type PresetOption = {
  value: DownloadPreset
  label: string
  description: string
  extension: string
}

export const audioPresetOptions: PresetOption[] = [
  { value: "best", label: "Best", description: "Highest-quality MP3 for broad compatibility", extension: "mp3" },
  { value: "balanced", label: "Balanced", description: "Smaller M4A for everyday listening", extension: "m4a" },
  { value: "audio-mp3", label: "MP3", description: "Compatible audio file", extension: "mp3" },
  { value: "audio-m4a", label: "M4A", description: "Efficient AAC audio file", extension: "m4a" },
  { value: "audio-opus", label: "Opus", description: "Efficient modern audio file", extension: "opus" },
  { value: "audio-wav", label: "WAV", description: "Uncompressed audio file", extension: "wav" },
]

export const videoPresetOptions: PresetOption[] = [
  { value: "best", label: "Best", description: "Best available MP4 video", extension: "mp4" },
  { value: "balanced", label: "Balanced", description: "MP4 up to 720p", extension: "mp4" },
  { value: "video-mp4-best", label: "MP4 best", description: "Best available MP4 video", extension: "mp4" },
  { value: "video-mp4-1080", label: "MP4 1080p", description: "MP4 up to 1080p", extension: "mp4" },
  { value: "video-mp4-720", label: "MP4 720p", description: "MP4 up to 720p", extension: "mp4" },
]

export function presetOptionsForMode(mode: DownloadMode) {
  return mode === "audio" ? audioPresetOptions : videoPresetOptions
}

export function isPresetAllowedForMode(preset: string, mode: DownloadMode): preset is DownloadPreset {
  return presetOptionsForMode(mode).some((option) => option.value === preset)
}

export function normalizePresetForMode(preset: string, mode: DownloadMode): DownloadPreset {
  return isPresetAllowedForMode(preset, mode) ? preset : "best"
}

export function defaultModeForPlatform(platform: Platform, fallback: DownloadMode = "audio"): DownloadMode {
  return platform === "soundCloud" ? "audio" : fallback
}

export function normalizePlatformDefault(
  platform: PlatformWithDefaults,
  value: Partial<PlatformDefault> | undefined,
  fallback: PlatformDefault = { mode: "audio", quality: "best" },
): PlatformDefault {
  const fallbackMode = defaultModeForPlatform(platform, fallback.mode)
  const mode = defaultModeForPlatform(platform, value?.mode === "video" ? "video" : value?.mode === "audio" ? "audio" : fallbackMode)
  return {
    mode,
    quality: normalizePresetForMode(value?.quality || fallback.quality, mode),
  }
}

export function defaultPlatformDefaults(format: DownloadMode = "audio", quality: DownloadPreset = "best"): PlatformDefaults {
  return {
    youTube: normalizePlatformDefault("youTube", undefined, { mode: format, quality }),
    soundCloud: normalizePlatformDefault("soundCloud", undefined, { mode: format, quality }),
    tikTok: normalizePlatformDefault("tikTok", undefined, { mode: format, quality }),
    instagram: normalizePlatformDefault("instagram", undefined, { mode: "video", quality: "best" }),
    twitter: normalizePlatformDefault("twitter", undefined, { mode: "video", quality: "best" }),
    pinterest: normalizePlatformDefault("pinterest", undefined, { mode: "video", quality: "best" }),
  }
}

export function normalizePlatformDefaults(
  value: Partial<PlatformDefaults> | undefined,
  format: DownloadMode = "audio",
  quality: DownloadPreset = "best",
): PlatformDefaults {
  const fallback = { mode: format, quality }
  return {
    youTube: normalizePlatformDefault("youTube", value?.youTube, fallback),
    soundCloud: normalizePlatformDefault("soundCloud", value?.soundCloud, fallback),
    tikTok: normalizePlatformDefault("tikTok", value?.tikTok, fallback),
    instagram: normalizePlatformDefault("instagram", value?.instagram, { mode: "video", quality: "best" }),
    twitter: normalizePlatformDefault("twitter", value?.twitter, { mode: "video", quality: "best" }),
    pinterest: normalizePlatformDefault("pinterest", value?.pinterest, { mode: "video", quality: "best" }),
  }
}

export function defaultForPlatform(settings: Settings, platform: Platform): PlatformDefault {
  if (platform === "youTube" || platform === "soundCloud" || platform === "tikTok" || platform === "instagram" || platform === "twitter" || platform === "pinterest") {
    return normalizePlatformDefault(platform, settings.platformDefaults?.[platform], {
      mode: settings.defaultFormat,
      quality: settings.defaultQuality,
    })
  }
  return {
    mode: settings.defaultFormat,
    quality: normalizePresetForMode(settings.defaultQuality, settings.defaultFormat),
  }
}

export function presetDetails(preset: DownloadPreset, mode: DownloadMode) {
  return presetOptionsForMode(mode).find((option) => option.value === preset) || presetOptionsForMode(mode)[0]
}

export function estimatedFileType(preset: DownloadPreset, mode: DownloadMode) {
  const details = presetDetails(preset, mode)
  return `${details.extension.toUpperCase()} ${mode === "audio" ? "audio" : "video"}`
}

export function formatDetailsForMode(details: FormatDetail[] | undefined, mode: DownloadMode) {
  const rows = details || []
  return rows.filter((detail) => (mode === "audio" ? detail.kind === "audio" : detail.kind === "video" || detail.kind === "muxed"))
}

function compactParts(parts: Array<string | number | null | undefined>) {
  return parts.filter((part) => part !== null && part !== undefined && `${part}`.trim()).map((part) => `${part}`.trim())
}

export function formatBytes(bytes?: number | null) {
  if (!bytes || !Number.isFinite(bytes)) return ""
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

export function formatDetailLabel(detail: FormatDetail) {
  const ext = detail.ext?.toUpperCase()
  const bitrate = detail.totalBitrate ? `${Math.round(detail.totalBitrate)} kbps` : null
  if (detail.kind === "audio") {
    const codec = detail.audioCodec && detail.audioCodec !== "none" ? detail.audioCodec : null
    const label = detail.label && detail.label.toLowerCase() !== "audio only" ? detail.label : codec || "Audio"
    return compactParts([label, codec && codec !== label ? codec : null, ext, bitrate]).join(" · ")
  }
  const label = detail.label || detail.resolution || (detail.height ? `${detail.height}p` : detail.videoCodec) || detail.id
  const resolution = detail.resolution && detail.resolution !== label ? detail.resolution : null
  return compactParts([label, resolution, ext, detail.fps ? `${detail.fps} fps` : null, bitrate]).join(" · ")
}

export function formatDetailSummary(detail?: FormatDetail) {
  if (!detail) return "Use the selected preset to let yt-dlp choose the best matching source."
  const size = formatBytes(detail.filesize)
  const codecs = compactParts([detail.videoCodec && detail.videoCodec !== "none" ? `video ${detail.videoCodec}` : null, detail.audioCodec && detail.audioCodec !== "none" ? `audio ${detail.audioCodec}` : null])
  const metrics = compactParts([
    detail.resolution,
    detail.fps ? `${detail.fps} fps` : null,
    detail.audioBitrate ? `${Math.round(detail.audioBitrate)} kbps audio` : null,
    detail.videoBitrate ? `${Math.round(detail.videoBitrate)} kbps video` : null,
    detail.totalBitrate ? `${Math.round(detail.totalBitrate)} kbps total` : null,
    size,
  ])
  return compactParts([metrics.join(" · "), codecs.join(" · "), detail.note]).join(". ")
}

export function detectPlatform(rawUrl: string): Platform {
  try {
    const hostname = new URL(rawUrl.trim()).hostname.toLowerCase().replace(/^www\./, "")
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be") return "youTube"
    if (hostname === "soundcloud.com" || hostname.endsWith(".soundcloud.com")) return "soundCloud"
    if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) return "tikTok"
    if (isInstagramHost(hostname)) return "instagram"
    if (isTwitterHost(hostname)) return "twitter"
    if (isPinterestHost(hostname) || isPinterestShortHost(hostname)) return "pinterest"
    if (hostname === "spotify.com" || hostname.endsWith(".spotify.com")) return "spotify"
    return "unsupported"
  } catch {
    const value = rawUrl.toLowerCase()
    if (value.includes("youtube.com/") || value.includes("youtu.be/")) return "youTube"
    if (value.includes("soundcloud.com/")) return "soundCloud"
    if (value.includes("tiktok.com/")) return "tikTok"
    if (value.includes("spotify.com/")) return "spotify"
    return "unsupported"
  }
}

function normalizedHost(url: URL) {
  return url.hostname.toLowerCase().replace(/^www\./, "")
}

function pathSegments(url: URL) {
  return url.pathname.split("/").filter(Boolean)
}

function isInstagramHost(hostname: string) {
  return hostname === "instagram.com"
}

function isTwitterHost(hostname: string) {
  return hostname === "twitter.com" || hostname === "mobile.twitter.com" || hostname === "x.com"
}

function isPinterestHost(hostname: string) {
  return hostname === "pinterest.com"
}

function isPinterestShortHost(hostname: string) {
  return hostname === "pin.it"
}

export function isLikelyTikTokVideoUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim())
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "")
    if (!(hostname === "tiktok.com" || hostname.endsWith(".tiktok.com"))) return false
    const path = url.pathname.toLowerCase()
    if (hostname === "vm.tiktok.com" || hostname === "vt.tiktok.com") return path.length > 1
    return path.includes("/video/") || path.startsWith("/v/") || path.startsWith("/t/")
  } catch {
    return false
  }
}

export function isLikelyInstagramSingleItemUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim())
    const hostname = normalizedHost(url)
    if (!isInstagramHost(hostname)) return false
    const [kind, shortcode, ...rest] = pathSegments(url)
    return ["p", "reel", "reels", "tv"].includes((kind || "").toLowerCase()) && Boolean(shortcode) && rest.length === 0
  } catch {
    return false
  }
}

export function isLikelyTwitterStatusUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim())
    const hostname = normalizedHost(url)
    if (!isTwitterHost(hostname)) return false
    const segments = pathSegments(url).map((segment) => segment.toLowerCase())
    const idPattern = /^\d+$/
    const suffixIsSafe = (suffix: string[]) => suffix.length === 0 || (suffix.length === 2 && ["photo", "video"].includes(suffix[0]) && idPattern.test(suffix[1]))
    if (segments[0] === "i" && segments[1] === "web" && segments[2] === "status" && idPattern.test(segments[3] || "")) {
      return suffixIsSafe(segments.slice(4))
    }
    if (segments[0] === "i" && segments[1] === "status" && idPattern.test(segments[2] || "")) {
      return suffixIsSafe(segments.slice(3))
    }
    const statusIndex = segments.findIndex((segment) => segment === "status" || segment === "statuses")
    return statusIndex === 1 && Boolean(segments[0]) && idPattern.test(segments[2] || "") && suffixIsSafe(segments.slice(3))
  } catch {
    return false
  }
}

export function isLikelyPinterestPinUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim())
    const hostname = normalizedHost(url)
    if (isPinterestShortHost(hostname)) {
      const segments = pathSegments(url)
      return segments.length === 1 && Boolean(segments[0])
    }
    if (!isPinterestHost(hostname)) return false
    const segments = pathSegments(url).map((segment) => segment.toLowerCase())
    return segments[0] === "pin" && Boolean(segments[1]) && segments.length === 2
  } catch {
    return false
  }
}

export function validateMediaUrl(rawUrl: string): { valid: true; url: URL } | { valid: false; message: string } {
  try {
    const url = new URL(rawUrl.trim())
    if (!["http:", "https:"].includes(url.protocol)) {
      return { valid: false, message: "Paste a URL that starts with https:// or http://." }
    }
    const platform = detectPlatform(url.toString())
    if (platform === "unsupported") {
      return { valid: false, message: "This app currently supports permitted public YouTube, SoundCloud, TikTok, Instagram, Twitter/X, and Pinterest URLs." }
    }
    if (platform === "tikTok" && !isLikelyTikTokVideoUrl(url.toString())) {
      return { valid: false, message: "Paste an individual public TikTok video URL, not a profile or playlist." }
    }
    if (platform === "instagram" && !isLikelyInstagramSingleItemUrl(url.toString())) {
      return { valid: false, message: "Paste an individual public Instagram post, reel, or TV URL, not a profile, story, hashtag, or search." }
    }
    if (platform === "twitter" && !isLikelyTwitterStatusUrl(url.toString())) {
      return { valid: false, message: "Paste an individual public Twitter/X post URL, not a profile, search, list, or timeline." }
    }
    if (platform === "pinterest" && !isLikelyPinterestPinUrl(url.toString())) {
      return { valid: false, message: "Paste an individual public Pinterest video Pin URL under /pin/ or a pin.it short link, not a board, profile, or search." }
    }
    return { valid: true, url }
  } catch {
    return { valid: false, message: "Paste a complete media URL." }
  }
}

export function isLikelyPlaylistUrl(rawUrl: string) {
  try {
    const url = new URL(rawUrl.trim())
    const platform = detectPlatform(url.toString())
    if (platform === "youTube") {
      return url.searchParams.has("list") || url.pathname.toLowerCase().includes("/playlist")
    }
    if (platform === "soundCloud") {
      const path = url.pathname.toLowerCase()
      return path.includes("/sets/") || path.includes("/playlists/")
    }
    return false
  } catch {
    return false
  }
}

export function sanitizeFilename(input: string): string {
  const reserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i
  let value = [...input]
    .map((char) => (/[<>:"/\\|?*]/.test(char) || char.charCodeAt(0) < 32 ? "_" : char))
    .join("")
    .trim()
    .replace(/[ .]+$/g, "")
  if (!value) value = "download"
  if (reserved.test(value)) value = `${value}_file`
  return value.slice(0, 120)
}

const allowedTransitions: Record<DownloadStatus, DownloadStatus[]> = {
  waiting: ["checking", "cancelled"],
  checking: ["blocked", "downloading", "failed", "cancelled"],
  blocked: [],
  downloading: ["converting", "completed", "failed", "cancelled"],
  converting: ["completed", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
}

export function canTransitionDownload(from: DownloadStatus, to: DownloadStatus) {
  return allowedTransitions[from].includes(to)
}

export function platformLabel(platform: Platform) {
  return platform === "youTube"
    ? "YouTube"
    : platform === "soundCloud"
      ? "SoundCloud"
      : platform === "tikTok"
        ? "TikTok"
        : platform === "instagram"
          ? "Instagram"
          : platform === "twitter"
            ? "Twitter/X"
            : platform === "pinterest"
              ? "Pinterest"
              : platform === "spotify"
                ? "Spotify"
                : "Unsupported"
}

export function formatDuration(seconds?: number | null) {
  if (!seconds) return "Unknown"
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, "0")}`
}
