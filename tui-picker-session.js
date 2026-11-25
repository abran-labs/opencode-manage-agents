// One persistent picker per /agents run. The shared editor calls pick(settings)
// once per step; the mounted dialog stays up and only its target slot changes.
// Host dependencies are injected so the lifecycle is testable without a renderer.
//
// signal          Solid createSignal (injected: tests run without the host runtime)
// show(onClose)   mount the picker dialog (replaces any host dialog)
// clear()         close the dialog stack
// connect()       run the native connect command; it replaces our dialog
// observe(fn)     call fn({modal,nativeModels}) on change; returns stop.
//                 modal: any dialog is open. nativeModels: the chat's model dialog is open.
// onResume()      after the picker returns from native connect
export function createPickerSession({signal,show,clear,connect,observe,onResume}){
  const [request,setRequest]=signal()
  const [view,setView]=signal({query:"",selected:undefined,tabStart:0,offset:0})
  let shown=false,suspended=false,ended=false,cancelled=false,overlays=0,stop

  function settle(value){
    const r=request()
    if(!r)return
    setRequest(undefined)
    r.resolve(value)
  }
  function closed(){
    // dialog.replace() runs the previous onClose, so a native overlay looks like a close.
    shown=false
    if(suspended||ended||overlays)return
    // Escape while a save is in flight still ends the run at the next step.
    if(!request())cancelled=true
    settle(undefined)
  }
  function mount(){
    if(shown||ended)return
    shown=true
    show(closed)
  }
  function resume(){
    if(!suspended)return
    stop?.();stop=undefined
    suspended=false
    // Unsaved context is the pending step itself: settings, query and highlight survive.
    mount()
    onResume?.()
  }
  return {
    request,view,setView,
    get shown(){return shown},
    get suspended(){return suspended},
    pick(settings){
      if(ended||cancelled)return Promise.resolve()
      return new Promise(resolve=>{setRequest({settings,resolve});mount()})
    },
    choose:settle,
    // A host dialog (confirm, alert) opened between steps replaces the picker; that is not a cancel.
    async overlay(run){
      overlays++
      try{return await run()}finally{overlays--}
    },
    // The editor step stays pending while native connect runs. Come back once its
    // dialogs are dismissed, or as soon as it opens the chat's model dialog: that
    // dialog switches the current chat's model, so it is replaced, never used.
    connect(){
      if(!request()||suspended||ended)return false
      suspended=true
      stop=observe(({modal,nativeModels})=>{
        if(suspended&&(nativeModels||!modal))queueMicrotask(resume)
      })
      connect()
      // Nothing replaced us: the command was unreachable.
      if(shown){stop?.();stop=undefined;suspended=false;return false}
      return true
    },
    end(){
      if(ended)return
      ended=true
      stop?.();stop=undefined
      settle(undefined)
      if(shown){shown=false;clear()}
    },
  }
}
