# simple put example
This example is a demo to launch s3rver with the start of serverless-offline.

## Start server
```
$ serverless offline start
```

## Send a request
```
$ curl http://localhost:3000/dev
$ AWS_ACCESS_KEY_ID=S3RVER AWS_SECRET_ACCESS_KEY=S3RVER aws --endpoint http://localhost:8000 s3 cp s3://local-bucket/1234 1234.txt
{
    "AcceptRanges": "bytes",
    "LastModified": "Sat, 05 Jan 2019 15:26:47 GMT",
    "ContentLength": 4,
    "ETag": "\"e2fc714c4727ee9395f324cd2e7f331f\"",
    "ContentType": "application/octet-stream",
    "Metadata": {}
}
$ cat 1234.txt
abcd
```
