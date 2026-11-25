import {MAX_FALLBACK_SLOTS,canCloseFallback} from "../shared/slot-limits.js"

// Pure state for the terminal slot picker. Kept apart from JSX so it is testable without a renderer.

// Provider groups like the native dialog: OpenCode's own providers first, then by name.
const first=["opencode-go","opencode"]
export function catalogRows(models,providers=[]){
  const names=new Map((providers??[]).map(p=>[p.id,p.name||p.id]))
  const rows=models.map(m=>{
    const provider=m.ref.split("/")[0]
    return {ref:m.ref,name:m.name||m.ref,provider,group:names.get(provider)??provider,
      variants:(m.variants??[]).filter(v=>v&&v!=="default")}
  })
  const rank=row=>{const i=first.indexOf(row.provider);return i<0?first.length:i}
  return rows.toSorted((a,b)=>rank(a)-rank(b)||a.group.localeCompare(b.group))
}

// Substring hits beat subsequence hits; each whitespace-separated term must match somewhere.
function score(row,term){
  let best=0
  for(const [field,weight] of [[row.name,3],[row.ref,2],[row.group,1]]){
    const text=(field??"").toLowerCase(),at=text.indexOf(term)
    if(at>=0){best=Math.max(best,weight*100-Math.min(at,50));continue}
    let i=0
    for(const ch of text)if(ch===term[i])i++
    if(i===term.length)best=Math.max(best,weight*10)
  }
  return best
}

export function filterRows(rows,query){
  const terms=query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if(!terms.length)return rows
  return rows.map((row,i)=>{
    let total=0
    for(const term of terms){const s=score(row,term);if(!s)return;total+=s}
    return {row,total,i}
  }).filter(Boolean).sort((a,b)=>b.total-a.total||a.i-b.i).map(x=>x.row)
}

// A flat list of headers and rows. Search results are flat, like the native model dialog.
export function displayItems(rows,searching){
  const items=[]
  let group
  rows.forEach((row,index)=>{
    if(!searching&&row.group!==group){group=row.group;items.push({header:group})}
    items.push({row,index})
  })
  return items
}

export function slotTabs(slots){
  const count=slots.length-1
  const tabs=slots.map((ref,index)=>({index,label:index?`Fallback ${index}`:"Primary",short:index?`F${index}`:"P",ref:ref??null,
    close:canCloseFallback(index,count,ref)}))
  return {tabs,add:count<MAX_FALLBACK_SLOTS}
}

// Contiguous tab range that fits `width`, keeping `selected` visible and moving `start` as little as possible.
export function tabWindow(widths,selected,width,start=0){
  start=Math.max(0,Math.min(start,selected))
  const fits=(s,e)=>widths.slice(s,e).reduce((a,b)=>a+b,0)<=width
  while(start<selected&&!fits(start,selected+1))start++
  let end=selected+1
  while(end<widths.length&&fits(start,end+1))end++
  while(start>0&&fits(start-1,end))start--
  return {start,end}
}

export function variantChoices(row,current){
  const [ref,level]=(current??"").split("#")
  const choices=["default",...row.variants]
  const index=ref===row.ref&&level?choices.indexOf(level):0
  return {choices,selected:Math.max(0,index)}
}

export function moveIndex(index,delta,count){
  if(count<=0)return 0
  if(Math.abs(delta)===1)return (index+delta+count)%count
  return Math.max(0,Math.min(count-1,index+delta))
}

// Visible slice [start,end) of `count` lines with `pos` inside, moving `offset` minimally.
export function listWindow(count,pos,height,offset=0){
  height=Math.max(1,height)
  const max=Math.max(0,count-height)
  offset=Math.max(0,Math.min(offset,max))
  if(pos>=0){
    if(pos<offset)offset=pos
    else if(pos>=offset+height)offset=pos-height+1
  }
  return {start:offset,end:Math.min(count,offset+height)}
}
