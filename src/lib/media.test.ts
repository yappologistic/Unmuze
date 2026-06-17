import { describe, expect, it } from "vitest"
import {
  audioPresetOptions,
  canTransitionDownload,
  clampPlaylistConcurrency,
  defaultForPlatform,
  defaultPlatformDefaults,
  defaultSettings,
  detectPlatform,
  estimatedFileType,
  formatDetailLabel,
  formatDetailSummary,
  formatDetailsForMode,
  isPresetAllowedForMode,
  isLikelyPlaylistUrl,
  isLikelyTikTokVideoUrl,
  normalizePlatformDefault,
  normalizePlatformDefaults,
  normalizePresetForMode,
  platformLabel,
  presetDetails,
  sanitizeFilename,
  validateMediaUrl,
  videoPresetOptions,
} from "@/lib/media"

describe("media URL handling", () => {
  it("detects supported platforms", () => {
    expect(detectPlatform("https://www.youtube.com/watch?v=abc")).toBe("youTube")
    expect(detectPlatform("https://youtu.be/abc")).toBe("youTube")
    expect(detectPlatform("https://soundcloud.com/artist/track")).toBe("soundCloud")
    expect(detectPlatform("https://m.soundcloud.com/artist/track")).toBe("soundCloud")
    expect(detectPlatform("https://on.soundcloud.com/abc123")).toBe("soundCloud")
    expect(detectPlatform("https://www.tiktok.com/@artist/video/1234567890")).toBe("tikTok")
    expect(detectPlatform("https://m.tiktok.com/v/1234567890.html")).toBe("tikTok")
    expect(detectPlatform("https://vm.tiktok.com/ZMabc123/")).toBe("tikTok")
    expect(detectPlatform("https://open.spotify.com/track/abc")).toBe("spotify")
    expect(detectPlatform("https://example.com/file.mp4")).toBe("unsupported")
  })

  it("validates supported public URL shapes", () => {
    expect(validateMediaUrl("https://youtu.be/abc").valid).toBe(true)
    expect(validateMediaUrl("https://on.soundcloud.com/abc123").valid).toBe(true)
    expect(validateMediaUrl("https://www.tiktok.com/@artist/video/1234567890").valid).toBe(true)
    expect(validateMediaUrl("https://vm.tiktok.com/ZMabc123/").valid).toBe(true)
    expect(validateMediaUrl("https://www.tiktok.com/@artist").valid).toBe(false)
    expect(validateMediaUrl("ftp://youtu.be/abc").valid).toBe(false)
    expect(validateMediaUrl("not a url").valid).toBe(false)
    expect(validateMediaUrl("https://example.com/video").valid).toBe(false)
  })

  it("detects playlist-shaped URLs", () => {
    expect(isLikelyPlaylistUrl("https://www.youtube.com/playlist?list=PL123")).toBe(true)
    expect(isLikelyPlaylistUrl("https://www.youtube.com/watch?v=abc&list=PL123")).toBe(true)
    expect(isLikelyPlaylistUrl("https://soundcloud.com/artist/sets/mix")).toBe(true)
    expect(isLikelyPlaylistUrl("https://youtu.be/abc")).toBe(false)
    expect(isLikelyPlaylistUrl("https://www.tiktok.com/@artist/video/1234567890")).toBe(false)
  })

  it("detects individual TikTok video URL shapes", () => {
    expect(isLikelyTikTokVideoUrl("https://www.tiktok.com/@artist/video/1234567890")).toBe(true)
    expect(isLikelyTikTokVideoUrl("https://m.tiktok.com/v/1234567890.html")).toBe(true)
    expect(isLikelyTikTokVideoUrl("https://vm.tiktok.com/ZMabc123/")).toBe(true)
    expect(isLikelyTikTokVideoUrl("https://www.tiktok.com/@artist")).toBe(false)
  })

  it("labels supported platforms for the UI", () => {
    expect(platformLabel("youTube")).toBe("YouTube")
    expect(platformLabel("soundCloud")).toBe("SoundCloud")
    expect(platformLabel("tikTok")).toBe("TikTok")
    expect(platformLabel("spotify")).toBe("Spotify")
  })
})

describe("filename sanitization", () => {
  it("removes path traversal and platform-invalid characters", () => {
    expect(sanitizeFilename("../bad:name?.mp4")).toBe(".._bad_name_.mp4")
    expect(sanitizeFilename("CON")).toBe("CON_file")
    expect(sanitizeFilename("   ...   ")).toBe("download")
  })

  it("limits very long names", () => {
    expect(sanitizeFilename("a".repeat(200))).toHaveLength(120)
  })
})

