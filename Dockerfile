FROM node:20-slim

WORKDIR /app

# Install Python3 and minimal dependencies for ML scripts
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy dependencies definitions
COPY package*.json ./

# Install npm dependencies
RUN npm install --omit=dev

# Copy application source code
COPY . .

EXPOSE 5050

ENV PORT=5050
ENV NODE_ENV=production

CMD ["node", "server.js"]
