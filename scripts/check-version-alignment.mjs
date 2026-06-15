import { readFileSync } from "node:fs"

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

function readCargoVersion(path) {
  const cargo = readFileSync(path, "utf8")
  const match = cargo.match(/^\s*version\s*=\s*"([^"]+)"/m)
  if (!match) throw new Error(`Could not find package version in ${path}`)
  return match[1]
}

const packageVersion = readJson("package.json").version
const tauriVersion = readJson("src-tauri/tauri.conf.json").version
const cargoVersion = readCargoVersion("src-tauri/Cargo.toml")

const versions = {
  "package.json": packageVersion,
  "src-tauri/tauri.conf.json": tauriVersion,
  "src-tauri/Cargo.toml": cargoVersion,
}

const unique = new Set(Object.values(versions))
if (unique.size !== 1) {
  console.error("Version alignment check failed:")
  for (const [file, version] of Object.entries(versions)) {
    console.error(`- ${file}: ${version}`)
  }
  process.exit(1)
}

console.log(`Version alignment OK: ${packageVersion}`)
