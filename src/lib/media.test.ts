import { describe, expect, it } from "vitest"
import { canTransitionDownload, defaultSettings, detectPlatform, isLikelyPlaylistUrl, sanitizeFilename, validateMediaUrl } from "@/lib/media"

describe("media URL handling", () => {
  it("detects supported platforms", () => {
    expect(detectPlatform("https://www.youtube.com/watch?v=abc")).toBe("youTube")
    expect(detectPlatform("https://youtu.be/abc")).toBe("youTube")
    expect(detectPlatform("https://soundcloud.com/artist/track")).toBe("soundCloud")
    expect(detectPlatform("https://m.soundcloud.com/artist/track")).toBe("soundCloud")
    expect(detectPlatform("https://on.soundcloud.com/abc123")).toBe("soundCloud")
    expect(detectPlatform("https://open.spotify.com/track/abc")).toBe("spotify")
    expect(detectPlatform("https://example.com/file.mp4")).toBe("unsupported")
  })

  it("validates supported public URL shapes", () => {
    expect(validateMediaUrl("https://youtu.be/abc").valid).toBe(true)
    expect(validateMediaUrl("https://on.soundcloud.com/abc123").valid).toBe(true)
    expect(validateMediaUrl("ftp://youtu.be/abc").valid).toBe(false)
    expect(validateMediaUrl("not a url").valid).toBe(false)
    expect(validateMediaUrl("https://example.com/video").valid).toBe(false)
  })

  it("detects playlist-shaped URLs", () => {
    expect(isLikelyPlaylistUrl("https://www.youtube.com/playlist?list=PL123")).toBe(true)
    expect(isLikelyPlaylistUrl("https://www.youtube.com/watch?v=abc&list=PL123")).toBe(true)
    expect(isLikelyPlaylistUrl("https://soundcloud.com/artist/sets/mix")).toBe(true)
    expect(isLikelyPlaylistUrl("https://youtu.be/abc")).toBe(false)
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
    expect(defaultSettings.keepHistory).toBe(true)
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
