-- SCHEMA SQL PARA O ERP DE ESTUDOS
-- Desabilitar proteções apenas caso estejamos de fato reconstruindo o banco, caso contrário, remova os DROPs.
-- DROP VIEW IF EXISTS vw_evolucao_consolidada;
-- DROP TABLE IF EXISTS tarefas_ciclo;
-- DROP TABLE IF EXISTS disciplinas_evolucao;

-- 1. Criação das Tabelas Base
CREATE TABLE disciplinas_evolucao (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    nome_disciplina TEXT NOT NULL,
    total_tarefas INTEGER NOT NULL DEFAULT 0,
    total_aulas INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE tarefas_ciclo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    disciplina_id UUID REFERENCES disciplinas_evolucao(id) ON DELETE CASCADE,
    trilha_numero TEXT NOT NULL,
    data_execucao DATE,
    titulo_tarefa TEXT NOT NULL,
    tot_questoes_feitas INTEGER DEFAULT 0,
    tot_acertos INTEGER DEFAULT 0,
    desempenho NUMERIC(5,2) GENERATED ALWAYS AS (
        CASE 
            WHEN tot_questoes_feitas > 0 THEN (tot_acertos::numeric / tot_questoes_feitas) * 100 
            ELSE 0 
        END
    ) STORED,
    revisao_ia TEXT,
    status TEXT DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Em Andamento', 'Concluído')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Habilitação de Row Level Security (RLS)
ALTER TABLE disciplinas_evolucao ENABLE ROW LEVEL SECURITY;
ALTER TABLE tarefas_ciclo ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Segurança (O utilizador só pode ver, inserir, atualizar e apagar os seus próprios dados)
CREATE POLICY "Users can manage their own subjects" 
    ON disciplinas_evolucao FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can manage their own tasks" 
    ON tarefas_ciclo FOR ALL 
    USING (auth.uid() = user_id) 
    WITH CHECK (auth.uid() = user_id);

-- 4. View de Consolidação da Evolução (Métricas Dinâmicas)
-- Esta view processa as estatísticas unindo disciplinas e as respetivas tarefas
CREATE OR REPLACE VIEW vw_evolucao_consolidada AS
SELECT 
    d.id AS disciplina_id,
    d.user_id,
    d.nome_disciplina,
    d.total_tarefas,
    d.total_aulas,
    COUNT(t.id) FILTER (WHERE t.status = 'Concluído') AS tarefas_concluidas,
    COALESCE(SUM(t.tot_questoes_feitas), 0) AS qtd_questoes_total,
    COALESCE(SUM(t.tot_acertos), 0) AS qtd_acertos_total,
    CASE 
        WHEN COALESCE(SUM(t.tot_questoes_feitas), 0) > 0 
        THEN (COALESCE(SUM(t.tot_acertos), 0)::numeric / SUM(t.tot_questoes_feitas)) * 100
        ELSE 0
    END AS desempenho_global
FROM 
    disciplinas_evolucao d
LEFT JOIN 
    tarefas_ciclo t ON d.id = t.disciplina_id
GROUP BY 
    d.id, d.user_id, d.nome_disciplina, d.total_tarefas, d.total_aulas;


-- 5. Tabela de Cronograma Diario (Calendario Semanal)
CREATE TABLE IF NOT EXISTS cronograma_dia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    disciplina_id UUID REFERENCES disciplinas_evolucao(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    hora_inicio TIME NOT NULL DEFAULT '08:00',
    hora_fim TIME NOT NULL DEFAULT '10:00',
    titulo_override TEXT,
    ordem INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE cronograma_dia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own schedule"
    ON cronograma_dia FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 6. Sessões de Estudo (Pomodoro Histórico)
CREATE TABLE IF NOT EXISTS sessoes_estudo (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    disciplina_id UUID REFERENCES disciplinas_evolucao(id) ON DELETE CASCADE,
    data DATE NOT NULL,
    minutos_estudados INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE sessoes_estudo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own study sessions"
    ON sessoes_estudo FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 7. Histórico de Auditorias IA
CREATE TABLE IF NOT EXISTS relatorios_ia (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    data_auditoria DATE NOT NULL DEFAULT CURRENT_DATE,
    conteudo_md TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE relatorios_ia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own AI reports"
    ON relatorios_ia FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- 8. Questões Erradas (Banco de Falhas do Simulado Flash)
CREATE TABLE IF NOT EXISTS questoes_erradas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users NOT NULL,
    disciplina TEXT NOT NULL,
    tema TEXT NOT NULL,           -- titulo_tarefa
    tarefa_id UUID REFERENCES tarefas_ciclo(id) ON DELETE SET NULL,
    pergunta TEXT NOT NULL,
    opcoes JSONB NOT NULL,        -- array de strings
    resposta_correta INTEGER NOT NULL,
    resposta_selecionada INTEGER NOT NULL, -- -1 se timeout
    explicacao TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE questoes_erradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own wrong answers"
    ON questoes_erradas FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
