# UI-PLAN — Homunculus 2

Plano das telas **antes** de qualquer rascunho ou código (regra combinada com o Daniel em 28/10, ver PASSAGEM "🔒 REGRA NOVA DE UI").
Uma seção por painel. O Daniel aprova o texto → rascunhos com dados reais → código igual ao rascunho aprovado → um painel por vez.
Já feitos por essa regra: painel **Scene** ("C — Silencioso", D-025) e **editor de trackers** ("B", D-026). Os outros painéis (barra lateral, chat, Prompt, Reply, Library, Settings) ganham sua seção quando chegar a vez deles.

---

## Branches — CLAUDE, 29/10/2026 · ✅ aprovado e feito no app (D-032)
**Feito (29/10, 07h):** igual ao canvas "Homunculus 2 — Branches" (detalhes no PASSAGEM e em D-032). Diferenças pequenas: a lista não tem a lupa de busca ainda; a barra de ações aparece ao passar o mouse (na última mensagem fica sempre); nas mensagens do usuário a barra fica embaixo do balão.
**Respostas do Daniel (06:39):** marcador na mensagem: sim · apagar = **de vez** (sem Lixeira) · **árvore agora** · a pergunta do swipe foi explicada de novo · referência: a barra de ações da mensagem do Marinara. Rascunhos no canvas **"Homunculus 2 — Branches"**: (1) **Main** — barra de ações na mensagem (‹ 2/3 ›, Copy, Edit, New Version, **Branch from here**, Hide from the AI, Details | Delete), marcador "The story splits here · 2 branches ▸", seletor "⑂ Main ▾" com a lista (atual primeiro; nome, última frase, nº de mensagens, quando, de onde saiu; renomear, apagar; Show Tree, Make a Separate Chat); (2) **Tree** — o chat inteiro em árvore, caminho na tela em verde, "Every message | Only where it splits", à direita a mensagem escolhida com Go Here / Branch from here; (3) **Actions** — o pequeno formulário do Branch from here, apagar de vez (o branch na tela não pode), e onde aparece (barra lateral "⑂ 3", cartão do chat "3 branches", o marcador aberto). Tradução e busca do Marinara ficam de fora por enquanto (não existem no app).
**Para que serve:** tentar outro caminho numa conversa sem perder o original, e voltar a qualquer caminho depois. **Quando o Daniel olha:** quando uma resposta levou a história para um lado que ele quer testar diferente; quando quer guardar "o final bom" e "o final ruim".

### Como os outros fazem (código lido)
- **SillyTavern** (`public/scripts/bookmarks.js`): **Branch** num botão da mensagem = um **chat novo**, cópia até aquela mensagem (até de um swipe escolhido), chamado "<chat> - Branch #N"; a mensagem original guarda a lista dos branches (ícone). **Checkpoint** = branch com nome dado por você, com um ícone de link na mensagem e "Back to main chat". A árvore só aparece com a extensão Timelines (de terceiros).
- **Marinara** (`docs/chats/branches.md`, `chats.routes.ts` `POST /:id/branch`): **Branch from here** em qualquer mensagem copia o chat até ali (com swipes, estado dos trackers e memória). Na lista de chats, os branches de um chat são **uma linha só** com a contagem; em Chat Settings → **Chat Branches**: lista (o atual primeiro, nome e quando mudou), renomear, apagar, apagar todos, exportar (JSONL do ST, texto, Markdown), importar um JSONL como branch novo.
- **Aventuras:** ramos presos a checkpoints, sem lista de verdade (o Daniel acha limitado).

