# Usar a imagem oficial do Bun
FROM oven/bun:1

WORKDIR /app

# Copiar ficheiros de dependências
COPY package.json bun.lock ./

# Instalar dependências (modo produção)
RUN bun install --production

# Copiar o resto do código
COPY . .

# Criar pasta para o output
RUN mkdir -p output

# Comando para correr a app
CMD ["bun", "src/index.ts"]