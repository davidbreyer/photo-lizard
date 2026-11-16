# PhotoLizard

PhotoLizard is an offline photo gallery and journal. Browse by album or year, search photo captions and notes, or switch between original and restored images.

## Try the sample gallery

1. Copy `sample/collection.js` to `assets/collection.js`.
2. Open `Open PhotoLizard.html` in your browser.

Use desktop Edge or Chrome for **Add photos** and **Remove photo**. Select the folder containing the open gallery when the browser asks for access. Removed photos can be restored from **Removed**.

## Use with your archive

Keep the app files alongside your local catalog and images so their relative paths resolve. The catalog belongs at `assets/collection.js`. Imported originals go into `Photos by year/` and thumbnails go into `assets/thumbnails/`.

To update an existing archive, copy `Open PhotoLizard.html`, `assets/gallery.js`, `assets/archive-editor.js`, `assets/gallery.css`, and `assets/yelling-lizard-logo.png` into the corresponding locations. The sample catalog is for trying the app with demo data.

The repository tracks app source and sample data. The active catalog, photos, restorations, and backups live in the local archive.
