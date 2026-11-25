import { test, expect } from "bun:test"
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("reset asks before removing a primary agent’s default and fallback chain",async()=>{
  const {editAgents}=await import("../src/shared/editor-ui.js")
  const before={model:"p/a",chain:["p/a","p/b"]},saves=[],confirmations=[]
  await editAgents({api:{catalog:async()=>({agents:[{id:"build",name:"Build",mode:"primary"}],models:[]}),load:async()=>before,save:async v=>saves.push(v)},
    direct:true,select:async()=>"build",pickNative:async()=>"inherit",confirmReset:async(name,chain)=>{confirmations.push([name,chain,saves.length]);return confirmations.length===2},notify:()=>{}})
  expect(confirmations).toEqual([["Build",true,0],["Build",true,0]])
  expect(saves).toEqual([{id:"build",before,after:{model:null,chain:[]}}])
})

test("fallback panel reorders and replaces backups without changing the active agent or separate routing head",async()=>{
  const {editAgents}=await import("../src/shared/editor-ui.js")
  const before={model:"p/a",chain:["p/z","p/b","p/c"]}
  let saved,checks
  const actions=["down:0","change:0","save"]
  await editAgents({direct:true,activeAgent:"plan",api:{
    catalog:async()=>({agents:["build","plan"].map(id=>({id,name:id})),models:[]}),load:async()=>before,save:async v=>saved=v.after},
    select:async(title,rows)=>{if(title!=="Manage agents")throw Error("Unexpected action menu: "+title);checks=rows.filter(r=>r.checked).map(r=>r.value);return "build"},
    pickNative:async settings=>settings.actions?"fallbacks":{ref:"p/new",variant:"high"},
    showFallbacks:async()=>actions.shift(),notify:()=>{}})
  expect(checks).toEqual(["plan"])
  expect(saved).toEqual({model:"p/a",chain:["p/z","p/new#high","p/b"]})
})

test("desktop agent selection goes straight to models and preserves backups on save",async()=>{
  const {editAgents}=await import("../src/shared/editor-ui.js")
  const before={model:"p/a",chain:["p/a","p/b"]}
  const steps=["build","p/c"], pages=[]
  let saved
  await editAgents({direct:true,api:{catalog:async()=>({agents:[{id:"build",name:"Build"}],models:["a","b","c"].map(id=>({ref:"p/"+id,name:id,variants:[]}))}),load:async()=>before,save:async data=>{saved=data.after}},
    select:async(title,rows)=>{pages.push(title);const next=steps.shift();return rows.find(r=>r.value===next)?.value},notify:()=>{}})
  expect(pages).toEqual(["Manage agents","Build · Default model"])
  expect(saved).toEqual({model:"p/c",chain:["p/c","p/b"]})
})

test("leaving unsaved fallback edits returns to the model picker without persisting a partial chain",async()=>{
  const {editAgents}=await import("../src/shared/editor-ui.js")
  const before={model:"p/a",chain:[]}, screens=[], saves=[]
  const answers=["fallbacks",{ref:"p/b",variant:"low"},undefined], actions=["add","back"]
  await editAgents({direct:true,api:{catalog:async()=>({agents:[{id:"build",name:"Build"}],models:[]}),load:async()=>before,save:async v=>saves.push(v)},
    select:async()=>"build",pickNative:async()=>answers.shift(),confirmDiscard:async()=>true,
    showFallbacks:async p=>{screens.push(p.rows.map(r=>r.ref));return actions.shift()},notify:()=>{}})
  expect(screens).toEqual([[],["p/b#low"]])
  expect(saves).toEqual([])
})

test("empty fallback editors treat worker-quick like any other agent",async()=>{
  const {editAgents}=await import("../src/shared/editor-ui.js")
  async function screens(id){
    const result=[]
    const api={catalog:async()=>({agents:[{id,name:"Agent"}],models:[]}),load:async()=>({model:"p/a",chain:[]})}
    const select=async(title,rows)=>{
      if(title==="Manage agents")return id
      result.push(rows)
      return "cancel"
    }
    await editAgents({api,select,notify:()=>{}})
    await editAgents({api,select,direct:true,pickNative:async()=>"fallbacks",notify:()=>{},
      showFallbacks:async state=>{result.push(state)}})
    return result
  }
  expect(await screens("worker-quick")).toEqual(await screens("build"))
})

