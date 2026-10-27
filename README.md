# Fonte Certa

Pesquisa de jurisprudência e legislação portuguesas nas fontes oficiais, com análise de cada acórdão face ao caso do utilizador.

Ana Marta Soares, Especialista em IA aplicada ao Direito

## Fontes

- Jurisprudência: bases jurídico-documentais da DGSI (IGFEJ), consultadas em tempo real.
- Tribunal Constitucional: sítio oficial do Tribunal.
- Legislação: 1.ª série do Diário da República, com as versões datadas de cada diploma, a partir do repositório aberto legalize-pt.
- Descritores oficiais: projecto IRIS do Supremo Tribunal de Justiça e do INESC-ID.

## Funcionamento

- `public/`: a app (instalável no computador e no telemóvel).
- `functions/api/fonte.js`: ponte para as fontes oficiais autorizadas; não recebe nem guarda dados do caso.
- `ferramentas/indice-legislacao.mjs` e `.github/workflows/legislacao.yml`: construção diária do índice de legislação.
- A análise com IA usa o Gemini com a chave do próprio utilizador, guardada apenas no navegador.
