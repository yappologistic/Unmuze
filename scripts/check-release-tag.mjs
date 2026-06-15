import { readFileSync } from "node:fs"

const version = JSON.parse(readFileSync("package.json", "utf8")).version
const expectedTag = `v${version}`
const actualTag = process.env.RELEASE_TAG

if (!actualTag) {
  throw new Error("RELEASE_TAG is required")
}

if (actualTag !== expectedTag) {
  console.error(`Release tag mismatch: expected ${expectedTag}, got ${actualTag}`)
  process.exit(1)
}

console.log(`Release tag OK: ${actualTag}`)
