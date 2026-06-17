import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "@/App"
import type { HistoryItem } from "@/lib/media"
import { inspectMedia, saveSettings } from "@/lib/tauri"

const { libraryItems, revealPathMock, testSettings } = vi.hoisted(() => ({
  libraryItems: [
    {
      id: "library-existing",
      url: "https://www.youtube.com/watch?v=localtest1",
      title: "Library Existing Audio Check",
      creator: "Codex Test Channel",
      duration: 185,
      platform: "youTube",
      path: "C:\\tmp\\unmuze-library-check\\existing-audio.mp3",
      mode: "audio",
      quality: "audio-mp3",
      fileName: "Library Existing Audio Check",
      outputDir: "C:\\tmp\\unmuze-library-check",
      selectedFormatId: "251",
      playlistTitle: "Codex Verification Playlist",
      playlistIndex: 1,
      playlistTotal: 2,
      completedAt: "2026-06-16T18:00:00.000Z",
    },
    {
      id: "library-missing",
      url: "https://soundcloud.com/example/missing-track",
      title: "Library Missing File Check",
      creator: "SoundCloud Artist",
      duration: 242,
      platform: "soundCloud",
      path: "C:\\tmp\\unmuze-library-check\\missing-audio.m4a",
      mode: "audio",
      quality: "balanced",
      fileName: "Library Missing File Check",
      outputDir: "C:\\tmp\\unmuze-library-check",
      playlistTitle: "Codex Verification Playlist",
      playlistIndex: 2,
      playlistTotal: 2,
      completedAt: "2026-06-13T18:00:00.000Z",
    },
  ] satisfies HistoryItem[],
  revealPathMock: vi.fn(),
  testSettings: {
    theme: "system",
    defaultOutputFolder: "",
    defaultFormat: "audio",
    defaultQuality: "best",
    platformDefaults: {
      youTube: { mode: "audio", quality: "best" },
      soundCloud: { mode: "audio", quality: "best" },
      tikTok: { mode: "audio", quality: "best" },
    },
    playlistConcurrency: 2,
    keepHistory: true,
  },
}))

vi.mock("@tauri-apps/api/app", () => ({
  getVersion: vi.fn(() => Promise.resolve("0.5.0")),
}))

vi.mock("@tauri-apps/plugin-process", () => ({
  relaunch: vi.fn(() => Promise.resolve()),
}))

vi.mock("@tauri-apps/plugin-updater", () => ({
  check: vi.fn(() => Promise.resolve(null)),
}))

vi.mock("@/lib/tauri", () => ({
  cancelDownload: vi.fn(() => Promise.resolve()),
  checkPaths: vi.fn(() =>
    Promise.resolve({
      "C:\\tmp\\unmuze-library-check\\existing-audio.mp3": true,
      "C:\\tmp\\unmuze-library-check\\missing-audio.m4a": false,
    }),
  ),
  chooseFolder: vi.fn(() => Promise.resolve("")),
  getToolStatus: vi.fn(() =>
    Promise.resolve({
      ready: true,
      ytDlp: { ready: true, name: "yt-dlp", requiredVersion: "test", managedInstalled: true, systemInstalled: false, activeSource: "managed", message: "Ready" },
      ffmpeg: { ready: true, name: "FFmpeg", requiredVersion: "test", managedInstalled: true, systemInstalled: false, activeSource: "managed", message: "Ready" },
    }),
  ),
  inspectMedia: vi.fn(),
  inspectPlaylist: vi.fn(),
  installManagedTools: vi.fn(),
  loadHistory: vi.fn(() => Promise.resolve(libraryItems)),
  loadSettings: vi.fn(() => Promise.resolve(testSettings)),
  onDownloadFinished: vi.fn(() => Promise.resolve(() => undefined)),
  onDownloadProgress: vi.fn(() => Promise.resolve(() => undefined)),
  revealPath: revealPathMock,
  saveHistory: vi.fn((history: HistoryItem[]) => Promise.resolve(history)),
  saveSettings: vi.fn((settings) => Promise.resolve(settings)),
  startDownload: vi.fn(),
}))

