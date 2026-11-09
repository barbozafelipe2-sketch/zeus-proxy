import blueprint from '../../../public/realm-blueprint.json' with { type: 'json' };

// public/realm-blueprint.json is the canonical product contract. The same file
// is fetched by the browser and read here by server workflow/skill metadata.
export const REALM_BLUEPRINT=Object.freeze(blueprint);
const realms=new Map(REALM_BLUEPRINT.realms.map(realm=>[realm.id,realm]));
const internal=new Map(REALM_BLUEPRINT.internalCapabilities.map(capability=>[capability.id,capability]));
export function getRealmBlueprint(id){return realms.get(id)||null;}
export function getRealmName(id){return realms.get(id)?.name||internal.get(id)?.name||null;}
export function getRealmStatus(id){return realms.get(id)?.status||internal.get(id)?.status||null;}
