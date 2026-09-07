import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadConfig, makeEnvironment } from './runner.mjs';

const config = loadConfig(fileURLToPath(new URL('./config.json',import.meta.url)));
console.log('술술 · Google 계정을 연결하세요. 로그인 완료 후 /quit을 입력하세요.');
const child = spawn(config.cli,[],{cwd:config.workspace,env:makeEnvironment(config),stdio:'inherit',shell:false});
child.on('error',() => { console.error('Antigravity를 실행하지 못했습니다. 설치 프로그램을 다시 실행하세요.'); process.exitCode=1; });
child.on('exit',code => { process.exitCode=code ?? 1; });
