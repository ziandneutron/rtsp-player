FROM node:12-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
# Bundle app source
COPY . .

RUN set -x \
    && npm install \
    && apt update \
    && apt install -y ffmpeg
# If you are building your code for production
# RUN npm ci --only=production

EXPOSE 2000
CMD [ "node", "index.js" ]