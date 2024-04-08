FROM node:latest

COPY ./ /work
COPY --from=minio/minio /bin/minio /bin/minio

WORKDIR /work
RUN apt-get update && apt-get install python3-boto3 -y
RUN npm install
RUN npm -w serverless-s3-local run build
RUN npm -w test install
ENTRYPOINT [ "npm", "-w" , "test",  "run", "start"]