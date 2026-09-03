# Coloque aqui os PDFs dos seus planos de ensino

Um PDF por disciplina, com qualquer nome de arquivo. Depois, na raiz do projeto:

```bash
make planos           # mostra o que seria importado, sem escrever nada
make planos-aplicar   # grava os eventos no index.html
```

O importador lê o código, o nome, a modalidade e o ano de dentro de cada PDF —
você não precisa digitar nada.

**O PDF precisa ter texto selecionável.** Se for um scan (imagem), não há OCR
aqui: o importador avisa e pula o arquivo.

Os PDFs em si ficam fora do git (veja o `.gitignore` da raiz) — são documentos da
sua faculdade, não do projeto. Só este arquivo é versionado, para a pasta existir
depois do `git clone`.
