import json
from collections import OrderedDict
from pathlib import Path

def s3hook(event, context):
    path = Path("/tmp") / event["Records"][0]["s3"]["object"]["eTag"]
    with path.open("w") as f:
        f.write(json.dumps(event))
    
    return {
        "statusCode": 200,
        "body": "ok"
    }
