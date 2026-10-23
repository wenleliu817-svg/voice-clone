const assert = require('node:assert/strict');
const transport = require('../docs/transport.js');
assert.equal(transport.validateBackendBase('https://voice.example.com/'), 'https://voice.example.com');
for (const url of ['http://example.com','https://user:password@example.com','https://example.com/?key=secret','https://openapi.youdao.com']) {
 assert.throws(() => transport.validateBackendBase(url));
}
console.log('backend connection tests passed');

const fs = require('node:fs');
const vm = require('node:vm');
const nodes = new Map();
const context = vm.createContext({
 window:{YoudaoVoiceCloneTransport:{...transport,resolveBackendBase:()=> 'https://old.example.com'},location:{}},
 localStorage:{getItem:()=>null},URL,document:{getElementById(id){
  if (!nodes.has(id)) nodes.set(id,{textContent:'',value:'',querySelector(){return this;}});
  return nodes.get(id);
 }}
});
vm.runInContext(fs.readFileSync('docs/app.js','utf8').replace(/initApp\(\);\s*$/,''),context);
(async()=>{
 vm.runInContext('showMessage = () => {}; requestJson = async () => ({ok:false});',context);
 await assert.rejects(vm.runInContext('checkConnection()',context),/不兼容/);
 vm.runInContext('requestJson = async () => { throw new Error("offline"); };',context);
 await vm.runInContext('applyBackend("https://new.example.com")',context);
 assert.equal(vm.runInContext('API_BASE',context),'https://old.example.com');
 vm.runInContext('requestJson = async () => ({ok:true}); pendingTask = {taskId:"old"};',context);
 await vm.runInContext('applyBackend("https://new.example.com")',context);
 assert.equal(vm.runInContext('API_BASE',context),'https://new.example.com');
 assert.equal(vm.runInContext('pendingTask',context),null);
 console.log('connection checks and backend switching passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
