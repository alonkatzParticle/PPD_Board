import os
import requests
import json

def run():
    with open(".env.local") as f:
        env = dict(line.strip().split("=", 1) for line in f if line.strip() and not line.startswith("#"))
    token = env.get("MONDAY_API_KEY", "").strip('\"')

    res = requests.post(
        "https://api.monday.com/v2",
        headers={"Authorization": token, "API-Version": "2024-01"},
        json={"query": 'query { boards(ids: [8036329818]) { columns { id title type } } }'}
    )
    with open("scratch-design.json", "w") as out:
        out.write(json.dumps(res.json(), indent=2))

run()