### Proposta para o Homunculus 2
O nosso chat já é uma **árvore** (swipes e caminhos são irmãos) e o **estado do mundo fica preso a cada mensagem**, então criar um branch **não copia nada** e os trackers de cada caminho já estão certos.
- **Na mensagem:** botão **Branch from here** (ícone de bifurcação, no menu da mensagem). Cria um branch com nome ("Branch 2", editável na hora) cuja ponta é essa mensagem, e a tela passa para ele. Você continua escrevendo dali.
- **Sinal na mensagem:** onde a história se divide aparece um marcador pequeno "⑂ 2 branches" (como o ícone do ST); clicar mostra os caminhos que saem dali.
- **Seletor no topo do chat** (ao lado do nome): "⑂ Main ▾" mostra a lista **Branches** — o atual primeiro, cada um com nome, última frase, nº de mensagens e quando mudou; clicar troca. Ali mesmo: renomear, apagar (só as mensagens que são só daquele caminho; pede confirmação), "Make a Separate Chat" (cópia como o ST/Marinara, para quem quiser o caminho num chat à parte).
- **Barra lateral:** um chat continua sendo **uma linha** (como o Marinara); se tiver branches, mostra "⑂ 3".
- **Swipe × branch:** o swipe continua sendo "outra versão desta resposta" (‹ 1/3 ›). Continuar a partir de um swipe antigo **já** cria um caminho novo hoje; com isso ele ganha nome automático e aparece na lista.
- **Story:** o cartão do chat na página da Story mostra "⑂ N branches".
- **Árvore (depois, se quiser):** uma vista em árvore do chat inteiro, como a extensão Timelines do ST.
- **Import/Export:** exportar o branch atual como JSONL do ST; importar um JSONL do ST como branch novo (o Marinara faz; o nosso import de chats do ST ainda não existe).

### Estados
Chat sem branches: nada aparece além do botão na mensagem. 10+ branches: a lista rola e tem busca. Branch apagado: as mensagens dele vão para a Lixeira junto? (pergunta 3).

### Perguntas abertas para o Daniel
1. Quer o marcador "⑂ N" **na mensagem** onde a história se divide, ou só a lista no topo?
2. Continuar a partir de um swipe antigo deve virar um branch com nome sozinho, ou só quando você clica "Branch from here"?
3. Apagar um branch: vai para a Lixeira (dá para voltar) ou apaga de vez?
4. A vista em árvore entra agora ou depois?

---

## Stories v4 — CLAUDE, 29/10/2026 · 🟡 rascunho, esperando o Daniel
**Atualização 05:55 (Daniel): manter vários chats dentro da Story.** A Story é o molde (setup próprio); cada chat herda e pode mudar algo só para ele ("changed in this chat" / "Use the story's"). Rascunhos novos no canvas **"Homunculus 2 — Stories"**: Main (página da Story com a seção Chats em cartões, Continue + New Chat), StoryNew, NewChat (abertura, nome, "Same as the story" / "Change for this chat…"), ChatInStory (aba Prompt mostrando "from the story" e "changed in this chat"). O texto abaixo (V1–V3, "uma Story = uma partida") ficou superado no ponto das sessões; o resto (setup override-only, trackers e agentes na criação) continua.
Motivo: a fatia 4 no app ficou diferente do rascunho aprovado (sem Setup na página, criação sem trackers, Sessions numa coluna confusa) e o Daniel decidiu **Story = uma partida** (como o Aventuras). Rascunhos: canvas "Homunculus 2 — UI mockups", fileira "Stories v4" (StoryNew, StoryPage, StoryPlaying).

### V1. New story (folha por cima do app)
- **Para que serve:** criar uma Story já pronta para jogar, com o setup dela. **Quando:** "+" em Stories ou "Turn into a Story" num card.
- **Primário:** "How do you want to play?" (3 cartões) e "Start from" (card / vazia / Assistant "Later"). **Secundário (coluna direita):** This story's setup (Preset, Connection, Agents connection, You play as), Trackers (marcar + conjunto de campos), Agents.
- Cada linha do setup mostra **"Default · <valor>"** até ser trocada (do Aventuras: "override-only"); "×" volta ao Default.
- Estados: sem cards → "Start from" só tem "Empty story"; sem trackers → "No trackers yet · Library → Trackers"; sem agentes → texto curto (hoje sempre).
- Rodapé: Ready to play (Narrator, Opening, Connection, N trackers) · Cancel · Create Story.

### V2. Página da Story (antes de jogar)
- Barra: nome · Duplicate · More… · **Start Story**. Cabeçalho: capa, nome (Literata), cenário curto, "Not started · Made from your card…".
- Esquerda: **Cast** (Narrator + Change…, NPCs + New NPC / From the Vault, Characters + Add a Card), **How it starts** (Scenario, Opening 1–4 + "+").
- Direita: **How you play** (Player / Co-author / Director), **Setup**, **Trackers**, **Agents**, **Lore**.
- **Sem Sessions.** Salva sozinha (como hoje).

