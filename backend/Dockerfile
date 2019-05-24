# build the polymer frontend in its own container
FROM node:8

# Create app directory
WORKDIR /home/node/app/

# Install app dependencies
COPY package.json /home/node/app/
RUN npm install express
RUN npm install
COPY . /home/node/app/
EXPOSE 3000
RUN chown -R node /home/node/app
USER node

CMD [ "npm", "run", "main" ]
