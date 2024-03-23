# simple website example
This example is a demo to server html contents with the start of serverless-offline.

## Start server
```
$ cd serverless-s3-local
$ npm install
$ npm run start -w simple-website
```

## Send a request
```
$ curl http://localhost:3000/dev
<!DOCTYPE html>
<html>
<head>
    <title>Test Page</title>
</head>
<body>
    <h1>It works</h1>
</body>
</html>
$ curl 127.0.0.1:9000/test-site/index.html
<!DOCTYPE html>
<html>
<head>
    <title>Test Page</title>
</head>
<body>
    <h1>It works</h1>
</body>
</html>
```
