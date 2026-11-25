// Desktop's GUI SDK doesn't export DialogSelectModel. Take only the picker closure
// from the installed MIT build. Shared UI, providers and Solid contexts must be the
// running renderer's modules, not fresh bundled copies.
import {createRequire} from "node:module"
import {statSync,writeFileSync} from "node:fs"
import {posix,resolve,sep} from "node:path"
const {basename}=posix
const desktop=process.env.OPENCODE_DESKTOP
if(!desktop)throw Error("Set OPENCODE_DESKTOP to the Desktop package directory or app.asar file")
const isFile=path=>statSync(path,{throwIfNoEntry:false})?.isFile()
const archive=["","app.asar","resources/app.asar","Contents/Resources/app.asar"].map(path=>resolve(desktop,path)).find(isFile)
if(!archive)throw Error("No app.asar found at OPENCODE_DESKTOP")
const require=createRequire(import.meta.url)
const {listPackage,extractFile}=require("@electron/asar")
const parser=require("@babel/parser"),traverse=require("@babel/traverse").default
const {TraceMap,generatedPositionFor}=require("@jridgewell/trace-mapping")
const files=listPackage(archive).map(file=>file.split(sep).join("/"))
const read=f=>extractFile(archive,f.replace(/^\//,"").split("/").join(sep)).toString()
const {version}=JSON.parse(read("package.json"))
const file=files.find(f=>/^\/out\/renderer\/assets\/.*\.js$/.test(f)&&read(f).includes("data-slot=model-dialog-flyout")&&read(f).includes("dialog.model.chatgptManageUsage"))
if(!file)throw Error("Native model dialog missing from Desktop "+version)
const code=read(file),map=JSON.parse(read(file+".map")),ast=parser.parse(code,{sourceType:"module"}),trace=new TraceMap(map)
let program
traverse(ast,{Program(p){program=p;p.stop()}})
function local(source,anchor,name){
  const n=map.sources.findIndex(s=>s.endsWith(source)),lines=map.sourcesContent[n]?.split("\n")
  const index=lines?.findIndex(l=>l.includes(anchor))??-1
  if(index<0)throw Error("Desktop source map missing "+name)
  const pos=generatedPositionFor(trace,{source:map.sources[n],line:index+1,column:lines[index].indexOf(name)})
  if(pos.line===null)throw Error("Desktop source map no longer maps "+name)
  const found=code.split("\n")[pos.line-1].slice(pos.column).match(/^[\w$]+/)?.[0]
  if(!program.scope.hasOwnBinding(found))throw Error("Source map no longer identifies "+name)
  return found
}
const picker=local("/models/select-dialog.tsx","export function DialogSelectModel","DialogSelectModel")
const useLocal=local("/models/selection.tsx","use: useLocal,","useLocal")
const exports=new Map(program.node.body.filter(n=>n.type==="ExportNamedDeclaration").flatMap(n=>n.specifiers.map(s=>[s.local.name,s.exported.name])))
if(!exports.has(useLocal))throw Error("Renderer no longer exports its selection context")
const imports=new Map(),decls=new Map(),seen=new Set()
function link(module,name,alias){
  if(!imports.has(module))imports.set(module,new Map())
  imports.get(module).set(alias,name)
}
function collect(name){
  if(seen.has(name))return
  seen.add(name)
  const p=program.scope.getBinding(name).path
  if(exports.has(name))return link("./"+basename(file),exports.get(name),name)
  if(p.isImportSpecifier())return link(p.parent.source.value,p.node.imported.name,name)
  if(!p.isFunctionDeclaration()&&!p.isVariableDeclarator())throw Error("Unhandled native declaration "+name)
  decls.set(p.node.start,p)
  p.traverse({ReferencedIdentifier(ref){const id=ref.node.name,b=ref.scope.getBinding(id);if(b?.scope===program.scope)collect(id)}})
}
collect(picker);collect(useLocal)
// Resolve the real preference store as well. Reading/writing its recent and
// favorite lists must never call the active chat's model setter.
const modelsFile=files.find(f=>/^\/out\/renderer\/assets\/models-[\w-]+\.js$/.test(f)&&read(f).includes("setVisibility:"))
if(!modelsFile)throw Error("Native model preference store missing from Desktop "+version)
const modelCode=read(modelsFile)
const modelMap=JSON.parse(read(modelsFile+".map"))
const modelSource=modelMap.sources.findIndex(s=>s.endsWith("/models/models.tsx"))
const modelLines=modelMap.sourcesContent[modelSource].split("\n")
const l=modelLines.findIndex(s=>s.includes("use: useModels,"))
const loc=generatedPositionFor(new TraceMap(modelMap),{source:modelMap.sources[modelSource],line:l+1,column:modelLines[l].indexOf("useModels")})
const binding=modelCode.split("\n")[loc.line-1].slice(loc.column).match(/^[\w$]+/)[0]
const spec=parser.parse(modelCode,{sourceType:"module"}).program.body.flatMap(n=>n.specifiers??[]).find(s=>s.type==="ExportSpecifier"&&s.local.name===binding)
link("./"+basename(modelsFile),spec.exported.name,"usePreferences")
// Resolve the actual header, body and field used by this build's Manage Models.
const manageFile=files.find(f=>/^\/out\/renderer\/assets\/manage-[\w-]+\.js$/.test(f)&&read(f).includes("settings-manage-models-dialog"))
if(!manageFile)throw Error("Native Manage Models dialog missing from Desktop "+version)
const manageCode=read(manageFile)
const manageFrom=parser.parse(manageCode,{sourceType:"module"}).program.body.filter(n=>n.type==="ImportDeclaration")
for(const [name,pattern] of Object.entries({
  Dialog:/\w+\((\w+),\{size:`large`,variant:`settings`/,
  DialogHeader:/\w+\((\w+),\{hideClose:!0,/,
  DialogTitleGroup:/\w+\((\w+),\{get title\(\)\{return \w+\.t\(`dialog\.model\.manage`\)/,
  DialogBody:/\w+\((\w+),\{class:`flex min-h-0 flex-1 flex-col`/,
  TextInput:/\w+\((\w+),\{type:`search`,appearance:`base`/
})){
  const id=manageCode.match(pattern)?.[1]
  const from=manageFrom.find(n=>n.specifiers.some(s=>s.local.name===id))
  if(!from)throw Error(`Cannot identify native ${name}`)
  link(from.source.value,from.specifiers.find(s=>s.local.name===id).imported.name,"Host"+name)
}
const styles=files.filter(f=>/^\/out\/renderer\/assets\/(settings|search-list|manage)-[\w-]+\.css$/.test(f)&&code.includes("./"+basename(f))).map(f=>basename(f))
const tabsStyle=files.find(f=>/^\/out\/renderer\/assets\/tabs-[\w-]+\.css$/.test(f)&&read(f).includes("[data-component=tabs-v2][data-variant=normal]"))
if(!tabsStyle)throw Error("Native line tabs stylesheet missing")
styles.push(basename(tabsStyle))
function one(s,needle,replacement){
  if(s.split(needle).length!==2)throw Error("Picker integration point changed: "+needle)
  return s.replace(needle,replacement)
}
let pickerSearchList
function emit(p){
  let s=code.slice(p.node.start,p.node.end)
  if(p.isVariableDeclarator())s=p.parent.kind+" "+s+";"
  if(p.node.id?.name===picker){
    const arg=p.node.params[0].name
    // The editor awaits its own save. Native Manage/Connect stack above it.
    const m=s.match(/^(function [\w$]+\([\w$]+\)\{let [\w$]+=)([\w$]+\(\))/)
    if(!m)throw Error("Dialog context initialization changed")
    s=one(s,m[0],m[0].replace("{let ","{const pickerProps="+arg+";let ").replace(m[2],arg+".layer("+m[2]+")"))
    s=one(s,"get trailing(){return[","get trailing(){return[pickerProps.actions,")
    s=one(s,"get when(){return l()},get children(){return W(sl,{})}","get when(){return !pickerProps.hidePlanFooter&&l()},get children(){return W(sl,{})}")
    s=one(s,"return W(bt,{class:`command-palette model-dialog`","return W(pickerProps.embedded?(p)=>p.children:bt,{class:`command-palette model-dialog`")
    const list=s.match(/(\w+)\((\w+),W\((\w+),\{ref:\w+=>\w+=\w+,topFade:!1,/)
    if(!list)throw Error("Native model SearchList call changed")
    const [,insert,,searchList]=list
    s=one(s,list[0],list[0].replace(`W(${searchList},{`,"W(PickerSearchList,{get tabs(){return pickerProps.tabs},"))
    // Native search focus is sticky except for explicitly interactive controls.
    const focus=s.match(/(\w+)\(document,`mousedown`,(\w+)=>\{(\w+)\(\2\.target\)&&\2\.target!==(\w+)\(\)&&\2\.preventDefault\(\)\}/)
    if(!focus)throw Error("Native model focus guard changed")
    s=one(s,focus[0],focus[0].replace(`&&${focus[2]}.preventDefault()`,`&&!inPickerTabs(${focus[2]}.target)&&${focus[2]}.preventDefault()`))
    const focusIn=s.match(/,\{capture:!0\}\),\w+\(document,`focusin`,\w+=>\{.*?&&!([\w$]+)\((\w+)\.target\)&&/)
    if(!focusIn)throw Error("Native model focus redirect changed")
    s=one(s,focusIn[0],focusIn[0].replace(/&&$/,"&&!inPickerTabs("+focusIn[2]+".target)&&"))
    pickerSearchList=`
const inPickerTabs=target=>target instanceof Element&&!!target.closest('[data-slot="agent-picker-tabs"]')
function PickerSearchList(props){
  // SearchList's QueryContext provider returns a Solid child accessor.
  let list=${searchList}(props)
  while(typeof list==="function")list=list()
  const body=list.querySelector(':scope > [data-slot="search-list-body"]')
  if(!body)throw Error("Native SearchList body changed")
  let strip
  ${insert}(list,()=>{
    const restoreFocus=strip?.contains(document.activeElement)
    let tabs=props.tabs
    while(typeof tabs==="function")tabs=tabs()
    const panelID=tabs instanceof HTMLElement&&tabs.dataset.agentModelSlotTabs
    const active=panelID&&tabs.querySelector('[role="tab"][aria-selected="true"]')
    if(active){
      body.id=panelID;body.setAttribute("role","tabpanel");body.setAttribute("aria-labelledby",active.id)
    }else if(body.getAttribute("role")==="tabpanel"){
      body.removeAttribute("id");body.removeAttribute("role");body.removeAttribute("aria-labelledby")
    }
    if(tabs==null||tabs===false)return strip=undefined
    strip=document.createElement("div")
    strip.dataset.slot="agent-picker-tabs"
    ${insert}(strip,tabs)
    if(restoreFocus&&active)queueMicrotask(()=>{
      if(active.isConnected&&document.activeElement===document.body)active.focus({preventScroll:true})
    })
    return strip
  },body)
  return list
}`
  }
  return s.replaceAll("import.meta.url","assetBase").replace(/import\((['"`])(\.\/[^'"`]+)\1\)/g,(_,q,path)=>`import(new URL(${JSON.stringify(path)},assetBase).href)`)
}
const declarations=[...decls].sort(([a],[b])=>a-b).map(([,p])=>emit(p)).join("\n")
const deps=[...imports],source=`// Adapted from OpenCode Desktop ${version}; MIT, see OpenCode-LICENSE and ../THIRD_PARTY_NOTICES.md.
export async function loadNativePicker(){
const assetBase=new URL(${JSON.stringify("/assets/"+basename(file))},document.baseURI).href
for(const sheet of ${JSON.stringify(styles)}){
  const href=new URL(sheet,assetBase).href
  if(!Array.from(document.querySelectorAll('link[rel="stylesheet"]')).some(l=>l.href===href)){
    const l=document.createElement("link");l.rel="stylesheet";l.href=href;document.head.append(l)
  }
}
const [${deps.map(([_,names])=>`{${[...names].map(([alias,name])=>`${name}:${alias}`).join(",")}}`).join(",")}]=await Promise.all(${JSON.stringify(deps.map(([m])=>m))}.map(path=>import(new URL(path,assetBase).href)))
${pickerSearchList}
${declarations}
return {Dialog:HostDialog,DialogHeader:HostDialogHeader,DialogTitleGroup:HostDialogTitleGroup,DialogBody:HostDialogBody,TextInput:HostTextInput,Picker:${picker},useLocal:${useLocal},usePreferences,useDialog:${code.slice(program.scope.getBinding(picker).path.node.start).match(/^function [\w$]+\([\w$]+\)\{let [\w$]+=([\w$]+)\(\)/)[1]}}
}\n`
writeFileSync(new URL("../src/vendor/native-picker.js",import.meta.url),source)
console.log(`Included ${decls.size} native picker declarations; shared ${deps.length} renderer modules`)
