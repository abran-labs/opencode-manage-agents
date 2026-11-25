import { test, expect } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { installEditor } from "../src/server/editor-server.js"
import { editAgents } from "../src/shared/editor-ui.js"
import { parse } from "../src/vendor/jsonc.js"

function fixture(setup) {
  const dir=mkdtempSync(join(tmpdir(),"manage-save-")),root=join(dir,"opencode")
  mkdirSync(root)
  const local=join(root,"local-plugins","manage-agents")
  const source=setup?setup(root):{type:"local",path:local}
  if(!setup)writeFileSync(join(root,"opencode.jsonc"),JSON.stringify({agents:{build:{model:"p/a"}},
    plugins:[{package:local}] }))
  const calls={agents:0,models:0,load:0}, previous=process.env.OPENCODE_CONFIG_DIR,xdg=process.env.XDG_CONFIG_HOME
  let api
  try {
    process.env.XDG_CONFIG_HOME=dir
    process.env.OPENCODE_CONFIG_DIR=root
    api=installEditor({location:{directory:dir},rpc:{register:(_,methods)=>methods},
      plugin:{list:async()=>({data:[{id:"manage-agents",state:{status:"active"},source}]})},
      agent:{list:async()=>{calls.agents++;return {data:[{id:"build",name:"Build"}]}}},
      model:{list:async()=>{calls.models++;return {data:[{providerID:"p",id:"a",enabled:true,variants:[]}]}}}})
  } finally {
    if(previous===undefined)delete process.env.OPENCODE_CONFIG_DIR
    else process.env.OPENCODE_CONFIG_DIR=previous
    if(xdg===undefined)delete process.env.XDG_CONFIG_HOME
    else process.env.XDG_CONFIG_HOME=xdg
  }
  return {api,calls,root,clean:()=>rmSync(dir,{recursive:true,force:true})}
}

for(const spec of ["github:abran-labs/opencode-manage-agents#v0.1.0","git+https://github.com/abran-labs/opencode-manage-agents.git#v0.1.0","./plugin dir"]) {
  test(`native string registration gains options without disturbing neighbors: ${spec}`,async()=>{
    const other={package:"github:unrelated/opencode-manage-agents",options:{keep:true}}
    const {api,root,clean}=fixture(root=>{
      writeFileSync(join(root,"opencode.json"),`{\n// keep\n"plugins":[${JSON.stringify(other)},${JSON.stringify(spec)},],\n}`)
      writeFileSync(join(root,"opencode.jsonc"),`{"commands":{}}`)
      return spec.startsWith(".")?{type:"local",path:join(root,"plugin dir")}:{type:"package",target:spec}
    })
    try{
      const editor=await api,before=await editor.load({id:"build"})
      const read=()=>readFileSync(join(root,"opencode.json"),"utf8")
      expect(before).toEqual({model:null,chain:[]})
      const original=read()
      await editor.saveState({id:"build",before,after:before})
      expect(read()).toBe(original)
      await editor.saveState({id:"build",before,after:{model:"p/a",chain:[],slotCount:2}})
      expect(read()).toContain("// keep")
      expect(parse(read()).plugins).toEqual([other,{package:spec,options:{fallbackSlotCounts:{build:2}}}])
      expect(readFileSync(join(root,"opencode.jsonc"),"utf8")).toBe(`{"commands":{}}`)
    }finally{clean()}
  })
}

for(const split of [false,true])test(`duplicate active registrations refuse edits (split=${split})`,async()=>{
  const spec="github:abran-labs/opencode-manage-agents"
  const {api,clean}=fixture(root=>{
    writeFileSync(join(root,"opencode.json"),JSON.stringify({plugins:split?[spec]:[spec,{package:spec}]}))
    if(split)writeFileSync(join(root,"opencode.jsonc"),JSON.stringify({plugins:[{package:spec}]}))
    return {type:"package",target:spec}
  })
  try{await expect((await api).load({id:"build"})).rejects.toThrow(/multiple/i)}finally{clean()}
})

test("ambiguous JSONC object keys never send edits to the wrong plugins array",async()=>{
  const target="github:abran-labs/opencode-manage-agents"
  const {api,clean}=fixture(root=>{
    writeFileSync(join(root,"opencode.jsonc"),`{"plugins":["other"],"plugins":["${target}"]}`)
    return {type:"package",target}
  })
  try{await expect((await api).load({id:"build"})).rejects.toThrow(/duplicate/i)}finally{clean()}
})

test("desktop add then remove uses one checked commit per click and no model lookup",async()=>{
  const {api,calls,clean}=fixture()
  try{
    const methods=await api
    const frames=[]
    const start=performance.now()
    await editAgents({api:{...methods,load:args=>{calls.load++;return methods.load(args)}},
      tabbed:true,select:async()=>"build",notify:()=>{},pickNative:async({slot,slots})=>{
        frames.push([slot,slots.length])
        return ["add-slot","remove-slot:2"][frames.length-1]
      }})
    if(process.env.MANAGE_AGENTS_BENCH)console.log({ms:performance.now()-start,calls})
    expect(frames).toEqual([[0,2],[2,3],[1,2]])
    expect(calls).toEqual({agents:4,models:1,load:1}) // catalog, load, two saves
    expect(await methods.load({id:"build"})).toEqual({model:"p/a",chain:[]})
  }finally{clean()}
})

test("save validates new refs, rejects stale edits, and keeps legacy response",async()=>{
  const {api,clean}=fixture()
  try{
    const methods=await api,id="build",before=await methods.load({id})
    const after={...before,slotCount:2}
    expect(await methods.save({id,before,after})).toEqual({saved:true})
    await expect(methods.save({id,before,after})).rejects.toThrow("Settings changed")
    await expect(methods.save({id,before:after,after:{model:"p/a#unknown",chain:[]}})).rejects.toThrow("no longer available")
    expect(await methods.load({id})).toEqual(after)
  }finally{clean()}
})
