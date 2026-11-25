// Native picker calls set(model), optionally followed by variant.set(level) in the
// same batch. Collect that selection without ever calling the composer's setters.
export function agentPickerSelection(prefs,{current,exclude=[]},complete){
  const ref=k=>`${k.providerID}/${k.modelID}`
  const excluded=new Set(exclude.filter(Boolean).map(v=>v.split("#")[0]))
  const [model,level]=current?.split("#")??[]
  const allowed=k=>!excluded.has(ref(k))&&prefs.visible(k)
  const preferred=k=>{
    const value=ref(k)===model&&level?level:prefs.variant.get(k)
    return value&&value!=="default"&&Object.hasOwn(prefs.find(k)?.variants??{},value)?value:undefined
  }
  const from=keys=>keys.filter(allowed).map(k=>prefs.find(k)).filter(Boolean)
  let pending,ended=false
  return {
    list:prefs.list,current:()=>{if(!model)return;const i=model.indexOf("/");return prefs.find({providerID:model.slice(0,i),modelID:model.slice(i+1)})},
    visible:allowed,recent:()=>from(prefs.recent.list()),
    favorite:{list:()=>from(prefs.favorite.list()),toggle:prefs.favorite.toggle},
    set(k){
      if(ended||!k||excluded.has(ref(k)))return
      const pick={key:k,ref:ref(k),variant:preferred(k)};pending=pick
      queueMicrotask(()=>{
        if(pending!==pick||ended)return
        pending=undefined;ended=true
        complete({ref:pick.ref,variant:pick.variant},()=>prefs.recent.push(k))
      })
    },
    variant:{current:k=>k?preferred(k):level,set:v=>{if(pending)pending.variant=v}},
    cancel(){ended=true;pending=undefined},
  }
}
