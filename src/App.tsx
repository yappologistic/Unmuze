import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getVersion } from "@tauri-apps/api/app"
import { relaunch } from "@tauri-apps/plugin-process"
import { check, type Update } from "@tauri-apps/plugin-updater"
import {
  AlertCircleIcon,
  CheckCircleIcon,
  Clock3Icon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderIcon,
  HistoryIcon,
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Toaster } from "@/components/ui/sonner"
import { Spinner } from "@/components/ui/spinner"
import unmuzeIcon from "@/assets/unmuze-icon.png"
import {
  canTransitionDownload,
  clampPlaylistConcurrency,
  defaultSettings,
  detectPlatform,
  estimatedFileType,
  formatDetailLabel,
  formatDetailSummary,
  formatDetailsForMode,
  formatDuration,
  normalizePresetForMode,
  type DownloadItem,
  type DownloadMode,
  type DownloadPreset,
  type HistoryItem,
  type Inspection,
  isLikelyPlaylistUrl,
  platformLabel,
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

const navigationItems = [
  { value: "download", label: "Download", shortLabel: "Save", icon: LinkIcon, accent: "accent-blue" },
  { value: "playlist", label: "Playlist", shortLabel: "Playlist", icon: ListMusicIcon, accent: "accent-violet" },
  { value: "history", label: "History", shortLabel: "History", icon: HistoryIcon, accent: "accent-mint" },
  { value: "settings", label: "Settings", shortLabel: "Settings", icon: SettingsIcon, accent: "accent-orange" },
  { value: "help", label: "Help", shortLabel: "Help", icon: InfoIcon, accent: "text-muted-foreground" },
] as const

function tabTitle(value: string) {
  return navigationItems.find((item) => item.value === value)?.label ?? "Download"
}

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
  const [updateInstalling, setUpdateInstalling] = useState(false)
  const [availableUpdate, setAvailableUpdate] = useState<Update | null>(null)
  const [updateProgress, setUpdateProgress] = useState(0)
  const [updateMessage, setUpdateMessage] = useState("")
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [mode, setMode] = useState<DownloadMode>("audio")
  const [quality, setQuality] = useState<DownloadPreset>("best")
  const [selectedFormatId, setSelectedFormatId] = useState("")
  const [splitChapters, setSplitChapters] = useState(false)
  const [saveSubtitles, setSaveSubtitles] = useState(false)
  const [subtitleLanguage, setSubtitleLanguage] = useState("en")
  const [outputDir, setOutputDir] = useState("")
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
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<Set<string>>(new Set())
  const playlistQueueRef = useRef<PendingDownload[]>([])
  const activePlaylistDownloadIdsRef = useRef<Set<string>>(new Set())
  const playlistDownloadIdsRef = useRef<Set<string>>(new Set())
  const cancelledQueuedIdsRef = useRef<Set<string>>(new Set())
  const contentScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadSettings()
      .then((loaded) => {
        setSettings(loaded)
        setMode(loaded.defaultFormat)
        setPlaylistMode(loaded.defaultFormat)
        setQuality(normalizePresetForMode(loaded.defaultQuality, loaded.defaultFormat))
        setPlaylistQuality(normalizePresetForMode(loaded.defaultQuality, loaded.defaultFormat))
        setOutputDir(loaded.defaultOutputFolder)
        setPlaylistOutputDir(loaded.defaultOutputFolder)
      })
      .catch(() => setSettings(defaultSettings))
    loadHistory().then(setHistory).catch(() => setHistory([]))
    refreshToolStatus()
    getVersion().then(setAppVersion).catch(() => setAppVersion(""))
  }, [])

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
              title: item.title,
              platform: item.platform,
              path: payload.path,
              mode: item.mode,
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
  const toolsReady = Boolean(toolStatus?.ytDlp.ready && toolStatus?.ffmpeg.ready)

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
      const nextMode = result.formats.includes(settings.defaultFormat) ? settings.defaultFormat : "audio"
      setMode(nextMode)
      setQuality(normalizePresetForMode(settings.defaultQuality, nextMode))
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
    setUpdateProgress(0)
    setUpdateMessage("")
    try {
      const update = await check({ timeout: 30000 })
      setAvailableUpdate(update)
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
    if (selected) setOutputDir(selected)
  }

  async function handleChoosePlaylistFolder() {
    const selected = await chooseFolder()
    if (selected) setPlaylistOutputDir(selected)
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
      const nextMode = result.platform === "soundCloud" ? "audio" : settings.defaultFormat
      setPlaylistMode(nextMode)
      setPlaylistQuality(normalizePresetForMode(settings.defaultQuality, nextMode))
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
    if (!playlistOutputDir) {
      toast.error("Choose an output folder first.")
      return
    }
    const selectedEntries = playlistInspection.entries.filter((entry) => selectedPlaylistIds.has(playlistEntryKey(entry)))
    if (selectedEntries.length === 0) {
      toast.error("Select at least one playlist item.")
      return
    }
    const total = selectedEntries.length
    const playlistTitle = playlistInspection.title || "Playlist"
    const queuedItems = selectedEntries.map((entry, position) => {
      const id = crypto.randomUUID()
      const numberedName = `${String(position + 1).padStart(2, "0")} - ${sanitizeFilename(entry.title)}`
      const item: DownloadItem = {
        id,
        url: entry.url,
        title: entry.title,
        platform: playlistInspection.platform,
        mode: playlistMode,
        quality: playlistQuality,
        outputDir: playlistOutputDir,
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
    if (!outputDir) {
      toast.error("Choose an output folder first.")
      return
    }
    const id = crypto.randomUUID()
    const item: DownloadItem = {
      id,
      url,
      title: inspection.title || "Untitled media",
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
          settings={settings}
          onSaveSettings={handleSaveSettings}
          activeDownloads={activeDownloads}
          completedDownloads={completedDownloads}
          toolsReady={toolsReady}
        />

        <main className="flex min-h-0 min-w-0 flex-1 flex-col">
          <MobileHeader tab={tab} setTab={setTab} />
          <WorkbenchHeader
            tab={tab}
            activeDownloads={activeDownloads}
            completedDownloads={completedDownloads}
            toolsReady={toolsReady}
          />

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
                  setOutputDir={setOutputDir}
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
                  splitChapters={playlistSplitChapters}
                  setSplitChapters={setPlaylistSplitChapters}
                  saveSubtitles={playlistSaveSubtitles}
                  setSaveSubtitles={setPlaylistSaveSubtitles}
                  subtitleLanguage={playlistSubtitleLanguage}
                  setSubtitleLanguage={setPlaylistSubtitleLanguage}
                  outputDir={playlistOutputDir}
                  setOutputDir={setPlaylistOutputDir}
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
                <HistoryScreen history={history} setHistory={setHistory} />
              </TabsContent>
              <TabsContent value="settings">
                <SettingsScreen
                  settings={settings}
                  toolStatus={toolStatus}
                  toolsLoading={toolsLoading}
                  toolsInstalling={toolsInstalling}
                  appVersion={appVersion}
                  updateChecking={updateChecking}
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
  settings,
  onSaveSettings,
  activeDownloads,
  completedDownloads,
  toolsReady,
}: {
  tab: string
  setTab: (value: string) => void
  settings: Settings
  onSaveSettings: (settings: Settings) => void
  activeDownloads: number
  completedDownloads: number
  toolsReady: boolean
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
            return (
              <TabsTrigger key={item.value} value={item.value} className="h-12 justify-start px-4 text-[15px]">
                <Icon className={item.accent} data-icon="inline-start" />
                <span className="flex-1 text-left">{item.label}</span>
              </TabsTrigger>
            )
          })}
        </TabsList>
      </Tabs>

      <div className="soft-panel grid gap-3 rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Session</span>
          <Badge variant={toolsReady ? "default" : "outline"}>{toolsReady ? "Tools ready" : "Tools needed"}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <MetricTile label="Active" value={activeDownloads} tone="blue" />
          <MetricTile label="Saved" value={completedDownloads} tone="mint" />
        </div>
      </div>

      <ThemeSegmentedControl
        value={settings.theme}
        onChange={(theme) => onSaveSettings({ ...settings, theme })}
      />

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

function WorkbenchHeader({
  tab,
  activeDownloads,
  completedDownloads,
  toolsReady,
}: {
  tab: string
  activeDownloads: number
  completedDownloads: number
  toolsReady: boolean
}) {
  return (
    <header className="hidden border-b bg-background/80 px-8 py-5 lg:block">
      <div className="flex items-center justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">Current view</p>
          <h2 className="mt-1 text-2xl font-bold tracking-normal">{tabTitle(tab)}</h2>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip
            icon={toolsReady ? CheckCircleIcon : WrenchIcon}
            label={toolsReady ? "Media tools ready" : "Media tools need attention"}
            tone={toolsReady ? "mint" : "orange"}
          />
          <StatusChip icon={Clock3Icon} label={`${activeDownloads} active`} tone="blue" />
          <StatusChip icon={DownloadIcon} label={`${completedDownloads} saved`} tone="violet" />
        </div>
      </div>
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

function StatusChip({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon
  label: string
  tone: "blue" | "violet" | "mint" | "orange"
}) {
  const toneClass = {
    blue: "accent-blue",
    violet: "accent-violet",
    mint: "accent-mint",
    orange: "accent-orange",
  }[tone]
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card/70 px-3 py-2 text-sm font-medium text-muted-foreground">
      <Icon className={`size-4 ${toneClass}`} />
      <span>{label}</span>
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
              <Field>
                <FieldLabel htmlFor="output-folder">Output folder</FieldLabel>
                <div className="flex gap-2">
                  <Input id="output-folder" value={props.outputDir} onChange={(event) => props.setOutputDir(event.target.value)} placeholder="Choose a folder" />
                  <Button variant="outline" size="icon" onClick={props.onChooseFolder} aria-label="Choose folder"><FolderIcon /></Button>
                </div>
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
  splitChapters: boolean
  setSplitChapters: (value: boolean) => void
  saveSubtitles: boolean
  setSaveSubtitles: (value: boolean) => void
  subtitleLanguage: string
  setSubtitleLanguage: (value: string) => void
  outputDir: string
  setOutputDir: (value: string) => void
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
              <Field>
                <FieldLabel htmlFor="playlist-output-folder">Output folder</FieldLabel>
                <div className="flex gap-2">
                  <Input id="playlist-output-folder" value={props.outputDir} onChange={(event) => props.setOutputDir(event.target.value)} placeholder="Choose a folder" />
                  <Button variant="outline" size="icon" onClick={props.onChooseFolder} aria-label="Choose folder"><FolderIcon /></Button>
                </div>
              </Field>
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
        <Progress value={progress} />
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
    <Card className="bg-selected/35">
      <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row">
        {inspection.thumbnail ? <img className="h-28 w-full rounded-2xl object-cover sm:w-40" src={inspection.thumbnail} alt="" /> : <div className="flex h-28 w-full items-center justify-center rounded-2xl bg-muted sm:w-40"><MusicIcon /></div>}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={inspection.downloadable ? "default" : "secondary"}>{platformLabel(inspection.platform)}</Badge>
            <Badge variant="outline">{inspection.downloadable ? "Downloadable when permitted" : "Not downloadable"}</Badge>
          </div>
          <h3 className="truncate text-xl font-bold tracking-normal">{inspection.title || "Metadata unavailable"}</h3>
          <p className="text-sm text-muted-foreground">{inspection.creator || "Creator unavailable"} · {formatDuration(inspection.duration)}</p>
        </div>
      </CardContent>
    </Card>
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
                  <div className="flex gap-2">
                    {["downloading", "converting"].includes(item.status) ? (
                      <Button variant="outline" size="sm" onClick={() => onCancel(item.id)}><SquareIcon data-icon="inline-start" />Cancel</Button>
                    ) : null}
                    {item.path ? <Button variant="outline" size="sm" onClick={() => item.path && revealPath(item.path)}><ExternalLinkIcon data-icon="inline-start" />Open</Button> : null}
                  </div>
                </div>
                <Progress className="mt-3" value={item.progress} />
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function HistoryScreen({ history, setHistory }: { history: HistoryItem[]; setHistory: (items: HistoryItem[]) => void }) {
  async function clearHistory() {
    setHistory([])
    await saveHistory([]).catch(() => undefined)
  }
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">History</CardTitle>
          <CardDescription>Completed downloads stored locally on this device.</CardDescription>
        </div>
        <Button variant="outline" onClick={clearHistory}>Clear</Button>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/40 p-6 text-center text-sm text-muted-foreground">
            <HistoryIcon className="size-8 accent-mint" />
            <div>
              <p className="font-semibold text-foreground">No completed downloads yet</p>
              <p>Saved media will appear here with local open actions.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-2xl border bg-card/50">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Platform</TableHead>
                  <TableHead>Format</TableHead>
                  <TableHead>Completed</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="max-w-xs truncate font-medium">{item.title}</TableCell>
                    <TableCell>{platformLabel(item.platform)}</TableCell>
                    <TableCell>{item.mode}</TableCell>
                    <TableCell>{new Date(item.completedAt).toLocaleString()}</TableCell>
                    <TableCell><Button variant="outline" size="sm" onClick={() => revealPath(item.path)}>Open</Button></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function SettingsScreen({
  settings,
  toolStatus,
  toolsLoading,
  toolsInstalling,
  appVersion,
  updateChecking,
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
                <FieldLabel>Keep download history</FieldLabel>
                <FieldDescription>History contains titles and local file paths only.</FieldDescription>
              </div>
              <Switch checked={settings.keepHistory} onCheckedChange={(checked) => onSave({ ...settings, keepHistory: checked })} aria-label="Keep download history" />
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
                <Badge variant={availableUpdate ? "default" : "outline"}>{availableUpdate ? `Update ${availableUpdate.version}` : "Stable"}</Badge>
              </div>
              {updateMessage ? <p className="mt-3 text-sm text-muted-foreground">{updateMessage}</p> : null}
              {updateInstalling ? <Progress className="mt-3" value={updateProgress} /> : null}
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
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What Unmuze does</CardTitle>
          <CardDescription>A local desktop tool for permitted public media saves.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm font-medium leading-6 text-muted-foreground">
          <p>Unmuze can install managed media tools locally, inspect supported public YouTube, SoundCloud, and TikTok URLs, and save audio or video where legally permitted.</p>
          <p>Playlist mode can save selected public items with a configurable concurrency limit, per-item progress, and cancellation.</p>
          <p>Audio and video presets cover common formats, and supported downloads can embed metadata, source URLs, and artwork.</p>
          <p>Advanced options can split chaptered sources into separate files and save available video subtitles as SRT sidecar files.</p>
          <p>It stores settings and history locally. It does not create accounts or send your library to a cloud service.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">What Unmuze does not do</CardTitle>
          <CardDescription>Protected access stays protected.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm font-medium leading-6 text-muted-foreground">
          <p>It does not bypass DRM, paywalls, login restrictions, encryption, region locks, private links, or other access controls.</p>
          <p>Spotify tracks, albums, and playlists cannot be downloaded because Spotify does not expose downloadable media files for this kind of app.</p>
          <Separator />
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
