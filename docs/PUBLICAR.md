# Publicar versões do Homunculus (e mandar para o testador)

Para o Daniel. Autor: CLAUDE, 2026-10-29 (D-037). Repositório: <https://github.com/VasahTS/Project-Homunculus>.
O passo 1 é **uma vez só**; depois, cada versão nova é o passo 2.

## Branches

- **`dev`** — o dia a dia. O Claude e o CODEX trabalham aqui; cada Push roda os testes.
- **`main`** — o que o testador recebe. Só recebe a `dev` quando estiver boa para mandar.

## Passo 1 — Ligar a pasta e o atualizador (uma vez)

1. Clique duas vezes em **`Preparar atualizador.bat`**. Ele:
   - liga esta pasta ao GitHub, na branch `dev` (seus arquivos ficam onde estão);
   - cria a chave que assina as versões e abre a página do GitHub para guardá-la.
2. Na página que abriu (**New secret**):
   - **Name:** `TAURI_SIGNING_PRIVATE_KEY`
   - **Secret:** Ctrl+V (a janela preta já copiou)
   - **Add secret**
3. **Guarde uma cópia** da pasta `C:\Users\danie\.homunculus` (pendrive ou nuvem). Ela tem a chave secreta. Se perder, quem já instalou o app não recebe mais atualizações automáticas.
4. No **GitHub Desktop**: **File → Add local repository…** → a pasta `Homunculus2` → **Add repository**.
   Resumo: **Liga o atualizador** → **Commit to dev** → **Push origin**.

## Passo 2 — Publicar uma versão (toda vez)

1. (Opcional) Em `CHANGELOG.md`, uma seção `## 0.2.0` com o que mudou — é o texto do “What’s New” no app. O Claude pode escrever.
2. Levar a `dev` para a `main`, no GitHub Desktop:
   **Current branch → main** → **Branch → Merge into current branch… → dev → Merge** → **Push origin** → volte para **dev**.
3. No site: [Actions → Publicar versão](https://github.com/VasahTS/Project-Homunculus/actions/workflows/release.yml) → **Run workflow** → *Use workflow from:* **main** → digite a versão (`0.1.0` na primeira vez, depois `0.1.1`, `0.2.0`…) → **Run workflow**.
4. Espere o ✓ verde (a primeira vez leva uns 20 minutos; depois, uns 10). Ele roda os testes, cria o instalador, assina, publica em [Releases](https://github.com/VasahTS/Project-Homunculus/releases) e leva o número da versão para a `dev`.
5. No GitHub Desktop (na `dev`): **Fetch origin → Pull origin**.

Quem tem o app instalado vê a faixa **“Homunculus 0.2.0 is ready”** na próxima vez que abrir (ou em até 6 horas, se estiver aberto).

### Qual número usar

- Só correções: o último número (`0.1.0` → `0.1.1`).
- Coisa nova: o do meio (`0.1.1` → `0.2.0`).
- Nunca repita nem volte um número — o workflow recusa.

## Passo 3 — Mandar para o testador

Mande o link do [guia do testador](https://github.com/VasahTS/Project-Homunculus/blob/main/docs/TESTAR.md). Ele explica como instalar, atualizar e avisar de problemas (pelas [Issues](https://github.com/VasahTS/Project-Homunculus/issues)).

## Se algo der errado

- **✗ vermelho no Actions:** clique nele e no passo vermelho. As mensagens do Homunculus começam com ✖ e dizem o que fazer. Se não entender, mande o print para o Claude.
- **“Falta o segredo TAURI_SIGNING_PRIVATE_KEY”:** refaça o passo 1, item 2.
- **“Falta a chave pública em tauri.conf.json”:** a `main` ainda não tem o commit “Liga o atualizador” — faça o passo 2, item 2.
- **“Escolha a branch main”:** no Run workflow, *Use workflow from* tem que ser **main**.
- **Os testes falharam:** nada foi publicado; o testador não vê nada. Peça ao Claude para olhar.
- **GitHub Desktop pede Pull antes do Push:** **Pull origin** e depois **Push origin**.

## E o resto continua igual

- `Abrir Homunculus.bat` (rodar do código) e a sua versão portátil de jogar não mudam e não procuram atualizações.
- `Criar instalador.bat` ainda funciona para um instalador local, sem os arquivos do atualizador.
