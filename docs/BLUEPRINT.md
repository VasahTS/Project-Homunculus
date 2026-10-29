# BLUEPRINT — Homunculus 2 (o desenho completo)

Autor: CLAUDE. v1 em 2026-10-27; **v2 em 2026-10-27** (revisão crítica pedida pelo Daniel: lacunas de dados, agentes, prompt, desempenho, segurança, custo). Status: **proposta para o Daniel aprovar** (perguntas do §12 respondidas; Style Reviewer acrescentado).
Este é o mapa do app inteiro. Toda funcionalidade nova precisa caber aqui; se não couber, primeiro muda-se o blueprint (e registra-se em `DECISIONS.md`), depois o código.
Escrito em português porque o Daniel lê e aprova este documento (exceção à D-004; nomes técnicos ficam em inglês).
Relacionados: `ARCHITECTURE.md` (como o núcleo é feito), `DECISIONS.md`, `docs/reference/` (onde olhar nos outros apps).

---

## 1. A ideia em uma frase

**Um núcleo pequeno que roda "turnos", e todo o resto são peças combináveis** — personagens, personas, presets, lorebooks, agentes, trackers, companions — que o usuário monta do jeito que joga: por campanha, por sessão curta, ou como padrão.

Princípios que decidem as dúvidas:

1. **Flexível como o usuário joga.** Um preset, um tracker ou um agente pode valer para *tudo*, para *uma campanha* ou para *uma sessão*; a camada mais específica ganha (§3).
2. **Agentes são cidadãos do app, não remendos.** Um formato só, um lugar só onde rodam (o turno), resultados organizados e visíveis. Os 69 modelos do Homunculus v1 entram por **importação** — o app não se adapta a eles.
3. **Tudo que acontece numa mensagem fica preso àquela mensagem** (D-001 ampliada). Swipe, voltar ou ramificar sempre mostra tudo certo.
4. **Nada se perde em silêncio.** Toda reescrita é desfazível, toda edição tem histórico, todo apagar passa pela lixeira, e o app sempre consegue mostrar *o que foi enviado à IA e por quê*.
5. **Custo sob controle.** Agentes rodam em paralelo e com modelos baratos, mas com limites claros por conexão e por agente; o usuário vê quanto cada sessão gastou.

---

## 2. As peças (o modelo de dados)

### 2.1 Biblioteca — coisas reutilizáveis

| Peça | O que é | Detalhes importantes |
|---|---|---|
| **Character** | Um personagem (card do ST por dentro) | **Variantes** (§2.5). Guarda o card original para exportar sem perda (D-012). |
| **Persona** | Quem o usuário é na história | Mesmo mecanismo de variantes. Imagem própria. |
| **Preset** | A receita do prompt: blocos ordenados + parâmetros da IA | Import/export de preset Chat Completion do ST. **Variáveis de estilo** (`{{pov}}`, `{{tense}}`…). |
| **Lorebook** | Entradas ativadas por palavras-chave | Ativação **igual à do ST**; extensão nossa: ativar também **por estado do mundo** (§5.3). |
| **Agent** | Um ajudante de IA (§4) | É **dado** (editável, importável). |
| **Tracker schema** | Os campos que um tracker acompanha | Desenha o painel e define o que o tracker preenche (§4.5). |
| **Kit** | Um setup salvo com nome: "Campanha de RPG", "Drama", "Conversa leve" | Aplicar um kit **copia** os valores para a camada (§2.6). |
| **Connection** | Provedor + endereço + modelo (+ limites, §7.3) | Chave no cofre do Windows (D-011). |
| **Scenario** (Vault) | Ambientação, NPCs, aberturas, lorebooks, hora inicial | Inicia uma campanha ou sessão. |
| **NPC sheet** (Vault) | Ficha de NPC | Pode virar Character. |
| **Regex script** | Buscar/substituir no texto (exibição, prompt ou os dois) | Import do ST; também usado por agentes. |

### 2.2 Jogo — onde a história acontece

```
Story (opcional, no Vault) ──< Session ──< Message (árvore) ──< registros por mensagem (§2.4)
   │ narrador (Vault / card / próprio)  │ setup da sessão
   │ NPCs (Vault) + cards opcionais     │ cast (personagem + variante + presença), NPCs extras
   │ scenario + aberturas               │ persona (+ variante), papel do usuário
   │ papel do usuário, setup da story   │ branches, marcadores ("save points")
   └ sessões da story                   └ espaço de memória dos agentes (no estado, §4.7)
```

- **Story** (D-029, substitui a "Campaign"): história narrada, área separada dos chats 1:1. Contada por um **Narrator** (não é personagem: item do Vault com instruções, estilo, "may bring in new people" e instrução por turno; vem o **Simple Narrator**; ou um card do usuário; ou escrito só para ela). Tem **NPCs** (fichas leves do Vault com os campos por personagem de um conjunto do Scene: Characters, sem os de "Now"; o mesmo NPC pode estar em várias Stories e chats; "Make a Copy"), cards opcionais (entram como são), Scenario, aberturas, papel do usuário (*player / coauthor / director*) e a camada de setup "story". Cada Play cria uma sessão. Continuar do estado final de outra sessão: depois.
- **Vault** = Stories, Narrators, NPCs (peças de história). **Library** = o que é do formato do ST e do motor (Characters, Personas, Lorebooks, Presets, Trackers, Trash). Lorebook é só lore.
- **Session**: uma conversa — cast (membros com variante, *In scene / Offscreen / Off*, *muted*, ficha para o narrador; ou um **narrador**), papel do usuário (*player / coauthor / director*), persona + variante, setup próprio.
- Um chat 1:1, um grupo e uma aventura narrada são **o mesmo sistema** com cast diferente.

