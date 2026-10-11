export function normalizeCommand(roomId:string, input:any) {
 if(input?.actionId!==undefined) {
  if(input.matchId!==roomId || typeof input.actionType!=='string' || !input.actionPayload || typeof input.actionPayload!=='object' || Array.isArray(input.actionPayload)) throw new Error('invalid canonical command');
  return {...input.actionPayload,requestId:input.actionId,expectedVersion:input.expectedVersion,type:input.actionType};
 }
 return input;
}

export function canonicalJson(value:any):string {if(value===null||typeof value!=='object')return JSON.stringify(value);if(Array.isArray(value))return '['+value.map(canonicalJson).join(',')+']';return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+canonicalJson(value[key])).join(',')+'}';}
