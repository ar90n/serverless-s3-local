TARGET=$1
echo "Running tests for ${TARGET}"
npm --prefix /serverless-s3-local install
npm --prefix /serverless-s3-local -w serverless-s3-local run build
npm --prefix /serverless-s3-local -w ${TARGET} install
npm --prefix /serverless-s3-local -w ${TARGET} run start &
/serverless-s3-local/test/wait-for-it.sh  -t 600 localhost:3000 -- npm --prefix /serverless-s3-local -w ${TARGET} run test