### 2.3 Mensagens — tipos e visibilidade

Nem toda mensagem é "fala". Cada mensagem tem um **tipo** e uma **visibilidade**:

| Tipo | Exemplo |
|---|---|
| `user` | fala/ação do jogador |
| `direction` | ordem do coauthor/director ("façam eles discutirem") |
| `reply` | resposta da IA (quem falou — personagem ou narrador — fica no campo `speaker`) |
| `ooc` | nota fora do personagem (fica visível, pode não ir para a IA) |
| `event` | marcador do sistema: "passaram-se 3 dias", "nova cena", "capítulo 2" |

Visibilidade: **para a IA** (sim / não / só resumo) e **para o usuário** (visível / oculta). Isso substitui os vários jeitinhos do v1 (OOC blocks, esconder mensagens resumidas).

### 2.4 O que fica preso a cada mensagem

| Registro | Exemplo | Para quê |
|---|---|---|
| `state delta` | "hora: 21:40", "Lyra.roupa: capa molhada" | Swipe/voltar mostra o mundo certo (D-001). |
| `agent run` | "Prose Polisher: ok, 1,2 s, modelo X, 340 tokens, saída Y" | Ver o que cada agente fez, rodar de novo, depurar, custo. |
| `revision` | original × reescrito (por agente **ou pelo usuário**) | Desfazer qualquer reescrita/edição. |
| `companion note` | resumo, comentário do diretor | O painel mostra a nota do swipe atual. |
| `generation record` | modelo, parâmetros, **prompt enviado** (comprimido), de qual bloco veio cada pedaço, tokens, custo, tempo | "Ver o prompt" de **qualquer** mensagem, não só da última; comparar swipes. |
| `reasoning` | o "pensamento" de modelos thinking (ex.: GLM thinking do Daniel) | Guardado à parte: mostrar/esconder; **nunca** volta para o histórico do prompt. |

**Mensagens antigas editadas:** se o usuário editar a mensagem N (ou um valor do painel em N), os registros das mensagens **depois de N** podem ficar desatualizados. O app marca esses como **"desatualizado"** e oferece "recalcular a partir daqui" — nunca recalcula sozinho (gastaria tokens sem pedir).

### 2.5 Variantes (opção B do Daniel)

- Um Character (ou Persona) tem **uma ou mais variantes**: "Lyra — fantasia", "Lyra — moderna". A primeira é a principal.
- Uma variante guarda **só o que muda** em relação à principal. Editar a principal atualiza o que as variantes não mudaram.
- **Cada sessão escolhe a variante** de cada membro do cast (e da persona).
- Exportar para o ST: exporta **uma variante** como card normal.

### 2.6 Regras gerais da biblioteca

- **Referência viva x cópia.** Sessões e campanhas **apontam** para itens da biblioteca (editar um lorebook vale para todas que o usam). **Kits e cenários são copiados** ao aplicar (mudar o kit depois não mexe em campanhas já criadas). O app mostra "usado em 3 campanhas" antes de editar algo compartilhado, com opção **"duplicar e editar só aqui"**.
- **Histórico para tudo**, não só personagens: presets, lorebooks, agentes, schemas e kits guardam versões; dá para comparar e voltar. **Feito para personagens e personas** (2026-10-28, D-019: tabela `item_history`); os outros entram quando ganharem editor.
- **Lixeira**: apagar manda para a lixeira (personagens, sessões, mensagens, itens); some de vez só ao esvaziar. Apagar algo em uso avisa quem usa. **Feito para sessões, personagens e personas** (D-019), com "Desfazer"; trackers e mensagens entram depois.
- **Pacotes para compartilhar**: exportar uma campanha inteira (cards, lorebooks, kit, agentes, schemas) como **um arquivo** do Homunculus, e importar. Formato próprio, versionado (lição do Aventuras: não enfiar tudo num card do ST). Cards/lorebooks/presets continuam saindo também no formato do ST.

---

## 3. Setup em camadas — o coração da flexibilidade

Tudo o que configura o jeito de jogar mora num **Setup**:
preset · persona · lorebooks extras · agentes · trackers (e seus campos) · companions · estilo da história · conexão principal e conexões dos agentes · regras de quem responde · narrador e abertura · limites de custo · regras de quando os trackers rodam.

```
  Padrão (o que eu uso sempre)
     ↓ sobrescrito por
  Campanha
     ↓ sobrescrito por
  Sessão
```

- Cada item é **"herdar"** (vazio) ou um valor. A camada mais de baixo com valor ganha.
- Listas (agentes, lorebooks, trackers): **manter os de cima / só estes / somar** (+ estes − os desmarcados).
- A UI mostra **de onde veio** cada valor e um botão "voltar a herdar".
- **Uma função só** resolve o setup (`resolveSetup`). Ninguém mais lê camada por camada.
- O setup **muda no meio da sessão** (ligar um tracker na mensagem 200) e vale **dali para frente**; o registro de geração (§2.4) guarda qual setup foi usado em cada resposta.

Exemplos do Daniel:
- **Campanha completa de RPG**: kit "RPG" → trackers de mundo, **dinheiro**, inventário, **quests**, **facções**, reputação; preset Game Master; narrador. Toda sessão da campanha herda.
- **Sessão normal, outro foco**: kit "Drama" na sessão → trackers de **emoções** e **relacionamentos**; nada de dinheiro ou quests.
- Os dois usam **o mesmo mecanismo**: escolher/editar schemas, nunca programar.

---

## 4. Agentes — um modelo só, feito para o app

### 4.1 O formato: gatilho → entrada → saída

Todo agente (embutido ou do usuário) é **um gatilho**, **o que ele lê** e **para onde vai o resultado**, mais opções.

