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
    end_date = (today + datetime.timedelta(days=14)).strftime("%Y-%m-%d")

    query = """
    query {
      boards(ids: [5433027071]) {
        items_page(
          limit: 50,
          query_params: {
            rules: [
              { column_id: "timeline_1_Mjj5Yton", compare_value: ["$START", "$END"], operator: between }
            ]
          }
        ) {
          items { id name }
        }
      }
    }
    """
    query = query.replace("$START", start_date).replace("$END", end_date)

    res = requests.post(
        "https://api.monday.com/v2",
        headers={"Authorization": token, "API-Version": "2024-01"},
        json={"query": query}
    )
    
    print(json.dumps(res.json(), indent=2)[:500])

run()
