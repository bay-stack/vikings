import {rpc} from '../playbook/cloud.js';
// Send only a malformed credential: the expected 403 confirms the HTTP route,
// public client key, and authorization guard without accessing any playbook.
try {
  await rpc('list',{p_key:'invalid'});
  throw Error('The cloud endpoint unexpectedly accepted an invalid editing key.');
} catch(e) {
  if(e.status!==403)throw e;
  console.log('PASS: cloud HTTP endpoint reachable; invalid editing key rejected.');
}
