# resize image example
This example is a demo to resize image which is uploaded to s3.

## Start server
```
$ sls offline start
```

## Send a request
```
$ file face.jpg
face.jpg: JPEG image data, JFIF standard 1.01, resolution (DPI), density 300x300, segment length 16, comment: "Created with GIMP on a Mac", baseline, precision 8, 594x828, frames 3
$ AWS_ACCESS_KEY_ID=S3RVER AWS_SECRET_ACCESS_KEY=S3RVER aws --endpoint http://localhost:8000 s3api put-object --bucket local-bucket --key  incoming/face.jpg --body face.jpg
{
    "ETag": "\"6fa1ab0763e315d8b1a0e82aea14a9d0\""
}
$ aws --endpoint http://localhost:8000 s3api get-object --bucket local-bucket --key  processed/face.jpg  processed_face.jpg
{
    "AcceptRanges": "bytes",
    "LastModified": "Sat, 05 Jan 2019 15:47:09 GMT",
    "ContentLength": 16292,
    "ETag": "\"c915e1ce21e66f9782af0ad107f49731\"",
    "ContentType": "application/octet-stream",
    "Metadata": {}
}
$ file processed_face.jpg
processed_face.jpg: JPEG image data, baseline, precision 8, 320x446, frames 3
```
