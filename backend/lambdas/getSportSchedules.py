import json
import os
import boto3
from boto3.dynamodb.conditions import Key

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}

dynamodb = boto3.resource('dynamodb')
SCHEDULES_TABLE = "sports-schedules-TorontoXP"
CENTERS_TABLE = "community-centers-TorontoXP"

def handler(event, context):
    sport = None
    if event.get("pathParameters"):
        sport = event["pathParameters"].get("sport")

    if not sport:
        return {
            "statusCode": 400,
            "headers": HEADERS,
            "body": json.dumps({"message": "Path parameter 'sport' is required"}),
        }

    try:
        # Decode the sport in case it's URL encoded
        from urllib.parse import unquote
        sport = unquote(sport)
        
        schedules_table = dynamodb.Table(SCHEDULES_TABLE)
        
        # Query schedules for the specific sport
        response = schedules_table.query(
            KeyConditionExpression=Key('sport').eq(sport)
        )
        schedules = response.get('Items', [])
        
        # Handle pagination
        while 'LastEvaluatedKey' in response:
            response = schedules_table.query(
                KeyConditionExpression=Key('sport').eq(sport),
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            schedules.extend(response.get('Items', []))

        if not schedules:
            return {
                "statusCode": 200,
                "headers": HEADERS,
                "body": json.dumps([]),
            }

        # Get unique community_center_ids
        center_ids = list(set([s.get("community_center_id") for s in schedules if s.get("community_center_id")]))
        
        centre_map = {}
        if center_ids:
            # Batch get items from centers table (DynamoDB batch_get_item has a 100 items limit per request)
            # We break the center_ids into chunks of 100
            for i in range(0, len(center_ids), 100):
                chunk = center_ids[i:i + 100]
                keys = [{'community_center_id': cid} for cid in chunk]
                
                batch_response = dynamodb.batch_get_item(
                    RequestItems={
                        CENTERS_TABLE: {
                            'Keys': keys
                        }
                    }
                )
                
                centers = batch_response.get('Responses', {}).get(CENTERS_TABLE, [])
                for center in centers:
                    centre_map[center['community_center_id']] = center

        # Merge each schedule row with its centre details
        enriched = []
        for schedule in schedules:
            center_id = schedule.get("community_center_id", "")
            center = centre_map.get(center_id, {})

            enriched.append({
                # Centre fields
                "community_center_id": center_id,
                "name":     center.get("name", "Unknown Centre"),
                "address":  center.get("address", ""),
                "district": center.get("district", ""),
                "ward":     center.get("ward", ""),
                "phone":    center.get("phone", ""),
                "website":  center.get("website", ""),
                "maps_url": (
                    f"https://www.google.com/maps/search/?api=1&query={center.get('address', '').replace(' ', '+')}"
                    if center.get("address") else ""
                ),
                # isFree comes from the CENTRE entry (source of truth)
                "isFree":   center.get("isFree", False),
                # Schedule fields
                "day_of_week": schedule.get("day_of_week"),
                "slots":       schedule.get("slots", []),
                "age_group":   schedule.get("age_group", ""),
                "is_drop_in":  schedule.get("is_drop_in", True),
                "tags":        schedule.get("tags", []),
                "notes":       schedule.get("notes", ""),
            })

        return {
            "statusCode": 200,
            "headers": HEADERS,
            "body": json.dumps(enriched),
        }

    except Exception as e:
        print(f"getSportSchedules error: {e}")
        return {
            "statusCode": 500,
            "headers": HEADERS,
            "body": json.dumps({"message": "Internal server error"}),
        }
