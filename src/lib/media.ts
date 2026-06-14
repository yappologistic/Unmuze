export type Platform = "youTube" | "soundCloud" | "spotify" | "unsupported"
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
  limitation?: string | null
  suggestedFileName?: string | null
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
  playlistConcurrency: number
  keepHistory: boolean
}

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
  title: string
  platform: Platform
  path: string
  mode: DownloadMode
  completedAt: string
}

export type DownloadItem = {
  id: string
  url: string
  title: string
  platform: Platform
  mode: DownloadMode
  quality: DownloadPreset
  outputDir: string
  fileName: string
  status: DownloadStatus
  progress: number
  message: string
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
  playlistConcurrency: 2,
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

export function presetDetails(preset: DownloadPreset, mode: DownloadMode) {
  return presetOptionsForMode(mode).find((option) => option.value === preset) || presetOptionsForMode(mode)[0]
}

export function estimatedFileType(preset: DownloadPreset, mode: DownloadMode) {
  const details = presetDetails(preset, mode)
  return `${details.extension.toUpperCase()} ${mode === "audio" ? "audio" : "video"}`
}

export function detectPlatform(rawUrl: string): Platform {
  try {
    const hostname = new URL(rawUrl.trim()).hostname.toLowerCase().replace(/^www\./, "")
    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com") || hostname === "youtu.be") return "youTube"
    if (hostname === "soundcloud.com" || hostname.endsWith(".soundcloud.com")) return "soundCloud"
    if (hostname === "spotify.com" || hostname.endsWith(".spotify.com")) return "spotify"
    return "unsupported"
  } catch {
    const value = rawUrl.toLowerCase()
    if (value.includes("youtube.com/") || value.includes("youtu.be/")) return "youTube"
    if (value.includes("soundcloud.com/")) return "soundCloud"
    if (value.includes("spotify.com/")) return "spotify"
    return "unsupported"
  }
}

export function validateMediaUrl(rawUrl: string): { valid: true; url: URL } | { valid: false; message: string } {
  try {
    const url = new URL(rawUrl.trim())
    if (!["http:", "https:"].includes(url.protocol)) {
      return { valid: false, message: "Paste a URL that starts with https:// or http://." }
    }
    if (detectPlatform(url.toString()) === "unsupported") {
      return { valid: false, message: "This app currently supports permitted public YouTube and SoundCloud URLs." }
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
