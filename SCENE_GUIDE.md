# Scene Images Guide

Place your scene images in this folder. The game will automatically use them as backgrounds in the Scene Panel.

## Map Navigation Feature

The game includes an interactive island map for traveling between locations. The map shows connected locations as nodes with travel paths between them. Clicking on an adjacent location initiates travel with a progress animation.

### Map Node Icons
- 🏘️ Starter Village
- 🔨 Blacksmith  
- 🌲 Forest
- 🕳️ Cave
- 🎣 Fishing Pond
- 🌋 Volcanic Plain
- ⛰️ Mountains

## Required Image Sizes
- **Recommended**: 800x400 pixels (2:1 aspect ratio)
- **Minimum**: 400x200 pixels
- **Format**: PNG or JPG

## File Names Expected

### Location Images (shown when idle in a location)
```
village.png           - Starter Village
forest.png            - Forest
cave.png              - Cave
blacksmith.png        - Blacksmith
fishing_pond.png      - Fishing Pond
mountains.png         - Mountains
volcanic_plain.png    - Volcanic Plain
```

### Traveling Images
```
traveling.png         - Default travel image
travel_forest.png     - Traveling to Forest (optional)
travel_cave.png       - Traveling to Cave (optional)
travel_mountains.png  - Traveling to Mountains (optional)
```

### Combat Images
```
combat.png            - Default combat image
combat_goblin.png     - Fighting Goblin (optional)
combat_wolf.png       - Fighting Wolf (optional)
combat_bandit.png     - Fighting Bandit (optional)
combat_spider.png     - Fighting Cave Spider (optional)
combat_skeleton.png   - Fighting Skeleton (optional)
combat_golem.png      - Fighting Rock Golem (optional)
combat_fire_elemental.png - Fighting Fire Elemental (optional)
combat_lava_serpent.png   - Fighting Lava Serpent (optional)
combat_elder_dragon.png   - Fighting Elder Dragon (optional)
```

### Skilling Images
```
mining.png            - Mining activity
woodcutting.png       - Woodcutting activity
fishing.png           - Fishing activity
cooking.png           - Cooking activity
smithing.png          - Smithing activity
herblore.png          - Herblore gathering/crafting activity
farming.png           - Farming activity (planting/harvesting)
```

## Notes
- If an image is missing, the game will show a gradient fallback with an emoji icon
- Images are automatically darkened and overlaid with the game's color scheme
- Use atmospheric, fantasy-themed artwork for best results
- The panel has a vignette effect applied automatically

## Adding Custom Images
1. Place your image file in this folder
2. Update `SCENE_IMAGES` in `realmofeternity.html` if using different file names
3. Refresh the game

## Image Style Recommendations
- Dark fantasy aesthetic
- Moody lighting
- Muted colors work well (the game adds overlays)
- Avoid text in images
- Landscape orientation