test("native picker can promote a fallback with a new thinking level without switching the chat",async()=>{
  const {editAgents}=await import("../src/shared/editor-ui.js")
  const {agentPickerSelection}=await import("../src/desktop/agent-picker-selection.js")
  const recent=[],saves=[],before={model:"p/a",chain:["p/a","p/b","p/c"]}
  await editAgents({direct:true,api:{catalog:async()=>({agents:[{id:"build",name:"Build"}],models:[]}),load:async()=>before,save:async v=>saves.push(v)},
    select:async()=>"build",notify:()=>{},pickNative:settings=>new Promise(resolve=>{
      const prefs={list:()=>[],visible:()=>true,find:()=>({variants:{low:{},high:{}}}),recent:{push:k=>recent.push(k)},favorite:{},variant:{get:()=>"low"}}
      const model=agentPickerSelection(prefs,settings,(v,onSaved)=>resolve({...v,onSaved}))
      model.set({providerID:"p",modelID:"b"},{recent:true})
      model.variant.set("high")
    })})
  expect(saves).toEqual([{id:"build",before,after:{model:"p/b#high",chain:["p/b#high","p/c"]}}])
  expect(recent).toEqual([{providerID:"p",modelID:"b"}])
})

async function tabFixture(state,run,effective="p/a#low"){
  const {editAgents}=await import("../src/shared/editor-ui.js")
  const {openConfig}=await import("../src/server/config.js")
  const dir=mkdtempSync(join(tmpdir(),"manage-agents-tabs-")),file=join(dir,"opencode.jsonc"),pkg="/example/manage-agents"
  try {
    writeFileSync(file,JSON.stringify({agents:{build:{model:state.model}},plugins:[{package:pkg,options:{
      chains:{build:state.chain},...(state.slotCount?{fallbackSlotCounts:{build:state.slotCount}}:{}),
      ...(state.positions?{fallbackPositions:{build:state.positions}}:{})}}]}))
    const config=openConfig(file,pkg),read=()=>config.read("build"),notices=[]
    const api={catalog:async()=>({agents:[{id:"build",name:"Build",mode:"primary",effective}],models:[
      {ref:"p/a",name:"A",variants:["default","low"]},{ref:"p/b",name:"B",variants:[]},{ref:"p/c",name:"C",variants:["high"]}
    ]}),load:async({id})=>config.read(id),save:async({id,before,after})=>config.save(id,before,after),
      saveState:async({id,before,after})=>config.save(id,before,after)}
    await run({
      edit:opts=>editAgents({api,direct:true,tabbed:true,select:async()=>"build",notify:title=>notices.push(title),...opts}),
      read,notices,write:after=>config.save("build",read(),after)
    })
  } finally {rmSync(dir,{recursive:true,force:true})}
}

