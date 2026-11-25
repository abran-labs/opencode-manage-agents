import {installFallback} from "./fallback.js"
import {installEditor} from "./editor-server.js"

export default {id:"manage-agents",async setup(ctx) {
  const editor=await installEditor(ctx)
  try {
    const stop=await installFallback(ctx)
    return async()=>{stop();await editor.dispose()}
  } catch(e){await editor.dispose();throw e}
}}
