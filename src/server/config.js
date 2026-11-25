import { readFileSync, writeFileSync, renameSync, unlinkSync, statSync, openSync, closeSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { getNodeValue, modify, applyEdits, parseTree, findNodeAtLocation, createScanner, SyntaxKind } from "../vendor/jsonc.js"
import { DEFAULT_FALLBACK_SLOTS, clampFallbackSlots, validFallbackSlotCount } from "../shared/slot-limits.js"

const format = { formattingOptions: {insertSpaces:true, tabSize:2, eol:"\n"} }
const validRef = /^[^/#\s]+\/[^#\s]+(?:#[^#\s]+)?$/
const same = (a,b)=>JSON.stringify(a)===JSON.stringify(b)
// Without a recorded count the chain length and the highest sparse slot decide what is visible.
function inferredSlots(chain,positions) {
  const highest = Array.isArray(positions) ? Math.max(0,...positions.filter(Number.isInteger)) : 0
  const count=clampFallbackSlots(Math.max(chain.length-1,highest))
  return validPositions(positions,chain,count)?count:clampFallbackSlots(chain.length-1)
}
function validPositions(positions,chain,count) {
  if(!Array.isArray(positions) || !Array.isArray(chain) ||
    positions.length!==Math.min(count,Math.max(0,chain.length-1))) return false
  let previous=0
  for(const slot of positions) {
    if(!Number.isInteger(slot) || slot<=previous || slot>count) return false
    previous=slot
  }
  return true
}
const sparsePositions = positions=>positions?.some((slot,i)=>slot!==i+1)?positions:undefined

function removeKey(text,path) {
  const value=findNodeAtLocation(parseTree(text,[],{allowTrailingComma:true}),path)
  if(!value) return text
  const property=value.parent, end=value.offset+value.length
  const siblings=property.parent.children
  const previous=siblings[siblings.indexOf(property)-1]?.children[1]
  const scanner=createScanner(text,true)
  scanner.setPosition(end)
  let token=scanner.scan()
  if(token!==SyntaxKind.CommaToken && previous) {
    scanner.setPosition(previous.offset+previous.length)
    token=scanner.scan()
  }
  // Remove the key/value and its comma separately; the gap may contain comments.
  const edits=[{offset:property.offset,length:end-property.offset,content:""}]
  if(token===SyntaxKind.CommaToken) edits.push({offset:scanner.getTokenOffset(),length:1,content:""})
  return applyEdits(text,edits)
}

function document(text) {
  const errors=[]
  const tree=parseTree(text,errors,{allowTrailingComma:true})
  if(errors.length || tree?.type!=="object")throw Error("Cannot edit this global config")
  // jsonc-parser reads the last duplicate but its path edits target the first.
  function check(node) {
    if(node.type==="object") {
      const keys=node.children.map(p=>p.children[0].value)
      if(new Set(keys).size!==keys.length)throw Error("Duplicate keys in global config")
    }
    node.children?.forEach(check)
  }
  check(tree)
  const doc=getNodeValue(tree)
  if(doc.plugins!==undefined && !Array.isArray(doc.plugins))throw Error("Cannot edit this global config")
  return doc
}

function matchingEntries(doc,file,target) {
  const matches=[]
  for(const [index,entry] of (doc.plugins??[]).entries()) {
    const spec=typeof entry==="string"?entry:entry?.package
    if(typeof spec!=="string") continue
    // Same normalization as OpenCode ConfigPluginSource.scan. Git targets stay
    // exact (including owner, transport and ref); never guess from a basename.
    const value=spec.startsWith("file://")?fileURLToPath(spec):
      spec.startsWith("./")||spec.startsWith("../")?resolve(dirname(file),spec):spec
    if(value===target)matches.push(index)
  }
  return matches
}

export function globalConfig(root,target,id) {
  const matches=[],others=[]
  for(const name of ["opencode.json","opencode.jsonc"]) {
    const file=join(root,name)
    let text
    try{text=readFileSync(file,"utf8")}catch(e){if(e.code==="ENOENT")continue;throw e}
    const doc=document(text)
    if(matchingEntries(doc,file,target).length)matches.push(file)
    else others.push(doc)
  }
  if(matches.length>1)throw Error("Multiple Manage Agents registrations in global config files")
  if(!matches.length)throw Error("Manage Agents is not configured in this global config")
  if(others.some(doc=>doc.agents?.[id]?.model!==undefined))throw Error("Agent model and plugin registration are in separate global config files")
  return openConfig(matches[0],target)
}

export function openConfig(file,pkg) {
  function snapshot(id,text=readFileSync(file,"utf8")) {
    if (!id || ["__proto__","prototype","constructor"].includes(id)) throw Error("Invalid agent")
    const doc=document(text),matches=matchingEntries(doc,file,pkg)
    if(matches.length>1)throw Error("Multiple Manage Agents registrations in global config")
    if(!matches.length)throw Error("Manage Agents is not configured in this global config")
    const [index]=matches
    const model = doc.agents?.[id]?.model ?? null
    if(model!==null && typeof model!=="string") throw Error("Unsupported model setting")
    const options=doc.plugins[index].options
    const chain=options?.chains?.[id] ?? []
    const storedPositions=options?.fallbackPositions?.[id]
    const storedCount=options?.fallbackSlotCounts?.[id]
    const count=validFallbackSlotCount(storedCount)?storedCount:inferredSlots(chain,storedPositions)
    const state={model,chain}
    if(count!==DEFAULT_FALLBACK_SLOTS || validFallbackSlotCount(storedCount)) state.slotCount=count
    const positions=validPositions(storedPositions,chain,count)?sparsePositions(storedPositions):undefined
    if(positions!==undefined) state.positions=positions
    return {text,index,entry:doc.plugins[index],state,storedPositions,storedCount}
  }
  return {
    read: id=>snapshot(id).state,
    save(id,before,after) {
      // A kernel lock is released even if the server exits. Cooperating editors
      // serialize the reread/check/rename; external text edits are checked again before rename.
      const fd=openSync(`${file}.manage-agents.lock`,"a",0o600)
      try {
        if(spawnSync("flock",["-n","3"],{stdio:["ignore","ignore","ignore",fd]}).status!==0)
          throw Error("Global config is busy. Try again.")
        return commit(id,before,after)
      } finally {closeSync(fd)}
    }
  }
  function commit(id,before,after) {
      const {text,index,entry,state,storedPositions,storedCount} = snapshot(id)
      const count=state.slotCount??DEFAULT_FALLBACK_SLOTS
      if(before.model!==state.model || !same(before.chain,state.chain) ||
        (before.positions!==undefined && !validPositions(before.positions,before.chain,before.slotCount??DEFAULT_FALLBACK_SLOTS)) ||
        !same(sparsePositions(before.positions),state.positions) ||
        (before.slotCount??DEFAULT_FALLBACK_SLOTS)!==count) throw Error("Settings changed. Reopen the editor.")
      if(after.model!==null && (typeof after.model!=="string" || !validRef.test(after.model))) throw Error("Invalid default model")
      const chain=after.chain
      if(!Array.isArray(chain) || chain.some(m=>typeof m!=="string" || !validRef.test(m)) ||
        (chain.length && (chain.length<2 || (chain[0]!==after.model && !(after.model===state.model && chain[0]===state.chain[0])))) ||
        new Set(chain.map(m=>m.split("#")[0])).size!==chain.length) throw Error("Fallbacks must follow one default and use distinct models")
      const explicitCount=after.slotCount!==undefined, explicitPositions=after.positions!==undefined
      if(explicitCount && !Number.isInteger(after.slotCount)) throw Error("Invalid fallback slot count")
      const chainChanged=!same(state.chain,chain)
      const backupsChanged=chainChanged && !same(state.chain.slice(1),chain.slice(1))
      // Added empty slots ride in their own option. Older editors omit them: keep the count
      // while the backups still match, otherwise re-infer it from the chain and given layout.
      let slots=explicitCount?clampFallbackSlots(after.slotCount):count
      if(!explicitCount && backupsChanged) slots=inferredSlots(chain)
      if(!explicitCount && explicitPositions) slots=Math.max(slots,inferredSlots(chain,after.positions))
      if(explicitPositions && !validPositions(after.positions,chain,slots)) throw Error("Invalid fallback positions")
      // Older editors omit positions. Keep the layout only if its backups still match.
      let positions=state.positions
      if(explicitPositions) positions=sparsePositions(after.positions)
      else if(backupsChanged) positions=undefined
      let next=text
      let shorthand=typeof entry==="string"
      function setOption(key,value) {
        if(shorthand) {
          next=applyEdits(next,modify(next,["plugins",index],{package:entry},format))
          shorthand=false
        }
        const path=["plugins",index,"options",key,id]
        next=value===undefined?removeKey(next,path):applyEdits(next,modify(next,path,value,format))
      }
      if(state.model!==after.model) {
        const path=["agents",id,"model"]
        next=after.model===null?removeKey(next,path):applyEdits(next,modify(next,path,after.model,format))
      }
      if(chainChanged)setOption("chains",chain.length?chain:undefined)
      // A one-slot layout still needs an explicit count if it hides overflow.
      const keepCount=validFallbackSlotCount(storedCount) && (!backupsChanged || explicitCount)
      const needsCount=slots!==inferredSlots(chain,positions)
      const changedCount=explicitCount && slots!==count
      const nextCount=(keepCount || changedCount || (explicitCount && needsCount)) &&
        (slots!==DEFAULT_FALLBACK_SLOTS || needsCount || storedCount===slots) ? slots:undefined
      if((explicitCount || chainChanged || explicitPositions) && nextCount!==storedCount) {
        setOption("fallbackSlotCounts",nextCount)
      }
      if((explicitPositions || chainChanged) && !same(storedPositions,positions)) {
        setOption("fallbackPositions",positions)
      }
      if(next===text) return state
      // Normalize from the exact bytes being committed, not the editor's request.
      const committed=snapshot(id,next).state
      const temp=`${file}.${randomUUID()}.tmp`
      try {
        writeFileSync(temp,next,{mode:statSync(file).mode & 0o777,flag:"wx"})
        if(readFileSync(file,"utf8")!==text) throw Error("Config changed. Try again.")
        renameSync(temp,file)
        return committed
      } finally { try {unlinkSync(temp)} catch(e){if(e.code!=="ENOENT") throw e} }
  }
}
