# Beanstalk WORKER environment. sqsd on the instance POSTs SQS messages to localhost:80.
services:
  app:
    image: __IMAGE__
    command: ["node", "src/worker.js"]
    ports:
      - "80:8080"
    env_file:
      - .env
    restart: always
