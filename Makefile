# Atalhos locais do projeto. Nada aqui vai para o deploy: a raiz não pode ter
# package.json (a Vercel passaria a tratar o site como projeto Node), então o
# lugar dos comandos curtos é aqui.

IMPORTADOR := tools/import-plano
PASTA      ?= planos
PORTA      ?= 8000

.PHONY: ajuda planos planos-aplicar zerar servir testes deps

## ajuda: lista os comandos disponíveis
ajuda:
	@grep -E '^## ' $(MAKEFILE_LIST) | sed 's/^## /  make /'

## planos: lê todos os PDFs de planos/ e mostra o que entraria no calendário
planos: deps
	@node $(IMPORTADOR)/import-plano.js --dir $(PASTA)

## planos-aplicar: o mesmo, mas grava os eventos novos no index.html
planos-aplicar: deps
	@node $(IMPORTADOR)/import-plano.js --dir $(PASTA) --apply

## zerar: esvazia eventos e disciplinas do index.html (pede confirmação)
zerar:
	@node $(IMPORTADOR)/limpar-dados.js

## servir: abre o site em http://localhost:8000
servir:
	@echo "Abra http://localhost:$(PORTA) — Ctrl+C para parar." && python3 -m http.server $(PORTA)

## testes: roda as checagens no Chrome headless
testes:
	@bash tools/rodar-testes.sh $(PORTA)

deps:
	@test -d $(IMPORTADOR)/node_modules || \
		(echo "Instalando dependências do importador..." && cd $(IMPORTADOR) && npm install)
