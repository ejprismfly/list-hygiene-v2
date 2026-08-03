import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"
import ts from "typescript"

const source = await readFile(
  new URL("../src/lib/api/validation.ts", import.meta.url),
  "utf8"
)
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const validation = await import(
  `data:text/javascript;base64,${Buffer.from(output).toString("base64")}`
)

test("normalizes valid emails and rejects malformed input", () => {
  assert.equal(validation.normalizedEmail(" Person@Example.com "), "person@example.com")
  assert.equal(validation.normalizedEmail("not-an-email"), null)
  assert.equal(validation.normalizedEmail("a@b"), null)
})

test("accepts only configured retry values", () => {
  assert.equal(validation.oneOfNumber("12", [0, 6, 12, 24, 36]), 12)
  assert.equal(validation.oneOfNumber(-1, [0, 3, 6]), null)
  assert.equal(validation.oneOfNumber(4, [0, 3, 6]), null)
  assert.equal(validation.oneOfNumber("invalid", [0, 3, 6]), null)
})

test("bounds integer query parameters", () => {
  assert.equal(
    validation.boundedInteger(null, { fallback: 10, min: 1, max: 50 }),
    10
  )
  assert.equal(
    validation.boundedInteger("50", { fallback: 10, min: 1, max: 50 }),
    50
  )
  assert.equal(
    validation.boundedInteger("51", { fallback: 10, min: 1, max: 50 }),
    null
  )
})
