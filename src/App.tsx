import { useEffect, useMemo, useState } from "react"
import {
  AlertCircleIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FolderIcon,
  HistoryIcon,
  InfoIcon,
  LinkIcon,
  MoonIcon,
  MusicIcon,
  SearchIcon,
  SettingsIcon,
  ShieldCheckIcon,
  SquareIcon,
  SunIcon,
  VideoIcon,
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
  defaultSettings,
  detectPlatform,
  formatDuration,
  type DownloadItem,
  type DownloadMode,
  type HistoryItem,
  type Inspection,
  platformLabel,
  sanitizeFilename,
  type Settings,
  validateMediaUrl,
} from "@/lib/media"
import {
  cancelDownload,
  chooseFolder,
  inspectMedia,
  loadHistory,
  loadSettings,
  onDownloadFinished,
  onDownloadProgress,
  revealPath,
  saveHistory,
  saveSettings,
  startDownload,
} from "@/lib/tauri"

function App() {
  const [tab, setTab] = useState("download")
  const [url, setUrl] = useState("")
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState("")
  const [settings, setSettings] = useState<Settings>(defaultSettings)
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const [mode, setMode] = useState<DownloadMode>("audio")
  const [quality, setQuality] = useState<"best" | "balanced">("best")
  const [outputDir, setOutputDir] = useState("")
  const [fileName, setFileName] = useState("")

  useEffect(() => {
    loadSettings()
      .then((loaded) => {
        setSettings(loaded)
        setMode(loaded.defaultFormat)
        setQuality(loaded.defaultQuality)
        setOutputDir(loaded.defaultOutputFolder)
      })
      .catch(() => setSettings(defaultSettings))
    loadHistory().then(setHistory).catch(() => setHistory([]))
  }, [])

  useEffect(() => {
    const root = document.documentElement
    root.classList.remove("light", "dark")
    if (settings.theme === "system") {
      const dark = window.matchMedia("(prefers-color-scheme: dark)").matches
      root.classList.add(dark ? "dark" : "light")
    } else {
      root.classList.add(settings.theme)
    }
  }, [settings.theme])

  useEffect(() => {
    const disposers: Array<() => void> = []
    onDownloadProgress((payload) => {
      setDownloads((items) =>
        items.map((item) => {
          if (item.id !== payload.id) return item
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
      setDownloads((items) =>
        items.map((item) => {
          if (item.id !== payload.id) return item
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
    }).then((dispose) => disposers.push(dispose))
    return () => disposers.forEach((dispose) => dispose())
  }, [settings.keepHistory])

  const platform = useMemo(() => detectPlatform(url), [url])
  const urlValidation = useMemo(() => (url.trim() ? validateMediaUrl(url) : null), [url])

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
      setMode(result.formats.includes(settings.defaultFormat) ? settings.defaultFormat : "audio")
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

  async function handleChooseFolder() {
    const selected = await chooseFolder()
    if (selected) setOutputDir(selected)
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
      })
      setDownloads((items) => items.map((download) => (download.id === id ? { ...download, path } : download)))
      toast.success("Download started.")
    } catch (err) {
      setDownloads((items) => items.map((download) => (download.id === id ? { ...download, status: "failed", message: readableError(err) } : download)))
      toast.error(readableError(err))
    }
  }

  async function handleCancel(id: string) {
    await cancelDownload(id).catch(() => undefined)
    setDownloads((items) => items.map((item) => (item.id === id ? { ...item, status: "cancelled", message: "Cancelled by user." } : item)))
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster />
      <div className="mx-auto flex min-h-screen w-full max-w-7xl">
        <aside className="hidden w-64 shrink-0 border-r bg-muted/30 p-5 md:flex md:flex-col md:gap-6">
          <div className="flex items-center gap-3">
            <div className="size-10 overflow-hidden rounded-lg bg-primary">
              <img className="size-full object-cover" src={unmuzeIcon} alt="" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-normal">Unmuze</h1>
              <p className="text-sm text-muted-foreground">Local media saver</p>
            </div>
          </div>
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid h-auto w-full grid-cols-1 bg-transparent p-0">
              <TabsTrigger value="download" className="justify-start"><LinkIcon data-icon="inline-start" />Download</TabsTrigger>
              <TabsTrigger value="history" className="justify-start"><HistoryIcon data-icon="inline-start" />History</TabsTrigger>
              <TabsTrigger value="settings" className="justify-start"><SettingsIcon data-icon="inline-start" />Settings</TabsTrigger>
              <TabsTrigger value="help" className="justify-start"><InfoIcon data-icon="inline-start" />Help</TabsTrigger>
            </TabsList>
          </Tabs>
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between border-b px-5 py-4 md:hidden">
            <div className="flex items-center gap-2 font-semibold">
              <img className="size-7 rounded-md object-cover" src={unmuzeIcon} alt="" />
              Unmuze
            </div>
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList>
                <TabsTrigger value="download">Save</TabsTrigger>
                <TabsTrigger value="history">History</TabsTrigger>
                <TabsTrigger value="settings">Settings</TabsTrigger>
                <TabsTrigger value="help">Help</TabsTrigger>
              </TabsList>
            </Tabs>
          </header>

          <div className="flex-1 p-5 md:p-8">
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
                  mode={mode}
                  setMode={setMode}
                  quality={quality}
                  setQuality={setQuality}
                  outputDir={outputDir}
                  setOutputDir={setOutputDir}
                  fileName={fileName}
                  setFileName={setFileName}
                  downloads={downloads}
                  onInspect={handleInspect}
                  onChooseFolder={handleChooseFolder}
                  onStartDownload={handleStartDownload}
                  onCancel={handleCancel}
                />
              </TabsContent>
              <TabsContent value="history">
                <HistoryScreen history={history} setHistory={setHistory} />
              </TabsContent>
              <TabsContent value="settings">
                <SettingsScreen settings={settings} onSave={handleSaveSettings} />
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

function DownloadScreen(props: {
  url: string
  setUrl: (value: string) => void
  platform: ReturnType<typeof detectPlatform>
  validationMessage: string
  checking: boolean
  error: string
  inspection: Inspection | null
  mode: DownloadMode
  setMode: (value: DownloadMode) => void
  quality: "best" | "balanced"
  setQuality: (value: "best" | "balanced") => void
  outputDir: string
  setOutputDir: (value: string) => void
  fileName: string
  setFileName: (value: string) => void
  downloads: DownloadItem[]
  onInspect: () => void
  onChooseFolder: () => void
  onStartDownload: () => void
  onCancel: (id: string) => void
}) {
  const canDownload = Boolean(props.inspection?.downloadable && !props.checking)
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-2xl font-semibold tracking-normal">Download permitted media</h2>
        <p className="text-sm text-muted-foreground">Paste a public YouTube or SoundCloud URL, inspect it, then save audio or video when allowed.</p>
      </div>
      <Alert>
        <ShieldCheckIcon data-icon="inline-start" />
        <AlertTitle>Legal-use notice</AlertTitle>
        <AlertDescription>You are responsible for having the rights to download content. Unmuze does not bypass DRM, paywalls, login requirements, encryption, region locks, or other access controls.</AlertDescription>
      </Alert>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <CardTitle>Media URL</CardTitle>
            <CardDescription>Supported: permitted public YouTube and SoundCloud URLs. Spotify links are explained but not downloaded.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field data-invalid={Boolean(props.validationMessage)}>
                <FieldLabel htmlFor="media-url">URL</FieldLabel>
                <div className="flex gap-2">
                  <Input id="media-url" value={props.url} onChange={(event) => props.setUrl(event.target.value)} placeholder="https://www.youtube.com/watch?v=..." aria-invalid={Boolean(props.validationMessage)} />
                  <Button onClick={props.onInspect} disabled={props.checking || !props.url.trim()}>
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
        <Card>
          <CardHeader>
            <CardTitle>Save options</CardTitle>
            <CardDescription>Invalid combinations are disabled automatically.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel>Format</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant={props.mode === "audio" ? "default" : "outline"} onClick={() => props.setMode("audio")} disabled={!canDownload}>
                    <MusicIcon data-icon="inline-start" />Audio
                  </Button>
                  <Button variant={props.mode === "video" ? "default" : "outline"} onClick={() => props.setMode("video")} disabled={!canDownload || !props.inspection?.formats.includes("video")}>
                    <VideoIcon data-icon="inline-start" />Video
                  </Button>
                </div>
              </Field>
              <Field>
                <FieldLabel>Quality</FieldLabel>
                <Select value={props.quality} onValueChange={(value) => props.setQuality(value as "best" | "balanced")} disabled={!canDownload}>
                  <SelectGroup>
                    <SelectItem value="best">Best available</SelectItem>
                    <SelectItem value="balanced">Balanced size</SelectItem>
                  </SelectGroup>
                </Select>
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
                <FieldDescription>Estimated type: {props.mode === "audio" ? "MP3 audio" : "MP4 video"}</FieldDescription>
              </Field>
              <Button onClick={props.onStartDownload} disabled={!canDownload}>
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

function InspectionSkeleton() {
  return (
    <Card>
      <CardContent className="flex gap-4 pt-5">
        <Skeleton className="h-24 w-36" />
        <div className="flex flex-1 flex-col gap-3">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      </CardContent>
    </Card>
  )
}

function InspectionCard({ inspection }: { inspection: Inspection }) {
  return (
    <Card>
      <CardContent className="flex gap-4 pt-5">
        {inspection.thumbnail ? <img className="h-24 w-36 rounded-md object-cover" src={inspection.thumbnail} alt="" /> : <div className="flex h-24 w-36 items-center justify-center rounded-md bg-muted"><MusicIcon /></div>}
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={inspection.downloadable ? "default" : "secondary"}>{platformLabel(inspection.platform)}</Badge>
            <Badge variant="outline">{inspection.downloadable ? "Downloadable when permitted" : "Not downloadable"}</Badge>
          </div>
          <h3 className="truncate text-lg font-semibold tracking-normal">{inspection.title || "Metadata unavailable"}</h3>
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
        <CardTitle>Download manager</CardTitle>
        <CardDescription>Active and recent downloads for this session.</CardDescription>
      </CardHeader>
      <CardContent>
        {downloads.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No active downloads.</div>
        ) : (
          <div className="flex flex-col gap-3">
            {downloads.map((item) => (
              <div key={item.id} className="rounded-md border p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={item.status === "completed" ? "default" : item.status === "failed" ? "destructive" : "secondary"}>{item.status}</Badge>
                      <span className="truncate font-medium">{item.title}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{item.message}</p>
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
          <CardTitle>History</CardTitle>
          <CardDescription>Completed downloads stored locally on this device.</CardDescription>
        </div>
        <Button variant="outline" onClick={clearHistory}>Clear</Button>
      </CardHeader>
      <CardContent>
        {history.length === 0 ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">No completed downloads yet.</div>
        ) : (
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
        )}
      </CardContent>
    </Card>
  )
}

function SettingsScreen({ settings, onSave }: { settings: Settings; onSave: (settings: Settings) => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Preferences</CardTitle>
          <CardDescription>Stored only on this computer.</CardDescription>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel>Theme</FieldLabel>
              <div className="grid grid-cols-3 gap-2">
                <Button variant={settings.theme === "light" ? "default" : "outline"} onClick={() => onSave({ ...settings, theme: "light" })}><SunIcon data-icon="inline-start" />Light</Button>
                <Button variant={settings.theme === "dark" ? "default" : "outline"} onClick={() => onSave({ ...settings, theme: "dark" })}><MoonIcon data-icon="inline-start" />Dark</Button>
                <Button variant={settings.theme === "system" ? "default" : "outline"} onClick={() => onSave({ ...settings, theme: "system" })}>System</Button>
              </div>
            </Field>
            <Field>
              <FieldLabel>Default format</FieldLabel>
              <Select value={settings.defaultFormat} onValueChange={(value) => onSave({ ...settings, defaultFormat: value as DownloadMode })}>
                <SelectGroup>
                  <SelectItem value="audio">Audio</SelectItem>
                  <SelectItem value="video">Video</SelectItem>
                </SelectGroup>
              </Select>
            </Field>
            <Field>
              <FieldLabel>Default output folder</FieldLabel>
              <Input value={settings.defaultOutputFolder} onChange={(event) => onSave({ ...settings, defaultOutputFolder: event.target.value })} />
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-md border p-4">
              <div>
                <FieldLabel>Keep download history</FieldLabel>
                <FieldDescription>History contains titles and local file paths only.</FieldDescription>
              </div>
              <Switch checked={settings.keepHistory} onCheckedChange={(checked) => onSave({ ...settings, keepHistory: checked })} />
            </div>
          </FieldGroup>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Download boundaries</CardTitle>
          <CardDescription>Protected access stays unavailable.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <ShieldCheckIcon data-icon="inline-start" />
            <AlertTitle>User responsibility</AlertTitle>
            <AlertDescription>Only download content when permitted by the source, your rights, and the platform terms. The app refuses protected platforms and access-controlled URLs.</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  )
}

function HelpScreen() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>What Unmuze does</CardTitle>
          <CardDescription>A local desktop tool for permitted public media saves.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>Unmuze can inspect supported public YouTube and SoundCloud URLs through local tooling and save audio or video where legally permitted.</p>
          <p>It stores settings and history locally. It does not create accounts or send your library to a cloud service.</p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>What Unmuze does not do</CardTitle>
          <CardDescription>Protected access stays protected.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>It does not bypass DRM, paywalls, login restrictions, encryption, region locks, private links, or other access controls.</p>
          <p>Spotify tracks, albums, and playlists cannot be downloaded because Spotify does not expose downloadable media files for this kind of app.</p>
          <Separator />
          <p>Install `yt-dlp` and FFmpeg locally if inspection or conversion reports missing tools.</p>
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
