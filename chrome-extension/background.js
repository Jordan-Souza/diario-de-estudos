/**
 * background.js — ERP Estudos: Service Worker (Manifest V3)
 *
 * Responsavel por:
 * 1. Capturar os params erp_task_id / erp_jwt da URL quando o
 *    utilizador abre o TecConcursos via botao TEC do SaaS.
 *    (Faz isto ANTES do TecConcursos redirecionar a URL — content_script
 *     seria tarde demais porque e uma SPA Angular que muda o URL)
 * 2. Salvar os params no chrome.storage.local imediatamente.
 * 3. Notificar o content_script da tab que a tarefa foi configurada.
 */

'use strict';

// ─── Capturar params da URL quando abre TecConcursos ─────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Actua apenas na primeira carga da pagina (status: 'loading')
  // para ler os params antes de qualquer redirect Angular
  if (changeInfo.status !== 'loading') return;
  if (!tab.url?.includes('tecconcursos.com.br')) return;

  let url;
  try { url = new URL(tab.url); } catch { return; }

  const taskId   = url.searchParams.get('erp_task_id');
  const taskName = url.searchParams.get('erp_task_name');
  const jwt      = url.searchParams.get('erp_jwt');

  // Sem params ERP — navegacao normal, ignorar
  if (!taskId) return;

  console.log(`[ERP background] Params detectados: task=${taskName?.substring(0,30)} jwt_len=${jwt?.length}`);

  // Montar o objecto a guardar
  const toSave = {
    erp_task_id:         taskId,
    erp_task_name:       taskName || '',
    erp_sessao_questoes: 0,
    erp_sessao_acertos:  0,
    erp_sessao_erros:    0,
  };

  // Guardar JWT fresco se vier e for valido
  if (jwt && jwt.length > 50) {
    toSave.erp_jwt_token = jwt;
    console.log('[ERP background] JWT fresco guardado no storage.');
  }

  chrome.storage.local.set(toSave, () => {
    console.log(`[ERP background] ✓ storage actualizado: ${taskId.substring(0,8)}...`);

    // Notificar o content_script (pode nao estar pronto ainda — e seguro falhar)
    chrome.tabs.sendMessage(tabId, {
      type:      'ERP_TASK_CONFIGURED',
      taskId,
      taskName:  taskName || '',
      hasJwt:    !!(jwt && jwt.length > 50),
    }).catch(() => {
      // content_script ainda nao inicializou — nao e problema,
      // ele vai ler do storage quando inicializar
    });
  });
});

// ─── Ciclo de vida ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    chrome.storage.local.set({
      erp_sessao_questoes: 0,
      erp_sessao_acertos:  0,
      erp_sessao_erros:    0,
    });
    console.log('[ERP Estudos] Extensao instalada. Clique TEC no Ciclo Diario para comecar.');
  }
  if (reason === 'update') {
    console.log('[ERP Estudos] Extensao actualizada.');
  }
});
