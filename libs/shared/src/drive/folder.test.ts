/**
 * The Drive-folder reader, tested against HTML Google actually served
 * (src/drive/__fixtures__/, captured 2026-09-04) rather than markup we invented.
 * Everything here is pure — the fetch lives in the route, so the parsing and
 * the ranking can be tested without a network.
 *
 * Run: node --test src/drive/folder.test.ts (also in `npm test -w @gwprint/shared`)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  driveThumbnailUrl,
  parseDriveUrl,
  parseFolderEntries,
  pickArtworkFile,
} from "./folder.ts";

const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

// ── parseDriveUrl ───────────────────────────────────────────────────────────

test("reads the folder id out of the link the legacy data actually stores", () => {
  assert.deepEqual(
    parseDriveUrl(
      "https://drive.google.com/drive/folders/1lMjql8_BqwArM0UfNIg5zN2-dRJFvKRF?usp=drive_link",
    ),
    { kind: "folder", id: "1lMjql8_BqwArM0UfNIg5zN2-dRJFvKRF" },
  );
});

test("survives the /u/0/ account prefix Drive adds for multi-login users", () => {
  assert.deepEqual(parseDriveUrl("https://drive.google.com/drive/u/0/folders/ABC123"), {
    kind: "folder",
    id: "ABC123",
  });
});

test("a file link is a file, not a folder — the caller skips the listing step", () => {
  assert.deepEqual(parseDriveUrl("https://drive.google.com/file/d/FILE9/view?usp=sharing"), {
    kind: "file",
    id: "FILE9",
  });
});

test("the legacy ?id= form still resolves", () => {
  assert.deepEqual(parseDriveUrl("https://drive.google.com/open?id=XYZ"), {
    kind: "file",
    id: "XYZ",
  });
});

test("anything that is not Drive is not ours to resolve", () => {
  assert.equal(parseDriveUrl("https://example.com/art.png"), null);
  assert.equal(parseDriveUrl("https://docs.google.com/drive/folders/ABC"), null);
  assert.equal(parseDriveUrl(""), null);
  assert.equal(parseDriveUrl(null), null);
  assert.equal(parseDriveUrl("not a url at all"), null);
});

// ── parseFolderEntries ──────────────────────────────────────────────────────

test("reads every file in the folder, with the MIME type Drive reports", () => {
  const entries = parseFolderEntries(fixture("drive-folder-mixed.html"));
  assert.deepEqual(entries, [
    { id: "1HjZg6vUC4lgRh575DALJamVFqFfEa6vC", name: "4161766969.ai", mimeType: "application/postscript" },
    { id: "1VJtx029tg0TvNrwG1amp8N7GNfEVzW7R", name: "4161766969.tif", mimeType: "image/tiff" },
    { id: "1EYDGnMet_LkQ70WaFygR0gXaI41Zn6N_", name: "mk.png", mimeType: "image/png" },
  ]);
});

test("a folder holding one design reads as one entry", () => {
  const entries = parseFolderEntries(fixture("drive-folder-single.html"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0].name, "Personalized Sunflower (7.8in).png");
  assert.equal(entries[0].mimeType, "image/png");
});

test("a private or empty folder yields nothing rather than throwing", () => {
  assert.deepEqual(parseFolderEntries(""), []);
  assert.deepEqual(parseFolderEntries("<html><body>Sign in</body></html>"), []);
});

// ── pickArtworkFile ─────────────────────────────────────────────────────────

test("mk.png wins over the production .ai and .tif beside it", () => {
  // The real shape of a fulfilment folder: print files plus one mockup. A
  // seller scanning the table wants the mockup, not the postscript.
  const picked = pickArtworkFile(parseFolderEntries(fixture("drive-folder-mixed.html")));
  assert.equal(picked?.name, "mk.png");
});

test("with no mk.*, the browser-renderable image wins", () => {
  const picked = pickArtworkFile([
    { id: "a", name: "art.tif", mimeType: "image/tiff" },
    { id: "b", name: "art.png", mimeType: "image/png" },
  ]);
  assert.equal(picked?.id, "b");
});

test("a folder of only print files still gets a thumbnail — Drive renders those", () => {
  const picked = pickArtworkFile([
    { id: "a", name: "job.zip", mimeType: "application/zip" },
    { id: "b", name: "job.ai", mimeType: "application/postscript" },
  ]);
  assert.equal(picked?.id, "b", "the .ai is thumbnailable; the .zip is not");
});

test("subfolders are never the artwork", () => {
  const picked = pickArtworkFile([
    { id: "a", name: "archive", mimeType: "application/vnd.google-apps.folder" },
  ]);
  assert.equal(picked, null);
});

test("nothing renderable means nothing — the caller falls back to the placeholder", () => {
  assert.equal(pickArtworkFile([]), null);
  assert.equal(pickArtworkFile([{ id: "a", name: "notes.txt", mimeType: "text/plain" }]), null);
});

test("ties break on folder order, so the same folder always picks the same file", () => {
  const entries = [
    { id: "first", name: "a.png", mimeType: "image/png" },
    { id: "second", name: "b.png", mimeType: "image/png" },
  ];
  assert.equal(pickArtworkFile(entries)?.id, "first");
  assert.equal(pickArtworkFile([...entries])?.id, "first");
});

// ── driveThumbnailUrl ───────────────────────────────────────────────────────

test("the thumbnail url carries the width, so the table asks for 64px not 4000", () => {
  assert.equal(
    driveThumbnailUrl("FILE9", 64),
    "https://drive.google.com/thumbnail?id=FILE9&sz=w64",
  );
});
