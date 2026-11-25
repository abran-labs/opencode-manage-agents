import {mkdirSync,writeFileSync,linkSync,unlinkSync} from "node:fs"
import {randomUUID} from "node:crypto"
import {join} from "node:path"

export function addAgent(root,id,mode,description){
  if(!/^[a-z][a-z0-9-]{0,62}$/.test(id)||["constructor","prototype"].includes(id))throw Error("Use a lowercase name with letters, digits or hyphens.")
  if(!["primary","subagent"].includes(mode)||!description.trim()||description.length>500)throw Error("Choose an agent type and a short description.")
  const dir=join(root,"agents")
  mkdirSync(dir,{recursive:true,mode:0o700})
  const temp=join(dir,"."+randomUUID()+".tmp")
  writeFileSync(temp,`---\nmode: ${mode}\ndescription: ${JSON.stringify(description.trim())}\n---\n`,{mode:0o600,flag:"wx"})
  try{linkSync(temp,join(dir,id+".md"))}
  catch(e){if(e.code==="EEXIST") throw Error("An agent with that name already exists.");throw e}
  finally{unlinkSync(temp)}
}
