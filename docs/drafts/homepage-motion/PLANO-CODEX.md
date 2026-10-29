# Home com movimento — rodada 2

Autor: **CODEX**, 29/10/2026. Rascunhos locais, sem integração, commit ou push. A rodada anterior permanece em `../homepage/`.

## Contexto e leitura crítica

Homunculus 2 é um app desktop Tauri/React para narrativas. Esta Home deve permitir escolher um mundo, retomar um chat específico e começar outra experiência. O pedido atual é explorar menus e animações com Apple Design; não implementar no app.

Revisão dos drafts anteriores, julgamento CODEX: a retomada é clara, mas quase todos os cliques terminam em diálogos explicativos. Isso impede experimentar a continuidade de navegação. A nova rodada terá Home → Story → chat, seleção com preview, menu contextual e criação temporária em memória. Retiram-se slogans, etiquetas decorativas e mensagens técnicas de dentro da interface proposta.

Skills aplicadas: apple-design, frontend-design, animate e design-taste-frontend. A última exclui telas de app no próprio escopo: aproveitam-se seu critério de composição, identidade e inspeção visual. Não se aplicam o piso de oito movimentos, vídeo obrigatório, sorteio de landing page, ausência de sidebar/glass ou tipografia de marketing; contrariam o pedido de Apple Design e o uso diário do painel. O produto tem prioridade.

O auxiliar `pick-ui-library` mencionado por animate não está no catálogo nem nas pastas locais pesquisadas. Não é necessário instalar outro pacote: menus usam Popover API nativa e a tarefa modal usa `<dialog>`, com foco/escape nativos e teclado de menu complementado. Sem componentes modais desenhados só com divs.

Referências lidas em apple-design: accessibility, layout, typography, color, designing-for-macos, motion, sidebars, menus, popovers, sheets, liquid-glass e cross-platform. Orientações aplicadas e citações curtas:

- `motion.md › Best practices`: “Add motion purposefully, supporting the experience without overshadowing it.” Movimento descreve mudanças, sem efeitos contínuos.
- `motion.md › Providing feedback`: “Let people cancel motion.” Novas ações interrompem transições; não há bloqueio até o fim da animação.
- `liquid-glass.md › The two layers`: “Content layer” / “Functional layer”. Texto e capas são sólidos; translucidez fica na navegação flutuante e menus.
- `designing-for-macos.md › Best practices`: “Handle keyboard shortcuts”. Navegação completa por teclado; Ctrl/Cmd+K abre a busca sem animação.
- `menus.md › Labels`: “write a label that clearly and succinctly describes it”. Comandos nomeiam a ação e usam a mesma linguagem no resultado.

Não é uma implementação de Liquid Glass nativo: é uma aproximação CSS em protótipo web. No Tauri, materiais e preferências nativos precisam de integração própria.

## Plano visual

Paleta semântica, claro / escuro: background `#f4f5f2` / `#191e1c`; surface `#ffffff` / `#242b27`; foreground `#24352c` / `#edf2ec`; secondary `#59665e` / `#b3c0b6`; accent `#34694f` / `#b5d4b5`; separator `#d7dfd5` / `#414e44`. Contrastes calculados pelo verificador e registrados no resultado, incluindo superfícies de navegação opacas que limitam a translucidez. Capas mantêm cores próprias e não carregam texto de controles.

Tipografia: sistema para controles, 13–15 px; Literata local para títulos narrativos, 28–38 px, e trechos, 15–17 px com entrelinha 1.7. Texto secundário mínimo de 12 px. Alvos desktop de pelo menos 28 px; 44 px em largura compacta. O texto pode quebrar; nunca se usa corte no conteúdo principal.

### D · Atelier

Galeria com sidebar recolhível. A assinatura é a capa que se transforma na abertura da Story e volta ao lugar.

```text
Regular: [sidebar] [toolbar                         +]
                  [Continue: capa | trecho + retomar]
                  [Stories: capa  capa  capa]
Compact: [toolbar/menu] [Continue] [Stories empilhadas]
```

### E · Lantern

Um espaço de leitura com navegação leve flutuando sobre a lateral do mundo da Story. A área de conteúdo continua sólida. A assinatura é a passagem entre mundo e menus, sem efeitos sobre a leitura.

```text
Regular: [navegação] [capa grande | último chat]
                    [Recentes em lista aberta]
Compact: [toolbar/menu] [capa + último chat] [Recentes]
```

### F · Workspace

Split view inspirado na seleção de documentos: lista de Stories à esquerda do preview. A assinatura é selecionar sem abrir uma janela ou perder a lista.

```text
Regular: [sidebar] [lista de Stories | preview + chats]
Compact: [toolbar] [lista] → [preview com voltar]
```

Crítica do plano: três simples trocas de cor repetiriam a rodada anterior. Por isso os drafts diferem em fluxo (galeria com abertura, leitura com navegação discreta, seleção/preview), compartilhando um vocabulário de movimento. Não se imitam semáforos de janela, marcas Apple ou controles de sistema falsos. O conteúdo vem do Homunculus: Story com vários chats, branch e última mensagem, Library/Vault e criação com modo de jogo.

## Contrato de movimento

Frequência/purpose: menu e sheet ocasionais = consistência espacial; abrir/voltar Story = evitar mudança brusca; seleção diária = indicação de estado muito discreta; pressão = feedback. Teclado e busca digitada = resposta imediata. Nenhum efeito autônomo em texto, capas em repouso ou ponteiro.

Tokens existentes reutilizados: `--ease-out: cubic-bezier(0.22,1,0.36,1)` do app; `--ease-in-out: cubic-bezier(0.77,0,0.175,1)`; `--dur-fast:160ms` e `--dur:280ms`. Extensão: menu 180 ms, mudança de conteúdo/capa 240 ms, drawer `cubic-bezier(0.32,0.72,0,1)` da skill animate. Sem curva aproximada ou biblioteca nova.

CSS transitions para press e seleção; CSS `@starting-style` e transições discretas para o popover; WAAPI para capa e sheet com cancelamento e saída simétrica. Transform/opacity são interpolados, com a exceção permitida pela skill animate: `clip-path` no enquadramento da capa. O recorte muda de proporção enquanto a ilustração mantém escala uniforme, evitando deformação. Dimensões dos clones são medidas uma vez antes da animação. Foco, interação e retorno permanecem disponíveis durante a transição.

Reduced motion remove deslocamento/escala e mantém opacidade curta. Reduced transparency usa superfícies opacas. Increased contrast reforça contornos e texto. O painel de revisão permite simular movimento reduzido; não é preferência nova dentro do produto.

## Estados, dados e limites

Estados para revisar: normal, biblioteca com 12 Stories, primeira visita sem histórias, busca sem resultados; loading/erro via painel de revisão. Exemplos fictícios reaproveitam nomes da rodada anterior. Criação, favoritos e desfazer só alteram memória temporária do protótipo; nenhum banco, API, arquivo pessoal ou credencial é lido.

Validação planejada: screenshots claro/escuro em desktop e compacto; overflow e contraste medidos; teclado em menus, escape, retorno de foco, atalhos instantâneos, abertura/saída de Story, criação e desfazer, interrupções rápidas e movimento/transparência reduzidos. O feel será conferido por capturas intermediárias, não inferido de uma imagem em repouso.

Assinado: **CODEX**.
