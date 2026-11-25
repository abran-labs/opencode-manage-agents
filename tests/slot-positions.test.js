import { test, expect } from "bun:test"
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { openConfig } from "../src/server/config.js"
import { contract } from "../src/shared/rpc.js"
import { parse } from "../src/vendor/jsonc.js"

function fixture(run,stored,metadata,counts) {
  const dir=mkdtempSync(join(tmpdir(),"manage-agents-slots-"))
  const file=join(dir,"opencode.jsonc"), pkg="/example/manage-agents"
  try {
    const positions=metadata!==undefined?`,"fallbackPositions":${metadata}`:
      stored===undefined?"":`,"fallbackPositions":{"build":${JSON.stringify(stored)},"plan":[3]}`
    const slots=counts!==undefined?`,"fallbackSlotCounts":{"build":${counts}}`:""
    writeFileSync(file,`{
  // Keep this comment
  "agents":{"build":{"model":"p/a","description":"keep"}},
  "plugins":[{"package":"${pkg}","options":{"accounts":{"p":"billing"},"chains":{"build":["p/a","p/b","p/c"],"plan":["p/a","p/d"]}${positions}${slots}}}]
}`)
    const config=openConfig(file,pkg)
    const text=()=>readFileSync(file,"utf8")
    run({
      read:()=>config.read("build"),
      save:(before,after)=>config.save("build",before,after),
      options:()=>parse(text()).plugins[0].options,
      text
    })
  } finally {rmSync(dir,{recursive:true,force:true})}
}

test("RPC state accepts optional positions and slot counts",()=>{
  const {load,save}=contract.methods
  for(const state of [load.output,save.input.properties.before,save.input.properties.after]){
    expect(state.required).toEqual(["model","chain"])
    expect(state.properties.positions).toMatchObject({type:"array",maxItems:20,items:{type:"integer",minimum:1,maximum:20}})
    expect(state.properties.slotCount).toMatchObject({type:"integer",minimum:1,maximum:20})
  }
})

test("old chains infer enough slots for configured backups and write nothing extra on a no-op",()=>{
  fixture(({read,save,text,options})=>{
    const before=read(),original=text()
    expect(before).toEqual({model:"p/a",chain:["p/a","p/b","p/c"],slotCount:2})
    save(before,before)
    expect(text()).toBe(original)
    expect(options().fallbackSlotCounts).toBeUndefined()
  })
})

test("an explicitly configured default count survives saving an unchanged layout",()=>{
  fixture(({read,save,options})=>{
    const before=read()
    expect(before).toEqual({model:"p/a",chain:["p/a","p/b","p/c"],slotCount:1})
    save(before,before)
    expect(options().fallbackSlotCounts).toEqual({build:1})
  },undefined,undefined,1)
})

test("sparse positions round-trip without changing unrelated settings",()=>{
  fixture(({read,save,options,text})=>{
    const before=read(), after={model:before.model,chain:before.chain,positions:[1,3]}
    save(before,after)
    expect(read()).toEqual({...after,slotCount:3})
    expect(options()).toEqual({
      accounts:{p:"billing"},
      chains:{build:["p/a","p/b","p/c"],plan:["p/a","p/d"]},
      fallbackPositions:{build:[1,3]}
    })
    expect(text()).toContain("// Keep this comment")
    expect(text()).toContain('"description":"keep"')
  })
})

test("removing a backup can leave its slot vacant",()=>{
  fixture(({read,save,options})=>{
    const after={model:"p/a",chain:["p/a","p/c"],positions:[3]}
    save(read(),after)
    expect(read()).toEqual({...after,slotCount:3})
    expect(options().fallbackPositions).toEqual({build:[3],plan:[3]})
  },[1,3])
})

test("explicit compact positions remove only this agent's metadata",()=>{
  fixture(({read,save,options})=>{
    const {model,chain}=read()
    save(read(),{model,chain,positions:[1,2]})
    expect(read()).toEqual({model,chain,slotCount:2})
    expect(options().fallbackPositions).toEqual({plan:[3]})
  },[1,3])
})

test("clearing positions preserves comments beside the removed entry",()=>{
  fixture(({read,save,options,text})=>{
    const {model,chain}=read()
    save(read(),{model,chain,positions:[1,2]})
    expect(options().fallbackPositions).toEqual({plan:[3]})
    expect(text()).toContain("// Keep plan's layout")
  },undefined,`{"build":[1,3],\n  // Keep plan's layout\n  "plan":[3],\n}`)
})

test("removing the last metadata entry leaves valid JSONC with trailing commas",()=>{
  fixture(({read,save})=>{
    save(read(),{model:"p/a",chain:[]})
    expect(read()).toEqual({model:"p/a",chain:[]})
  },undefined,`{"build":[1,3],}`)
})

test("a legacy editor keeps sparse positions when backups are untouched",()=>{
  fixture(({read,save})=>{
    const before=read()
    save(before,{model:"p/z",chain:["p/z","p/b","p/c"]})
    expect(read()).toEqual({model:"p/z",chain:["p/z","p/b","p/c"],positions:[1,3],slotCount:3})
  },[1,3])
})

test("a legacy backup change clears old positions even if the count still matches",()=>{
  fixture(({read,save,options})=>{
    const after={model:"p/a",chain:["p/a","p/c","p/b"]}
    save(read(),after)
    expect(read()).toEqual({...after,slotCount:2})
    expect(options().fallbackPositions).toEqual({plan:[3]})
  },[1,3])
})

test("invalid stored positions are ignored and removed on a chain change",()=>{
  fixture(({read,save,options})=>{
    expect(read()).toEqual({model:"p/a",chain:["p/a","p/b","p/c"],slotCount:2})
    save(read(),{model:"p/a",chain:["p/a","p/b"]})
    expect(options().fallbackPositions).toEqual({plan:[3]})
  },[3])
})

