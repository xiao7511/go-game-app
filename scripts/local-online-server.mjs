// Local unranked rooms; verify existing accounts with the deployed public Auth.
import fs from 'node:fs';
import path from 'node:path';
import {onlinePublicConfig} from './online-public-config.mjs';
import {startDeviceServer,onlineAuthenticator} from '../server/device-test.mjs';
const domain=fs.readFileSync('CNAME','utf8').trim();
if(!/^[a-z0-9.-]+$/i.test(domain))throw Error('Invalid site domain');
const config=await onlinePublicConfig('https://'+domain);
const directory=path.resolve('.nobi-isolated/xiangqi');fs.mkdirSync(directory,{recursive:true});
const server=await startDeviceServer({authenticate:onlineAuthenticator(config),database:path.join(directory,'manual-rooms.sqlite'),port:55440});
console.log('Local online rooms ready at '+server.url+' (Go / Guandan / Xiangqi). Existing accounts are verified; match data stays local and unranked.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await server.close();process.exit(0);});
