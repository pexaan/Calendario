# 📅 Calendário das Matérias — 2026/2

Calendário acadêmico interativo para acompanhar **aulas, avaliações e Atividades Externas à Disciplina (AED)** de agosto a dezembro de 2026, em uma única página web.

Tudo roda em um só arquivo `index.html`: **sem build, sem instalação e sem dependências** — basta abrir no navegador.

---

## ✨ O que ele faz

- **Visão de 5 meses** (agosto → dezembro de 2026) em grade de calendário, com fins de semana e feriados destacados.
- **Detalhes por dia**: toque em qualquer dia marcado para abrir um painel com todos os compromissos daquela data.
- **Filtro por disciplina**: a legenda funciona como interruptor — desligue uma matéria e ela desaparece do calendário.
- **Destaque de avaliações**: dias de prova ganham borda colorida; quando há mais de uma prova no mesmo dia, a borda mostra as cores de todas as disciplinas envolvidas.
- **Marcar dia como concluído**: risque os dias que já passaram e acompanhe seu avanço.
- **Modo claro e escuro**, com troca em um clique.
- **Memória local**: tema e dias concluídos ficam salvos no navegador (`localStorage`), então continuam lá quando você voltar.
- **Feito para celular primeiro** (layout responsivo, áreas de toque grandes).

## 📚 Disciplinas incluídas

| Código | Disciplina |
| --- | --- |
| `FIT1620` | Teologia, Ciências Exatas e Tecnológicas |
| `CMP2303` | Projeto de Banco de Dados |
| `CMP1024` | Governança em Tecnologia da Informação |

> **Status:** 3 de 5 planos de ensino já carregados. Faltam 2 matérias para o semestre ficar completo.

## 🚀 Como usar

Clone o repositório e abra o arquivo:

```bash
git clone git@github.com:pexaan/Calendario.git
cd Calendario
xdg-open index.html      # Linux
# open index.html        # macOS
```

Ou simplesmente dê um duplo clique em `index.html`.

## 🧱 Como foi construído

- **HTML + CSS + JavaScript puro** (nenhum framework).
- Os dados ficam embutidos na própria página, em dois blocos `<script type="application/json">`:
  - `#events-data` — a lista de compromissos (128 registros: 99 aulas, 20 avaliações, 6 AEDs e 3 feriados);
  - `#disc-meta` — nome e cor de cada disciplina.
- O calendário é desenhado em tempo de execução a partir desses dados, então **adicionar um evento é só adicionar um item no JSON**.

### Formato de um evento

```json
{
  "date": "2026-08-11",
  "disc": "FIT1620",
  "title": "Apresentação da turma",
  "type": "aula"
}
```

| Campo | Descrição |
| --- | --- |
| `date` | Data no formato `AAAA-MM-DD` |
| `disc` | Código da disciplina (precisa existir em `#disc-meta`) |
| `title` | Texto exibido no dia e no painel de detalhes |
| `type` | `aula`, `avaliacao`, `aed` ou `feriado` |

## 🗺️ Próximos passos

- [ ] Incluir as 2 disciplinas restantes quando os planos de ensino saírem
- [ ] Exportar as datas para `.ics` (Google Calendar / Outlook)
- [ ] Contagem regressiva para a próxima avaliação

---

Projeto pessoal de organização acadêmica, feito por **Pedro Terra**.
