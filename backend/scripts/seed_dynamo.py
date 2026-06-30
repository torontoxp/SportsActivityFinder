import json
import boto3
import os
from decimal import Decimal

CENTERS_TABLE_NAME = "community-centers-TorontoXP"
SCHEDULES_TABLE_NAME = "sports-schedules-TorontoXP"

# Paths to the JSON files (same directory as this script)
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CENTERS_PATH = os.path.join(SCRIPT_DIR, "CommunityCentres.json")
SCHEDULES_PATH = os.path.join(SCRIPT_DIR, "SportSchedules.json")


def convert_floats(obj):
    """Convert floats to Decimals (DynamoDB doesn't support float)."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    if isinstance(obj, dict):
        return {k: convert_floats(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [convert_floats(i) for i in obj]
    return obj


def deduplicate_centers(data):
    """Deduplicate community centres by community_center_id (keep last)."""
    seen = {}
    for item in data:
        key = item["community_center_id"]
        seen[key] = item
    deduped = list(seen.values())
    removed = len(data) - len(deduped)
    if removed:
        print(f"  Removed {removed} duplicate centre(s)")
    return deduped


def deduplicate_schedules(data):
    """Deduplicate schedules by (sport, schedule_id) composite key (keep last)."""
    seen = {}
    for item in data:
        key = (item["sport"], item["schedule_id"])
        seen[key] = item
    deduped = list(seen.values())
    removed = len(data) - len(deduped)
    if removed:
        print(f"  Removed {removed} duplicate schedule(s)")
    return deduped


def clear_table(table):
    print(f"  Clearing existing items from {table.name}...")
    key_names = [k['AttributeName'] for k in table.key_schema]
    projection = ", ".join(f"#{k}" for k in key_names)
    expr_attr_names = {f"#{k}": k for k in key_names}
    
    deleted_count = 0
    response = table.scan(ProjectionExpression=projection, ExpressionAttributeNames=expr_attr_names)
    items = response.get('Items', [])
    
    with table.batch_writer() as batch:
        for item in items:
            batch.delete_item(Key=item)
            deleted_count += 1
            
    while 'LastEvaluatedKey' in response:
        response = table.scan(
            ProjectionExpression=projection, 
            ExpressionAttributeNames=expr_attr_names,
            ExclusiveStartKey=response['LastEvaluatedKey']
        )
        items = response.get('Items', [])
        with table.batch_writer() as batch:
            for item in items:
                batch.delete_item(Key=item)
                deleted_count += 1
                
    print(f"  Deleted {deleted_count} items from {table.name}.")


def seed_table(table_name, file_path, dedup_fn):
    print(f"\nLoading data into {table_name}...")
    dynamodb = boto3.resource('dynamodb')
    table = dynamodb.Table(table_name)

    clear_table(table)

    with open(file_path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    print(f"  Raw items from file: {len(data)}")
    data = dedup_fn(data)
    data = convert_floats(data)
    print(f"  Items to upsert: {len(data)}")

    # batch_writer handles the 25-item limit per batch and
    # automatically deduplicates within a flush window (keeps last put_item)
    with table.batch_writer(overwrite_by_pkeys=None) as batch:
        for item in data:
            batch.put_item(Item=item)

    print(f"  Successfully upserted {len(data)} items into {table_name}.")


if __name__ == "__main__":
    seed_table(CENTERS_TABLE_NAME, CENTERS_PATH, deduplicate_centers)
    seed_table(SCHEDULES_TABLE_NAME, SCHEDULES_PATH, deduplicate_schedules)
    print("\nAll data seeded successfully!")
