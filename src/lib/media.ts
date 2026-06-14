export type Platform = "youTube" | "soundCloud" | "spotify" | "unsupported"
export type DownloadMode = "audio" | "video"
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
  defaultQuality: "best" | "balanced"
  keepHistory: boolean
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
  quality: "best" | "balanced"
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
  keepHistory: true,
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