test("invalid supplied positions cannot overwrite a valid chain or sparse layout",()=>{
  fixture(({read,save,text})=>{
    const original=text()
    for(const positions of [null,[],[1],[0,2],[1,21],[1,2.5],[2,2],[3,1],[1,1],[1,2,3],[1,,]]){
      expect(()=>save(read(),{...read(),positions})).toThrow("Invalid fallback positions")
      expect(text()).toBe(original)
    }
  },[1,3])
})

test("positions cover only the visible slots, even with a hidden tail",()=>{
  fixture(({read,save,options})=>{
    const chain=["p/a","p/b","p/c","p/d","p/e","p/f","p/g","p/tail"]
    save(read(),{model:"p/a",chain,positions:[1,2,3,4,5,6],slotCount:6})
    expect(read()).toEqual({model:"p/a",chain,slotCount:6})
    expect(options().fallbackPositions).toBeUndefined()
    expect(()=>save(read(),{model:"p/a",chain,positions:[1,2,3,4,5,6,7],slotCount:6})).toThrow("Invalid fallback positions")
  })
})

test("sparse layouts reach the fifth and twentieth slot",()=>{
  fixture(({read,save})=>{
    const fifth={model:"p/a",chain:["p/a","p/b"],positions:[5]}
    save(read(),fifth)
    expect(read()).toEqual({...fifth,slotCount:5})
    const middle={model:"p/a",chain:["p/a","p/b","p/c","p/d"],positions:[1,4,5]}
    save(read(),middle)
    expect(read()).toEqual({...middle,slotCount:5})
    const twentieth={model:"p/a",chain:["p/a","p/b","p/c","p/d"],positions:[1,4,20]}
    save(read(),twentieth)
    expect(read()).toEqual({...twentieth,slotCount:20})
  })
})

test("the visible slots stop at twenty without truncating the chain",()=>{
  fixture(({read,save})=>{
    const chain=["p/a",...Array.from({length:21},(_,i)=>`p/x${i}`)]
    const positions=Array.from({length:20},(_,i)=>i+1)
    save(read(),{model:"p/a",chain,positions})
    expect(read()).toEqual({model:"p/a",chain,slotCount:20})
    expect(()=>save(read(),{model:"p/a",chain,positions:[...positions,21]})).toThrow("Invalid fallback positions")
    expect(()=>save(read(),{model:"p/a",chain,positions:positions.map((slot,i)=>i===19?21:slot)})).toThrow("Invalid fallback positions")
  })
})

test("an added slot count persists and clamps at twenty",()=>{
  fixture(({read,save,options})=>{
    save(read(),{model:"p/a",chain:["p/a","p/b"],slotCount:7})
    expect(read()).toEqual({model:"p/a",chain:["p/a","p/b"],slotCount:7})
    expect(options().fallbackSlotCounts).toEqual({build:7})
    save(read(),{model:"p/a",chain:["p/a","p/b"],slotCount:25})
    expect(read()).toEqual({model:"p/a",chain:["p/a","p/b"],slotCount:20})
    expect(()=>save(read(),{model:"p/a",chain:["p/a","p/b"],slotCount:6.5})).toThrow("Invalid fallback slot count")
  })
})

test("an added slot keeps the sparse layout and the chain",()=>{
  fixture(({read,save,options})=>{
    save(read(),{model:"p/a",chain:["p/a","p/b","p/c"],slotCount:7})
    expect(read()).toEqual({model:"p/a",chain:["p/a","p/b","p/c"],positions:[1,3],slotCount:7})
    expect(options().fallbackPositions).toEqual({build:[1,3],plan:[3]})
  },[1,3],undefined,6)
})

test("a legacy editor keeps an added slot count when backups are untouched",()=>{
  fixture(({read,save,options})=>{
    save(read(),{model:"p/z",chain:["p/z","p/b","p/c"]})
    expect(read()).toEqual({model:"p/z",chain:["p/z","p/b","p/c"],slotCount:8})
    expect(options().fallbackSlotCounts).toEqual({build:8})
  },undefined,undefined,8)
})

test("a legacy backup change re-infers the visible slots",()=>{
  fixture(({read,save,options})=>{
    save(read(),{model:"p/a",chain:["p/a","p/c","p/b"]})
    expect(read()).toEqual({model:"p/a",chain:["p/a","p/c","p/b"],slotCount:2})
    expect(options().fallbackSlotCounts).toEqual({})
  },undefined,undefined,8)
})

test("a long chain implies every visible slot up to the cap",()=>{
  fixture(({read,save})=>{
    const chain=["p/a",...Array.from({length:7},(_,i)=>`p/f${i}`)]
    save(read(),{model:"p/a",chain})
    expect(read()).toEqual({model:"p/a",chain,slotCount:7})
  })
})

test("a slot count change invalidates stale edits",()=>{
  fixture(({read,save})=>{
    const before=read()
    save(before,{...before,slotCount:9})
    expect(read().slotCount).toBe(9)
    expect(()=>save(before,{model:"p/a",chain:["p/a","p/b"]})).toThrow("Settings changed. Reopen the editor.")
    expect(read().slotCount).toBe(9)
  })
})

test("position-only changes invalidate stale edits",()=>{
  fixture(({read,save})=>{
    const before=read()
    save(before,{...before,positions:[2,3]})
    expect(()=>save(before,{model:"p/a",chain:["p/a","p/c"]})).toThrow("Settings changed. Reopen the editor.")
    expect(read()).toEqual({model:"p/a",chain:["p/a","p/b","p/c"],positions:[2,3],slotCount:3})
  },[1,3])
})
