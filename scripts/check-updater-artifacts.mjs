import { readFileSync } from "node:fs"

const config = JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8"))
const releaseWorkflow = readFileSync(".github/workflows/release.yml", "utf8")

const bundle = config.bundle || {}
const updater = config.plugins?.updater || {}

const failures = []

if (bundle.createUpdaterArtifacts !== true) {
  failures.push("src-tauri/tauri.conf.json must set bundle.createUpdaterArtifacts to true.")
}

if (!Array.isArray(updater.endpoints) || updater.endpoints.length === 0) {
  failures.push("src-tauri/tauri.conf.json must define at least one updater endpoint.")
}

if (!updater.pubkey || typeof updater.pubkey !== "string") {
  failures.push("src-tauri/tauri.conf.json must include an updater public key.")
}

if (!releaseWorkflow.includes("TAURI_SIGNING_PRIVATE_KEY")) {
  failures.push(".github/workflows/release.yml must pass TAURI_SIGNING_PRIVATE_KEY to Tauri builds.")
}

if (!releaseWorkflow.includes("TAURI_SIGNING_PRIVATE_KEY_PASSWORD")) {
  failures.push(".github/workflows/release.yml must pass TAURI_SIGNING_PRIVATE_KEY_PASSWORD to Tauri builds.")
}

if (!releaseWorkflow.includes("tauri-apps/tauri-action")) {
  failures.push(".github/workflows/release.yml must build release bundles with tauri-apps/tauri-action.")
}

if (failures.length) {
  console.error("Updater artifact readiness check failed:")
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log("Updater artifact readiness OK.")
