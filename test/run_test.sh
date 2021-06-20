TARGET=$1
yarn --cwd /serverless-s3-local install
yarn --cwd /serverless-s3-local workspace ${TARGET} install
yarn --cwd /serverless-s3-local workspace ${TARGET} run start &
/serverless-s3-local/test/wait-for-it.sh  -t 600 localhost:3000 -- yarn --cwd /serverless-s3-local workspace ${TARGET} run test
