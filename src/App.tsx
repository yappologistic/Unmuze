import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { relaunch } from "@tauri-apps/plugin-process"
import { check, type Update } from "@tauri-apps/plugin-updater"
import {
  AlertCircleIcon,
  ArrowUpRightIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileQuestionIcon,
  FolderIcon,
  HistoryIcon,
  ImageIcon,
  InfoIcon,
  LinkIcon,
  ListMusicIcon,
  MoonIcon,
  MusicIcon,
  SearchIcon,
  SettingsIcon,
  SquareIcon,
  SunIcon,
  RefreshCwIcon,
  WrenchIcon,
  VideoIcon,
  ScissorsIcon,
  CaptionsIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"
import { toast } from "sonner"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Select, SelectGroup, SelectItem } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import unmuzeIcon from "@/assets/unmuze-icon.png"
import {
  canTransitionDownload,
  clampPlaylistConcurrency,
  defaultSettings,
  detectPlatform,
  defaultForPlatform,
  estimatedFileType,
  formatDetailLabel,
  formatDetailSummary,
  formatDetailsForMode,
  formatDuration,
  normalizePresetForMode,
  normalizePlatformDefault,
  normalizePlatformDefaults,
  type DownloadItem,
  type DownloadMode,
  type DownloadPreset,
  type HistoryItem,
  type Inspection,
  isLikelyPlaylistUrl,
  platformLabel,
  type PlatformWithDefaults,
  type PlaylistEntry,
  type PlaylistInspection,
  presetDetails,
  presetOptionsForMode,
  sanitizeFilename,
  type Settings,
  type ToolStatus,
  validateMediaUrl,
} from "@/lib/media"
import {
  cancelDownload,
  checkPaths,
  chooseFolder,
  getToolStatus,
  inspectMedia,
  inspectPlaylist,
  installManagedTools,
  loadHistory,
  loadSettings,
  onDownloadFinished,
  onDownloadProgress,
  revealPath,
  saveHistory,
  saveSettings,
  startDownload,
} from "@/lib/tauri"

type PendingDownload = {
  id: string
  request: Record<string, unknown>
}

function playlistEntryKey(entry: PlaylistEntry) {
  return `${entry.index}:${entry.id}`
}

function parentFolderFromPath(path: string) {
  const normalized = path.trim().replace(/[\\/]+$/, "")
  const lastSeparator = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"))
  return lastSeparator > 0 ? normalized.slice(0, lastSeparator) : ""
}

function joinOutputDirPreview(outputDir: string, folderName: string) {
  if (!outputDir || !folderName) return outputDir
  const separator = outputDir.includes("/") && !outputDir.includes("\\") ? "/" : "\\"
  return `${outputDir.replace(/[\\/]+$/, "")}${separator}${folderName}`
}

async function copyTextToClipboard(value: string, successMessage: string, errorMessage: string) {
  try {
    await navigator.clipboard.writeText(value)
    toast.success(successMessage)
  } catch {
    toast.error(errorMessage)
  }
}

const navigationItems = [
  { value: "download", label: "Download", shortLabel: "Download", icon: LinkIcon, accent: "accent-blue" },
  { value: "playlist", label: "Playlist", shortLabel: "Playlist", icon: ListMusicIcon, accent: "accent-violet" },
  { value: "history", label: "Library", shortLabel: "Library", icon: HistoryIcon, accent: "accent-mint" },
  { value: "settings", label: "Settings", shortLabel: "Settings", icon: SettingsIcon, accent: "accent-orange" },
  { value: "help", label: "Help", shortLabel: "Help", icon: InfoIcon, accent: "text-muted-foreground" },
] as const

