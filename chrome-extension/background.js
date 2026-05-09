/**
 * background.js — ERP Estudos: Service Worker (Manifest V3)
 *
 * Responsavel pelo ciclo de vida da extensao.
 * No MV3, este ficheiro corre como Service Worker (sem acesso ao DOM).
 */

'use strict';

// Inicializar valores padrao quando a extensao e instalada pela primeira vez
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === 'install') {
    console.log('[ERP Estudos] Extensao instalada. Abra o popup para configurar o JWT e o ID da Tarefa.');
  }
  if (reason === 'update') {
    console.log('[ERP Estudos] Extensao actualizada para a versao mais recente.');
  }
});
