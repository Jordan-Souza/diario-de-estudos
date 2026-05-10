/**
 * content_script.js — ERP Estudos: Caderno de Erros v2.2
 *
 * Seletores confirmados do TecConcursos (Mai/2026):
 *   Alternativa errada:  li.ng-scope.erro
 *   Alternativa certa:   li.ng-scope.acerto
 *   Botao responder:     button.botao-resolver  (lista) | button[ng-click*="responder"] (caderno)
 */

'use strict';

// ─── Credenciais Supabase ─────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://orruikgtwqlctqtavlhw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_vfZEtxZrzGOqfDjbdAemRQ_x7CPnpg_';
const ENDPOINT_CADERNO  = `${SUPABASE_URL}/rest/v1/caderno_erros`;
const ENDPOINT_LIVE     = `${SUPABASE_URL}/rest/v1/live_tracking`;

// ─── Credenciais / task padrão (fallback) ─────────────────────────────────────

const JWT_PADRAO     = 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImIxMjM4NTQwLTJiZTYtNDVmZS1hYzI2LTI0ZTZkNWYzZTM4ZCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL29ycnVpa2d0d3FsY3RxdGF2bGh3LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI0YjY3MmYwMi00ZGE0LTRhNDktOWJjYi0xYjc5NDQ2ZGNmNDMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc4MTI2Nzg3LCJpYXQiOjE3NzgxMjMxODcsImVtYWlsIjoidGlqdWNhb21hdUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoidGlqdWNhb21hdUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiI0YjY3MmYwMi00ZGE0LTRhNDktOWJjYi0xYjc5NDQ2ZGNmNDMifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc3ODEyMzE4N31dLCJzZXNzaW9uX2lkIjoiMDI1MGU5N2MtMDUzZS00ZmIwLTllZTktYjkzNTUyMThlZjUwIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.v-_yKywOmG7Lhe_owD5vA6pHQD8-XWlLzuHQxdzKf_1HDLF9d6-EJuGHEPbT8koYTxU2iQvfwt_VafpABFfbRA';
const USER_ID_PADRAO = '4b672f02-4da4-4a49-9bcb-1b79446dcf43';
const TASK_ID_PADRAO = 'c3260617-e625-49bb-8988-e4ea6889f56a';

// ─── Chaves do chrome.storage ─────────────────────────────────────────────────

const KEY_JWT      = 'erp_jwt_token';
const KEY_TASK_ID  = 'erp_task_id';
const KEY_TASK_NAME = 'erp_task_name';
const KEY_Q        = 'erp_sessao_questoes';
const KEY_A        = 'erp_sessao_acertos';
const KEY_E        = 'erp_sessao_erros';

// ─── Seletores DOM TecConcursos (confirmados Mai/2026) ───────────────────────

const SEL_ENUNCIADO_PRINCIPAL = '.questao-enunciado-texto';
const SEL_QUESTAO_CONTAINER   = 'article.questao-enunciado';
const SEL_ALTERNATIVA_ERRO    = 'li.ng-scope.erro';

// Seletores do botão "Responder" — múltiplas variantes (lista vs caderno vs questão única)
const SELETORES_BOTAO_RESOLVER = [
  'button.botao-resolver',
  'button[ng-click*="responder"]',
  'button[ng-click*="resolver"]',
  'button[class*="resolver"]',
  'button[class*="responder"]',
  '.btn-resolver',
  '.botao-responder',
];

// ─── Estado interno ───────────────────────────────────────────────────────────

let sessaoQuestoes     = 0;
let sessaoAcertos      = 0;
let ultimaQuestaoEnviada = null;
let observerAtivo        = false;

// ─── Utilitários ─────────────────────────────────────────────────────────────

function extrairTexto(el) {
  if (!el) return '';
  return (el.innerText || el.textContent || '').trim();
}

function verificarJWT(jwt) {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1]));
    const restam  = payload.exp - Math.floor(Date.now() / 1000);
    return { expirado: restam <= 0, segundosRestantes: restam };
  } catch {
    return { expirado: true, segundosRestantes: 0 };
  }
}

