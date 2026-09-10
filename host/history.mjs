import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,randomBytes,createHmac} from 'node:crypto';
export const HISTORY_LIMIT=1000;
export const HISTORY_DAYS=30;
const filename=/^\d{13}-[a-f0-9-]{36}\.json$/;
export class UsageHistory{
  constructor(config){this.directory=path.resolve(path.dirname(config.schema),'../data/usage-history');this.storageError=false;}
  files(){try{return fs.readdirSync(this.directory).filter(name=>filename.test(name)).sort().reverse();}catch(e){if(e.code==='ENOENT')return [];throw e;}}
  fingerprints(provider,data){
    if(!Array.isArray(data?.blocks)||!data.blocks.length||data.blocks.some(b=>!Array.isArray(b.parts)))return null;
    // A local secret prevents guessing short source labels from a public unsalted hash.
    if(!this.key){
      const file=path.join(this.directory,'fingerprint-key');
      fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
      if(!fs.existsSync(file)){
        const temporary=file+'.'+randomUUID()+'.tmp';
        try{fs.writeFileSync(temporary,randomBytes(32),{mode:0o600});try{fs.linkSync(temporary,file);}catch(e){if(e.code!=='EEXIST')throw e;}}
        finally{try{fs.unlinkSync(temporary);}catch{}}
      }
      this.key=fs.readFileSync(file);if(this.key.length!==32){this.key=null;throw new Error('Invalid fingerprint key');}
    }
    const hash=value=>createHmac('sha256',this.key).update(JSON.stringify(value)).digest('base64url').slice(0,22);
    let url;try{url=new URL(data.page?.url);}catch{return null;}
    const blocks=data.blocks.map(b=>hash(['1',provider.model,provider.fast===true,provider.targetLanguage||'ko',url.origin,
      b.cacheKind==='navigation'?'navigation':[url.pathname+url.search,data.page?.title||'',b.heading||''],b.parts.map(p=>[p.text,!!p.locked])]));
    return {version:1,batch:hash([...blocks].sort()),blocks};
  }
  prune(){const cutoff=Date.now()-HISTORY_DAYS*86400000;this.files().forEach((name,i)=>{if(i>=HISTORY_LIMIT||Number(name.slice(0,13))<cutoff)try{fs.unlinkSync(path.join(this.directory,name));}catch(e){if(e.code!=='ENOENT')throw e;}});}
  write(entry){
    const name=`${entry.startedAt}-${entry.id}.json`;
    if(!filename.test(name))throw new Error('Invalid history ID');
    fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
    const destination=path.join(this.directory,name),temporary=destination+'.'+randomUUID()+'.tmp';
    try{fs.writeFileSync(temporary,JSON.stringify(entry),{mode:0o600});fs.renameSync(temporary,destination);this.storageError=false;}
    finally{try{fs.unlinkSync(temporary);}catch{}}
  }
  begin(provider,data,kind){
    let site='';try{site=new URL(data?.page?.url).hostname.slice(0,253);}catch{}
    const entry={id:randomUUID(),startedAt:Date.now(),status:'running',kind,site,model:provider.model,modelResolved:false,fast:provider.fast===true,language:provider.targetLanguage||'ko',blocks:Array.isArray(data?.blocks)?data.blocks.length:0,usage:null,cost:null};
    try{entry.fingerprints=this.fingerprints(provider,data);}catch{entry.fingerprints=null;}
    try{this.write(entry);this.prune();}catch{this.storageError=true;}
    return entry;
  }
  finish(entry,status,telemetry){
    const result={...entry,status,durationMs:Date.now()-entry.startedAt,...telemetry};
    try{this.write(result);}catch{this.storageError=true;}
  }
  read(){
    this.prune();
    let unreadable=0;
    const entries=this.files().flatMap(name=>{try{const value=JSON.parse(fs.readFileSync(path.join(this.directory,name),'utf8'));if(value.startedAt+260000<Date.now()&&value.status==='running')value.status='incomplete';return [value];}catch{unreadable++;return [];}});
    const seen=new Set();
    const compared=new Map();
    for(const entry of [...entries].sort((a,b)=>a.startedAt-b.startedAt||a.id.localeCompare(b.id))){
      const ids=entry.fingerprints?.version===1&&Array.isArray(entry.fingerprints.blocks)?entry.fingerprints.blocks:null;
      const valid=ids&&ids.length===entry.blocks&&ids.every(id=>/^[A-Za-z0-9_-]{22}$/.test(id));
      compared.set(entry.id,valid?{fingerprint:entry.fingerprints.batch,repeatedBlocks:ids.filter(id=>seen.has(id)).length}:{});
      if(valid)for(const id of ids)seen.add(id);
    }
    // Per-block hashes remain on disk; only compact diagnostics cross Chrome's 1 MB message boundary.
    return {entries:entries.map(({fingerprints,...entry})=>({...entry,...compared.get(entry.id)})),limit:HISTORY_LIMIT,days:HISTORY_DAYS,storageError:this.storageError,unreadable};
  }
  clear(){for(const name of this.files())try{fs.unlinkSync(path.join(this.directory,name));}catch(e){if(e.code!=='ENOENT')throw e;}this.storageError=false;return {};}
}
