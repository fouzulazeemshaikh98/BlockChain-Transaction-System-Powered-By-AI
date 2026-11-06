# Render service "aiblock-chain": in-memory Hardhat node + contract deploy.
FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx hardhat compile && chmod +x render-start.sh
ENV PORT=8545
EXPOSE 8545
CMD ["./render-start.sh"]