function encontrarBotaoResolver(alvo) {
  // Verifica se o elemento clicado (ou algum pai) é o botão de resolver
  for (const sel of SELETORES_BOTAO_RESOLVER) {
    const encontrado = alvo?.closest?.(sel);
    if (encontrado) return encontrado;
  }
  // Fallback: verificar por texto do botão
  const el = alvo?.closest?.('button');
  if (el) {
    const texto = extrairTexto(el).toLowerCase();
    if (texto.includes('responder') || texto.includes('resolver') || texto.includes('confirmar')) {
      return el;
    }
  }
  return null;
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

  if (!document.getElementById('erp-ext-style')) {
    const style = document.createElement('style');
    style.id = 'erp-ext-style';
    style.textContent = `@keyframes erpSlideIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}`;
    document.head.appendChild(style);
  }

  const toast = document.createElement('div');
  toast.id = 'erp-toast-ext';
  toast.style.cssText = `
    position:fixed;bottom:20px;right:20px;z-index:2147483647;
    background:${s.fundo};color:${s.cor};
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
    font-size:13px;font-weight:500;padding:12px 18px;border-radius:10px;
    box-shadow:0 4px 24px rgba(0,0,0,.5);display:flex;align-items:center;
    gap:8px;max-width:340px;line-height:1.4;pointer-events:none;
    animation:erpSlideIn .25s ease;
  `;
  toast.innerHTML = `<span style="font-size:16px;flex-shrink:0">${s.icone}</span><span><strong>ERP Estudos:</strong> ${mensagem}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => toast?.remove(), 4500);
}

// ─── Persistir contadores no storage (popup lê via onChanged) ────────────────

function persistirContadores() {
  const erros = sessaoQuestoes - sessaoAcertos;
  chrome.storage.local.set({
    [KEY_Q]: sessaoQuestoes,
    [KEY_A]: sessaoAcertos,
    [KEY_E]: erros,
  });
}

// ─── UPSERT live_tracking ─────────────────────────────────────────────────────

async function upsertLiveTracking() {
  const config = await chrome.storage.local.get([KEY_JWT, KEY_TASK_ID]);
  const jwt    = config[KEY_JWT]     || JWT_PADRAO;
  const taskId = config[KEY_TASK_ID] || TASK_ID_PADRAO;
  const { expirado } = verificarJWT(jwt);
  if (expirado) {
    console.warn('[ERP Estudos] JWT expirado — live_tracking não actualizado.');
    return;
  }

  try {
    const resp = await fetch(ENDPOINT_LIVE, {
      method: 'POST',
      headers: {
        'Accept':        'application/json',
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${jwt}`,
        'Prefer':        'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({
        tarefa_id:      taskId,
        user_id:        USER_ID_PADRAO,
        questoes_total: sessaoQuestoes,
        acertos_total:  sessaoAcertos,
        updated_at:     new Date().toISOString(),
      }),
    });

    if (resp.ok || resp.status === 201) {
      console.log(`[ERP Estudos] live_tracking: ${sessaoQuestoes}Q / ${sessaoAcertos}A ✓`);
    } else {
      const body = await resp.text().catch(() => '');
      console.error(`[ERP Estudos] live_tracking HTTP ${resp.status}:`, body);
    }
  } catch (e) {
    if (e instanceof TypeError) {
      console.error('[ERP Estudos] [SHIELD] Fetch bloqueado. Desactive Brave Shields para tecconcursos.com.br', e.message);
    } else {
      console.error('[ERP Estudos] live_tracking erro:', e);
    }
  }
}

// ─── Extrair enunciado ────────────────────────────────────────────────────────

