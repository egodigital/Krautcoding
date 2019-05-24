# build the polymer frontend in its own container
FROM node:7

# Create app directory
WORKDIR /home/node/app/

# Install app dependencies
COPY package.json /home/node/app/
RUN npm install
COPY . /home/node/app/
ENv PORT 8080
EXPOSE 8080
RUN chown -R node /home/node/app
USER node
CMD [ "npm", "run", "main" ]
