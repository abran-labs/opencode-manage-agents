import {DEFAULT_FALLBACK_SLOTS,MAX_FALLBACK_SLOTS,canCloseFallback,clampFallbackSlots} from "./slot-limits.js"

// Shared interaction flow. The two clients supply their own native searchable dialogs.
export async function editAgents({api,location,select,notify,direct=false,tabbed=false,pickNative,showFallbacks,activeAgent,confirmDiscard,confirmReset}) {
  const opts={location}
  const {agents,models}=await api.catalog({},opts)
  const choice=(value,title,description="",group="")=>({value,title,description,group})
  async function pickModel(exclude=[]) {
    if(pickNative){
      const result=await pickNative({exclude})
      return result&&(result.variant?`${result.ref}#${result.variant}`:result.ref)
    }
    const excluded=new Set(exclude.filter(Boolean).map(x=>x.split("#")[0]))
    const list=models.filter(m=>!excluded.has(m.ref))
    if(!list.length){notify("No other models available");return}
    const key=await select("Choose model",list.map(m=>choice(m.ref,m.name,m.ref,m.ref.split("/")[0])))
    if(!key) return
    return withVariant(list.find(m=>m.ref===key))
  }
  async function withVariant(item) {
    const key=item.ref,variants=item.variants.filter(v=>v!=="default")
    if(!variants.length) return key
    const v=await select("Choose variant",[choice("default","Model default"),...variants.map(v=>choice(v,v))])
    return v && (v==="default"?key:`${key}#${v}`)
  }
  const label=ref=>models.find(m=>m.ref===ref?.split("#")[0])?.name??ref
  const id=await select("Manage agents",agents.map(a=>({...choice(a.id,a.name,a.effective??"No explicit model",a.mode==="subagent"?"Subagents":"Primary agents"),...(direct||tabbed?{meta:label(a.effective)??"Inherited",checked:a.id===activeAgent}:{})})))
  if(!id) return
  const agent=agents.find(a=>a.id===id)
  if(tabbed){
    let before=await api.load({id},opts),slot=0
    const key=ref=>ref?.split("#")[0]
    async function saveTab(after,onSaved,refresh=true){
      const edit={id,before,after}
      const fast=refresh && typeof api.saveState==="function"
      if(fast)before=await api.saveState(edit,opts)
      else await api.save(edit,opts)
      notify(`Saved ${agent.name}`)
      onSaved?.()
      if(refresh && !fast)before=await api.load({id},opts)
    }
    for(;;){
      const {model,chain,positions}=before,head=chain[0]??model
      const count=clampFallbackSlots(before.slotCount??DEFAULT_FALLBACK_SLOTS)
      const slots=[model??agent.effective??null,...Array(count).fill(null)]
      const visible=chain.slice(1,count+1)
      visible.forEach((ref,i)=>{slots[positions?.[i]??i+1]=ref})
      let tail=chain.slice(count+1)
      const current=slots[slot]
      const action=slot?{value:"clear",title:"Clear fallback"}:{value:"inherit",title:"Reset agent default"}
      if(!(slot?current:model))action.disabled=true
      const settings={current,exclude:[],slot,slots,actions:[action]}
      const selected=pickNative?await pickNative(settings):await select("Choose model",models.map(m=>{
        const checked=m.ref===key(current)
        return {...choice(m.ref,m.name,m.ref,m.ref.split("/")[0]),meta:m.ref,checked,
          variants:m.variants.filter(v=>v!=="default"),variant:checked?current.split("#")[1]:undefined}
      }),{...settings,search:true})
      if(!selected)return
      if(typeof selected==="string" && /^slot:\d+$/.test(selected)){
        const index=Number(selected.slice(5))
        if(index<=count){slot=index;continue}
      }
      // The tab bar's + records one more visible empty slot and leaves the chain alone.
      if(selected==="add-slot"){
        if(count>=MAX_FALLBACK_SLOTS)continue
        await saveTab({model,chain,slotCount:count+1})
        slot=count+1
        continue
      }
      if(selected==="inherit"){
        if(slot||!model||!await confirmReset?.(agent.name,!!chain.length))continue
        await saveTab({model:null,chain:[]},undefined,false);return
      }
      const nextSlots=slots.slice(1)
      const remove=typeof selected==="string"?/^remove-slot:([1-9]\d*)$/.exec(selected):null
      let nextCount=count
      let nextModel=model,nextHead=head
      if(remove){
        const index=Number(remove[1])
        if(!canCloseFallback(index,count,slots[index]))continue
        nextSlots.splice(index-1,1)
        nextCount=clampFallbackSlots(count-1)
        if(slot>index)slot--
        else if(slot===index)slot=Math.min(slot,nextCount)
      }else if(selected==="clear"){
        if(!slot||!current)continue
        nextSlots[slot-1]=null
      }else{
        if(typeof selected.ref!=="string"||!selected.ref)continue
        const next=selected.variant&&selected.variant!=="default"?`${selected.ref}#${selected.variant}`:selected.ref
        if(slot){
          if(!head){notify("Choose a default model before adding fallbacks.");continue}
          if([slots[0],head,...nextSlots.filter((_,i)=>i+1!==slot),...tail].some(ref=>key(ref)===key(next))){
            notify("Model is already in use for this agent.");continue
          }
          nextSlots[slot-1]=next
        }else{
          nextModel=next
          if(next!==model)nextHead=next
          for(let i=0;i<nextSlots.length;i++)if(key(nextSlots[i])===key(next))nextSlots[i]=null
          tail=tail.filter(ref=>key(ref)!==key(next))
        }
      }
      // Overflow follows visible backups in order; it fills vacancies before slots can be sparse.
      const placed=nextSlots.flatMap((ref,i)=>ref?[{ref,slot:i+1}]:[])
      const backups=[...placed.map(p=>p.ref),...tail]
      const after={model:nextModel,chain:backups.length?[nextHead,...backups]:[]}
      if(remove||before.slotCount!==undefined)after.slotCount=nextCount
      if(!tail.length&&(remove||placed.some((p,i)=>p.slot!==i+1)))after.positions=placed.map(p=>p.slot)
      await saveTab(after,selected.onSaved)
    }
  }
  const before=await api.load({id},opts)
  let model=before.model, backups=before.chain.slice(1)
  const head=()=>model===before.model && before.chain.length?before.chain[0]:model
  const original=()=>model===before.model && JSON.stringify(backups)===JSON.stringify(before.chain.slice(1))
  async function save(){
    await api.save({id,before,after:{model,chain:backups.length?[head(),...backups]:[]}},opts)
    notify(`Saved ${agent.name}`)
  }
  if(direct){
    const current=(model??agent.effective)?.split("#")[0]
    const available=models.filter(m=>!backups.some(ref=>ref.split("#")[0]===m.ref))
    for(;;){
      const actions=[choice("fallbacks","Manage fallbacks"),...(model?[choice("inherit","Reset agent default")]:[])]
      const selected=pickNative?await pickNative({current:model??agent.effective,actions}):await select(`${agent.name} · Default model`,available.map(m=>({
        ...choice(m.ref,m.name,m.ref,m.ref.split("/")[0]),checked:m.ref===current,
        variants:m.variants.filter(v=>v!=="default"),variant:m.ref===current?(model??agent.effective)?.split("#")[1]:undefined
      })),{search:true,actions})
      if(!selected)return
      if(selected==="fallbacks"){
        if(!showFallbacks)break
        const nameOf=ref=>[label(ref),ref?.split("#")[1]].filter(Boolean).join(" · ")
        for(;;){
          const action=await showFallbacks({agent:agent.name,primary:nameOf(model??agent.effective)||"Inherited model",
            rows:backups.map(ref=>({name:nameOf(ref),ref})),changed:!original(),canAdd:!!head(),
            note:!head()?"Choose a default model before adding fallbacks.":backups.length&&head()!==model?`Fallback routing starts with ${nameOf(head())}.`:undefined})
          if(!action)return
          if(action==="back"){
            if(!original() && confirmDiscard && !await confirmDiscard())continue
            backups=before.chain.slice(1);break
          }
          if(action==="save"){await save();return}
          if(action==="add"){
            if(head()){const next=await pickModel([head(),model,...backups]);if(next)backups.push(next)}
            continue
          }
          const [op,index]=action.split(":"),i=Number(index)
          if(!Number.isInteger(i)||i<0||i>=backups.length)continue
          if(op==="remove")backups.splice(i,1)
          if(op==="change"){
            const next=await pickModel([head(),model,...backups.filter((_,j)=>j!==i)])
            if(next)backups[i]=next
          }
          const j=op==="up"?i-1:op==="down"?i+1:i
          if(j!==i&&j>=0&&j<backups.length)[backups[i],backups[j]]=[backups[j],backups[i]]
        }
        continue
      }
      if(selected==="inherit"){
        if(!await confirmReset?.(agent.name,!!before.chain.length))continue
        model=null;backups=[];await save();return
      }
      const next=typeof selected==="object"?(selected.variant?`${selected.ref}#${selected.variant}`:selected.ref):await withVariant(available.find(m=>m.ref===selected))
      if(!next)continue
      model=next;backups=backups.filter(ref=>ref.split("#")[0]!==next.split("#")[0]);await save();selected.onSaved?.();return
    }
  }
  for(;;) {
    const rows=direct?[]:[choice("default","Default model",model??`No global override · ${agent.effective??"inherited"}`)]
    if(!direct && model) rows.push(choice("clear","Remove global default","Also clears this agent’s explicit fallback chain"))
    backups.forEach((ref,i)=>rows.push(choice(`edit:${i}`,`${i+1}. ${ref}`,"Change, move or remove","Fallback order")))
    rows.push(choice("add","Add fallback",model?"Tried in order after the default":"Choose a default model first"))
    if(backups.length && head()!==model)
      rows.push(choice("mismatch","Configured chain starts at a different model",head()))
    if(!original()) rows.push(choice("save","Save changes","Global settings · current chat selection stays unchanged"))
    rows.push(choice("cancel","Cancel"))
    const action=await select(`${agent.name} · ${direct?"Fallbacks":"Manage models"}`,rows)
    if(!action||action==="cancel") return
    if(action==="default"){ const next=await pickModel(backups);if(next)model=next;continue }
    if(action==="clear"){model=null;backups=[];continue}
    if(action==="add"){
      if(!head()){notify("Set a global default model first");continue}
      const next=await pickModel([head(),model,...backups]);if(next)backups.push(next);continue
    }
    if(action==="save"){
      await save();return
    }
    if(!action.startsWith("edit:"))continue
    const i=Number(action.slice(5))
    const actions=[choice("change","Change model")]
    if(i>0)actions.push(choice("up","Move earlier"))
    if(i+1<backups.length)actions.push(choice("down","Move later"))
    actions.push(choice("remove","Remove fallback"))
    const edit=await select(backups[i],actions)
    if(edit==="change"){const next=await pickModel([head(),model,...backups.filter((_,j)=>j!==i)]);if(next)backups[i]=next}
    if(edit==="remove")backups.splice(i,1)
    if(edit==="up"||edit==="down"){const j=i+(edit==="up"?-1:1);[backups[i],backups[j]]=[backups[j],backups[i]]}
  }
}