**Gatilhos** (quando roda):
| Gatilho | Exemplo |
|---|---|
| `turn.before` / `turn.parallel` / `turn.after` | antes, junto ou depois da resposta principal |
| `every N messages` | resumo de capítulo a cada 40 mensagens |
| `state change` | "o lugar mudou" → descrever o ambiente novo |
| `session start` / `chapter end` | montar a abertura; fechar o capítulo |
| `manual` | botão na UI ou no painel |

**Entradas** (o que lê): N últimas mensagens · cards e lorebooks ativos · estado do mundo · **resultado de outros agentes** (ver dependências) · sua própria memória (§4.7). Tudo com limite de tokens.

**Saídas** (para onde vai o resultado):
| Saída | O que faz | Exemplos do v1 |
|---|---|---|
| `inject` | texto que entra no prompt da resposta principal | Don't write for user, HTML toggle, randomizers |
| `intercept` | reescreve a mensagem do usuário antes de enviar (guarda revision) | modo intercept do v1 |
| `rewrite` | reescreve a resposta (guarda revision, desfazível) | Prose Polisher |
| `state` | dados estruturados → estado do mundo, validados por schema | todos os trackers |
| `note` | nota própria no painel do agente; pode voltar ao prompt | companions |
| `check` | aprova ou reprova a resposta, com motivo → **avisar**, **corrigir** (chama um rewrite) ou **gerar de novo** (com limite de tentativas) | Continuity Checker |
| `choices` | opções que viram **botões clicáveis** na UI, fora do texto | CYOA, Direction Menu, Reply Ideas |
| `proposal` | propõe mudar dados da biblioteca (card, lorebook, vault) → **o usuário aprova ou recusa** | Lorebook Keeper, Card Evolution (Marinara) |
| `speaker` | decide **quem fala agora** num grupo | ordem natural/pooled do ST, decisão do Marinara |
| `media` (depois) | imagem, música, voz | Illustrator (Marinara) |

**Opções que valem para qualquer agente:**
- **Como roda**: `separate` (chamada própria, pode ser modelo barato) ou `inline` (o modelo principal escreve um bloco junto da resposta e o app **retira** e guarda — 1 chamada só; é como 36 dos 69 modelos do v1 funcionam). Inline economiza, mas deixa a resposta principal mais longa e pode piorar a escrita; o padrão para trackers novos é `separate`.
- **Ferramentas** (`tools`): **habilidade**, não tipo — qualquer agente pode receber ferramentas (buscar no lorebook, ler mensagens antigas, consultar o estado). O Pathfinder é um agente `inject` com ferramentas.
- **Condições**: palavras-gatilho, probabilidade, tipo de geração (normal, swipe, continue, impersonate), papéis do usuário, só se um valor do estado for X.
- **Dependências**: "rodar depois de X e ler o resultado dele" (ex.: Relacionamentos → Diretor). O runner organiza a ordem; ciclos são recusados ao salvar.
- **Conexão**: a do setup ou uma própria.
- **Limites**: tokens máximos por execução, só depois de N mensagens, no máximo X execuções por turno.
- **Sorte e swipe**: agentes aleatórios podem **sortear de novo a cada swipe** ou **manter o mesmo sorteio** (semente presa à mensagem-pai).
- **Saída validada** por schema antes de salvar (já existe no núcleo). Resposta mal formada → uma tentativa de reparo automática, depois falha visível.

Agentes **embutidos** (módulos) e **do usuário** (dados) usam o mesmo formato; o runner não sabe a diferença.

### 4.2 Fases dentro de um turno

`before` roda **em paralelo** (agrupando agentes da mesma conexão numa chamada só, ideia do Marinara). `after` roda em **duas ondas**: primeiro os que mexem no texto (`rewrite` e `check`, **em sequência**, na ordem definida), depois os que só leem (`state`, `note`, `choices`, `proposal`, **em paralelo**), assim os trackers leem o texto final.

### 4.3 Exemplos de combinações

- **Tracker de relacionamento**: `turn.after` → lê 6 mensagens + estado → `state` (schema "por par": afeto, confiança, tensão).
- **Diretor de história** (Story Director do Daniel): `turn.after`, depende do tracker de plot → `note` + memória de objetivos (§4.7) → no turno seguinte `inject` "puxe a história para o beat X".
- **Guardião "não escreva pelo usuário"**: `turn.after` → `check` → se reprovar, `rewrite` corrige só o trecho.
- **Resumo de capítulo**: `every 40 messages` → `note` + marca as mensagens resumidas como "só resumo para a IA" (§2.3).

### 4.4 Style Reviewer (pedido do Daniel, 2026-10-27)

Um revisor de estilo da escrita da IA, na linha do Prose Polisher do SillyBunny, mas mais forte. Referência: **fiction-prose-style** (github.com/unkarelian/fiction-prose-style, licença MIT, commit 2f5947ac de 2026-10-24) — um padrão de prosa testado às cegas com um leitor real, que ataca os *formatos* de frase típicos de IA ("Não era X. Era Y.", eco duplo, fecho espirituoso, narrador que explica a cena, toda cena terminando em calma…).

A grande ideia dele, que adotamos: **duas metades**.
1. **Contagem (sem IA, de graça)**: um código lê as últimas mensagens — ou o capítulo — e conta o que um modelo não percebe sozinho ao longo de muitas respostas: **frases repetidas**, palavras usadas muito mais que o normal, ritmo (frases todas curtas ou todas encadeadas com "e"), densidade de comparações, fechos de parágrafo. Compara com uma **referência** (os textos que o usuário marcou como "gostei"; começa com a referência do projeto).
2. **Julgamento (agente)**: um revisor que **só aponta** trechos que batem com os formatos proibidos do guia, sem reescrever (o `REVIEWER.md` deles).

