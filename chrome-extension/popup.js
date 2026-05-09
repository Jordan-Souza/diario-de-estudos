/**
 * popup.js — ERP Estudos: Caderno de Erros v2.1
 * Sem dependencias externas (CSP-safe para Manifest V3)
 */

'use strict';

// ─── Chaves storage ───────────────────────────────────────────────────────────
const KEY_JWT     = 'erp_jwt_token';
const KEY_TASK_ID = 'erp_task_id';
const KEY_TEC_URL = 'erp_tec_url';
const KEY_Q       = 'erp_sessao_questoes';
const KEY_A       = 'erp_sessao_acertos';
const KEY_E       = 'erp_sessao_erros';

// JWT e task ID hardcoded como fallback
const JWT_PADRAO     = 'eyJhbGciOiJFUzI1NiIsImtpZCI6ImIxMjM4NTQwLTJiZTYtNDVmZS1hYzI2LTI0ZTZkNWYzZTM4ZCIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL29ycnVpa2d0d3FsY3RxdGF2bGh3LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiI0YjY3MmYwMi00ZGE0LTRhNDktOWJjYi0xYjc5NDQ2ZGNmNDMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzc4MTI2Nzg3LCJpYXQiOjE3NzgxMjMxODcsImVtYWlsIjoidGlqdWNhb21hdUBnbWFpbC5jb20iLCJwaG9uZSI6IiIsImFwcF9tZXRhZGF0YSI6eyJwcm92aWRlciI6ImVtYWlsIiwicHJvdmlkZXJzIjpbImVtYWlsIl19LCJ1c2VyX21ldGFkYXRhIjp7ImVtYWlsIjoidGlqdWNhb21hdUBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGhvbmVfdmVyaWZpZWQiOmZhbHNlLCJzdWIiOiI0YjY3MmYwMi00ZGE0LTRhNDktOWJjYi0xYjc5NDQ2ZGNmNDMifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc3ODEyMzE4N31dLCJzZXNzaW9uX2lkIjoiMDI1MGU5N2MtMDUzZS00ZmIwLTllZTktYjkzNTUyMThlZjUwIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.v-_yKywOmG7Lhe_owD5vA6pHQD8-XWlLzuHQxdzKf_1HDLF9d6-EJuGHEPbT8koYTxU2iQvfwt_VafpABFfbRA';
const TASK_PADRAO    = 'c3260617-e625-49bb-8988-e4ea6889f56a';
const TEC_URL_PADRAO = 'https://www.tecconcursos.com.br/questoes';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const $  = id => document.getElementById(id);
const connBadge   = $('conn-badge');
const connText    = $('conn-text');
const taskName    = $('task-name');
const taskDisc    = $('task-disc');
const cntQ        = $('cnt-questoes');
const cntA        = $('cnt-acertos');
const cntE        = $('cnt-erros');
const statusLog   = $('status-log');
const btnTec      = $('btn-tec');
const btnReset    = $('btn-reset');
const btnConfig   = $('btn-config');
const configPanel = $('config-panel');
const jwtInput    = $('jwt-token');
const taskInput   = $('task-id');
const tecUrlInput = $('tec-url');
const btnSave     = $('btn-save');
const saveMsg     = $('save-msg');
const jwtStatus   = $('jwt-status');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setStatus(msg, tipo = 'idle') {
  statusLog.textContent = msg;
  statusLog.className   = `status-log status-${tipo}`;
}

function verificarJWT(jwt) {
  try {
    const p = JSON.parse(atob(jwt.split('.')[1]));
    const restam = p.exp - Math.floor(Date.now() / 1000);
    return { expirado: restam <= 0, minutos: Math.floor(restam / 60) };
  } catch {
    return { expirado: true, minutos: 0 };
  }
}

function setBadge(estado) {
  connBadge.className = `badge badge-${estado}`;
  const labels = { connected: 'Activo', error: 'Erro', connecting: 'Ligando' };
  connText.textContent = labels[estado] ?? estado;
}

// ─── Carregar e mostrar estado ────────────────────────────────────────────────

