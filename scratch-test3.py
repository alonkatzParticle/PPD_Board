import os
import requests
import json
import datetime

def run():
    with open(".env.local") as f:
        env = dict(line.strip().split("=", 1) for line in f if line.strip() and not line.startswith("#"))
    token = env.get("MONDAY_API_KEY", "").strip('"')

    today = datetime.date.today()
    start_date = (today - datetime.timedelta(days=14)).strftime("%Y-%m-%d")
    end_date = (today + datetime.timedelta(days=30)).strftime("%Y-%m-%d")

    # Fetch board metadata to get the timeline column ID
    meta_query = 'query { boards(ids: [5433027071]) { columns { id type } } }'
    meta_res = requests.post("https://api.monday.com/v2", headers={"Authorization": token, "API-Version": "2024-01"}, json={"query": meta_query})
    cols = meta_res.json()["data"]["boards"][0]["columns"]
    timeline_col = next(c["id"] for c in cols if c["type"] == "timeline")

    query = """
    query {
      boards(ids: [5433027071]) {
        items_page(
          limit: 50,
          query_params: {
            rules: [
              { column_id: "$COL", compare_value: ["$START", "$END"], operator: between }
            ]
          }
        ) {
          items { id name }
        }
      }
    }
    """
    query = query.replace("$COL", timeline_col).replace("$START", start_date).replace("$END", end_date)

    res = requests.post(
        "https://api.monday.com/v2",
        headers={"Authorization": token, "API-Version": "2024-01"},
        json={"query": query}
    )
    
    print(json.dumps(res.json(), indent=2)[:500])

run()