Como entra no nosso modelo de agentes (§4.1), sem nada especial:
- **Contagem** = código de um módulo, roda a cada turno sobre a janela recente (custo zero).
- **Revisor** = agente com saída `check`, gatilho `every N messages` ou `manual`; resultado aparece num **relatório** com os trechos marcados.
- **Volta para a história** de três jeitos, à escolha: `inject` ("evite estas frases e formatos nesta resposta" — o mais barato e o mais eficaz contra repetição), `rewrite` só dos trechos marcados (o Prose Polisher), ou só o relatório.
- **O guia de estilo é dado**: o padrão vem do fiction-prose-style, mas o usuário troca, edita ou escreve o seu (é um bloco/arquivo, não código).
- **"Gostei" numa mensagem** ensina a referência de ritmo e vocabulário do usuário.

Módulo `style-reviewer`. O Aventuras tem algo parecido (`StyleReviewerService.ts`, frases repetidas entre entradas) — ver `docs/reference/aventuras.md`. O contador é Python (`scripts/prose_check.py`); portar para TypeScript com crédito em `CREDITS.md` (MIT).

### 4.5 Trackers e o painel Scene (editáveis e na UI)

- Tracker = agente com saída `state` + **Tracker schema**.
- O painel é **desenhado a partir do schema**: tracker novo ganha painel sem programar tela.
- **Tipos de campo**: texto · número (moedas) · medidor 0–100 (afeto) · status (quest *ativa/feita/falhou*) · lista de itens (inventário com quantidade) · **data/hora da história** (com calendário, como o v1) · **por personagem** (um valor por membro do cast) · **por par** (A→B) · grupo de campos.
- Cada campo tem: rótulo, ajuda ("?"), se o tracker pode mudar sozinho ou **só o usuário** (travado), e se vai para o prompt.
- **Dono do campo**: cada namespace do estado tem **um** tracker dono; os outros só leem. Isso evita dois trackers brigando pelo mesmo valor.
- **Edição do usuário** → delta do usuário naquela mensagem (ou **pin**, que vale em todos os ramos). Edição do usuário sempre ganha da do tracker na mesma mensagem.
- Volta para o prompt como um resumo curto (marcador "cena atual"), com limite de tokens.
- **Regra do Daniel (2026-10-27): nada de tracker com nome ou função fixa no código.** O app não sabe *o que* é acompanhado; o usuário cria o tracker e os campos na tela, e serve do jeito que ele quiser. Exemplos como RPG (dinheiro, quests, facções) ou Drama (emoções, relacionamentos) são só **configurações que o usuário monta** — se um dia vierem prontos, vêm como **dados opcionais** (um arquivo para importar ou um Kit), nunca como código.
- **Trackers iniciais (pedido do Daniel, 2026-10-27, D-017):** os do v1 — **Scene: World** (Standard, Survival, Minimal), **Scene: Characters** (Standard, **Fantasy** — novo: raça, classe, nível, vida, mana, afinidade, slots de skill, skills, magias, equipamento, condições —, Superpowers, Sci-fi, Minimal) e **Scene: Plot** — vêm **como dados editáveis** (`apps/desktop/src/starter/trackers.json`), instalados uma vez; o motor continua sem saber o que eles são. **Scene: Map** fica para quando existir a tela de mapa (World Map, "depois" no §10): ele responde só com o que mudou e precisa de coordenadas e rotas.
- **Field sets**: um tracker pode ter vários conjuntos de campos; a sessão escolhe um (`agentOverrides[tracker].schemaId`), senão vale o padrão do tracker. Campos com a mesma chave mantêm o valor ao trocar de conjunto. Campos têm **seção** (só agrupa no painel e no prompt), **"sempre preenchido"**, e listas podem ter **colunas** (quests: título/status/nota). Um conjunto diz **quem tem valores por personagem**: só o elenco, elenco + usuário, ou **qualquer um que a história nomear** (o tracker adiciona NPCs). Opcional: o campo que diz **quem está na cena** — quem não está vai ao prompt só pelo nome.
- **Prova de conceito feita (2026-10-27):** `packages/core/src/trackers.ts` (o motor só lê o schema) + editor de trackers + painel Scene. Ver `DECISIONS.md` D-016.

### 4.6 Companions

Agente com saída `note`: notas por mensagem, painel próprio, pode alimentar o próximo prompt e ler notas de outros agentes. Exemplos do v1: Memory Shard, Director's Commentary, Continuity.

### 4.7 Memória dos agentes

Notas por mensagem servem para "o que aconteceu aqui". Para coisas que **duram** (objetivos de longo prazo, segredos plantados, beats planejados), cada agente tem um **espaço próprio dentro do estado do mundo** (namespace `agent:<id>`). Como é estado, funciona com swipe e ramos sem nada novo.

### 4.8 Importar os agentes do Homunculus v1

Módulo `homunculus-v1-agents`: traduz `phase`, `execution`, `injection`, `postProcess.extract/regex`, `conditions`, `companion` para o formato acima. Trackers inline do v1 viram `state` com um **schema deduzido** do bloco que extraíam (quando possível). Os que não couberem mostram um aviso do que ficou de fora.

### 4.9 Assistente da Biblioteca (ideia do Daniel, 2026-10-27 — **para executar depois**)

Um chat com uma IA que **cria e edita coisas da biblioteca por você**, no estilo do **VaultAssistant do Aventuras** (estudado no commit `d98ad752`, ver `docs/reference/aventuras.md` §2). Exemplos de pedido: "cria um tracker para o mundo com hora, clima e lugar", "cria um tracker por personagem do jeito que eu descrever", "melhora a descrição da Lyra", "faz uma entrada de lorebook sobre a guilda".

