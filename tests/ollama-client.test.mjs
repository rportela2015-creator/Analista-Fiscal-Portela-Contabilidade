import assert from 'node:assert/strict';
import {
  isOllamaOnline,
  getOllamaModels,
  getSovereigntyMode,
  getBestTriagemModel,
  getBestPericiaModel,
  extrairJsonOllama,
} from '../lib/ollama-client.ts';

const t = async (name, fn) => {
  try {
    await fn();
    console.log(`OK  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}`, err);
    throw err;
  }
};

await t('isOllamaOnline: detecta status sem lançar exceções não tratadas', async () => {
  const online = await isOllamaOnline(800);
  assert.equal(typeof online, 'boolean');
});

await t('getOllamaModels: retorna array de modelos ou vazio em caso de indisponibilidade', async () => {
  const models = await getOllamaModels();
  assert.ok(Array.isArray(models));
});

await t('getSovereigntyMode: respeita a variável de ambiente AI_SOVEREIGNTY_MODE', async () => {
  delete process.env.AI_SOVEREIGNTY_MODE;
  assert.equal(getSovereigntyMode(), 'local_first');

  process.env.AI_SOVEREIGNTY_MODE = 'local_strict';
  assert.equal(getSovereigntyMode(), 'local_strict');

  process.env.AI_SOVEREIGNTY_MODE = 'hybrid';
  assert.equal(getSovereigntyMode(), 'hybrid');

  process.env.AI_SOVEREIGNTY_MODE = 'LOCAL_STRICT';
  assert.equal(getSovereigntyMode(), 'local_strict');

  process.env.AI_SOVEREIGNTY_MODE = 'local_first';
});

await t('model selection: prioriza os modelos da GPU RX 580 corretamente', async () => {
  const mockModels = ['qwen2.5:7b-16k', 'qwen3.5:4b-16k', 'qwen2.5:7b', 'qwen3.5:4b'];
  assert.equal(getBestTriagemModel(mockModels), 'qwen3.5:4b-16k');
  assert.equal(getBestPericiaModel(mockModels), 'qwen2.5:7b-16k');

  const mockModelsTagged = ['qwen2.5:7b-16k:latest', 'qwen3.5:4b-16k:latest', 'qwen2.5:7b:latest'];
  assert.equal(getBestTriagemModel(mockModelsTagged), 'qwen3.5:4b-16k:latest');
  assert.equal(getBestPericiaModel(mockModelsTagged), 'qwen2.5:7b-16k:latest');
});

await t('extrairJsonOllama: extrai JSON puro, em blocos markdown ou com preambulo conversacional', async () => {
  const jsonPuro = '{"ncm":"84713012","confianca":"ALTA"}';
  assert.equal(extrairJsonOllama(jsonPuro).ncm, '84713012');

  const jsonMarkdown = '```json\n{"ncm":"84713012","confianca":"ALTA"}\n```';
  assert.equal(extrairJsonOllama(jsonMarkdown).ncm, '84713012');

  const jsonConversacional = 'Aqui está a classificação do item em formato JSON:\n{"ncm":"84713012","confianca":"ALTA"}\nEspero ter ajudado na auditoria!';
  assert.equal(extrairJsonOllama(jsonConversacional).ncm, '84713012');
});

