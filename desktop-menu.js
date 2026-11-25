// This adapter is intentionally DOM-specific. The editor and its slash command do not depend on it.
export function wireDesktopMenu(open,create,mountIcon,mountAction) {
  let toolbar,search,empty,host,trigger
  const tooltips=[]
  const signal=new AbortController()
  const rows=()=>[...(host?.querySelectorAll('[role="menuitemradio"]')??[])]
  const visible=()=>rows().filter(el=>!el.hasAttribute("data-agent-filtered"))
  const clear=()=>{for(const dispose of tooltips.splice(0))dispose();for(const row of rows())row.removeAttribute("data-agent-filtered");toolbar?.remove();empty?.remove();toolbar=search=empty=host=trigger=undefined}
  function filter(){
    const query=search.value.trim().toLowerCase()
    for(const row of rows())row.toggleAttribute("data-agent-filtered",!!query && !row.textContent.toLowerCase().includes(query))
    empty.hidden=visible().length!==0
  }
  function paint() {
    const active=[...document.querySelectorAll('button[aria-label="Choose agent"][aria-expanded="true"]')].find(el=>el.getClientRects().length)
    const linked=active && (document.getElementById(active.getAttribute("aria-controls")||"") ||
      [...document.querySelectorAll('[role="menu"][aria-labelledby]')].find(el=>el.getAttribute("aria-labelledby")===active.id))
    if(!linked?.matches('[role="menu"]') || !linked.querySelector('[role="menuitemradio"]')) {if(toolbar)clear();return}
    if(host===linked && toolbar?.isConnected){filter();return}
    clear();host=linked;trigger=active
    toolbar=document.createElement("div");toolbar.dataset.agentsToolbar="";toolbar.className="model-dialog"
    // Mirror SearchList's native text field slots so the shipped model-picker CSS owns spacing and typography.
    toolbar.innerHTML=`<div data-component="search-list"><div data-slot="search-list-search"><div data-component="text-input-v2" data-appearance="large" data-surface="base" data-leading-icon><div data-slot="text-input-v2-value"><span data-slot="text-input-v2-leading-icon"></span><input data-slot="text-input-v2-input" placeholder="Search" aria-label="Search agents" autocomplete="off" spellcheck="false"></div><div data-slot="text-input-v2-trailing"></div></div></div></div>`
    search=toolbar.querySelector("input");search.addEventListener("input",filter)
    tooltips.push(mountIcon(toolbar.querySelector('[data-slot="text-input-v2-leading-icon"]')))
    const trailing=toolbar.querySelector('[data-slot="text-input-v2-trailing"]')
    for(const [label,name,run] of [["Add agent","plus",create],["Manage agents","sliders",open]]){
      const mount=document.createElement("span");mount.style.display="contents";trailing.append(mount)
      tooltips.push(mountAction(mount,name,label,e=>{
        e.preventDefault();e.stopPropagation()
        linked.querySelector('[role="menuitemradio"]')?.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true,cancelable:true}))
        requestAnimationFrame(run)
      }))
    }
    empty=document.createElement("div");empty.dataset.agentsEmpty="";empty.textContent="No matching agents";empty.hidden=true
    linked.prepend(toolbar);linked.append(empty)
    requestAnimationFrame(()=>{if(host===linked)search.focus({preventScroll:true})})
  }
  document.addEventListener("keydown",e=>{
    if(e.key==="Enter" && !e.isComposing && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      const input=e.target.closest?.('[contenteditable=true],textarea,input')
      const native=document.querySelector('[data-component="composer-suggestions"] [data-suggestion-id="agent.cycle"][data-active]')
      const editor=native?.closest('[data-component="composer-suggestions"]')?.querySelector('[data-suggestion-id="manage-agents.open"]')
      const text=(input?.value??input?.textContent??"").trim()
      if((text==="/agent"||text==="/agents") && editor?.getClientRects().length){e.preventDefault();e.stopImmediatePropagation();editor.click();return}
    }
    if(!host || !toolbar || e.isComposing)return
    const row=document.activeElement
    if(!host.contains(row) && row!==trigger)return
    const items=visible(), controls=[search,...toolbar.querySelectorAll("button")],all=[...controls,...items]
    const index=all.indexOf(row), stop=()=>{e.preventDefault();e.stopImmediatePropagation()}
    if(e.key==="Tab" && index>=0){
      stop();all[(index+(e.shiftKey?-1:1)+all.length)%all.length].focus();return
    }
    if(e.key==="ArrowDown" || e.key==="ArrowUp"){
      stop()
      const i=items.indexOf(row)
      if(e.key==="ArrowDown")(i<0?items[0]:items[i+1]??search)?.focus()
      else (i<0?items.at(-1):items[i-1]??search)?.focus()
      return
    }
    if(row===search && e.key==="Enter"){stop();items[0]?.click();return}
    if(toolbar.contains(row) && e.key!=="Escape"){
      // Let typing, caret navigation, and button activation reach their native controls.
      if(row===search || ["Enter"," "].includes(e.key))e.stopPropagation()
    }
  },{capture:true,signal:signal.signal})
  const observer=new MutationObserver(paint)
  observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:["aria-expanded","aria-controls"]})
  paint()
  return ()=>{observer.disconnect();signal.abort();clear()}
}
