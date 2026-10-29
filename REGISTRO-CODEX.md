# Registro de trabalho — CODEX

## 2026-10-29 · Rodada 2: Apple Design, navegação e movimento

Autor: **CODEX**. Estado: local / não publicado, sem commit ou push. Pedido de Daniel: outros drafts com apple-design, frontend-design, design-taste-frontend e animate, com foco na experiência de menus.

Arquivos novos em `docs/drafts/homepage-motion/`: `PLANO-CODEX.md`, `LEIA-ME.md`, `index.html`, `styles.css`, `app.js`, `build.mjs`, `verify.mjs`, `home-motion-drafts.html`, `validation.json`; fontes e licença Literata e quatro SVGs em `assets/`; capturas em `previews/`. SVGs CODEX reutilizados da rodada 1, com indicação nos arquivos; copyright original da fonte preservado. Nenhum trabalho preexistente do CLAUDE foi atribuído ao CODEX. Rodada anterior preservada.

Três drafts: D Atelier (galeria e transição da capa), E Lantern (leitura e navegação discreta), F Workspace (lista e preview). Popovers e dialog nativos, atalhos imediatos, mudanças temporárias com desfazer, teclado e variantes de acessibilidade. O workflow de landing page de taste foi adaptado ao pedido explícito de Apple Design para app; a justificativa está no plano.

Validação: `node --check docs/drafts/homepage-motion/app.js`; verificador Playwright/Chrome passou para fontes separados e para o HTML portátil final. 18 combinações de layout/cores por execução, estados adicionais, sem overflow/imagens quebradas/erros de JavaScript. Contraste mínimo dos pares semânticos sólidos: 4,76:1. Verificados foco/setas/Escape, atalhos sem animação, criação e Undo, pin e Undo, split view/tabs/filtro, cover transition/cancelamento, reduced motion, reduced transparency e contraste aumentado. Capturas em repouso e intermediária inspecionadas. Não medido FPS ou comportamento nativo Tauri. Nenhum banco, instalação pessoal, API ou credencial acessado; nenhuma tela do app foi implementada. Assinado: **CODEX**.

## 2026-10-29 · Drafts de HomePage do Homunculus 2

Autor: **CODEX**. Estado: local / não publicado, sem commit ou push.

Pedido: olhar o projeto e sugerir um HTML com alternativas para a tela inicial do app, confirmado por Daniel.

Arquivos novos: `docs/drafts/homepage/index.html`, `styles.css`, `app.js`, `LEIA-ME.md`, `verify.mjs` (verificação isolada), `serve.mjs` (prévia em loopback); recursos locais da fonte Literata e respectiva licença em `assets/`; capturas em `previews/`; este registro. Três propostas independentes da aplicação atual: A Retomar, B Biblioteca, C Refúgio. Os dados são fictícios; não houve acesso à instalação pessoal, ao banco do app nem a credenciais. Fontes copiadas das dependências já presentes; autoria original da Literata preservada na licença. Nenhum trabalho preexistente do CLAUDE foi atribuído ao CODEX.

Arquivo adicional de entrega: `docs/drafts/homepage/home-drafts.html`, versão única que incorpora CSS, JavaScript, fontes e ilustrações dos fontes separados.

Validação: `node --check docs/drafts/homepage/app.js` e `node docs/drafts/homepage/verify.mjs` passaram, tanto para `index.html` quanto para `home-drafts.html`. Playwright + Chrome em contexto isolado: 45 combinações por arquivo (3 propostas, 3 larguras, 5 estados), sem overflow horizontal ou erros de console/JavaScript; verificação das ações de busca, filtro, Story/chat, retomada, criação/importação e navegação simuladas, recuperação de erro, sidebar estreita e redução de movimento. Inspeção visual das capturas desktop A/B/C e A estreita. Testes do app não executados: nenhum código de aplicação foi alterado. A prévia HTTP não ficou acessível no navegador integrado; servidor encerrado, entrega pelo HTML local. Assinado: **CODEX**.
