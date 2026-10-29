# Memória — capítulos + recall (plano para a fatia 8)

Autor: CLAUDE, 2026-10-29, a pedido do Daniel ("depois a gente resolve isso, porém já salva").
**Status: só estudo. Nada aprovado, nada para programar agora.** Vem depois do branching e da fatia 5 (agentes completos). Ver BLUEPRINT §4.3 ("Resumo de capítulo"), §5.2 (teto "capítulos ≤ 15%"), §8 (`memory-chapters`, `recall`), §10 (fatia 8).

## A ideia em uma frase
Um **motor de memória só**, que responde a três perguntas: **quando fechar um capítulo**, **como guardar** e **o que mandar para a IA**. Cada referência abaixo entra como um conjunto de escolhas, não como um sistema separado.

## As quatro referências

| | Quando fecha | Como guarda | O que vai pro prompt |
|---|---|---|---|
| **Chapter Memory** (amiga do Daniel; arquivo `Chapter_Memory.txt`, Python) | histórico não-capitulado > 32k tokens (menos os `keep_recent_tokens` mais novos; corta numa resposta da IA; nunca engole a última troca) | um resumo por capítulo (título 3–7 palavras + 250–600 palavras), escrito com o resumo anterior junto, para ter continuidade | **2 etapas com um modelo de decisão (Jev)**: (1) cada resumo vira uma pergunta sim/não "este capítulo importa para a última troca?"; (2) para cada capítulo aprovado, cada mensagem dele: "tem algo MUITO relevante que o resumo não tem?". As aprovadas entram palavra por palavra embaixo do resumo (`<story_so_far>`). O último capítulo entra sempre. Cache por (pergunta, hash da troca); lotes por orçamento de tokens; até 6 em paralelo. |
| **Marinara — Advanced Memory Recall** (cenas) | quando a **cena muda** (lugar, tempo, personagens em outro lugar, `***`), decidido pelo modelo de decisão ou pelo helper; também por teto de contexto | resumo por cena (2–3 parágrafos) + "constantes" de continuidade + (opcional) **lembrança de cada personagem** em 1ª pessoa | **Mesma ideia da amiga, mais madura**: pré-seleção barata (até 24 cenas, por texto + embeddings, + a cena seguinte às 3 melhores) → modelo de decisão escolhe as cenas → julga até 12 mensagens de cada uma → **trecho contínuo** de 3–10 mensagens em volta da melhor. Tempo máximo por etapa (10–25 s, 40 s no total); se falhar, cai na ordem da pré-seleção e o recibo diz por quê. Swipe reaproveita a escolha. |
| **Marinara — Chat Summary** (o painel do print) | a cada N mensagens do usuário (padrão 5), ou na mão (Last / Range) | entradas que se liga/desliga; **Write** = escrever à mão | todas as entradas ligadas (+ "semantic retrieval" opcional) |
| **Summaryception** (extensão do ST, Lodactio, AGPL-3.0) | lotes de 3 respostas, fora das últimas 7–10 palavra por palavra | **camadas**: camada 0 com até 30 resumos; quando enche, os mais velhos se juntam de 3 em 3 na camada de baixo (o 1º vai copiado, sem IA); até 5 camadas | tudo, sem escolher (não precisa de modelo de decisão) |

**O Jev:** modelo de decisão da TypeSafe (API "System One", direto ou pelo OpenRouter), probabilidades calibradas (limiar 0,5). **Open-Jev** 2B/9B = modelo separado, sobre Qwen, roda local (GPU NVIDIA). O `noul()` da amiga = o `NoulQuestion` do Marinara (mesmo formato de pergunta).

## O que pegar de cada um
- **Amiga:** a escolha em duas etapas; resumo novo recebe o anterior; último capítulo sempre entra; cache por troca (combina com swipe).
- **Marinara (cenas):** fechar capítulo **na mudança de cena**; **pré-seleção antes do modelo de decisão** (resolve o custo da etapa 2: centenas de perguntas por turno); **tempo máximo + plano B** com motivo no recibo; **trecho contínuo** em vez de mensagens soltas; swipe reaproveita a escolha; **Fix** que nunca reescreve resumo editado à mão ("need your review"). Depois (fatia 7, grupos): quem viu cada mensagem; lembranças por personagem.
- **Marinara (Chat Summary):** **Write** (resumo à mão), liga/desliga por entrada, **Backfill** para chats antigos (importante para importar do ST), conexão própria + tamanho máximo, aprovação antes de valer (nossas `proposal`).
- **Summaryception:** **camadas** para histórias muito longas (resumir os resumos; a base não cresce sem fim); funciona **sem modelo de decisão** (padrão e plano B); lote que falhou nunca esconde mensagens; com 100+ mensagens pergunta o que fazer com o atraso (tudo / pular / um lote); retry com espera crescente.

