import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import App from "@/App"
import type { HistoryItem } from "@/lib/media"
import { inspectMedia, inspectPlaylist, saveSettings, startDownload } from "@/lib/tauri"
import { check } from "@tauri-apps/plugin-updater"

const { downloadEvents, libraryItems, revealPathMock, startDownloadMock, testSettings } = vi.hoisted(() => ({
  downloadEvents: {
    finished: undefined as undefined | ((payload: { id: string; status: "completed" | "failed" | "cancelled"; path: string }) => void),
  },
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
    playlistFolderMode: false,
    keepHistory: true,
  },
  startDownloadMock: vi.fn(),
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
  onDownloadFinished: vi.fn((handler) => {
    downloadEvents.finished = handler
    return Promise.resolve(() => undefined)
  }),
  onDownloadProgress: vi.fn(() => Promise.resolve(() => undefined)),
  revealPath: revealPathMock,
  saveHistory: vi.fn((history: HistoryItem[]) => Promise.resolve(history)),
  saveSettings: vi.fn((settings) => Promise.resolve(settings)),
  startDownload: startDownloadMock,
}))

describe("Library screen", () => {
  beforeEach(() => {
    revealPathMock.mockClear()
    downloadEvents.finished = undefined
    vi.mocked(inspectMedia).mockReset()
    vi.mocked(inspectPlaylist).mockReset()
    vi.mocked(check).mockReset()
    vi.mocked(check).mockResolvedValue(null)
    vi.mocked(saveSettings).mockClear()
    vi.mocked(startDownload).mockReset()
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
    testSettings.playlistFolderMode = false
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
    expect(screen.getByText("The saved file was not found at this path. The Library record is still kept so you can copy the source URL or local path.")).toBeInTheDocument()
    expect(screen.getByText("MP3")).toBeInTheDocument()
    expect(screen.getByText("Balanced")).toBeInTheDocument()
  })

  it("keeps the mobile download tab label consistent with the desktop label", async () => {
    await act(async () => {
      render(<App />)
    })

    expect(screen.queryByRole("tab", { name: "Save" })).not.toBeInTheDocument()
    expect(screen.getAllByRole("tab", { name: "Download" }).length).toBeGreaterThan(1)
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

  it("shows inline output folder validation before starting a single download", async () => {
    vi.mocked(inspectMedia).mockResolvedValueOnce({
      platform: "youTube",
      downloadable: true,
      title: "Missing Output Track",
      creator: "Codex Channel",
      duration: 60,
      thumbnail: null,
      formats: ["audio"],
      suggestedFileName: "Missing Output Track",
    })
    render(<App />)

    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://www.youtube.com/watch?v=missingoutput" } })
    fireEvent.click(screen.getByRole("button", { name: "Check" }))
    expect(await screen.findByText("Missing Output Track")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Save locally" }))
    expect(screen.getByText("Choose an output folder before saving.")).toBeInTheDocument()
    expect(screen.getByLabelText("Output folder")).toHaveAttribute("aria-invalid", "true")
    expect(vi.mocked(startDownload)).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("Output folder"), { target: { value: "C:\\tmp" } })
    expect(screen.queryByText("Choose an output folder before saving.")).not.toBeInTheDocument()
  })

  it("queues playlist items into a sanitized playlist folder when enabled", async () => {
    vi.mocked(inspectPlaylist).mockResolvedValueOnce({
      platform: "youTube",
      downloadable: true,
      title: "Road Mix: 2026",
      creator: "Codex Channel",
      entries: [
        { id: "a", url: "https://www.youtube.com/watch?v=a", title: "First Song", index: 1, duration: 90 },
        { id: "b", url: "https://www.youtube.com/watch?v=b", title: "Second Song", index: 2, duration: 120 },
      ],
    })
    vi.mocked(startDownload).mockResolvedValue("C:\\tmp\\Road Mix_ 2026\\01 - First Song.mp3")
    render(<App />)

    fireEvent.click(screen.getAllByRole("tab", { name: "Playlist" })[0])
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://www.youtube.com/playlist?list=roadmix" } })
    fireEvent.click(screen.getByRole("button", { name: "Check" }))
    expect(await screen.findByText("Road Mix: 2026")).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText("Output folder"), { target: { value: "C:\\tmp" } })
    fireEvent.click(screen.getByRole("switch", { name: "Save in playlist folder" }))
    fireEvent.click(screen.getByRole("button", { name: "Save selected items" }))

    await waitFor(() =>
      expect(vi.mocked(startDownload)).toHaveBeenCalledWith(
        expect.objectContaining({
          outputDir: "C:\\tmp",
          playlistFolderName: "Road Mix_ 2026",
          fileName: "01 - First Song",
        }),
      ),
    )
  })

  it("shows inline output folder validation before queueing playlist downloads", async () => {
    vi.mocked(inspectPlaylist).mockResolvedValueOnce({
      platform: "youTube",
      downloadable: true,
      title: "Playlist Without Folder",
      creator: "Codex Channel",
      entries: [
        { id: "a", url: "https://www.youtube.com/watch?v=a", title: "First Song", index: 1, duration: 90 },
      ],
    })
    render(<App />)

    fireEvent.click(screen.getAllByRole("tab", { name: "Playlist" })[0])
    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://www.youtube.com/playlist?list=missingfolder" } })
    fireEvent.click(screen.getByRole("button", { name: "Check" }))
    expect(await screen.findByText("Playlist Without Folder")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Save selected items" }))
    expect(screen.getByText("Choose an output folder before saving selected playlist items.")).toBeInTheDocument()
    expect(screen.getByLabelText("Output folder")).toHaveAttribute("aria-invalid", "true")
    expect(vi.mocked(startDownload)).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText("Output folder"), { target: { value: "C:\\tmp" } })
    expect(screen.queryByText("Choose an output folder before saving selected playlist items.")).not.toBeInTheDocument()
  })

  it("uses explicit update status labels before, during, and after checking", async () => {
    let resolveCheck!: (value: null) => void
    vi.mocked(check).mockReturnValueOnce(new Promise((resolve) => {
      resolveCheck = resolve
    }))
    render(<App />)

    fireEvent.click(screen.getAllByRole("tab", { name: "Settings" })[0])
    expect(await screen.findByText("Not checked yet")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Check for updates" }))
    expect(screen.getByText("Checking")).toBeInTheDocument()

    await act(async () => {
      resolveCheck(null)
    })
    expect(await screen.findByText("Up to date")).toBeInTheDocument()
  })

  it("shows completed download actions after the finish event", async () => {
    vi.mocked(inspectMedia).mockResolvedValueOnce({
      platform: "youTube",
      downloadable: true,
      title: "Completed Action Song",
      creator: "Codex Channel",
      duration: 60,
      thumbnail: null,
      formats: ["audio"],
      suggestedFileName: "Completed Action Song",
    })
    vi.mocked(startDownload).mockResolvedValue("C:\\tmp\\Completed Action Song.mp3")
    render(<App />)

    fireEvent.change(screen.getByLabelText("URL"), { target: { value: "https://www.youtube.com/watch?v=completeactions" } })
    fireEvent.click(screen.getByRole("button", { name: "Check" }))
    expect(await screen.findByText("Completed Action Song")).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText("Output folder"), { target: { value: "C:\\tmp" } })
    fireEvent.click(screen.getByRole("button", { name: "Save locally" }))

    await waitFor(() => expect(vi.mocked(startDownload)).toHaveBeenCalled())
    expect(screen.getByRole("progressbar", { name: "Completed Action Song download progress" })).toBeInTheDocument()
    const request = vi.mocked(startDownload).mock.calls[0][0] as { id: string }
    await act(async () => {
      downloadEvents.finished?.({
        id: request.id,
        status: "completed",
        path: "C:\\tmp\\Completed Action Song.mp3",
      })
    })

    expect(await screen.findByRole("button", { name: "Open file" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Copy path" }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("C:\\tmp\\Completed Action Song.mp3")
    fireEvent.click(screen.getByRole("button", { name: "Copy source" }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("https://www.youtube.com/watch?v=completeactions")
    fireEvent.click(screen.getByRole("button", { name: "Open file" }))
    fireEvent.click(screen.getByRole("button", { name: "Open folder" }))
    expect(revealPathMock).toHaveBeenCalledWith("C:\\tmp\\Completed Action Song.mp3")
    expect(revealPathMock).toHaveBeenCalledWith("C:\\tmp")
  })
})