test("tab switches do not save, and backup replacement and clearing preserve the routing head and tail",async()=>{
  const before={model:"p/a",chain:["p/head","p/b","p/c","p/d","p/tail"],slotCount:5}
  await tabFixture(before,async({edit,read,notices})=>{
    let saved=0
    const steps=[
      settings=>{expect(settings.slot).toBe(0);expect(settings.current).toBe("p/a");expect(settings.slots).toEqual(["p/a","p/b","p/c","p/d","p/tail",null]);return "slot:2"},
      settings=>{
        expect(read()).toEqual(before)
        expect(settings.slot).toBe(2)
        expect(settings.current).toBe("p/c")
        expect(settings.exclude).toEqual([])
        expect(settings.actions.map(a=>a.value)).toEqual(["clear"])
        return {ref:"p/tail",variant:"high"}
      },
      ()=>{expect(read()).toEqual(before);expect(notices).toContain("Model is already in use for this agent.");return {ref:"p/new",variant:"high",onSaved:()=>saved++}},
      settings=>{
        expect(saved).toBe(1)
        expect(settings.current).toBe("p/new#high")
        expect(read()).toEqual({...before,chain:["p/head","p/b","p/new#high","p/d","p/tail"]})
        return "clear"
      },
      settings=>{expect(settings.slots).toEqual(["p/a","p/b",null,"p/d","p/tail",null])}
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(steps).toHaveLength(0)
    expect(read()).toEqual({...before,chain:["p/head","p/b","p/d","p/tail"],positions:[1,3,4]})
  })
})

test("desktop select saves an independent third backup and reopens it in the same slot",async()=>{
  await tabFixture({model:"p/a#low",chain:[],slotCount:5},async({edit,read})=>{
    const steps=[
      (rows,settings)=>{
        expect(settings.search).toBe(true)
        expect(rows.find(r=>r.value==="p/a")).toMatchObject({checked:true,meta:"p/a",variant:"low",variants:["low"]})
        return "slot:3"
      },
      (rows,settings)=>{
        expect(settings.slot).toBe(3)
        expect(rows.map(r=>r.value)).toEqual(["p/a","p/b","p/c"])
        expect(rows.find(r=>r.value==="p/b").variants).toEqual([])
        expect(rows.some(r=>r.checked)).toBe(false)
        expect(settings.actions).toEqual([{value:"clear",title:"Clear fallback",disabled:true}])
        return {ref:"p/b"}
      },
      (rows,settings)=>{expect(settings.slot).toBe(3);expect(settings.current).toBe("p/b");expect(rows.find(r=>r.value==="p/b").checked).toBe(true)}
    ]
    await edit({select:async(title,rows,settings)=>{
      if(title==="Manage agents")return "build"
      expect(title).toBe("Choose model")
      return steps.shift()(rows,settings)
    }})
    expect(steps).toHaveLength(0)
    expect(read()).toEqual({model:"p/a#low",chain:["p/a#low","p/b"],positions:[3],slotCount:5})
    const reopened=[
      settings=>{expect(settings.slots).toEqual(["p/a#low",null,null,"p/b",null,null]);return "slot:1"},
      ()=>({ref:"p/c"}),
      settings=>{expect(settings.slots).toEqual(["p/a#low","p/c",null,"p/b",null,null])}
    ]
    await edit({pickNative:async settings=>reopened.shift()(settings)})
    expect(reopened).toHaveLength(0)
    expect(read()).toEqual({model:"p/a#low",chain:["p/a#low","p/c","p/b"],positions:[1,3],slotCount:5})
    const clear=["slot:1","clear",undefined]
    await edit({pickNative:async()=>clear.shift()})
    expect(clear).toHaveLength(0)
    expect(read()).toEqual({model:"p/a#low",chain:["p/a#low","p/b"],positions:[3],slotCount:5})
  })
})

test("adding a fallback tab persists an empty slot and stays on the new tab",async()=>{
  await tabFixture({model:"p/a",chain:[]},async({edit,read,notices})=>{
    const steps=[
      settings=>{expect(settings.slots).toEqual(["p/a",null]);return "add-slot"},
      settings=>{
        expect(settings.slot).toBe(2)
        expect(settings.slots).toEqual(["p/a",null,null])
        expect(read()).toEqual({model:"p/a",chain:[],slotCount:2})
        return {ref:"p/c"}
      },
      settings=>{expect(settings.current).toBe("p/c");expect(settings.slots).toEqual(["p/a",null,"p/c"])}
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(steps).toHaveLength(0)
    expect(notices).toEqual(["Saved Build","Saved Build"])
    expect(read()).toEqual({model:"p/a",chain:["p/a","p/c"],positions:[2],slotCount:2})
  })
})

test("middle tabs refuse to close, and closing the last visible tab renumbers sparse slots",async()=>{
  const before={model:"p/a",chain:["p/head","p/b","p/c","p/d"],positions:[1,2,4],slotCount:5}
  await tabFixture(before,async({edit,read})=>{
    const steps=[
      ()=>"slot:2",
      ()=>"remove-slot:2",
      settings=>{
        expect(read()).toEqual(before)
        expect([settings.slot,settings.current,settings.slots]).toEqual([2,"p/c",["p/a","p/b","p/c",null,"p/d",null]])
        return "remove-slot:5"
      },
      settings=>{
        expect([settings.slot,settings.slots]).toEqual([2,["p/a","p/b","p/c",null,"p/d"]])
      }
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(steps).toHaveLength(0)
    expect(read()).toEqual({model:"p/a",chain:["p/head","p/b","p/c","p/d"],positions:[1,2,4],slotCount:4})
    await edit({pickNative:async settings=>{
      expect(settings.slot).toBe(0)
      expect(settings.slots).toEqual(["p/a","p/b","p/c",null,"p/d"])
    }})
  })
})

test("middle empty tabs refuse to close, and closing the last tab clears obsolete sparse positions",async()=>{
  const before={model:"p/a",chain:["p/a","p/b","p/c"],positions:[1,3],slotCount:4}
  await tabFixture(before,async({edit,read})=>{
    const steps=[
      ()=>"slot:3",
      ()=>"remove-slot:2",
      settings=>{
        expect(read()).toEqual(before)
        expect([settings.slot,settings.current]).toEqual([3,"p/c"])
        return "remove-slot:4"
      },
      settings=>{
        expect([settings.slot,settings.current,settings.slots]).toEqual([3,"p/c",["p/a","p/b",null,"p/c"]])
        return "remove-slot:3"
      },
      settings=>{expect([settings.slot,settings.current,settings.slots]).toEqual([2,null,["p/a","p/b",null]])}
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(steps).toHaveLength(0)
    expect(read()).toEqual({model:"p/a",chain:["p/a","p/b"],slotCount:2})
  })
})

test("closing the last active backup selects its left neighbor, then leaves one empty tab",async()=>{
  await tabFixture({model:"p/a",chain:["p/head","p/b","p/c"]},async({edit,read,notices})=>{
    const steps=[
      ()=>"slot:2",
      ()=>"remove-slot:2",
      settings=>{expect([settings.slot,settings.current]).toEqual([1,"p/b"]);return "remove-slot:1"},
      settings=>{expect([settings.slot,settings.slots]).toEqual([1,["p/a",null]]);return "remove-slot:1"},
      settings=>{expect([settings.slot,settings.slots]).toEqual([1,["p/a",null]])}
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(read()).toEqual({model:"p/a",chain:[]})
    expect(notices).toEqual(["Saved Build","Saved Build"])
  })
})

test("closing visible tabs only removes the last one and preserves overflow down to one tab",async()=>{
  const backups=Array.from({length:21},(_,i)=>`p/f${i+1}`)
  await tabFixture({model:"p/a",chain:["p/head",...backups]},async({edit,read})=>{
    let count=20,middle=true
    await edit({pickNative:async settings=>{
      expect(settings.slot).toBe(0)
      expect(settings.slots).toHaveLength(count+1)
      expect(settings.slots.at(-1)).toBe(`p/f${count}`)
      if(middle){middle=false;return "remove-slot:1"}
      if(count>1){count--;return `remove-slot:${count+1}`}
    }})
    expect(read()).toEqual({model:"p/a",chain:["p/head","p/f1","p/f21"],slotCount:1})
    await edit({pickNative:async settings=>{expect(settings.slots).toEqual(["p/a","p/f1"])}})
  })
})

test("invalid and middle close actions cannot touch primary or write, and a stale last close cannot overwrite a newer count",async()=>{
  const before={model:"p/a",chain:["p/head","p/b"],slotCount:3}
  await tabFixture(before,async({edit,read,write,notices})=>{
    const concurrent={...before,slotCount:4}
    const actions=["remove-slot:0","remove-slot:4","remove-slot:1.5","remove-slot:2","remove-slot:3"]
    let calls=0
    await expect(edit({pickNative:async settings=>{
      expect(settings.slots).toEqual(["p/a","p/b",null,null])
      if(calls++)expect(read()).toEqual(before)
      const action=actions.shift()
      if(action==="remove-slot:3")write(concurrent)
      return action
    }})).rejects.toThrow("Settings changed. Reopen the editor.")
    expect(read()).toEqual(concurrent)
    expect(notices).toEqual([])
  })
})

test("add-slot stops at the twentieth visible slot",async()=>{
  await tabFixture({model:"p/a",chain:["p/a"],slotCount:20},async({edit,read})=>{
    const steps=[
      settings=>{expect(settings.slots).toHaveLength(21);return "add-slot"},
      settings=>{expect(settings.slots).toHaveLength(21);expect(settings.slot).toBe(0);expect(read()).toEqual({model:"p/a",chain:["p/a"],slotCount:20})}
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(steps).toHaveLength(0)
  })
})

test("visible slots honor an added count and keep deeper backups hidden",async()=>{
  const before={model:"p/a",chain:["p/a","p/b","p/c","p/d","p/e","p/f","p/g","p/tail"],slotCount:6}
  await tabFixture(before,async({edit,read})=>{
    const steps=[
      settings=>{expect(settings.slots).toEqual(["p/a","p/b","p/c","p/d","p/e","p/f","p/g"]);return "slot:6"},
      ()=>({ref:"p/new"}),
      settings=>{
        expect(settings.current).toBe("p/new")
        expect(read()).toEqual({model:"p/a",chain:["p/a","p/b","p/c","p/d","p/e","p/f","p/new","p/tail"],slotCount:6})
      }
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(steps).toHaveLength(0)
  })
})

test("picker refreshes before each new edit without overwriting changes made while picking",async()=>{
  await tabFixture({model:"p/a",chain:[]},async({edit,read,write})=>{
    const concurrent={model:"p/a",chain:["p/a","p/external"]}
    let callbacks=0
    const steps=[
      ()=>"slot:1",
      ()=>({ref:"p/b",onSaved:()=>callbacks++}),
      ()=>({ref:"p/c",onSaved:()=>callbacks++}),
      settings=>{expect(settings.current).toBe("p/c");write(concurrent);return {ref:"p/new",onSaved:()=>callbacks++}}
    ]
    await expect(edit({pickNative:async settings=>steps.shift()(settings)})).rejects.toThrow("Settings changed. Reopen the editor.")
    expect(steps).toHaveLength(0)
    expect(callbacks).toBe(2)
    expect(read()).toEqual(concurrent)
  })
})

test("promoting a backup to primary leaves the other backup slots intact",async()=>{
  const before={model:"p/a",chain:["p/head","p/b","p/c","p/d"],slotCount:5}
  await tabFixture(before,async({edit,read})=>{
    const steps=[
      ()=>({ref:"p/c",variant:"high"}),
      settings=>{expect(settings.slots).toEqual(["p/c#high","p/b",null,"p/d",null,null])}
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(steps).toHaveLength(0)
    expect(read()).toEqual({model:"p/c#high",chain:["p/c#high","p/b","p/d"],positions:[1,3],slotCount:5})
  })
})

test("an inherited model cannot start a chain without setting a default first",async()=>{
  await tabFixture({model:null,chain:[]},async({edit,read,notices})=>{
    const steps=[
      settings=>{
        expect(settings.current).toBe("p/a#low")
        expect(settings.actions).toEqual([{value:"inherit",title:"Reset agent default",disabled:true}])
        return "slot:1"
      },
      ()=>({ref:"p/b"}),
      ()=>"slot:0",
      ()=>({ref:"p/c"}),
      settings=>{expect(settings.current).toBe("p/c");expect(read()).toEqual({model:"p/c",chain:[]});return "add-slot"},
      ()=>({ref:"p/b"}),
      settings=>{expect(settings.current).toBe("p/b")}
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(steps).toHaveLength(0)
    expect(notices).toContain("Choose a default model before adding fallbacks.")
    expect(read()).toEqual({model:"p/c",chain:["p/c","p/b"],positions:[2],slotCount:2})
  })
})

test("clearing the only backup preserves inheritance, and resetting an explicit default requires confirmation",async()=>{
  await tabFixture({model:null,chain:["p/head","p/b"]},async({edit,read,notices})=>{
    const steps=[
      ()=>"slot:1",
      ()=>({ref:"p/head",variant:"high"}),
      ()=>({ref:"p/a"}),
      settings=>{expect(settings.current).toBe("p/b");return "clear"},
      ()=>undefined
    ]
    await edit({pickNative:async settings=>steps.shift()(settings)})
    expect(steps).toHaveLength(0)
    expect(notices.filter(n=>n==="Model is already in use for this agent.")).toHaveLength(2)
    expect(read()).toEqual({model:null,chain:[]})
  })
  const before={model:"p/a",chain:["p/a","p/b"]}
  await tabFixture(before,async({edit,read})=>{
    let confirmations=0
    await edit({pickNative:async()=> "inherit",confirmReset:async(name,chain)=>{
      expect([name,chain,read()]).toEqual(["Build",true,before])
      return ++confirmations===2
    }})
    expect(confirmations).toBe(2)
    expect(read()).toEqual({model:null,chain:[]})
  })
})

test("one scoped edit persists default + ordered fallbacks without clobbering comments, permissions, unrelated edits or stale drafts", async () => {
  const dir = mkdtempSync(join(tmpdir(),"manage-agents-test-"))
  try {
    const file = join(dir,"opencode.jsonc"), pkg = "/example/manage-agents"
    writeFileSync(file,`{\n  // preserve this\n  "agents":{"plan":{"model":"one/a","description":"keep"}},\n  "plugins":[{"package":"${pkg}","options":{"accounts":{"one":"billing"},"chains":{"plan":["one/z","two/b"]}}}]\n}`,{mode:0o600})
    const {openConfig} = await import("../src/server/config.js").catch(()=>({}))
    expect(typeof openConfig).toBe("function")
    const config = openConfig(file,pkg)
    const before = config.read("plan")
    expect(before).toEqual({model:"one/a", chain:["one/z","two/b"]})
    const after = {model:"three/c#high", chain:["three/c#high","two/b","one/a"]}
    expect(()=>config.save("plan",before,{...after,chain:["three/c#high","three/c#low"]})).toThrow()
    writeFileSync(file,readFileSync(file,"utf8").replace("keep","keep edits"))
    config.save("plan",before,after)
    expect(config.read("plan")).toEqual({...after,slotCount:2})
    expect(()=>config.save("plan",before,{model:null,chain:[]})).toThrow()
    config.save("plan",config.read("plan"),{model:null,chain:[]})
    expect(config.read("plan")).toEqual({model:null,chain:[]})
    for(const fragment of ["// preserve this","keep edits","billing"]) expect(readFileSync(file,"utf8")).toContain(fragment)
    expect(statSync(file).mode & 0o777).toBe(0o600)
  } finally { rmSync(dir,{recursive:true,force:true}) }
})

test("reordering an existing chain does not replace a separately configured head", async()=>{
  const {editAgents}=await import("../src/shared/editor-ui.js")
  const before={model:"p/a",chain:["p/z","p/b","p/c"]}
  const actions=["build","edit:0","down","save"]
  let saved
  await editAgents({api:{catalog:async()=>({agents:[{id:"build",name:"Build"}],models:[]}),load:async()=>before,save:async data=>{saved=data.after}},
    select:async()=>actions.shift(),notify:()=>{}})
  expect(saved).toEqual({model:"p/a",chain:["p/z","p/c","p/b"]})
})

test("idle restores the original model after fallback options are removed at the same location",async()=>{
  const {installFallback}=await import("../src/server/fallback.js")
  const hooks={},a={providerID:"p",id:"a"},b={providerID:"p",id:"b"}
  const session={agent:"plan",model:a}
  const ctx={location:{directory:"/reload-fixture"},options:{chains:{plan:["p/a","p/b"]}},session:{
    hook:async(k,h)=>hooks[k]=h,get:async()=>session,switchModel:async({model})=>{session.model=model}
  },model:{list:async()=>({data:[{...b,enabled:true,variants:[]}]})},provider:{get:async()=>({data:{}})},
  integration:{connection:{active:async()=>null}},event:{subscribe:async function*(){}}}
  const stop=await installFallback(ctx)
  hooks["http.response"]({kind:"primary",agent:"plan",sessionID:"s",model:a,response:new Response(null,{status:429})})
  await hooks.retry({agent:"plan",sessionID:"s",model:a,error:{status:429}})
  expect(session.model).toEqual(b)
  stop()
  delete hooks["experimental.idle"]
  const stopAgain=await installFallback({...ctx,options:{}})
  await hooks["experimental.idle"]({sessionID:"s"})
  expect(session.model).toEqual(a)
  stopAgain()
})
