# Homunculus — Home e menus, rodada 2

Autor: **CODEX**, 29/10/2026. Local / não publicado. Nenhum commit, push ou alteração no código do app.

## Abrir e experimentar

Abra **`home-motion-drafts.html` diretamente no Chrome ou Edge**. É um arquivo único, offline, com fontes, scripts, ilustrações e licença da Literata incorporados. Os fontes separados são `index.html`, `styles.css` e `app.js`. Reempacotar: `node docs/drafts/homepage-motion/build.mjs`.

As abas D/E/F ficam na barra de revisão, fora do produto:

- **D · Atelier:** galeria; uma capa acompanha a entrada na página da Story e volta à Home.
- **E · Lantern:** leitura em primeiro plano; navegação discreta e menus próximos da ação.
- **F · Workspace:** seleção e prévia sem sair da lista; Chats e Setup ficam no painel de detalhes.

Experimente o **+** da toolbar, o **menu de uma capa**, **abrir uma Story e voltar**, **Ctrl/Cmd+K**, criar uma Story temporária e **Undo**. No F, selecione Stories e alterne **Chats / Setup**. Na barra de revisão, teste a biblioteca cheia, primeiro uso e movimento reduzido. Claro/escuro acompanha a preferência do navegador/sistema.

Tudo usa dados fictícios. Criar, duplicar, pin/unpin, adicionar um chat ou escrever uma mensagem só afeta memória temporária do protótipo. Import seleciona apenas o nome de um arquivo, sem ler seu conteúdo. Recarregar reinicia os exemplos. Nenhum banco, instalação pessoal, API ou credencial foi acessado.

## O que orientou esta rodada

**Apple Design:** sidebar e toolbar familiares, superfícies de conteúdo opacas, materiais discretos apenas na navegação e menus, um diálogo por tarefa, foco e teclado. A aplicação é Tauri/Windows; este protótipo CSS não implementa os materiais nativos da Apple nem imita controles de janela de macOS.

**frontend-design:** Literata nos títulos narrativos, sistema nos controles, a hierarquia Story → vários chats como princípio de organização. A diferença entre drafts está no fluxo de navegação, além da composição.

**animate:** feedback breve, origem espacial legível e saída simétrica; atalhos e busca sem animação. Os tokens de easing do projeto foram reutilizados. Press 120 ms, seleção 160 ms, menu 180 ms, capa 240 ms, sheet 280 ms e saída 200 ms. A capa usa recorte e escala uniforme para preservar a ilustração.

**design-taste-frontend:** composição, identidade, crítica de screenshot e redução de acessórios. Seu workflow de landing pages foi adaptado ao escopo de app: não foi usado sorteio de direção, piso de oito animações, vídeo obrigatório ou proibição de sidebar/glass. Os motivos e referências Apple estão no [plano](PLANO-CODEX.md).

Os SVGs de capa são ilustrações CODEX reutilizadas da primeira rodada. Sem fotografias externas, dependências novas ou geração de imagens nesta rodada. Fontes Literata mantêm a licença original em `assets/Literata-LICENSE.txt` e no HTML portátil.

## Verificação e limites

`node docs/drafts/homepage-motion/verify.mjs`: passou com os fontes separados. A versão portátil final passou com `HOME_MOTION_FILE=home-motion-drafts.html`.

- 18 combinações de layout: D/E/F × 1440/900/390 px × claro/escuro. Estados adicionais: cheio, primeiro uso, carregando, erro com recuperação e busca sem resultados. Sem overflow horizontal ou imagens quebradas.
- Contraste dos pares semânticos de texto/superfície: mínimo **4,76:1**. Cálculo com os valores hex reais das superfícies sólidas; não é uma auditoria de cada pixel composto sobre translucidez/imagens.
- Menu nativo: setas, Escape, retorno de foco e abertura por teclado imediata. Sheet por teclado e busca Ctrl+K também imediatos.
- Abertura/volta da capa: frames medidos com duração de 240 ms; inspeção da captura intermediária. Outra navegação cancela a transição e limpa os clones. Sem animação de width/height/margin/top/left.
- Criação temporária e desfazer, pin/unpin e desfazer; split view com setas, filtro, tabs e voltar na largura compacta.
- Movimento reduzido do sistema e da barra de revisão: apenas opacidade nas transições de conteúdo, sem viagem da capa. Preferência de transparência reduzida e contraste aumentado emulada no Chrome: navegação opaca, sem blur, com contorno de seleção.
- Zero erros de JavaScript/console. Capturas em `previews/`; resultado detalhado em `validation.json`.

Inspeção visual: D/E/F em desktop claro; E em desktop escuro; D compacto escuro; F em 900 px e compacto claro; menu aberto e transição no meio do caminho. Revisão CODEX: **Good** para este protótipo. Ponto forte: a navegação agora pode ser percorrida, com retorno claro. Melhorias ainda possíveis: testar a densidade e os títulos com conteúdo autorizado por Daniel, e decidir se a duplicação entre lista de Stories da sidebar e lista do Workspace merece ser removida na integração. As iniciais de personagens continuam substituindo retratos não fornecidos.

Não foram medidos FPS ou fluidez no Tauri nativo. A sensação final de ritmo deve ser julgada abrindo o HTML, repetindo entradas/saídas e cancelando rápido; screenshot isolado não demonstra fluidez. Não foram executados testes do app porque nenhuma tela de produção foi alterada. Nenhuma conclusão de conformidade HIG integral, VoiceOver ou dispositivos reais é afirmada.

Assinado: **CODEX**.
