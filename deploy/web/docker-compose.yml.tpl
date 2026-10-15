# Beanstalk WEB environment (Docker on Amazon Linux 2023). __IMAGE__ is replaced by deploy.sh.
# Beanstalk writes environment properties to .env in the app directory.
services:
  app:
    image: __IMAGE__
    command: ["node", "src/server.js"]
    ports:
      - "80:8080"
    env_file:
      - .env
    restart: always
