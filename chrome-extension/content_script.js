/**
 * content_script.js — ERP Estudos: Caderno de Erros
 *
 * Seletores confirmados por inspeção real do DOM do TecConcursos (Mai/2026):
 *   - Alternativa errada:  li.ng-scope.erro
 *   - Alternativa certa:   li.ng-scope.acerto
 *   - Gabarito correto:    li.ng-scope.correcao
 *   - Botao responder:     button.botao-resolver
 */

'use strict';

// ─── Credenciais Supabase ─────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://orruikgtwqlctqtavlhw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vfZEtxZrzGOqfDjbdAemRQ_x7CPnpg_';
const ENDPOINT_CADERNO  = `${SUPABASE_URL}/rest/v1/caderno_erros`;
const ENDPOINT_LIVE     = `${SUPABASE_URL}/rest/v1/live_tracking`;

// ─── Credenciais Padrao ───────────────────────────────────────────────────────

const JWT_PADRAO     = 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImIxMjM4NTQwLTJiZTYtNDVmZS1hYzI2LTI0ZTZkNWYzZTM4ZCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL29ycnVpa2d0d3FsY3RxdGF2bGh3LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI0YjY3MmYwMi00ZGE0LTRhNDktOWJjYi0xYjc5NDQ2ZGNmNDMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc4MTI2Nzg3LCJpYXQiOjE3NzgxMjMxODcsImVtYWlsIjoidGlqdWNhb21hdUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoidGlqdWNhb21hdUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiI0YjY3MmYwMi00ZGE0LTRhNDktOWJjYi0xYjc5NDQ2ZGNmNDMifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc3ODEyMzE4N31dLCJzZXNzaW9uX2lkIjoiMDI1MGU5N2MtMDUzZS00ZmIwLTllZTktYjkzNTUyMThlZjUwIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.v-_yKywOmG7Lhe_owD5vA6pHQD8-XWlLzuHQxdzKf_1HDLF9d6-EJuGHEPbT8koYTxU2iQvfwt_VafpABFfbRA';
const USER_ID_PADRAO = '4b672f02-4da4-4a49-9bcb-1b79446dcf43';
const TASK_ID_PADRAO = 'c3260617-e625-49bb-8988-e4ea6889f56a';

// ─── Chaves do chrome.storage ─────────────────────────────────────────────────

const KEY_JWT     = 'erp_jwt_token';
const KEY_TASK_ID = 'erp_task_id';

// ─── Contadores da sessao atual (mantidos em memoria) ─────────────────────────
// Resetam quando a pagina e recarregada
let sessaoQuestoes = 0;
let sessaoAcertos  = 0;

// ─── UPSERT live_tracking (chamado apos cada resposta) ───────────────────────

