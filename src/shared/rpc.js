import {DEFAULT_FALLBACK_SLOTS,MAX_FALLBACK_SLOTS} from "./slot-limits.js"

const str={type:"string"}, strings={type:"array",items:str}
const obj=(properties,required=Object.keys(properties))=>({type:"object",properties,required,additionalProperties:false})
const state=obj({
  model:{type:["string","null"]},chain:strings,
  positions:{type:"array",items:{type:"integer",minimum:1,maximum:MAX_FALLBACK_SLOTS},maxItems:MAX_FALLBACK_SLOTS,uniqueItems:true},
  slotCount:{type:"integer",minimum:DEFAULT_FALLBACK_SLOTS,maximum:MAX_FALLBACK_SLOTS}
},["model","chain"])
const edit=obj({id:str,before:state,after:state})
export const contract={id:"manage-agents",events:{},methods:{
  create:{input:obj({id:str,mode:{type:"string",enum:["primary","subagent"]},description:str}),output:obj({created:{type:"boolean"}})},
  catalog:{input:obj({}),output:obj({
    agents:{type:"array",items:obj({id:str,name:str,mode:str,effective:{type:["string","null"]}})},
    models:{type:"array",items:obj({ref:str,name:str,variants:strings})}
  })},
  load:{input:obj({id:str}),output:state},
  save:{input:edit,output:obj({saved:{type:"boolean"}})},
  saveState:{input:edit,output:state}
}}
