# Arquitetura

Notas de quem for mexer no código. O `README.md` explica **o que** o projeto faz;
aqui está o **porquê** de algumas decisões que não são óbvias no código.

## Princípio geral

Site estático puro: HTML + CSS + JavaScript vanilla, sem build e sem dependência
de runtime. Publicar é copiar três arquivos para qualquer host.

Isso funciona **porque não existe `package.json` na raiz**. A Vercel (e outros
hosts) decidem se o repositório é "site estático" ou "projeto Node" pela presença
desse arquivo. O importador tem o `package.json` dele, isolado em
`tools/import-plano/`, e nunca é carregado pelo navegador.

Idioma do projeto e dos comentários de código: **português**.

## Os dados

Dois blocos JSON dentro do `index.html`, lidos pelo `script.js` no boot:

```html
<script type="application/json" id="events-data"> [ ... ] </script>
<script type="application/json" id="disc-meta">   { ... } </script>
```

Ficam embutidos (e não em `.json` separados) para o site funcionar aberto em
`file://`, sem servidor: um `fetch()` de arquivo local seria bloqueado pelo CORS.

O calendário é desenhado em tempo de execução a partir desses dados — adicionar
um compromisso é adicionar um objeto no array.

`FERIADO` é uma **pseudo-disciplina**: feriados usam a mesma estrutura de evento,
com um registro próprio em `disc-meta`. O importador cria esse registro sozinho
quando encontra o primeiro feriado.

## EAD ≠ AED

Duas siglas parecidas que significam coisas diferentes, e confundi-las quebra a
contagem de frequência:

- **EAD** é a *modalidade da disciplina* (campo `modalidade` em `disc-meta`).
  Presença = entregar a atividade no Moodle/AVA. Muda o rótulo do botão de falta
  para "Não entreguei" e joga a matéria no grupo EAD do painel.
- **AED** (Atividade Externa à Disciplina) é um *tipo de evento*
  (`"type": "aed"`). É uma avaliação específica e **não conta como encontro**
  para frequência.

## Frequência

- O teto é `Math.floor(total * 0.25)`, porque `(total - faltas) / total >= 0.75`
  equivale a `faltas <= total * 0.25`.
- A contagem usa **datas únicas** de encontro, não a contagem de eventos: aula e
  prova da mesma matéria no mesmo dia são **um** encontro e **uma** falta. Sem
  isso o teto inflava (11 em vez de 9 numa das disciplinas).
- As matérias EAD contam módulo/semana do cronograma, porque os planos EAD não
  listam as tarefas do Moodle uma a uma. O contador de 25% é deliberadamente
  conservador: uma disciplina cuja regra real é por carga horária pode ter
  direito a uma falta a mais do que o painel mostra.

## Persistência

Três chaves de `localStorage`, sem backend e sem conta de usuário:

| chave | conteúdo |
| --- | --- |
| `calendarioMaterias.theme` | tema claro/escuro |
| `calendarioMaterias.doneDays` | dias marcados como concluídos |
| `calendarioMaterias.missedClasses` | faltas, por `eventKey` |

`eventKey` é `` `${date}|${disc}|${type}|${title}` `` — ou seja, **editar o
título de um evento perde a falta marcada nele**. É o preço de não ter id
estável nos dados; em compensação os eventos continuam legíveis à mão no JSON.

Todo acesso ao storage é dentro de `try/catch`: o navegador pode ter storage
desabilitado, e aí o site funciona normalmente, só sem memória.

## Detalhes de CSS que custaram trabalho

- **Chip de falta**: `box-shadow: inset 0 0 0 999px var(--missed-veil)`. A sombra
  interna pinta por cima do fundo mas **atrás do texto**, então escurece o chip
  preservando o matiz da matéria e a legibilidade. `filter: brightness()` /
  `saturate()` foram tentados primeiro e falharam — deixavam o chip cinza (não dá
  para saber de qual matéria é a falta) e apagavam o texto.
- **Borda de dia de prova**: `conic-gradient`, com a variável `--exam-grad`
  definida por célula no JS. É o que permite mostrar as cores de várias
  disciplinas na mesma borda quando há mais de uma prova no dia.
- **Cabeçalho da semana** mostra `DOM SEG TER QUA QUI SEX SÁB`, não as iniciais.
  `D S T Q Q S S` é ambíguo (dois S e dois Q); as abreviações de 3 letras cabem
  mesmo em tela de 320px ("Dom" ocupa 28px numa coluna de 39px).
- **3 chips por dia** em qualquer largura: piso `.day { height: clamp(80px,
  15.5vw, 132px) }` mais regras específicas na faixa 481–679px. O caso apertado é
  o chip de prova, que tem borda de 2px.

## O importador (`tools/import-plano`)

- `extract-pdf.js` — usa `getTextContent()` do `pdfjs-dist` lendo x/y de
  `item.transform[4]` e `[5]` para remontar as linhas por coordenada
  (`Y_TOLERANCE = 2.5`). A extração **posicional** é obrigatória: bibliotecas que
  achatam o texto perdem a separação entre as colunas da tabela do cronograma. Em
  Node, `getDocument()` precisa de `{ data: Uint8Array }`, não do caminho.
- `plano-header.js` — lê código, nome, modalidade e ano do cabeçalho "Detalhes da
  Disciplina". A modalidade não tem campo próprio no plano: o sinal é a sigla
  `EAD` aparecer em algum lugar do documento (no nome da disciplina ou na
  metodologia).
- `parse-cronograma.js` — reconhece `10/ago`, `dd/mm/aaaa`, `11 de agosto de
  2026` e intervalos "26 a 29/10". PDFs reais frequentemente colam várias linhas
  do cronograma numa só linha extraída, por isso o parser acha **todas** as datas
  da linha e fatia o conteúdo entre elas. Itens ambíguos ("Devolutiva da
  Avaliação P1") vão para a lista REVISAR MANUALMENTE e nunca entram sozinhos.
- `merge-html.js` — troca só os dois blocos JSON, via regex ancorada nos ids.
  Separa em novos / já existem / conflitos e **nunca sobrescreve um conflito**.
  `serializeDiscMeta` grava todos os campos de cada disciplina (serializar só
  `name`/`color` apagava `modalidade` no `--apply` seguinte).

## Testes

`make testes` sobe um servidor local e roda `tools/test-*.html` no Chrome
headless. As páginas carregam o `index.html` **real** num `<iframe>` same-origin
e escrevem uma linha `PASS`/`FALHOU` por checagem em `#result`.

Detalhe que aparece ao escrever teste novo: **`const` de topo em script clássico
não vira propriedade de `window`**, então não dá para injetar estado de fora — os
testes semeiam o `localStorage` e **recarregam o iframe**. Declarações de
`function`, essas sim, viram propriedade de `window`, e é por isso que
`frequenciaPorDisciplina()` é acessível dos testes.