**O que o Aventuras faz e vale copiar** (a ideia, não o código):
- **Chat com streaming**, raciocínio dobrado e as **ferramentas que a IA usou** aparecendo como cartões na conversa.
- **Toda mudança é uma proposta**: a IA nunca salva sozinha; aparece um cartão com o "antes → depois", e o usuário **aprova, recusa ou edita** antes de aprovar (pode aprovar várias de uma vez).
- **As ferramentas veem a biblioteca "efetiva"**: o que está salvo + as propostas ainda não decididas + o que o usuário digitou e não salvou. Assim a IA não trabalha com dados velhos.
- **Ferramentas carregadas por categoria quando precisa** (`load_toolset`: personagens, lorebooks, cenários…), para o prompt ficar pequeno.
- **Abrir a partir de um editor** já focado naquele item (o registro do item vai junto, e só é reenviado se mudou).
- **Conversas salvas**: lista, renomear, continuar depois.
- **Configurações próprias**: perfil de API (vazio = o da história), modelo, temperatura, **esforço de raciocínio** (reasoning effort), corpo manual da requisição; o **system prompt é editável**. Limite de passos de ferramenta por mensagem (eles usam 50).

**Como entra no nosso desenho** (respostas do §13):
1. **Peça (§2)**: não é peça nova de dados — é um **agente**: gatilho `manual`, com **ferramentas** (`tools`), saída `proposal` (§4.1). Novo só o registro **"conversa do assistente"** (mensagens + propostas e o que foi decidido), guardado na biblioteca.
2. **Camada do setup (§3)**: as configurações do assistente (conexão/perfil, modelo, esforço, temperatura, prompt) ficam no **Padrão**; podem ser trocadas no próprio painel do assistente.
3. **Passo do turno (§6)**: nenhum — roda fora dos turnos, quando o usuário conversa com ele.
4. **Núcleo ou módulo (§8)**: módulo `library-assistant`. Cada tipo de item traz suas ferramentas (ex.: o módulo de trackers registra `list_trackers`, `read_tracker`, `create_tracker`, `update_tracker_fields`, `switch_on_in_session`).
5. **Preso à mensagem (§2.4)**: não; as propostas ficam presas à conversa do assistente. Ao aprovar, o item ganha uma entrada no **histórico** (§2.6), então dá para desfazer.
6. **Falha / custo / desfazer**: nada é salvo sem aprovação; erro de ferramenta aparece no cartão; tokens e custo por conversa visíveis; limite de passos; desfazer pelo histórico do item.

**Trackers pelo assistente** (pedido explícito do Daniel): o usuário descreve o que quer ("um tracker de mundo…", "um por personagem…") e a IA propõe **um tracker completo** — nome, instruções, campos com tipo, escopo (um valor / por personagem / por par), faixas, opções, travado, vai para o prompt. A proposta aparece **como no editor de trackers** (e com uma prévia de como fica no painel Scene); aprovar = salvar; botão extra "ligar nesta sessão". Continua valendo a regra: nada pronto no código — o assistente só **monta dados** a partir do pedido.

**Precisa antes**: (a) ✅ **perfis de conexão com nome** (feito 2026-10-28, D-020: endereço, chave no cofre, modelo, **esforço de raciocínio**, limites, reserva); (b) **ferramentas** dos agentes funcionando de verdade (fatia 5; hoje são só contrato); (c) saída `proposal` com tela de aprovar/recusar; (d) histórico dos itens da biblioteca (fatia 1). **Encaixe sugerido**: logo depois da fatia 5, junto da fatia 6 (trackers + painel Scene) — ver §10.

---

## 5. O prompt

### 5.1 Blocos

Um **Preset** é uma lista ordenada de **blocos** (papel system/user/assistant, posição na lista ou "a N mensagens do fim", liga/desliga).
- **Blocos de texto** do usuário (com macros).
- **Marcadores** preenchidos por módulos: card, persona, exemplos, histórico, World Info antes/depois, cast, cena atual, capítulos, estilo da história, instruções do papel, injeções dos agentes.
- Marcador ligado sem lugar no preset → **posição padrão** + aviso "colocado automaticamente — fixar no preset?". Nunca some em silêncio.
- Import do ST: `prompt_order` + prompts → blocos; teste compara nosso prompt com o do ST.
- **"Ver o prompt"** de qualquer mensagem (§2.4), mostrando de onde veio cada pedaço e quantos tokens.

### 5.2 Orçamento de contexto (faltava na v1)

O prompt tem um tamanho máximo. Quando não cabe tudo, **um gerenciador de orçamento** decide o que cortar, sempre do mesmo jeito e de forma visível:
- cada marcador tem **prioridade** e **teto** (ex.: World Info ≤ 25%, cena atual ≤ 800 tokens, capítulos ≤ 15%);
- o histórico de mensagens ocupa o que sobrar, das mais novas para as mais velhas;
- o que foi cortado aparece no "ver o prompt" ("3 entradas de lorebook ficaram de fora por falta de espaço").
Contagem de tokens: estimativa por modelo; exata quando o provedor informar.

### 5.3 Macros e estado

- Motor de macros com a mesma sintaxe do ST (`{{char}}`, `{{user}}`, `{{random}}`, `{{if}}`, variáveis…).
- **Macros de estado**: `{{state.world.time}}`, `{{state.relationships.Lyra.trust}}` — presets, agentes e lorebooks podem usar o estado do mundo.
- **Lorebook por estado** (extensão nossa): uma entrada pode exigir uma condição ("só se o lugar for a Taverna"). Sem condição, a ativação é idêntica à do ST.

