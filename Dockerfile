FROM alpine:3.20

# Install Node + npm and create non-root user
RUN apk add --no-cache nodejs npm && \
    adduser -D -u 1001 appuser && \
    rm -rf /var/cache/apk/*

WORKDIR /app

# Copy BOTH package files + your source
COPY package.json package-lock.json* index.js util.js ./

# Install exactly what package-lock says (fast + reproducible)
# Falls back to regular install if no lockfile exists (defensive)
RUN npm ci --omit=dev 2>/dev/null || \
    npm install --omit=dev --no-save && \
    npm cache clean --force

CMD ["node", "index.js"]