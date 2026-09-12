import "./app/app.css";

import { createEditor } from "./adapters/editor";
import { downloadBook, loadBookFile } from "./adapters/file";
import { paginate } from "./adapters/pagination";
import { printBook } from "./adapters/printing";
import { draftStorage } from "./adapters/persistence";
import { startApp } from "./app/start-app";

const paginateIsolated: typeof paginate = (container, html) => paginate(container, html, { mode: "isolated" });

const editorContainer = document.getElementById("editor");
const previewContainer = document.getElementById("preview");
const printControl = document.getElementById("print");
const refreshControl = document.getElementById("refresh");
const autoRefreshControl = document.getElementById("auto-refresh");
const statusContainer = document.getElementById("status");
const downloadControl = document.getElementById("download");
const loadControl = document.getElementById("load");

if (
  !editorContainer ||
  !previewContainer ||
  !printControl ||
  !refreshControl ||
  !(autoRefreshControl instanceof HTMLInputElement) ||
  !statusContainer ||
  !downloadControl ||
  !(loadControl instanceof HTMLInputElement)
) {
  throw new Error(
    "grimoire.astro is missing #editor, #preview, #print, #refresh, #auto-refresh, #status, #download, or #load",
  );
}

startApp(
  {
    editorContainer,
    previewContainer,
    printControl,
    refreshControl,
    autoRefreshControl,
    statusContainer,
    downloadControl,
    loadControl,
  },
  {
    editor: { create: createEditor },
    preview: { paginate: paginateIsolated },
    printing: { printBook },
    draft: draftStorage,
    savedFile: { downloadBook, loadBookFile },
  },
);
