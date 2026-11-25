import {createComponent,createEffect,createRoot,createSignal} from "solid-js"
import {contract} from "./rpc.js"
import {tuiPreferences} from "./tui-preferences.js"
import {runAgentsEditor} from "./tui-controller.js"
import {SlotPicker} from "./tui-picker.jsx"

// The native model dialog registers these action commands while it is open.
// Our picker never does, so their reachability identifies that dialog.
const nativeModelDialog=["model.dialog.provider","model.dialog.favorite","model.dialog.agent_default"]

export function observeDialogs(ctx){
  return fn=>createRoot(dispose=>{
    createEffect(()=>{
      const modal=ctx.keymap.mode.current()==="modal"
      const nativeModels=ctx.keymap.commands().some(c=>nativeModelDialog.includes(c.id))
      fn({modal,nativeModels})
    })
    return dispose
  })
}

export default {id:"manage-agents",setup(ctx) {
  let busy=false
  const prefs=tuiPreferences(ctx)
  // The palette and slash list deduplicate by command ID, not by slash name.
  // Shadow the built-in in this layer; unloading it restores native behavior.
  ctx.keymap.layer(()=>({mode:"global",priority:200,commands:[{
    id:"agent.list",title:"Manage agents",description:"Manage agents",
    group:"Agent",palette:true,slash:{name:"agents"},run:async()=>{
      if(busy)return
      busy=true
      try {
        const location=ctx.location??ctx.data.location.default()
        // Provider names label the groups; a failed sync just falls back to provider IDs.
        await ctx.data.location.provider.sync(location).catch(()=>{})
        await runAgentsEditor({api:ctx.client.rpc(contract),location,ui:ctx.ui,prefs,
          providers:()=>ctx.data.location.provider.list(location)??[],
          signal:createSignal,observe:observeDialogs(ctx),
          render:(session,extras)=>createComponent(SlotPicker,{ctx,session,...extras})})
      } catch(e){await ctx.ui.dialog.alert({title:"Manage agents",message:e.message??String(e)})}
      finally{busy=false}
    }
  }]}))
}}