### 5.4 Ordem para economizar (cache do provedor)

Provedores cobram menos quando o **começo** do prompt é igual ao da chamada anterior. O montador coloca primeiro o que muda pouco (instruções, card, persona) e por último o que muda sempre (cena atual, injeções, histórico recente) — ideia do Aventuras. É o padrão dos presets embutidos; presets importados do ST mantêm a ordem deles.

---

## 6. Um turno, do clique ao fim

**Tipos de geração**: `normal` · `swipe` (outra versão da mesma resposta) · `continue` (continuar a última) · `impersonate` (a IA escreve a *sua* fala) · `let them act` (turno sem fala do usuário) · `quiet` (só agentes, nada aparece no chat).

```
 1. Usuário envia (ou swipe / continue / impersonate / let them act / auto-play)
 2. resolveSetup(session)                  → preset, persona, agentes, trackers, conexões, limites
 3. BEFORE   (paralelo, agrupado por conexão)
      intercept → mensagem do usuário reescrita (revision)
      inject (+ tools) → textos para o prompt; Pathfinder escolhe entradas
      speaker  → em grupo, quem fala agora
 4. Lorebook scan (regras do ST + condições de estado)
 5. Montagem do prompt: blocos + orçamento de contexto (§5.2) + instruções dos agentes inline
 6. Resposta principal em streaming  ── PARALLEL roda junto
 7. Salva mensagem + generation record + reasoning; retira blocos inline → dados
 8. AFTER, onda 1 (sequência): rewrite, check (pode corrigir ou pedir nova geração)
    AFTER, onda 2 (paralelo):  state, note, choices, proposal
 9. Gatilhos não-turno: every N, state change, chapter end
10. Eventos → UI atualiza painel Scene, companions, botões de escolha, status e custo
```

Regras:
- **Só o passo 6 é fatal.** Agente que falha → a resposta fica, aviso visível, botão "tentar de novo".
- **Stop** cancela tudo do turno, inclusive agentes; o texto parcial fica (já existe).
- **Swipe** repete do passo 3. Setup decide se trackers rodam em todo swipe ou só quando a história continua.
- **Auto-play** tem limite de turnos e de custo, e para em qualquer erro.
- O turno é **uma peça do núcleo** (`TurnPipeline`), testável passo a passo com a IA offline (D-009).
- **Uma geração por sessão de cada vez**; sessões diferentes podem gerar ao mesmo tempo (ler uma enquanto outra gera).

---

## 7. Coisas que atravessam tudo (faltavam na v1)

### 7.1 Desempenho
- **Estado com "fotos" periódicas**: reconstruir o estado somando deltas desde a mensagem 1 fica lento em chats de milhares de mensagens. O núcleo guarda uma foto do estado a cada ~50 mensagens e soma só a partir dela (cache; pode ser recriado a qualquer momento).
- **Chat longo**: a tela só desenha as mensagens visíveis; avatares em miniatura.
- **Banco**: índices nas tabelas por mensagem; prompts antigos guardados comprimidos.

### 7.2 Segurança (conteúdo importado é desconhecido)
- **HTML vindo da IA ou de agentes** (os agentes de render do Daniel) roda **numa caixa isolada** (iframe sem acesso ao app nem à rede). Bonito, mas inofensivo.
- **Regex** com tempo máximo (regex mal feita não trava o app).
- Agentes importados **não executam código** — só prompts, schemas e regras. Código só em módulos.
- Chaves só no cofre (D-011); nunca em exportações.

### 7.3 Custo e limites
- Cada **Connection** tem: máximo de chamadas simultâneas, espera entre chamadas e **conexão reserva** (se a principal falhar, tenta a reserva — ideia do Marinara).
- Custo por mensagem, por agente e por sessão, quando o provedor informar preço/uso.
- Limite opcional de custo por sessão/auto-play.

### 7.4 Dados: backup e importação
- Backup automático do banco antes de atualizar (já existe, D-008) + **backup agendado** + "exportar tudo".
- **Importar a pasta inteira do SillyTavern/Homunculus v1** de uma vez (cards, personas, lorebooks, presets, chats), com relatório do que entrou e do que não entrou.

### 7.5 Testes
- Testes "iguais ao ST" para prompt e lorebook (mesma entrada → mesmo resultado).
- IA offline para testar turnos inteiros sem gastar tokens (já existe).
- Testes de clique na UI antes de entregar (D-007).

---

## 8. Onde cada coisa se encaixa

**Núcleo** (`packages/core`): dados e banco · eventos · `resolveSetup` · `TurnPipeline` · runner de agentes (gatilhos, dependências, ondas, limites) · estado por mensagem (+ fotos) · montador de prompt + orçamento · motor de macros · limites por conexão · pontos de extensão.

**Pontos de extensão**:
| Já existe | A criar |
|---|---|
| `registerAgent`, `registerMacro`, `registerPanel`, `registerSetting`, `registerProvider`, `registerCharacterImporter/Exporter` | `registerPromptBlock` · `registerTrackerSchema` · `registerFieldType` (tipo de campo novo no painel) · `registerAgentTool` · `registerAgentOutput` (saída nova, ex.: `media`) · `registerTrigger` · `registerImporter/Exporter` genéricos · `registerSetupField` |

