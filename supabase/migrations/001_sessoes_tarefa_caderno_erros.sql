-- ============================================================
-- MIGRATION 001: Multiplas Sessoes por Tarefa + Caderno de Erros
-- Execute este script no SQL Editor do Supabase Dashboard
-- ============================================================

-- --------------------------------------------------------
-- TABELA: sessoes_tarefa
-- Relacao 1:N com tarefas_ciclo (multiplas sessoes por tarefa)
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessoes_tarefa (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tarefa_id        UUID NOT NULL REFERENCES tarefas_ciclo(id) ON DELETE CASCADE,
    user_id          UUID NOT NULL REFERENCES auth.users,
    numero_sessao    INTEGER NOT NULL DEFAULT 1,
    questoes_feitas  INTEGER NOT NULL DEFAULT 0,
    acertos          INTEGER NOT NULL DEFAULT 0,
    data_execucao    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at       TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE (tarefa_id, numero_sessao)
);

-- --------------------------------------------------------
-- TRIGGER: Auto-incremento do numero_sessao por tarefa
-- --------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auto_numero_sessao()
RETURNS TRIGGER AS $$
DECLARE
    v_next_num INTEGER;
BEGIN
    SELECT COALESCE(MAX(numero_sessao), 0) + 1
    INTO v_next_num
    FROM sessoes_tarefa
    WHERE tarefa_id = NEW.tarefa_id;

    NEW.numero_sessao := v_next_num;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_auto_numero_sessao ON sessoes_tarefa;

CREATE TRIGGER trg_auto_numero_sessao
BEFORE INSERT ON sessoes_tarefa
FOR EACH ROW
EXECUTE FUNCTION fn_auto_numero_sessao();

-- --------------------------------------------------------
-- RLS: sessoes_tarefa
-- --------------------------------------------------------
ALTER TABLE sessoes_tarefa ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own task sessions" ON sessoes_tarefa;

CREATE POLICY "Users can manage their own task sessions"
    ON sessoes_tarefa FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- --------------------------------------------------------
-- TABELA: caderno_erros
-- Armazena questoes capturadas pela Chrome Extension
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS caderno_erros (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tarefa_id         UUID NOT NULL REFERENCES tarefas_ciclo(id) ON DELETE CASCADE,
    sessao_id         UUID REFERENCES sessoes_tarefa(id) ON DELETE SET NULL,
    user_id           UUID NOT NULL REFERENCES auth.users,
    conteudo_questao  TEXT NOT NULL,
    comentario_aluno  TEXT,
    fonte_url         TEXT,
    data_captura      TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- --------------------------------------------------------
-- RLS: caderno_erros
-- --------------------------------------------------------
ALTER TABLE caderno_erros ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own error notebook" ON caderno_erros;

CREATE POLICY "Users can manage their own error notebook"
    ON caderno_erros FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- --------------------------------------------------------
-- INDICES para performance
-- --------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_sessoes_tarefa_tarefa_id ON sessoes_tarefa(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_sessoes_tarefa_user_id   ON sessoes_tarefa(user_id);
CREATE INDEX IF NOT EXISTS idx_caderno_erros_tarefa_id  ON caderno_erros(tarefa_id);
CREATE INDEX IF NOT EXISTS idx_caderno_erros_user_id    ON caderno_erros(user_id);
CREATE INDEX IF NOT EXISTS idx_caderno_erros_sessao_id  ON caderno_erros(sessao_id);
