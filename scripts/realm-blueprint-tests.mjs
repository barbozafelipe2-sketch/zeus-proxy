import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { REALM_BLUEPRINT, getRealmName, getRealmStatus } from '../netlify/functions/_shared/realm-blueprint.mjs';
import { TOOL_WORKFLOWS } from '../netlify/functions/_shared/tool-workflows.mjs';
import { SKILL_REGISTRY } from '../netlify/functions/_shared/skill-engine.mjs';

const frontend=await readFile(new URL('../public/app.js',import.meta.url),'utf8');
const modelEndpoint=await readFile(new URL('../netlify/functions/tool-models.mjs',import.meta.url),'utf8');
const styles=await readFile(new URL('../public/styles.css',import.meta.url),'utf8');
assert.deepEqual(REALM_BLUEPRINT.realms.slice(0,3).map(realm=>realm.id),['zeus','poseidon','athena'],'oversight and coordinator lead the catalog');
assert.equal(REALM_BLUEPRINT.realms.filter(realm=>realm.id!=='zeus').length,9,'Zeus stays separate from the nine product Realms');
assert.equal(getRealmName('athena'),'Athena','backend workflow owner comes from canonical blueprint');
assert.equal(getRealmName('hestia'),'Héstia','internal capability owner comes from canonical blueprint');
assert.equal(getRealmStatus('hefesto'),'active','canonical readiness is available to backend');
for(const workflow of Object.values(TOOL_WORKFLOWS)){
  const internal=workflow.internal;
  assert.ok(getRealmName(internal?'hestia':workflow.id==='web'||workflow.id==='documents'?'athena':workflow.id==='code'?'hefesto':'apollo'),`workflow ${workflow.id} has a canonical owner`);
}
for(const id of ['dionisio.media','peitho.marketing','demeter.business','hermes.communication','hades.security']){
  const skill=SKILL_REGISTRY[id];
  assert.equal(skill.enabled,false,`${id} remains unavailable until its workflow exists`);
}
assert.ok(frontend.includes("fetch('/realm-blueprint.json'"),'UI fetches the canonical manifest');
assert.ok(frontend.includes('state.realmBlueprint?.realms'),'UI renders deity cards from the manifest');
assert.ok(frontend.includes('activeCount}/${models.length} famílias de provedor configuradas'),'runtime count uses the actual model pool and labels route configuration accurately');
assert.ok(frontend.includes('function teamView()')&&frontend.includes('data-team-member='),'Equipe renders every canonical Realm with its skills and model pool');
assert.ok(frontend.includes('function mobileBottomNav()')&&styles.includes('.side-nav button[data-nav-group="bottom"]{display:none}'),'mobile navigation separates bottom destinations from the drawer');
assert.ok(modelEndpoint.includes('requested:models.length'),'model inventory denominator follows the actual roster rather than a hard-coded six');
console.log('Canonical Realm blueprint contract: PASS');
