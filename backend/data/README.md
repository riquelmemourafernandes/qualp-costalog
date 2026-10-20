# Importação de pedágios — QualP Costalog

A base de pedágios deve ser carregada com dados confirmados em fontes oficiais. Não inclua valores estimados nem datas de vigência presumidas.

## Arquivo CSV

Use o arquivo `toll_rates_template.csv` como modelo. Cada linha representa uma tarifa de uma praça para uma categoria veicular. Se uma praça tiver tarifas para várias quantidades de eixos, informe uma linha para cada categoria conforme a tabela oficial.

Campos:
- `name`: nome oficial da praça
- `highway`: rodovia (ex.: BR-116 ou SP-055)
- `state`: UF
- `latitude` e `longitude`: coordenadas da praça
- `vehicle_category`: categoria oficial de cobrança, incluindo eixos/rodagem quando necessário
- `amount_brl`: tarifa em reais
- `valid_from`: início da vigência no formato AAAA-MM-DD
- `valid_until`: fim da vigência no formato AAAA-MM-DD; deixe vazio se a fonte não informar data final
- `source_name`: órgão regulador ou concessionária
- `source_url`: endereço público exato da tabela oficial

## Como importar

1. Configure `ADMIN_API_TOKEN` no serviço da API do Render.
2. Abra o QualP Costalog e localize o painel **Base de pedágios**.
3. Informe o token administrativo e selecione o CSV.
4. Clique em **Importar base de pedágios** e confira a mensagem de resultado.

A importação rejeita colunas obrigatórias ausentes, datas/valores inválidos e coordenadas fora do Brasil. Tarifas duplicadas são ignoradas.

## Fontes oficiais

- ANTT — páginas de concessões, tarifas e localização de praças: https://www.gov.br/antt/pt-br/assuntos/rodovias/concessionarias/lista-de-concessoes
- ARTESP — pedágios e tarifas de rodovias concedidas em São Paulo: https://www.artesp.sp.gov.br/artesp/setor-regulado/rodovia/pedagios

## Atenção

A existência de uma praça na base não garante, por si só, que a tarifa cadastrada esteja atualizada. Confirme a vigência na fonte oficial antes de importar. Uma base incompleta nunca deve ser interpretada como confirmação de que não há pedágios na rota.
