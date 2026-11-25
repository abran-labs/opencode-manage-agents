import {batch,createMemo,createSignal,For,onCleanup,onMount,Show} from "solid-js"
import {insert,Portal} from "solid-js/web"
import {SearchList,SearchHighlight} from "opencode-search-list"
import {placeFlyout} from "opencode-flyout"
import {Icon} from "./palette-icon"

export function desktopPages(ui,renderTabs){
  const [page,setPage]=createSignal({title:"Manage agents",rows:[],actions:[],search:true})
  const [query,setQuery]=createSignal(""),[fly,setFly]=createSignal()
  let pending,closed=false,root,input,handle,timer
  function clearFly(){clearTimeout(timer);setFly(undefined)}
  function finish(value){if(!pending)return;const resolve=pending;pending=undefined;clearFly();resolve(value)}
  function show(row,element,focus=false){
    clearTimeout(timer)
    if(!element||!row?.variants?.length)return clearFly()
    const content=root.closest('[data-slot="dialog-content"]')??root
    const layer={top:0,left:0,right:window.innerWidth,bottom:window.innerHeight}
    const at=placeFlyout(element.getBoundingClientRect(),layer,getComputedStyle(root).direction==="rtl",(row.variants.length+1)*28+4)
    setFly({row,at,content})
    if(focus)queueMicrotask(()=>content.querySelector('[data-agent-variants] [aria-checked="true"]')?.focus())
  }
  function view(){
    const items=createMemo(()=>{const q=query().trim().toLowerCase();return page().rows.filter(r=>!q||[r.title,r.description,r.meta,r.group,r.value].some(v=>v?.toLowerCase().includes(q)))})
    onMount(()=>{
      input=root.querySelector("input");input?.focus()
      if(!renderTabs)return
      const mount=document.createElement("div")
      root.querySelector('[data-slot="search-list-body"]')?.before(mount)
      insert(mount,()=>Number.isInteger(page().slot)?renderTabs(page(),finish):null)
    })
    onCleanup(clearFly)
    const placeholder=()=>page().title==="Manage agents"?"Search agents":page().title.endsWith(" · Default model")?`Search models for ${page().title.split(" · ")[0]}`:"Search models"
    function keys(e,row){
      if(e.key==="ArrowRight"&&row?.variants?.length){
        e.preventDefault();show(row,document.getElementById(root.querySelector("input")?.getAttribute("aria-activedescendant")),true)
      }else if(e.key==="Escape"&&fly()){e.preventDefault();e.stopPropagation();clearFly()}
      else clearFly()
    }
    return <div ref={root} data-agent-palette="" class="model-dialog command-palette-body" onWheel={clearFly}>
      <SearchList ref={h=>handle=h} items={items()} query={query()} onQuery={v=>{clearFly();setQuery(v)}}
        placeholder={placeholder()} label={page().title} key={r=>r.value} section={r=>r.group??""}
        header={r=>r.group&&<span data-slot="model-dialog-header-label">{r.group}</span>}
        empty={pending?"No matches":"Loading…"} onKeyDown={keys}
        field={page().search?undefined:attrs=><div data-agent-page-heading="" tabindex="0" onKeyDown={attrs.onKeyDown}>{page().title}</div>}
         trailing={<For each={page().actions}>{a=><ui.Tooltip value={a.title}><ui.IconButton icon="reset" label={a.title} disabled={a.disabled} onClick={()=>finish(a.value)}/></ui.Tooltip>}</For>}
        onSelect={r=>finish(r.variants?{ref:r.value,variant:r.variant}:r.value)}>
        {(item,attrs)=><button type="button" {...attrs} onMouseMove={e=>{
          attrs.onMouseMove(e);if(!(e.movementX||e.movementY)||fly()?.row===item())return
          const el=e.currentTarget;clearTimeout(timer);timer=setTimeout(()=>show(item(),el),100)
        }}>
          <span data-slot="model-dialog-check"><Show when={item().checked}><Icon name="check"/></Show></span>
          <span data-slot="model-dialog-name"><span class="min-w-0 truncate"><SearchHighlight text={item().title}/></span>
            <Show when={item().meta??(item().value!==item().description&&item().description)}>{text=><span class="min-w-0 truncate text-v2-text-text-faint">{text()}</span>}</Show></span>
          <Show when={item().variants?.length && attrs["aria-selected"]}><span data-slot="model-dialog-variant" onClick={e=>{e.stopPropagation();show(item(),e.currentTarget.closest("button"),true)}}>
            <span class="truncate capitalize">{item().variant||"Default"}</span><Icon name="chevron-right"/></span></Show>
        </button>}
      </SearchList>
      <Show when={fly()}>{f=><Portal mount={f().content}><div data-agent-variants="" data-component="menu-v2-content" data-slot="model-dialog-flyout" role="menu" aria-label="Model variant"
        style={{left:`${f().at.left}px`,top:`${f().at.top}px`,"z-index":3}} onKeyDown={e=>{
          if(["Escape","ArrowLeft"].includes(e.key)){e.stopPropagation();e.preventDefault();clearFly();root.querySelector("input")?.focus();return}
          const buttons=[...e.currentTarget.querySelectorAll("button")],i=buttons.indexOf(document.activeElement)
          if(["ArrowUp","ArrowDown"].includes(e.key)){e.preventDefault();buttons[(i+(e.key==="ArrowUp"?-1:1)+buttons.length)%buttons.length].focus()}
        }}>
        <For each={["",...f().row.variants]}>{v=><button type="button" data-component="menu-v2-item" role="menuitemradio" aria-checked={(f().row.variant||"")===v} onClick={()=>finish({ref:f().row.value,variant:v})}>
          <span class="capitalize" data-slot="menu-v2-item-content">{v||"Default"}</span><Show when={(f().row.variant||"")===v}><Icon name="check"/></Show>
        </button>}</For>
      </div></Portal>}</Show>
    </div>
  }
  return {view,close(){closed=true;finish(undefined);clearFly()},select(rows,settings){
    if(closed)return Promise.resolve()
    const samePicker=Number.isInteger(settings.slot)&&Number.isInteger(page().slot)
    return new Promise(resolve=>{pending=resolve;batch(()=>{clearFly();if(!samePicker)setQuery("");setPage({...settings,rows});if(!samePicker)handle?.setActive(undefined)})
      if(samePicker)return
      const field=root?.querySelector('input,[data-agent-page-heading]');field?.focus({preventScroll:true})
      root?.querySelector("[data-scrollable]")?.scrollTo({top:0})
    })
  }}
}