### V3. A mesma página com a Story em andamento
- Botão principal vira **Continue**; status "In progress · N messages · last played …" + última frase; "Changes here apply from the next reply"; as aberturas avisam que já foram usadas.
- **Duplicate** = outra Story com o mesmo setup e começo, sem mensagens.
- Barra lateral: uma linha por Story com a última frase; clicar abre a conversa; na conversa, o título da Story abre esta página.

### Do Aventuras / Marinara (código lido)
- Aventuras `Story.settings` (`src/lib/types/index.ts`), `SetupWizard.svelte`, docs `story-settings.md` (override-only), `story-list.md`.
- Marinara `ChatSetupWizard.tsx` (`ROLEPLAY_STEPS`, `renderAgents` por categoria), `types/chat-preset.ts` (settings profiles = Kits).
- Diferente: uma folha só em vez de 5–9 passos (o rascunho aprovado era uma folha); trackers e agentes já na criação.

### Perguntas abertas
1. Os rascunhos estão certos? (principal)
2. Dados antigos: sessão 2 do Isekai RPG vira "Isekai RPG (2)"? (proposta)
3. Na conversa de uma Story, os trackers e o setup também aparecem na aba Prompt do inspetor (como num chat) ou só na página da Story?

---

## Stories e Vault (fatia 4) — CLAUDE, 29/10/2026 · ✅ **no app em 29/10 (D-029)**
**O que entrou no código (29/10, manhã):** barra lateral = busca, **Library** e **Vault** (destinos), **Stories** e **Chats** com a última frase; Library e Vault com **abas** no topo; Library → Characters = **grade de cartões + ficha ao lado** (Chat Now / Edit / Turn into a Story / Export; Edit abre o editor de sempre); Vault → Stories / Narrators / NPCs no mesmo formato (Narrator e NPC: a ficha já é o editor, com Save); **página da Story** (How you play: Player / Co-author / Director · Narrator: do Vault, um card ou escrito para ela + "Save to the Vault" · People: NPCs com editor no lugar, "+ Add an NPC from the Vault", "+ Add a card", "Make a Copy" · How it starts: Scenario + aberturas · Lore · About · Sessions à direita; salva sozinha) e **Play** (escolhe a abertura quando há mais de uma); **New story** = "How do you want to play?" (Narrated adventure / Write it together / **Director mode**) + "Turn a card into a story"; chat 1:1 → "Who is in this story" ganhou **NPCs in this chat**; sessão de Story tem "‹ <Story>" para voltar. **Ficou de fora (de propósito, sem inchar):** Kits, "Turn into an NPC" no Play (precisa da IA preencher a ficha), "When and where it starts", Assistant do Vault (fatia 6b), pastas/etiquetas no Vault, retrato de NPC.
Rascunhos: canvas "Homunculus 2 — Campanhas e camadas", página "Stories e Vault". Decisões do Daniel na PASSAGEM (29/10, 03:00).

### S1. Barra lateral
- **Chats** (1:1, como hoje) · **Stories** (atalhos para as pastas; cada uma com as sessões) · **Library** (+ **Vault**, + **Kits**). Dois níveis no máximo.

### S2. Vault (três colunas + assistente)
- **Pastas (esquerda):** busca; "All NPCs", "All Worlds", "Not in a story" (soltos); depois uma pasta por Story (um nível só; etiquetas agrupam). "+ New Story".
- **Pasta aberta (meio):** cabeçalho com o nome (fonte de leitura), de onde veio, **Assistant**, **Play**, "…" (Rename, Tags, Duplicate, Export, Move to Trash). Partes: **Narrator**, **World** (texto + estado inicial com os campos do Scene: World, vazios aparecem tracejados), **NPCs** (grade de cartões: retrato, nome, "raça, classe, nível", uma linha), **Lore**, **Characters** (cards), **Start** (aberturas, quem começa na cena), **Setup** (resumo + "Apply a Kit…"), **Sessions**.
- Clicar num item abre o editor no lugar, com "‹ pasta" para voltar.
- **Estados:** pasta vazia → cada parte com um convite curto ("People who live in this story…") e "Ask the Assistant"; cheia → NPCs em grade com busca; itens novos do assistente com borda tracejada + "New".

### S3. Assistente do Vault
- Painel à direita, "Working in: <pasta>", conexão própria. Cria **propostas** (nada salvo): Keep/Discard por item, Keep All/Discard All no topo; sugestões de próximo passo em botões.

