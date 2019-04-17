const path = require('path');
const aws = require('aws-sdk');
const s3 = new aws.S3({
    s3ForcePathStyle: true,
    endpoint: new aws.Endpoint('http://localhost:8000'),
    accessKeyId: 'S3RVER',
    secretAccessKey: 'S3RVER',
});
const sharp = require('sharp');

module.exports.s3hook = (event, context) => {
    const received_key = event.Records[0].s3.object.key;
    const get_param = {
        Bucket: 'local-bucket',
        Key: received_key,
    };
    const filename = path.basename(received_key);

    s3.getObject(get_param).promise()
    .then(data => sharp(data.Body).resize(320).toBuffer())
    .then(data => {
        const put_param = {
            Bucket: 'local-bucket',
            Key: `processed/${filename}`,
            Body: data,
        };
       return s3.putObject(put_param).promise();
    })
    .then(() => context.done())
    .catch(err => context.done('fail'));
};
