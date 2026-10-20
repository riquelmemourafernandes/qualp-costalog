# QualP Costalog 1.0

Sistema interno para estimar rotas, pedágios e custos operacionais de transporte rodoviário no Brasil.

> **Status:** MVP inicial em desenvolvimento. Os valores de pedágio e as rotas ainda precisam de fontes verificadas antes de uso operacional.

## Objetivos

- Calcular estimativas de combustível a partir da distância, consumo e preço por litro.
- Cadastrar veículos e suas características operacionais, com persistência no PostgreSQL.
- Registrar e consultar o histórico das estimativas quando o banco estiver conectado.
- Manter praças e tarifas de pedágio com fonte e vigência.
- Exibir rota e pontos de pedágio em um mapa.
- Guardar histórico e permitir auditoria dos valores calculados.

## Stack

- Frontend: React, TypeScript, Vite, Leaflet.
- API: Python, FastAPI, SQLAlchemy.
- Banco: PostgreSQL + PostGIS.
- Execução local: Docker Compose.

## Iniciar com Docker

1. Copie `.env.example` para `.env`.
2. Execute `docker compose up --build`.
3. Frontend: http://localhost:5173
4. API e documentação: http://localhost:8000/docs

## Publicar o frontend na Vercel

- Importe este repositório na Vercel e defina **Root Directory** como `frontend`.
- Framework: Vite; comando de build: `npm run build`; diretório de saída: `dist`.
- Configure `VITE_API_URL` com a URL pública da API FastAPI (sem barra final). Essa variável é incorporada durante o build.
- Na API, configure `CORS_ORIGINS` com o domínio do frontend publicado. O banco PostgreSQL/PostGIS precisa estar hospedado e acessível pela API; não exponha credenciais no frontend.
- O arquivo `frontend/vercel.json` mantém o fallback para a aplicação de página única. A API não é hospedada pela Vercel por essa configuração.

## Importante

A primeira versão não possui base nacional validada de praças/tarifas nem roteador certificado para caminhões. Não use estimativas como cotação definitiva de frete ou pedágio sem conferência. Cada tarifa deve ser associada à fonte oficial, categoria veicular e período de vigência.

## Estrutura

- `frontend/`: interface web.
- `backend/`: API e regras de cálculo.
- `infra/`: inicialização do banco, incluindo o catálogo de veículos.
- `data/imports/`: orientações para importação auditável.
