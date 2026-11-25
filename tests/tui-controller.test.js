import {expect,test} from "bun:test"
import {runAgentsEditor} from "../tui-controller.js"

const signal=value=>{let v=value;return [()=>v,next=>{v=typeof next==="function"?next(v):next}]}
const tick=()=>new Promise(r=>setTimeout(r,0))

function fixture({state={model:"p/a",chain:[]},prefs={},models}={}){
  let current=structuredClone(state)
  const saves=[],shows=[],toasts=[],selects=[],confirms=[]
  let onClose,picker,observer
  const api={
    catalog:async()=>({agents:[{id:"build",name:"Build",mode:"primary",effective:"p/a"},{id:"plan",name:"Plan",mode:"primary",effective:null}],
      models:models??[{ref:"p/a",name:"A",variants:["default","high"]},{ref:"p/b",name:"B",variants:[]},{ref:"q/c",name:"C",variants:[]}]}),
    load:async()=>structuredClone(current),
    save:async({after})=>{saves.push(after);current={...after}},
  }
  const ui={
    dialog:{
      show(render,close){const prev=onClose;onClose=close;prev?.();shows.push(render);render()},
      set(){},
      clear(){const prev=onClose;onClose=undefined;prev?.()},
      select:async opts=>{selects.push(opts);return "build"},
      confirm:async opts=>{confirms.push(opts);return true},
    },
    toast:{show:t=>toasts.push(t.message)},
  }
  const render=(session,extras)=>{picker={session,...extras};return null}
  const run=()=>runAgentsEditor({api,ui,signal,render,location:{directory:"/x"},
    prefs:{rank:r=>r,activeAgent:()=>"plan",...prefs},
    providers:()=>[{id:"p",name:"Prov P"}],
    observe:fn=>{observer=fn;return ()=>{observer=undefined}}})
  // Wait until the editor is waiting on the picker.
  const step=async()=>{for(let i=0;i<50&&!picker?.session.request();i++)await tick();const r=picker.session.request();return r.settings}
  return {run,step,saves,shows,toasts,selects,confirms,get picker(){return picker},get observer(){return observer},
    escape:()=>{const prev=onClose;onClose=undefined;prev?.()},
    native:render=>ui.dialog.show(render,()=>{}),
    state:()=>current}
}

test("agent list marks the acknowledged agent and shows its model",async()=>{
  const f=fixture()
  const done=f.run()
  await f.step()
  expect(f.picker.agent()).toBe("Build")
  expect(f.selects[0].options.map(o=>[o.title,o.footer,o.category])).toEqual([
    ["  Build","A","Primary agents"],["✓ Plan","Inherited","Primary agents"]])
  f.escape()
  await done
})

test("slot edits flow through one mounted picker and save model+variant per slot",async()=>{
  const saved=[]
  const f=fixture({prefs:{onSaved:ref=>saved.push(ref)}})
  const done=f.run()
  let s=await f.step()
  expect([s.slot,s.slots]).toEqual([0,["p/a",null]])
  expect(f.picker.rows().map(r=>[r.ref,r.group,r.variants])).toEqual([["p/a","Prov P",["high"]],["p/b","Prov P",[]],["q/c","q",[]]])
  f.picker.session.choose("slot:1")
  s=await f.step()
  expect(s.slot).toBe(1)
  f.picker.session.choose({ref:"p/a",variant:"high"})
  await f.step()
  expect(f.toasts).toContain("Model is already in use for this agent.")
  f.picker.session.choose({ref:"p/b"})
  s=await f.step()
  expect(s.slots).toEqual(["p/a","p/b"])
  expect(saved).toEqual(["p/b"])
  f.picker.session.choose("add-slot")
  s=await f.step()
  expect([s.slot,s.slots]).toEqual([2,["p/a","p/b",null]])
  f.picker.session.choose("slot:0")
  await f.step()
  f.picker.session.choose({ref:"p/a",variant:"high"})
  s=await f.step()
  expect(s.current).toBe("p/a#high")
  f.picker.session.choose("remove-slot:1")
  s=await f.step()
  expect(f.saves).toHaveLength(3)
  expect([s.slot,s.slots]).toEqual([0,["p/a#high","p/b",null]])
  f.picker.session.choose("remove-slot:2")
  s=await f.step()
  expect([s.slot,s.slots]).toEqual([0,["p/a#high","p/b"]])
  // One dialog mount for the whole run.
  expect(f.shows).toHaveLength(1)
  f.escape()
  await done
  expect(f.state()).toMatchObject({model:"p/a#high",chain:["p/a#high","p/b"],slotCount:1})
})

test("reset confirmation replaces the picker; picker remounts and keeps its view",async()=>{
  const f=fixture({state:{model:"p/b",chain:["p/b","q/c"]}})
  const done=f.run()
  await f.step()
  f.picker.session.setView({query:"zzz",selected:undefined,tabStart:0,offset:0})
  f.picker.session.choose("inherit")
  await done
  expect(f.confirms).toHaveLength(1)
  expect(f.saves.at(-1)).toEqual({model:null,chain:[]})
})

test("native connect keeps the pending slot and refreshes models when it returns",async()=>{
  let models=[{ref:"p/a",name:"A",variants:[]}]
  const f=fixture({models:undefined,prefs:{get connect(){return ()=>f.native(()=>null)}}})
  const done=f.run()
  let s=await f.step()
  f.picker.session.choose("slot:1")
  s=await f.step()
  expect(f.picker.connect.available()).toBe(true)
  expect(f.picker.connect.run()).toBe(true)
  expect(f.picker.session.shown).toBe(false)
  f.observer({modal:true,nativeModels:false})
  f.observer({modal:false,nativeModels:false})
  await tick()
  expect(f.picker.session.shown).toBe(true)
  expect(f.picker.session.request().settings.slot).toBe(1)
  expect(f.saves).toEqual([])
  f.escape()
  await done
})

test("without a reachable connect the control is unavailable",async()=>{
  const f=fixture()
  const done=f.run()
  await f.step()
  expect(f.picker.connect.available()).toBe(false)
  f.escape()
  await done
})