### S4. Ficha de NPC
- Retrato (clique para pôr imagem), nome, linha "raça, classe, nível", onde mora e onde mais é usado ("edits here reach both"), "Fields" (conjunto do Scene: Characters), **Make a Copy for This Story**, History, Move to Trash.
- Seções do conjunto (About, Fantasy, Appearance, Stats); clique no valor para editar; Health/Mana como barras; vazios em cinza. Campos de "Now" não ficam na ficha.

### S5. Play
- Nome (sugere "<Story>, session N"), como começa (abertura × continuar do fim de uma sessão), quem está na 1ª cena (NPCs e cards), e para cada card **Use the card as it is / Turn into an NPC** (+ conexão), persona, **Start Session**.

### S6. Chat 1:1 com NPC
- Aba Scene → "In the room": o card + NPCs ("Card"/"NPC", de qual pasta), "+ NPC from Vault" (busca, agrupado por pasta, "Already here"), "+ New NPC…".

### Rodada 3 (29/10, aprovada para rascunho): canvas página "Stories (v3)"
- **S2 muda:** abrir uma Story mostra a página no estilo do 1º rascunho (Cast com Narrator/NPCs/Characters, Sessions, How it starts, Lore, Setup com "Your role"). O "World" sai: Scenario (premissa) + "When and where it starts" (opcional) ficam em How it starts; lore só na lorebook.
- **S7. Story nova:** "How do you want to play?" (Narrated adventure / Write it together / Quick test; Assistant; Turn a card into a story; Start from scratch) + Ready to play. Inspirado em `renderGuide()`/`readyChecks()` do `classic-group-studio.js`.
- **S8. Narrators no Vault:** lista + ficha (Instructions, Style: POV/Tense/Length/Tone, May bring in new NPCs, Turn instruction e "What the AI gets" recolhidos; Duplicate, History, Restore Original no Simple Narrator). Do v1: narrador "card" ou "builtin" de `classic-group-campaign.js` (`narrator.type`, `style`, `turnPrompt`).
- **S9. Escolher narrador:** do Vault / um card seu / escrever só para esta Story.
- Vault = Stories, Narrators, NPCs. Library = Characters, Personas, Presets, Lorebooks, Trackers, Kits. Scenario reaproveitável: depois (por agora "Duplicate Story").

### Do v1 / Aventuras
- v1: Group Studio (`classic-group-studio.js`), narrador e fichas (`classic-group-campaign.js`), "How the story starts" (`classic-group-start.js`), Vault (`classic-vault.js`).
- Aventuras: Vault + VaultAssistant (`ai/vault/InteractiveVaultService.ts`, "effective vault" = salvo + pendente).
- Diferente: tudo de uma Story numa pasta só; NPC é ficha com os campos do tracker (o Scene já sabe mostrar e atualizar).

### Perguntas abertas
1. Origem dos valores: A (etiquetas) ou B (escada)? (página antiga do canvas)
2. "Turn into a Story" no Isekai RPG: os 4 chats antigos ficam como chats (proposta) ou viram sessões da Story?
3. Retrato do NPC: só imagem que você põe, ou o assistente pode sugerir (fatia de mídia, depois)?

---

## Lorebooks (fatia 3) — CLAUDE, 28/10/2026 · ✅ **feito em 29/10 (D-028)**: o Daniel escolheu o rascunho **A** e pediu o "Where it goes" menor (virou um botão de escolha numa linha)

**Ajustes depois, a pedido do Daniel (29/10, D-028):** "Where it goes" com 5 tipos com desenho e cor + Before/After (rascunho "LorePlaceKinds" B); linhas fechadas sem palavras-chave; atalhos na linha fechada (menu rápido do lugar, com "N back / As" para o chat; botão Always on discreto); salva sozinho (sem botão Save nem aviso); faixa **Global Lorebooks** no topo da página (como o "Active World(s) for all chats" do ST); botão "‹ sessão" para voltar quando o livro foi aberto pela sessão; **Find and Replace** (Ctrl+H, como no Notepad++). Consertos: piscada ao fechar entrada, cursor pulando para o fim / Ctrl+Z.

O motor já funciona (D-027): ativa as entradas exatamente como o SillyTavern (comparado com o código do próprio ST em 3.200 turnos aleatórios), importa/exporta arquivos do ST e os lorebooks embutidos nos cards. **Falta a tela.** São cinco lugares; o principal é o editor (L1).