describe("settings defaults", () => {
  it("defaults to local-first safe preferences", () => {
    expect(defaultSettings.theme).toBe("system")
    expect(defaultSettings.defaultFormat).toBe("audio")
    expect(defaultSettings.platformDefaults.soundCloud.mode).toBe("audio")
    expect(defaultSettings.playlistConcurrency).toBe(2)
    expect(defaultSettings.playlistFolderMode).toBe(false)
    expect(defaultSettings.keepHistory).toBe(true)
  })

  it("builds platform defaults from global fallback preferences", () => {
    expect(defaultPlatformDefaults("video", "video-mp4-1080")).toEqual({
      youTube: { mode: "video", quality: "video-mp4-1080" },
      soundCloud: { mode: "audio", quality: "best" },
      tikTok: { mode: "video", quality: "video-mp4-1080" },
    })
  })

  it("normalizes platform defaults by mode and platform capability", () => {
    expect(normalizePlatformDefault("youTube", { mode: "video", quality: "video-mp4-1080" })).toEqual({
      mode: "video",
      quality: "video-mp4-1080",
    })
    expect(normalizePlatformDefault("soundCloud", { mode: "video", quality: "video-mp4-1080" })).toEqual({
      mode: "audio",
      quality: "best",
    })
    expect(normalizePlatformDefaults({ tikTok: { mode: "video", quality: "audio-wav" } }).tikTok).toEqual({
      mode: "video",
      quality: "best",
    })
  })

  it("resolves platform defaults with unsupported platforms falling back to global defaults", () => {
    const settings = {
      ...defaultSettings,
      defaultFormat: "audio" as const,
      defaultQuality: "audio-m4a" as const,
      platformDefaults: {
        ...defaultSettings.platformDefaults,
        youTube: { mode: "video" as const, quality: "video-mp4-720" as const },
      },
    }

    expect(defaultForPlatform(settings, "youTube")).toEqual({ mode: "video", quality: "video-mp4-720" })
    expect(defaultForPlatform(settings, "unsupported")).toEqual({ mode: "audio", quality: "audio-m4a" })
  })
})

describe("playlist concurrency", () => {
  it("keeps playlist concurrency inside the supported range", () => {
    expect(clampPlaylistConcurrency(0)).toBe(1)
    expect(clampPlaylistConcurrency(2)).toBe(2)
    expect(clampPlaylistConcurrency(10)).toBe(3)
    expect(clampPlaylistConcurrency(Number.NaN)).toBe(2)
  })
})

describe("format presets", () => {
  it("exposes audio and video preset choices", () => {
    expect(audioPresetOptions.map((option) => option.value)).toEqual([
      "best",
      "balanced",
      "audio-mp3",
      "audio-m4a",
      "audio-opus",
      "audio-wav",
    ])
    expect(videoPresetOptions.map((option) => option.value)).toEqual([
      "best",
      "balanced",
      "video-mp4-best",
      "video-mp4-1080",
      "video-mp4-720",
    ])
  })

  it("normalizes presets when switching modes", () => {
    expect(isPresetAllowedForMode("audio-wav", "audio")).toBe(true)
    expect(isPresetAllowedForMode("audio-wav", "video")).toBe(false)
    expect(normalizePresetForMode("audio-wav", "video")).toBe("best")
    expect(presetDetails("video-mp4-1080", "video").extension).toBe("mp4")
    expect(estimatedFileType("audio-opus", "audio")).toBe("OPUS audio")
  })
})

describe("format details", () => {
  const details = [
    {
      id: "251",
      kind: "audio" as const,
      label: "Audio only",
      ext: "webm",
      audioCodec: "opus",
      audioBitrate: 160,
      totalBitrate: 160,
      filesize: 2_097_152,
    },
    {
      id: "137",
      kind: "video" as const,
      label: "1080p",
      ext: "mp4",
      resolution: "1920x1080",
      fps: 30,
      videoCodec: "avc1",
      totalBitrate: 4500,
    },
    {
      id: "18",
      kind: "muxed" as const,
      label: "360p",
      ext: "mp4",
      resolution: "640x360",
      fps: 30,
      videoCodec: "avc1",
      audioCodec: "mp4a.40.2",
      totalBitrate: 650,
    },
  ]

  it("filters details by download mode", () => {
    expect(formatDetailsForMode(details, "audio").map((detail) => detail.id)).toEqual(["251"])
    expect(formatDetailsForMode(details, "video").map((detail) => detail.id)).toEqual(["137", "18"])
  })

  it("builds readable labels and summaries", () => {
    expect(formatDetailLabel(details[0])).toBe("opus · WEBM · 160 kbps")
    expect(formatDetailLabel(details[1])).toBe("1080p · 1920x1080 · MP4 · 30 fps · 4500 kbps")
    expect(formatDetailSummary(details[0])).toContain("160 kbps audio")
    expect(formatDetailSummary(details[0])).toContain("2.0 MB")
  })
})

describe("download state transitions", () => {
  it("allows valid forward progress", () => {
    expect(canTransitionDownload("waiting", "checking")).toBe(true)
    expect(canTransitionDownload("checking", "downloading")).toBe(true)
    expect(canTransitionDownload("downloading", "converting")).toBe(true)
    expect(canTransitionDownload("converting", "completed")).toBe(true)
  })

  it("rejects invalid restart and blocked transitions", () => {
    expect(canTransitionDownload("blocked", "downloading")).toBe(false)
    expect(canTransitionDownload("completed", "downloading")).toBe(false)
    expect(canTransitionDownload("failed", "downloading")).toBe(false)
  })
})