function extrairEnunciado() {
  const alternativaErro = document.querySelector(SEL_ALTERNATIVA_ERRO);

  if (alternativaErro) {
    const article = alternativaErro.closest('article.questao-enunciado') ||
                    alternativaErro.closest(SEL_QUESTAO_CONTAINER);
    if (article) {
      const enunciadoEl = article.querySelector(SEL_ENUNCIADO_PRINCIPAL);
      const texto = extrairTexto(enunciadoEl || article);
      if (texto && texto.length > 10) return texto.substring(0, 3000);
    }
  }

  const direto = document.querySelector(SEL_ENUNCIADO_PRINCIPAL);
  const t2 = extrairTexto(direto);
  if (t2 && t2.length > 10) return t2.substring(0, 3000);

  for (const container of document.querySelectorAll(SEL_QUESTAO_CONTAINER)) {
    const clone = container.cloneNode(true);
    clone.querySelectorAll('ul.questao-enunciado-alternativas,button,li').forEach(el => el.remove());
    const t3 = extrairTexto(clone);
    if (t3 && t3.length > 10) return t3.substring(0, 3000);
  }

  console.warn('[ERP Estudos] Nao foi possivel extrair o enunciado.');
  return '';
}

// ─── Capturar questão errada → Supabase ──────────────────────────────────────