async function carregarEstado() {
  const data = await chrome.storage.local.get([
    KEY_JWT, KEY_TASK_ID, KEY_TEC_URL, KEY_Q, KEY_A, KEY_E
  ]);

  const jwt    = data[KEY_JWT]     || JWT_PADRAO;
  const taskId = data[KEY_TASK_ID] || TASK_PADRAO;
  const tecUrl = data[KEY_TEC_URL] || TEC_URL_PADRAO;

  // Preencher painel de configuracao
  jwtInput.value    = data[KEY_JWT]     || '';
  taskInput.value   = data[KEY_TASK_ID] || '';
  tecUrlInput.value = data[KEY_TEC_URL] || '';

  // Botao TecConcursos
  btnTec.href = tecUrl;

  // Contadores
  cntQ.textContent = data[KEY_Q] ?? 0;
  cntA.textContent = data[KEY_A] ?? 0;
  cntE.textContent = data[KEY_E] ?? 0;

  // Verificar JWT
  const { expirado, minutos } = verificarJWT(jwt);
  if (expirado) {
    setBadge('error');
    jwtStatus.textContent = 'JWT expirado — actualize nas configuracoes';
    setStatus('JWT expirado. Abra as configuracoes.', 'error');
  } else {
    setBadge('connected');
    jwtStatus.textContent = `JWT valido por mais ${minutos} min`;
    setStatus('Pronto. Responda questoes no TecConcursos.', 'success');
  }

  // Mostrar tarefa activa (buscar nome da tarefa via Supabase REST)
  taskName.textContent = 'Tarefa: ' + taskId.substring(0, 8) + '...';
  taskDisc.textContent  = '';
  await buscarNomeTarefa(taskId, jwt);
}

async function buscarNomeTarefa(taskId, jwt) {
  try {
    const url = `https://orruikgtwqlctqtavlhw.supabase.co/rest/v1/tarefas_ciclo?select=titulo_tarefa,nome_disciplina:disciplinas(nome_disciplina)&id=eq.${taskId}`;
    const r = await fetch(url, {
      headers: {
        'apikey':        'sb_publishable_vfZEtxZrzGOqfDjbdAemRQ_x7CPnpg_',
        'Authorization': `Bearer ${jwt}`,
      }
    });
    if (!r.ok) return;
    const data = await r.json();
    if (data?.[0]) {
      taskName.textContent = data[0].titulo_tarefa || taskId.substring(0, 8) + '...';
      taskDisc.textContent  = data[0].nome_disciplina?.nome_disciplina || '';
    }
  } catch { /* silencioso */ }
}

// ─── Escutar mensagens do content_script (contadores ao vivo) ────────────────

chrome.storage.onChanged.addListener((changes) => {
  if (changes[KEY_Q]) cntQ.textContent = changes[KEY_Q].newValue ?? 0;
  if (changes[KEY_A]) cntA.textContent = changes[KEY_A].newValue ?? 0;
  if (changes[KEY_E]) cntE.textContent = changes[KEY_E].newValue ?? 0;
});

// ─── Botao: Toggle configuracao ───────────────────────────────────────────────

btnConfig.addEventListener('click', () => {
  const oculto = configPanel.classList.contains('hidden');
  configPanel.classList.toggle('hidden', !oculto);
  btnConfig.textContent = oculto ? '✕ Fechar' : '⚙ Configurar';
});

// ─── Botao: Guardar configuracao ──────────────────────────────────────────────

btnSave.addEventListener('click', async () => {
  const jwt    = jwtInput.value.trim();
  const taskId = taskInput.value.trim();
  const tecUrl = tecUrlInput.value.trim() || TEC_URL_PADRAO;

  if (taskId && !/^[0-9a-f-]{36}$/i.test(taskId)) {
    showSaveMsg('UUID invalido.', 'error');
    return;
  }

  const toSave = { [KEY_TEC_URL]: tecUrl };
  if (jwt)    toSave[KEY_JWT]     = jwt;
  if (taskId) toSave[KEY_TASK_ID] = taskId;

  await chrome.storage.local.set(toSave);
  showSaveMsg('Guardado!', 'success');
  btnTec.href = tecUrl;
  await carregarEstado();
});

function showSaveMsg(msg, tipo) {
  saveMsg.textContent  = msg;
  saveMsg.className    = tipo === 'success' ? 'save-ok' : 'save-err';
  saveMsg.classList.remove('hidden');
  setTimeout(() => saveMsg.classList.add('hidden'), 2500);
}

// ─── Botao: Resetar contadores da sessao ─────────────────────────────────────

btnReset.addEventListener('click', async () => {
  await chrome.storage.local.set({ [KEY_Q]: 0, [KEY_A]: 0, [KEY_E]: 0 });
  cntQ.textContent = '0';
  cntA.textContent = '0';
  cntE.textContent = '0';
  setStatus('Contadores resetados.', 'info');
});

// ─── Botao TecConcursos — abrir e notificar content_script ───────────────────

btnTec.addEventListener('click', (e) => {
  // Notificar tab activa do TecConcursos para iniciar telemetria
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab?.url?.includes('tecconcursos.com.br')) {
      chrome.tabs.sendMessage(tab.id, { type: 'ERP_START_SESSION' });
    }
  });
});

// ─── Init ─────────────────────────────────────────────────────────────────────

carregarEstado();
