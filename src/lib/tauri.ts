import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import { open } from "@tauri-apps/plugin-dialog"
import type { HistoryItem, Inspection, PlaylistInspection, Settings, ToolStatus } from "@/lib/media"

const isTauri = "__TAURI_INTERNALS__" in window

export async function callBackend<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri) {
    throw new Error("This action is available in the desktop app.")
  }
  return invoke<T>(command, args)
}

export async function loadSettings() {
  return callBackend<Settings>("load_settings")
}

export async function saveSettings(settings: Settings) {
  return callBackend<Settings>("save_settings", { settings })
}

export async function loadHistory() {
  return callBackend<HistoryItem[]>("load_history")
}

export async function saveHistory(history: HistoryItem[]) {
  return callBackend<HistoryItem[]>("save_history", { history })
}

export async function checkPaths(paths: string[]) {
  return callBackend<Record<string, boolean>>("check_paths", { paths })
}

export async function getToolStatus() {
  return callBackend<ToolStatus>("get_tool_status")
}

export async function installManagedTools() {
  return callBackend<ToolStatus>("install_managed_tools")
}

export async function inspectMedia(url: string) {
  return callBackend<Inspection>("inspect_media", { request: { url } })
}

export async function inspectPlaylist(url: string) {
  return callBackend<PlaylistInspection>("inspect_playlist", { request: { url } })
}

export async function startDownload(payload: Record<string, unknown>) {
  return callBackend<string>("start_download", { request: payload })
}

export async function cancelDownload(id: string) {
  return callBackend<void>("cancel_download", { id })
}

export async function revealPath(path: string) {
  return callBackend<void>("reveal_path", { path })
}

export async function chooseFolder() {
  if (!isTauri) {
    return ""
  }
  const selected = await open({ directory: true, multiple: false })
  return typeof selected === "string" ? selected : ""
}

export function onDownloadProgress(handler: (payload: { id: string; line: string }) => void) {
  if (!isTauri) return Promise.resolve(() => undefined)
  return listen<{ id: string; line: string }>("download-progress", (event) => handler(event.payload))
}

export function onDownloadFinished(handler: (payload: { id: string; status: "completed" | "failed" | "cancelled"; path: string; message?: string }) => void) {
  if (!isTauri) return Promise.resolve(() => undefined)
  return listen<{ id: string; status: "completed" | "failed" | "cancelled"; path: string; message?: string }>("download-finished", (event) => handler(event.payload))
}