**Módulos**:
| Módulo | Faz |
|---|---|
| `provider-openai` ✅ | IA compatível com OpenAI |
| `st-cards` ✅ | cards PNG/JSON V1–V3 |
| `personas` ✅ | personas, variantes (núcleo + telas); import do ST no módulo `st-personas` |
| `st-presets` ✅ | presets CC do ST (import/export, D-021) |
| `lorebooks` ✅ | ativação igual ao ST + condições de estado (núcleo `lorebook.ts`) + import/export (módulo `st-lorebooks`) — D-027 |
| `st-import` | importar a pasta inteira do ST/v1 |
| `scene` | trackers World/Characters/Plot + pacotes de campos + painel |
| `companions` | painel e notas |
| `homunculus-v1-agents` | importa os 69 modelos |
| `memory-chapters` | capítulos + marcador `chapters` — estudo das referências (amiga/Jev, Marinara, Summaryception) em `docs/MEMORY-PLAN.md` (29/10, nada aprovado) |
| `story-style` | pov/tense/length/tone + marcador |
| `roles` | coauthor/director, let them act, auto-play |
| `group-turns` | quem fala agora (ordens do ST + agente `speaker`) |
| `vault` | cenários e NPCs |
| `card-browser` | Chub, JannyAI, Wyvern… |
| `regex-render` | regex + HTML em caixa isolada |
| `guided` | correções e respostas guiadas |
| `style-reviewer` | contagem de repetições/ritmo + agente revisor + guia de estilo editável (§4.4) |
| `card-scripts` (depois) | scripts de card na caixa isolada, com permissão (§12) |
| `world-map` / `calendars` (depois) | mapa do mundo e calendários do v1 |
| depois | `recall` (embeddings em Rust), `pathfinder`, `conversation-mode`, `media`, temas |

---

## 9. Inventário do Homunculus v1 → Homunculus 2

| Funcionalidade do v1 | No H2 | Como |
|---|---|---|
| In-Chat Agents | ✅ | §4 + importação |
| Companions | ✅ | §4.6 |
| Pathfinder | ✅ depois | agente `inject` com ferramentas |
| Group Studio | ✅ | página da Story (D-029) |
| Modo Narrado + fichas do cast | ✅ | cast com narrador + `sheet` |
| Papéis, Let them act, auto-play | ✅ | `roles` |
| Painel Scene editável | ✅ | §4.5 |
| Group bar | ✅ | barra da sessão |
| Configurações do grupo que trocam ao abrir | 🔄 | **Setup em camadas** (§3) |
| Vault | ✅ | `vault` |
| Memória: capítulos | ✅ | `memory-chapters` |
| Memória: Recall | ✅ depois | `recall` |
| Card Browser, Quick Connection | ✅ | módulos |
| World Map, calendários | ✅ depois | `world-map`, tipo de campo data/hora |
| OOC blocks | 🔄 | tipo de mensagem `ooc` (§2.3) |
| Prompt inspector | 🔄 | "ver o prompt" de qualquer mensagem (§2.4) — aba **Reply** do inspetor (D-018) |
| Sampling parameter policy (parâmetros por modelo) | ✅ | na Connection |
| Geração que sobrevive a queda | ✅ | texto parcial já salvo; "retomar" depois |
| Chat archive | 🔄 | lixeira + busca |
| Home, temas, layouts, efeitos | ✅ fase de UI | base pronta (D-018): tokens, perfis de aparência, `data-region`; falta a tela Customize |
| Presets Homunculus, Hob, The Ninth Summoning | ✅ | conteúdo embutido |
| Guided generations | ✅ | `guided` |
| Prose Polisher | 🔄 | parte do **Style Reviewer** (§4.4) |
| Modo Conversa | ⏳ depois | módulo próprio |
| Card scripts com sandbox | ❓ | §12 |
| Extensões do ST, Quick Replies, slash commands | ❌ | módulos e agentes no lugar |
| Text Completion/instruct, Horde, Kobold, NovelAI | ❌ por ora | só Chat Completion (cobre nano-gpt, OpenRouter, servidores locais compatíveis) |

---

## 10. Ordem de construção (fatias de ponta a ponta)

Cada fatia termina com: testes passando, o Daniel testando no Windows, conferência contra este blueprint.

| # | Fatia | O Daniel consegue… |
|---|---|---|
| 0 | **Alinhar a fundação** (§11) | — (base certa) |
| **PoC** ✅ | **Prova de conceito** (feita 2026-10-27, D-016): uma sessão com um tracker **criado pelo usuário na tela** (qualquer campo), feito só de dados, painel mínimo editável, certo no swipe, registro do que o agente fez | ver o coração do desenho funcionando cedo; se houver furo, aparece aqui |
| 1 ✅ | Variantes de **Characters**; **Personas** com variantes + import do ST; histórico e lixeira (feita 2026-10-28, D-019) | Lyra fantasia/moderna; persona por sessão |
| 1b ✅ | **Configurações** + **perfis de conexão** com nome (feita 2026-10-28, D-020) (vários endereços/chaves/modelos, esforço de raciocínio, limites, reserva) — pedido do Daniel 2026-10-28; também é pré-requisito do §4.9 | escolher a conexão por sessão e por agente |
| 2 ✅ | **Presets por blocos** + macros + orçamento + import do ST + "ver o prompt" (feita 2026-10-28, D-021) | usar os presets do ST e ver o prompt exato |
| 3 ✅ | **Lorebooks** iguais ao ST + condições de estado — motor, import/export e prompt (2026-10-28, D-027; comparado com o código do ST) e telas (2026-10-29, D-028) | usar os lorebooks dele |
| 4 ✅ | **Stories + Vault (Narrators, NPCs)** + camada "story" do setup (2026-10-29, D-029); Kits ficaram para depois | histórias narradas com narrador e NPCs reutilizáveis; Director mode |
| 5 | **Agentes completos**: gatilhos, saídas inject/intercept/rewrite/check/choices, dependências, limites; import dos modelos do v1 | Prose Polisher, Don't write for user, CYOA em botões… |
| 6 | **Trackers + painel Scene** (World, Characters, Plot, pacotes RPG/Drama) | jogar com o painel Scene |
| 6b | **Assistente da Biblioteca** (§4.9) — chat que propõe e edita personagens, lorebooks, **trackers** etc.; perfil de API, modelo e esforço próprios | pedir "cria um tracker por personagem assim…" e aprovar |
| 7 | **Grupos e narrador**: cast completo, papéis, quem fala, let them act, auto-play, estilo | aventuras narradas |
| 8 | **Companions**, **memória** (capítulos, memória dos agentes), **proposals**, **Style Reviewer** | companions, capítulos, Story Director, revisão de estilo |
| 9 | **Vault**, **Card Browser**, Quick Connection, **importar pasta do ST/v1**, pacotes de campanha | trazer tudo do v1 de uma vez |
| UI ✅ | **Direção de UI "I"** adiantada (feita 2026-10-27, D-018): barra lateral Sessions/Library, inspetor Scene/Prompt/Reply com o "recibo", tokens + perfis de aparência | um app agradável de usar, que continua mudável |
| 10 | **Fase de UI** (tela Customize: perfis, layouts, efeitos, importar/exportar; tema Blood & Ink; Home; menu nativo) | o app bonito e do jeito dele |
| depois | Recall, Pathfinder, World Map, Modo Conversa, mídia | — |

