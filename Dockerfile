FROM alpine:latest

# Install Node, npm, unzip tools, and dependencies
RUN apk add --no-cache \
    nodejs npm \
    p7zip \
    wget \
    libc6-compat \
    bash \
    && mkdir -p /app \
    && rm -rf /var/cache/apk/*

WORKDIR /app

# Install official unrar
RUN wget https://www.rarlab.com/rar/rarlinux-x64-621.tar.gz && \
    tar -xzf rarlinux-x64-621.tar.gz && \
    cp rar/unrar /usr/local/bin/unrar && chmod +x /usr/local/bin/unrar && \
    rm -rf rar rarlinux-x64-621.tar.gz

# Copy app files
COPY package*.json index.js util.js ./

# Install Node packages
RUN npm ci --omit=dev 2>/dev/null || \
    npm install --omit=dev --no-save && \
    npm cache clean --force

CMD ["node", "index.js"]
