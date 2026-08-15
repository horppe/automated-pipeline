# Automated Pipeline

A modern TypeScript backend using Fastify, Prisma, PostgreSQL, Redis, and Docker.

## Folder structure

```text
.
├── docker-compose.yml
├── Dockerfile
├── prisma/
│   └── schema.prisma
├── src/
│   ├── config/
│   │   └── env.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   └── redis.ts
│   ├── routes/
│   │   ├── health.ts
│   │   └── users.ts
│   ├── services/
│   │   └── user.service.ts
│   ├── workers/
│   │   └── queue.worker.ts
│   ├── server.ts
│   └── app.ts
├── .env.example
├── .env
├── .gitignore
├── .dockerignore
├── package.json
├── tsconfig.json
└── README.md
```

## Getting started

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
2. Start infrastructure services:
   ```bash
   docker compose up -d postgres redis
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Run Prisma migration:
   ```bash
   npx prisma migrate dev --name init
   ```
5. Start the application:
   ```bash
   npm run dev
   ```

## Docker

```bash
docker compose up --build
```

## Useful commands

```bash
npm run dev
npm run build
npm run db:studio
npm run docker:up
npm run docker:down
```
