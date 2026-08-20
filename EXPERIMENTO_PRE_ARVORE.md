# Rotina Family Cliente — base experimental pré-árvore

Esta branch congela o último estado do Cliente imediatamente anterior ao rollout que introduziu o bloqueio comercial ligado à nova árvore de famílias.

- Branch: `experimento-pre-arvore-2026-08-20`
- Commit-base: `3e53129a9c3fdb9eb8a9c55a727b0730d5f572b5`
- Linha de corte: antes de `c21d68a6d8bfac2e3d8a1a4bdc4510a63f0fb9f4` (`Add commercial access v3 rollout workflow`)
- Não incluir nesta base: `commercial-access-client.js`, entrypoints comerciais/rate-limit novos nem alterações posteriores de cache ligadas ao rollout comercial até que o restante do aplicativo seja validado.

Objetivo: testar e recuperar o funcionamento já existente do Rotina Family sem a regressão introduzida pelo conjunto árvore + bloqueio comercial.

O branch `main` não deve ser usado como referência de estabilidade durante estes testes.