describe("Library screen", () => {
  beforeEach(() => {
    revealPathMock.mockClear()
    vi.mocked(inspectMedia).mockReset()
    vi.mocked(saveSettings).mockClear()
    testSettings.theme = "system"
    testSettings.defaultOutputFolder = ""
    testSettings.defaultFormat = "audio"
    testSettings.defaultQuality = "best"
    testSettings.platformDefaults = {
      youTube: { mode: "audio", quality: "best" },
      soundCloud: { mode: "audio", quality: "best" },
      tikTok: { mode: "audio", quality: "best" },
    }
    testSettings.playlistConcurrency = 2
    testSettings.keepHistory = true
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn(() => Promise.resolve()) },
    })
    window.confirm = vi.fn(() => true)
  })

  function openLibrary() {
    fireEvent.click(screen.getAllByRole("tab", { name: "Library" })[0])
  }

  it("renders enriched library records with grouping, metadata, and path status", async () => {
    render(<App />)

    openLibrary()

    expect(await screen.findByText("Library Existing Audio Check")).toBeInTheDocument()
    expect(screen.getByText("Library Missing File Check")).toBeInTheDocument()
    expect(screen.getByText("Playlist · Codex Verification Playlist")).toBeInTheDocument()
    expect(screen.getByText(/Codex Test Channel · 3:05/)).toBeInTheDocument()
    expect(screen.getByText(/SoundCloud Artist · 4:02/)).toBeInTheDocument()
    expect(await screen.findByText("Available")).toBeInTheDocument()
    expect(await screen.findByText("Missing")).toBeInTheDocument()
    expect(screen.getByText("MP3")).toBeInTheDocument()
    expect(screen.getByText("Balanced")).toBeInTheDocument()
  })

  it("filters by search, platform, and grouping without losing reset recovery", async () => {
    render(<App />)

    openLibrary()
    expect(await screen.findByText("Library Existing Audio Check")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Search library"), { target: { value: "missing" } })
    expect(screen.queryByText("Library Existing Audio Check")).not.toBeInTheDocument()
    expect(screen.getByText("Library Missing File Check")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Platform"), { target: { value: "youTube" } })
    expect(screen.getByText("No matching library items")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Reset" }))
    await waitFor(() => expect(screen.getByText("Library Existing Audio Check")).toBeInTheDocument())

    fireEvent.change(screen.getByLabelText("Grouping"), { target: { value: "individual" } })
    expect(screen.getByText("No matching library items")).toBeInTheDocument()
  })

  it("opens available files and disables missing file open actions", async () => {
    render(<App />)

    openLibrary()
    expect(await screen.findByText("Library Existing Audio Check")).toBeInTheDocument()
    expect(await screen.findByText("Missing")).toBeInTheDocument()

    const openButtons = screen.getAllByRole("button", { name: "Open" })
    expect(openButtons).toHaveLength(2)
    expect(openButtons[0]).toBeEnabled()
    expect(openButtons[1]).toBeDisabled()

    fireEvent.click(openButtons[0])
    expect(revealPathMock).toHaveBeenCalledWith("C:\\tmp\\unmuze-library-check\\existing-audio.mp3")
  })

  it("saves platform-specific defaults from Settings", async () => {
    render(<App />)

    fireEvent.click(screen.getAllByRole("tab", { name: "Settings" })[0])
    expect(await screen.findByText("Platform defaults")).toBeInTheDocument()

    fireEvent.click(screen.getAllByRole("button", { name: "Video" })[0])
    fireEvent.change(screen.getByLabelText("YouTube preset"), { target: { value: "video-mp4-1080" } })

    await waitFor(() =>
      expect(vi.mocked(saveSettings)).toHaveBeenLastCalledWith(
        expect.objectContaining({
          platformDefaults: expect.objectContaining({
            youTube: { mode: "video", quality: "video-mp4-1080" },
          }),
        }),
      ),
    )
  })

  it("applies the inspected platform default to save options", async () => {
    testSettings.platformDefaults.youTube = { mode: "video", quality: "video-mp4-720" }
    vi.mocked(inspectMedia).mockResolvedValueOnce({
      platform: "youTube",
      downloadable: true,
      title: "Platform Default Video",
      creator: "Codex Channel",
      duration: 60,
      thumbnail: null,
      formats: ["audio", "video"],
      suggestedFileName: "Platform Default Video",
    })
    render(<App />)

    fireEvent.click(screen.getAllByRole("tab", { name: "Settings" })[0])
    await waitFor(() => expect(screen.getByLabelText("YouTube preset")).toHaveValue("video-mp4-720"))
    fireEvent.click(screen.getAllByRole("tab", { name: "Download" })[0])
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://www.youtube.com/watch?v=platformdefault" } })
    fireEvent.click(screen.getByRole("button", { name: "Check" }))

    await waitFor(() => expect(screen.getByLabelText("Preset")).toHaveValue("video-mp4-720"))
    expect(screen.getByText("Output type: MP4 video. Metadata and artwork are embedded when supported.")).toBeInTheDocument()
  })
})