---

## 11. O que muda no código que já existe (fatia 0) — ✅ FEITO em 2026-10-27

Conferido em 2026-10-27 contra `packages/schemas` e `packages/core`, e implementado no mesmo dia (D-015; detalhes em `ARCHITECTURE.md`). Ficaram para depois, de propósito: `check` com `fix` age como `warn` até existir o rewrite de correção (fatia 5); ferramentas e marcadores de prompt são só contratos (fatias 2 e 5); quem fala usa só a ordem natural ou o agente `speaker` (fatia 7).

| Hoje | Ajuste |
|---|---|
| `Session` com `presetId`, `personaId`, `lorebookIds`, `agents`, `settings` soltos | `setup: SetupLayer` (tudo opcional = herdar) + `storyId?` + `npcIds` |
| `CastMember` = `characterId`, `role`, `active` | + `variantId`, `presence`, `muted`, `sheet?` |
| `Persona` = nome + descrição | variantes, imagem (mesmo formato do Character) |
| `Message.speaker` + `meta` livre | + `kind` (user/direction/character/narrator/ooc/event) e `visibility`; `reasoning` à parte |
| `AgentDefinition` com `trigger` before/after/manual, só código | schema `AgentConfig` (dados): gatilhos, entradas, saídas, opções (§4.1) |
| `runAgents`: todos em paralelo, só grava delta | runner por fase e ondas, dependências, limites; tabelas `agent_runs`, `message_revisions`, `companion_notes`, `generation_records` |
| `ChatService.generate` chama agentes no fim | `TurnPipeline` (§6); `ChatService` passa a usá-lo |
| `WorldState.resolve` soma desde a mensagem 1 | + fotos periódicas (§7.1); dono por namespace |
| `PanelDefinition` = só namespace | `TrackerSchema` + tipos de campo |
| `ConnectionConfig` sem limites | + simultâneas, espera, reserva |
| `buildPrompt` v0 e `macros.ts` básico | ficam até a fatia 2 |

Nada é jogado fora: banco, estado por mensagem, árvore, cards, provedor, cofre e telas continuam. JSON validado (D-008) aceita campos novos sem migração; tabelas novas entram em migrations novas.

---

## 12. Decisões do Daniel sobre as perguntas em aberto (2026-10-27)

1. **Celular**: não joga no celular, mas **deixar a porta aberta**. Regra que garante isso: o núcleo e os módulos **nunca** dependem do Tauri nem da tela (já verificado por `architecture.test.ts`); tudo que é do Windows (banco, cofre, arquivos) fica atrás de interfaces pequenas. Assim o núcleo pode, um dia, rodar como servidor local acessado pelo navegador do celular.
2. **Card scripts** (cards cujas mensagens trazem HTML com `<script>`/`<iframe>`: telas de status animadas, mini-jogos, barras de vida dentro do chat — comuns em cards de algumas comunidades do Chub): não sabe se usa; **deixar viável**. Como o HTML já roda numa caixa isolada (§7.2), scripts de card viram uma opção dessa mesma caixa: desligados por padrão, ligados **por card com permissão do usuário**, sem acesso ao app nem à rede (o v1 faz parecido em `card-script-runtime.js`). Entra como módulo `card-scripts`, depois da fase de UI.
3. **Modelos locais**: não usa, mas **deixar aberto**. Já funciona com qualquer endereço compatível com OpenAI (LM Studio, KoboldCpp, Ollama, llama.cpp). Text Completion "de verdade" fica possível por `registerProvider` (um módulo novo, sem mexer no núcleo).
4. **Trackers**: **separados por padrão**, inline como opção para economizar. ✅

---

## 13. Regra para nunca perder a coesão

Antes de construir qualquer coisa nova, responder:
1. **Em que peça (§2) ela mora?** Peça nova entra no §2 primeiro.
2. **Em que camada do setup (§3) ela se configura?**
3. **Em que passo do turno (§6) — ou em que gatilho (§4.1) — ela age?**
4. **É núcleo ou módulo (§8)?** (Quase sempre módulo.)
5. **O que fica preso à mensagem (§2.4)?**
6. **Como ela falha, quanto custa, e como o usuário desfaz?** (§1, princípios 4 e 5)

Se alguma resposta for "não sei" ou "precisa de um jeitinho", **parar e ajustar o blueprint** com o Daniel.
