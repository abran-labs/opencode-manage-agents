import {expect,test} from "bun:test"
import {createPickerSession} from "../src/tui/tui-picker-session.js"

const signal=value=>{let v=value;return [()=>v,next=>{v=next}]}
function host(){
  const log=[]
  let onClose,listener
  const h={
    log,
    show(close){if(onClose){const prev=onClose;onClose=undefined;prev()}onClose=close;log.push("show")},
    clear(){const prev=onClose;onClose=undefined;prev?.();log.push("clear")},
    connect(){h.show(()=>log.push("native closed"));log.push("connect")},
    observe(fn){listener=fn;return ()=>{listener=undefined;log.push("unobserve")}},
    emit:state=>listener?.(state),
    escape(){const prev=onClose;onClose=undefined;prev?.()},
  }
  return h
}
const tick=()=>new Promise(r=>queueMicrotask(r))

test("one dialog mount serves many editor steps and keeps view state",async()=>{
  const h=host(),s=createPickerSession({signal,...h})
  const first=s.pick({slot:0})
  s.setView({query:"opus",selected:"p/a",tabStart:0,offset:0})
  s.choose("slot:1")
  expect(await first).toBe("slot:1")
  const second=s.pick({slot:1})
  expect(s.request().settings.slot).toBe(1)
  expect(s.view().query).toBe("opus")
  expect(h.log).toEqual(["show"])
  s.choose({ref:"p/a"})
  expect(await second).toEqual({ref:"p/a"})
  s.end()
  expect(h.log).toEqual(["show","clear"])
})

test("escape resolves the pending step as a cancel",async()=>{
  const h=host(),s=createPickerSession({signal,...h})
  const p=s.pick({slot:0})
  h.escape()
  expect(await p).toBeUndefined()
  expect(s.shown).toBe(false)
})

test("a confirm between steps replaces the picker, which remounts on the next step",async()=>{
  const h=host(),s=createPickerSession({signal,...h})
  const p=s.pick({slot:0});s.choose("inherit");await p
  await s.overlay(async()=>{h.show(()=>h.log.push("confirm closed"));h.clear()})
  expect(s.shown).toBe(false)
  s.pick({slot:0})
  expect(s.shown).toBe(true)
  expect(h.log).toEqual(["show","show","confirm closed","clear","show"])
})

test("escape while a save is in flight ends the run instead of reopening",async()=>{
  const h=host(),s=createPickerSession({signal,...h})
  const p=s.pick({slot:0});s.choose({ref:"p/a"});await p
  h.escape()
  expect(await s.pick({slot:0})).toBeUndefined()
  expect(s.shown).toBe(false)
})

test("connect keeps the pending step and returns when native dialogs end",async()=>{
  const h=host(),s=createPickerSession({signal,...h})
  let settled=false
  const p=s.pick({slot:2}).then(v=>{settled=true;return v})
  s.setView({query:"gpt",selected:"o/g",tabStart:1,offset:0})
  expect(s.connect()).toBe(true)
  expect(s.shown).toBe(false)
  h.emit({modal:true,nativeModels:false})
  await tick()
  expect(settled).toBe(false)
  h.emit({modal:false,nativeModels:false})
  await tick()
  expect(s.shown).toBe(true)
  expect(s.request().settings.slot).toBe(2)
  expect(s.view().query).toBe("gpt")
  s.choose({ref:"o/g"})
  expect(await p).toEqual({ref:"o/g"})
})

test("connect replaces the chat model dialog it opens instead of letting it change the chat",async()=>{
  const h=host(),s=createPickerSession({signal,...h})
  s.pick({slot:0})
  s.connect()
  h.emit({modal:true,nativeModels:true})
  await tick()
  expect(s.shown).toBe(true)
  expect(h.log.filter(x=>x==="native closed")).toHaveLength(1)
})

test("unreachable connect leaves the picker in place",()=>{
  const h=host(),s=createPickerSession({signal,...h,connect(){}})
  s.pick({slot:0})
  expect(s.connect()).toBe(false)
  expect(s.shown).toBe(true)
  expect(s.suspended).toBe(false)
})

test("end settles a pending step once and further picks resolve immediately",async()=>{
  const h=host(),s=createPickerSession({signal,...h})
  const p=s.pick({slot:0})
  s.end();s.end()
  expect(await p).toBeUndefined()
  expect(await s.pick({slot:0})).toBeUndefined()
  expect(h.log).toEqual(["show","clear"])
})
