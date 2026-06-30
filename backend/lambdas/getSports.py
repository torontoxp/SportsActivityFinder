import json
import os
import boto3

# Sport icons map
SPORT_ICONS = {
    "Lacrosse" :         "🥍",
    "Table Tennis":      "🏓",
    "Badminton":         "🏸",
    "Basketball":        "🏀",
    "Swimming":          "🏊",
    "Soccer":            "⚽",
    "Yoga":              "🧘",
    "Rock Wall Climbing":"🧗",
    "Rock Climbing":     "🧗",
    "Pickleball":        "/Pickleball.png",
    "Squash":            "/Squash.png",
    "Volleyball":        "🏐",
    "Ball Hockey":       "🏑",
    "Roller Hockey":     "/RollerHockey.png",
    "Open Gym":          "🤸",
    "Multi-Sport":       "🤹",
    "Dodgeball":         "🤾",
    "Netball":           "/Netball.png",
    "Bocce":             "/Bocce.png",
    "Carpet Bowling":    "/Bowling.png",
    "Skateboarding":     "🛹",
    "Ultimate":          "🥏",
    "Archery":           "🏹",
    "Baseball":          "⚾",
    "Cricket":           "🏏",
    "Golf":              "⛳",
    "Lawn Bowling":      "/Bowling.png",
    "Tennis":             "🎾",
}

HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}

dynamodb = boto3.resource('dynamodb')
SCHEDULES_TABLE = "sports-schedules-TorontoXP"

def handler(event, context):
    try:
        table = dynamodb.Table(SCHEDULES_TABLE)
        
        # Scan the table to get unique sports and their centers
        # We only need the sport and community_center_id attributes
        response = table.scan(
            ProjectionExpression="sport, community_center_id"
        )
        schedules = response.get('Items', [])
        
        # Handle pagination if the table is larger than 1MB
        while 'LastEvaluatedKey' in response:
            response = table.scan(
                ProjectionExpression="sport, community_center_id",
                ExclusiveStartKey=response['LastEvaluatedKey']
            )
            schedules.extend(response.get('Items', []))

        # Count unique centres per sport and total unique centres
        centers_by_sport = {}
        all_centers = set()
        for item in schedules:
            sport = item.get("sport")
            center_id = item.get("community_center_id")
            if not sport or not center_id:
                continue
            all_centers.add(center_id)
            if sport not in centers_by_sport:
                centers_by_sport[sport] = set()
            centers_by_sport[sport].add(center_id)

        sports = sorted([
            {
                "sport": sport,
                "icon": SPORT_ICONS.get(sport, "🏅"),
                "centerCount": len(centers),
            }
            for sport, centers in centers_by_sport.items()
        ], key=lambda x: x["sport"])

        return {
            "statusCode": 200,
            "headers": HEADERS,
            "body": json.dumps({
                "totalCentres": len(all_centers),
                "sports": sports
            }),
        }
    except Exception as e:
        print(f"getSports error: {e}")
        return {
            "statusCode": 500,
            "headers": HEADERS,
            "body": json.dumps({"message": "Internal server error"}),
        }
