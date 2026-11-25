import {Command,Plugin,Slot,Style} from "@opencode/plugin/gui"
import {createComponent,createMemo,createSignal,getOwner,onCleanup,runWithOwner,untrack} from "solid-js"
import {insert,render} from "solid-js/web"
import {contract} from "./rpc.js"
import {editAgents} from "./editor-ui.js"
import {wireDesktopMenu} from "./desktop-menu.js"
import {desktopPages} from "./vendor/desktop-palette.js"
import {loadNativePicker} from "./vendor/native-picker.js"
import {agentPickerSelection} from "./agent-picker-selection.js"
import {modelSlotTabs,modelSlotStyles} from "./model-slot-tabs.js"

let nativeModules

export default Plugin.define({setup(ctx) {
  const owner=getOwner()
  const routes=new Set()
  ctx.add(Slot,{at:"session.header",render(input){
    const route={input,owner:getOwner()}
    routes.add(route);onCleanup(()=>routes.delete(route))
    return null
  }})
  let busy=false
  async function open(){
    if(busy)return
    busy=true
    const pages=desktopPages(ctx.ui,(settings,done)=>modelSlotTabs(ctx.ui,settings,done)),[title,setTitle]=createSignal("Manage agents")
    const [native,setNative]=createSignal()
    let settle,host,closed=false
    const renderEditor=()=>{
      onCleanup(()=>{closed=true;settle?.();pages.close()})
      const picking=createMemo(()=>!!native())
      const content=()=>{
        if(!picking()){
          const sr=document.createElement("div");sr.className="sr-only"
          insert(sr,createComponent(host.DialogTitleGroup,{get title(){return title()}}))
          return [sr,createComponent(host.DialogBody,{class:"command-palette-body",get children(){return createComponent(pages.view,{})}})]
        }
        try{
          const prefs=host.usePreferences()
          // Keep the native search field and list mounted when switching slots.
          // Only the active slot's selection target and checkmark change.
          const target=createMemo(()=>{
            const request=native()
            if(!request)return
            const m=agentPickerSelection(prefs,request.settings,request.done)
            onCleanup(m.cancel);return m
          })
          // Every slot shares the same catalog. Only subscribe to the slot for the
          // checkmark/variant and writes, never for sorting, filtering or grouping.
          const prefRows=keys=>keys.filter(k=>prefs.visible(k)).map(k=>prefs.find(k)).filter(Boolean)
          const model={
            list:prefs.list,current:()=>target()?.current(),visible:k=>prefs.visible(k),
            recent:()=>prefRows(prefs.recent.list()),set:(...args)=>target()?.set(...args),
            favorite:{list:()=>prefRows(prefs.favorite.list()),toggle:prefs.favorite.toggle},
            variant:{current:k=>target()?.variant.current(k),set:v=>target()?.variant.set(v)}
          }
          return createComponent(host.Picker,{model,embedded:true,hidePlanFooter:true,
            get tabs(){return ()=>{const r=native();return r&&modelSlotTabs(ctx.ui,r.settings,r.done)}},
            layer:d=>({get closing(){return d.closing},close(){},show:(...args)=>d.push(...args)}),
            get actions(){return native()?.settings.actions.map(a=>createComponent(ctx.ui.Tooltip,{value:a.title,get children(){
              return createComponent(ctx.ui.IconButton,{icon:"reset",label:a.title,disabled:a.disabled,onClick:()=>native()?.done(a.value)})
            }}))}
          })
        }catch(error){const request=untrack(native);queueMicrotask(()=>request?.fail(error));return null}
      }
      return createComponent(host.Dialog,{size:"large",class:"command-palette model-dialog",
        get children(){return content}})
    }
    let dialog
    try {
      const session=ctx.sessions.current()
      host=await (nativeModules??=loadNativePicker().catch(e=>{nativeModules=undefined;throw e}))
      const route=[...routes].find(r=>r.input.active&&r.input.session.id===session?.id&&r.input.session.server.id===session?.server.id)
      const activeAgent=route?runWithOwner(route.owner,()=>host.useLocal().agent.current()?.name):
        [...document.querySelectorAll('button[aria-label="Choose agent"]')].find(el=>el.getClientRects().length)?.textContent?.trim()
      if(route){
        // Open from the same routed Solid tree as the composer. The window plugin
        // dialog is above ModelsProvider, LocalProvider and workspace location.
        const stack=runWithOwner(route.owner,()=>{host.usePreferences();host.useLocal();return host.useDialog()})
        const key=`manage-agents:${Date.now()}`
        dialog={close:()=>stack.close(key)}
        await stack.push(renderEditor,()=>{closed=true;settle?.();pages.close()},key)
      }else dialog=ctx.dialogs.open(renderEditor)
      const present=(kind,settings)=>{
        if(closed)return Promise.resolve()
        return new Promise((resolve,reject)=>{
          const done=(value,onSaved)=>{if(settle!==done)return;settle=undefined;resolve(onSaved?{...value,onSaved}:value)}
          settle=done;setNative({kind,host,settings,done,fail:reject})
        })
      }
      await editAgents({api:(session?.server.client??ctx.client).rpc(contract),
        location:session?.directory?{directory:session.directory}:undefined,
        direct:true,tabbed:true,activeAgent,pickNative:route?settings=>present("models",settings):undefined,
        confirmReset:(name,chain)=>ctx.dialogs.confirm({title:`Reset ${name}’s default model?`,description:`Remove this agent’s model override and use OpenCode’s normal model selection.${chain?" This also clears its saved fallback list.":""}`,confirm:"Reset",cancel:"Keep model"}),
        select:(label,options,settings={search:label==="Manage agents"||label==="Choose model"})=>{
          setNative(undefined)
          setTitle(label);return pages.select(options,{...settings,title:label})
        },
        notify:title=>ctx.toast.show({title})})
    } catch(e){await ctx.dialogs.alert({title:"Manage agents",description:e.message??String(e)})}
    finally{pages.close();dialog?.close();busy=false}
  }
  async function create(){
    if(busy)return
    busy=true
    try{
      const session=ctx.sessions.current(),api=(session?.server.client??ctx.client).rpc(contract)
      const id=(await ctx.dialogs.prompt({title:"Add global agent",placeholder:"Agent name, e.g. reviewer"}))?.trim()
      if(!id)return
      const mode=await ctx.dialogs.select({title:"Agent type",options:[
        {value:"primary",title:"Primary agent",description:"Switch to it in the chat bar"},
        {value:"subagent",title:"Subagent",description:"Run it from a parent agent"}]})
      if(!mode)return
      const description=await ctx.dialogs.prompt({title:`Describe ${id}`,placeholder:"What should this agent do?",confirm:"Create agent"})
      if(!description?.trim())return
      await api.create({id,mode,description},{location:session?.directory?{directory:session.directory}:undefined})
      ctx.toast.show({title:`Created ${id}`})
    }catch(e){await ctx.dialogs.alert({title:"Add agent",description:e.message??String(e)})}
    finally{busy=false}
  }
  ctx.add(Command,()=>({id:"open",title:"Manage agents",description:"Manage agents",section:"model",slash:{name:"agents"},run:open}))
  ctx.add(Style,modelSlotStyles)
  ctx.add(Style,`[data-component="composer-suggestions"] [data-suggestion-id="agent.cycle"]{display:none!important}
    [role="menu"]:has(>[data-agents-toolbar]){box-sizing:border-box;min-width:0!important;width:min(144px,calc(100vw - 24px))}
    [role="menu"]:has(>[data-agents-toolbar]) [role="menuitemradio"]{gap:4px!important;padding-inline:6px}
    [data-agents-toolbar]{min-width:0;margin-inline:-2px}
    [data-agents-toolbar].model-dialog [data-component="search-list"] [data-slot="search-list-search"] [data-slot="text-input-v2-leading-icon"]{width:16px;padding-inline-start:0}
    [data-agent-filtered]{display:none!important}
    [data-slot="dialog-content"]:has([data-agent-palette])>[data-slot="dialog-header"]{position:absolute;width:1px;height:1px;overflow:hidden;padding:0;clip-path:inset(50%)}
    [data-slot="dialog-body"]>[data-scrollable]:has(>[data-agent-palette]){display:flex;flex-direction:column;padding:0;overflow:hidden}
    [data-agent-page-heading]{padding:8px 16px;border-bottom:1px solid var(--v2-border-border-base)}
    [data-agent-variants] button{width:100%;text-align:start}
    [data-agents-empty]{padding:6px 12px;color:var(--v2-text-text-muted);font-size:13px}`)
  return wireDesktopMenu(()=>void open(),()=>void create(),
    mount=>render(()=>createComponent(ctx.ui.Icon,{name:"magnifying-glass"}),mount,undefined,{owner}),
    (mount,icon,label,onClick)=>render(()=>createComponent(ctx.ui.Tooltip,{value:label,placement:"top",
      get children(){return createComponent(ctx.ui.IconButton,{icon,label,onClick,variant:"ghost-muted"})}
    }),mount,undefined,{owner}))
}})
