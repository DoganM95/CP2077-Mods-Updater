FROM node:alpine

# Set work directory
WORKDIR /app

# Copy only the necessary files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev

# Copy source files
COPY index.js util.js ./

# Run command
CMD ["node", "index.js"]