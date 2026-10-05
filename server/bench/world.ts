import { performance, monitorEventLoopDelay, PerformanceObserver } from 'node:perf_hooks';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ChunkGrid, encodeMutations, decodeMutations, Mutation } from '../../shared/world/binary';
import { WorldClientState } from '../../shared/world/WorldClientState';

async function run() {
  const rows:{name:string;median:number;p95:number;bytes?:number}[]=[];
  const measure=(name:string,fn:()=>void,bytes?:number)=>{
    for(let i=0;i<5;i++)fn();const samples:number[]=[];
    for(let i=0;i<40;i++){const start=performance.now();fn();samples.push(performance.now()-start);}
    samples.sort((a,b)=>a-b);rows.push({name,median:samples[20],p95:samples[38],bytes});
  };
  const gcEvents:{duration:number}[]=[];
  const observer=new PerformanceObserver(list=>{for(const e of list.getEntries())gcEvents.push({duration:e.duration});});observer.observe({entryTypes:['gc']});
  const delay=monitorEventLoopDelay({resolution:10});delay.enable();
  const world=new Uint16Array(1_000_000),grid=new ChunkGrid();
  const tenK:Mutation[]=Array.from({length:10000},(_,i)=>({tileIndex:i,schoolMask:(i%255)+1,opcode:0}));
  measure('10k mutation encode',()=>{encodeMutations(tenK,0,0,1);},28+10000*8);
  const tenPacket=encodeMutations(tenK,0,0,1);
  measure('10k mutation decode',()=>{decodeMutations(tenPacket);});
  measure('10k mutation apply (dense buffer)',()=>{for(const m of tenK)world[m.tileIndex]=m.schoolMask;});
  const entries=(count:number)=>Array.from({length:count},(_,i)=>({tileIndex:Math.floor(i/64)*1000+i%64,schoolMask:3,opcode:0}));
  for(const count of [100,500]) {
    const mutations=entries(count),packet=encodeMutations(mutations,0,0,1);
    measure(`${count} mutation encode/decode`,()=>{decodeMutations(encodeMutations(mutations,0,0,1));},packet.length);
    const client=new WorldClientState();let v=0;
    measure(`${count} mutation validated client apply`,()=>{client.delta(encodeMutations(mutations,0,0,++v));});
  }
  measure('64x64 chunk serialize',()=>{grid.serialize(world,0,0);},8192);
  const chunk=grid.serialize(world,0,0);
  measure('64x64 chunk deserialize',()=>{grid.deserialize(chunk,world,0,0);});
  const tierResults:string[]=[];
  // Bounded simulated caches, no claim of real WebSocket/server capacity.
  for(const count of [100,500,1000]) {
    if(count>100 && process.env.BENCH_LARGE_TIERS!=='true') {tierResults.push(`${count}: skipped by default to avoid allocating ${count*2} MB of client buffers on the workstation.`);continue;}
    global.gc?.();const before=process.memoryUsage();
    const clients=Array.from({length:count},()=>new WorldClientState());
    const packet=encodeMutations(entries(100),0,0,1);const start=performance.now();
    for(const client of clients)client.delta(packet);
    await new Promise<void>(resolve=>setImmediate(resolve));
    const after=process.memoryUsage();
    tierResults.push(`${count} simulated client caches: ${(performance.now()-start).toFixed(3)} ms aggregate apply; allocated dense buffers ${(clients.reduce((sum,c)=>sum+c.masks.byteLength,0)/1048576).toFixed(2)} MiB; observed array-buffer delta ${((after.arrayBuffers-before.arrayBuffers)/1048576).toFixed(2)} MiB (includes collection of prior tiers).`);
  }
  global.gc?.();await new Promise(resolve=>setTimeout(resolve,50));delay.disable();observer.disconnect();
  const result=`# R2PL world benchmark\n\nNode ${process.version}, ${process.platform}/${process.arch}; ${os.cpus()[0].model}, ${(os.totalmem()/1073741824).toFixed(1)} GiB RAM. Run at ${new Date().toISOString()}. 5 warmups and 40 samples; timings are workstation microbenchmarks.\n\n`+
    `Dense Uint16 presence: ${world.byteLength.toLocaleString()} bytes (1.907 MiB). Fog: 125,000 bytes/school flat; fixed padded chunks use 131,072 bytes/school, 1 MiB for 8 schools / 2 MiB for 16. Legacy display owner buffer remains 1,000,000 bytes. Sparse metadata memory grows with explored tile-school pairs.\n\n`+
    '| Operation | Median ms | p95 ms | Packet bytes |\n|---|---:|---:|---:|\n'+rows.map(r=>`| ${r.name} | ${r.median.toFixed(3)} | ${r.p95.toFixed(3)} | ${r.bytes||''} |`).join('\n')+
    `\n\nEvent loop delay: mean ${(delay.mean/1e6).toFixed(3)} ms, max ${(delay.max/1e6).toFixed(3)} ms (10ms sampling resolution). Observed GC events: ${gcEvents.length}; total ${gcEvents.reduce((sum,r)=>sum+r.duration,0).toFixed(3)} ms. Explicit GC available: ${!!global.gc}. RSS at end: ${(process.memoryUsage().rss/1048576).toFixed(2)} MiB.\n\n`+
    tierResults.map(r=>'- '+r).join('\n')+
    '\n\nThese tiers allocate full-sized client buffers but touch only the tested chunk; RSS differs from virtual/array-buffer allocations. They simulate client state caches only, not real concurrent sockets, gameplay validation, GPU rendering, SQL throughput, or deployment capacity. Run BENCH_LARGE_TIERS=true explicitly for 500/1000 cache allocation. PostgreSQL latency remains unmeasured without DATABASE_URL.\n';
  const out=path.resolve(__dirname,'../../docs/world-benchmark.md');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,result);console.log(result);
}
run().catch(error=>{console.error(error);process.exitCode=1;});