## O que o H2 já tem para isso
- Gatilho `chapterEnd` (`schemas/src/agents.ts`); mensagem `event` ("Chapter 2") e `visibility.ai = "summary"` (`schemas/src/play.ts`); `buildPrompt` já pula mensagens que não são `full` (`core/src/presets.ts`).
- Marcador `chapters` previsto no preset (§5.1) com teto (§5.2); conexão por agente e limite de chamadas ao mesmo tempo (`ConnectionService`).
- Aba Reply / "ver o prompt" para o recibo (igual ao grupo de lorebooks, UI-PLAN L3).

## Faltaria
- **Logprobs / probabilidade do "sim"**: o `provider-openai` não lê logprobs. Ou acrescentar, ou um tipo de conexão de decisão (abaixo), ou JSON true/false (limiar vira sim/não).
- Um passo novo no turno, junto da busca nos lorebooks (§6 passo 4), antes da resposta principal, com status ("Weighing 12 chapters…").

## Para decidir quando chegar a hora (propostas, não decisões)
1. **Capítulo preso ao caminho da árvore**, guardado na mensagem onde termina (como o estado do mundo, D-001) — não um índice. O caminho atual decide quais capítulos valem; ramo aberto no meio de um capítulo → aquele capítulo não vale ali e volta o histórico bruto. Por isso **não** mudar `visibility` das mensagens no banco: "coberta por capítulo" sai do caminho. (Summaryception precisa de um "branch repair"; Marinara reabre a cena. Aqui sairia de graça.)
   - **Conferido com o branching pronto (D-032 v2, 29/10, CLAUDE):** encaixa sem conserto. Um branch é um nome + a última mensagem dele; vale o caminho até ela; mensagens antes da divisão são compartilhadas (não copiadas). Capítulo que termina antes da divisão vale nos dois branches; branch aberto no meio de um capítulo não vê esse capítulo e volta o histórico bruto; branch dentro de branch funciona igual. Ao programar, lembrar:
     - **Apagar mensagens:** os capítulos presos a uma mensagem entram na lista do `deleteMessages` (`storage/store.ts`), junto com o estado do mundo. Apagar num branch só remove o que nenhum outro branch usa (`deletableFrom`), então capítulo compartilhado fica.
     - **Make a Separate Chat** (`ChatService.copyPathToNewChat`, a única cópia de verdade) copia os capítulos do caminho, como já copia o estado do mundo.
     - **Editar mensagem de antes da divisão** muda ela nos dois branches (é a mesma mensagem) → o capítulo que a cobre fica "desatualizado" (Resummarize) nos dois; combina com o item 3.
     - **Camadas (estilo Summaryception):** o resumo de resumos fica preso à mensagem final do último capítulo que ele junta e guarda quais capítulos juntou; num branch aberto no meio dessa faixa ele não vale e voltam os capítulos de baixo que ainda valem.
2. **"Conexão de decisão"** (sim/não com probabilidade) como tipo de conexão — no Marinara serve para memória, campos de lorebook e condições de prompt; aqui poderia servir também às condições dos agentes e às condições de lorebook.
3. **Resumo editado pelo usuário nunca é reescrito sozinho**; edição entra no histórico do item. Mensagem antiga editada → capítulo marcado como desatualizado ("Resummarize").

## UX (rascunho de ideia, antes do UI-PLAN)
- **Um lugar só: Memory** (por sessão / Story), não três painéis. O painel do Marinara mostra 7 caixas antes do primeiro resumo — evitar.
- **Vazio:** 1 frase do que é + uma escolha: **Simple** (resumos sempre no prompt, estilo Summaryception) / **Smart** (escolhe o que importa a cada turno; só aparece com conexão de decisão).
- **Com capítulos:** lista (título, resumo editável, ligado/desligado, Always / Auto / Never, Resummarize) + divisa discreta no chat ("Chapter 3 · The Silver Fox"); mensagens acima continuam visíveis, com marca leve.
- **Aba Reply:** "Memory · 2 chapters · 4 excerpts", com motivo e o que ficou de fora.
- **More (fechado):** quando fechar, conexão de quem resume e de quem decide, prompt, camadas, limites.

## Ordem sugerida
1. Só capítulos (fechar, resumir, mandar o último / todos; camadas quando passar de X).
2. Etapa 1 (escolher capítulos) com pré-seleção.
3. Etapa 2 (trechos palavra por palavra).

## Onde olhar
- Amiga: `Chapter_Memory.txt` (enviado pelo Daniel em 29/10; pedir a ela: qual modelo é o Jev dela, de onde vem o `p_yes`, custo/tempo por turno, e se topa a gente portar a ideia com crédito).
- Marinara @ `e5ead06`: `docs/agents/memory.md`, `docs/connections/decision-models.md`; ver o mapa `docs/reference/marinara.md` §4.
- Summaryception: github.com/Lodactio/Extension-Summaryception (`index.js`: `ghostMessagesUpTo`, `repairIfBranched`, `buildFullContext`; v5.5.4).
- Código adaptado de qualquer um deles (todos AGPL-3.0) vai para o `CREDITS.md`.