async function capturarQuestaoErrada() {
  const enunciado = extrairEnunciado();

  if (!enunciado || enunciado.length < 10) {
    mostrarToast('Nao consegui extrair o enunciado. Ver console F12.', 'aviso');
    return;
  }

  const hash = enunciado.substring(0, 80);
  if (hash === ultimaQuestaoEnviada) {
    console.log('[ERP Estudos] Duplicata ignorada.');
    return;
  }
  ultimaQuestaoEnviada = hash;

  const config = await chrome.storage.local.get([KEY_JWT, KEY_TASK_ID]);
  const jwt    = config[KEY_JWT]     || JWT_PADRAO;
  const taskId = config[KEY_TASK_ID] || TASK_ID_PADRAO;

  const { expirado, segundosRestantes } = verificarJWT(jwt);
  if (expirado) {
    mostrarToast('JWT expirado! Actualize no popup da extensao.', 'aviso');
    return;
  }

  console.log(`[ERP Estudos] A capturar questao errada... JWT valido ${Math.floor(segundosRestantes/60)}m`);

  try {
    const resposta = await fetch(ENDPOINT_CADERNO, {
      method: 'POST',
      headers: {
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
      console.log('[ERP Estudos] ✓ Questao capturada!');
      mostrarToast('Questao guardada no Caderno de Erros!', 'sucesso');
    } else {
      const textoErro = await resposta.text().catch(() => '');
      console.error(`[ERP Estudos] HTTP ${resposta.status}:`, textoErro);
      if (resposta.status === 401) mostrarToast('JWT invalido. Actualize no popup.', 'erro');
      else if (resposta.status === 403) mostrarToast('Permissao negada (RLS). Ver console.', 'erro');
      else if (resposta.status === 400) mostrarToast(`tarefa_id invalido: ${taskId.substring(0,8)}...`, 'erro');
      else mostrarToast(`Erro HTTP ${resposta.status}. Ver console F12.`, 'erro');
    }
  } catch (e) {
    if (e instanceof TypeError) {
      console.error('[ERP Estudos] [SHIELD] Fetch bloqueado.', e.message);
      mostrarToast('Bloqueado pelo browser shield. Ver console.', 'aviso');
    } else {
      console.error('[ERP Estudos] Erro inesperado:', e);
      mostrarToast('Erro inesperado. Ver console F12.', 'erro');
    }
  }
}

// ─── Processar resultado de uma questão ──────────────────────────────────────

function processarResultado(origem) {
  const erro   = document.querySelector(SEL_ALTERNATIVA_ERRO);
  const acerto = document.querySelector('li.ng-scope.acerto');

  console.log(`[ERP Estudos] processarResultado (${origem}): erro=${!!erro} acerto=${!!acerto}`);

  if (erro) {
    sessaoQuestoes += 1;
    persistirContadores();
    upsertLiveTracking();
    capturarQuestaoErrada();
  } else if (acerto) {
    sessaoQuestoes += 1;
    sessaoAcertos  += 1;
    persistirContadores();
    upsertLiveTracking();
    mostrarToast('Acertou! Contador actualizado.', 'sucesso');
  }
}

// ─── Listener: clique no botão resolver ──────────────────────────────────────

function bindBotaoResolver() {
  document.addEventListener('click', (evento) => {
    const botao = encontrarBotaoResolver(evento.target);
    if (!botao) return;

    console.log('[ERP Estudos] Botao resolver clicado:', botao.className || botao.textContent?.substring(0,30));
    ultimaQuestaoEnviada = null;

    // Aguardar DOM actualizar com resultado
    setTimeout(() => {
      if (document.querySelector(SEL_ALTERNATIVA_ERRO) || document.querySelector('li.ng-scope.acerto')) {
        processarResultado('click-800ms');
      } else {
        // Segunda tentativa
        setTimeout(() => processarResultado('click-2300ms'), 1500);
      }
    }, 800);

  }, true);
}

// ─── MutationObserver (backup para SPA com navegação) ────────────────────────

function iniciarObserver() {
  if (observerAtivo) return;
  observerAtivo = true;

  const observer = new MutationObserver((mutacoes) => {
    for (const mutacao of mutacoes) {
      if (
        mutacao.type === 'attributes' &&
        mutacao.attributeName === 'class' &&
        mutacao.target.matches?.('li.ng-scope')
      ) {
        const el = mutacao.target;
        if (el.classList.contains('erro')) {
          console.log('[ERP Estudos] Classe .erro detectada via Observer!');
          capturarQuestaoErrada();
          sessaoQuestoes += 1;
          persistirContadores();
          upsertLiveTracking();
          return;
        }
        if (el.classList.contains('acerto')) {
          sessaoQuestoes += 1;
          sessaoAcertos  += 1;
          persistirContadores();
          upsertLiveTracking();
          mostrarToast('Acertou! Contador actualizado.', 'sucesso');
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

  console.log('[ERP Estudos] MutationObserver activo.');
}

// ─── Escutar mensagens do popup (ex: reset) ───────────────────────────────────

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'ERP_RESET_SESSION') {
    sessaoQuestoes = 0;
    sessaoAcertos  = 0;
    ultimaQuestaoEnviada = null;
    persistirContadores();
    mostrarToast('Sessao resetada!', 'info');
    console.log('[ERP Estudos] Sessao resetada via popup.');
  }

  // background.js confirma que salvou a tarefa no storage
  if (msg.type === 'ERP_TASK_CONFIGURED') {
    sessaoQuestoes = msg.questoes ?? 0;
    sessaoAcertos  = msg.acertos ?? 0;
    ultimaQuestaoEnviada = null;
    const jwtInfo = msg.hasJwt ? ' (JWT actualizado)' : '';
    mostrarToast(`Sessao iniciada: ${(msg.taskName || '').substring(0, 35)}${jwtInfo}`, 'sucesso');
    console.log(`[ERP Estudos] Tarefa configurada pelo background: ${msg.taskId?.substring(0,8)}...`);
  }
});

// ─── Inicialização: ler estado do storage (preenchido pelo background.js) ─────

(async () => {
  // background.js captura os params da URL ao navegar e guarda no storage.
  // Aqui apenas lemos o estado actual.
  const config = await chrome.storage.local.get([
    'erp_jwt_token', 'erp_task_id', 'erp_task_name',
    'erp_sessao_questoes', 'erp_sessao_acertos',
  ]);

  const jwt    = config['erp_jwt_token'];
  const taskId = config['erp_task_id'];

  // Restaurar contadores da sessao (caso a pagina seja recarregada)
  sessaoQuestoes = config['erp_sessao_questoes'] ?? 0;
  sessaoAcertos  = config['erp_sessao_acertos']  ?? 0;

  if (!jwt || !taskId) {
    console.warn('[ERP Estudos] Nao configurado. Clique no botao TEC do Ciclo Diario para comecar.');
    return;
  }

  const { expirado, segundosRestantes } = verificarJWT(jwt);
  if (expirado) {
    console.warn('[ERP Estudos] JWT expirado. Clique no botao TEC novamente para renovar.');
    mostrarToast('JWT expirado. Clique TEC no Ciclo Diario para renovar.', 'aviso');
  } else {
    console.log(`[ERP Estudos] Pronto | ${taskId.substring(0,8)}... | JWT ${Math.floor(segundosRestantes/60)}m`);
  }

  bindBotaoResolver();
  iniciarObserver();
})();

