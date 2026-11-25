# Rebuilding the Desktop bundle

The Git package ships `dist/gui-experimental.cjs` and the `src/vendor/` runtime assets. Users do not need an OpenCode source checkout or Desktop archive to install the package.

To rebuild, use Node.js 22.12+ for `@electron/asar`, and Bun to run Vite and load the OpenCode GUI preset from source. Use the Bun version specified by the OpenCode checkout when installing its workspace dependencies. Install this project's build-only dependencies (`@electron/asar` 4.x, `@babel/parser` and `@babel/traverse` 7.x, and `@jridgewell/trace-mapping` 0.3.x).

```sh
bun install --frozen-lockfile
OPENCODE_DESKTOP=/path/to/app.asar npm run build:picker
OPENCODE_SOURCE=/path/to/opencode npm run build:desktop
```

- `OPENCODE_DESKTOP` also accepts a package directory with `app.asar`, `resources/app.asar`, or `Contents/Resources/app.asar`. The archive must contain the renderer chunks and their source maps. `build-native-picker.mjs` extracts and patches the model picker into `src/vendor/native-picker.js`.
- `OPENCODE_SOURCE` points to an OpenCode V2 checkout with its workspace dependencies installed. `build-palette.mjs` uses that checkout's Vite, Solid plugin, and `@opencode/plugin/gui/vite` preset. It writes `src/vendor/desktop-palette.{js,css}` and `dist/gui-experimental.cjs`. When only plugin code changes, reuse the generated native picker and rerun this step.

The native picker shares the running app's renderer modules and CSS, not copies built from source. The checked-in picker was generated against a Desktop 2.4.0 archive; it requires matching renderer chunk names and exports. Another build with the same version can have different chunk names. Regenerate it against the exact Desktop build you target and check that OpenCode loads the GUI and opens the picker before releasing. Recheck [third-party notices](../THIRD_PARTY_NOTICES.md) when switching source or Desktop versions.