### L1. Library → Lorebooks (lista + editor do livro)
- **Para que serve:** criar, importar e editar lorebooks; ver de onde cada um veio e quem usa.
- **Quando o Daniel olha:** ao importar do ST, ao escrever lore nova, e quando uma entrada "não entrou" e ele quer saber por quê.
- **Forma:** a mesma das outras páginas da Library (lista à esquerda, editor à direita; `LibraryPages.tsx`).

**Lista (esquerda)**
- Primário: nome do livro, número de entradas.
- Secundário: de onde veio ("do card da Mira", "arquivo do ST") e quem usa ("Mira · 2 sessões · Default").
- Botões no topo: **+ New Lorebook**, **Import** (vários arquivos de uma vez; JSON do ST ou card JSON), busca.

**Editor do livro (direita)**, de cima para baixo:
1. **Cabeçalho:** nome (clique para renomear), descrição curta, "Used by…" (personagens, personas, sessões, Default — clicáveis), botões **Export for SillyTavern**, **Duplicate**, **Move to Trash**, **History**.
2. **Barra da lista de entradas:** busca (título, palavras-chave e texto), filtro (Todas / Ligadas / Sempre ativas / Com condições), ordenar (como no ST / por ordem / A–Z), **+ New Entry**, e **"Testar"** (ver L1b).
3. **Lista de entradas** — cada entrada é um cartão que abre e fecha (como os campos no editor de trackers "B"):
   - **Fechado** (primário, uma linha só): chave liga/desliga · título (ou a 1ª palavra-chave) · palavras-chave como etiquetas (ou "Always on") · onde entra em poucas palavras ("Before the character", "In the chat · 4 back · as User", "Examples (top)", "Outlet: secrets") · tamanho em tokens. Etiquetas pequenas só quando existem: `75%`, `sticky 3`, `cooldown 5`, `group: places`, `only Lyra`, `⚑ conditions`, `↻ no recursion`.
   - **Aberto** (secundário, na ordem em que a gente pensa numa entrada):
     1. **Text** — caixa grande com fonte de leitura, tamanho em tokens, macros `{{char}}` `{{user}}` funcionam.
     2. **Keywords** — palavras-chave principais (etiquetas; `/regex/` aceito, com aviso se a regex for inválida) e "Also needs" (secundárias) com a lógica escrita como frase: *"and any of"* / *"and all of"* / *"but not all of"* / *"and none of"*. Chave **Always on** (constant).
     3. **Where it goes** — os 8 lugares do ST agrupados em **5 tipos com desenho e cor próprios** (Character, In the chat [+ profundidade + papel], Examples, Author's Note, Outlet [+ nome]) e **Before | After** ao lado quando o tipo tem dois lados (rascunho "LorePlaceKinds" B, escolhido em 29/10), e **Order** (número; "higher = later and wins the budget first").
     4. **More** (escondido, fechado por padrão; cada linha com "?"): chance (%), grupo (nome, prioridade, peso, pontuação), tempo (sticky, cooldown, delay), recursão (não ativa outras / não é ativada por outras / só na recursão nível N), ignora o orçamento, quantas mensagens ler, maiúsculas, palavra inteira, ler também (persona, descrição, personalidade, nota de profundidade, cenário, notas do criador), só para personagens/tags (ou todos menos), tipos de geração.
     5. **Conditions** (nosso; fechado por padrão) — "Only when the world state…": linhas *campo de tracker · condição · valor*, escolhendo o campo numa lista dos trackers (ex.: "Scene: World → Location · is · Tavern"), e "all / any".
   - Arrastar pelo ⋮⋮ muda a ordem **de exibição** (o `displayIndex` do ST), não a ordem no prompt (essa é o campo Order) — escrever isso no "?".
- **Escondido (só ao pedir):** campos que só existem para o ST (vectorized, automation id) ficam em "More" com nota "SillyTavern only".

**L1b. Testar ("Try it")** — painel que desliza por cima da lista: uma caixa "Type a few lines of chat" (já preenchida com as últimas mensagens da sessão aberta mais recente) e o resultado ao vivo: quais entradas entrariam, **por quê** ("keyword: castle", "always on", "recursion, keyword: Silver Fox") e quais ficariam de fora e por quê ("lost its 30% chance", "budget full", "another entry of the group won", "world state doesn't match"). Usa o motor de verdade. *Ideia nova, não existe no ST — ver pergunta 3.*

**Estados**
- Vazio (nenhum livro): texto curto + **Import from SillyTavern** + **New Lorebook**; explicar em 1 frase o que é um lorebook.
- Livro vazio: "No entries yet" + **+ New Entry**.
- Cheio: livros de 300+ entradas (comuns no ST) — lista virtualizada, busca rápida, cartões fechados de uma linha; textos de 2–4 linhas no cartão fechado **não aparecem** (só no aberto). Palavras-chave demais: mostrar 4 etiquetas + "+7".
- Importando: barra de progresso por arquivo; aviso com o que não entrou (ex.: entradas "vectorized", formatos Agnai/Risu/NovelAI).
- Erro: regex inválida marcada na etiqueta; entrada sem palavra-chave e sem "Always on" avisada ("This entry never activates").

**Do v1 (= o editor de World Info do SillyTavern, `public/scripts/world-info.js`, `#world_popup`, `.world_entry`)** e o que muda:
- Igual: todos os campos e nomes de posição; a lista de entradas que abre e fecha; busca e ordenação.
- Diferente: no ST o cabeçalho fechado tem ~10 controles lado a lado (posição, profundidade, ordem, %, estratégia…) — fica ilegível. Aqui o fechado mostra **só o que se lê de relance**, e o resto vai para o aberto, agrupado por pergunta (o que diz? quando entra? onde entra? o resto). As configurações globais do ST (profundidade de leitura, orçamento…) saem do editor do livro e vão para Settings (L4).

### L2. Ligar livros (personagem, persona, sessão, Default)
- **Editor do personagem e da persona:** uma linha **Lorebooks** com os livros ligados como etiquetas (× tira), **+ Add** (escolher da lista) e o do card marcado "from the card". Clicar numa etiqueta abre o livro (L1).
- **Sessão:** na aba **Prompt** do inspetor, um grupo **Lorebooks**: os que valem nesta sessão, com a origem ("from Lyra", "from your persona", "Default", "this session") e chaves para ligar/desligar os da sessão e somar outros.
- **Default:** Settings → Defaults → "Lorebooks for every session".
- Do v1: no ST isso fica espalhado (botão do globo no personagem, "Chat Lore" no menu do chat, lista global no topo do World Info, persona no Persona Management). Aqui é sempre a mesma linha de etiquetas.

### L3. O que entrou nesta resposta (aba Reply + Preview Prompt)
- **Aba Reply:** grupo **Lorebooks · N entries** (fechado quando N > 5): título · livro · motivo ("keyword: castle", "sticky") · tokens; embaixo, discreto, **Left out · M** (motivo de cada uma) e a linha do orçamento ("312 of 8,192 tokens"). Clicar numa entrada abre ela no editor.
- **Preview Prompt:** já mostra as partes "Lorebooks" na ordem do prompt (feito); acrescentar o mesmo grupo de L3 no painel da esquerda.

### L4. Settings → Lorebooks (configurações de leitura)
- Os 12 ajustes globais do ST com os mesmos padrões (ler 2 mensagens, orçamento 25% do contexto, recursão ligada, palavra inteira ligada, nomes no texto lido, personagem primeiro…), cada um com "?". Em linguagem simples: "Read the last **2** messages", "Lorebooks may use up to **25%** of the context".
- Do v1: igual aos controles do topo do World Info do ST, só que fora do editor do livro.

### Perguntas abertas para o Daniel
1. Os ajustes de leitura (L4) valem para o app todo (como no ST) ou você quer poder mudar **por sessão/campanha** (fatia 4)?
2. Lorebook embutido no card: aparece também na lista geral (L1), marcado "from Mira's card" — ou só dentro do personagem?
3. Quer o **"Try it"** (L1b)? É a forma mais rápida de entender por que uma entrada não entrou.
4. No chat, quer um sinal **na própria mensagem** de que lorebooks entraram (ex.: no recibo embaixo da resposta: "· 3 lore") além da aba Reply?
5. Tem algum lorebook seu grande do ST (ou do v1) que eu possa usar nos rascunhos? Preciso de acesso à pasta `data/default-user/worlds` (o pedido de acesso foi bloqueado nesta sessão).
