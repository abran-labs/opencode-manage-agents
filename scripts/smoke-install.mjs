// Set OPENCODE_BIN to the real CLI executable, not a shell wrapper that overrides XDG.
// Pass --local for an unpublished checkout, or a pinned Git spec to check an actual install.
import assert from "node:assert/strict"
import {spawn, spawnSync} from "node:child_process"
import {randomUUID} from "node:crypto"
import {mkdtemp, mkdir, readFile, rm, writeFile} from "node:fs/promises"
import {createServer} from "node:net"
import {tmpdir} from "node:os"
import {join} from "node:path"
import {fileURLToPath} from "node:url"
import {setTimeout as delay} from "node:timers/promises"

const spec=process.argv[2]
if(!spec)throw Error("Pass --local or a Git package specifier")
const root=await mkdtemp(join(tmpdir(),"opencode-plugin-smoke-"))
const dir=join(root,"workspace"), binary=process.env.OPENCODE_BIN||"opencode"
const env={PATH:process.env.PATH,HOME:root,TMPDIR:join(root,"tmp"),XDG_CONFIG_HOME:join(root,"config"),
  XDG_STATE_HOME:join(root,"state"),XDG_DATA_HOME:join(root,"data"),XDG_CACHE_HOME:join(root,"cache"),
  XDG_RUNTIME_DIR:join(root,"run"),OPENCODE_SERVER_PASSWORD:randomUUID(),GIT_TERMINAL_PROMPT:"0"}
const configDir=join(env.XDG_CONFIG_HOME,"opencode"),file=join(configDir,"opencode.json")
let host,exited
try{
  for(const path of [dir,configDir,env.XDG_RUNTIME_DIR,env.TMPDIR])await mkdir(path,{recursive:true,mode:0o700})
  if(spec==="--local"){
    const pkg=fileURLToPath(new URL("../",import.meta.url)).replace(/[/\\]$/,"")
    await writeFile(file,JSON.stringify({plugins:[pkg]}))
  }else{
    const result=spawnSync(binary,["plugin","add",spec],{cwd:dir,env,encoding:"utf8",timeout:90000})
    assert.equal(result.status,0,result.error?.message||result.stderr||result.stdout)
  }
  const pristine=JSON.parse(await readFile(file,"utf8"))
  assert.equal(pristine.plugins.length,1)
  assert.equal(typeof pristine.plugins[0],"string","Start with the CLI's ordinary string entry")
  const listener=createServer()
  await new Promise((ok,no)=>listener.once("error",no).listen(0,"127.0.0.1",ok))
  const {port}=listener.address()
  await new Promise(ok=>listener.close(ok))
  host=spawn(binary,["serve","--hostname","127.0.0.1","--port",String(port)],{cwd:dir,env,stdio:["ignore","ignore","pipe"]})
  exited=new Promise(resolve=>host.once("exit",resolve))
  let log=""
  host.stderr.on("data",data=>{log=(log+data).slice(-4000)})
  const base=`http://127.0.0.1:${port}/api`
  const headers={Authorization:`Basic ${Buffer.from(`opencode:${env.OPENCODE_SERVER_PASSWORD}`).toString("base64")}`,"Content-Type":"application/json"}
  async function call(route,input){
    const url=new URL(base+route)
    url.searchParams.set("location[directory]",dir)
    const r=await fetch(url,{headers,method:input?"POST":"GET",body:input&&JSON.stringify({input}),signal:AbortSignal.timeout(10000)})
    const text=await r.text()
    assert(r.ok,`${route} ${r.status}: ${text.slice(0,500)}`)
    return JSON.parse(text)
  }
  const deadline=Date.now()+30000
  for(;;){
    try{await call("/info");break}catch(error){
      if(host.exitCode!==null||Date.now()>deadline)throw Error(`CLI did not become ready: ${error.message}\n${log}`)
      await delay(150)
    }
  }
  let p
  for(;;){
    const plugins=(await call("/plugin")).data
    p=plugins.find(p=>p.id==="manage-agents")
    if(p?.state.status==="active")break
    assert(Date.now()<deadline,`Plugin failed to activate: ${JSON.stringify(plugins)}\n${log}`)
    await delay(100)
  }
  for(const surface of ["server","rpc","tui","gui"])assert.equal(p.features[surface],true,surface)
  assert((await call("/plugin/gui?id=manage-agents")).data.code.length>0)
  const rpc=(method,input)=>call(`/rpc/manage-agents/${method}`,input).then(r=>r.output)
  const before=await rpc("load",{id:"build"})
  const after=await rpc("saveState",{id:"build",before,after:{...before,slotCount:2}})
  assert.equal(after.slotCount,2)
  assert.deepEqual((await rpc("load",{id:"build"})),after)
  assert.equal(JSON.parse(await readFile(file,"utf8")).plugins[0].options.fallbackSlotCounts.build,2)
  console.log("Clean install: server, TUI, GUI and RPC active; fallback slot saved and reloaded.")
}finally{
  if(host&&host.exitCode===null){host.kill("SIGTERM");await Promise.race([exited,delay(1000)]);if(host.exitCode===null&&!host.signalCode)host.kill("SIGKILL")}
  await rm(root,{recursive:true,force:true})
}
