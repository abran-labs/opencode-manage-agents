/* @jsxImportSource @opentui/solid */
import {createEffect,createMemo,For,on,Show,untrack} from "solid-js"
import {useTerminalDimensions} from "@opentui/solid"
import {TextAttributes} from "@opentui/core"
import {displayItems,filterRows,listWindow,moveIndex,slotTabs,tabWindow,variantChoices} from "./tui-picker-model.js"

const key=ref=>ref?.split("#")[0]
const keys={connect:"ctrl+a",variant:"ctrl+t",reset:"ctrl+r",add:"alt+n",remove:"ctrl+d"}

// Persistent slot picker. One mount serves every editor step; session.request()
// swaps the target slot underneath it while query, highlight and scroll stay.
export function SlotPicker(props){
  const {ctx,session,rows,connect,agent}=props
  const theme=ctx.theme.surface("dialog")
  const dims=useTerminalDimensions()
  const view=session.view,patch=v=>session.setView({...view(),...v})
  const settings=createMemo(()=>session.request()?.settings)
  const slots=createMemo(()=>settings()?.slots??[null])
  const slot=createMemo(()=>settings()?.slot??0)
  const current=createMemo(()=>settings()?.current)
  const action=createMemo(()=>settings()?.actions?.[0])
  const busy=createMemo(()=>!session.request())
  const strip=createMemo(()=>slotTabs(slots()))

  // Layout budget: the host dialog is 88 wide (less on narrow terminals) with 3-cell insets,
  // and starts a quarter of the way down.
  const width=createMemo(()=>Math.max(20,Math.min(88,dims().width-2)-6))
  const compact=createMemo(()=>width()<56)
  const listHeight=createMemo(()=>Math.max(3,Math.floor(dims().height*3/4)-(compact()?13:15)))

  const filtered=createMemo(()=>filterRows(rows(),view().query))
  const searching=createMemo(()=>!!view().query.trim())
  const items=createMemo(()=>displayItems(filtered(),searching()))
  const highlighted=createMemo(()=>{
    const list=filtered(),ref=view().selected
    const i=ref?list.findIndex(r=>r.ref===ref):-1
    return i>=0?i:list.length?0:-1
  })
  const row=createMemo(()=>filtered()[highlighted()])
  const linePos=createMemo(()=>items().findIndex(item=>item.index===highlighted()))
  const window=createMemo(()=>listWindow(items().length,linePos(),listHeight(),view().offset))
  const visible=createMemo(()=>items().slice(window().start,window().end))
  // Persist the scroll position so keyboard moves scroll minimally.
  createEffect(on(()=>window().start,start=>{if(start!==view().offset)patch({offset:start})}))

  // Highlight the slot's model when the slot changes and nothing is typed, like the native picker's current item.
  createEffect(on(slot,()=>{
    if(searching())return
    const ref=key(current())
    if(ref&&rows().some(r=>r.ref===ref))patch({selected:ref,offset:undefined,variant:undefined})
  }))
  const variants=createMemo(()=>{
    const r=row()
    if(!r)return
    const base=variantChoices(r,current())
    const chosen=view().variant?.ref===r.ref?base.choices.indexOf(view().variant.value):-1
    return {...base,selected:chosen>=0?chosen:base.selected}
  })
  const usedBy=createMemo(()=>{
    const map=new Map()
    slots().forEach((ref,i)=>{if(ref&&i!==slot())map.set(key(ref),i?`F${i}`:"P")})
    return map
  })

  function highlight(index){
    const r=filtered()[index]
    if(r)patch({selected:r.ref})
  }
  function move(delta){
    if(!filtered().length)return
    highlight(moveIndex(Math.max(0,highlighted()),delta,filtered().length))
  }
  function choose(r=row(),level){
    if(busy()||!r)return
    const v=level??variants()?.choices[variants().selected]
    session.choose({ref:r.ref,variant:v&&v!=="default"?v:undefined})
  }
  function cycleVariant(){
    const v=variants(),r=row()
    if(!v||!r||v.choices.length<2)return
    patch({variant:{ref:r.ref,value:v.choices[(v.selected+1)%v.choices.length]}})
  }
  const run=value=>{if(!busy())session.choose(value)}
  const goSlot=delta=>{
    const n=slots().length
    run(`slot:${(slot()+delta+n)%n}`)
  }
  const removable=createMemo(()=>strip().tabs[slot()]?.close)

  ctx.keymap.layer(()=>({mode:"modal",priority:200,commands:[
    {bind:"up",title:"Previous model",group:"Manage agents",run:()=>move(-1)},
    {bind:"down",title:"Next model",group:"Manage agents",run:()=>move(1)},
    {bind:"ctrl+p",title:"Previous model",group:"Manage agents",run:()=>move(-1)},
    {bind:"ctrl+n",title:"Next model",group:"Manage agents",run:()=>move(1)},
    {bind:"pageup",title:"Page up",group:"Manage agents",run:()=>move(-listHeight())},
    {bind:"pagedown",title:"Page down",group:"Manage agents",run:()=>move(listHeight())},
    {bind:"return",title:"Save model to slot",group:"Manage agents",run:()=>choose()},
    {bind:"tab",title:"Next slot",group:"Manage agents",run:()=>goSlot(1)},
    {bind:"shift+tab",title:"Previous slot",group:"Manage agents",run:()=>goSlot(-1)},
    // Arrows switch slots only while the search is empty; otherwise they move the cursor.
    {bind:"left",title:"Previous slot",group:"Manage agents",run:()=>{if(view().query)return false;goSlot(-1)}},
    {bind:"right",title:"Next slot",group:"Manage agents",run:()=>{if(view().query)return false;goSlot(1)}},
    {bind:keys.variant,title:"Cycle variant",group:"Manage agents",run:cycleVariant},
    {bind:keys.reset,title:"Clear slot",group:"Manage agents",run:()=>{const a=action();if(a&&!a.disabled)run(a.value)}},
    {bind:keys.add,title:"Add fallback",group:"Manage agents",run:()=>{if(strip().add)run("add-slot")}},
    // ctrl+d keeps its input meaning (delete) when the slot cannot be removed.
    {bind:keys.remove,title:"Remove fallback",group:"Manage agents",run:()=>{if(!removable())return false;run(`remove-slot:${slot()}`)}},
    {bind:keys.connect,title:"Connect integration",group:"Manage agents",run:()=>{if(connect.available())connect.run()}},
  ]}))

  // Tab strip ------------------------------------------------------------
  const tabLabel=t=>compact()?t.short:t.label
  const tabWidth=t=>tabLabel(t).length+2+(t.close?2:0)
  const tabs=createMemo(()=>{
    const all=strip().tabs
    const room=width()-(strip().add?4:0)-4
    const w=tabWindow(all.map(tabWidth),slot(),room,view().tabStart??0)
    return {...w,list:all.slice(w.start,w.end),more:{left:w.start>0,right:w.end<all.length}}
  })
  createEffect(on(()=>tabs().start,start=>{if(start!==view().tabStart)patch({tabStart:start})}))
  const scrollTabs=event=>{
    const d=event.scroll?.direction
    const delta=d==="down"||d==="right"?1:d==="up"||d==="left"?-1:0
    if(delta)goSlot(delta)
  }
  const scrollList=event=>{
    const d=event.scroll?.direction
    const delta=(d==="down"?1:d==="up"?-1:0)*Math.max(1,event.scroll?.delta??1)
    if(!delta)return
    const max=Math.max(0,items().length-listHeight())
    const offset=Math.max(0,Math.min(max,window().start+delta))
    patch({offset})
    // Keep the highlight inside the viewport so the next frame does not snap back.
    const pos=linePos()
    if(pos<offset||pos>=offset+listHeight()){
      const target=items().slice(offset,offset+listHeight()).find(i=>i.row)
      if(target)patch({selected:target.row.ref})
    }
  }

  const muted=theme.text.muted
  const selectedBg=theme.background.action.primary.focused
  const selectedFg=theme.text.action.primary.focused
  const assignment=createMemo(()=>{
    const ref=slots()[slot()]
    if(!ref)return slot()?"Empty fallback slot":"No default model"
    const r=rows().find(x=>x.ref===key(ref))
    const level=ref.split("#")[1]
    return `${r?.name??key(ref)}${level?` · ${level}`:""}`
  })

  let input
  return (
    <box paddingLeft={3} paddingRight={3} paddingBottom={1} gap={1}>
      <box flexDirection="row" justifyContent="space-between">
        <text fg={theme.text.base} attributes={TextAttributes.BOLD} wrapMode="none">
          {agent()??"Agent"}<span style={{fg:muted}}>{` · ${strip().tabs[slot()]?.label??""}`}</span>
        </text>
        <text fg={muted} flexShrink={0} onMouseUp={()=>ctx.ui.dialog.clear()}>esc</text>
      </box>
      <box>
        <box flexDirection="row" onMouseScroll={scrollTabs}>
          <text fg={tabs().more.left?theme.text.base:muted} width={2} flexShrink={0}
            onMouseUp={()=>tabs().more.left&&goSlot(-1)}>{tabs().more.left?"‹ ":"  "}</text>
          <For each={tabs().list}>{t=>{
            const active=()=>t.index===slot()
            return (
              <box flexDirection="row" flexShrink={0} backgroundColor={active()?selectedBg:undefined}>
                <text fg={active()?selectedFg:t.ref?theme.text.base:muted} wrapMode="none"
                  attributes={active()?TextAttributes.BOLD:undefined}
                  onMouseUp={()=>{if(!active())run(`slot:${t.index}`)}}>{` ${tabLabel(t)} `}</text>
                <Show when={t.close}>
                  <text fg={active()?selectedFg:muted} wrapMode="none"
                    onMouseUp={e=>{e.stopPropagation?.();run(`remove-slot:${t.index}`)}}>{"× "}</text>
                </Show>
              </box>
            )
          }}</For>
          <text fg={tabs().more.right?theme.text.base:muted} width={2} flexShrink={0}
            onMouseUp={()=>tabs().more.right&&goSlot(1)}>{tabs().more.right?" ›":"  "}</text>
          <Show when={strip().add}>
            <text fg={theme.text.base} flexShrink={0} onMouseUp={()=>run("add-slot")}>{" + "}</text>
          </Show>
        </box>
        <text fg={muted} wrapMode="none">{`${busy()?"Saving… ":""}${assignment()}`}</text>
      </box>
      <input
        value={untrack(()=>view().query)}
        placeholder="Search models"
        placeholderColor={muted}
        focusedBackgroundColor={theme.background.formfield.focused}
        focusedTextColor={theme.text.formfield.focused}
        cursorColor={theme.text.formfield.focused}
        onInput={value=>patch({query:value,selected:undefined,offset:0})}
        ref={r=>{input=r;setTimeout(()=>{if(input&&!input.isDestroyed)input.focus()},1)}}
      />
      <box marginLeft={-3} marginRight={-3}>
        <Show when={items().length} fallback={
          <box paddingLeft={4}><text fg={muted}>{rows().length?"No results found":"No models available"}</text></box>}>
          <box height={Math.min(items().length,listHeight())} onMouseScroll={scrollList}>
            <For each={visible()}>{item=>item.header!==undefined
              ? <box paddingLeft={4}><text fg={theme.hue.accent[200]} attributes={TextAttributes.BOLD} wrapMode="none">{item.header}</text></box>
              : <ModelRow ctx={ctx} item={item} theme={theme}
                  active={()=>item.index===highlighted()}
                  checked={()=>item.row.ref===key(current())}
                  used={()=>usedBy().get(item.row.ref)}
                  level={()=>item.row.ref===key(current())?current().split("#")[1]:undefined}
                  searching={searching}
                  onHover={()=>highlight(item.index)}
                  onPick={()=>choose(item.row)}/>
            }</For>
          </box>
        </Show>
      </box>
      <Show when={variants()?.choices.length>1}>
        <box flexDirection="row" flexWrap="wrap">
          <text fg={muted} flexShrink={0}>{"Variant "}</text>
          <For each={variants().choices}>{(v,i)=>(
            <text flexShrink={0} fg={i()===variants().selected?selectedFg:theme.text.base}
              bg={i()===variants().selected?selectedBg:undefined}
              onMouseUp={()=>patch({variant:{ref:row().ref,value:v}})}>{` ${v==="default"?"Model default":v} `}</text>
          )}</For>
        </box>
      </Show>
      <box flexDirection="row" flexWrap="wrap" columnGap={2}>
        <Hint theme={theme} title="save" keyName="enter" onTrigger={()=>choose()}/>
        <Hint theme={theme} title="slot" keyName="tab"/>
        <Show when={variants()?.choices.length>1}><Hint theme={theme} title="variant" keyName={keys.variant} onTrigger={cycleVariant}/></Show>
        <Show when={action()}>{a=><Hint theme={theme} title={slot()?"clear":"reset"} keyName={keys.reset}
          disabled={a().disabled} onTrigger={()=>!a().disabled&&run(a().value)}/>}</Show>
        <Show when={strip().add}><Hint theme={theme} title="add" keyName={keys.add} onTrigger={()=>run("add-slot")}/></Show>
        <Show when={removable()}><Hint theme={theme} title="remove" keyName={keys.remove} onTrigger={()=>run(`remove-slot:${slot()}`)}/></Show>
        <Show when={connect.available()}><Hint theme={theme} title="connect" keyName={keys.connect} onTrigger={()=>connect.run()}/></Show>
      </box>
    </box>
  )
}

