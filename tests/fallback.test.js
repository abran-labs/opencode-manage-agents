import { test, expect } from "bun:test"
import { installFallback } from "../src/server/fallback.js"

const primary = {providerID:"sample",id:"primary"}
const next = {providerID:"sample",id:"next",variant:"high"}
const last = {providerID:"other",id:"last"}

async function fixture(options,model=primary,agent="build") {
  const hooks={}, session={agent,model}
  let account=crypto.randomUUID()
  const stop=await installFallback({
    options,location:{directory:`/fallback-test/${crypto.randomUUID()}`},
    session:{
      hook:async (name,handler)=>{hooks[name]=handler},
      get:async ()=>session,
      switchModel:async ({model})=>{session.model=model},
    },
    model:{list:async ()=>({data:[
      {...next,enabled:true,variants:[{id:"high"}]},
      {...last,enabled:true,variants:[]},
    ]})},
    provider:{get:async ({providerID})=>({data:{integrationID:providerID}})},
    integration:{connection:{active:async ()=>({type:"credential",id:account})}},
    event:{subscribe:async function*(){}},
  })
  const hook=(name,args={})=>hooks[name]?.({sessionID:"session",...args})
  return {
    session,stop,hook,account:id=>{account=id},
    response:(kind="primary",status=429)=>hook("http.response",{
      kind,agent:session.agent,model:session.model,response:new Response(null,{status}),
    }),
    retry:async (status=429)=>{
      const decision={retry:true,delay:123}
      const event={sessionID:"session",agent:session.agent,model:session.model,error:{status},decision}
      await hooks.retry?.(event)
      return event.decision
    },
  }
}

test("public defaults install no routing hooks for a fresh location",async()=>{
  const hooks=[]
  const stop=await installFallback({
    options:{},location:{directory:`/fallback-test/${crypto.randomUUID()}`},
    session:{hook:async name=>{hooks.push(name)}},event:{subscribe:async function*(){}},
  })
  try { expect(hooks).toEqual([]) }
  finally { stop() }
})

test("legacy route and backup options do not opt an agent into fallback",async()=>{
  const f=await fixture({
    routes:{"sample/primary":{family:"test"}},
    backup:"other/last",
    chains:{build:["sample/primary","other/last"]},
  },primary,"worker-quick")
  try {
    f.response()
    expect(await f.retry()).toEqual({retry:true,delay:123})
    expect(f.session.model).toEqual(primary)
  } finally { f.stop() }
})

test("explicit chain retries in order with requested variants and restores at idle",async()=>{
  const f=await fixture({chains:{build:["sample/primary","sample/next#high","other/last"]}})
  try {
    f.response()
    expect(await f.retry()).toEqual({retry:true,delay:0})
    expect(f.session.model).toEqual(next)
    f.response()
    expect(await f.retry()).toEqual({retry:true,delay:0})
    expect(f.session.model).toEqual(last)
    f.response()
    expect(await f.retry()).toEqual({retry:false})
    await f.hook("experimental.idle")
    expect(f.session.model).toEqual(primary)
  } finally { f.stop() }
})

test("explicit fallback skips unavailable variants and preserves a manual model change at idle",async()=>{
  const f=await fixture({chains:{build:["sample/primary","sample/next#missing","other/last"]}})
  try {
    f.response()
    expect(await f.retry()).toEqual({retry:true,delay:0})
    expect(f.session.model).toEqual(last)
    f.session.model=next
    await f.hook("experimental.idle")
    expect(f.session.model).toEqual(next)
  } finally { f.stop() }
})

test("fallback requires a matching primary HTTP 429 from the current request",async()=>{
  const f=await fixture({chains:{build:["sample/primary","other/last"]}})
  try {
    f.response("secondary")
    expect(await f.retry()).toEqual({retry:true,delay:123})
    f.response()
    await f.hook("model.request",{kind:"primary",agent:"build"})
    expect(await f.retry()).toEqual({retry:true,delay:123})
    f.response()
    expect(await f.retry(503)).toEqual({retry:true,delay:123})
    expect(f.session.model).toEqual(primary)
  } finally { f.stop() }
})

test("prompt admission cooldown is shared only with the same connection",async()=>{
  const options={chains:{build:["quota-test/primary","other/last"]}}
  const model={providerID:"quota-test",id:"primary"}
  const f=await fixture(options,model), second=await fixture(options,model)
  try {
    f.account("first")
    f.response()
    expect(await f.retry()).toEqual({retry:true,delay:0})
    second.account("second")
    await second.hook("prompt")
    expect(second.session.model).toEqual(model)
    second.account("first")
    await second.hook("prompt")
    expect(second.session.model).toEqual(last)
  } finally {
    await f.hook("experimental.idle")
    await second.hook("experimental.idle")
    f.stop()
    second.stop()
  }
})
