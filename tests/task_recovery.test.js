const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('docs/app.js', 'utf8').replace(/initApp\(\);\s*$/, '');
function context() {
 const c = vm.createContext({window:{YoudaoVoiceCloneTransport:{resolveBackendBase:()=>''},location:{},setTimeout: (fn) => { queueMicrotask(fn); return 0; },clearTimeout},localStorage:{getItem:()=>null},document:{getElementById:()=>({value:'wav'})},console,URL,AbortController});
 vm.runInContext(code,c);
 vm.runInContext('setProgressStage = () => {}; renderResults = () => {};',c);
 return c;
}
(async()=>{
 const c = context();
 vm.runInContext(`fetchTaskProgress = async () => ({code:'401',message:'余额不足'});`,c);
 await assert.rejects(vm.runInContext('pollYoudaoTask({taskId:"task"})',c), /401|余额/);
 vm.runInContext(`fetchTaskProgress = async () => ({code:'0',data:{status:'SUCCESS'}}); fetchTaskResults = async () => [];`,c);
 await assert.rejects(vm.runInContext('pollYoudaoTask({taskId:"task"})',c), /音频|结果/);
 vm.runInContext(`let resultCalls=0; fetchTaskResults = async () => ++resultCalls < 3 ? [] : [{mediaUrl:'https://ydstatic.com/a.mp3'}];`,c);
 await vm.runInContext('pollYoudaoTask({taskId:"task"})',c);
 assert.equal(vm.runInContext('resultCalls',c),3);
 vm.runInContext(`let progressCalls=0; fetchTaskProgress = async () => { if (++progressCalls < 3) throw new TypeError('network'); return {code:'0',data:{status:'SUCCESS'}}; };`,c);
 await vm.runInContext('pollYoudaoTask({taskId:"task"})',c);
 assert.equal(vm.runInContext('progressCalls',c),3);
 console.log('task recovery tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

// Exercise the real click handler: retry must query the saved task, not upload/submit again.
(async () => {
 const c = context();
 vm.runInContext(`
 const nodes = new Map();
 document.getElementById = id => {
   if (!nodes.has(id)) nodes.set(id, {value: ({appKey:'app',appSecret:'secret',composeText:'hello',format:'mp3',speed:'1',volume:'1'})[id] || '',classList:{add(){},remove(){}},querySelector(){return this;}});
   return nodes.get(id);
 };
 showMessage = () => {};
 audioFile = {};
 let uploads=0, submissions=0, polls=0;
 requestJson = async () => ({ok:true});
 uploadReferenceAudio = async () => { uploads++; return 'voice'; };
 submitAsyncSynthesis = async () => { submissions++; return 'task'; };
 pollYoudaoTask = async () => { if (++polls === 1) throw new Error('offline'); };
 `, c);
 await vm.runInContext('startSynthesis()',c);
 assert.equal(vm.runInContext('pendingTask.taskId',c),'task');
 assert.equal(vm.runInContext('isRunning',c),false);
 await vm.runInContext('startSynthesis()',c);
 assert.equal(vm.runInContext('uploads',c),1);
 assert.equal(vm.runInContext('submissions',c),1);
 assert.equal(vm.runInContext('polls',c),2);
 assert.equal(vm.runInContext('pendingTask',c),null);
 console.log('resume click handler test passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
