import boto3
from botocore.client import Config

import json
from pathlib import Path

def copy_file(event, context):
    s3 = boto3.client(
        's3',
        aws_access_key_id='minioadmin',
        aws_secret_access_key='minioadmin',
        endpoint_url='http://localhost:9001',
        config=Config(s3={'addressing_style': 'path'})
    )

    received_key = event['Records'][0]['s3']['object']['key']
    filename = Path(received_key).name

    get_param = {
        "Bucket": "local-bucket",
        "Key": received_key,
    }

    response = s3.get_object(**get_param)
    recv_data = response['Body'].read().decode('utf-8')

    put_param = {
        "Bucket": "local-bucket",
        "Key": f"processed/{filename}",
        "Body": recv_data,
    }

    s3.put_object(**put_param)

    return {
        'statusCode': 200,
        'body': json.dumps('ok'),
    }