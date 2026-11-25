import {editAgents} from "../shared/editor-ui.js"
import {catalogRows} from "./tui-picker-model.js"
import {createPickerSession} from "./tui-picker-session.js"

// Runs one /agents edit in the terminal. Everything host-specific is injected:
//   api        RPC client for the manage-agents contract
//   ui         ctx.ui (dialog, toast)
//   prefs      tuiPreferences(ctx)
//   providers  () => provider list for group names
//   signal     solid createSignal
//   observe    see tui-picker-session.js
//   render     (session, extras) => JSX for the persistent picker dialog
export async function runAgentsEditor({api,location,ui,prefs,providers=()=>[],signal,observe,render,edit=editAgents}){
  const opts={location}
  const [rows,setRows]=signal([])
  const [agent,setAgent]=signal()
  const rank=models=>{
    const base=catalogRows(models,providers())
    try{return prefs.rank?.(base)??base}catch{return base}
  }
  // Wrap catalog so the picker lists the exact models the editor validates against.
  const wrapped={...api,catalog:async(...args)=>{
    const catalog=await api.catalog(...args)
    setRows(rank(catalog.models))
    return catalog
  }}
  async function refresh(){
    try{setRows(rank((await api.catalog({},opts)).models))}catch{}
  }
  const session=createPickerSession({signal,observe,
    show:onClose=>{ui.dialog.show(()=>render(session,{rows,connect,agent}),onClose);ui.dialog.set({size:"large"})},
    clear:()=>ui.dialog.clear(),
    connect:()=>prefs.connect?.(),
    // Pick up models from a newly connected integration.
    onResume:()=>void refresh(),
  })
  // prefs.connect is a getter over reachable commands; read it lazily so the control tracks it.
  const connect={available:()=>!!prefs.connect,run:()=>session.connect()}
  try{
    await edit({api:wrapped,location,direct:true,tabbed:true,activeAgent:prefs.activeAgent?.(),
      // Agent list: ✓ marks the session's acknowledged agent; the footer shows its effective model.
      select:async(title,options)=>{
        const value=await ui.dialog.select({title,placeholder:"Search agents",
          options:options.map(({group,meta,checked,value,title})=>({value,
            title:`${checked?"✓":" "} ${title}`,footer:meta,category:group}))})
        setAgent(options.find(o=>o.value===value)?.title)
        return value
      },
      pickNative:async settings=>{
        const result=await session.pick(settings)
        if(result&&typeof result==="object"&&result.ref){
          const ref=result.variant?`${result.ref}#${result.variant}`:result.ref
          return {...result,onSaved:()=>{try{prefs.onSaved?.(ref)}catch{}}}
        }
        return result
      },
      confirmReset:(name,chain)=>session.overlay(()=>ui.dialog.confirm({title:`Reset ${name}’s default model?`,
        message:`Remove this agent’s model override and use OpenCode’s normal model selection.${chain?" This also clears its saved fallback list.":""}`,
        label:{confirm:"Reset",cancel:"Keep model"}})),
      notify:message=>ui.toast.show({message})})
  }finally{session.end()}
}
