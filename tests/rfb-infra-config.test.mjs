// ==============================================================================
// Teste Estrutural: Arquitetura de Containers Sidecars e Governança RFB (Sub-etapa 19.2)
// Validação de rfb-manifest.json, Dockerfiles, docker-compose.yml e isolamento de rede
// ==============================================================================

import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(process.cwd());

export default async function testRfbInfraConfig() {
  console.log('[TEST] Iniciando validação de infraestrutura e governança RFB...');

  // ----------------------------------------------------------------------------
  // 1. Validação do Manifesto de Governança (services/rfb-manifest.json)
  // ----------------------------------------------------------------------------
  const manifestPath = resolve(ROOT, 'services/rfb-manifest.json');
  assert.ok(existsSync(manifestPath), 'services/rfb-manifest.json deve existir');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  assert.strictEqual(manifest.versaoManifesto, '1.0.0', 'versaoManifesto deve ser 1.0.0');
  assert.ok(manifest.repositorios, 'Manifesto deve conter chave repositorios');

  const regular = manifest.repositorios['calculadora-rtc-regime-regular'];
  assert.ok(regular, 'Repositório regime-regular deve estar registrado');
  assert.strictEqual(regular.commitCurto, 'f1eebd7', 'Commit curto regime regular deve ser f1eebd7');
  assert.strictEqual(regular.portaInterna, 8080, 'Porta interna regime regular deve ser 8080');
  assert.strictEqual(regular.portaManagement, 9101, 'Porta management regime regular deve ser 9101');
  assert.strictEqual(regular.contextPath, '/api', 'Context path regime regular deve ser /api');
  assert.strictEqual(regular.healthEndpoint, '/api/calculadora/dados-abertos/versao', 'Health endpoint regime regular incorreto');

  const simples = manifest.repositorios['calculadora-rtc-simples-nacional'];
  assert.ok(simples, 'Repositório simples-nacional deve estar registrado');
  assert.strictEqual(simples.commitCurto, 'a926d5a', 'Commit curto simples nacional deve ser a926d5a');
  assert.strictEqual(simples.portaInterna, 8082, 'Porta interna simples nacional deve ser 8082');
  assert.strictEqual(simples.portaManagement, 9103, 'Porta management simples nacional deve ser 9103');
  assert.strictEqual(simples.healthEndpoint, '/api/versao', 'Health endpoint simples nacional deve ser /api/versao');

  const danfse = manifest.repositorios['calculadora-rtc-gerador-danfse'];
  assert.ok(danfse, 'Repositório gerador-danfse deve estar registrado');
  assert.strictEqual(danfse.commitCurto, '8d79e6b', 'Commit curto danfse deve ser 8d79e6b');
  assert.strictEqual(danfse.tag, '1.0.0', 'Tag do danfse deve ser 1.0.0');
  assert.strictEqual(danfse.portaInterna, 8084, 'Porta interna danfse deve ser 8084');
  assert.strictEqual(danfse.healthEndpoint, '/health/live', 'Health endpoint danfse deve ser /health/live');

  assert.strictEqual(manifest.database.nomeArquivoOficial, 'rtc-oficial.db', 'Nome do arquivo de banco oficial');
  assert.strictEqual(manifest.database.modoAcesso, 'ro', 'Modo de acesso do banco SQLite deve ser ro');
  assert.ok(manifest.database.heapPadrao.includes('-Xmx768m'), 'Heap padrão deve conter -Xmx768m');

  console.log('  ✓ Manifesto de governança RFB íntegro e validado com sucesso');

  // ----------------------------------------------------------------------------
  // 2. Validação dos Dockerfiles e Scripts de Inicialização
  // ----------------------------------------------------------------------------
  const dbBuilderDocker = resolve(ROOT, 'services/rtc-db-builder/Dockerfile');
  const dbBuilderScript = resolve(ROOT, 'services/rtc-db-builder/build-sqlite.sh');
  assert.ok(existsSync(dbBuilderDocker), 'services/rtc-db-builder/Dockerfile deve existir');
  assert.ok(existsSync(dbBuilderScript), 'services/rtc-db-builder/build-sqlite.sh deve existir');

  const dbBuilderScriptContent = readFileSync(dbBuilderScript, 'utf8');
  assert.ok(dbBuilderScriptContent.includes('rtc-oficial.db'), 'build-sqlite.sh deve referenciar rtc-oficial.db');
  assert.ok(dbBuilderScriptContent.includes('sha256sum'), 'build-sqlite.sh deve calcular sha256');
  assert.ok(dbBuilderScriptContent.includes('meta-rtc.json'), 'build-sqlite.sh deve gerar meta-rtc.json');
  assert.ok(dbBuilderScriptContent.includes('chmod 644'), 'build-sqlite.sh deve aplicar permissão 644');

  const regularDocker = resolve(ROOT, 'services/rtc-regime-regular/Dockerfile');
  assert.ok(existsSync(regularDocker), 'services/rtc-regime-regular/Dockerfile deve existir');
  const regularDockerContent = readFileSync(regularDocker, 'utf8');
  assert.ok(regularDockerContent.includes('eclipse-temurin:25-jdk'), 'Deve utilizar imagem JDK 25 no builder');
  assert.ok(regularDockerContent.includes('eclipse-temurin:25-jre'), 'Deve utilizar imagem JRE 25 no runner');
  assert.ok(regularDockerContent.includes('adduser'), 'Deve criar usuário não-root');
  assert.ok(regularDockerContent.includes('-Xmx768m'), 'Deve limitar heap a 768m no Dockerfile');
  assert.ok(regularDockerContent.includes('mode=ro'), 'Datasource SQLite deve usar mode=ro');
  assert.ok(regularDockerContent.includes('/api/calculadora/dados-abertos/versao'), 'Healthcheck deve chamar endpoint de versao');

  const simplesDocker = resolve(ROOT, 'services/rtc-simples/Dockerfile');
  assert.ok(existsSync(simplesDocker), 'services/rtc-simples/Dockerfile deve existir');
  const simplesDockerContent = readFileSync(simplesDocker, 'utf8');
  assert.ok(simplesDockerContent.includes('eclipse-temurin:25-jdk'), 'Deve utilizar imagem JDK 25 no builder');
  assert.ok(simplesDockerContent.includes('eclipse-temurin:25-jre'), 'Deve utilizar imagem JRE 25 no runner');
  assert.ok(simplesDockerContent.includes('-Xmx768m'), 'Deve limitar heap a 768m no Dockerfile');
  assert.ok(simplesDockerContent.includes('/api/versao'), 'Healthcheck deve chamar endpoint /versao do Simples');

  const danfseDocker = resolve(ROOT, 'services/rtc-danfse/Dockerfile');
  assert.ok(existsSync(danfseDocker), 'services/rtc-danfse/Dockerfile deve existir');
  const danfseDockerContent = readFileSync(danfseDocker, 'utf8');
  assert.ok(danfseDockerContent.includes('SERVER_PORT=8084'), 'Porta interna do DANFSe deve ser configurada para 8084');
  assert.ok(danfseDockerContent.includes('/health/live'), 'Healthcheck deve chamar /health/live');

  console.log('  ✓ Dockerfiles dos 4 serviços oficiais auditados e validados');

  // ----------------------------------------------------------------------------
  // 3. Validação do docker-compose.yml e Isolamento de Rede
  // ----------------------------------------------------------------------------
  const composePath = resolve(ROOT, 'docker-compose.yml');
  assert.ok(existsSync(composePath), 'docker-compose.yml deve existir');
  const composeContent = readFileSync(composePath, 'utf8');

  // Validação da rede interna fiscal_net
  assert.ok(composeContent.includes('fiscal_net:'), 'docker-compose.yml deve declarar rede fiscal_net');

  // Validação de volumes persistentes
  assert.ok(composeContent.includes('postgres_data:'), 'Deve declarar volume postgres_data');
  assert.ok(composeContent.includes('rtc_sqlite_data:'), 'Deve declarar volume rtc_sqlite_data');

  // Validação dos serviços registrados
  assert.ok(composeContent.includes('mcm-web:'), 'Deve conter serviço mcm-web');
  assert.ok(composeContent.includes('postgres:'), 'Deve conter serviço postgres (postgres:17-alpine)');
  assert.ok(composeContent.includes('rtc-db-builder:'), 'Deve conter serviço rtc-db-builder');
  assert.ok(composeContent.includes('rtc-regime-regular:'), 'Deve conter serviço rtc-regime-regular');
  assert.ok(composeContent.includes('rtc-simples:'), 'Deve conter serviço rtc-simples');
  assert.ok(composeContent.includes('rtc-danfse:'), 'Deve conter serviço rtc-danfse');

  // Validação de teto de heap e montagem :ro
  assert.ok(composeContent.includes('-Xmx768m'), 'Serviços Java devem ter JAVA_TOOL_OPTIONS com -Xmx768m no compose');
  assert.ok(composeContent.includes('/app/calculadora/db:ro'), 'Volume rtc_sqlite_data deve ser montado como somente-leitura (:ro)');

  // REGRA DE SEGURANÇA CRÍTICA: Nenhuma porta dos sidecars pode ser mapeada no host via ports:
  // Regex simples para capturar blocos de portas mapeadas no host (ex: "8080:8080", "5432:5432")
  const prohibitedHostPorts = ['8080:', '8082:', '8084:', '5432:', '9101:', '9103:'];
  for (const portPrefix of prohibitedHostPorts) {
    const hasHostPort = composeContent.split('\n').some(line => {
      const trimmed = line.trim();
      return (trimmed.startsWith('-') || trimmed.startsWith('"')) && trimmed.includes(portPrefix);
    });
    assert.strictEqual(
      hasHostPort,
      false,
      `VIOLAÇÃO DE SEGURANÇA: Porta interna ${portPrefix} não deve ser mapeada para o host em ports:`
    );
  }

  // Apenas a aplicação web mapeia 3000:3000
  assert.ok(composeContent.includes('"3000:3000"'), 'Apenas mcm-web deve expor a porta 3000 para o host');

  console.log('  ✓ docker-compose.yml auditado: isolamento estrito de portas e rede fiscal_net garantido');

  // ----------------------------------------------------------------------------
  // 4. Validação de .env.example e Scripts Auxiliares
  // ----------------------------------------------------------------------------
  const envExample = resolve(ROOT, '.env.example');
  assert.ok(existsSync(envExample), '.env.example deve existir');
  const envExampleContent = readFileSync(envExample, 'utf8');

  assert.ok(envExampleContent.includes('DATABASE_URL='), '.env.example deve documentar DATABASE_URL');
  assert.ok(envExampleContent.includes('POSTGRES_USER='), '.env.example deve documentar POSTGRES_USER');
  assert.ok(envExampleContent.includes('POSTGRES_PASSWORD='), '.env.example deve documentar POSTGRES_PASSWORD');
  assert.ok(envExampleContent.includes('RTC_REGIME_REGULAR_URL='), '.env.example deve documentar RTC_REGIME_REGULAR_URL');
  assert.ok(envExampleContent.includes('RTC_SIMPLES_URL='), '.env.example deve documentar RTC_SIMPLES_URL');
  assert.ok(envExampleContent.includes('RTC_DANFSE_URL='), '.env.example deve documentar RTC_DANFSE_URL');
  assert.ok(envExampleContent.includes('RTC_MODE=hybrid_fallback'), '.env.example deve documentar RTC_MODE');

  const gitignore = resolve(ROOT, '.gitignore');
  assert.ok(existsSync(gitignore), '.gitignore deve existir');
  const gitignoreContent = readFileSync(gitignore, 'utf8');
  assert.ok(gitignoreContent.includes('services/*/.upstream'), '.gitignore deve ignorar services/*/.upstream');

  const syncScript = resolve(ROOT, 'scripts/sync-rfb-sources.ps1');
  assert.ok(existsSync(syncScript), 'scripts/sync-rfb-sources.ps1 deve existir');

  console.log('  ✓ .env.example, .gitignore e scripts de sincronização em total conformidade');
  console.log('[TEST] Suíte rfb-infra-config concluída com 100% de sucesso! ✓\n');
}
