FROM node:20-slim

RUN apt-get update && apt-get install -y \
  libatk1.0-0 libatk-bridge2.0-0 libcups2 \
  libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
  libxfixes3 libxrandr2 libgbm1 libasound2 \
  libpango-1.0-0 libcairo2 libnss3 \
  --no-install-recommends && rm -rf /var/lib/apt/lists/*

RUN npm install -g playchat

WORKDIR /work
CMD ["playchat", "--help"]
