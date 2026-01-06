import yaml
import sys

with open('docker-compose.yml', 'r') as f:
    data = yaml.safe_load(f)

# Supprimer les volumes du service backend
if 'backend' in data['services'] and 'volumes' in data['services']['backend']:
    del data['services']['backend']['volumes']

with open('docker-compose.yml', 'w') as f:
    yaml.dump(data, f, default_flow_style=False)

print("Volumes supprimés du service backend")
