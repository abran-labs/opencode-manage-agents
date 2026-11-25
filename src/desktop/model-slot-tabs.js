import {createComponent} from "solid-js"
import {insert} from "solid-js/web"
import {DEFAULT_FALLBACK_SLOTS,MAX_FALLBACK_SLOTS,canCloseFallback} from "../shared/slot-limits.js"

const offsets=new WeakMap()
let nextID=0

export const modelSlotStyles=`[data-slot="agent-picker-tabs"]{flex:none}
[data-agent-model-slot-tabs]{box-shadow:inset 0 -1px var(--v2-border-border-base)}
[data-agent-model-slot-tabs][data-component="tabs-v2"][data-variant="normal"][data-orientation="horizontal"] [data-slot="tabs-v2-list"]::before{display:none}`

export function modelSlotTabs(ui,settings,done) {
  const count=Math.max(DEFAULT_FALLBACK_SLOTS,Math.min(MAX_FALLBACK_SLOTS,(settings.slots?.length??1)-1))
  const labels=["Primary",...Array.from({length:count},(_,i)=>`Fallback ${i+1}`)]
  const selected=Number.isInteger(settings.slot)&&labels[settings.slot]?settings.slot:0
  const panelID=`agent-model-slots-${++nextID}`
  const root=element("div",{"data-agent-model-slot-tabs":panelID,"data-component":"tabs-v2",
    "data-variant":"normal","data-orientation":"horizontal"})
  const list=element("div",{"data-slot":"tabs-v2-list",role:"tablist","aria-label":"Model slots"})
  root.append(list)

  const buttons=labels.map((label,i)=>{
    const value=String(i),ref=settings.slots?.[i]
    const wrapper=element("div",{"data-slot":"tabs-v2-trigger-wrapper","data-value":value})
    const button=element("button",{type:"button",role:"tab",id:`${panelID}-tab-${i}`,
      "data-slot":"tabs-v2-trigger","data-value":value,"aria-selected":String(i===selected),"aria-controls":panelID})
    const content=element("span",{"data-slot":"tabs-v2-trigger-content",class:"inline-flex items-center gap-2"})
    content.textContent=label
    if(ref){
      button.title=ref
      button.setAttribute("aria-description",ref)
    }
    button.tabIndex=i===selected?0:-1
    if(i===selected)button.setAttribute("data-selected","")
    button.addEventListener("click",()=>{if(i!==selected)done(`slot:${i}`)})
    button.append(content)
    wrapper.append(button)
    if(canCloseFallback(i,count,ref)){
      const label=`Remove fallback ${i}`
      const close=element("span",{"data-slot":"tabs-v2-trigger-close-button"})
      insert(close,createComponent(ui.Tooltip,{value:label,get children(){
        return createComponent(ui.IconButton,{label,icon:"close",size:"small",variant:"ghost-muted",onClick:event=>{
          event?.stopPropagation();done(`remove-slot:${i}`)
        }})
      }}))
      wrapper.append(close)
    }
    list.append(wrapper)
    return button
  })
  if(count<MAX_FALLBACK_SLOTS){
    const add=element("span",{class:"inline-flex shrink-0","data-add-fallback":""})
    insert(add,createComponent(ui.Tooltip,{value:"Add fallback",get children(){
      return createComponent(ui.IconButton,{label:"Add fallback",icon:"plus",size:"small",variant:"ghost-muted",onClick:()=>done("add-slot")})
    }}))
    list.append(add)
  }
  // Scope horizontal scrolling to this row; leave the model results' wheel alone.
  list.addEventListener("wheel",event=>{
    if(event.ctrlKey||event.shiftKey||Math.abs(event.deltaX)>=Math.abs(event.deltaY)||list.scrollWidth<=list.clientWidth+1)return
    const scale=event.deltaMode===1?16:event.deltaMode===2?list.clientWidth:1
    const prev=list.scrollLeft
    list.scrollLeft+=event.deltaY*scale*(getComputedStyle(list).direction==="rtl"?-1:1)
    if(list.scrollLeft!==prev)event.preventDefault()
  },{passive:false})
  const parent=()=>root.closest('[role="dialog"]')
  list.addEventListener("scroll",()=>{const p=parent();if(p)offsets.set(p,list.scrollLeft)},{passive:true})
  queueMicrotask(()=>{
    if(!root.isConnected)return
    list.scrollLeft=offsets.get(parent())??0
    const viewport=list.getBoundingClientRect()
    const target=buttons[selected].getBoundingClientRect()
    if(target.left<viewport.left)list.scrollLeft+=target.left-viewport.left
    else if(target.right>viewport.right)list.scrollLeft+=target.right-viewport.right
    if(selected===count){
      const last=list.lastElementChild?.getBoundingClientRect()
      if(last&&last.right>viewport.right)list.scrollLeft+=last.right-viewport.right
      else if(last&&last.left<viewport.left)list.scrollLeft+=last.left-viewport.left
    }
  })

  // Manual activation: arrows move focus; Enter/Space click the focused tab.
  const tabStop=index=>buttons.forEach((button,i)=>{button.tabIndex=i===index?0:-1})
  list.addEventListener("focusin",event=>{
    const index=buttons.indexOf(event.target)
    if(index!==-1)tabStop(index)
  })
  list.addEventListener("focusout",event=>{
    if(!list.contains(event.relatedTarget))tabStop(selected)
  })
  list.addEventListener("keydown",event=>{
    const index=buttons.indexOf(event.target)
    if(index===-1||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return
    let next
    if(event.key==="Home")next=0
    else if(event.key==="End")next=buttons.length-1
    else if(event.key==="ArrowLeft"||event.key==="ArrowRight"){
      const step=(event.key==="ArrowRight"?1:-1)*(getComputedStyle(list).direction==="rtl"?-1:1)
      next=(index+step+buttons.length)%buttons.length
    }else return
    event.preventDefault()
    buttons[next].focus()
  })
  return root
}

function element(tag,attrs) {
  const node=document.createElement(tag)
  for(const [name,value] of Object.entries(attrs))node.setAttribute(name,value)
  return node
}