function App() {
  const [tab, setTab] = useState("download")
  const [url, setUrl] = useState("")
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState("")
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [toolStatus, setToolStatus] = useState<ToolStatus | null>(null)
  const [toolsLoading, setToolsLoading] = useState(false)
  const [toolsInstalling, setToolsInstalling] = useState(false)
  const [appVersion, setAppVersion] = useState("")
  const [updateChecking, setUpdateChecking] = useState(false)
  const [updateChecked, setUpdateChecked] = useState(false)
  const [updateInstalling, setUpdateInstalling] = useState(false)
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateMessage, setUpdateMessage] = useState("")
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [pathStatus, setPathStatus] = useState<Record<string, boolean>>({})
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [mode, setMode] = useState<DownloadMode>("audio")
  const [quality, setQuality] = useState<DownloadPreset>("best")
  const [selectedFormatId, setSelectedFormatId] = useState("")
  const [splitChapters, setSplitChapters] = useState(false)
  const [saveSubtitles, setSaveSubtitles] = useState(false)
  const [subtitleLanguage, setSubtitleLanguage] = useState("en")
  const [outputDir, setOutputDir] = useState("")
  const [outputDirError, setOutputDirError] = useState("")
  const [fileName, setFileName] = useState("")
  const [playlistUrl, setPlaylistUrl] = useState("")
  const [playlistInspection, setPlaylistInspection] = useState<PlaylistInspection | null>(null)
  const [playlistChecking, setPlaylistChecking] = useState(false)
  const [playlistError, setPlaylistError] = useState("")
  const [playlistMode, setPlaylistMode] = useState<DownloadMode>("audio")
  const [playlistQuality, setPlaylistQuality] = useState<DownloadPreset>("best")
  const [playlistSplitChapters, setPlaylistSplitChapters] = useState(false)
  const [playlistSaveSubtitles, setPlaylistSaveSubtitles] = useState(false)
  const [playlistSubtitleLanguage, setPlaylistSubtitleLanguage] = useState("en")
  const [playlistOutputDir, setPlaylistOutputDir] = useState("")
  const [playlistOutputDirError, setPlaylistOutputDirError] = useState("")
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set())
  const playlistQueueRef = useRef<PendingDownload[]>([])
  const activePlaylistDownloadIdsRef = useRef<Set<string>>(new Set())
  const playlistDownloadIdsRef = useRef<Set<string>>(new Set())
  const cancelledQueuedIdsRef = useRef<Set<string>>(new Set())
  const contentScrollRef = useRef<HTMLDivElement>(null)
  const mediaToolsNotificationShownRef = useRef(false)

  useEffect(() => {
    loadSettings()
      .then((loaded) => {
        const normalized = {
          ...loaded,
          platformDefaults: normalizePlatformDefaults(loaded.platformDefaults, loaded.defaultFormat, loaded.defaultQuality),
        }
        setSettings(normalized)
        setMode(normalized.defaultFormat)
        setPlaylistMode(normalized.defaultFormat)
        setQuality(normalizePresetForMode(normalized.defaultQuality, normalized.defaultFormat))
        setPlaylistQuality(normalizePresetForMode(normalized.defaultQuality, normalized.defaultFormat))
        setOutputDir(loaded.defaultOutputFolder)
        setPlaylistOutputDir(loaded.defaultOutputFolder)
      })
      .catch(() => setSettings(defaultSettings))
    loadHistory().then(setHistory).catch(() => setHistory([]))
    refreshToolStatus()
    getVersion().then(setAppVersion).catch(() => setAppVersion(""))
  }, [])

  useEffect(() => {
    const paths = Array.from(new Set(history.map((item) => item.path).filter(Boolean)))
    if (paths.length === 0) {
      setPathStatus({})
      return
    }
    let cancelled = false
    checkPaths(paths)
      .then((status) => {
        if (!cancelled) setPathStatus(status)
      })
      .catch(() => {
        if (!cancelled) setPathStatus({})
      })
    return () => {
      cancelled = true
    }
  }, [history])

  useEffect(() => {
    const root = document.documentElement
    const applyTheme = () => {
      root.classList.remove("light", "dark")
      if (settings.theme === "system") {
        const dark = window.matchMedia("(prefers-color-scheme: dark)").matches
        root.classList.add(dark ? "dark" : "light")
      } else {
        root.classList.add(settings.theme)
      }
    }
    applyTheme()
    if (settings.theme !== "system") return
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    media.addEventListener("change", applyTheme)
    return () => media.removeEventListener("change", applyTheme)
  }, [settings.theme])

  useEffect(() => {
    contentScrollRef.current?.scrollTo({ top: 0, left: 0 })
    window.scrollTo({ top: 0, left: 0 })
  }, [tab])

  useEffect(() => {
    if (!toolStatus || toolStatus.ready || mediaToolsNotificationShownRef.current) return
    mediaToolsNotificationShownRef.current = true
    toast.warning("Media tools need attention.", {
      description: "Open Settings to install or refresh managed media tools before downloading.",
    })
  }, [toolStatus])

  const playlistConcurrency = clampPlaylistConcurrency(settings.playlistConcurrency)
  const startNextPlaylistDownload = useCallback(() => {
    while (activePlaylistDownloadIdsRef.current.size < playlistConcurrency) {
      const next = playlistQueueRef.current.shift()
      if (!next) return
      if (cancelledQueuedIdsRef.current.has(next.id)) {
        cancelledQueuedIdsRef.current.delete(next.id)
        continue
      }
      activePlaylistDownloadIdsRef.current.add(next.id)
      setDownloads((items) =>
        items.map((item) =>
          item.id === next.id
            ? { ...item, status: "downloading", message: "Starting playlist item." }
            : item,
        ),
      )
      startDownload(next.request)
        .then((path) => {
          setDownloads((items) => items.map((item) => (item.id === next.id ? { ...item, path } : item)))
        })
        .catch((err) => {
          activePlaylistDownloadIdsRef.current.delete(next.id)
          setDownloads((items) =>
            items.map((item) =>
              item.id === next.id
                ? { ...item, status: "failed", message: readableError(err) }
                : item,
            ),
          )
          window.setTimeout(startNextPlaylistDownload, 0)
      })
    }
  }, [playlistConcurrency])

  useEffect(() => {
    startNextPlaylistDownload()
  }, [startNextPlaylistDownload])

  useEffect(() => {
    const disposers: Array<() => void> = []
    onDownloadProgress((payload) => {
      setDownloads((items) =>
        items.map((item) => {
          if (item.id !== payload.id) return item
          if (["completed", "failed", "cancelled"].includes(item.status)) return item
          const percent = payload.line.match(/(\d+(?:\.\d+)?)%/)
          const progress = percent ? Number(percent[1]) : item.progress
          const converting = payload.line.toLowerCase().includes("ffmpeg") || payload.line.toLowerCase().includes("converting")
          return {
            ...item,
            progress,
            status: converting && canTransitionDownload(item.status, "converting") ? "converting" : item.status,
            message: payload.line.slice(0, 160),
          }
        }),
      )
    }).then((dispose) => disposers.push(dispose))
    onDownloadFinished((payload) => {
      const isPlaylistQueued = playlistDownloadIdsRef.current.has(payload.id)
      setDownloads((items) =>
        items.map((item) => {
          if (item.id !== payload.id) return item
          if (item.status === "cancelled") return item
          const status = payload.status
          if (status === "completed" && settings.keepHistory) {
            const completed: HistoryItem = {
              id: item.id,
              url: item.url,
              title: item.title,
              creator: item.creator,
              thumbnail: item.thumbnail,
              duration: item.duration,
              platform: item.platform,
              path: payload.path,
              mode: item.mode,
              quality: item.quality,
              fileName: item.fileName,
              outputDir: item.outputDir,
              selectedFormatId: item.selectedFormatId,
              playlistTitle: item.playlistTitle,
              playlistIndex: item.playlistIndex,
              playlistTotal: item.playlistTotal,
              completedAt: new Date().toISOString(),
            }
            setHistory((current) => {
              const next = [completed, ...current].slice(0, 100)
              saveHistory(next).catch(() => undefined)
              return next
            })
          }
          return { ...item, status, progress: status === "completed" ? 100 : item.progress, path: payload.path, message: status === "completed" ? "Saved locally." : "Download failed." }
        }),
      )
      if (isPlaylistQueued) {
        activePlaylistDownloadIdsRef.current.delete(payload.id)
        window.setTimeout(startNextPlaylistDownload, 0)
      }
    }).then((dispose) => disposers.push(dispose))
    return () => disposers.forEach((dispose) => dispose())
  }, [settings.keepHistory, startNextPlaylistDownload])

  const platform = useMemo(() => detectPlatform(url), [url])
  const urlValidation = useMemo(() => (url.trim() ? validateMediaUrl(url) : null), [url])
  const playlistValidation = useMemo(() => (playlistUrl.trim() ? validateMediaUrl(playlistUrl) : null), [playlistUrl])
  const activeDownloads = downloads.filter((item) => ["waiting", "downloading", "converting"].includes(item.status)).length
  const completedDownloads = downloads.filter((item) => item.status === "completed").length

  async function handleInspect() {
    setError("")
    setInspection(null)
    const validation = validateMediaUrl(url)
    if (!validation.valid) {
      setError(validation.message)
      return
    }
    setChecking(true)
    try {
      const result = await inspectMedia(validation.url.toString())
      setInspection(result)
      const preferred = defaultForPlatform(settings, result.platform)
      const nextMode = result.formats.includes(preferred.mode) ? preferred.mode : "audio"
      setMode(nextMode)
      setQuality(normalizePresetForMode(preferred.quality, nextMode))
      setSelectedFormatId("")
      if (nextMode === "audio") setSaveSubtitles(false)
      setFileName(sanitizeFilename(result.suggestedFileName || result.title || "download"))
      if (!result.downloadable && result.limitation) {
        setError(result.limitation)
      }
    } catch (err) {
      setError(readableError(err))
    } finally {
      setChecking(false)
    }
  }

  async function handleSaveSettings(next: Settings) {
    setSettings(next)
    try {
      await saveSettings(next)
    } catch {
      toast.error("Settings could not be saved.")
    }
  }

  async function refreshToolStatus() {
    setToolsLoading(true)
    try {
      setToolStatus(await getToolStatus())
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setToolsLoading(false)
    }
  }

  async function handleInstallManagedTools() {
    setToolsInstalling(true)
    try {
      setToolStatus(await installManagedTools())
      toast.success("Managed media tools installed.")
    } catch (err) {
      toast.error(readableError(err))
    } finally {
      setToolsInstalling(false)
    }
  }

  async function handleCheckForUpdate() {
    setUpdateChecking(true)
    setUpdateChecked(false)
    setUpdateProgress(0)
    setUpdateMessage("")
    try {
      const update = await check({ timeout: 30000 })
      setAvailableUpdate(update)
      setUpdateChecked(true)
      setUpdateMessage(update ? `Version ${update.version} is available.` : "Unmuze is up to date.")
    } catch (err) {
      setAvailableUpdate(null)
      setUpdateMessage(readableError(err))
      toast.error("Update check failed.")
    } finally {
      setUpdateChecking(false)
    }
  }

  async function handleInstallUpdate() {
    if (!availableUpdate) return
    setUpdateInstalling(true)
    setUpdateProgress(0)
    setUpdateMessage(`Downloading Unmuze ${availableUpdate.version}.`)
    let downloaded = 0
    let contentLength = 0
    try {
      await availableUpdate.downloadAndInstall((event) => {
        if (event.event === "Started") {
          downloaded = 0
          contentLength = event.data.contentLength || 0
          setUpdateProgress(0)
          setUpdateMessage("Downloading update.")
        }
        if (event.event === "Progress") {
          downloaded += event.data.chunkLength
          if (contentLength > 0) setUpdateProgress(Math.round((downloaded / contentLength) * 100))
        }
        if (event.event === "Finished") {
          setUpdateProgress(100)
          setUpdateMessage("Update installed. Restarting Unmuze.")
        }
      })
      await relaunch()
    } catch (err) {
      setUpdateMessage(readableError(err))
      toast.error("Update install failed.")
    } finally {
      setUpdateInstalling(false)
    }
  }

  async function handleChooseFolder() {
    const selected = await chooseFolder()
    if (selected) {
      setOutputDir(selected)
      setOutputDirError("")
    }
  }

  async function handleChoosePlaylistFolder() {
    const selected = await chooseFolder()
    if (selected) {
      setPlaylistOutputDir(selected)
      setPlaylistOutputDirError("")
    }
  }

  async function handleInspectPlaylist() {
    setPlaylistError("")
    setPlaylistInspection(null)
    setSelectedPlaylistIds(new Set())
    const validation = validateMediaUrl(playlistUrl)
    if (!validation.valid) {
      setPlaylistError(validation.message)
      return
    }
    setPlaylistChecking(true)
    try {
      const result = await inspectPlaylist(validation.url.toString())
      setPlaylistInspection(result)
      const preferred = defaultForPlatform(settings, result.platform)
      const nextMode = result.platform === "soundCloud" ? "audio" : preferred.mode
      setPlaylistMode(nextMode)
      setPlaylistQuality(normalizePresetForMode(preferred.quality, nextMode))
      if (nextMode === "audio") setPlaylistSaveSubtitles(false)
      if (result.downloadable) {
        setSelectedPlaylistIds(new Set(result.entries.map(playlistEntryKey)))
      }
      if (!result.downloadable && result.limitation) {
        setPlaylistError(result.limitation)
      }
    } catch (err) {
      setPlaylistError(readableError(err))
    } finally {
      setPlaylistChecking(false)
    }
  }

  function togglePlaylistEntry(id: string, checked: boolean) {
    setSelectedPlaylistIds((current) => {
      const next = new Set(current)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  function setAllPlaylistEntries(checked: boolean) {
    if (!playlistInspection) return
    setSelectedPlaylistIds(checked ? new Set(playlistInspection.entries.map(playlistEntryKey)) : new Set())
  }

  async function handleStartPlaylistDownload() {
    if (!playlistInspection?.downloadable) return
    if (!playlistOutputDir.trim()) {
      setPlaylistOutputDirError("Choose an output folder before saving selected playlist items.")
      toast.error("Choose an output folder first.")
      return
    }
    setPlaylistOutputDirError("")
    const selectedEntries = playlistInspection.entries.filter((entry) => selectedPlaylistIds.has(playlistEntryKey(entry)))
    if (selectedEntries.length === 0) {
      toast.error("Select at least one playlist item.")
      return
    }
    const total = selectedEntries.length
    const playlistTitle = playlistInspection.title || "Playlist"
    const playlistFolderName = settings.playlistFolderMode ? sanitizeFilename(playlistTitle) : ""
    const playlistTargetDir = playlistFolderName ? joinOutputDirPreview(playlistOutputDir, playlistFolderName) : playlistOutputDir
    const queuedItems = selectedEntries.map((entry, position) => {
      const id = crypto.randomUUID()
      const numberedName = `${String(position + 1).padStart(2, "0")} - ${sanitizeFilename(entry.title)}`
      const item: DownloadItem = {
        id,
        url: entry.url,
        title: entry.title,
        creator: entry.creator,
        thumbnail: entry.thumbnail,
        duration: entry.duration,
        platform: playlistInspection.platform,
        mode: playlistMode,
        quality: playlistQuality,
        outputDir: playlistTargetDir,
        fileName: numberedName,
        status: "waiting",
        progress: 0,
        message: "Waiting in playlist queue.",
        splitChapters: playlistSplitChapters,
        saveSubtitles: playlistMode === "video" && playlistSaveSubtitles,
        subtitleLanguage: playlistSubtitleLanguage,
        playlistTitle,
        playlistIndex: position + 1,
        playlistTotal: total,
      }
      const request: PendingDownload = {
        id,
        request: {
          id,
          url: entry.url,
          mode: playlistMode,
          quality: playlistQuality,
          outputDir: playlistOutputDir,
          playlistFolderName: playlistFolderName || undefined,
          fileName: numberedName,
          splitChapters: playlistSplitChapters,
          saveSubtitles: playlistMode === "video" && playlistSaveSubtitles,
          subtitleLanguage: playlistSubtitleLanguage,
        },
      }
      return { item, request }
    })
    queuedItems.forEach(({ item, request }) => {
      playlistDownloadIdsRef.current.add(item.id)
      playlistQueueRef.current.push(request)
    })
    setDownloads((items) => [...queuedItems.map(({ item }) => item), ...items])
    startNextPlaylistDownload()
    toast.success(`Queued ${queuedItems.length} playlist item${queuedItems.length === 1 ? "" : "s"} with up to ${playlistConcurrency} running at once.`)
  }

  async function handleStartDownload() {
    if (!inspection?.downloadable) return
    if (!outputDir.trim()) {
      setOutputDirError("Choose an output folder before saving.")
      toast.error("Choose an output folder first.")
      return
    }
    setOutputDirError("")
    const id = crypto.randomUUID()
    const item: DownloadItem = {
      id,
      url,
      title: inspection.title || "Untitled media",
      creator: inspection.creator,
      thumbnail: inspection.thumbnail,
      duration: inspection.duration,
      platform: inspection.platform,
      mode,
      quality,
      outputDir,
      fileName: sanitizeFilename(fileName || inspection.title || "download"),
      status: "downloading",
      progress: 0,
      message: "Starting download.",
      splitChapters,
      saveSubtitles: mode === "video" && saveSubtitles,
      subtitleLanguage,
      selectedFormatId: selectedFormatId || undefined,
    }
    setDownloads((items) => [item, ...items])
    try {
      const path = await startDownload({
        id,
        url,
        mode,
        quality,
        outputDir,
        fileName: item.fileName,
        splitChapters,
        saveSubtitles: mode === "video" && saveSubtitles,
        subtitleLanguage,
        selectedFormatId: selectedFormatId || undefined,
      })
      setDownloads((items) => items.map((download) => (download.id === id ? { ...download, path } : download)))
      toast.success("Download started.")
    } catch (err) {
      setDownloads((items) => items.map((download) => (download.id === id ? { ...download, status: "failed", message: readableError(err) } : download)))
      toast.error(readableError(err))
    }
  }

  async function handleCancel(id: string) {
    cancelledQueuedIdsRef.current.add(id)
    playlistQueueRef.current = playlistQueueRef.current.filter((item) => item.id !== id)
    await cancelDownload(id).catch(() => undefined)
    setDownloads((items) => items.map((item) => (item.id === id ? { ...item, status: "cancelled", message: "Cancelled by user." } : item)))
    if (!activePlaylistDownloadIdsRef.current.has(id)) startNextPlaylistDownload()
  }

  return (
    <div className="app-backdrop text-foreground">
      <Toaster />
      <div className="app-shell flex w-full">
        <DesktopSidebar
          tab={tab}
          setTab={setTab}
          activeDownloads={activeDownloads}
          completedDownloads={completedDownloads}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MobileHeader tab={tab} setTab={setTab} />

          <div ref={contentScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
            <Tabs value={tab} onValueChange={setTab} className="gap-0">
              <TabsContent value="download">
                <DownloadScreen
                  url={url}
                  setUrl={setUrl}
                  platform={platform}
                  validationMessage={urlValidation && !urlValidation.valid ? urlValidation.message : ""}
                  checking={checking}
                  error={error}
                  inspection={inspection}
                  toolStatus={toolStatus}
                  mode={mode}
                  setMode={setMode}
                  quality={quality}
                  setQuality={setQuality}
                  selectedFormatId={selectedFormatId}
                  setSelectedFormatId={setSelectedFormatId}
                  splitChapters={splitChapters}
                  setSplitChapters={setSplitChapters}
                  saveSubtitles={saveSubtitles}
                  setSaveSubtitles={setSaveSubtitles}
                  subtitleLanguage={subtitleLanguage}
                  setSubtitleLanguage={setSubtitleLanguage}
                  outputDir={outputDir}
                  setOutputDir={(value) => {
                    setOutputDir(value)
                    if (value.trim()) setOutputDirError("")
                  }}
                  outputDirError={outputDirError}
                  fileName={fileName}
                  setFileName={setFileName}
                  downloads={downloads}
                  onInspect={handleInspect}
                  onChooseFolder={handleChooseFolder}
                  onStartDownload={handleStartDownload}
                  onCancel={handleCancel}
                  onOpenSettings={() => setTab("settings")}
                />
              </TabsContent>
              <TabsContent value="playlist">
                <PlaylistScreen
                  url={playlistUrl}
                  setUrl={setPlaylistUrl}
                  platform={detectPlatform(playlistUrl)}
                  validationMessage={playlistValidation && !playlistValidation.valid ? playlistValidation.message : ""}
                  checking={playlistChecking}
                  error={playlistError}
                  inspection={playlistInspection}
                  toolStatus={toolStatus}
                  selectedIds={selectedPlaylistIds}
                  mode={playlistMode}
                  setMode={setPlaylistMode}
                  quality={playlistQuality}
                  setQuality={setPlaylistQuality}
                  concurrency={playlistConcurrency}
                  playlistFolderMode={settings.playlistFolderMode}
                  onPlaylistFolderModeChange={(playlistFolderMode) => handleSaveSettings({ ...settings, playlistFolderMode })}
                  splitChapters={playlistSplitChapters}
                  setSplitChapters={setPlaylistSplitChapters}
                  saveSubtitles={playlistSaveSubtitles}
                  setSaveSubtitles={setPlaylistSaveSubtitles}
                  subtitleLanguage={playlistSubtitleLanguage}
                  setSubtitleLanguage={setPlaylistSubtitleLanguage}
                  outputDir={playlistOutputDir}
                  setOutputDir={(value) => {
                    setPlaylistOutputDir(value)
                    if (value.trim()) setPlaylistOutputDirError("")
                  }}
                  outputDirError={playlistOutputDirError}
                  downloads={downloads}
                  onInspect={handleInspectPlaylist}
                  onChooseFolder={handleChoosePlaylistFolder}
                  onToggleEntry={togglePlaylistEntry}
                  onToggleAll={setAllPlaylistEntries}
                  onStartDownload={handleStartPlaylistDownload}
                  onCancel={handleCancel}
                  onOpenSettings={() => setTab("settings")}
                />
              </TabsContent>
              <TabsContent value="history">
                <LibraryScreen
                  history={history}
                  pathStatus={pathStatus}
                  setHistory={setHistory}
                  onUseSource={(item) => {
                    if (!item.url) return
                    setUrl(item.url)
                    setTab("download")
                  }}
                />
              </TabsContent>
              <TabsContent value="settings">
                <SettingsScreen
                  settings={settings}
                  toolStatus={toolStatus}
                  toolsLoading={toolsLoading}
                  toolsInstalling={toolsInstalling}
                  appVersion={appVersion}
                  updateChecking={updateChecking}
                  updateChecked={updateChecked}
                  updateInstalling={updateInstalling}
                  availableUpdate={availableUpdate}
                  updateProgress={updateProgress}
                  updateMessage={updateMessage}
                  onSave={handleSaveSettings}
                  onRefreshTools={refreshToolStatus}
                  onInstallTools={handleInstallManagedTools}
                  onCheckForUpdate={handleCheckForUpdate}
                  onInstallUpdate={handleInstallUpdate}
                />
              </TabsContent>
              <TabsContent value="help">
                <HelpScreen />
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </div>
  )
}

function DesktopSidebar({
  tab,
  setTab,
  activeDownloads,
  completedDownloads,
}: {
  tab: string
  setTab: (value: string) => void
  activeDownloads: number
  completedDownloads: number
}) {
  return (
    <aside className="hidden w-[300px] shrink-0 border-r bg-panel/70 p-5 lg:flex lg:flex-col lg:gap-5">
      <div className="flex items-center gap-3 rounded-2xl p-2">
        <div className="size-12 overflow-hidden rounded-2xl bg-primary shadow-lg">
          <img className="size-full object-cover" src={unmuzeIcon} alt="" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight tracking-normal">Unmuze</h1>
          <p className="text-sm font-semibold text-muted-foreground">Save Workbench</p>
        </div>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-1 gap-1 bg-transparent p-0 text-muted-foreground">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = tab === item.value
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className="group relative h-12 justify-start border border-transparent px-4 pl-5 text-[15px] data-[state=active]:border-border data-[state=active]:shadow-sm"
              >
                <span
                  aria-hidden="true"
                  className={`absolute left-2 h-6 w-1 rounded-full bg-current transition-opacity ${isActive ? "opacity-100" : "opacity-0"} ${item.accent}`}
                />
                <Icon className={item.accent} data-icon="inline-start" />
                <span className="flex-1 text-left">{item.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      <div className="soft-panel grid gap-3 rounded-2xl p-4">
        <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Session</span>
        <div className="grid grid-cols-2 gap-2">
          <MetricTile label="Active" value={activeDownloads} tone="blue" />
          <MetricTile label="Saved" value={completedDownloads} tone="mint" />
        </div>
      </div>
    </aside>
  )
}

function MobileHeader({ tab, setTab }: { tab: string; setTab: (value: string) => void }) {
  return (
    <header className="border-b bg-background/95 px-4 py-4 lg:hidden">
      <div className="mb-3 flex items-center gap-2 font-bold">
        <img className="size-8 rounded-xl object-cover" src={unmuzeIcon} alt="" />
        <span>Unmuze</span>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {navigationItems.map((item) => (
            <TabsTrigger key={item.value} value={item.value} className="shrink-0">
              {item.shortLabel}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
    </header>
  )
}

function MetricTile({ label, value, tone }: { label: string; value: number; tone: "blue" | "mint" }) {
  const toneClass = tone === "mint" ? "accent-mint" : "accent-blue"
  return (
    <div className="rounded-xl bg-card/60 p-3">
      <div className={`text-2xl font-bold ${toneClass}`}>{value}</div>
      <div className="text-xs font-semibold text-muted-foreground">{label}</div>
    </div>
  )
}

function ThemeSegmentedControl({
  value,
  onChange,
}: {
  value: Settings["theme"]
  onChange: (value: Settings["theme"]) => void
}) {
  const options: Array<{ value: Settings["theme"]; label: string; icon?: LucideIcon }> = [
    { value: "light", label: "Light", icon: SunIcon },
    { value: "dark", label: "Dark", icon: MoonIcon },
    { value: "system", label: "Auto" },
  ]
  return (
    <div className="soft-panel rounded-2xl p-1">
      <div className="grid grid-cols-3 gap-1">
        {options.map((option) => {
          const Icon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              className={`flex h-10 items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all ${
                value === option.value ? "selected-pill text-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => onChange(option.value)}
              aria-pressed={value === option.value}
            >
              {Icon ? <Icon className="size-4" /> : null}
              {option.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function DownloadScreen(props: {
  url: string
  setUrl: (value: string) => void
  platform: ReturnType<typeof detectPlatform>
  validationMessage: string
  checking: boolean
  error: string
  inspection: Inspection | null
  toolStatus: ToolStatus | null
  mode: DownloadMode
  setMode: (value: DownloadMode) => void
  quality: DownloadPreset
  setQuality: (value: DownloadPreset) => void
  selectedFormatId: string
  setSelectedFormatId: (value: string) => void
  splitChapters: boolean
  setSplitChapters: (value: boolean) => void
  saveSubtitles: boolean
  setSaveSubtitles: (value: boolean) => void
  subtitleLanguage: string
  setSubtitleLanguage: (value: string) => void
  outputDir: string
  setOutputDir: (value: string) => void
  outputDirError: string
  fileName: string
  setFileName: (value: string) => void
  downloads: DownloadItem[]
  onInspect: () => void
  onChooseFolder: () => void
  onStartDownload: () => void
  onCancel: (id: string) => void
  onOpenSettings: () => void
}) {
  const canDownload = Boolean(props.inspection?.downloadable && !props.checking)
  const canSaveSubtitles = canDownload && props.mode === "video"
  const presetOptions = presetOptionsForMode(props.mode)
  const selectedPreset = presetDetails(props.quality, props.mode)
  const formatDetails = formatDetailsForMode(props.inspection?.formatDetails, props.mode)
  const selectedFormat = formatDetails.find((detail) => detail.id === props.selectedFormatId)
  const changeMode = (nextMode: DownloadMode) => {
    props.setMode(nextMode)
    props.setQuality(normalizePresetForMode(props.quality, nextMode))
    props.setSelectedFormatId("")
    if (nextMode === "audio") props.setSaveSubtitles(false)
  }
  return (
    <div className="flex flex-col gap-6">
      <ToolNotice status={props.toolStatus} onOpenSettings={props.onOpenSettings} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card className="overflow-hidden">
          <CardHeader>
            <CardTitle className="text-lg">Media URL</CardTitle>
            <CardDescription>Supported: permitted public YouTube, SoundCloud, and individual TikTok video URLs. Spotify links are explained but not downloaded.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(props.validationMessage)}>
                <FieldLabel htmlFor="media-url">URL</FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input className="h-12 text-base" id="media-url" value={props.url} onChange={(event) => props.setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." aria-invalid={Boolean(props.validationMessage)} />
                  <Button className="h-12 px-5" onClick={props.onInspect} disabled={props.checking || !props.url.trim()}>
                    {props.checking ? <Spinner /> : <SearchIcon data-icon="inline-start" />}
                    Check
                  </Button>
                </div>
                <FieldDescription>{props.validationMessage || `Detected: ${platformLabel(props.platform)}`}</FieldDescription>
              </Field>
              {props.error ? (
                <Alert variant={props.inspection?.platform === "spotify" ? "default" : "destructive"}>
                  <AlertCircleIcon data-icon="inline-start" />
                  <AlertTitle>{props.inspection?.platform === "spotify" ? "Protected platform" : "Needs attention"}</AlertTitle>
                  <AlertDescription>{props.error}</AlertDescription>
                </Alert>
              ) : null}
              {props.checking ? <InspectionSkeleton /> : props.inspection ? <InspectionCard inspection={props.inspection} /> : null}
            </FieldGroup>
          </CardContent>
        </Card>
        <Card className="xl:sticky xl:top-6 xl:self-start">
          <CardHeader>
            <CardTitle className="text-lg">Save options</CardTitle>
            <CardDescription>Invalid combinations are disabled automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Format</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-12" variant={props.mode === "audio" ? "default" : "outline"} onClick={() => changeMode("audio")} disabled={!canDownload}>
                    <MusicIcon data-icon="inline-start" />Audio
                  </Button>
                  <Button className="h-12" variant={props.mode === "video" ? "default" : "outline"} onClick={() => changeMode("video")} disabled={!canDownload || !props.inspection?.formats.includes("video")}>
                    <VideoIcon data-icon="inline-start" />Video
                  </Button>
                </div>
              </Field>
              <Field>
                <FieldLabel htmlFor="download-preset">Preset</FieldLabel>
                <Select
                  id="download-preset"
                  value={props.quality}
                  onValueChange={(value) => {
                    props.setQuality(normalizePresetForMode(value, props.mode))
                    props.setSelectedFormatId("")
                  }}
                  disabled={!canDownload}
                >
                  <SelectGroup>
                    {presetOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </Select>
                <FieldDescription>{selectedPreset.description}</FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="download-source-format">Advanced source format</FieldLabel>
                <Select id="download-source-format" value={props.selectedFormatId || "preset"} onValueChange={(value) => props.setSelectedFormatId(value === "preset" ? "" : value)} disabled={!canDownload || formatDetails.length === 0}>
                  <SelectGroup>
                    <SelectItem value="preset">Use preset selection</SelectItem>
                    {formatDetails.map((detail) => (
                      <SelectItem key={detail.id} value={detail.id}>{formatDetailLabel(detail)}</SelectItem>
                    ))}
                  </SelectGroup>
                </Select>
                <FieldDescription>
                  {formatDetails.length
                    ? props.selectedFormatId
                      ? `${formatDetailSummary(selectedFormat)} Output preset still applies: ${estimatedFileType(props.quality, props.mode)}.`
                      : formatDetailSummary(selectedFormat)
                    : "Inspect a downloadable URL to see source formats, codecs, bitrate, fps, and container details."}
                </FieldDescription>
              </Field>
              <Field data-invalid={Boolean(props.outputDirError)}>
                <FieldLabel htmlFor="output-folder">Output folder</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="output-folder"
                    value={props.outputDir}
                    onChange={(event) => props.setOutputDir(event.target.value)}
                    placeholder="Choose a folder"
                    aria-invalid={Boolean(props.outputDirError)}
                    aria-describedby={props.outputDirError ? "output-folder-error" : undefined}
                  />
                  <Button variant="outline" size="icon" onClick={props.onChooseFolder} aria-label="Choose folder"><FolderIcon /></Button>
                </div>
                {props.outputDirError ? <FieldDescription id="output-folder-error" className="text-destructive">{props.outputDirError}</FieldDescription> : null}
              </Field>
              <Field>
                <FieldLabel htmlFor="file-name">File name</FieldLabel>
                <Input id="file-name" value={props.fileName} onChange={(event) => props.setFileName(sanitizeFilename(event.target.value))} placeholder="download" disabled={!canDownload} />
                <FieldDescription>Output type: {estimatedFileType(props.quality, props.mode)}. Metadata and artwork are embedded when supported.</FieldDescription>
              </Field>
              <DownloadAdvancedOptions
                canDownload={canDownload}
                canSaveSubtitles={canSaveSubtitles}
                splitChapters={props.splitChapters}
                setSplitChapters={props.setSplitChapters}
                saveSubtitles={props.saveSubtitles}
                setSaveSubtitles={props.setSaveSubtitles}
                subtitleLanguage={props.subtitleLanguage}
                setSubtitleLanguage={props.setSubtitleLanguage}
              />
              <Button className="h-12 w-full text-base" size="lg" onClick={props.onStartDownload} disabled={!canDownload}>
                <DownloadIcon data-icon="inline-start" />
                Save locally
              </Button>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
      <DownloadManager downloads={props.downloads} onCancel={props.onCancel} />
    </div>
  )
}

function PlaylistScreen(props: {
  url: string
  setUrl: (value: string) => void
  platform: ReturnType<typeof detectPlatform>
  validationMessage: string
  checking: boolean
  error: string
  inspection: PlaylistInspection | null
  toolStatus: ToolStatus | null
  selectedIds: Set<string>
  mode: DownloadMode
  setMode: (value: DownloadMode) => void
  quality: DownloadPreset
  setQuality: (value: DownloadPreset) => void
  concurrency: number
  playlistFolderMode: boolean
  onPlaylistFolderModeChange: (value: boolean) => void
  splitChapters: boolean
  setSplitChapters: (value: boolean) => void
  saveSubtitles: boolean
  setSaveSubtitles: (value: boolean) => void
  subtitleLanguage: string
  setSubtitleLanguage: (value: string) => void
  outputDir: string
  setOutputDir: (value: string) => void
  outputDirError: string
  downloads: DownloadItem[]
  onInspect: () => void
  onChooseFolder: () => void
  onToggleEntry: (id: string, checked: boolean) => void
  onToggleAll: (checked: boolean) => void
  onStartDownload: () => void
  onCancel: (id: string) => void
  onOpenSettings: () => void
}) {
  const canDownload = Boolean(props.inspection?.downloadable && props.selectedIds.size > 0 && !props.checking)
  const canUseVideo = props.inspection?.platform === "youTube"
  const canSaveSubtitles = Boolean(props.inspection?.downloadable && props.mode === "video")
  const presetOptions = presetOptionsForMode(props.mode)
  const selectedPreset = presetDetails(props.quality, props.mode)
  const changeMode = (nextMode: DownloadMode) => {
    props.setMode(nextMode)
    props.setQuality(normalizePresetForMode(props.quality, nextMode))
    if (nextMode === "audio") props.setSaveSubtitles(false)
  }
  const playlistHint = props.url.trim()
    ? props.validationMessage || (!isLikelyPlaylistUrl(props.url) ? `Detected: ${platformLabel(props.platform)}. Playlist mode supports YouTube playlists and SoundCloud sets only.` : `Detected: ${platformLabel(props.platform)}`)
    : "Paste a YouTube playlist or SoundCloud set URL to begin."
  const playlistFolderName = props.inspection?.title ? sanitizeFilename(props.inspection.title) : "Playlist"
  const playlistFolderDescription = props.inspection?.downloadable
    ? props.playlistFolderMode
      ? `Creates "${playlistFolderName}" inside the selected output folder.`
      : "Selected items will save directly into the output folder."
    : "Inspect a playlist to use its title as the folder name."
  const playlistDownloads = props.downloads.filter((item) => item.playlistTitle)
  return (
    <div className="flex flex-col gap-6">
      <ToolNotice status={props.toolStatus} onOpenSettings={props.onOpenSettings} />
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Playlist URL</CardTitle>
            <CardDescription>Supported: public YouTube playlists and SoundCloud sets available to local yt-dlp.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(props.validationMessage)}>
                <FieldLabel htmlFor="playlist-url">URL</FieldLabel>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input className="h-12 text-base" id="playlist-url" value={props.url} onChange={(event) => props.setUrl(event.target.value)} placeholder="https://www.youtube.com/playlist?list=..." aria-invalid={Boolean(props.validationMessage)} />
                  <Button className="h-12 px-5" onClick={props.onInspect} disabled={props.checking || !props.url.trim()}>
                    {props.checking ? <Spinner /> : <SearchIcon data-icon="inline-start" />}
                    Check
                  </Button>
                </div>
                <FieldDescription>{playlistHint}</FieldDescription>
              </Field>
              {props.error ? (
                <Alert variant={props.inspection?.platform === "spotify" ? "default" : "destructive"}>
                  <AlertCircleIcon data-icon="inline-start" />
                  <AlertTitle>{props.inspection?.platform === "spotify" ? "Protected platform" : "Needs attention"}</AlertTitle>
                  <AlertDescription>{props.error}</AlertDescription>
                </Alert>
              ) : null}
              {props.checking ? <InspectionSkeleton /> : props.inspection ? <PlaylistSummary inspection={props.inspection} selectedCount={props.selectedIds.size} onToggleAll={props.onToggleAll} /> : null}
            </FieldGroup>
          </CardContent>
        </Card>
        <Card className="xl:sticky xl:top-6 xl:self-start">
          <CardHeader>
            <CardTitle className="text-lg">Playlist options</CardTitle>
            <CardDescription>Each selected item is saved as its own file. Up to {props.concurrency} can run at once.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Format</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <Button className="h-12" variant={props.mode === "audio" ? "default" : "outline"} onClick={() => changeMode("audio")} disabled={!props.inspection?.downloadable}>
                    <MusicIcon data-icon="inline-start" />Audio
                  </Button>
                  <Button className="h-12" variant={props.mode === "video" ? "default" : "outline"} onClick={() => changeMode("video")} disabled={!props.inspection?.downloadable || !canUseVideo}>
                    <VideoIcon data-icon="inline-start" />Video
                  </Button>
                </div>
                <FieldDescription>
                  {props.inspection
                    ? canUseVideo
                      ? "YouTube playlists can be saved as audio or video."
                      : props.inspection.platform === "soundCloud"
                        ? "SoundCloud playlists are audio only."
                        : "TikTok is supported in Download mode for individual public videos."
                    : "Video becomes available after inspecting a YouTube playlist."}
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor="playlist-preset">Preset</FieldLabel>
                <Select id="playlist-preset" value={props.quality} onValueChange={(value) => props.setQuality(normalizePresetForMode(value, props.mode))} disabled={!props.inspection?.downloadable}>
                  <SelectGroup>
                    {presetOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectGroup>
                </Select>
                <FieldDescription>{selectedPreset.description}. Saves as {estimatedFileType(props.quality, props.mode)}.</FieldDescription>
              </Field>
              <Field data-invalid={Boolean(props.outputDirError)}>
                <FieldLabel htmlFor="playlist-output-folder">Output folder</FieldLabel>
                <div className="flex gap-2">
                  <Input
                    id="playlist-output-folder"
                    value={props.outputDir}
                    onChange={(event) => props.setOutputDir(event.target.value)}
                    placeholder="Choose a folder"
                    aria-invalid={Boolean(props.outputDirError)}
                    aria-describedby={props.outputDirError ? "playlist-output-folder-error" : undefined}
                  />
                  <Button variant="outline" size="icon" onClick={props.onChooseFolder} aria-label="Choose folder"><FolderIcon /></Button>
                </div>
                {props.outputDirError ? <FieldDescription id="playlist-output-folder-error" className="text-destructive">{props.outputDirError}</FieldDescription> : null}
              </Field>
              <div className="soft-panel grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 rounded-2xl p-4">
                <div className="min-w-0">
                  <FieldLabel>Save in playlist folder</FieldLabel>
                  <FieldDescription>{playlistFolderDescription}</FieldDescription>
                </div>
                <Switch
                  checked={props.playlistFolderMode}
                  onCheckedChange={props.onPlaylistFolderModeChange}
                  disabled={!props.inspection?.downloadable}
                  aria-label="Save in playlist folder"
                />
              </div>
              <DownloadAdvancedOptions
                canDownload={Boolean(props.inspection?.downloadable)}
                canSaveSubtitles={canSaveSubtitles}
                splitChapters={props.splitChapters}
                setSplitChapters={props.setSplitChapters}
                saveSubtitles={props.saveSubtitles}
                setSaveSubtitles={props.setSaveSubtitles}
                subtitleLanguage={props.subtitleLanguage}
                setSubtitleLanguage={props.setSubtitleLanguage}
              />
              <Button className="h-12 w-full text-base" size="lg" onClick={props.onStartDownload} disabled={!canDownload}>
                <DownloadIcon data-icon="inline-start" />
                Save selected items
              </Button>
              <FieldDescription>Each file includes title, uploader, source URL, and thumbnail artwork when the output format supports it.</FieldDescription>
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
      {props.inspection?.entries.length ? (
        <PlaylistEntryList entries={props.inspection.entries} selectedIds={props.selectedIds} onToggleEntry={props.onToggleEntry} />
      ) : null}
      {playlistDownloads.length ? <PlaylistProgressSummary downloads={playlistDownloads} /> : null}
      <DownloadManager downloads={playlistDownloads} onCancel={props.onCancel} />
    </div>
  )
}

function PlaylistProgressSummary({ downloads }: { downloads: DownloadItem[] }) {
  const total = downloads.length
  const completed = downloads.filter((item) => item.status === "completed").length
  const failed = downloads.filter((item) => item.status === "failed").length
  const cancelled = downloads.filter((item) => item.status === "cancelled").length
  const active = downloads.filter((item) => ["waiting", "downloading", "converting"].includes(item.status)).length
  const progress = total ? Math.round((completed / total) * 100) : 0
  const current = downloads.find((item) => ["downloading", "converting"].includes(item.status))
  const complete = total > 0 && completed + failed + cancelled === total
  return (
    <Card className={complete ? "" : "queue-active"}>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="text-lg">Playlist progress</CardTitle>
          <CardDescription>
            {completed} of {total} items saved{failed ? ` · ${failed} failed` : ""}{cancelled ? ` · ${cancelled} cancelled` : ""}
          </CardDescription>
        </div>
        <Badge variant={complete ? "default" : "secondary"}>{complete ? "Finished" : `${active} active`}</Badge>
      </CardHeader>
      <CardContent>
        <Progress value={progress} aria-label="Playlist completion progress" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
          <span>{current ? `Now saving: ${current.title}` : complete ? "Playlist queue finished." : "Preparing the next item."}</span>
          <span>{progress}%</span>
        </div>
      </CardContent>
    </Card>
  )
}

const subtitleLanguageOptions = [
  { value: "en", label: "English" },
  { value: "en.*", label: "English variants" },
  { value: "fa", label: "Persian" },
  { value: "es", label: "Spanish" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ar", label: "Arabic" },
  { value: "all", label: "All available" },
]

function DownloadAdvancedOptions(props: {
  canDownload: boolean
  canSaveSubtitles: boolean
  splitChapters: boolean
  setSplitChapters: (value: boolean) => void
  saveSubtitles: boolean
  setSaveSubtitles: (value: boolean) => void
  subtitleLanguage: string
  setSubtitleLanguage: (value: string) => void
}) {
  const subtitlesActive = props.saveSubtitles && props.canSaveSubtitles
  return (
    <div className="soft-panel flex flex-col gap-4 rounded-2xl p-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card accent-orange">
            <ScissorsIcon className="size-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <FieldLabel>Split chapters</FieldLabel>
            <FieldDescription>Creates separate files for chapter markers when the source provides them.</FieldDescription>
          </div>
        </div>
        <Switch className="mt-1" checked={props.splitChapters} onCheckedChange={props.setSplitChapters} disabled={!props.canDownload} aria-label="Split chapters" />
      </div>
      <Separator />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-card accent-blue">
            <CaptionsIcon className="size-5" />
          </div>
          <div className="min-w-0 space-y-1">
            <FieldLabel>Save subtitles</FieldLabel>
            <FieldDescription>Saves manual subtitles or auto captions as SRT sidecar files for video downloads.</FieldDescription>
          </div>
        </div>
        <Switch className="mt-1" checked={subtitlesActive} onCheckedChange={props.setSaveSubtitles} disabled={!props.canSaveSubtitles} aria-label="Save subtitles" />
      </div>
      {subtitlesActive ? (
        <Field className="ml-0 rounded-xl border bg-background/60 p-3 sm:ml-14">
          <FieldLabel htmlFor="subtitle-language">Subtitle language</FieldLabel>
          <Select id="subtitle-language" value={props.subtitleLanguage} onValueChange={props.setSubtitleLanguage}>
            <SelectGroup>
              {subtitleLanguageOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectGroup>
          </Select>
          <FieldDescription>Saved alongside the video as SRT files.</FieldDescription>
        </Field>
      ) : null}
    </div>
  )
}

function ToolNotice({ status, onOpenSettings }: { status: ToolStatus | null; onOpenSettings: () => void }) {
  if (!status || status.ready) return null
  return (
    <Alert className="soft-panel">
      <WrenchIcon data-icon="inline-start" />
      <AlertTitle>Media tools need setup</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>Install the app-managed yt-dlp and FFmpeg tools before checking or saving media.</span>
        <span>
          <Button variant="outline" size="sm" onClick={onOpenSettings}>Open Settings</Button>
        </span>
      </AlertDescription>
    </Alert>
  )
}

function PlaylistSummary({ inspection, selectedCount, onToggleAll }: { inspection: PlaylistInspection; selectedCount: number; onToggleAll: (checked: boolean) => void }) {
  const totalDuration = inspection.entries.reduce((sum, entry) => sum + (entry.duration || 0), 0)
  return (
    <Card className="bg-selected/40">
      <CardContent className="flex flex-wrap items-center justify-between gap-4 pt-5">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant={inspection.downloadable ? "default" : "secondary"}>{platformLabel(inspection.platform)}</Badge>
            <Badge variant="outline">{inspection.entries.length} items</Badge>
          </div>
          <h3 className="truncate text-xl font-bold tracking-normal">{inspection.title || "Playlist"}</h3>
          <p className="text-sm text-muted-foreground">{inspection.creator || "Creator unavailable"} · {formatDuration(totalDuration)}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onToggleAll(true)} disabled={!inspection.downloadable}>Select all</Button>
          <Button variant="outline" size="sm" onClick={() => onToggleAll(false)} disabled={selectedCount === 0}>Clear</Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PlaylistEntryList({ entries, selectedIds, onToggleEntry }: { entries: PlaylistEntry[]; selectedIds: Set<string>; onToggleEntry: (id: string, checked: boolean) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Playlist items</CardTitle>
        <CardDescription>{selectedIds.size} of {entries.length} selected.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[520px] overflow-auto rounded-2xl border bg-card/40 p-2">
          {entries.map((entry) => (
            <label key={`${entry.id}-${entry.index}`} className={`flex cursor-pointer items-center gap-3 rounded-xl p-3 transition-all hover:bg-muted/70 ${selectedIds.has(playlistEntryKey(entry)) ? "selected-pill" : ""}`}>
              <input
                className="size-4 accent-primary"
                type="checkbox"
                checked={selectedIds.has(playlistEntryKey(entry))}
                onChange={(event) => onToggleEntry(playlistEntryKey(entry), event.target.checked)}
              />
              {entry.thumbnail ? <img className="h-14 w-20 rounded-xl object-cover" src={entry.thumbnail} alt="" /> : <div className="flex h-14 w-20 items-center justify-center rounded-xl bg-muted"><MusicIcon className="size-4" /></div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-semibold text-muted-foreground">{entry.index.toString().padStart(2, "0")}</span>
                  <span className="truncate font-semibold">{entry.title}</span>
                </div>
                <p className="truncate text-sm text-muted-foreground">{entry.creator || "Creator unavailable"} · {formatDuration(entry.duration)}</p>
              </div>
            </label>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function InspectionSkeleton() {
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex gap-4 pt-5">
        <Skeleton className="h-24 w-36 rounded-2xl" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-5 w-3/4 rounded-full" />
          <Skeleton className="h-4 w-1/2 rounded-full" />
          <Skeleton className="h-4 w-1/3 rounded-full" />
        </div>
      </CardContent>
    </Card>
  )
}

function InspectionCard({ inspection }: { inspection: Inspection }) {
  return (
    <Card className="overflow-hidden bg-selected/35">
      <CardContent className="grid gap-5 p-5 sm:grid-cols-[minmax(14rem,16rem)_1fr] sm:items-center sm:p-6">
        {inspection.thumbnail ? <img className="aspect-video w-full rounded-2xl object-cover" src={inspection.thumbnail} alt="" /> : <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-muted"><MusicIcon /></div>}
        <div className="flex min-w-0 flex-col justify-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={inspection.downloadable ? "default" : "secondary"}>{platformLabel(inspection.platform)}</Badge>
            <Badge variant="outline">{inspection.downloadable ? "Downloadable when permitted" : "Not downloadable"}</Badge>
          </div>
          <div className="grid gap-1">
            <h3 className="text-2xl font-bold leading-tight tracking-normal">{inspection.title || "Metadata unavailable"}</h3>
            <p className="text-sm font-medium text-muted-foreground">{inspection.creator || "Creator unavailable"} · {formatDuration(inspection.duration)}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function DownloadCompletedActions({ item }: { item: DownloadItem }) {
  if (item.status !== "completed" || !item.path) return null
  const parentFolder = parentFolderFromPath(item.path)
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" size="sm" onClick={() => item.path && revealPath(item.path)}>
        <ExternalLinkIcon data-icon="inline-start" />
        Open file
      </Button>
      <Button variant="outline" size="sm" onClick={() => parentFolder && revealPath(parentFolder)} disabled={!parentFolder}>
        <FolderIcon data-icon="inline-start" />
        Open folder
      </Button>
      <Button variant="outline" size="sm" onClick={() => item.path && copyTextToClipboard(item.path, "Local path copied.", "Local path could not be copied.")}>
        <CopyIcon data-icon="inline-start" />
        Copy path
      </Button>
      <Button variant="outline" size="sm" onClick={() => copyTextToClipboard(item.url, "Source URL copied.", "Source URL could not be copied.")}>
        <CopyIcon data-icon="inline-start" />
        Copy source
      </Button>
    </div>
  )
}

function DownloadManager({ downloads, onCancel }: { downloads: DownloadItem[]; onCancel: (id: string) => void }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Download manager</CardTitle>
        <CardDescription>Active and recent downloads for this session.</CardDescription>
      </CardHeader>
      <CardContent>
        {downloads.length === 0 ? (
          <div className="flex min-h-36 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/40 p-6 text-center text-sm text-muted-foreground">
            <DownloadIcon className="size-8 accent-blue" />
            <div>
              <p className="font-semibold text-foreground">Queue is clear</p>
              <p>No active downloads yet. Inspect a URL and start a local save.</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {downloads.map((item) => (
              <div key={item.id} className={`rounded-2xl border bg-card/55 p-4 transition-all ${["downloading", "converting"].includes(item.status) ? "queue-active shadow-sm" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant={item.status === "completed" ? "default" : item.status === "failed" ? "destructive" : "secondary"}>{item.status}</Badge>
                      {item.playlistIndex && item.playlistTotal ? <Badge variant="outline">{item.playlistIndex} of {item.playlistTotal}</Badge> : null}
                      {item.selectedFormatId ? <Badge variant="outline">Format {item.selectedFormatId}</Badge> : null}
                      {item.splitChapters ? <Badge variant="outline">Chapters</Badge> : null}
                      {item.saveSubtitles ? <Badge variant="outline">Subs {item.subtitleLanguage || "en"}</Badge> : null}
                      <span className="min-w-0 flex-1 truncate font-semibold">{item.title}</span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-muted-foreground">{item.playlistTitle ? `${item.playlistTitle} · ` : ""}{item.message}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {["downloading", "converting"].includes(item.status) ? (
                      <Button variant="outline" size="sm" onClick={() => onCancel(item.id)}><SquareIcon data-icon="inline-start" />Cancel</Button>
                    ) : null}
                    <DownloadCompletedActions item={item} />
                  </div>
                </div>
                <Progress className="mt-3" value={item.progress} aria-label={`${item.title} download progress`} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

type LibraryDateFilter = "all" | "today" | "week" | "month"

function historyQualityLabel(item: HistoryItem) {
  if (!item.quality) return "Unknown"
  return presetOptionsForMode(item.mode).find((option) => option.value === item.quality)?.label || item.quality
}

function matchesDateFilter(completedAt: string, filter: LibraryDateFilter) {
  if (filter === "all") return true
  const completed = new Date(completedAt).getTime()
  if (!Number.isFinite(completed)) return true
  const age = Date.now() - completed
  if (filter === "today") return age <= 24 * 60 * 60 * 1000
  if (filter === "week") return age <= 7 * 24 * 60 * 60 * 1000
  return age <= 30 * 24 * 60 * 60 * 1000
}

function LibraryStatusBadge({ exists }: { exists: boolean | undefined }) {
  if (exists === true) return <Badge variant="default">Available</Badge>
  if (exists === false) return <Badge variant="destructive">Missing</Badge>
  return <Badge variant="outline">Checking file...</Badge>
}

function libraryGroupId(group: string) {
  return `library-${group.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "group"}`
}

function LibraryScreen({
  history,
  pathStatus,
  setHistory,
  onUseSource,
}: {
  history: HistoryItem[]
  pathStatus: Record<string, boolean>
  setHistory: (items: HistoryItem[]) => void
  onUseSource: (item: HistoryItem) => void
}) {
  const [query, setQuery] = useState("")
  const [platformFilter, setPlatformFilter] = useState("all")
  const [modeFilter, setModeFilter] = useState("all")
  const [dateFilter, setDateFilter] = useState<LibraryDateFilter>("all")
  const [groupFilter, setGroupFilter] = useState("all")

  async function clearHistory() {
    if (!window.confirm("Clear all Library records? Downloaded files stay on disk.")) return
    setHistory([])
    await saveHistory([]).catch(() => undefined)
  }

  const filteredHistory = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return history
      .filter((item) => {
        if (platformFilter !== "all" && item.platform !== platformFilter) return false
        if (modeFilter !== "all" && item.mode !== modeFilter) return false
        if (groupFilter === "playlists" && !item.playlistTitle) return false
        if (groupFilter === "individual" && item.playlistTitle) return false
        if (!matchesDateFilter(item.completedAt, dateFilter)) return false
        if (!needle) return true
        return [item.title, item.creator, item.url, item.path, item.playlistTitle]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(needle))
      })
      .sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime())
  }, [dateFilter, groupFilter, history, modeFilter, platformFilter, query])

  const groupedHistory = useMemo(() => {
    const groups = new Map<string, HistoryItem[]>()
    filteredHistory.forEach((item) => {
      const key = item.playlistTitle ? `Playlist · ${item.playlistTitle}` : "Individual saves"
      groups.set(key, [...(groups.get(key) || []), item])
    })
    return Array.from(groups.entries())
  }, [filteredHistory])

  const activeFilters = Boolean(query.trim() || platformFilter !== "all" || modeFilter !== "all" || dateFilter !== "all" || groupFilter !== "all")
  const platforms = Array.from(new Set(history.map((item) => item.platform)))
  const playlistCount = history.filter((item) => item.playlistTitle).length
  const missingCount = history.filter((item) => pathStatus[item.path] === false).length

  function resetFilters() {
    setQuery("")
    setPlatformFilter("all")
    setModeFilter("all")
    setDateFilter("all")
    setGroupFilter("all")
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle className="text-lg">Library</CardTitle>
              <CardDescription>Search, filter, and reopen completed local saves stored on this device.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {activeFilters ? (
                <Button variant="outline" onClick={resetFilters}>
                  <XIcon data-icon="inline-start" />
                  Reset
                </Button>
              ) : null}
              <Button variant="outline" onClick={clearHistory} disabled={history.length === 0}>Clear</Button>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <MetricTile label="Library items" value={history.length} tone="blue" />
            <MetricTile label="Playlist items" value={playlistCount} tone="mint" />
            <div className="rounded-2xl border bg-card/55 p-4">
              <div className="text-xs font-semibold uppercase tracking-normal text-muted-foreground">Missing files</div>
              <div className="mt-2 text-2xl font-bold">{missingCount}</div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="library-search">Search library</FieldLabel>
              <div className="relative">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="library-search"
                  className="pl-9"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search title, creator, playlist, source URL, or local path"
                />
              </div>
            </Field>
            <div className="grid gap-3 md:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="library-platform">Platform</FieldLabel>
                <Select id="library-platform" value={platformFilter} onValueChange={setPlatformFilter}>
                  <SelectGroup>
                    <SelectItem value="all">All platforms</SelectItem>
                    {platforms.map((value) => (
                      <SelectItem key={value} value={value}>{platformLabel(value)}</SelectItem>
                    ))}
                  </SelectGroup>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="library-format">Format</FieldLabel>
                <Select id="library-format" value={modeFilter} onValueChange={setModeFilter}>
                  <SelectGroup>
                    <SelectItem value="all">Audio and video</SelectItem>
                    <SelectItem value="audio">Audio</SelectItem>
                    <SelectItem value="video">Video</SelectItem>
                  </SelectGroup>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="library-date">Date</FieldLabel>
                <Select id="library-date" value={dateFilter} onValueChange={(value) => setDateFilter(value as LibraryDateFilter)}>
                  <SelectGroup>
                    <SelectItem value="all">Any time</SelectItem>
                    <SelectItem value="today">Last 24 hours</SelectItem>
                    <SelectItem value="week">Last 7 days</SelectItem>
                    <SelectItem value="month">Last 30 days</SelectItem>
                  </SelectGroup>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="library-group">Grouping</FieldLabel>
                <Select id="library-group" value={groupFilter} onValueChange={setGroupFilter}>
                  <SelectGroup>
                    <SelectItem value="all">All saves</SelectItem>
                    <SelectItem value="playlists">Playlist items</SelectItem>
                    <SelectItem value="individual">Individual saves</SelectItem>
                  </SelectGroup>
                </Select>
              </Field>
            </div>
            <FieldDescription>{filteredHistory.length} of {history.length} library item{history.length === 1 ? "" : "s"} shown.</FieldDescription>
          </FieldGroup>
        </CardContent>
      </Card>

      {history.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <HistoryIcon className="size-9 accent-mint" />
            <div>
              <p className="font-semibold text-foreground">No library items yet</p>
              <p>Completed downloads will appear here with metadata, source links, and local file actions.</p>
            </div>
          </CardContent>
        </Card>
      ) : filteredHistory.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-48 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground">
            <FileQuestionIcon className="size-9 accent-orange" />
            <div>
              <p className="font-semibold text-foreground">No matching library items</p>
              <p>Adjust the search or reset filters to return to the full local library.</p>
            </div>
            <Button variant="outline" onClick={resetFilters}>Reset filters</Button>
          </CardContent>
        </Card>
      ) : (
        groupedHistory.map(([group, items]) => {
          const groupId = libraryGroupId(group)
          return (
          <section key={group} className="flex flex-col gap-3" aria-labelledby={groupId}>
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <h3 id={groupId} className="text-sm font-bold text-muted-foreground">{group}</h3>
              <Badge variant="outline">{items.length} item{items.length === 1 ? "" : "s"}</Badge>
            </div>
            <div className="flex flex-col gap-3">
              {items.map((item) => {
                const exists = pathStatus[item.path]
                return (
                  <article key={item.id} className="workbench-panel rounded-2xl p-4">
                    <div className="grid gap-4 lg:grid-cols-[6rem_minmax(0,1fr)_auto] lg:items-start">
                      {item.thumbnail ? (
                        <img className="aspect-video w-full rounded-xl object-cover lg:w-24" src={item.thumbnail} alt={`${item.title} thumbnail`} />
                      ) : (
                        <div className="flex aspect-video w-full items-center justify-center rounded-xl bg-muted text-muted-foreground lg:w-24">
                          <ImageIcon className="size-5" />
                        </div>
                      )}
                      <div className="min-w-0 space-y-3">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <LibraryStatusBadge exists={exists} />
                            <Badge variant="outline">{platformLabel(item.platform)}</Badge>
                            <Badge variant="outline">{item.mode}</Badge>
                            <Badge variant="outline">{historyQualityLabel(item)}</Badge>
                            {item.playlistIndex && item.playlistTotal ? <Badge variant="outline">{item.playlistIndex} of {item.playlistTotal}</Badge> : null}
                          </div>
                          <h4 className="truncate text-base font-bold">{item.title}</h4>
                          <p className="text-sm font-medium text-muted-foreground">
                            {item.creator || "Creator unavailable"} · {formatDuration(item.duration)} · {new Date(item.completedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="grid gap-2 text-sm text-muted-foreground">
                          {item.url ? (
                            <p className="truncate">
                              <span className="font-semibold text-foreground">Source:</span> {item.url}
                            </p>
                          ) : null}
                          <p className="truncate">
                            <span className="font-semibold text-foreground">File:</span> {item.path}
                          </p>
                          {exists === false ? (
                            <p className="text-destructive">The saved file was not found at this path. The Library record is still kept so you can copy the source URL or local path.</p>
                          ) : exists === undefined ? (
                            <p>Checking whether this file is still available on disk...</p>
                          ) : null}
                          {item.playlistTitle ? (
                            <p className="truncate">
                              <span className="font-semibold text-foreground">Playlist:</span> {item.playlistTitle}
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 lg:justify-end">
                        <Button variant="outline" size="sm" onClick={() => revealPath(item.path)} disabled={exists === false}>
                          <ExternalLinkIcon data-icon="inline-start" />
                          Open
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => onUseSource(item)} disabled={!item.url}>
                          <ArrowUpRightIcon data-icon="inline-start" />
                          Use source
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => item.url && copyTextToClipboard(item.url, "Source URL copied.", "Source URL could not be copied.")} disabled={!item.url}>
                          <CopyIcon data-icon="inline-start" />
                          Copy URL
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => copyTextToClipboard(item.path, "Local path copied.", "Local path could not be copied.")}>
                          <CopyIcon data-icon="inline-start" />
                          Copy path
                        </Button>
                      </div>
                    </div>
                  </article>
                )
              })}
            </div>
          </section>
          )
        })
      )}
    </div>
  )
}

const platformDefaultRows: Array<{ platform: PlatformWithDefaults; description: string }> = [
  { platform: "youTube", description: "Applies to videos and playlists after inspection." },
  { platform: "soundCloud", description: "SoundCloud downloads are audio-only." },
  { platform: "tikTok", description: "Applies to individual TikTok videos after inspection." },
]

function PlatformDefaultsPanel({
  settings,
  onSave,
}: {
  settings: Settings
  onSave: (settings: Settings) => void
}) {
  const platformDefaults = normalizePlatformDefaults(settings.platformDefaults, settings.defaultFormat, settings.defaultQuality)

  function updatePlatformDefault(platform: PlatformWithDefaults, mode: DownloadMode, quality = platformDefaults[platform].quality) {
    const nextDefault = normalizePlatformDefault(platform, { mode, quality }, {
      mode: settings.defaultFormat,
      quality: settings.defaultQuality,
    })
    onSave({
      ...settings,
      platformDefaults: {
        ...platformDefaults,
        [platform]: nextDefault,
      },
    })
  }

  return (
    <div className="soft-panel rounded-2xl p-4">
      <div className="mb-4">
        <FieldLabel>Platform defaults</FieldLabel>
        <FieldDescription>These replace the general default when a supported platform is detected.</FieldDescription>
      </div>
      <div className="divide-y divide-border/70">
        {platformDefaultRows.map(({ platform, description }) => {
          const current = platformDefaults[platform]
          const canUseVideo = platform !== "soundCloud"
          return (
            <div key={platform} className="grid gap-3 py-4 first:pt-0 last:pb-0">
              <div className="min-w-0">
                <FieldLabel>{platformLabel(platform)}</FieldLabel>
                <FieldDescription>{description}</FieldDescription>
              </div>
              <div className="grid gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
                <div className="grid grid-cols-2 gap-2">
                  <Button
                    type="button"
                    className="h-10"
                    variant={current.mode === "audio" ? "default" : "outline"}
                    aria-pressed={current.mode === "audio"}
                    onClick={() => updatePlatformDefault(platform, "audio")}
                  >
                    <MusicIcon data-icon="inline-start" />Audio
                  </Button>
                  <Button
                    type="button"
                    className="h-10"
                    variant={current.mode === "video" ? "default" : "outline"}
                    aria-pressed={current.mode === "video"}
                    disabled={!canUseVideo}
                    onClick={() => updatePlatformDefault(platform, "video")}
                  >
                    <VideoIcon data-icon="inline-start" />Video
                  </Button>
                </div>
                <div className="min-w-0">
                  <Select
                    aria-label={`${platformLabel(platform)} preset`}
                    value={normalizePresetForMode(current.quality, current.mode)}
                    onValueChange={(value) => updatePlatformDefault(platform, current.mode, normalizePresetForMode(value, current.mode))}
                  >
                    <SelectGroup>
                      {presetOptionsForMode(current.mode).map((option) => (
                        <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </Select>
                  <FieldDescription className="mt-2">{presetDetails(current.quality, current.mode).description}</FieldDescription>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SettingsScreen({
  settings,
  toolStatus,
  toolsLoading,
  toolsInstalling,
  appVersion,
  updateChecking,
  updateChecked,
  updateInstalling,
  availableUpdate,
  updateProgress,
  updateMessage,
  onSave,
  onRefreshTools,
  onInstallTools,
  onCheckForUpdate,
  onInstallUpdate,
}: {
  settings: Settings
  toolStatus: ToolStatus | null
  toolsLoading: boolean
  toolsInstalling: boolean
  appVersion: string
  updateChecking: boolean
  updateChecked: boolean
  updateInstalling: boolean
  availableUpdate: Update | null
  updateProgress: number
  updateMessage: string
  onSave: (settings: Settings) => void
  onRefreshTools: () => void
  onInstallTools: () => void
  onCheckForUpdate: () => void
  onInstallUpdate: () => void
}) {
  const managedToolsInstalled = Boolean(toolStatus?.ytDlp.managedInstalled && toolStatus?.ffmpeg.managedInstalled)
  const updateStatusLabel = updateChecking ? "Checking" : availableUpdate ? "Update available" : updateChecked ? "Up to date" : "Not checked yet"
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Preferences</CardTitle>
          <CardDescription>Stored only on this computer.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Theme</FieldLabel>
              <ThemeSegmentedControl value={settings.theme} onChange={(theme) => onSave({ ...settings, theme })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-default-format">Default format</FieldLabel>
              <Select
                id="settings-default-format"
                value={settings.defaultFormat}
                onValueChange={(value) => {
                  const defaultFormat = value as DownloadMode
                  onSave({
                    ...settings,
                    defaultFormat,
                    defaultQuality: normalizePresetForMode(settings.defaultQuality, defaultFormat),
                  })
                }}
              >
                <SelectGroup>
                  <SelectItem value="audio">Audio</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                </SelectGroup>
              </Select>
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-default-preset">Default preset</FieldLabel>
              <Select
                id="settings-default-preset"
                value={normalizePresetForMode(settings.defaultQuality, settings.defaultFormat)}
                onValueChange={(value) => onSave({ ...settings, defaultQuality: normalizePresetForMode(value, settings.defaultFormat) })}
              >
                <SelectGroup>
                  {presetOptionsForMode(settings.defaultFormat).map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectGroup>
              </Select>
              <FieldDescription>{presetDetails(normalizePresetForMode(settings.defaultQuality, settings.defaultFormat), settings.defaultFormat).description}</FieldDescription>
            </Field>
            <PlatformDefaultsPanel settings={settings} onSave={onSave} />
            <Field>
              <FieldLabel htmlFor="settings-default-output-folder">Default output folder</FieldLabel>
              <Input id="settings-default-output-folder" value={settings.defaultOutputFolder} onChange={(event) => onSave({ ...settings, defaultOutputFolder: event.target.value })} />
            </Field>
            <Field>
              <FieldLabel htmlFor="settings-playlist-concurrency">Playlist concurrency</FieldLabel>
              <Select
                id="settings-playlist-concurrency"
                value={String(clampPlaylistConcurrency(settings.playlistConcurrency))}
                onValueChange={(value) => onSave({ ...settings, playlistConcurrency: clampPlaylistConcurrency(Number(value)) })}
              >
                <SelectGroup>
                  <SelectItem value="1">1 at a time</SelectItem>
                  <SelectItem value="2">2 at a time</SelectItem>
                  <SelectItem value="3">3 at a time</SelectItem>
                </SelectGroup>
              </Select>
              <FieldDescription>Controls how many playlist items can download at the same time.</FieldDescription>
            </Field>
            <div className="soft-panel flex items-center justify-between gap-3 rounded-2xl p-4">
              <div>
                <FieldLabel>Keep Library records</FieldLabel>
                <FieldDescription>Library records contain saved metadata, source URLs, and local file paths.</FieldDescription>
              </div>
              <Switch checked={settings.keepHistory} onCheckedChange={(checked) => onSave({ ...settings, keepHistory: checked })} aria-label="Keep Library records" />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">App updates</CardTitle>
          <CardDescription>Check GitHub Releases and install signed updates from inside Unmuze.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <div className="soft-panel rounded-2xl p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <FieldLabel>Current version</FieldLabel>
                  <FieldDescription>{appVersion ? `Unmuze ${appVersion}` : "Version unavailable in browser preview."}</FieldDescription>
                </div>
                <Badge variant={availableUpdate ? "default" : updateChecking ? "secondary" : "outline"}>{updateStatusLabel}</Badge>
              </div>
              {availableUpdate ? <p className="mt-3 text-sm font-medium text-foreground">Version {availableUpdate.version} is ready to install.</p> : null}
              {updateMessage ? <p className="mt-3 text-sm text-muted-foreground">{updateMessage}</p> : null}
              {updateInstalling ? <Progress className="mt-3" value={updateProgress} aria-label="Update download progress" /> : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={onCheckForUpdate} disabled={updateChecking || updateInstalling}>
                {updateChecking ? <Spinner /> : <RefreshCwIcon data-icon="inline-start" />}
                Check for updates
              </Button>
              <Button onClick={onInstallUpdate} disabled={!availableUpdate || updateChecking || updateInstalling}>
                {updateInstalling ? <Spinner /> : <DownloadIcon data-icon="inline-start" />}
                Install update
              </Button>
            </div>
            <FieldDescription>Updates are verified with Tauri signatures before installation.</FieldDescription>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Media tools</CardTitle>
          <CardDescription>Install local managed copies of yt-dlp and FFmpeg.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            {toolStatus ? (
              <>
                <ToolStatusRow tool={toolStatus.ytDlp} />
                <ToolStatusRow tool={toolStatus.ffmpeg} />
              </>
            ) : (
              <div className="rounded-2xl border border-dashed bg-card/40 p-4 text-sm text-muted-foreground">
                {toolsLoading ? "Checking media tools..." : "Tool status has not been checked yet."}
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              <Button onClick={onInstallTools} disabled={toolsInstalling}>
                {toolsInstalling ? <Spinner /> : <WrenchIcon data-icon="inline-start" />}
                {managedToolsInstalled ? "Reinstall managed tools" : "Install managed tools"}
              </Button>
              <Button variant="outline" onClick={onRefreshTools} disabled={toolsLoading || toolsInstalling}>
                {toolsLoading ? <Spinner /> : <SearchIcon data-icon="inline-start" />}
                Check again
              </Button>
            </div>
            <FieldDescription>Downloads pinned, checksum-verified binaries into this app's local data folder. Managed tools are used before system PATH tools.</FieldDescription>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  )
}

function ToolStatusRow({ tool }: { tool: ToolStatus["ytDlp"] }) {
  return (
    <div className="soft-panel rounded-2xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <FieldLabel>{tool.name}</FieldLabel>
            <Badge variant={tool.ready ? "default" : "destructive"}>{tool.activeSource}</Badge>
          </div>
          <FieldDescription>{tool.message}</FieldDescription>
        </div>
        <Badge variant="outline">Pinned {tool.requiredVersion}</Badge>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-muted-foreground">
        <div>Managed: {tool.managedInstalled ? tool.managedVersion || "installed" : "not installed"}</div>
        <div>System PATH: {tool.systemInstalled ? tool.systemVersion || "available" : "not found"}</div>
      </div>
    </div>
  )
}

function HelpScreen() {
  return (
    <div className="grid gap-6 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Can save</CardTitle>
          <CardDescription>Supported local workflows for permitted public media.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm font-medium leading-6 text-muted-foreground">
          <p>Unmuze can install managed media tools locally, inspect supported public YouTube, SoundCloud, and TikTok URLs, and save audio or video where legally permitted.</p>
          <p>Playlist mode can save selected public items with a configurable concurrency limit, per-item progress, and cancellation.</p>
          <p>Audio and video presets cover common formats, and supported downloads can embed metadata, source URLs, and artwork.</p>
          <p>Advanced options can split chaptered sources into separate files and save available video subtitles as SRT sidecar files.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Cannot save</CardTitle>
          <CardDescription>Protected access stays protected.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm font-medium leading-6 text-muted-foreground">
          <p>Unmuze does not bypass DRM, paywalls, login restrictions, encryption, region locks, private links, or other access controls.</p>
          <p>Spotify tracks, albums, and playlists cannot be downloaded because Spotify does not expose downloadable media files for this kind of app.</p>
          <p>It stores settings and Library records locally. It does not create accounts or send your library to a cloud service.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">When something fails</CardTitle>
          <CardDescription>Most fixes start in Settings.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm font-medium leading-6 text-muted-foreground">
          <p>Use Settings to install or refresh the app-managed yt-dlp and FFmpeg tools if inspection or conversion reports missing tools.</p>
          <p>Use Check for updates in Settings to install newer signed Unmuze releases without visiting GitHub.</p>
        </CardContent>
      </Card>
    </div>
  )
}

function readableError(error: unknown) {
  if (typeof error === "object" && error && "message" in error) {
    const value = error as { message?: string; suggestion?: string }
    return [value.message, value.suggestion].filter(Boolean).join(" ")
  }
  return error instanceof Error ? error.message : "The action could not be completed."
}

export default App
