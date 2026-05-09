-- ============================================================
-- MIGRATION 002: Tabela live_tracking para Telemetria em Tempo Real
-- Execute no SQL Editor do Supabase Dashboard
-- ============================================================
-- Esta tabela armazena os contadores em tempo real da sessao de estudo
-- A Chrome Extension faz UPSERT aqui a cada questao respondida
-- O frontend React escuta via Supabase Realtime e atualiza os inputs

CREATE TABLE IF NOT EXISTS live_tracking (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tarefa_id       UUID NOT NULL REFERENCES tarefas_ciclo(id) ON DELETE CASCADE,
    user_id         UUID NOT NULL REFERENCES auth.users,
    questoes_total  INTEGER NOT NULL DEFAULT 0,
    acertos_total   INTEGER NOT NULL DEFAULT 0,
    updated_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    -- Um registo por tarefa por utilizador
    UNIQUE (tarefa_id, user_id)
);

ALTER TABLE live_tracking ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own live tracking" ON live_tracking;

CREATE POLICY "Users can manage their own live tracking"
    ON live_tracking FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Indice para filtrar por tarefa_id rapidamente (usado pelo Realtime filter)
CREATE INDEX IF NOT EXISTS idx_live_tracking_tarefa_id ON live_tracking(tarefa_id);

-- Habilitar Realtime para esta tabela (necessario para Supabase Realtime funcionar)
-- Execute este comando separadamente se o anterior ja existir:
ALTER PUBLICATION supabase_realtime ADD TABLE live_tracking;
