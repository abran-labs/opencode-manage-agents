import {expect,test} from "bun:test"
import {catalogRows,filterRows,displayItems,slotTabs,tabWindow,variantChoices,moveIndex} from "../tui-picker-model.js"

const models=[
  {ref:"anthropic/opus",name:"Claude Opus",variants:["default","high","max"]},
  {ref:"openai/gpt",name:"GPT Five",variants:[]},
  {ref:"anthropic/haiku",name:"Claude Haiku",variants:["low"]},
]

test("catalog rows carry provider groups and only named variants",()=>{
  const rows=catalogRows(models,[{id:"anthropic",name:"Anthropic"}])
  expect(rows.map(r=>[r.ref,r.group,r.variants])).toEqual([
    ["anthropic/opus","Anthropic",["high","max"]],
    ["anthropic/haiku","Anthropic",["low"]],
    ["openai/gpt","openai",[]],
  ])
  expect(catalogRows([...models,{ref:"opencode/x",name:"X",variants:[]}]).map(r=>r.provider)[0]).toBe("opencode")
})

test("empty query keeps ranked order and groups, a query ranks flat by name, ref and provider",()=>{
  const rows=catalogRows(models,[{id:"anthropic",name:"Anthropic"}])
  expect(filterRows(rows,"")).toEqual(rows)
  expect(filterRows(rows,"haiku").map(r=>r.ref)).toEqual(["anthropic/haiku"])
  expect(filterRows(rows,"cl op")[0].ref).toBe("anthropic/opus")
  expect(filterRows(rows,"cl op").map(r=>r.ref)).not.toContain("openai/gpt")
  expect(filterRows(rows,"anthropic").map(r=>r.ref)).toEqual(["anthropic/opus","anthropic/haiku"])
  expect(filterRows(rows,"zzz")).toEqual([])
  // Subsequence matches rank below substring matches.
  expect(filterRows(rows,"gpt")[0].ref).toBe("openai/gpt")
})

test("display items insert a header per group only without a query",()=>{
  const rows=[{ref:"a/1",group:"Favorites"},{ref:"a/2",group:"Favorites"},{ref:"b/1",group:"B"}]
  expect(displayItems(rows,false).map(i=>i.header??i.index)).toEqual(["Favorites",0,1,"B",2])
  expect(displayItems(rows,true).map(i=>i.header??i.index)).toEqual([0,1,2])
})

test("slot tabs expose primary, fallbacks, valid close buttons and add until twenty",()=>{
  expect(slotTabs(["p/a",null])).toEqual({tabs:[
    {index:0,label:"Primary",short:"P",ref:"p/a",close:false},
    {index:1,label:"Fallback 1",short:"F1",ref:null,close:false},
  ],add:true})
  expect(slotTabs(["p/a","p/b"]).tabs[1].close).toBe(true)
  expect(slotTabs(["p/a","p/b",null,"p/c"]).tabs.map(t=>t.close)).toEqual([false,false,false,true])
  expect(slotTabs(["p/a",null,null]).tabs.map(t=>t.close)).toEqual([false,false,true])
  expect(slotTabs(["p/a",...Array(20).fill(null)]).add).toBe(false)
})

test("tab window keeps the selected tab visible with a sticky start",()=>{
  const widths=[9,12,12,12,12,12]
  expect(tabWindow(widths,0,40,0)).toEqual({start:0,end:3})
  expect(tabWindow(widths,4,40,0)).toEqual({start:2,end:5})
  // Moving left inside the window does not scroll.
  expect(tabWindow(widths,3,40,2)).toEqual({start:2,end:5})
  expect(tabWindow(widths,1,40,2)).toEqual({start:1,end:4})
  // Always shows at least the selected tab, even when narrower than it.
  expect(tabWindow(widths,5,5,0)).toEqual({start:5,end:6})
  expect(tabWindow(widths,0,200,3)).toEqual({start:0,end:6})
})

test("variant choices mark the slot's saved level, else the model default",()=>{
  const row={ref:"p/a",variants:["low","high"]}
  expect(variantChoices(row,"p/a#high")).toEqual({choices:["default","low","high"],selected:2})
  expect(variantChoices(row,"p/b#high").selected).toBe(0)
  expect(variantChoices(row,"p/a").selected).toBe(0)
})

test("move index wraps single steps and clamps pages",()=>{
  expect(moveIndex(0,-1,5)).toBe(4)
  expect(moveIndex(4,1,5)).toBe(0)
  expect(moveIndex(2,10,5)).toBe(4)
  expect(moveIndex(2,-10,5)).toBe(0)
  expect(moveIndex(0,1,0)).toBe(0)
})

test("list window keeps the highlighted line visible and clamps wheel offsets",async()=>{
  const {listWindow}=await import("../tui-picker-model.js")
  expect(listWindow(30,0,8,0)).toEqual({start:0,end:8})
  expect(listWindow(30,12,8,0)).toEqual({start:5,end:13})
  expect(listWindow(30,6,8,5)).toEqual({start:5,end:13})
  expect(listWindow(30,2,8,5)).toEqual({start:2,end:10})
  expect(listWindow(30,-1,8,99)).toEqual({start:22,end:30})
  expect(listWindow(3,1,8,4)).toEqual({start:0,end:3})
})
