// Build the upstream palette and the single-file GUI entry, sharing Desktop's Solid runtime.
import {createRequire} from "node:module"
import {join,dirname,resolve} from "node:path"
import {fileURLToPath,pathToFileURL} from "node:url"
import {writeFileSync} from "node:fs"
const here=dirname(fileURLToPath(import.meta.url))
if(!process.env.OPENCODE_SOURCE)throw Error("Set OPENCODE_SOURCE to an OpenCode source checkout with workspace dependencies installed")
const repo=resolve(process.env.OPENCODE_SOURCE)
const fromApp=createRequire(join(repo,"packages/app/package.json"))
const load=name=>import(pathToFileURL(fromApp.resolve(name)).href)
const {build}=await load("vite")
const {default:solid}=await load("vite-plugin-solid")
const {gui}=await load("@opencode/plugin/gui/vite")
const vendor=join(here,"vendor")
const config={root:here,configFile:false,publicDir:false}
const options={write:false,emptyOutDir:false,sourcemap:false}
const notice="See LICENSE and THIRD_PARTY_NOTICES.md at the package root."
function write(bundle,dir,names){
  const output=(Array.isArray(bundle)?bundle:[bundle]).flatMap(result=>result.output)
  if(output.length!==names.length||names.some(name=>!output.some(file=>file.fileName===name))){
    throw Error(`Unexpected Vite output: ${output.map(file=>file.fileName).join(", ")}`)
  }
  for(const file of output){
    // Rolldown's region markers include paths relative to the plugin, even for external source checkouts.
    const text=file.type==="chunk"?file.code.replace(/^\/\/#(?:end)?region\b[^\r\n]*\r?\n/gm,""):file.source
    writeFileSync(join(dir,file.fileName),`/*! ${notice} */\n${text}`)
  }
}
const palette=await build({...config,plugins:[solid()],resolve:{alias:{
  "opencode-search-list":join(repo,"packages/ui/src/forms/search-list/search-list.tsx"),
  "opencode-flyout":join(repo,"packages/app/src/providers/models/select-dialog-machine.ts"),
  "@opencode/ui/icon":join(here,"palette-icon.tsx"),
}},build:{...options,outDir:vendor,minify:false,
  lib:{entry:join(here,"desktop-palette.tsx"),formats:["es"],fileName:()=>"desktop-palette.js",cssFileName:"desktop-palette"},
  rollupOptions:{external:id=>/^solid-js(?:\/|$)/.test(id)}
}})
write(palette,vendor,["desktop-palette.js","desktop-palette.css"])
const bundle=await build({...config,plugins:gui({entry:"gui.js"}),build:options})
write(bundle,here,["gui-experimental.cjs"])
