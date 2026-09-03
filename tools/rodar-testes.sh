#!/usr/bin/env bash
# Roda as páginas de teste num Chrome headless e resume o resultado.
# As páginas carregam o index.html real num <iframe>, por isso precisam de um
# servidor HTTP: em file:// o iframe seria de outra origem e o teste não
# conseguiria ler o conteúdo dele.
set -uo pipefail

PORTA="${1:-8000}"
RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

CHROME=""
for c in google-chrome google-chrome-stable chromium chromium-browser; do
  if command -v "$c" >/dev/null 2>&1; then CHROME="$c"; break; fi
done
if [ -z "$CHROME" ]; then
  echo "Chrome/Chromium não encontrado — instale um dos dois para rodar os testes." >&2
  exit 1
fi

cd "$RAIZ"
python3 -m http.server "$PORTA" >/dev/null 2>&1 &
SERVIDOR=$!
trap 'kill $SERVIDOR 2>/dev/null' EXIT

# espera a porta responder em vez de dormir um tempo fixo
for _ in $(seq 1 50); do
  curl -sf -o /dev/null "http://localhost:$PORTA/index.html" && break
  sleep 0.1
done

falhou=0
for pagina in test-frequencia test-faltas; do
  dom=$("$CHROME" --headless --no-sandbox --window-size=1200,900 \
        --virtual-time-budget=8000 --dump-dom \
        "http://localhost:$PORTA/tools/$pagina.html" 2>/dev/null)

  resultado=$(printf '%s' "$dom" | tr '\n' '\001' \
    | sed -n 's/.*<pre id="result">\(.*\)<\/pre>.*/\1/p' | tr '\001' '\n')

  passou=$(printf '%s\n' "$resultado" | grep -c '^PASS' || true)
  erros=$(printf '%s\n' "$resultado" | grep -c '^FALHOU' || true)

  if [ "$erros" -gt 0 ] || [ "$passou" -eq 0 ]; then
    falhou=1
    echo "✗ $pagina — $passou PASS, $erros FALHOU"
    printf '%s\n' "$resultado" | grep '^FALHOU' | sed 's/^/    /'
  else
    echo "✓ $pagina — $passou PASS"
  fi
done

exit "$falhou"
