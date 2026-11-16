"use strict";

let photos = [];
let removedPhotos = [];
let albums = [];
let searchIndex = [];
let byId = new Map();
let albumsByPhoto = new Map();
const photosByYear = new Map();

const number = new Intl.NumberFormat("en-US");
const date = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const content = document.querySelector("#content");
const navigation = document.querySelector("#navigation");
const queryInput = document.querySelector("#query");

function updateCollection(data) {
  photos = data.photos.filter(photo => !photo.removed);
  removedPhotos = data.photos.filter(photo => photo.removed);
  byId = new Map(photos.map(photo => [photo.id, photo]));
  albums = data.albums.map(album => {
    const visible = album.photos.filter(id => byId.has(id));
    const cover = byId.has(album.cover) ? album.cover : visible[0];
    return { ...album, photos: visible, cover };
  });

  albumsByPhoto = new Map(data.photos.map(photo => [photo.id, []]));
  for (const album of data.albums) {
    for (const id of album.photos) albumsByPhoto.get(id)?.push(album);
  }

  photosByYear.clear();
  for (const photo of photos) {
    const year = photo.taken ? photo.taken.slice(0, 4) : "undated";
    if (!photosByYear.has(year)) photosByYear.set(year, []);
    photosByYear.get(year).push(photo);
  }

  searchIndex = photos.map(photo => ({
    photo,
    words: normalize([
      photo.title, photo.caption, photo.journal, photo.taken, photo.taken && dateLabel(photo.taken),
      ...albumsByPhoto.get(photo.id).map(album => album.title),
    ].join(" ")),
  }));
  const years = Array.from(photosByYear.keys()).filter(year => year !== "undated").sort();
  const range = [...new Set([years[0], years.at(-1)])].filter(Boolean).join("–");
  document.querySelector("#summary").textContent = [
    photoCount(photos.length), number.format(albums.length) + (albums.length === 1 ? " album" : " albums"), range,
  ].filter(Boolean).join(" · ");
  navigation.querySelector('[data-view="removed"]').hidden = !removedPhotos.length;
  window.PHOTO_LIZARD_COLLECTION = data;
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function dateLabel(value) {
  return date.format(new Date(value + "T00:00:00Z"));
}

function time(value) {
  if (!value) return element("span", "", "Date unknown");
  const node = element("time", "", dateLabel(value));
  node.dateTime = value;
  return node;
}

function photoCount(count) {
  return number.format(count) + (count === 1 ? " photo" : " photos");
}

function albumHash(id) {
  return "#album/" + id;
}

function heading(title, sub, back) {
  const header = element("div", "view-heading");
  if (back) {
    const link = element("a", "route-back", "← " + back.label);
    link.href = back.href;
    header.append(link);
  }
  header.append(element("h2", "", title));
  if (sub) header.append(element("p", "muted caption", sub));
  content.append(header);
}

function thumbnail(photo, className) {
  const image = element("img", className);
  image.alt = "";
  image.src = photo.thumb;
  image.loading = "lazy";
  image.decoding = "async";
  return image;
}

function browseCards(items) {
  const grid = element("div", "grid");
  for (const item of items) {
    const card = element("article", "card");
    const link = element("a");
    link.href = item.href;
    const info = element("div", "card-info");
    info.append(
      element("h3", "card-title", item.title),
      element("p", "card-meta", photoCount(item.count)),
    );
    if (item.caption) info.append(element("p", "card-caption", item.caption));
    link.append(item.cover ? thumbnail(item.cover, "cover") : element("div", "cover empty-cover"), info);
    card.append(link);
    grid.append(card);
  }
  content.append(grid);
}

function photoCards(items, emptyMessage = "No photos to show.") {
  if (!items.length) {
    content.append(element("p", "empty", emptyMessage));
    return;
  }

  const grid = element("div", "grid photos");
  items.forEach((photo, index) => {
    const card = element("article", "card");
    const button = element("button");
    button.type = "button";
    button.dataset.index = String(index);
    const info = element("span", "card-info");
    const metadata = element("span", "card-meta");
    metadata.append(time(photo.taken));
    info.append(element("span", "card-title", photo.title), metadata);
    if (photo.caption) info.append(element("span", "card-caption", photo.caption));
    button.append(thumbnail(photo, "thumbnail"), info);
    card.append(button);
    grid.append(card);
  });
  grid.addEventListener("click", event => {
    const button = event.target.closest("button[data-index]");
    if (button) showPhoto(items, Number(button.dataset.index), button);
  });
  content.append(grid);
}

function normalize(value) {
  return value.normalize("NFKD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

function search(query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  return searchIndex
    .filter(entry => terms.every(term => entry.words.includes(term)))
    .map(entry => entry.photo);
}

function currentView() {
  const [route, value = ""] = window.location.hash.slice(1).split("/");
  switch (route) {
    case "album":
      return { name: "albums", album: albums.find(album => album.id === value) };
    case "year":
      return { name: "years", year: photosByYear.has(value) ? value : "" };
    case "search":
      try {
        return { name: "search", query: decodeURIComponent(value) };
      } catch {
        return { name: "photos" };
      }
    case "years":
    case "photos":
    case "removed":
      return { name: route };
    default:
      return { name: "albums" };
  }
}

function showView(shouldFocus = false) {
  const view = currentView();
  if (dialog.open) dialog.close();
  currentButton = null;
  content.replaceChildren();
  queryInput.value = view.query ?? "";
  for (const anchor of navigation.querySelectorAll("a")) {
    if (anchor.dataset.view === view.name) anchor.setAttribute("aria-current", "page");
    else anchor.removeAttribute("aria-current");
  }

  if (view.album) {
    const album = view.album;
    const details = photoCount(album.photos.length) + (album.caption ? "\n" + album.caption : "");
    heading(album.title, details, { href: "#albums", label: "All albums" });
    photoCards(album.photos.map(id => byId.get(id)));
  } else if (view.year) {
    const items = photosByYear.get(view.year);
    heading(view.year === "undated" ? "Undated photos" : view.year, photoCount(items.length), {
      href: "#years", label: "All years",
    });
    photoCards(items);
  } else if (view.name === "years") {
    heading("Years", "Organized by the date each photo was taken.");
    browseCards(Array.from(photosByYear, ([year, items]) => ({
      href: "#year/" + year,
      title: year === "undated" ? "Undated" : year,
      count: items.length,
      cover: items[0],
    })));
  } else if (view.name === "photos") {
    heading("All photos", photoCount(photos.length));
    photoCards(photos);
  } else if (view.name === "removed") {
    heading("Removed photos", "Open a photo to restore it to the gallery and its albums.");
    photoCards(removedPhotos, "No removed photos.");
  } else if (view.name === "search") {
    const results = search(view.query);
    heading("Search results", photoCount(results.length) + " for “" + view.query + "”");
    photoCards(results, "No photos match this search.");
  } else {
    heading("Albums");
    browseCards(albums.map(album => ({
      href: albumHash(album.id),
      title: album.title,
      count: album.photos.length,
      cover: byId.get(album.cover),
      caption: album.caption,
    })));
  }

  if (shouldFocus) {
    const title = content.querySelector("h2");
    title.tabIndex = -1;
    title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
}

const dialog = document.querySelector("#photo-dialog");
const full = document.querySelector("#full-photo");
const photoTitle = document.querySelector("#photo-title");
const photoCaption = document.querySelector("#photo-caption");
const photoDates = document.querySelector("#photo-dates");
const photoAlbums = document.querySelector("#photo-albums");
const photoJournal = document.querySelector("#photo-journal");
const journalText = document.querySelector("#journal-text");
const photoVersions = document.querySelector("#photo-versions");
const showOriginal = document.querySelector("#show-original");
const showRestored = document.querySelector("#show-restored");
const imageFile = document.querySelector("#image-file");
const recoveryNote = document.querySelector("#recovery-note");
const restoredNote = document.querySelector("#restored-note");
const previous = document.querySelector("#previous");
const next = document.querySelector("#next");
const closePhoto = document.querySelector("#close-photo");
const position = document.querySelector("#position");
const removeOrRestore = document.querySelector("#remove-or-restore");
const photoStatus = document.querySelector("#photo-status");
let currentItems = [];
let currentIndex = 0;
let currentButton = null;

function dateRow(label, value) {
  const row = element("div");
  const definition = element("dd");
  definition.append(time(value));
  row.append(element("dt", "", label), definition);
  return row;
}

function showVersion(useRestored = false) {
  const photo = currentItems[currentIndex];
  const restored = useRestored && Boolean(photo.restored);
  const file = restored ? photo.restored : photo.src;
  full.src = restored ? file : (photo.recovered || file);
  full.alt = photo.title;
  photoVersions.hidden = !photo.restored;
  showOriginal.setAttribute("aria-pressed", String(!restored));
  showRestored.setAttribute("aria-pressed", String(restored));
  recoveryNote.hidden = restored || !photo.recovered;
  restoredNote.hidden = !restored;
  imageFile.href = file;
  const versionName = restored ? "restored" : "original";
  imageFile.textContent = photo.restored ? `Open ${versionName} file ↗` : "Open image file ↗";
}

function fillDialog() {
  const photo = currentItems[currentIndex];
  showVersion();
  photoTitle.textContent = photo.title;
  photoCaption.textContent = photo.caption;
  photoCaption.hidden = !photo.caption;
  journalText.textContent = photo.journal || "";
  photoJournal.hidden = !photo.journal;
  photoDates.replaceChildren(dateRow("Taken", photo.taken));
  if (photo.uploaded) photoDates.append(dateRow("Uploaded", photo.uploaded));
  if (photo.added) photoDates.append(dateRow("Added", photo.added));
  removeOrRestore.textContent = photo.removed ? "Restore photo" : "Remove photo";
  photoStatus.hidden = true;
  photoAlbums.replaceChildren();
  for (const album of albumsByPhoto.get(photo.id)) {
    const link = element("a", "", album.title);
    link.href = albumHash(album.id);
    photoAlbums.append(link);
  }
  photoAlbums.hidden = !photoAlbums.childElementCount;
  position.textContent = number.format(currentIndex + 1) + " / " + number.format(currentItems.length);
  previous.disabled = currentIndex === 0;
  next.disabled = currentIndex === currentItems.length - 1;
  dialog.scrollTop = 0;
}

function showPhoto(items, index, button) {
  currentItems = items;
  currentIndex = index;
  currentButton = button;
  fillDialog();
  dialog.showModal();
  document.body.classList.add("dialog-open");
}

function step(amount) {
  const index = currentIndex + amount;
  if (index < 0 || index >= currentItems.length) return;
  const hadVersionFocus = photoVersions.contains(document.activeElement);
  currentIndex = index;
  fillDialog();
  if (hadVersionFocus && photoVersions.hidden) closePhoto.focus();
}

closePhoto.addEventListener("click", () => dialog.close());
previous.addEventListener("click", () => step(-1));
next.addEventListener("click", () => step(1));
showOriginal.addEventListener("click", () => showVersion());
showRestored.addEventListener("click", () => showVersion(true));
photoAlbums.addEventListener("click", event => {
  if (event.target.closest("a")) dialog.close();
});
dialog.addEventListener("keydown", event => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    step(event.key === "ArrowLeft" ? -1 : 1);
  }
});
dialog.addEventListener("close", () => {
  document.body.classList.remove("dialog-open");
  full.removeAttribute("src");
  if (currentButton?.isConnected) currentButton.focus();
});
document.querySelector("#search-form").addEventListener("submit", event => {
  event.preventDefault();
  const query = queryInput.value.trim();
  const hash = query ? "#search/" + encodeURIComponent(query) : "#photos";
  if (location.hash === hash) showView(true);
  else location.hash = hash;
});
document.querySelector(".skip-link").addEventListener("click", event => {
  event.preventDefault();
  document.querySelector("main").focus();
});
window.addEventListener("hashchange", () => showView(true));

updateCollection(window.PHOTO_LIZARD_COLLECTION);
showView();
