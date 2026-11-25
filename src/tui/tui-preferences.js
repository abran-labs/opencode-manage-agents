import {readFileSync} from "node:fs"
import {homedir} from "node:os"
import {join} from "node:path"

// v2.4.0 packages/tui/src/model-preference.ts stores lists of {providerID,modelID}.
// The TUI uses the global XDG state root, not the channel-specific plugin store.
function readModelPreferences(){
  try {
    return JSON.parse(readFileSync(join(process.env.XDG_STATE_HOME||join(homedir(),".local","state"),"opencode","model.json"),"utf8"))
  } catch {
    // Missing before the first native selection; malformed/unreadable is also safe to ignore.
    return undefined
  }
}

function indexByRef(models){
  const result=new Map()
  if(!Array.isArray(models))return result
  for(const model of models){
    if(typeof model?.providerID!=="string"||!model.providerID||typeof model.modelID!=="string"||!model.modelID)continue
    const ref=`${model.providerID}/${model.modelID}`
    if(!result.has(ref))result.set(ref,result.size)
  }
  return result
}

export function tuiPreferences(ctx){
  const connectID="provider.connect"
  return {
    activeAgent(){
      // Composer drafts and home agent selection are private; use the acknowledged session agent only.
      const route=ctx.ui?.router.current()
      if(route?.type!=="session")return
      const agent=ctx.data?.session.get(route.sessionID)?.agent
      if(typeof agent==="string"&&agent)return agent
    },
    rank(rows){
      // Treat the private disk format as a version-specific read-only integration.
      if(ctx.app?.version!=="2.4.0")return rows
      const preferences=readModelPreferences()
      const favorites=indexByRef(preferences?.favorite),recent=indexByRef(preferences?.recent)
      if(!favorites.size&&!recent.size)return rows
      // No managed visibility source exists in the TUI; never infer hidden from catalog status.
      return rows.map((row,index)=>{
        if(favorites.has(row.ref))return {row:{...row,group:"Favorites"},section:0,order:favorites.get(row.ref)}
        if(recent.has(row.ref))return {row:{...row,group:"Recent"},section:1,order:recent.get(row.ref)}
        return {row,section:2,order:index}
      }).sort((a,b)=>a.section-b.section||a.order-b.order).map(({row})=>row)
    },
    // SDK has no preference-only mutation; native recents can change the composer's fallback model.
    onSaved(){},
    get connect(){
      if(!ctx.keymap?.commands().some(command=>command.id===connectID))return
      return ()=>ctx.keymap.dispatch(connectID)
    },
  }
}
