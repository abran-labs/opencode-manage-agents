import {homedir} from "node:os"
import {join} from "node:path"
import {contract} from "../shared/rpc.js"
import {globalConfig} from "./config.js"
import {addAgent} from "./add-agent.js"

export async function installEditor(ctx) {
  const root=process.env.OPENCODE_CONFIG_DIR ?? join(process.env.XDG_CONFIG_HOME || join(homedir(),".config"),"opencode")
  async function config(id) {
    const active=(await ctx.plugin.list()).data.filter(p=>p.id==="manage-agents" && p.state.status==="active")
    if(active.length!==1)throw Error("Cannot identify active Manage Agents registration")
    const {source}=active[0]
    const target=source.type==="local"?source.path:source.type==="package"?source.target:undefined
    if(!target)throw Error("Manage Agents must be registered in the global configuration")
    return globalConfig(root,target,id)
  }
  const location={directory:ctx.location.directory}
  const agents=async()=> (await ctx.agent.list({location})).data.filter(a=>!a.hidden)
  const models=async()=> (await ctx.model.list({location})).data.filter(m=>m.enabled)
  async function requireAgent(id) {
    if(!(await agents()).some(a=>a.id===id)) throw Error("Agent no longer available")
  }
  async function saveState({id,before,after}) {
    await requireAgent(id)
    const known=new Set([before.model,...before.chain])
    const added=[after.model,...after.chain].filter(ref=>ref&&!known.has(ref))
    if(added.length){
      const available=await models()
      for(const ref of added){
        const [key,variant]=ref.split("#")
        if(!available.some(m=>`${m.providerID}/${m.id}`===key && (!variant||variant==="default"||m.variants.some(v=>v.id===variant)))) throw Error("Model or variant no longer available")
      }
    }
    // config.save verifies that "before" still matches disk under the writer lock.
    return (await config(id)).save(id,before,after)
  }
  return ctx.rpc.register(contract,{
    async create({id,mode,description}){
      if((await ctx.agent.list({location})).data.some(a=>a.id.toLowerCase()===id.toLowerCase()))throw Error("An agent with that name already exists.")
      addAgent(root,id,mode,description)
      await ctx.agent.reload()
      return {created:true}
    },
    async catalog() {
      const [a,m]=await Promise.all([agents(),models()])
      return {agents:a.map(({id,name,mode,model})=>({id,name:name||id,mode,effective:model?`${model.providerID}/${model.id}${model.variant && model.variant!=="default"?"#"+model.variant:""}`:null})),
        models:m.map(x=>({ref:`${x.providerID}/${x.id}`,name:x.name,variants:x.variants.map(v=>v.id)}))}
    },
    async load({id}) { await requireAgent(id); return (await config(id)).read(id) },
    saveState,
    async save(edit) {
      await saveState(edit)
      return {saved:true}
    }
  })
}