async function upsertLiveTracking(questoesTotal, acertosTotal) {
  const config = await chrome.storage.local.get([KEY_JWT, KEY_TASK_ID]);
  const jwt    = config[KEY_JWT]     || JWT_PADRAO;
  const taskId = config[KEY_TASK_ID] || TASK_ID_PADRAO;
  const { expirado } = verificarJWT(jwt);
  if (expirado) return;

  // Persistir contadores no storage para o popup os exibir ao vivo
  const erros = sessaoQuestoes - sessaoAcertos;
  chrome.storage.local.set({ erp_sessao_questoes: questoesTotal, erp_sessao_acertos: acertosTotal, erp_sessao_erros: erros });

  try {
    const resp = await fetch(ENDPOINT_LIVE, {
      method: 'POST',
      headers: {
        // Accept explícito — necessário para Brave Shields não bloquear como tracker
        'Accept':        'application/json',
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${jwt}`,
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        tarefa_id:      taskId,
        user_id:        USER_ID_PADRAO,
        questoes_total: questoesTotal,
        acertos_total:  acertosTotal,
        updated_at:     new Date().toISOString(),
      }),
    });

    if (resp.ok || resp.status === 201) {
      console.log(`[ERP Estudos] live_tracking actualizado: ${questoesTotal}Q / ${acertosTotal}A`);
    } else {
      // Logar resposta HTTP para facilitar debug de RLS ou schema issues
      const body = await resp.text().catch(() => '(sem corpo)');
      console.error(`[ERP Estudos] live_tracking HTTP ${resp.status}:`, body);
    }
  } catch (erroRede) {
    // Distinguir bloqueio de rede (Brave Shields / Edge Tracking Prevention) de erros normais
    if (erroRede instanceof TypeError && erroRede.message.includes('fetch')) {
      console.error(
        '[ERP Estudos] [BRAVE/EDGE] Fetch bloqueado pelo browser shield.\n' +
        'Solucao: Desative o Brave Shields / Edge Tracking Prevention para tecconcursos.com.br\n' +
        'OU adicione a extensao como excecao nas definicoes do browser.',
        erroRede
      );
    } else {
      console.error('[ERP Estudos] Erro de rede ao actualizar live_tracking:', erroRede);
    }
  }
}

// ─── Seletores DOM confirmados do TecConcursos (inspecao Mai/2026) ────────────
//
// Estrutura confirmada:
//   article.questao-enunciado
//   ├── div.questao-enunciado-texto   ← ENUNCIADO DA QUESTAO
//   └── ul.questao-enunciado-alternativas
//       └── li.ng-scope               ← ALTERNATIVAS
//           ├── li.ng-scope.erro      ← RESPOSTA ERRADA do utilizador
//           ├── li.ng-scope.acerto    ← RESPOSTA CERTA do utilizador
//           └── li.ng-scope.correcao  ← ALTERNATIVA CORRETA revelada

// Texto do enunciado da questao (seletor primario — confirmado)
const SEL_ENUNCIADO_PRINCIPAL = '.questao-enunciado-texto';
// Container completo da questao (fallback)
const SEL_QUESTAO_CONTAINER   = 'article.questao-enunciado';
// Alternativa marcada como errada
const SEL_ALTERNATIVA_ERRO    = 'li.ng-scope.erro';
// Botao de submissao da resposta
const SEL_BOTAO_RESOLVER      = 'button.botao-resolver';


// ─── Estado interno ───────────────────────────────────────────────────────────

let ultimaQuestaoEnviada = null;
let observerAtivo        = false;

// ─── Utilitarios ──────────────────────────────────────────────────────────────

function extrairTexto(el) {
  if (!el) return '';
  return (el.innerText || el.textContent || '').trim();
}

function mostrarToast(mensagem, tipo = 'info') {
  const anterior = document.getElementById('erp-toast-ext');
  if (anterior) anterior.remove();

  const estilos = {
    sucesso: { fundo: '#064e3b', cor: '#6ee7b7', icone: '✓' },
    erro:    { fundo: '#7f1d1d', cor: '#fca5a5', icone: '✕' },
    info:    { fundo: '#1e1b4b', cor: '#a5b4fc', icone: '📝' },
    aviso:   { fundo: '#78350f', cor: '#fcd34d', icone: '⚠' },
  };
  const s = estilos[tipo] ?? estilos.info;

  const toast = document.createElement('div');
  toast.id = 'erp-toast-ext';
  toast.style.cssText = `
    position: fixed; bottom: 20px; right: 20px;
    z-index: 2147483647;
    background: ${s.fundo}; color: ${s.cor};
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px; font-weight: 500;
    padding: 12px 18px; border-radius: 10px;
    box-shadow: 0 4px 24px rgba(0,0,0,0.5);
    display: flex; align-items: center; gap: 8px;
    max-width: 320px; line-height: 1.4; pointer-events: none;
    animation: erpSlideIn 0.25s ease;
  `;

  if (!document.getElementById('erp-ext-style')) {
    const style = document.createElement('style');
    style.id = 'erp-ext-style';
    style.textContent = `@keyframes erpSlideIn { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:none; } }`;
    document.head.appendChild(style);
  }

  toast.innerHTML = `<span style="font-size:16px;flex-shrink:0">${s.icone}</span><span><strong>ERP Estudos:</strong> ${mensagem}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast?.remove(), 4500);
}

function verificarJWT(jwt) {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    const agora   = Math.floor(Date.now() / 1000);
    const restam  = payload.exp - agora;
    return { expirado: restam <= 0, segundosRestantes: restam };
  } catch {
    return { expirado: true, segundosRestantes: 0 };
  }
}

// ─── Extrair enunciado da questao ─────────────────────────────────────────────

/**
 * Extrai o texto do enunciado usando os seletores confirmados do TecConcursos.
 *
 * Hierarquia de tentativas:
 *  1. div.questao-enunciado-texto  (seletor exato confirmado)
 *  2. article.questao-enunciado    (container completo — fallback)
 *  3. Busca pelo elemento .erro e sobe o DOM ate encontrar texto
 */
function extrairEnunciado() {
  // Tentativa 1: seletor primario confirmado
  // Pode haver multiplas questoes na pagina — pegar o mais proximo da alternativa .erro
  const alternativaErro = document.querySelector(SEL_ALTERNATIVA_ERRO);

  if (alternativaErro) {
    // Subir ate article.questao-enunciado e depois pegar .questao-enunciado-texto dentro dele
    const articleQuestao = alternativaErro.closest('article.questao-enunciado') ||
                           alternativaErro.closest(SEL_QUESTAO_CONTAINER);

    if (articleQuestao) {
      const enunciadoEl = articleQuestao.querySelector(SEL_ENUNCIADO_PRINCIPAL);
      const texto = extrairTexto(enunciadoEl || articleQuestao);
      if (texto && texto.length > 10) {
        console.log('[ERP Estudos] Enunciado extraido via closest(article):', texto.substring(0, 80));
        return texto.substring(0, 3000);
      }
    }
  }

  // Tentativa 2: pegar o primeiro .questao-enunciado-texto da pagina
  const enunciadoEl = document.querySelector(SEL_ENUNCIADO_PRINCIPAL);
  const texto2 = extrairTexto(enunciadoEl);
  if (texto2 && texto2.length > 10) {
    console.log('[ERP Estudos] Enunciado extraido via selector direto:', texto2.substring(0, 80));
    return texto2.substring(0, 3000);
  }

  // Tentativa 3: container completo (article.questao-enunciado) sem as alternativas
  const containers = document.querySelectorAll(SEL_QUESTAO_CONTAINER);
  for (const container of containers) {
    const clone = container.cloneNode(true);
    // Remover alternativas e botoes para ficar so com o texto
    clone.querySelectorAll('ul.questao-enunciado-alternativas, button, li').forEach(el => el.remove());
    const texto3 = extrairTexto(clone);
    if (texto3 && texto3.length > 10) {
      console.log('[ERP Estudos] Enunciado extraido via container clonado:', texto3.substring(0, 80));
      return texto3.substring(0, 3000);
    }
  }

  console.warn('[ERP Estudos] Nenhum dos 3 metodos conseguiu extrair o enunciado.');
  return '';
}


// ─── Enviar para o Supabase ───────────────────────────────────────────────────

async function capturarQuestaoErrada() {
  // Extrair enunciado
  const enunciado = extrairEnunciado();

  if (!enunciado || enunciado.length < 10) {
    console.warn('[ERP Estudos] Nao foi possivel extrair o enunciado.');
    mostrarToast('Nao consegui extrair o enunciado. Ver console.', 'aviso');
    return;
  }

  // Evitar duplicatas imediatas
  const hash = enunciado.substring(0, 80);
  if (hash === ultimaQuestaoEnviada) {
    console.log('[ERP Estudos] Questao ja capturada, ignorando duplicata.');
    return;
  }
  ultimaQuestaoEnviada = hash;

  // Recuperar config (storage > hardcoded)
  const config = await chrome.storage.local.get([KEY_JWT, KEY_TASK_ID]);
  const jwt    = config[KEY_JWT]     || JWT_PADRAO;
  const taskId = config[KEY_TASK_ID] || TASK_ID_PADRAO;

  // Verificar JWT
  const { expirado, segundosRestantes } = verificarJWT(jwt);
  if (expirado) {
    console.error('[ERP Estudos] JWT expirado! Actualize o token no popup.');
    mostrarToast('JWT expirado! Actualize no popup da extensao.', 'aviso');
    return;
  }

  console.log(`[ERP Estudos] A capturar questao errada... (JWT valido por mais ${Math.floor(segundosRestantes / 60)}m)`);
  console.log('[ERP Estudos] Enunciado:', enunciado.substring(0, 120) + '...');

  // POST para Supabase
  // Nota: fetch a partir de content_script e feito no contexto do tab (nao da extensao).
  // O Brave Shields e o Edge Tracking Prevention podem bloquear se nao houver
  // headers Accept e Content-Type explícitos, que identificam o pedido como API JSON.
  try {
    const resposta = await fetch(ENDPOINT_CADERNO, {
      method: 'POST',
      headers: {
        // Accept explícito — sinal para os shields de que e um pedido de API, nao tracker
        'Accept':        'application/json',
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${jwt}`,
        'Prefer':        'return=minimal',
      },
      body: JSON.stringify({
        tarefa_id:        taskId,
        user_id:          USER_ID_PADRAO,
        conteudo_questao: enunciado,
        comentario_aluno: 'Registado automaticamente via Extensao Chrome',
        fonte_url:        window.location.href,
        data_captura:     new Date().toISOString(),
      }),
    });

    if (resposta.ok || resposta.status === 201) {
      console.log('[ERP Estudos] Questao capturada com sucesso!');
      mostrarToast('Questao guardada no Caderno de Erros!', 'sucesso');
    } else {
      const textoErro = await resposta.text().catch(() => '(sem corpo)');
      console.error(`[ERP Estudos] HTTP ${resposta.status} ao capturar questao:`, textoErro);

      // Diagnosticos especificos por codigo HTTP
      if (resposta.status === 401) {
        console.error('[ERP Estudos] [401] JWT invalido ou expirado. Actualize no popup.');
        mostrarToast('JWT invalido. Actualize no popup.', 'erro');
      } else if (resposta.status === 403) {
        console.error('[ERP Estudos] [403] RLS bloqueou a insercao. Verifique a policy da tabela caderno_erros.');
        mostrarToast('Permissao negada (RLS). Ver console F12.', 'erro');
      } else if (resposta.status === 400) {
        console.error('[ERP Estudos] [400] Dados invalidos. O tarefa_id pode nao existir:', taskId);
        mostrarToast('tarefa_id invalido. Ver console.', 'erro');
      } else if (resposta.status === 0) {
        console.error('[ERP Estudos] [0] Pedido bloqueado antes de chegar ao servidor (CORS pre-flight ou shield).');
        mostrarToast('Bloqueado pelo browser. Ver console.', 'erro');
      } else {
        mostrarToast(`Erro HTTP ${resposta.status}. Ver console F12.`, 'erro');
      }
    }

  } catch (erroRede) {
    // Diferenciar bloqueio por shield de erro de conectividade normal
    if (erroRede instanceof TypeError) {
      console.error(
        '[ERP Estudos] [REDE/SHIELD] Fetch bloqueado ou falha de rede.\n' +
        'Possiveis causas:\n' +
        '  1. Brave Shields / Edge Tracking Prevention esta activo para tecconcursos.com.br\n' +
        '  2. Sem ligacao a internet\n' +
        '  3. CORS nao configurado no Supabase para esta origem\n' +
        'Solucao Brave: clique no icone do escudo na barra de endereco → desactive para este site.\n' +
        'Solucao Edge:  Definicoes → Privacidade → Prevencao de rastreio → Excecoes.',
        erroRede.message
      );
      mostrarToast('Bloqueado pelo shield do browser. Ver console F12.', 'aviso');
    } else {
      console.error('[ERP Estudos] Erro inesperado ao capturar questao:', erroRede);
      mostrarToast('Erro inesperado. Ver console F12.', 'erro');
    }
  }
}

// ─── Detetar clique no botao "Resolver Questao" ───────────────────────────────

/**
 * Estrategia: escutar o clique no botao.botao-resolver,
 * depois aguardar 800ms para o DOM atualizar com as classes .erro / .acerto,
 * e entao verificar se apareceu li.ng-scope.erro.
 */
function bindBotaoResolver() {
  document.addEventListener('click', (evento) => {
    const botao = evento.target?.closest?.(SEL_BOTAO_RESOLVER);
    if (!botao) return;

    console.log('[ERP Estudos] Botao "Resolver Questao" clicado. A aguardar feedback...');
    ultimaQuestaoEnviada = null;

    setTimeout(() => {
      const alternativaErro   = document.querySelector(SEL_ALTERNATIVA_ERRO);
      const alternativaAcerto = document.querySelector('li.ng-scope.acerto');

      if (alternativaErro) {
        // ERROU — incrementar questoes, NAO incrementar acertos
        sessaoQuestoes += 1;
        console.log(`[ERP Estudos] ERROU. Contadores: ${sessaoQuestoes}Q / ${sessaoAcertos}A`);
        upsertLiveTracking(sessaoQuestoes, sessaoAcertos);
        capturarQuestaoErrada();

      } else if (alternativaAcerto) {
        // ACERTOU — incrementar ambos
        sessaoQuestoes += 1;
        sessaoAcertos  += 1;
        console.log(`[ERP Estudos] ACERTOU. Contadores: ${sessaoQuestoes}Q / ${sessaoAcertos}A`);
        upsertLiveTracking(sessaoQuestoes, sessaoAcertos);

      } else {
        // Segunda tentativa
        setTimeout(() => {
          if (document.querySelector(SEL_ALTERNATIVA_ERRO)) {
            sessaoQuestoes += 1;
            upsertLiveTracking(sessaoQuestoes, sessaoAcertos);
            capturarQuestaoErrada();
          } else if (document.querySelector('li.ng-scope.acerto')) {
            sessaoQuestoes += 1;
            sessaoAcertos  += 1;
            upsertLiveTracking(sessaoQuestoes, sessaoAcertos);
          }
        }, 1500);
      }
    }, 800);

  }, true);
}

// ─── MutationObserver (backup) ────────────────────────────────────────────────

/**
 * Observer de backup: deteta quando a classe .erro ou .correcao
 * e adicionada a um li.ng-scope por mutacao de atributo.
 */
function iniciarObserver() {
  if (observerAtivo) return;
  observerAtivo = true;

  const observer = new MutationObserver((mutacoes) => {
    for (const mutacao of mutacoes) {
      // Verificar mudancas de classe em elementos li.ng-scope
      if (
        mutacao.type === 'attributes' &&
        mutacao.attributeName === 'class' &&
        mutacao.target.matches?.('li.ng-scope')
      ) {
        const el = mutacao.target;
        if (el.classList.contains('erro')) {
          console.log('[ERP Estudos] Classe .erro detectada via MutationObserver!');
          capturarQuestaoErrada();
          return;
        }
      }

      // Verificar nos adicionados com classe erro
      for (const no of mutacao.addedNodes) {
        if (no.nodeType !== Node.ELEMENT_NODE) continue;
        const el = no;
        if (el.matches?.('li.ng-scope.erro') || el.querySelector?.('li.ng-scope.erro')) {
          console.log('[ERP Estudos] Elemento .erro adicionado ao DOM via MutationObserver!');
          capturarQuestaoErrada();
          return;
        }
      }
    }
  });

  observer.observe(document.body, {
    childList:       true,
    subtree:         true,
    attributes:      true,
    attributeFilter: ['class'],
  });

  console.log('[ERP Estudos] Observer activo. A monitorar respostas no TecConcursos...');
}

// ─── Inicializacao ────────────────────────────────────────────────────────────

(async () => {
  const config = await chrome.storage.local.get([KEY_JWT, KEY_TASK_ID]);
  const jwt    = config[KEY_JWT] || JWT_PADRAO;
  const { expirado, segundosRestantes } = verificarJWT(jwt);

  if (expirado) {
    console.warn('[ERP Estudos] JWT expirado. Actualize no popup da extensao.');
  } else {
    console.log(`[ERP Estudos] Pronto. JWT valido por mais ${Math.floor(segundosRestantes / 60)}m ${segundosRestantes % 60}s.`);
  }

  const taskId = config[KEY_TASK_ID] || TASK_ID_PADRAO;
  console.log(`[ERP Estudos] Tarefa activa: ${taskId}`);

  bindBotaoResolver();
  iniciarObserver();
})();
