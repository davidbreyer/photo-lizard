"use strict";

(() => {
  const catalogPrefix = "window.PHOTO_LIZARD_COLLECTION = ";
  const galleryStatus = document.querySelector("#gallery-status");
  const importDialog = document.querySelector("#import-dialog");
  const importForm = document.querySelector("#import-form");
  const importFields = document.querySelector("#import-fields");
  const importFiles = document.querySelector("#import-files");
  const importAlbum = document.querySelector("#import-album");
  const importPhotos = document.querySelector("#import-photos");
  const importStatus = document.querySelector("#import-status");
  const saveImport = document.querySelector("#save-import");
  const folderPrompt = "Select the PhotoLizard folder that contains the gallery you opened.";
  const desktopBrowser = "Open PhotoLizard in desktop Edge or Chrome to save changes.";
  let selectedPhotos = [];
  let archiveFolder;

  function status(node, message = "") {
    node.textContent = message;
    node.hidden = !message;
  }

  function errorMessage(error) {
    if (error.name === "AbortError") return "The operation was canceled. You can try again.";
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "PhotoLizard needs permission to edit the selected folder. " + desktopBrowser;
    }
    if (error.name === "NoModificationAllowedError") {
      return "The catalog is being edited in another window. Try again in a moment.";
    }
    return error.message || "PhotoLizard couldn’t save the changes. Try again.";
  }

  async function readCatalog(handle) {
    const text = (await (await handle.getFile()).text()).trim();
    if (!text.startsWith(catalogPrefix) || !text.endsWith(";")) {
      throw new Error("The selected folder does not have a PhotoLizard catalog.");
    }
    const data = JSON.parse(text.slice(catalogPrefix.length, -1));
    if (!Array.isArray(data.photos) || !Array.isArray(data.albums)) {
      throw new Error("The PhotoLizard catalog is incomplete.");
    }
    return data;
  }

  async function openArchive() {
    if (archiveFolder && await archiveFolder.root.queryPermission({ mode: "readwrite" }) === "granted") {
      return archiveFolder;
    }
    if (typeof window.showDirectoryPicker !== "function") throw new Error(desktopBrowser);
    const root = await window.showDirectoryPicker({ id: "photolizard", mode: "readwrite", startIn: "documents" });
    let assets;
    let catalog;
    try {
      const launchFile = decodeURIComponent(window.location.pathname.split("/").at(-1));
      await root.getFileHandle(launchFile || "Open PhotoLizard.html");
      assets = await root.getDirectoryHandle("assets");
      catalog = await assets.getFileHandle("collection.js");
    } catch (error) {
      if (error.name === "NotFoundError") throw new Error(folderPrompt);
      throw error;
    }
    const disk = await readCatalog(catalog);
    if (JSON.stringify(disk) !== JSON.stringify(window.PHOTO_LIZARD_COLLECTION)) {
      throw new Error("That catalog differs from the one on screen. Open the gallery from the selected folder or reload this page.");
    }
    archiveFolder = { root, assets, catalog };
    return archiveFolder;
  }

  async function writeNewFile(directory, name, contents, path, created) {
    const handle = await directory.getFileHandle(name, { create: true });
    created.push({ directory, name, path });
    const writer = await handle.createWritable({ mode: "exclusive" });
    try {
      await writer.write(contents);
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => {});
      throw error;
    }
  }

  async function updateCatalog(folder, edit) {
    const created = [];
    const writer = await folder.catalog.createWritable({ mode: "exclusive" });
    let data;
    try {
      data = await readCatalog(folder.catalog);
      await edit(data, created);
      await writer.write(catalogPrefix + JSON.stringify(data) + ";\n");
      await writer.close();
    } catch (error) {
      await writer.abort().catch(() => {});
      if (created.length) {
        const saved = await readCatalog(folder.catalog).catch(() => null);
        if (saved) {
          const references = new Set(saved.photos.flatMap(photo => [photo.src, photo.thumb]));
          for (const file of created) {
            if (!references.has(file.path)) await file.directory.removeEntry(file.name).catch(() => {});
          }
        }
      }
      throw error;
    }
    updateCollection(data);
  }

  function extension(file) {
    return /\.(jpe?g|png|webp|gif|avif)$/i.exec(file.name)?.[1].toLowerCase();
  }

  async function thumbnailBlob(file) {
    const bitmap = await createImageBitmap(file).catch(() => {
      throw new Error(`Couldn’t open “${file.name}” as an image.`);
    });
    try {
      const scale = Math.min(1, 560 / bitmap.width, 420 / bitmap.height);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const thumbnail = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", 0.81));
      if (!thumbnail) throw new Error(`Couldn’t make a thumbnail for “${file.name}”.`);
      return thumbnail;
    } finally {
      bitmap.close();
    }
  }

  function today() {
    const now = new Date();
    return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0")).join("-");
  }

  async function importBatch(folder, entries, albumId) {
    const prepared = [];
    for (const entry of entries) {
      prepared.push({ ...entry, thumbnail: await thumbnailBlob(entry.file) });
    }
    const added = today();
    await updateCatalog(folder, async (data, created) => {
      const album = data.albums.find(item => item.id === albumId);
      if (albumId && !album) throw new Error("The selected album is no longer available. Reload the gallery and try again.");
      const originals = await folder.root.getDirectoryHandle("Photos by year", { create: true });
      const thumbnails = await folder.assets.getDirectoryHandle("thumbnails", { create: true });
      for (const entry of prepared) {
        const id = crypto.randomUUID();
        const year = entry.taken.slice(0, 4) || "Undated";
        const directory = await originals.getDirectoryHandle(year, { create: true });
        const suffix = extension(entry.file);
        const stem = entry.file.name.slice(0, -(suffix.length + 1)).trim();
        const safeStem = Array.from(stem.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")).slice(0, 50).join("");
        const filename = `${safeStem || "photo"}_${id}.${suffix}`;
        const thumbName = `${id}.${entry.thumbnail.type === "image/webp" ? "webp" : "png"}`;
        const src = `Photos%20by%20year/${year}/${encodeURIComponent(filename)}`;
        const thumb = `assets/thumbnails/${thumbName}`;
        await writeNewFile(directory, filename, entry.file, src, created);
        await writeNewFile(thumbnails, thumbName, entry.thumbnail, thumb, created);
        data.photos.push({ id, title: entry.title, taken: entry.taken, added, caption: entry.caption, src, thumb });
        if (album) {
          album.photos.push(id);
          if (!album.cover) album.cover = id;
        }
      }
      data.photos.sort((a, b) => (b.taken || "").localeCompare(a.taken || ""));
    });
  }

  function importField(labelText, control, className) {
    const label = element("label", className, labelText);
    label.append(control);
    return label;
  }

  function importRow(file) {
    const row = element("section", "import-photo");
    const title = element("input");
    title.value = file.name.replace(/\.[^.]*$/, "") || "Untitled";
    title.maxLength = 180;
    const taken = element("input");
    taken.type = "date";
    taken.min = "0001-01-01";
    taken.max = "9999-12-31";
    const caption = element("textarea");
    caption.rows = 2;
    row.append(
      element("h3", "", file.name),
      importField("Title", title),
      importField("Date taken (optional)", taken),
      importField("Caption (optional)", caption, "import-caption"),
    );
    importPhotos.append(row);
    return { file, title, taken, caption };
  }

  document.querySelector("#add-photos").addEventListener("click", () => {
    status(galleryStatus);
    status(importStatus);
    importForm.reset();
    importPhotos.replaceChildren();
    selectedPhotos = [];
    saveImport.disabled = true;
    importAlbum.replaceChildren(new Option("No album", ""), ...albums.map(album => new Option(album.title, album.id)));
    importAlbum.value = currentView().album?.id || "";
    importDialog.showModal();
  });

  importFiles.addEventListener("change", () => {
    importPhotos.replaceChildren();
    const files = Array.from(importFiles.files);
    const invalid = files.find(file => !extension(file));
    selectedPhotos = invalid ? [] : files.map(importRow);
    saveImport.disabled = !selectedPhotos.length;
    status(importStatus, invalid ? `“${invalid.name}” is not a supported image format.` : "");
  });

  document.querySelector("#cancel-import").addEventListener("click", () => importDialog.close());
  importDialog.addEventListener("cancel", event => {
    if (importFields.disabled) event.preventDefault();
  });

  importForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (!selectedPhotos.length || importFields.disabled) return;
    const entries = selectedPhotos.map(row => ({
      file: row.file,
      title: row.title.value.trim() || "Untitled",
      taken: row.taken.value,
      caption: row.caption.value.trim(),
    }));
    const albumId = importAlbum.value;
    importFields.disabled = true;
    status(importStatus, folderPrompt);
    try {
      const folder = await openArchive();
      status(importStatus, `Importing ${photoCount(entries.length)}…`);
      await importBatch(folder, entries, albumId);
      importDialog.close();
      status(galleryStatus, `${photoCount(entries.length)} added.`);
      const route = albumId ? albumHash(albumId) : "#photos";
      if (location.hash === route) showView(true);
      else location.hash = route;
    } catch (error) {
      status(importStatus, errorMessage(error));
    } finally {
      importFields.disabled = false;
    }
  });

  removeOrRestore.addEventListener("click", async () => {
    const selected = currentItems[currentIndex];
    const remove = !selected.removed;
    removeOrRestore.disabled = true;
    status(photoStatus, folderPrompt);
    try {
      const folder = await openArchive();
      status(photoStatus, "Saving…");
      await updateCatalog(folder, data => {
        const photo = data.photos.find(item => item.id === selected.id);
        if (!photo) throw new Error("This photo is no longer in the catalog. Reload the gallery and try again.");
        if (remove) photo.removed = true;
        else delete photo.removed;
      });
      status(galleryStatus, remove ? "Photo moved to Removed. Its image file stays in the archive." : "Photo restored to the gallery.");
      if (!remove && !removedPhotos.length && location.hash === "#removed") location.hash = "#photos";
      else showView(true);
    } catch (error) {
      status(dialog.open ? photoStatus : galleryStatus, errorMessage(error));
    } finally {
      removeOrRestore.disabled = false;
    }
  });
})();
