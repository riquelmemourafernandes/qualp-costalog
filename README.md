# QualP Costalog 1.0

Sistema web para planejamento de rotas de veículos pesados e estimativa de custos de transporte rodoviário no Brasil.

> **Status:** MVP em evolução. A integração de roteamento está implementada no backend, mas exige uma chave do provedor. A base local de pedágios começa vazia e não deve ser tratada como base nacional completa.

## Funcionalidades

- Cálculo de combustível por distância, consumo e preço por litro.
- Catálogo persistente de caminhão, carreta, LS e rodotrem.
- Histórico de estimativas no PostgreSQL.
- Planejamento de rota pelo perfil `driving-hgv` do OpenRouteService, com geometria, distância e duração.
- Consulta de praças/tarifas locais com coordenadas, categoria veicular, fonte e validade.
- Cadastro de praças/tarifas protegido por `ADMIN_API_TOKEN`.
- API documentada em `/docs`.

## Iniciar com Docker

1. Copie `.env.example` para `.env`.
2. Configure `OPENROUTESERVICE_API_KEY` com uma chave do OpenRouteService no ambiente do backend. A chave deve permanecer no servidor.
3. Defina um valor forte e privado para `ADMIN_API_TOKEN` se for cadastrar pedágios pela API.
4. Execute `docker compose up --build`.
5. Frontend: http://localhost:5173
6. API e documentação: http://localhost:8000/docs

Sem a chave de roteamento, o sistema continua permitindo cálculos manuais, mas a rota real retorna um aviso de configuração ausente.

## Rotas da API

- `POST /api/v1/routes/plan`: recebe origem e destino; retorna rota HGV, geometria GeoJSON, distância, duração e pedágios que correspondam a tarifas locais vigentes.
- `POST /api/v1/routes/calculate`: calcula combustível e pedágios a partir dos valores informados.
- `GET /api/v1/routes/history`: histórico persistido.
- `GET /api/v1/vehicles` e `POST /api/v1/vehicles`: catálogo de veículos.
- `GET /api/v1/tolls`: praças e tarifas cadastradas.
- `POST /api/v1/tolls`: cadastro de praça e tarifas; exige cabeçalho `X-Admin-Token`.

## Cadastro auditável de pedágios

Cada tarifa deve conter categoria veicular, valor, início/fim de vigência e fonte. O sistema não inventa tarifas. A API de rotas só mostra praças que estejam na base local, próximas ao traçado e com tarifa vigente. Uma base vazia ou incompleta não significa que não existam pedágios no caminho.

## Importar tarifas oficiais

O importador CSV está em `backend/app/importers/import_tolls_csv.py`. O arquivo deve ter as colunas `name, highway, state, latitude, longitude, vehicle_category, amount_brl, valid_from, valid_until, source_name, source_url`. Execute `python -m app.importers.import_tolls_csv arquivo.csv` com `DATABASE_URL` apontando para o PostgreSQL/PostGIS correto. O importador valida datas, coordenadas, valores, campos obrigatórios e ignora tarifas duplicadas. Use apenas dados cuja fonte e vigência possam ser comprovadas.

## Publicar na Vercel

- Importe o repositório e defina **Root Directory** como `frontend`.
- Build: `npm run build`; output: `dist`.
- Configure `VITE_API_URL` com a URL pública da API FastAPI, sem barra final.
- Hospede a API e o PostgreSQL/PostGIS separadamente. Na API, configure `CORS_ORIGINS`, `DATABASE_URL`, `OPENROUTESERVICE_API_KEY` e, se necessário, `ADMIN_API_TOKEN`.
- Nunca coloque chaves privadas em variáveis `VITE_*`.

## Limitações importantes

- A qualidade do roteamento depende do provedor e dos dados cartográficos; valide restrições de altura, peso, eixo, carga perigosa, obras e regras locais antes de operar.
- A geometria da rota pode ser exibida no mapa, mas tarifas só são confiáveis se a base local tiver sido preenchida e conferida contra fontes oficiais.
- Não há, neste repositório, importação nacional automática de tarifas oficiais pronta para uso. É necessário importar e auditar dados de cada concessionária/agência, respeitando suas condições de uso.

## Stack

- Frontend: React, TypeScript, Vite, Leaflet.
- API: Python, FastAPI, HTTPX, SQLAlchemy.
- Banco: PostgreSQL + PostGIS.
- Execução local: Docker Compose.
