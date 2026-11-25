import {test,expect} from "bun:test"
import {mkdtempSync,readFileSync,rmSync} from "node:fs"
import {tmpdir} from "node:os"
import {join} from "node:path"
test("adding an agent creates one named profile and refuses duplicates or path-like names",async()=>{
  const {addAgent}=await import("../src/server/add-agent.js").catch(()=>({}))
  expect(typeof addAgent).toBe("function")
  const root=mkdtempSync(join(tmpdir(),"add-agent-"))
  try{
    addAgent(root,"reviewer","subagent","Review changes")
    const file=join(root,"agents","reviewer.md"), original=readFileSync(file,"utf8")
    expect(original).toContain("mode: subagent")
    expect(()=>addAgent(root,"reviewer","primary","Other")).toThrow()
    expect(()=>addAgent(root,"../outside","primary","Other")).toThrow()
    expect(readFileSync(file,"utf8")).toBe(original)
  }finally{rmSync(root,{recursive:true,force:true})}
})
