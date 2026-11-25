import {expect,test} from "bun:test"
import {mkdtempSync,readFileSync,rmSync,writeFileSync,mkdirSync} from "node:fs"
import {join} from "node:path"
import {tmpdir} from "node:os"
import {tuiPreferences} from "../src/tui/tui-preferences.js"

test("ranks native favorites and recents without mutating catalog rows or preferences",()=>{
  const root=mkdtempSync(join(tmpdir(),"manage-agents-prefs-"))
  const previous=process.env.XDG_STATE_HOME
  try {
    process.env.XDG_STATE_HOME=root
    mkdirSync(join(root,"opencode"))
    const file=join(root,"opencode","model.json")
    const native=JSON.stringify({
      favorite:[{providerID:"p",modelID:"owner/model"},null,{providerID:"p",modelID:"favorite"}],
      recent:[{providerID:"p",modelID:"favorite"},{providerID:"p",modelID:"recent"}],
      variant:{"p/recent":"high"}
    })
    writeFileSync(file,native)
    const rows=["other","recent","favorite","owner/model","last"].map(id=>Object.freeze({ref:`p/${id}`,group:"Provider",variants:["high"]}))
    const prefs=tuiPreferences({app:{version:"2.4.0"}})
    expect(prefs.rank(rows)).toEqual([
      {...rows[3],group:"Favorites"},
      {...rows[2],group:"Favorites"},
      {...rows[1],group:"Recent"},
      rows[0],rows[4],
    ])
    expect(prefs.onSaved("p/other")).toBeUndefined()
    expect(prefs.toggleFavorite).toBeUndefined()
    expect(readFileSync(file,"utf8")).toBe(native)
    writeFileSync(file,"{")
    expect(prefs.rank(rows)).toEqual(rows)
  } finally {
    if(previous===undefined)delete process.env.XDG_STATE_HOME
    else process.env.XDG_STATE_HOME=previous
    rmSync(root,{recursive:true,force:true})
  }
})

test("uses cached agent of current session only and exposes reachable native connect",()=>{
  let route={type:"session",sessionID:"active"}
  const dispatched=[],commands=[]
  const prefs=tuiPreferences({
    app:{version:"2.4.0"},
    ui:{router:{current:()=>route}},
    data:{session:{get:id=>id==="active"?{agent:"plan"}:undefined}},
    keymap:{commands:()=>commands,dispatch:id=>dispatched.push(id)}
  })
  expect(prefs.activeAgent()).toBe("plan")
  expect(prefs.connect).toBeUndefined()
  expect(prefs.manageModels).toBeUndefined()
  commands.push({id:"provider.connect"})
  prefs.connect()
  expect(dispatched).toEqual(["provider.connect"])
  route={type:"home"}
  expect(prefs.activeAgent()).toBeUndefined()
})