function ModelRow(props){
  const theme=props.theme
  const fg=()=>props.active()?theme.text.action.primary.focused:theme.text.base
  const sub=()=>props.active()?theme.text.action.primary.focused:theme.text.muted
  const trailing=()=>[props.level(),props.used()&&`in ${props.used()}`,props.searching()&&props.item.row.group].filter(Boolean).join(" · ")
  return (
    <box flexDirection="row" paddingLeft={2} paddingRight={4} gap={1}
      backgroundColor={props.active()?theme.background.action.primary.focused:undefined}
      onMouseMove={props.onHover} onMouseDown={props.onHover} onMouseUp={props.onPick}>
      <text width={1} flexShrink={0} fg={props.checked()?(props.active()?fg():theme.text.formfield.selected):fg()}>
        {props.checked()?"✓":" "}
      </text>
      <text flexGrow={1} flexShrink={1} fg={fg()} wrapMode="none" overflow="hidden">
        {props.item.row.name}<span style={{fg:sub()}}>{" "+props.item.row.ref}</span>
      </text>
      <Show when={trailing()}>
        <text flexShrink={0} fg={sub()} wrapMode="none">{trailing()}</text>
      </Show>
    </box>
  )
}

function Hint(props){
  const color=()=>props.disabled?props.theme.text.action.primary.disabled:props.theme.text.base
  return (
    <text flexShrink={0} onMouseUp={()=>!props.disabled&&props.onTrigger?.()}>
      <span style={{fg:color()}}>{props.title}</span>
      <span style={{fg:props.disabled?color():props.theme.text.muted}}>{" "+props.keyName}</span>
    </text>
  )
}
