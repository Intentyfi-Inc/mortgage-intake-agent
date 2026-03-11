FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the Vite frontend
RUN npm run build

# Expose the API port
EXPOSE 3001

# Start the monolith server in production mode
CMD ["npm", "run", "start"]
