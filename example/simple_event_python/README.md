# simple event python example
This example is a demo about s3 event handler by python

## Start server
```
$ sls offline start
```

## Send a request
```
$ AWS_ACCESS_KEY_ID=S3RVER AWS_SECRET_ACCESS_KEY=S3RVER aws --endpoint http://localhost:8000 s3api put-object --bucket local-bucket --key  1234.txt --body 1234.txt
{
    "ETag": "\"e2fc714c4727ee9395f324cd2e7f331f\""
}
$ cat /tmp/e2fc714c4727ee9395f324cd2e7f331f
{"Records": [{"eventVersion": "2.0", "eventSource": "aws:s3", "awsRegion": "us-east-1", "eventTime": "2019-04-19T14:44:27.735Z", "eventName": "ObjectCreated:Put", "userIdentity": {"principalId": "AWS:7A7BF257E8307E7394DB1"}, "requestParameters": {"sourceIPAddress": "127.0.0.1"}, "responseElements": {"x-amz-request-id": "6689C8E21BC2980D", "x-amz-id-2": "WviFkakBm0CFCVbyeIKQwv5OOD5sBWGTTzv9gA+b3S8="}, "s3": {"s3SchemaVersion": "1.0", "configurationId": "testConfigId", "bucket": {"name": "local-bucket", "ownerIdentity": {"principalId": "9F7A4A9E3A6481"}, "arn": "arn:aws:s3: : :local-bucket"}, "object": {"key": "1234.txzt", "sequencer": "16A360E4BD7", "size": 4, "eTag": "e2fc714c4727ee9395f324cd2e7f331f"}}}]}
```
