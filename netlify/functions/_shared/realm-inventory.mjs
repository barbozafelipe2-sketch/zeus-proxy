import { REALM_BLUEPRINT } from './realm-blueprint.mjs';
import { TOOL_WORKFLOWS } from './tool-workflows.mjs';
import { fixedImageModelCatalog, toolModelCandidates, providerReadiness, directProviderStatus } from './models.mjs';
import { modelFamily } from './provider-routing.mjs';
import { elevenLabsRealtimeAgentConfigured } from './elevenlabs-agent.mjs';

const env = name => globalThis.Netlify?.env?.get?.(name) || process.env?.[name] || '';

function workflowRoster(workflow) {
  if (workflow.id === 'images') return fixedImageModelCatalog();
  const full = toolModelCandidates(workflow.id, `${workflow.title} ${workflow.route}`, {
    toolId: workflow.id,
    includeUnavailable: true,
  });
  const eligible = new Set(toolModelCandidates(workflow.id, `${workflow.title} ${workflow.route}`, {
    toolId: workflow.id,
  }).map(model => `${modelFamily(model)}:${model.id}`));
  return full.map(model => ({
    id: model.id,
    name: model.name || model.id,
    provider: model.provider,
    family: modelFamily(model),
    available: eligible.has(`${modelFamily(model)}:${model.id}`),
  }));
}

function workflowDto(workflow) {
  const models = workflowRoster(workflow);
  return {
    id: workflow.id,
    title: workflow.title,
    route: workflow.route,
    internal: Boolean(workflow.internal),
    models,
    available: models.filter(model => model.available).length,
    requested: models.length,
  };
}

function inventoryEntry(entry, internal = false) {
  const workflows = Object.values(TOOL_WORKFLOWS)
    .filter(workflow => workflow.god.toLocaleLowerCase('pt-BR') === entry.name.toLocaleLowerCase('pt-BR'))
    .map(workflowDto);
  const models = workflows.flatMap(workflow => workflow.models)
    .filter((model, index, all) => all.findIndex(item => `${item.family}:${item.id}` === `${model.family}:${model.id}`) === index);
  return {
    ...entry,
    internal,
    workflows,
    models,
    available: models.filter(model => model.available).length,
    requested: models.length,
    assignment: models.length ? 'workflow' : 'blueprint_only',
  };
}

export function buildRealmInventory() {
  const direct=directProviderStatus();
  return {
    version: REALM_BLUEPRINT.version,
    updated: REALM_BLUEPRINT.updated,
    realms: REALM_BLUEPRINT.realms.map(entry => inventoryEntry(entry)),
    internalCapabilities: REALM_BLUEPRINT.internalCapabilities.map(entry => inventoryEntry(entry, true)),
    providers: providerReadiness(),
    voiceProviders: {
      openaiRealtime: Boolean(env('OPENAI_API_KEY')),
      googleGeminiLive: Boolean(env('GEMINI_API_KEY') || env('GOOGLE_API_KEY')),
      elevenLabsRealtime: elevenLabsRealtimeAgentConfigured(),
    },
    routingPolicy: {
      text: ['netlify_ai_gateway', 'openrouter_via_netlify_ai_gateway','google_direct','openai_direct'],
      directKeys: 'text recovery requires explicit *_DIRECT_API_KEY credentials; Anthropic/OpenRouter remain Gateway-only',
      directTextFallbackEnabled: direct.gemini||direct.openai,
      directProviders:direct,
      availabilityMeans: 'provider route configured or model eligible; it is not a live inference health check',
    },
  };
}
