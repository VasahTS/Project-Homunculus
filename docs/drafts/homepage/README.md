# HomePage — estudos de composição

Autor: **CODEX** · 29/10/2026. Trabalho local, não publicado. Protótipo separado do app; sem commit ou push.

**Arquivo para revisão: `home-drafts.html`** — HTML único com estilos, scripts, ilustrações e fontes incorporados. Abra diretamente no navegador; pode ser copiado sozinho. Não precisa instalar, iniciar o Tauri nem configurar uma conexão. `index.html`, `styles.css` e `app.js` são os fontes separados da mesma versão. Alternativa: `node docs/drafts/homepage/serve.mjs` na raiz do projeto inicia um servidor local em `http://127.0.0.1:4492`. A barra superior em português pertence à revisão; a interface proposta continua em inglês, como o app. Licença da Literata em `assets/`.

## Leitura do projeto

Referências lidas: `README.md`, `PASSAGEM.md`, `docs/BLUEPRINT.md`, `docs/UI-PLAN.md`, `docs/ARCHITECTURE.md`, `apps/desktop/src/App.tsx`, `ui/Sidebar.tsx`, `ui/kit.tsx`, `ui/Vault.tsx` e `theme/`.

O Homunculus 2 é um app Tauri/React, com Graphite, verde discreto, Literata e navegação Library/Vault/Stories/Chats. Hoje o estado sem sessão aberta oferece somente “No session open”. O blueprint já reserva uma Home para a fase de UI. As propostas não alteram as telas aprovadas pelo Daniel nem atribuem ao CODEX o trabalho preexistente do CLAUDE.

## Plano do painel

- Finalidade: retomar um chat, abrir uma Story ou começar algo novo. Consultado ao abrir o app sem conversa ativa ou ao voltar para Home.
- Primário: Story e chat exatos que serão retomados, com último trecho; ação Continue. A Story continua sendo o molde de vários chats.
- Secundário: demais Stories, chats 1:1 e caminhos para Library/Vault. Abrir a Story mostra seus chats; Continue abre um chat específico.
- Sob demanda: criação, seleção de personagem, importação e configurações. Setup e trackers permanecem nas telas existentes.
- Estados no protótipo: primeiro uso, uso normal, biblioteca cheia com 12 Stories e títulos longos, carregando, erro com recuperação e busca sem resultados. Busca filtra os exemplos de Stories pelo título, trecho e modo.
- Ações simuladas: alternar propostas/estados, buscar, filtrar a biblioteca, abrir a Story, escolher chat, continuar, começar Story/chat, importação e atalhos. Os diálogos explicam o destino; não implementam editores nem geração de IA.
- Herança do projeto: hierarquia do Sidebar, distinção Story/chat e identidade Literata/verde. A nova entrada Home e suas composições são propostas. A/B conservam uma família escura; C explora papel e verde. São layouts alternativos, não perfis instalados.
- Questões para a próxima revisão: qual hierarquia favorece o uso diário; se Home deve abrir sempre ou apenas sem chat ativo; se a direção clara C deve existir como perfil opcional.

## As três propostas

**A · Retomar (recomendação inicial):** o último chat ocupa o destaque, com Story, nome do chat, branch e trecho. Demais Stories em lista e ações de criação ao lado. Pouca mudança conceitual em relação ao app atual.

**B · Biblioteca:** capas ilustradas e uma estante de Stories; abrir a Story e continuar um chat são ações distintas. Melhor para reconhecer mundos pela imagem e alternar entre várias histórias. Filtros All / In progress / Not started.

**C · Refúgio:** composição editorial, papel e verde; menos elementos, lista de retomada e criação discreta. Usa mais espaço para leitura e introduz uma direção clara opcional.

## Dados e limites

Todos os nomes, números e trechos são fictícios, identificados como tal na barra de revisão. Nenhum banco pessoal, chat, personagem ou credencial foi acessado. As ilustrações vetoriais são originais deste protótipo (CODEX); as iniciais de personagens substituem retratos não fornecidos. São exemplos mais densos que o modo offline do app, mas não substituem validação futura com os dados que Daniel autorizar.

O pedido atual autoriza drafts HTML. A integração ao React permanece dependente da escolha/revisão do Daniel. A regra local de planejar a hierarquia foi aplicada neste documento; não foi feita implementação de tela no app.

## Validação

`node docs/drafts/homepage/verify.mjs`: **PASS**, usando Playwright com Chrome instalado em contexto isolado, sem perfil pessoal. A mesma verificação também passou com `HOME_DRAFT_FILE=home-drafts.html`, confirmando o arquivo único entregue.

- 45 combinações: três propostas × larguras de 1440, 900 e 390 px × cinco estados. Sem overflow horizontal no documento ou conteúdo principal.
- Sem erros de JavaScript ou console. Fonte carregada do próprio protótipo.
- Verificados: retomar chat, abrir Story e escolher chat, busca positiva/sem resultados, filtro de Stories não iniciadas, biblioteca com 12 Stories, recuperação de erro, diálogos de criação/importação/navegação, barra lateral estreita e respeito a redução de movimento.
- Capturas em `previews/`: três propostas nas três larguras, primeiro uso em desktop e B com biblioteca cheia. Inspeção visual de A/B/C em desktop e A estreita; títulos e trechos quebram sem truncamento do conteúdo principal.
- Validação restrita ao protótipo HTML. O app React/Tauri e seus testes não foram alterados ou executados.
- O navegador integrado não alcançou a prévia HTTP em loopback neste ambiente; o servidor de revisão foi encerrado. A entrega usa o HTML aberto diretamente do disco, validado no Chrome.

Autoria das notas, ilustrações e arquivos novos: **CODEX**.
